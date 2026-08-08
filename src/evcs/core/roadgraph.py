"""Đồ thị đường bộ có hướng + Dijkstra đa nguồn. Thuần — không đọc đĩa, không biết tỉnh.

Ba luật, mỗi luật có số đo đỡ lưng ở ``DECISIONS §14``:

  1. lọc thẻ ``access`` chặn xe công chúng;
  2. cạnh có hướng, tôn trọng ``oneway``;
  3. **điểm neo phải là nơi xe ĐI TIẾP ĐƯỢC**, không phải đỉnh gần nhất về hình học. Bỏ luật
     này thì ô neo trúng đầu cụt của đường một chiều và khoảng cách ra vô nghĩa.

── VÌ SAO KHÔNG DÙNG "SCC LỚN NHẤT" ────────────────────────────────────────────────────

Gói ``hanoi`` neo vào **SCC lớn nhất**. Ở một tỉnh liền mạch đó là cách viết gọn của "đỉnh
mà xe đi tiếp được", vì cả mạng đường là một khối. Ở 34 tỉnh nó SAI, và sai lớn.

Đo được ở TP.HCM: sau sáp nhập 01/7/2025, TP.HCM = Sài Gòn + Bình Dương + Bà Rịa–Vũng Tàu,
mà **Đồng Nai nằm chen giữa** — lãnh thổ tỉnh không liền mạch theo đường bộ trong vành đệm
5 km của chính nó. SCC lớn nhất là phần Sài Gòn; toàn bộ Vũng Tàu / Phú Mỹ / Bà Rịa rơi ra
ngoài. Hậu quả: **3.368 ô mang 1,38 triệu người** bị gắn "không tới được bằng đường", mỗi ô
cách đỉnh SCC-lớn trung vị **31,8 km**, trong khi chính chúng có trung bình 2,5 km đường
trong ô. 134/881 trạm cũng không neo được.

Luật đúng là luật GỐC, không phải cách viết gọn: **đỉnh thuộc một SCC đủ lớn để không phải
đầu cụt**. ``MIN_SCC_NODES = 100`` giết sạch loại đó (và cả các mẩu vài đỉnh do lỗi vẽ bản
đồ) mà không vứt một mạng đường có thật nào: mạng Vũng Tàu có hàng trăm nghìn đỉnh.

**Khoảng trống còn lại, khai báo rõ:** một ô ở Vũng Tàu định tuyến tới trạm ở Vũng Tàu,
không tới trạm ở Sài Gòn qua Đồng Nai. Đường đi qua Đồng Nai là có thật về vật lý, nhưng đồ
thị của tỉnh không chứa nó. Muốn hết hẳn thì phải dựng đồ thị trên tỉnh + các tỉnh kề — đó
là một quyết định về chi phí I/O, không phải một lỗi còn ẩn.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

# Xa hơn mức này thì coi như điểm không có lối vào mạng đường.
SNAP_MAX_M = 2_000.0

# Ngưỡng "đủ lớn để không phải đầu cụt". 100 nằm giữa hai bậc cách nhau hàng nghìn lần: mẩu
# lỗi vẽ bản đồ dưới ~10 đỉnh, mạng đường một đô thị trên 10⁵.
MIN_SCC_NODES = 100

# Dưới khoảng cách chim bay này, tỉ số đi vòng là nhiễu chứ không phải tín hiệu.
DETOUR_MIN_EUCLID_M = 200.0

# Chênh lệch khoảng cách giữa hai ô KỀ NHAU lớn hơn mức này thì đáng nhìn. Đây là CHỈ SỐ,
# không phải cổng PASS/FAIL — mũi phản biện A13 đo ra rằng cả ngưỡng lẫn tỉ lệ kỳ vọng đều
# do người viết bịa, và nhảy trung vị 735 m ≈ đúng khoảng cách tâm hai ô r8.
NEIGHBOR_JUMP_M = 2_000.0


@dataclass
class RoadGraph:
    ids: np.ndarray  # osm node id của từng đỉnh (sắp xếp tăng)
    lon: np.ndarray
    lat: np.ndarray
    X: np.ndarray  # toạ độ mét (xấp xỉ phẳng tại vĩ độ tâm)
    Y: np.ndarray
    src: np.ndarray  # cạnh có hướng, chỉ số đỉnh
    dst: np.ndarray
    dist_w: np.ndarray  # trọng số MÉT
    n_scc: int
    in_core: np.ndarray  # bool theo đỉnh: thuộc một SCC ≥ MIN_SCC_NODES
    n_core_components: int
    gidx: np.ndarray  # chỉ số các đỉnh đủ điều kiện
    tree: cKDTree  # KDTree CHỈ trên đỉnh đủ điều kiện — mọi phép neo đi qua đây
    m_lat: float
    m_lon: float

    # ── way_nodes dạng CSR — CHỈ dựng khi được yêu cầu ────────────────────────
    #
    # Cần cho nhãn ``dist_station_m`` theo ĐOẠN đường (lấy MIN khoảng cách trên các đỉnh
    # của đoạn), KHÔNG cần cho cặp tuyến minh hoạ — hai việc khác nhau, và ADR-0003 bản đầu
    # gộp nhầm chúng làm một.
    #
    # CSR phẳng chứ không phải list-of-list: đo được trên TP.HCM (1,33 triệu đỉnh) là
    # **8,7 MB thay vì 34 MB**. Một list Python cho mỗi đoạn trả 3,4 triệu object header cho
    # một thứ vốn là hai mảng số.
    way_ptr: np.ndarray | None = None
    """Chỉ số bắt đầu của từng đoạn trong ``way_idx``; dài ``n_ways + 1``."""
    way_idx: np.ndarray | None = None
    """Chỉ số đỉnh, phẳng. Đỉnh của đoạn i = ``way_idx[way_ptr[i]:way_ptr[i+1]]``."""
    way_ok: np.ndarray | None = None
    """Đoạn có hình học khớp ``node_ids`` không. Đoạn hỏng có khoảng CSR rỗng — cờ này
    tách 'hỏng' khỏi 'rỗng', hai chuyện khác nhau khi đếm QA."""

    @property
    def n_nodes(self) -> int:
        return len(self.ids)

    @property
    def n_super(self) -> int:
        """Chỉ số của đỉnh SIÊU-NGUỒN trong ma trận (n+1)×(n+1) của ``multisource``."""
        return len(self.ids)

    def nodes_of_way(self, i: int) -> np.ndarray:
        """Chỉ số đỉnh của đoạn thứ ``i``. Cần ``build(..., keep_way_nodes=True)``."""
        if self.way_ptr is None or self.way_idx is None:
            raise RuntimeError("đồ thị dựng không có way_nodes — gọi build(keep_way_nodes=True)")
        return self.way_idx[self.way_ptr[i] : self.way_ptr[i + 1]]

    def xy(self, lng, lat):
        return np.asarray(lng) * self.m_lon, np.asarray(lat) * self.m_lat


def build(
    ways: pd.DataFrame, m_lat: float, m_lon: float, keep_way_nodes: bool = False
) -> RoadGraph:
    """Dựng đồ thị từ bảng đoạn đường có ``node_ids`` + ``coords`` phẳng + ``oneway``.

    ``coords`` là list phẳng [x0, y0, x1, y1, …] **chưa đơn giản hoá**. Lớp ĐỂ NHÌN
    (``roads.parquet``) đã đơn giản hoá ~10 m nên số đỉnh không còn khớp ``node_ids`` và
    vĩnh viễn không dựng đồ thị được — đó là lý do hai lớp là hai file.

    ``keep_way_nodes`` giữ lại ánh xạ đoạn → đỉnh dạng CSR. Mặc định TẮT: chỉ bước gán
    nhãn ``dist_station_m`` theo đoạn cần nó, và bắt mọi bước khác trả 8,7 MB cho một thứ
    chúng không dùng là sai mặc định.
    """
    node_xy: dict[int, tuple[float, float]] = {}
    way_nodes_raw: list[list[int] | None] = []
    for nids, flat in zip(ways.node_ids, ways.coords):
        nids = list(nids)
        arr = np.asarray(flat, dtype=np.float64)
        if len(nids) < 2 or arr.size != 2 * len(nids):
            # Hình học không khớp danh sách đỉnh — bỏ đoạn, không đoán. Đếm ở QA.
            way_nodes_raw.append(None)
            continue
        for nd, (x, y) in zip(nids, arr.reshape(-1, 2)):
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

    way_ptr = way_idx = way_ok = None
    if keep_way_nodes:
        ok = np.fromiter((x is not None for x in way_nodes_raw), bool, len(way_nodes_raw))
        lens = np.fromiter(
            ((len(x) if x is not None else 0) for x in way_nodes_raw), np.int64, len(way_nodes_raw)
        )
        way_ptr = np.zeros(len(way_nodes_raw) + 1, np.int64)
        np.cumsum(lens, out=way_ptr[1:])
        way_idx = np.empty(int(way_ptr[-1]), np.int32)
        k = 0
        for nodes in way_nodes_raw:
            if nodes is None:
                continue
            for nd in nodes:
                way_idx[k] = pos[int(nd)]
                k += 1
        way_ok = ok

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
        way_ptr=way_ptr,
        way_idx=way_idx,
        way_ok=way_ok,
    )


def snap(g: RoadGraph, lng: np.ndarray, lat: np.ndarray):
    """Neo điểm vào đỉnh đủ điều kiện. Trả (đỉnh, độ lệch NHỎ NHẤT, mask neo được, sx, sy).

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


