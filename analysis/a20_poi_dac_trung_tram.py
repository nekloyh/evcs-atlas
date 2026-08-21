"""L5/A20 — Dựng đặc trưng POI QUANH TỪNG TRẠM, ở hai loại bán kính.

Đổi đơn vị phân tích, và đây là thay đổi quan trọng nhất của cả L5.

Bản trước phân cụm theo XÃ và kết quả chỉ khám phá lại `commune_kind` (Cramér's V 0,718).
Lý do gốc không phải thuật toán sai mà là **đơn vị sai**: xã là ranh giới hành chính, còn
câu hỏi thật của engine phê duyệt là *"quanh ĐIỂM này có gì"*. Ranh giới xã không liên quan
gì tới bán kính phục vụ của một trụ sạc.

Đơn vị đúng là **trạm**, vì trạm là chỗ duy nhất có BIẾN MỤC TIÊU đo được (`util`). Mọi
khẳng định về POI từ nay phải trả lời được: *nó có dự báo được mức sử dụng thật không?*

Hai loại bán kính, để kiểm một giả thuyết cụ thể:
  CHIM BAY — POI trong bán kính R tính theo đường thẳng
  MẠNG ĐƯỜNG — POI mà xe LÁI TỚI ĐƯỢC trong R mét

Hệ số đi vòng ở Hà Nội có trung vị 1,47 nên hai tập này khác nhau đáng kể. Nếu bán kính theo
mạng đường dự báo `util` tốt hơn, đó là bằng chứng POI ảnh hưởng qua đường đi thật chứ không
qua khoảng cách trên bản đồ — và mọi lớp POI sau này phải dùng mạng đường.

Ghi: data/qa/critique/a20_dac_trung_tram.parquet
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from _common import ROOT, emit
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

sys.path.insert(0, str(ROOT / "src"))
from evcs.core import roadgraph as roadnet

BAN_KINH = (300, 500, 1000, 1500)
LIMIT_M = 1_600.0


def main() -> None:
    st = pq.read_table(ROOT / "data/processed/stations.parquet").to_pandas()
    st = st[
        (st.scope == "HANOI")
        & st.op_status.isin(["OPERATIONAL", "MAINTENANCE"])
        & (st.access != "RESTRICTED")
    ].reset_index(drop=True)
    st["commune_kind"] = np.where(
        st.commune_name.fillna("").str.startswith("Phường"), "PHUONG", "XA"
    )

    occ = pq.read_table(ROOT / "data/processed/station_occupancy.parquet").to_pandas()
    st = st.merge(
        occ[["station_code", "util", "util_p95", "grade", "util_reportable", "saturation_frac"]],
        on="station_code",
        how="left",
    )

    poi = pq.read_table(ROOT / "data/qa/critique/poi_extended.parquet").to_pandas()
    grid = pq.read_table(ROOT / "data/processed/grid_h3_r8.parquet").to_pandas()
    lop = sorted(poi.poi_class.unique())
    print(f"{len(st)} trạm · {len(poi):,} POI · {len(lop)} lớp")

    sx, sy = roadnet.xy(st.lng.to_numpy(), st.lat.to_numpy())
    px, py = roadnet.xy(poi.lng.to_numpy(), poi.lat.to_numpy())
    gx, gy = roadnet.xy(grid.lng.to_numpy(), grid.lat.to_numpy())
    S, P, G = np.c_[sx, sy], np.c_[px, py], np.c_[gx, gy]
    cls_idx = pd.Categorical(poi.poi_class, categories=lop).codes

    out = st[
        [
            "station_code",
            "lat",
            "lng",
            "commune_kind",
            "commune_name",
            "current_type",
            "n_ports",
            "power_kw_site",
            "util",
            "util_p95",
            "grade",
            "util_reportable",
            "saturation_frac",
        ]
    ].copy()

    # --- CHIM BAY -----------------------------------------------------------
    tp, tg = cKDTree(P), cKDTree(G)
    for R in BAN_KINH:
        idx = tp.query_ball_point(S, R)
        M = np.zeros((len(st), len(lop)))
        for i, js in enumerate(idx):
            if js:
                np.add.at(M[i], cls_idx[js], 1)
        for k, c in enumerate(lop):
            out[f"eu{R}_{c.lower()}"] = M[:, k]
        out[f"eu{R}_tong"] = M.sum(1)
        gi = tg.query_ball_point(S, R)
        out[f"eu{R}_dan"] = [float(grid.population.to_numpy()[j].sum()) for j in gi]

    # --- MẠNG ĐƯỜNG ---------------------------------------------------------
    # Một lượt Dijkstra CÓ GIỚI HẠN từ mỗi đỉnh-trạm. Giới hạn 1,6 km làm phép tìm dừng sớm,
    # nếu không thì 710 lượt trên 1,33 triệu đỉnh là bất khả thi.
    roads, _ = roadnet.load_roads()
    g = roadnet.build_graph(roads)
    gm = csr_matrix((g.dist_w, (g.src, g.dst)), shape=(g.n_nodes, g.n_nodes))

    sd_s, si_s = g.tree.query(S)
    node_s = g.gidx[si_s]
    sd_p, si_p = g.tree.query(P)
    node_p = g.gidx[si_p]  # POI neo vào đỉnh gần nhất

    uniq = np.unique(node_s)
    row_of = {int(n): k for k, n in enumerate(uniq)}
    Dpoi = np.full((len(uniq), len(poi)), np.inf)
    for i in range(0, len(uniq), 30):
        blk = uniq[i : i + 30]
        D = dijkstra(gm, directed=True, indices=blk, limit=LIMIT_M)
        Dpoi[i : i + len(blk)] = D[:, node_p] + sd_p  # + đoạn POI ra mặt đường
        del D
        print(f"  dijkstra {min(i + 30, len(uniq))}/{len(uniq)}", flush=True)

    for R in BAN_KINH:
        M = np.zeros((len(st), len(lop)))
        tot = np.zeros(len(st))
        for i in range(len(st)):
            d = Dpoi[row_of[int(node_s[i])]] + sd_s[i]
            js = np.flatnonzero(d <= R)
            tot[i] = len(js)
            if len(js):
                np.add.at(M[i], cls_idx[js], 1)
        for k, c in enumerate(lop):
            out[f"rd{R}_{c.lower()}"] = M[:, k]
        out[f"rd{R}_tong"] = tot

    # --- chỉ số đa dạng: mô tả "pha trộn chức năng" bằng MỘT số, không cần cụm ---
    for pre in ("eu1000", "rd1000"):
        C = out[[f"{pre}_{c.lower()}" for c in lop]].to_numpy()
        tot = C.sum(1, keepdims=True)
        p = np.divide(C, tot, out=np.zeros_like(C), where=tot > 0)
        with np.errstate(divide="ignore", invalid="ignore"):
            H = -np.nansum(np.where(p > 0, p * np.log(p), 0.0), axis=1)
        out[f"{pre}_shannon"] = H
        out[f"{pre}_simpson"] = 1 - (p**2).sum(1)
        out[f"{pre}_n_lop"] = (C > 0).sum(1)

    out.to_parquet(ROOT / "data/qa/critique/a20_dac_trung_tram.parquet", index=False)

    do_duoc = out.util_reportable.fillna(False) & (out.grade == "GOOD") & out.util.notna()
    report = {
        "cau_hoi": "dựng đặc trưng POI quanh từng trạm, hai loại bán kính, để kiểm bằng util",
        "n_tram": int(len(out)),
        "n_tram_co_util_do_duoc": int(do_duoc.sum()),
        "n_poi": int(len(poi)),
        "lop_poi": lop,
        "ban_kinh_m": list(BAN_KINH),
        "so_poi_trung_vi_quanh_tram": {
            f"{k}{R}": float(out[f"{k}{R}_tong"].median()) for k in ("eu", "rd") for R in BAN_KINH
        },
        "chim_bay_vs_mang_duong": {
            f"R{R}": {
                "ti_le_poi_mang_tren_chim_bay_trung_vi": round(
                    float((out[f"rd{R}_tong"] / out[f"eu{R}_tong"].replace(0, np.nan)).median()),
                    3,
                ),
                "n_tram_mang_it_hon_mot_nua": int(
                    (out[f"rd{R}_tong"] < 0.5 * out[f"eu{R}_tong"]).sum()
                ),
            }
            for R in BAN_KINH
        },
    }
    report["ket_luan"] = [
        f"{int(do_duoc.sum())}/{len(out)} trạm có `util` đo được tin cậy — đây là trần của "
        f"mọi phép kiểm chứng POI.",
        "Bán kính mạng đường luôn bắt ít POI hơn chim bay ở cùng R; chênh lệch đó chính là "
        "thứ §9 dùng để kiểm giả thuyết 'POI ảnh hưởng qua đường đi thật'.",
    ]
    emit("A20_POI_TRAM", "KHONG_HONG", report)


if __name__ == "__main__":
    main()
