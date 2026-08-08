"""Đồ thị đường bộ dùng chung cho A2–A5, A13 và lớp bản đồ L2/L3.

Dựng lại ĐÚNG như ``s08_traveltime`` (cùng nguồn, cùng luật cạnh) rồi cache ra npz để
các mũi kiểm chạy lại nhiều kịch bản mà không phải đọc PBF/parquet lại từ đầu.

Khác biệt duy nhất so với s08: ở đây trọng số thời gian được tách khỏi trọng số khoảng
cách và sinh theo BẢNG TỐC ĐỘ TRUYỀN VÀO, để A2 quét được nhiều kịch bản.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from _common import ROOT

import sys

sys.path.insert(0, str(ROOT / "src"))
from evcs.core import grid as gridmod  # noqa: E402

# Bảng tốc độ giả định CŨ, giữ lại ở ĐÂY chứ không ở `src/hanoi/`.
#
# Nó đã bị xoá khỏi pipeline (DECISIONS §6): kiểm độ nhạy cho thấy trường thời gian dựng
# trên nó là 100% giả định — bỏ hẳn tag `maxspeed` đi thì Spearman vẫn 0,9991. Bản sao này
# tồn tại duy nhất để **tái lập lại chính phép kiểm đã kết án nó** (`a02_speed_sensitivity`).
# Không import từ đây vào bất cứ thứ gì sinh ra dữ liệu.
DEFAULT_KPH = {
    "MOTORWAY": 80,
    "TRUNK": 60,
    "PRIMARY": 45,
    "SECONDARY": 40,
    "TERTIARY": 35,
    "LOCAL": 25,
    "SERVICE": 15,
}
LINK_KPH = 30

M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 103_940.0
SNAP_MAX_M = 2_000.0
CACHE = Path(
    os.environ.get(
        "EVCS_SCRATCH", "/tmp/claude-1000/-home-n91ym1nhky-Work-internVSF-evcs-hanoi/scratch"
    )
)
CACHE.mkdir(parents=True, exist_ok=True)


def xy(lng, lat):
    return np.asarray(lng) * M_PER_DEG_LON, np.asarray(lat) * M_PER_DEG_LAT


def build(force: bool = False):
    """Trả về dict: X, Y (toạ độ mét của đỉnh), src, dst, dist_w, edge_kph, edge_class."""
    f = CACHE / "roadgraph.npz"
    if f.exists() and not force:
        z = np.load(f, allow_pickle=True)
        return {k: z[k] for k in z.files}

    roads = pq.read_table(
        ROOT / "data/raw/osm_hanoi_roads.parquet",
        columns=["road_class", "is_link", "oneway", "node_ids", "geometry_wkb"],
    ).to_pandas()
    from shapely import wkb as shwkb

    node_xy: dict[int, tuple[float, float]] = {}
    seqs, meta = [], []
    for nids, gwkb, rc, link, ow in zip(
        roads.node_ids,
        roads.geometry_wkb,
        roads.road_class,
        roads.is_link,
        roads.oneway,
    ):
        coords = list(shwkb.loads(bytes(gwkb)).coords)
        nids = list(nids)
        if len(nids) != len(coords) or len(nids) < 2:
            continue
        for n, (x, y) in zip(nids, coords):
            if n not in node_xy:
                node_xy[n] = (x, y)
        seqs.append(nids)
        meta.append((rc, bool(link), int(ow)))

    ids = np.sort(np.fromiter(node_xy.keys(), dtype=np.int64, count=len(node_xy)))
    lon = np.array([node_xy[i][0] for i in ids])
    lat = np.array([node_xy[i][1] for i in ids])
    pos = {int(n): i for i, n in enumerate(ids)}
    X, Y = xy(lon, lat)

    CLASS_IDX = {c: i for i, c in enumerate(sorted(DEFAULT_KPH))}
    src, dst, dist_w, kph_tag, cls, is_link = [], [], [], [], [], []
    for nids, (rc, link, ow) in zip(seqs, meta):
        tagged = 0.0  # tag maxspeed không còn được trích (đo được là nó không đóng góp gì)
        for a, b in zip(nids[:-1], nids[1:]):
            ia, ib = pos[int(a)], pos[int(b)]
            if ia == ib:
                continue
            d = math.hypot(X[ia] - X[ib], Y[ia] - Y[ib])
            if d <= 0:
                continue
            for u, v in ((ia, ib), (ib, ia)):
                if (u, v) == (ia, ib) and ow < 0:
                    continue
                if (u, v) == (ib, ia) and ow > 0:
                    continue
                src.append(u)
                dst.append(v)
                dist_w.append(d)
                kph_tag.append(tagged)
                cls.append(CLASS_IDX[rc])
                is_link.append(link)

    out = {
        "X": X,
        "Y": Y,
        "node_ids": ids,
        "src": np.asarray(src, np.int32),
        "dst": np.asarray(dst, np.int32),
        "dist_w": np.asarray(dist_w, np.float64),
        "kph_tag": np.asarray(kph_tag, np.float32),
        "cls": np.asarray(cls, np.int8),
        "is_link": np.asarray(is_link, bool),
        "class_names": np.array(sorted(DEFAULT_KPH), dtype=object),
    }
    np.savez_compressed(f, **out)
    return out


def time_weights(G, kph_table: dict[str, float], link_kph: float = LINK_KPH, use_tags=True):
    """Trọng số thời gian (giây) cho từng cạnh, theo bảng tốc độ truyền vào."""
    names = list(G["class_names"])
    kph = np.array([kph_table[n] for n in names], np.float64)[G["cls"]]
    kph = np.where(G["is_link"], link_kph, kph)
    if use_tags:
        kph = np.where(G["kph_tag"] > 0, G["kph_tag"].astype(np.float64), kph)
    return G["dist_w"] / (kph * 1000.0 / 3600.0)


def station_nodes(G, tree=None):
    """(chỉ số đỉnh, độ lệch mét) của các trạm đủ điều kiện phục vụ, như s08."""
    import pandas as pd

    st = pq.read_table(ROOT / "data/processed/stations.parquet").to_pandas()
    st = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]
    tree = tree or cKDTree(np.c_[G["X"], G["Y"]])
    sx, sy = xy(st.lng.to_numpy(), st.lat.to_numpy())
    sd, si = tree.query(np.c_[sx, sy])
    ok = sd <= SNAP_MAX_M
    off = pd.Series(sd[ok]).groupby(pd.Series(si[ok])).min()
    return off.index.to_numpy(np.int32), off.to_numpy(), st, ok


def multisource(G, weight, snodes, soff, reverse=True):
    """Dijkstra đa nguồn: khoảng cách từ MỌI đỉnh tới nguồn gần nhất.

    ``reverse=True`` → đồ thị ngược, tức chiều Ô → TRẠM (như s08).
    ``reverse=False`` → chiều TRẠM → Ô.
    """
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import dijkstra

    n = len(G["X"])
    a, b = (G["dst"], G["src"]) if reverse else (G["src"], G["dst"])
    rs = np.concatenate([a, np.full(len(snodes), n, np.int32)])
    rd = np.concatenate([b, snodes])
    data = np.concatenate([weight, soff])
    g = csr_matrix((data, (rs, rd)), shape=(n + 1, n + 1))
    return dijkstra(g, directed=True, indices=n)[:n]


def cell_anchors(G, tree=None):
    """(cells, chỉ số đỉnh neo, khoảng lệch mét) theo TÂM HÌNH HỌC như s08."""
    cells = gridmod.hanoi_cells()
    clat = np.array([gridmod.centroid(c)[0] for c in cells])
    clng = np.array([gridmod.centroid(c)[1] for c in cells])
    cx, cy = xy(clng, clat)
    tree = tree or cKDTree(np.c_[G["X"], G["Y"]])
    cd, ci = tree.query(np.c_[cx, cy])
    return cells, ci, cd, clat, clng
