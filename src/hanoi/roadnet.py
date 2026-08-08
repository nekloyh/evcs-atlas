"""Đồ thị đường bộ dùng chung cho ``s08_traveltime`` và export M3-R của web.

Tách từ ``s08`` (không đổi một luật nào) vì M3-R cần ĐÚNG đồ thị đó — cùng bộ lọc
``access``, cùng luật một chiều, cùng neo SCC lớn. Chép lại là mở cửa cho hai đồ thị
lệch nhau âm thầm: ``analysis/_graph.py`` là bằng chứng sống, nó tự nhận "dựng lại
ĐÚNG như s08" nhưng đã trôi mất bộ lọc ``access`` và neo SCC (chấp nhận được ở tầng
analysis — các mũi kiểm A2–A5 chạy trước hai sửa lỗi đó — nhưng không chấp nhận được
ở tầng sinh dữ liệu).

Module này chỉ chứa phần DỰNG; mọi quyết định *dùng* đồ thị (ngưỡng detour, QA,
chọn cột phát hành) ở nguyên chỗ cũ.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

from . import paths

M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 103_940.0
SNAP_MAX_M = 2_000.0  # xa hơn mức này thì coi như điểm không có lối vào mạng đường
# Thẻ access coi là CHẶN xe công chúng. `destination` KHÔNG nằm đây: nó nghĩa là được
# vào nếu điểm đến nằm trong — mà trạm sạc chính là điểm đến. Xem docstring s08.
ACCESS_BLOCKED = {"private", "no", "customers", "residents", "delivery", "permit"}

BASE_COLUMNS = ["osm_id", "road_class", "oneway", "access", "node_ids", "geometry_wkb"]


def xy(lng, lat):
    return np.asarray(lng) * M_PER_DEG_LON, np.asarray(lat) * M_PER_DEG_LAT


def load_roads(extra_columns: tuple[str, ...] = ()) -> tuple[pd.DataFrame, int]:
    """Đọc bản trích đường Hà Nội, áp bộ lọc ``access``.

    Trả về (df đã lọc, tổng số đoạn trước lọc). Index của df đã reset — mọi cấu trúc
    per-way trong :class:`RoadGraph` thẳng hàng với index này.
    """
    cols = BASE_COLUMNS + [c for c in extra_columns if c not in BASE_COLUMNS]
    roads = pq.read_table(paths.RAW / "osm_hanoi_roads.parquet", columns=cols).to_pandas()
    n_all = len(roads)
    roads = roads[~roads.access.isin(ACCESS_BLOCKED)].reset_index(drop=True)
    return roads, n_all


@dataclass
class RoadGraph:
    ids: np.ndarray  # osm node id của từng đỉnh (sắp xếp tăng)
    lon: np.ndarray
    lat: np.ndarray
    X: np.ndarray  # toạ độ mét (xấp xỉ phẳng, như s08)
    Y: np.ndarray
    src: np.ndarray  # cạnh có hướng, chỉ số đỉnh
    dst: np.ndarray
    dist_w: np.ndarray  # trọng số MÉT
    n_scc: int
    in_giant: np.ndarray  # bool theo đỉnh: thuộc SCC lớn nhất
    gidx: np.ndarray  # chỉ số các đỉnh thuộc SCC lớn
    tree: cKDTree  # KDTree CHỈ trên đỉnh SCC lớn — mọi phép neo đi qua đây
    way_nodes: list  # per dòng roads: list chỉ số đỉnh, hoặc None nếu hình học hỏng

    @property
    def n_nodes(self) -> int:
        return len(self.ids)


def build_graph(roads: pd.DataFrame) -> RoadGraph:
    """Dựng đồ thị có hướng đúng như s08: tôn trọng một chiều, neo vào SCC lớn."""
    from shapely import wkb as shwkb

    node_xy: dict[int, tuple[float, float]] = {}
    way_node_ids: list[list[int] | None] = []
    for nids, gwkb in zip(roads.node_ids, roads.geometry_wkb):
        coords = list(shwkb.loads(bytes(gwkb)).coords)
        nids = list(nids)
        if len(nids) != len(coords) or len(nids) < 2:
            way_node_ids.append(None)
            continue
        for nd, (x, y) in zip(nids, coords):
            if nd not in node_xy:
                node_xy[nd] = (x, y)
        way_node_ids.append(nids)

    ids = np.sort(np.fromiter(node_xy.keys(), dtype=np.int64, count=len(node_xy)))
    lon = np.array([node_xy[i][0] for i in ids])
    lat = np.array([node_xy[i][1] for i in ids])
    pos = {int(nd): i for i, nd in enumerate(ids)}
    X, Y = xy(lon, lat)

    way_nodes = [None if s is None else [pos[int(n)] for n in s] for s in way_node_ids]

    src, dst, dist_w = [], [], []
    for nodes, ow in zip(way_nodes, roads.oneway):
        if nodes is None:
            continue
        for ia, ib in zip(nodes[:-1], nodes[1:]):
            if ia == ib:
                continue
            d = math.hypot(X[ia] - X[ib], Y[ia] - Y[ib])
            if d <= 0:
                continue
            if ow >= 0:
                src.append(ia)
                dst.append(ib)
                dist_w.append(d)
            if ow <= 0:
                src.append(ib)
                dst.append(ia)
                dist_w.append(d)

    src = np.asarray(src, dtype=np.int32)
    dst = np.asarray(dst, dtype=np.int32)
    dist_w = np.asarray(dist_w, dtype=np.float64)

    n_nodes = len(ids)
    n_scc, lab = connected_components(
        csr_matrix((dist_w, (src, dst)), shape=(n_nodes, n_nodes)),
        directed=True,
        connection="strong",
    )
    in_giant = lab == int(np.argmax(np.bincount(lab)))
    gidx = np.flatnonzero(in_giant)
    tree = cKDTree(np.c_[X[gidx], Y[gidx]])  # CHỈ đỉnh thuộc SCC lớn

    return RoadGraph(
        ids=ids,
        lon=lon,
        lat=lat,
        X=X,
        Y=Y,
        src=src,
        dst=dst,
        dist_w=dist_w,
        n_scc=int(n_scc),
        in_giant=in_giant,
        gidx=gidx,
        tree=tree,
        way_nodes=way_nodes,
    )


def load_stations() -> pd.DataFrame:
    """Tập trạm đủ điều kiện phục vụ — đúng bộ lọc của s08."""
    st = pq.read_table(paths.PROCESSED / "stations.parquet").to_pandas()
    return st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]


def snap_stations(g: RoadGraph, st: pd.DataFrame):
    """Neo trạm vào đỉnh SCC lớn.

    Trả về (station_nodes, station_off_m, ok, sx, sy):
      - ``station_nodes``: chỉ số đỉnh (toàn cục) có ít nhất một trạm neo vào
      - ``station_off_m``: độ lệch neo NHỎ NHẤT tại đỉnh đó (nhiều trạm một đỉnh → MIN,
        không phải tổng — csr_matrix cộng dồn trùng, xem s08)
      - ``ok``: mask theo dòng của ``st`` — trạm neo được trong ``SNAP_MAX_M``
    """
    sx, sy = xy(st.lng.to_numpy(), st.lat.to_numpy())
    sd, si = g.tree.query(np.c_[sx, sy])
    ok = sd <= SNAP_MAX_M
    off = pd.Series(sd[ok]).groupby(pd.Series(g.gidx[si[ok]])).min()
    return off.index.to_numpy().astype(np.int32), off.to_numpy(), ok, sx, sy


def multisource(
    g: RoadGraph,
    snodes: np.ndarray,
    soff: np.ndarray,
    reverse: bool,
    return_predecessors: bool = False,
):
    """Dijkstra đa nguồn qua một đỉnh siêu-nguồn.

    ``reverse=True``  → đồ thị NGƯỢC ⇒ khoảng cách Ô → TRẠM (chiều đi sạc, trường chính).
    ``reverse=False`` → đồ thị GỐC   ⇒ khoảng cách TRẠM → Ô (chiều về).

    Với ``return_predecessors=True`` trả về (dist, pred); ``pred`` tính trên đồ thị
    (n+1) đỉnh — dùng để dựng lại đường đi thật (cặp đường minh hoạ M3-R).
    """
    n = g.n_nodes
    a, b = (g.dst, g.src) if reverse else (g.src, g.dst)
    rs = np.concatenate([a, np.full(len(snodes), n, np.int32)])
    rd = np.concatenate([b, snodes])
    gm = csr_matrix((np.concatenate([g.dist_w, soff]), (rs, rd)), shape=(n + 1, n + 1))
    if return_predecessors:
        d, pred = dijkstra(gm, directed=True, indices=n, return_predecessors=True)
        return d[:n], pred
    return dijkstra(gm, directed=True, indices=n)[:n]