# Giá trị scipy dùng cho "không có đỉnh liền trước" trong mảng predecessors.
NO_PRED = -9999


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

    Với ``return_predecessors=True`` trả ``(d, pred)``. ``pred`` dài ``n + 1`` và tính trên
    đồ thị ĐÃ ĐẢO, nên chuỗi ``pred`` đọc từ một đỉnh ngược về siêu-nguồn chính là đường
    LÁI XE theo đúng chiều đi — xem ``reconstruct_path``. Chi phí đo được trên TP.HCM
    (1,33 triệu đỉnh): **5,3 MB và 0 giây thêm**.
    """
    n = g.n_nodes
    if len(snodes) == 0:
        d = np.full(n, np.inf)
        return (d, np.full(n + 1, NO_PRED, np.int32)) if return_predecessors else d
    a, b = (g.dst, g.src) if reverse else (g.src, g.dst)
    rs = np.concatenate([a, np.full(len(snodes), n, np.int32)])
    rd = np.concatenate([b, snodes])
    gm = csr_matrix((np.concatenate([g.dist_w, soff]), (rs, rd)), shape=(n + 1, n + 1))
    if return_predecessors:
        d, pred = dijkstra(gm, directed=True, indices=n, return_predecessors=True)
        return d[:n], pred
    return dijkstra(gm, directed=True, indices=n)[:n]


def reconstruct_path(pred: np.ndarray, start: int, n_super: int) -> list[int]:
    """Đường đi từ ``start`` về trạm, theo cây ``pred`` của ``multisource(reverse=True)``.

    Trả danh sách chỉ số đỉnh: phần tử ĐẦU là ``start`` (đỉnh neo của ô), phần tử CUỐI là
    đỉnh mà trạm neo vào. Siêu-nguồn KHÔNG nằm trong kết quả — nó là một đỉnh nhân tạo,
    không có toạ độ.

    Hàm THUẦN trên ba con số. Không dùng ``way_nodes``, không dùng hình học đoạn — chỉ toạ
    độ từng đỉnh. Đó là lý do cặp tuyến minh hoạ KHÔNG cần ``keep_way_nodes``.

    Trả rỗng nếu ``start`` không tới được. Có chặn vòng lặp vô hạn: cây ``pred`` hợp lệ thì
    không có chu trình, nhưng một mảng hỏng không được làm treo cả pipeline.

    ── PHÂN RÃ CỦA ``dist_station_network_m`` ───────────────────────────────────────────

    Cộng cạnh dọc tuyến KHÔNG ra thẳng con số mà bộ dữ liệu phát. Đủ ba số hạng:

        dist_station_network_m  =  Σ cạnh dọc tuyến
                                +  soff   độ lệch neo của TRẠM  (đã nằm trong ``d``)
                                +  cd     độ lệch neo của Ô     (``road_access_offset_m``)

    ``soff`` nằm trong ``d`` vì nó là trọng số của cạnh siêu-nguồn → đỉnh-trạm; nó KHÔNG
    nằm trong tổng cạnh vì siêu-nguồn không thuộc tuyến. Bỏ sót nó cho lệch trung vị
    ~27 m, bỏ sót ``cd`` cho lệch trung vị ~265 m — cả hai đều đủ nhỏ để trông như "sai số
    làm tròn" và đủ lớn để sai.

    Kiểm trên tỉnh 01 với đủ ba số hạng: **500/500 ô, lệch tối đa 0,000000000 m**.
    """
    out: list[int] = []
    v = int(start)
    seen = set()
    while 0 <= v < n_super:
        if v in seen:
            break
        seen.add(v)
        out.append(v)
        v = int(pred[v])
    # Chuỗi hợp lệ phải KẾT THÚC ở siêu-nguồn; dừng vì `NO_PRED` nghĩa là không tới được.
    return out if v == n_super else []
