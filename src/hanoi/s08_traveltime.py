"""B8 — Khoảng cách THẬT theo mạng đường tới trạm gần nhất.

Đây là trường mà cả hai repo cũ đều không có: chúng chỉ có Euclid-geodesic và phát hằng số
``evidence_grade.travel_time = EUCLID_FALLBACK`` trên 100% hồ sơ. Ở Hà Nội sai số này KHÔNG
phân bố đều — sông Hồng, đường một chiều, cầu hạn chế giờ khiến một điểm "gần theo đường
chim bay" có thể xa gấp nhiều lần theo đường đi thật.

CHỈ PHÁT MÉT, KHÔNG PHÁT PHÚT — và đó là một quyết định có số đo đỡ lưng. Bản trước có
``drive_time_station_min``, tính từ bảng 7 con số km/h đặt tay theo cấp đường. Kiểm độ nhạy:
chạy lại với bảng × 0,7 và × 1,3 cho Spearman **0,9964** (xếp hạng bền), nhưng **62% ô đổi
nhóm ngưỡng 3/5/10 phút** — tức con số phút tuyệt đối là hàm của bảng giả định, không phải
của thực tế. Và bỏ hẳn tag ``maxspeed`` (vốn chỉ có ở 1,1% đoạn) thì Spearman vẫn **0,9991**
— nghĩa là trường thời gian **100% là giả định**, không phải 98,9%.

Mét thì không có tham số nào: nó đo trên chính hình học đường. Xem DECISIONS.md §6.

BỐN trường, BỐN khái niệm khác nhau — không phải biến thể của nhau:
  ``dist_station_network_m``  quãng đường xe phải chạy       → mọi câu hỏi về hành trình/độ phủ
  ``dist_station_euclid_m``   khoảng cách chim bay           → câu hỏi về BỐ TRÍ không gian
                                                               (hai trạm có gần nhau quá không)
  ``detour_ratio``            = network / euclid             → sai số của việc dùng chim bay
  ``dist_station_asym_m``     = |đi − về|                    → nơi đường MỘT CHIỀU làm chiều về
                                                               khác hẳn chiều đi

HAI SỬA LỖI TỪ A4/A5 — đọc kỹ, vì chúng đổi con số:

1. **Neo vào SCC lớn.** Điểm vào mạng trước đây chọn bằng "đỉnh gần nhất về hình học", không
   hỏi xe có đi tiếp được không. 49 ô và 2 trạm neo trúng đỉnh có ``SCC = 1`` — đầu cụt của
   đường một chiều, vào được nhưng không ra được. Nay chỉ neo vào đỉnh thuộc thành phần liên
   thông MẠNH lớn nhất. Đo được: cứu 49 ô, 886/886 trạm neo được, **0 ô đổi quá 500 m**, độ
   lệch neo thêm trung vị **0,0 m**.

2. **Lọc ``access``.** Đường OSM gắn ``access`` ∈ {private, no, customers, residents,
   delivery, permit} không dẫn được xe của công chúng. Chỉ 0,838% đoạn có thẻ này — không
   phải vì đường cấm hiếm, mà vì **OSM Việt Nam gần như không gắn thẻ**. Lọc nó đổi 22 ô quá
   500 m. Lọc là để khỏi phải bảo vệ câu "ta cố ý dẫn đường qua lối đã ghi rõ là cấm".
   ``destination`` KHÔNG bị chặn: nó nghĩa là được vào nếu điểm đến nằm trong — mà trạm sạc
   chính là điểm đến.

Sinh:
  data/processed/layers/traveltime_cell.parquet
  data/qa/s08_traveltime.json
"""

from __future__ import annotations

import json

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from . import grid, paths, roadnet
from .roadnet import ACCESS_BLOCKED, SNAP_MAX_M  # dùng trong báo cáo QA

# Dưới ngưỡng này, tỉ số đi vòng là nhiễu (mẫu số quá nhỏ) — để null thay vì phát số vô nghĩa.
DETOUR_MIN_EUCLID_M = 200.0
# Hai ô r8 kề nhau cách tâm ~0,8 km. Chênh lệch khoảng-cách-tới-trạm giữa chúng lớn hơn ngưỡng
# này thì hoặc có rào cản thật (sông Hồng ít cầu), hoặc là lỗi neo. Xem A13.
NEIGHBOR_JUMP_M = 2_000.0


