"""M3-R — export lớp mạng đường cho web. Xem web/DESIGN.md §5a và khối M3 trong §11.

Hai sản phẩm:

  roads.parquet            mạng đường (LOCAL trở lên, bỏ SERVICE) với nhãn
                           ``dist_station_m`` theo ĐOẠN — khoảng cách theo mạng từ
                           đoạn đường tới trạm gần nhất, chiều đi sạc. Đây là nhãn
                           mà Dijkstra của s08 vẫn tính trên TỪNG ĐỈNH rồi ném đi
                           (cùng loại lỗi §13e đã bắt với ``detour_ratio``).
  routes_showcase.geojson  2–3 cặp đường minh hoạ cho cảnh C: polyline đường đi
                           THẬT (dựng lại từ cây Dijkstra) ↔ đoạn chim bay, cho các
                           ô có ``detour_ratio`` cao.

Đồ thị lấy từ ``roadnet`` — ĐÚNG đồ thị của s08 (cùng bộ lọc access, cùng luật một
chiều, cùng neo SCC lớn), không phải một bản dựng lại.

Ba quyết định phát hành (lý do ở DESIGN):
  · bỏ SERVICE khi SHIP (79k đoạn lối nội bộ — không chở luận điểm nào), nhưng đồ thị
    TÍNH trên toàn mạng: xe vẫn đi qua ngõ service, chỉ là ta không vẽ chúng.
  · đơn giản hoá hình học ~10 m — mắt không thấy khác ở zoom thành phố, payload giảm.
  · toạ độ giải mã sẵn (list<float32> lng,lat xen kẽ), KHÔNG WKB — web không có
    parser WKB và sẽ không thêm (DESIGN §5b).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from . import grid, paths, roadnet

# ~0,0001° ≈ 11 m theo vĩ, 9,5 m theo kinh — khớp "đơn giản hoá ~10 m" đã chốt.
SIMPLIFY_TOLERANCE_DEG = 0.0001
COORD_DECIMALS = 5  # ~1,1 m — dưới sai số của chính OSM
SHIP_EXCLUDE_CLASS = {"SERVICE"}

# Luật chọn ô minh hoạ — cố định để export tái lập được, không phải cherry-pick tay:
# trong các ô có tỉ số đi vòng ĐO ĐƯỢC và đủ xa để tỉ số không phải chuyện ngõ ngách
# (euclid ≥ 1 km), lấy MỖI BẬC DÂN SỐ một ô tỉ số cao nhất. Một ngưỡng đơn không kể
# được cảnh: pop ≥ 1k cho tỉ số cực đoan nhưng toàn vành ngoài (Sóc Sơn 6,97×), còn
# pop ≥ 10k cho nội đô nhưng mất ô cực đoan. Ba bậc cho cảnh C nói trọn một câu:
# "tỉ số cực đoan ở rìa là 7×, ở thị trấn là 4×, và ngay nội đô nó vẫn là 2×".
SHOWCASE_POP_TIERS = (1_000.0, 5_000.0, 10_000.0)
SHOWCASE_MIN_EUCLID_M = 1_000.0


def _way_distances(g: roadnet.RoadGraph, d_to_node: np.ndarray) -> list[float]:
    """Nhãn khoảng cách cho từng dòng roads: MIN trên các đỉnh của đoạn.

    MIN chứ không phải trung bình: giá trị đại diện là "từ đoạn đường này, lối vào
    gần nhất tới mạng lưới trạm". Đoạn trung bình dài ~130 m nên lựa chọn này không
    tạo cấu trúc nhìn thấy được.
    """
    out = []
    for nodes in g.way_nodes:
        if nodes is None:
            out.append(np.nan)
            continue
        d = d_to_node[nodes]
        d = d[np.isfinite(d)]
        out.append(float(d.min()) if len(d) else np.nan)
    return out


def _simplified_coords(gwkb: bytes):
    """WKB → mảng float32 [lng, lat, lng, lat, …] đã đơn giản hoá và làm tròn."""
    from shapely import wkb as shwkb

    line = shwkb.loads(bytes(gwkb)).simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=False)
    arr = np.asarray(line.coords, dtype=np.float64).round(COORD_DECIMALS)
    return len(arr), arr.ravel().astype(np.float32)


def _reconstruct_path(pred: np.ndarray, anchor: int, n_super: int) -> list[int]:
    """Đường đi thật từ ``anchor`` tới đỉnh-trạm, đọc ngược cây Dijkstra đa nguồn.

    Dijkstra chạy trên đồ thị NGƯỢC từ siêu-nguồn, nên chuỗi predecessor
    anchor → … → đỉnh-trạm chính là đường lái xe THEO ĐÚNG CHIỀU đi sạc.
    """
    chain, v = [], anchor
    while v != n_super and v >= 0:
        chain.append(int(v))
        v = int(pred[v])
    return chain  # phần tử cuối là đỉnh trạm đã neo


def export(web_data: Path) -> dict:
    roads, n_all = roadnet.load_roads(extra_columns=("bridge",))
    g = roadnet.build_graph(roads)
    st = roadnet.load_stations().reset_index(drop=True)
    station_nodes, station_off_m, ok, sx, sy = roadnet.snap_stations(g, st)
    d_to_node, pred = roadnet.multisource(
        g, station_nodes, station_off_m, reverse=True, return_predecessors=True
    )

    # --- roads.parquet ------------------------------------------------------
    dist = _way_distances(g, d_to_node)
    n_invalid = sum(1 for w in g.way_nodes if w is None)

    rows = {"osm_id": [], "road_class": [], "bridge": [], "dist_station_m": [], "coords": []}
    pts_before = pts_after = 0
    for i, (rc, br, gwkb, wn, dm) in enumerate(
        zip(roads.road_class, roads.bridge, roads.geometry_wkb, g.way_nodes, dist)
    ):
        if wn is None or rc in SHIP_EXCLUDE_CLASS:
            continue
        n_pts, flat = _simplified_coords(gwkb)
        pts_before += len(wn)
        pts_after += n_pts
        rows["osm_id"].append(int(roads.osm_id.iloc[i]))
        rows["road_class"].append(rc)
        rows["bridge"].append(bool(br))
        rows["dist_station_m"].append(round(dm) if np.isfinite(dm) else None)
        rows["coords"].append(flat)

    order = np.argsort(np.asarray(rows["road_class"], dtype=object), kind="stable")
    table = pa.table(
        {
            "osm_id": pa.array(np.asarray(rows["osm_id"], dtype=np.int64)[order]),
            "road_class": pa.array([rows["road_class"][i] for i in order], type=pa.string()),
            "bridge": pa.array([rows["bridge"][i] for i in order], type=pa.bool_()),
            "dist_station_m": pa.array(
                [rows["dist_station_m"][i] for i in order], type=pa.float32()
            ),
            "coords": pa.array([rows["coords"][i] for i in order], type=pa.list_(pa.float32())),
        }
    )
    dst = web_data / "roads.parquet"
    pq.write_table(table, dst, compression="zstd")
    n_unreachable = sum(1 for i in order if rows["dist_station_m"][i] is None)

    # --- routes_showcase.geojson -------------------------------------------
    # Đỉnh → trạm gần nhất neo tại đỉnh đó (để kết thúc polyline ở TRẠM, không ở đỉnh).
    sd_all, si_all = g.tree.query(np.c_[sx, sy])
    node_station: dict[int, int] = {}
    for s_i in np.flatnonzero(ok):
        nd = int(g.gidx[si_all[s_i]])
        if nd not in node_station or sd_all[s_i] < sd_all[node_station[nd]]:
            node_station[nd] = int(s_i)

    gdf = pq.read_table(
        paths.PROCESSED / "grid_h3_r8.parquet",
        columns=[
            "h3_r8",
            "detour_ratio",
            "population",
            "dist_station_network_m",
            "dist_station_euclid_m",
            "commune_name",
        ],
    ).to_pandas()
    cand = gdf[
        gdf.detour_ratio.notna() & (gdf.dist_station_euclid_m >= SHOWCASE_MIN_EUCLID_M)
    ].sort_values("detour_ratio", ascending=False)
    picked_rows = []
    for min_pop in SHOWCASE_POP_TIERS:
        tier = cand[cand.population >= min_pop]
        tier = tier[~tier.h3_r8.isin([r.h3_r8 for r in picked_rows])]
        if len(tier):
            picked_rows.append(tier.iloc[0])
    picked = gdf.loc[[r.name for r in picked_rows]]

    stree = cKDTree(np.c_[sx, sy])
    features = []
    for row in picked.itertuples():
        clat, clng = grid.centroid(row.h3_r8)
        cx, cy = roadnet.xy(np.array([clng]), np.array([clat]))
        _, ci = g.tree.query(np.c_[cx, cy])
        anchor = int(g.gidx[ci[0]])
        chain = _reconstruct_path(pred, anchor, g.n_nodes)
        s_i = node_station.get(chain[-1]) if chain else None
        net_coords = [[round(float(clng), COORD_DECIMALS), round(float(clat), COORD_DECIMALS)]]
        net_coords += [
            [round(float(g.lon[v]), COORD_DECIMALS), round(float(g.lat[v]), COORD_DECIMALS)]
            for v in chain
        ]
        if s_i is not None:
            net_coords.append(
                [
                    round(float(st.lng.iloc[s_i]), COORD_DECIMALS),
                    round(float(st.lat.iloc[s_i]), COORD_DECIMALS),
                ]
            )
        _, e_i = stree.query(np.c_[cx, cy])
        e_i = int(e_i[0])
        props = {
            "h3_r8": row.h3_r8,
            "detour_ratio": round(float(row.detour_ratio), 2),
            "dist_station_network_m": round(float(row.dist_station_network_m)),
            "dist_station_euclid_m": round(float(row.dist_station_euclid_m)),
            "population": round(float(row.population)),
            "commune_name": row.commune_name,
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": net_coords},
                "properties": {
                    **props,
                    "kind": "network",
                    "station_name": None if s_i is None else str(st.name.iloc[s_i]),
                },
            }
        )
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        net_coords[0],
                        [
                            round(float(st.lng.iloc[e_i]), COORD_DECIMALS),
                            round(float(st.lat.iloc[e_i]), COORD_DECIMALS),
                        ],
                    ],
                },
                "properties": {**props, "kind": "euclid", "station_name": str(st.name.iloc[e_i])},
            }
        )

    routes = {"type": "FeatureCollection", "features": features}
    rdst = web_data / "routes_showcase.geojson"
    rdst.write_text(json.dumps(routes, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    meta = {
        "ways_total_raw": int(n_all),
        "ways_shipped": int(len(order)),
        "ways_dropped_service": int((roads.road_class.isin(SHIP_EXCLUDE_CLASS)).sum()),
        "ways_dropped_invalid_geometry": int(n_invalid),
        "ways_unreachable_null_dist": int(n_unreachable),
        "points_before_simplify": int(pts_before),
        "points_after_simplify": int(pts_after),
        "simplify_tolerance_deg": SIMPLIFY_TOLERANCE_DEG,
        "bridge_ways_shipped": int(sum(1 for i in order if rows["bridge"][i])),
        "showcase_rule": (
            f"detour_ratio đo được ∧ euclid ≥ {SHOWCASE_MIN_EUCLID_M:.0f} m → "
            f"mỗi bậc dân số {[int(t) for t in SHOWCASE_POP_TIERS]} một ô tỉ số cao nhất"
        ),
        "showcase_cells": [str(h) for h in picked.h3_r8],
    }
    files = {
        "roads.parquet": {"bytes": dst.stat().st_size, "rows": int(table.num_rows)},
        "routes_showcase.geojson": {"bytes": rdst.stat().st_size, "rows": len(features)},
    }
    print(
        f"  {'roads.parquet':44s} {dst.stat().st_size / 1e6:6.2f} MB  {table.num_rows:,} đoạn"
        f"  (bỏ SERVICE {meta['ways_dropped_service']:,} · null dist {n_unreachable:,})"
    )
    print(
        f"  {'routes_showcase.geojson':44s} {rdst.stat().st_size / 1e6:6.2f} MB  "
        f"{len(picked)} ô × 2 tuyến"
    )
    return {"files": files, "meta": meta}
