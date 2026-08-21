"""N4 — Khung lưới H3 r8 theo tỉnh, gắn nhãn xã, cộng cung và POI về ô.

Sinh (mỗi tỉnh):
  store/p/<code>/grid_cell.parquet          khung lưới: khoá ``h3_r8`` + nhãn xã + cung + POI
  store/p/<code>/grid_cell_commune.parquet  ma trận ô × xã (phần diện tích), cho cộng dồn theo xã
  store/p/<code>/poi_commune.parquet        POI theo xã — đầu vào của chỉ số độ phủ POI (N5)
  store/qa/<code>/n04_grid.json

Đây là KHUNG cộng với những gì ĐO ĐƯỢC TRỰC TIẾP trên hình học: nhãn địa giới, số đếm trạm,
số đếm POI, chiều dài đường, và phơi nhiễm POI quanh tâm ô. Các cột SUY RA từ mô hình —
``population`` (dasymetric, n05) · ``*_frac`` (lớp phủ, n06) · ``dist_station_*``
(Dijkstra, n07) · ``screen_decision`` (n08) — nằm ở bước riêng và được ghép ở ``n09_assemble``.

Ranh giới giữa hai loại không tuỳ tiện: thứ ở đây **đếm hoặc đo** một đối tượng có thật
trong dữ liệu nguồn; thứ ở các bước sau **suy ra** một giá trị cho một chỗ mà không ai đo.

Luật lưới giữ nguyên của ``hanoi.grid``: ô vào lưới nếu GIAO với đa giác tỉnh, mang
``area_frac`` là phần diện tích nằm trong tỉnh, và bị loại nếu ``area_frac`` dưới 1%
(hiện vật hình học, không phải ô biên). Một chỗ khác: tập ứng viên sinh từ đa giác tỉnh
đã **nới 1 km rồi đơn giản hoá ~200 m**. Nới nhiều hơn dung sai đơn giản hoá nên tập ứng
viên vẫn là tập CHA thật sự; nếu không làm vậy thì ``h3shape_to_cells`` phải nuốt đa giác
hợp từ hàng trăm xã và chi phí tăng theo số đỉnh chứ không theo diện tích.
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point
from shapely.prepared import prep
from shapely.strtree import STRtree

from evcs.core import geo
from evcs.core import grid as cgrid
from evcs.core.grid import RES, cell_polygon
from evcs.core.osm import POI_CLASSES, ROAD_CLASS

from . import admin, paths, qa
from .runner import Step

VERSION = "2"

ROAD_CLASSES = sorted(set(ROAD_CLASS.values()))

# Bán kính PHƠI NHIỄM quanh tâm ô. Chim bay, không phải mạng đường — kết quả ĐO ở
# DECISIONS §17: dưới 1,5 km chim bay dự báo `util` tốt hơn. POI không tác động như ĐIỂM
# ĐẾN người ta lái xe tới mà như CHỈ BÁO tính chất khu vực, thứ lan theo không gian.
POI_EXPOSURE_M = 1000.0


def run(province_code: str) -> None:
    r = qa.Report(
        "n04_grid",
        province_code,
        resolution=RES,
        province_name=admin.province_names()[province_code],
    )
    b = admin.boundary(province_code)
    cand = cgrid.candidates(b)
    frac = cgrid.area_fractions(cand, b)
    cells, sliver = cgrid.split_slivers(cand, frac)
    pos = {c: i for i, c in enumerate(cells)}
    # Đa giác ô dựng MỘT lần và dùng lại ở ba chỗ (nhãn xã, cắt đường, cắt ranh giới).
    # `cell_polygon` có cache nhưng cache đó khoá theo chuỗi ô, nên gọi lại vẫn tra bảng
    # băm hàng triệu lần ở tỉnh lớn.
    polys = [cell_polygon(c) for c in cells]

    cm, geoms = admin.communes(province_code)
    tree = STRtree(geoms)
    codes, names = cm.maxa.tolist(), cm.tenxa.tolist()

    rows, pairs = [], []
    for c, poly in zip(cells, polys):
        lat, lng = h3.cell_to_latlng(c)
        best, total = (None, None, 0.0), 0.0
        for i in tree.query(poly):
            inter = poly.intersection(geoms[int(i)]).area
            if inter <= 0:
                continue
            f = inter / poly.area
            total += f
            pairs.append({"h3_r8": c, "commune_code": codes[int(i)], "area_frac": f})
            if f > best[2]:
                best = (codes[int(i)], names[int(i)], f)
        rows.append(
            {
                "h3_r8": c,
                "lat": lat,
                "lng": lng,
                "area_km2": h3.cell_area(c, unit="km^2"),
                "area_frac": frac[c],
                "cell_state": cgrid.cell_state(frac[c]),
                "commune_code": best[0],
                "commune_name": best[1],
                "commune_area_frac": best[2],
            }
        )

    df = pd.DataFrame(rows).sort_values("h3_r8").reset_index(drop=True)
    df["province_code"] = province_code
    pdir = paths.province_dir(province_code)

    # --- cung theo ô ------------------------------------------------------
    st = pq.read_table(
        pdir / "stations.parquet",
        columns=["station_id", "lat", "lng", "n_ports", "power_kw_site", "op_status", "scope"],
    ).to_pandas()
    st = st[st.scope == "IN"].copy()
    st["h3_r8"] = [h3.latlng_to_cell(la, ln, RES) for la, ln in zip(st.lat, st.lng)]
    g = st.groupby("h3_r8").agg(
        n_stations=("station_id", "count"),
        n_ports=("n_ports", "sum"),
        power_kw_site=("power_kw_site", "sum"),
    )
    go = st[st.op_status == "OPERATIONAL"].groupby("h3_r8").station_id.count()
    df["n_stations"] = df.h3_r8.map(g.n_stations).fillna(0).astype("int64")
    df["n_stations_operational"] = df.h3_r8.map(go).fillna(0).astype("int64")
    df["n_ports"] = df.h3_r8.map(g.n_ports).fillna(0).astype("int64")
    df["power_kw_site"] = df.h3_r8.map(g.power_kw_site).fillna(0.0)
    n_st_off_grid = int((~st.h3_r8.isin(pos)).sum())

    # --- POI theo ô và theo xã -------------------------------------------
    poi = pq.read_table(
        pdir / "poi_demand.parquet", columns=["osm_id", "poi_class", "lat", "lng", "levels"]
    ).to_pandas()
    if len(poi):
        poi["h3_r8"] = [h3.latlng_to_cell(la, ln, RES) for la, ln in zip(poi.lat, poi.lng)]
        q = tree.query(
            [Point(x, y) for x, y in zip(poi.lng, poi.lat)],
            predicate="within",
        )
        idx = np.full(len(poi), -1, dtype=np.int64)
        idx[q[0]] = q[1]
        poi["commune_code"] = [codes[i] if i >= 0 else None for i in idx]
    else:
        poi["h3_r8"] = pd.Series(dtype="object")
        poi["commune_code"] = pd.Series(dtype="object")

    wide = (
        poi.pivot_table(index="h3_r8", columns="poi_class", values="osm_id", aggfunc="count")
        .reindex(columns=POI_CLASSES)
        .fillna(0)
        .astype("int64")
        if len(poi)
        else pd.DataFrame(columns=POI_CLASSES)
    )
    for k in POI_CLASSES:
        col = f"n_{k.lower()}"
        df[col] = df.h3_r8.map(wide[k]) if len(wide) else 0
        df[col] = df[col].fillna(0).astype("int64")
    df["n_poi_total"] = df[[f"n_{k.lower()}" for k in POI_CLASSES]].sum(axis=1)

    # --- đường theo ô ----------------------------------------------------
    # Đo trên hình học NGUYÊN của `road_graph.parquet`, không trên bản hiển thị đã đơn giản
    # hoá ~10 m: đơn giản hoá cắt góc, và cắt góc thì tổng chiều dài NGẮN đi một cách có hệ
    # thống. Sai số đó nhỏ ở một đoạn nhưng cộng dồn trên 3,4 triệu đoạn thì không còn nhỏ.
    rg = pq.read_table(paths.cache_dir(province_code) / "road_graph.parquet", columns=["road_class", "coords"]).to_pandas()
    m_lat, m_lon = admin.scale_for(province_code)
    road_m = np.zeros((len(cells), len(ROAD_CLASSES)))
    road_in = np.zeros(len(cells))
    ci = {c: i for i, c in enumerate(ROAD_CLASSES)}
    ctree = STRtree(polys)
    pb = prep(b)
    clipped = [q if pb.contains(q) else q.intersection(b) for q in polys]

    # Hệ số mét/độ CHUNG cho cả tỉnh, không tính lại theo từng đoạn: chiều dài phải cộng
    # lại được, và một hệ số chạy theo vị trí làm tổng phụ thuộc thứ tự cộng.
    def _len_m(geom) -> float:
        return geo.length_m(geom, m_lat, m_lon)

    for rc, flat in zip(rg.road_class, rg.coords):
        arr = np.asarray(flat, dtype=np.float64)
        if arr.size < 4:
            continue
        line = LineString(arr.reshape(-1, 2))
        jj = ci[rc]
        for i in ctree.query(line):
            i = int(i)
            seg = line.intersection(polys[i])
            if seg.is_empty:
                continue
            road_m[i, jj] += _len_m(seg)
            cp = clipped[i]
            if not cp.is_empty:
                sin = line.intersection(cp)
                if not sin.is_empty:
                    road_in[i] += _len_m(sin)

    for c_, jj in ci.items():
        df[f"road_len_{c_.lower()}_m"] = road_m[:, jj]
    df["road_len_m"] = road_m.sum(axis=1)
    df["road_len_arterial_m"] = road_m[
        :, [ci[k] for k in ("MOTORWAY", "TRUNK", "PRIMARY", "SECONDARY")]
    ].sum(axis=1)
    # Bản CẮT THEO RANH GIỚI — cột kiểm chứng, không phải cột thay thế: nó trả lời "ô này
    # mang bao nhiêu đường KHÔNG thuộc tỉnh". Đừng chia nó cho `road_len_m` ở mức ô.
    df["road_len_in_province_m"] = road_in

    # --- phơi nhiễm POI quanh tâm ô --------------------------------------
    if len(poi):
        ptree = cKDTree(np.c_[poi.lng.to_numpy() * m_lon, poi.lat.to_numpy() * m_lat])
        df["n_poi_1km"] = [
            len(k)
            for k in ptree.query_ball_point(
                np.c_[df.lng.to_numpy() * m_lon, df.lat.to_numpy() * m_lat], POI_EXPOSURE_M
            )
        ]
        ap = poi[poi.poi_class == "APARTMENT"].groupby("h3_r8").levels.sum()
        df["apartment_levels_sum"] = df.h3_r8.map(ap).fillna(0.0)
    else:
        df["n_poi_1km"] = 0
        df["apartment_levels_sum"] = 0.0

    front = [
        "h3_r8",
        "province_code",
        "lat",
        "lng",
        "area_km2",
        "area_frac",
        "cell_state",
        "commune_code",
        "commune_name",
        "commune_area_frac",
    ]
    df = df[front + [c for c in df.columns if c not in front]]
    for c in ("h3_r8", "province_code", "commune_code", "commune_name", "cell_state"):
        df[c] = df[c].astype("string")
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), pdir / "grid_cell.parquet")

    pdf = pd.DataFrame(pairs, columns=["h3_r8", "commune_code", "area_frac"])
    pdf = pdf.sort_values(["h3_r8", "area_frac"], ascending=[True, False])
    for c in ("h3_r8", "commune_code"):
        pdf[c] = pdf[c].astype("string")
    pq.write_table(
        pa.Table.from_pandas(pdf, preserve_index=False), pdir / "grid_cell_commune.parquet"
    )

    # POI theo xã — MỌI xã của tỉnh có mặt, kể cả xã 0 POI. Xã vắng mặt và xã có 0 POI là
    # hai chuyện khác nhau, và chính xã 0 POI mới là số đo của chỉ số độ phủ ở N5.
    pc = pd.DataFrame({"commune_code": pd.Series(codes, dtype="string")})
    pc["province_code"] = province_code
    for k in POI_CLASSES:
        s = (
            poi[poi.poi_class == k].groupby("commune_code").size()
            if len(poi)
            else pd.Series(dtype="int64")
        )
        pc[f"n_{k.lower()}"] = pc.commune_code.map(s).fillna(0).astype("int64")
    pc["n_poi_total"] = pc[[f"n_{k.lower()}" for k in POI_CLASSES]].sum(axis=1)
    pq.write_table(pa.Table.from_pandas(pc, preserve_index=False), pdir / "poi_commune.parquet")

    # --- QA ---------------------------------------------------------------
    covered = float((df.area_km2 * df.area_frac).sum())
    b_km2 = admin.area_km2(b)
    m = pdf.groupby("h3_r8").area_frac.sum().reindex(df.h3_r8).fillna(0).to_numpy()
    r.stat(
        n_cells=int(len(df)),
        n_inside=int((df.cell_state == "INSIDE").sum()),
        n_border=int((df.cell_state == "BORDER").sum()),
        n_sliver_excluded=len(sliver),
        grid_area_km2_weighted=round(covered, 2),
        boundary_area_km2=round(b_km2, 2),
        cells_with_supply=int((df.n_stations > 0).sum()),
        cells_with_poi=int((df.n_poi_total > 0).sum()),
        share_cells_with_zero_poi=round(float((df.n_poi_total == 0).mean()), 4),
        n_poi_assigned=int(len(poi)),
        road_len_total_km=round(float(df.road_len_m.sum()) / 1000, 1),
        road_len_arterial_km=round(float(df.road_len_arterial_m.sum()) / 1000, 1),
        road_len_in_province_km=round(float(df.road_len_in_province_m.sum()) / 1000, 1),
        road_outside_boundary_share=round(
            float(1 - df.road_len_in_province_m.sum() / max(df.road_len_m.sum(), 1)), 4
        ),
        share_cells_with_road=round(float((df.road_len_m > 0).mean()), 4),
        n_poi_1km_median=int(df.n_poi_1km.median()),
        n_poi_without_commune=int(poi.commune_code.isna().sum()) if len(poi) else 0,
        communes_with_zero_poi=int((pc.n_poi_total == 0).sum()),
        n_communes=int(len(pc)),
    )
    r.check("h3_unique", bool(df.h3_r8.is_unique), f"{len(df)} ô")
    r.check(
        "every_cell_has_commune",
        bool(df.commune_code.notna().all()),
        f"{int(df.commune_code.isna().sum())} thiếu",
    )
    r.check(
        "grid_area_matches_boundary_lt_1pct",
        abs(covered - b_km2) / b_km2 < 0.01,
        f"lưới {covered:,.1f} km² vs đa giác {b_km2:,.1f} km² "
        f"(lệch {abs(covered - b_km2) / b_km2:.2%})",
    )
    r.check(
        "commune_frac_sums_to_province_frac",
        bool((np.abs(m - df.area_frac.to_numpy()) < 1e-6).all()),
        f"max lệch {float(np.abs(m - df.area_frac.to_numpy()).max()):.2e}",
    )
    r.check(
        "clipped_road_le_full_cell",
        bool((df.road_len_in_province_m <= df.road_len_m + 1e-6).all()),
        f"phần ngoài ranh giới {1 - df.road_len_in_province_m.sum() / max(df.road_len_m.sum(), 1):.2%}"
        " tổng chiều dài",
    )
    r.check(
        "every_station_cell_in_grid",
        n_st_off_grid == 0,
        f"{n_st_off_grid} trạm thuộc tỉnh rơi ra ngoài lưới báo cáo",
    )
    r.write(quiet=True)
    print(
        f"   ô {len(df):,} ({int((df.cell_state == 'BORDER').sum()):,} biên, "
        f"{len(sliver)} vụn loại) · {covered:,.0f} km² · đường "
        f"{df.road_len_m.sum() / 1000:,.0f} km · ô có POI {(df.n_poi_total > 0).mean():.1%} · "
        f"xã 0 POI {int((pc.n_poi_total == 0).sum())}/{len(pc)}"
    )


STEP = Step(
    name="n04_grid",
    scope="province",
    version=VERSION,
    run=run,
    reads=(
        "src_vnsdi",
        "stations",
        "poi_demand",
        "road_graph",
    ),
    writes=(
        "grid_cell",
        "grid_cell_commune",
        "poi_commune",
    ),
    desc="khung lưới H3 r8 + nhãn xã + cung/POI theo ô, theo tỉnh",
)