def main() -> None:
    # Đồ thị + neo trạm dựng ở `roadnet` (tách ra cho M3-R dùng chung, luật không đổi):
    # lọc access → đỉnh/cạnh tôn trọng một chiều → SCC lớn → KDTree chỉ trên SCC lớn.
    roads, n_roads_all = roadnet.load_roads()
    n_blocked = n_roads_all - len(roads)
    G = roadnet.build_graph(roads)
    n_nodes = G.n_nodes

    st = roadnet.load_stations()
    station_nodes, station_off_m, ok, sx, sy = roadnet.snap_stations(G, st)
    print(
        f"đỉnh={n_nodes:,} (SCC lớn {G.in_giant.sum():,}) cạnh={len(G.src):,} "
        f"trạm-neo-được={ok.sum()}/{len(st)}"
    )

    d_to_node = roadnet.multisource(G, station_nodes, station_off_m, True)
    d_from_node = roadnet.multisource(G, station_nodes, station_off_m, False)

    # --- gán về ô -----------------------------------------------------------
    cells = grid.hanoi_cells()
    clat = np.array([grid.centroid(c)[0] for c in cells])
    clng = np.array([grid.centroid(c)[1] for c in cells])
    cx, cy = roadnet.xy(clng, clat)
    cd, ci = G.tree.query(np.c_[cx, cy])
    anchor = G.gidx[ci]

    access_ok = cd <= SNAP_MAX_M
    nd_to = np.where(access_ok, d_to_node[anchor], np.inf)
    nd_from = np.where(access_ok, d_from_node[anchor], np.inf)
    # cộng đoạn nối từ tâm ô ra điểm vào mạng đường (ngõ/lối vào), tính theo đường thẳng
    dist_m = np.where(np.isfinite(nd_to), nd_to + cd, np.nan)
    from_m = np.where(np.isfinite(nd_from), nd_from + cd, np.nan)

    # --- chim bay: một KHÁI NIỆM RIÊNG, không phải bản dự phòng --------------
    stree = cKDTree(np.c_[sx, sy])
    eu, _ = stree.query(np.c_[cx, cy])

    reachable = np.isfinite(nd_to)
    ratio_ok = reachable & (eu >= DETOUR_MIN_EUCLID_M)
    detour_col = np.where(ratio_ok, dist_m / np.where(eu > 0, eu, np.nan), np.nan)
    # Bất đối xứng: phần thông tin DUY NHẤT mà chiều về có mà chiều đi không có. Phát nó thay
    # vì phát cả cột `dist_from` — hai cột khoảng cách trùng nhau 95,7% chỉ mời người dùng
    # chia chúng cho nhau và tạo ra một tỉ số không ai định nghĩa.
    with np.errstate(invalid="ignore"):
        asym = np.where(np.isfinite(dist_m) & np.isfinite(from_m), np.abs(dist_m - from_m), np.nan)

    df = pd.DataFrame(
        {
            "h3_r8": pd.Series(cells, dtype="string"),
            "dist_station_network_m": dist_m,
            "dist_station_euclid_m": eu,
            "detour_ratio": detour_col,
            "dist_station_asym_m": asym,
            "road_access_offset_m": cd,
            "network_reachable": reachable,
        }
    )
    df["evidence_grade_distance"] = pd.Series(
        np.where(
            df.network_reachable,
            "OSM_NETWORK",
            np.where(access_ok, "UNREACHABLE_NO_PATH", "UNREACHABLE_NO_ROAD_ACCESS"),
        ),
        dtype="string",
    )
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False), paths.LAYERS / "traveltime_cell.parquet"
    )

    # --- A13: liên tục không gian -------------------------------------------
    # Hai ô kề cách tâm ~0,8 km ⇒ khoảng cách tới trạm không thể nhảy tuỳ tiện. Chỗ nhảy hoặc
    # là RÀO CẢN THẬT (sông Hồng ít cầu — đối chứng dương có sẵn), hoặc là LỖI NEO. Sau khi
    # neo vào SCC lớn, loại lỗi thứ hai phải biến mất; phép kiểm này canh nó không quay lại.
    dmap = dict(zip(cells, dist_m))
    jumps = []
    for c in cells:
        a = dmap[c]
        if not np.isfinite(a):
            continue
        for nb in h3.grid_disk(c, 1):
            if nb != c and nb in dmap and np.isfinite(dmap[nb]) and nb > c:
                jumps.append(abs(a - dmap[nb]))
    jumps = np.asarray(jumps)
    big_jump_share = float((jumps > NEIGHBOR_JUMP_M).mean()) if len(jumps) else 0.0

    detour = detour_col[ratio_ok]
    checks = []

    def chk(name, ok_, detail=""):
        checks.append({"name": name, "status": "PASS" if ok_ else "FAIL", "detail": detail})

    chk("all_cells_present", len(df) == len(cells), f"{len(df)}/{len(cells)}")
    chk(
        "network_ge_euclid",
        bool((detour >= 0.999).all()),
        f"min tỉ số {float(detour.min()):.3f} (đường mạng không thể ngắn hơn chim bay)",
    )
    chk(
        "most_cells_reachable",
        float(df.network_reachable.mean()) > 0.99,
        f"{int(df.network_reachable.sum())}/{len(df)} = {df.network_reachable.mean():.1%}",
    )
    chk("no_negative_distance", bool((df.dist_station_network_m.dropna() >= 0).all()), "")
    chk(
        "no_time_field",
        not any("time" in c or "min" in c for c in df.columns),
        "bộ dữ liệu không phát trường thời gian nào — chỉ mét",
    )
    chk(
        "all_anchors_in_giant_scc",
        bool(G.in_giant[anchor].all()) and bool(G.in_giant[station_nodes].all()),
        "mọi điểm neo (ô và trạm) đều nằm trong SCC lớn — xe đi tiếp được",
    )
    # KHÔNG có phép kiểm PASS/FAIL cho liên tục không gian, và đó là chủ ý.
    #
    # Bản đầu tôi đặt "dưới 1% cặp ô kề được nhảy quá 2 km" rồi nó FAIL ở 6,7%. Nhưng cả hai
    # con số đều do tôi bịa: hai ô r8 kề cách tâm ~0,8 km, nên trung vị nhảy 740 m là ĐÚNG về
    # hình học, không phải triệu chứng. Một ngưỡng tự đặt rồi tự phán là hỏng thì chính là
    # lỗi mà DECISIONS §7 đã kết án ở trường `buildable`.
    #
    # Chỗ nhảy lớn phải được GIẢI THÍCH, không phải ĐẾM: sông Hồng ít cầu là rào cản có thật
    # và là đối chứng dương có sẵn. Việc đó làm ở `analysis/a13_lien_tuc_khong_gian.py`, nơi
    # có thể chồng lên bản đồ mà nhìn. Ở đây chỉ phát con số.
    #
    # Lớp lỗi mà A13 vốn định bắt — ô neo vào đỉnh cụt — đã có phép kiểm TRỰC TIẾP và không
    # cần ngưỡng nào: `all_anchors_in_giant_scc` ở trên.

    # Sai số của việc dùng chim bay thay quãng đường, ở các bán kính phục vụ thường dùng.
    # Đây là lý do `dist_station_euclid_m` KHÔNG được dùng để trả lời "ô này đã phủ chưa".
    radii = {}
    for R in (1_000, 2_000, 3_000, 5_000):
        cov_eu = eu <= R
        cov_net = np.nan_to_num(dist_m <= R, nan=False)
        fp = cov_eu & ~cov_net
        radii[f"{R}m"] = {
            "cells_covered_euclid": int(cov_eu.sum()),
            "cells_covered_network": int(cov_net.sum()),
            "false_positive_cells": int(fp.sum()),
            "false_positive_share": round(float(fp.sum() / max(1, cov_eu.sum())), 4),
        }

    a = asym[np.isfinite(asym)]
    report = {
        "layer": "distance",
        "method": "Dijkstra đa nguồn trên đồ thị đường OSM (đúng chiều một chiều), trọng số MÉT",
        "no_time_field": (
            "Không phát trường thời gian: bảng tốc độ giả định chi phối 100% giá trị "
            "(bỏ tag maxspeed đi Spearman vẫn 0,9991) và 62% ô đổi nhóm ngưỡng phút khi "
            "đổi bảng ±30%."
        ),
        "graph": {
            "nodes": int(n_nodes),
            "nodes_in_giant_scc": int(G.in_giant.sum()),
            "n_strongly_connected_components": int(G.n_scc),
            "directed_edges": int(len(G.src)),
            "roads_total": int(n_roads_all),
            "roads_dropped_access_blocked": int(n_blocked),
            "access_blocked_values": sorted(ACCESS_BLOCKED),
            "station_sources": int(len(station_nodes)),
            "stations_snapped": int(ok.sum()),
            "stations_total": int(len(st)),
            "snap_max_m": SNAP_MAX_M,
        },
        "stats": {
            "n_cells": int(len(df)),
            "n_reachable": int(df.network_reachable.sum()),
            "dist_median_m": round(float(np.nanmedian(dist_m)), 1),
            "dist_p90_m": round(float(np.nanpercentile(dist_m, 90)), 1),
            "euclid_median_m": round(float(np.median(eu)), 1),
            "detour_ratio_median": round(float(np.median(detour)), 3),
            "detour_ratio_p90": round(float(np.percentile(detour, 90)), 3),
            "detour_ratio_max": round(float(detour.max()), 2),
            "cells_where_euclid_understates_gt_2x": int((detour > 2).sum()),
            "detour_ratio_null_cells": int((~ratio_ok).sum()),
            "asym_median_m": round(float(np.median(a)), 1),
            "asym_p90_m": round(float(np.percentile(a, 90)), 1),
            "asym_max_m": round(float(a.max()), 1),
            "cells_asym_gt_500m": int((a > 500).sum()),
            "neighbor_pairs": int(len(jumps)),
            "neighbor_jump_median_m": round(float(np.median(jumps)), 1),
            "neighbor_jump_p90_m": round(float(np.percentile(jumps, 90)), 1),
            "neighbor_jump_p99_m": round(float(np.percentile(jumps, 99)), 1),
            "neighbor_jump_max_m": round(float(jumps.max()), 1),
            "neighbor_pairs_jump_gt_2km": int((jumps > NEIGHBOR_JUMP_M).sum()),
            "neighbor_pairs_jump_gt_2km_share": round(big_jump_share, 4),
            "euclid_coverage_error_by_radius": radii,
        },
        "checks": checks,
    }
    (paths.QA / "s08_traveltime.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
