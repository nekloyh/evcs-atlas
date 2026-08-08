"""N7 — Khoảng cách THẬT theo mạng đường tới trạm gần nhất, theo tỉnh.

Sinh (mỗi tỉnh):
  store/p/<code>/traveltime_cell.parquet
  store/qa/<code>/n07_distance.json

Giữ nguyên mọi quyết định của ``hanoi.s08``:

* **CHỈ PHÁT MÉT, KHÔNG PHÁT PHÚT.** Bảng tốc độ đặt tay chi phối 100% giá trị thời gian
  (bỏ hẳn tag ``maxspeed`` thì Spearman vẫn 0,9991) và 62% ô đổi nhóm ngưỡng phút khi đổi
  bảng ±30%. Mét thì không có tham số nào — nó đo trên chính hình học đường.
* **Bốn trường, bốn khái niệm**: ``dist_station_network_m`` (quãng đường xe chạy) ·
  ``dist_station_euclid_m`` (chim bay, dùng cho câu hỏi về BỐ TRÍ) · ``detour_ratio`` (sai
  số của việc dùng chim bay) · ``dist_station_asym_m`` (nơi đường một chiều làm chiều về
  khác chiều đi).
* Lọc ``access``, ``destination`` KHÔNG bị chặn.

── HAI CHỖ KHÁC VÌ RỜI KHỎI MỘT TỈNH ──────────────────────────────────────────────────

1. **Tập trạm nguồn gồm cả ``scope='BUFFER'``.** Ở Hà Nội vành đệm là "ngoài tỉnh"; ở 34
   tỉnh nó là "tỉnh bên cạnh". Một ô sát ranh giới Bắc Ninh được phục vụ bởi trạm ở Hà Nội,
   và cắt tập nguồn đúng ranh giới hành chính là giả vờ ranh giới đó chặn được xe.
2. **Hệ số mét/độ theo vĩ độ tỉnh** (xem ``roadgraph``). Mọi trọng số cạnh phụ thuộc nó.
3. **Điểm neo là đỉnh thuộc một SCC ĐỦ LỚN, không phải SCC lớn NHẤT** — xem ``roadgraph``.
   Luật cũ vứt 1,38 triệu người ở Vũng Tàu ra khỏi bản đồ khoảng cách của TP.HCM.
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from hanoi.roadnet import ACCESS_BLOCKED, SNAP_MAX_M
from hanoi.s08_traveltime import DETOUR_MIN_EUCLID_M, NEIGHBOR_JUMP_M

from . import admin, paths, qa, roadgraph
from .runner import Step

VERSION = "2"


def run(province_code: str) -> None:
    r = qa.Report(
        "n07_distance",
        province_code,
        province_name=admin.province_names()[province_code],
        method="Dijkstra đa nguồn trên đồ thị đường OSM (đúng chiều một chiều), trọng số MÉT",
        no_time_field=(
            "Không phát trường thời gian: bảng tốc độ giả định chi phối 100% giá trị và "
            "62% ô đổi nhóm ngưỡng phút khi đổi bảng ±30% (DECISIONS §6)."
        ),
    )
    ways, n_all = roadgraph.load_ways(province_code)
    g = roadgraph.build(province_code, ways)

    st = pq.read_table(
        paths.PROV / province_code / "stations.parquet",
        columns=["lat", "lng", "op_status", "access", "scope"],
    ).to_pandas()
    # Cùng bộ lọc "đủ điều kiện phục vụ" của s08, và CẢ HAI scope — xem docstring §1.
    st = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]

    snodes, soff, ok, sx, sy = roadgraph.snap(g, st.lng.to_numpy(), st.lat.to_numpy())
    d_to = roadgraph.multisource(g, snodes, soff, reverse=True)
    d_from = roadgraph.multisource(g, snodes, soff, reverse=False)

    grid = pq.read_table(
        paths.PROV / province_code / "grid_cell.parquet", columns=["h3_r8"]
    ).to_pandas()
    cells = grid.h3_r8.tolist()
    latlng = [h3.cell_to_latlng(c) for c in cells]
    clat = np.array([p[0] for p in latlng])
    clng = np.array([p[1] for p in latlng])
    cx, cy = g.xy(clng, clat)
    cd, ci = g.tree.query(np.c_[cx, cy])
    anchor = g.gidx[ci]

    access_ok = cd <= SNAP_MAX_M
    nd_to = np.where(access_ok, d_to[anchor], np.inf)
    nd_from = np.where(access_ok, d_from[anchor], np.inf)
    # Cộng đoạn nối từ tâm ô ra điểm vào mạng đường (ngõ/lối vào), tính theo đường thẳng.
    dist_m = np.where(np.isfinite(nd_to), nd_to + cd, np.nan)
    from_m = np.where(np.isfinite(nd_from), nd_from + cd, np.nan)

    stree = cKDTree(np.c_[sx, sy])
    eu, _ = stree.query(np.c_[cx, cy])

    reachable = np.isfinite(nd_to)
    ratio_ok = reachable & (eu >= DETOUR_MIN_EUCLID_M)
    detour = np.where(ratio_ok, dist_m / np.where(eu > 0, eu, np.nan), np.nan)
    with np.errstate(invalid="ignore"):
        asym = np.where(np.isfinite(dist_m) & np.isfinite(from_m), np.abs(dist_m - from_m), np.nan)

    df = pd.DataFrame(
        {
            "h3_r8": pd.Series(cells, dtype="string"),
            "dist_station_network_m": dist_m,
            "dist_station_euclid_m": eu,
            "detour_ratio": detour,
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
        pa.Table.from_pandas(df, preserve_index=False),
        paths.province_dir(province_code) / "traveltime_cell.parquet",
    )

    # --- QA ---------------------------------------------------------------
    dmap = dict(zip(cells, dist_m))
    jumps = [
        abs(dmap[c] - dmap[nb])
        for c in cells
        if np.isfinite(dmap[c])
        for nb in h3.grid_disk(c, 1)
        if nb != c and nb > c and nb in dmap and np.isfinite(dmap[nb])
    ]
    jumps = np.asarray(jumps)
    det = detour[ratio_ok]
    a = asym[np.isfinite(asym)]

    r.doc["graph"] = {
        "ways_total": int(n_all),
        "ways_dropped_access_blocked": int(n_all - len(ways)),
        "access_blocked_values": sorted(ACCESS_BLOCKED),
        "nodes": int(g.n_nodes),
        "nodes_in_core_sccs": int(g.in_core.sum()),
        "n_core_components": g.n_core_components,
        "min_scc_nodes": roadgraph.MIN_SCC_NODES,
        "n_strongly_connected_components": int(g.n_scc),
        "directed_edges": int(len(g.src)),
        "stations_total": int(len(st)),
        "stations_snapped": int(ok.sum()),
        "station_source_nodes": int(len(snodes)),
        "snap_max_m": SNAP_MAX_M,
        "m_per_deg_lon": round(g.m_lon, 1),
    }
    r.stat(
        n_cells=int(len(df)),
        n_reachable=int(df.network_reachable.sum()),
        share_reachable=round(float(df.network_reachable.mean()), 4),
        dist_median_m=round(float(np.nanmedian(dist_m)), 1) if reachable.any() else None,
        dist_p90_m=round(float(np.nanpercentile(dist_m, 90)), 1) if reachable.any() else None,
        euclid_median_m=round(float(np.median(eu)), 1),
        detour_ratio_median=round(float(np.median(det)), 3) if len(det) else None,
        detour_ratio_p90=round(float(np.percentile(det, 90)), 3) if len(det) else None,
        cells_where_euclid_understates_gt_2x=int((det > 2).sum()) if len(det) else 0,
        detour_ratio_null_cells=int((~ratio_ok).sum()),
        asym_median_m=round(float(np.median(a)), 1) if len(a) else None,
        cells_asym_gt_500m=int((a > 500).sum()) if len(a) else 0,
        neighbor_jump_median_m=round(float(np.median(jumps)), 1) if len(jumps) else None,
        neighbor_pairs_jump_gt_2km_share=round(float((jumps > NEIGHBOR_JUMP_M).mean()), 4)
        if len(jumps)
        else None,
    )
    r.check(
        "network_ge_euclid",
        bool((det >= 0.999).all()) if len(det) else True,
        f"min tỉ số {float(det.min()):.3f} (đường mạng không thể ngắn hơn chim bay)"
        if len(det)
        else "không ô nào đo được tỉ số",
    )
    r.check("no_negative_distance", bool((df.dist_station_network_m.dropna() >= 0).all()), "")
    r.check(
        "no_time_field",
        not any("time" in c or "_min" in c for c in df.columns),
        "bộ dữ liệu không phát trường thời gian nào — chỉ mét",
    )
    r.check(
        "all_anchors_can_drive_on",
        bool(g.in_core[anchor].all()) and bool(g.in_core[snodes].all()) if len(snodes) else True,
        "mọi điểm neo (ô và trạm) nằm trong một SCC ≥ "
        f"{roadgraph.MIN_SCC_NODES} đỉnh — xe đi tiếp được, không phải đầu cụt",
    )
    r.check(
        "most_cells_reachable",
        float(df.network_reachable.mean()) > 0.95,
        f"{int(df.network_reachable.sum())}/{len(df)} = {df.network_reachable.mean():.1%}",
    )
    r.write(quiet=True)
    print(
        f"   đỉnh {g.n_nodes:,} (dùng được {int(g.in_core.sum()):,} trong {g.n_core_components} khối) · trạm neo "
        f"{int(ok.sum())}/{len(st)} · tới được {df.network_reachable.mean():.1%} · "
        f"trung vị {np.nanmedian(dist_m):,.0f} m"
        + (f" · đi vòng {np.median(det):.2f}×" if len(det) else "")
    )


def outputs(province_code: str) -> list:
    return [paths.PROV / province_code / "traveltime_cell.parquet"]


def upstream(province_code: str) -> list:
    d = paths.PROV / province_code
    return [d / "road_graph.parquet", d / "stations.parquet", d / "grid_cell.parquet"]


STEP = Step(
    name="n07_distance",
    scope="province",
    version=VERSION,
    run=run,
    outputs=outputs,
    province_sources=upstream,
    desc="khoảng cách theo mạng đường tới trạm gần nhất (Dijkstra), theo tỉnh",
)
