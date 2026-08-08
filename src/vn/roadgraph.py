"""Đồ thị đường bộ theo tỉnh — cùng LUẬT với ``hanoi.roadnet``, khác ĐẦU VÀO và khác VĨ ĐỘ.

Giữ nguyên ba luật đã có số đo đỡ lưng ở ``DECISIONS §14``:

  1. lọc thẻ ``access`` chặn xe công chúng (``ACCESS_BLOCKED``, nhập thẳng từ ``hanoi``);
  2. cạnh có hướng, tôn trọng ``oneway``;
  3. **điểm neo phải là nơi xe ĐI TIẾP ĐƯỢC**, không phải đỉnh gần nhất về hình học. Bỏ
     luật này thì ô neo trúng đầu cụt của đường một chiều và khoảng cách ra vô nghĩa.

Hai chỗ KHÁC, và cả hai là hệ quả của việc rời khỏi một tỉnh:

* **Đầu vào là ``road_graph.parquet``**, không phải ``osm_hanoi_roads.parquet``. File đó
  mang ``node_ids`` + toạ độ NGUYÊN; file hiển thị ``roads.parquet`` đã đơn giản hoá nên
  số đỉnh không còn khớp ``node_ids`` và vĩnh viễn không dựng đồ thị được.
* **Hệ số mét/độ tính theo vĩ độ của chính tỉnh.** ``hanoi.roadnet`` khoá cứng
  ``103.940 m`` = ``111.320 × cos(21°)``. Ở Cà Mau con số đúng là 110.073 — dùng hằng số
  Hà Nội làm MỌI trọng số cạnh ở miền Nam ngắn đi 5,9%.

── VÌ SAO KHÔNG DÙNG "SCC LỚN NHẤT" NỮA ───────────────────────────────────────────────

``hanoi.roadnet`` neo vào **SCC lớn nhất**. Ở một tỉnh liền mạch đó là cách viết gọn của
"đỉnh mà xe đi tiếp được", vì cả mạng đường là một khối. Ở 34 tỉnh nó SAI, và sai lớn.

Đo được ở TP.HCM: sau sáp nhập 01/7/2025, TP.HCM = Sài Gòn + Bình Dương + Bà Rịa–Vũng Tàu,
mà **Đồng Nai nằm chen giữa** — nên lãnh thổ tỉnh **không liền mạch theo đường bộ** trong
vành đệm 5 km của chính nó. SCC lớn nhất là phần Sài Gòn; toàn bộ Vũng Tàu / Phú Mỹ / Bà Rịa
rơi ra ngoài. Hậu quả: **3.368 ô mang 1,38 triệu người** bị gắn "không tới được bằng đường",
mỗi ô cách đỉnh SCC-lớn trung vị **31,8 km**, trong khi chính chúng có trung bình 2,5 km
đường trong ô. 134/881 trạm cũng không neo được.

Luật đúng là luật GỐC, không phải cách viết gọn của nó: **đỉnh thuộc một SCC đủ lớn để
không phải đầu cụt**. Số đo gốc ở ``DECISIONS §14`` nói về đỉnh có ``SCC = 1`` — vào được,
không ra được. ``MIN_SCC_NODES = 100`` giết sạch loại đó (và cả các mẩu vài đỉnh do lỗi vẽ
bản đồ) mà không vứt một mạng đường có thật nào: mạng Vũng Tàu có hàng trăm nghìn đỉnh.

**Khoảng trống còn lại, khai báo rõ:** một ô ở Vũng Tàu giờ định tuyến tới trạm ở Vũng Tàu,
không tới trạm ở Sài Gòn qua Đồng Nai. Về mặt vật lý đường đi qua Đồng Nai là có thật, nhưng
đồ thị của tỉnh không chứa nó. Sai số này bị chặn: trạm gần nhất theo đường gần như luôn nằm
cùng phía. Muốn hết hẳn thì phải dựng đồ thị trên tỉnh + các tỉnh kề, và đó là một quyết
định về chi phí I/O chứ không phải một lỗi còn ẩn.
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

from hanoi.roadnet import ACCESS_BLOCKED, SNAP_MAX_M

from . import admin, paths

M_PER_DEG_LAT = 110_574.0

# Ngưỡng "đủ lớn để không phải đầu cụt" — xem docstring module. 100 nằm giữa hai bậc cách
# nhau hàng nghìn lần: mẩu lỗi vẽ bản đồ dưới ~10 đỉnh, mạng đường một đô thị trên 10⁵.
MIN_SCC_NODES = 100


def scale_for(province_code: str) -> tuple[float, float]:
    """(mét trên độ vĩ, mét trên độ kinh) tại vĩ độ tâm của tỉnh."""
    lat0 = admin.boundary(province_code).centroid.y
    return M_PER_DEG_LAT, admin.m_per_deg_lon(lat0)


@dataclass
class RoadGraph:
    ids: np.ndarray
    lon: np.ndarray
    lat: np.ndarray
    X: np.ndarray
    Y: np.ndarray
    src: np.ndarray
    dst: np.ndarray
    dist_w: np.ndarray
    n_scc: int
    in_core: np.ndarray  # đỉnh thuộc một SCC ≥ MIN_SCC_NODES
    n_core_components: int
    gidx: np.ndarray
    tree: cKDTree  # CHỈ trên đỉnh đủ điều kiện — mọi phép neo đi qua đây
    m_lat: float
    m_lon: float

    @property
    def n_nodes(self) -> int:
        return len(self.ids)

    def xy(self, lng, lat):
        return np.asarray(lng) * self.m_lon, np.asarray(lat) * self.m_lat


def load_ways(province_code: str) -> tuple[pd.DataFrame, int]:
    """Đọc phân mảnh đồ thị của tỉnh, áp bộ lọc ``access``. Trả (df, tổng trước lọc)."""
    t = pq.read_table(paths.PROV / province_code / "road_graph.parquet").to_pandas()
    n_all = len(t)
    return t[~t.access.isin(ACCESS_BLOCKED)].reset_index(drop=True), n_all


def build(province_code: str, ways: pd.DataFrame) -> RoadGraph:
    m_lat, m_lon = scale_for(province_code)
    node_xy: dict[int, tuple[float, float]] = {}
    way_nodes_raw: list[list[int] | None] = []
    for nids, flat in zip(ways.node_ids, ways.coords):
        nids = list(nids)
        arr = np.asarray(flat, dtype=np.float64)
        if len(nids) < 2 or arr.size != 2 * len(nids):
            # Hình học không khớp danh sách đỉnh — bỏ đoạn, không đoán. Đếm ở QA của n07.
            way_nodes_raw.append(None)
            continue
        xy = arr.reshape(-1, 2)
        for nd, (x, y) in zip(nids, xy):
            if nd not in node_xy:
                node_xy[nd] = (x, y)
        way_nodes_raw.append(nids)

    ids = np.sort(np.fromiter(node_xy.keys(), dtype=np.int64, count=len(node_xy)))
    lon = np.array([node_xy[i][0] for i in ids])
    lat = np.array([node_xy[i][1] for i in ids])
    pos = {int(nd): i for i, nd in enumerate(ids)}
    X, Y = lon * m_lon, lat * m_lat

    src, dst, w = [], [], []
    for nodes, ow in zip(way_nodes_raw, ways.oneway):
        if nodes is None:
            continue
        idxs = [pos[int(n)] for n in nodes]
        for ia, ib in zip(idxs[:-1], idxs[1:]):
            if ia == ib:
                continue
            d = math.hypot(X[ia] - X[ib], Y[ia] - Y[ib])
            if d <= 0:
                continue
            if ow >= 0:
                src.append(ia)
                dst.append(ib)
                w.append(d)
            if ow <= 0:
                src.append(ib)
                dst.append(ia)
                w.append(d)

    src = np.asarray(src, dtype=np.int32)
    dst = np.asarray(dst, dtype=np.int32)
    w = np.asarray(w, dtype=np.float64)
    n = len(ids)
    n_scc, lab = connected_components(
        csr_matrix((w, (src, dst)), shape=(n, n)), directed=True, connection="strong"
    )
    sizes = np.bincount(lab)
    in_core = sizes[lab] >= MIN_SCC_NODES
    gidx = np.flatnonzero(in_core)
    return RoadGraph(
        ids=ids,
        lon=lon,
        lat=lat,
        X=X,
        Y=Y,
        src=src,
        dst=dst,
        dist_w=w,
        n_scc=int(n_scc),
        in_core=in_core,
        n_core_components=int((sizes >= MIN_SCC_NODES).sum()),
        gidx=gidx,
        tree=cKDTree(np.c_[X[gidx], Y[gidx]]),
        m_lat=m_lat,
        m_lon=m_lon,
    )


def snap(g: RoadGraph, lng: np.ndarray, lat: np.ndarray):
    """Neo điểm vào đỉnh thuộc một SCC đủ lớn. Trả (đỉnh, độ lệch NHỎ NHẤT tại đỉnh, mask neo được, sx, sy).

    Độ lệch lấy MIN chứ không phải tổng: nhiều trạm cùng neo một đỉnh thì ``csr_matrix`` sẽ
    CỘNG DỒN các giá trị trùng chỉ số, và một đỉnh có 5 trạm sẽ mang trọng số gấp 5.
    """
    sx, sy = g.xy(lng, lat)
    sd, si = g.tree.query(np.c_[sx, sy])
    ok = sd <= SNAP_MAX_M
    if not ok.any():
        return np.empty(0, np.int32), np.empty(0), ok, sx, sy
    off = pd.Series(sd[ok]).groupby(pd.Series(g.gidx[si[ok]])).min()
    return off.index.to_numpy().astype(np.int32), off.to_numpy(), ok, sx, sy


def multisource(g: RoadGraph, snodes: np.ndarray, soff: np.ndarray, reverse: bool):
    """Dijkstra đa nguồn qua một đỉnh siêu-nguồn.

    ``reverse=True`` → đồ thị NGƯỢC ⇒ khoảng cách Ô → TRẠM (chiều đi sạc, trường chính).
    """
    n = g.n_nodes
    if len(snodes) == 0:
        return np.full(n, np.inf)
    a, b = (g.dst, g.src) if reverse else (g.src, g.dst)
    rs = np.concatenate([a, np.full(len(snodes), n, np.int32)])
    rd = np.concatenate([b, snodes])
    gm = csr_matrix((np.concatenate([g.dist_w, soff]), (rs, rd)), shape=(n + 1, n + 1))
    return dijkstra(gm, directed=True, indices=n)[:n]
