"""N10 — Bảng thống kê theo tỉnh, chỉ số độ phủ POI, cờ chất lượng, danh sách loại trừ.

Sinh:
  store/qa/provinces.parquet   một dòng một tỉnh — số trạm, công suất, tỉ lệ 1-súng-AC,
                               độ phủ POI, cờ chất lượng
  store/qa/exclusions.json     tỉnh ĐỀ NGHỊ loại khỏi phân tích, kèm lý do đo được
  store/qa/n10_quality.json

── VÌ SAO KHÔNG CÓ HẰNG SỐ TOÀN QUỐC NÀO Ở ĐÂY ────────────────────────────────────────

Mọi con số dẫn xuất được tính LẠI TỪ ĐẦU cho từng tỉnh, từ chính phân mảnh của tỉnh đó.
Không con số nào của Hà Nội được nâng lên thành hằng số: đo trên 34 tỉnh, tỉ lệ trạm bị
loại vì là điểm sạc cá nhân trải từ 48,6% tới 78,7% số trạm và từ 4,3% tới 15,9% công
suất. Một hằng số 71,8% sẽ sai tới 30 điểm phần trăm ở đầu kia của phân phối.

── POI: CHỈ SỐ ĐỘ PHỦ, KHÔNG PHẢI CƠ CẤU ──────────────────────────────────────────────

DECISIONS §17 đã kết luận trên Hà Nội: POI có khuyết ĐÃ CHỨNG MINH và thiên lệch KHÁC
NHAU GIỮA CÁC LỚP, nên nó dùng được như CHỈ BÁO có/không, KHÔNG dùng làm thước đo mật độ
và KHÔNG được vào bất kỳ rule loại trừ nào. Ở toàn quốc điều đó chỉ nặng thêm. Bước này vì
thế phát ba số cho mỗi tỉnh để biết CHỖ NÀO KHÔNG ĐƯỢC DIỄN GIẢI:

  share_communes_zero_poi     phần xã/phường không có một POI nào trong OSM
  pop_share_communes_zero_poi phần DÂN sống trong những xã đó — con số quan trọng hơn
  poi_bias_phuong_vs_xa       POI/km² ở Phường chia cho POI/km² ở Xã, trên diện tích TỔNG.

``poi_bias_phuong_vs_xa`` KHÔNG so sánh được với con số "14×" của DECISIONS §17: §17 chia
cho diện tích ĐÃ XÂY (lớp phủ WorldCover), còn ở đây mẫu số là diện tích tổng vì lớp phủ
thuộc phần TÍNH TOÁN, ngoài phạm vi lần này. Cùng chiều, khác thước — đo trên Hà Nội, thước
ở đây cho 41×. Nó vì thế đọc được như "tỉnh nào lệch nặng hơn tỉnh nào", KHÔNG đọc được
như một hệ số hiệu chỉnh.

Cờ ``POI_KHONG_DIEN_GIAI_DUOC`` KHÔNG loại tỉnh khỏi bộ dữ liệu. Nó cấm đọc lớp POI của
tỉnh đó như một thước đo — đúng luật §17, không hơn.
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from . import admin, paths, qa
from .runner import Step

VERSION = "5"

# --- ngưỡng loại trừ ------------------------------------------------------
# Đặt ở đây, có tên, có lý do — không nằm rải rác trong điều kiện if.
MIN_STATIONS = 30  # dưới mức này không nói được gì ở cấp xã: một tỉnh 100+ xã mà 20 trạm
#                    thì mọi bản đồ theo xã là một mảng trắng có vài chấm
MIN_OCC_MEASURED_SHARE = 0.50  # dưới một nửa số trạm đo được `util` thì lớp sử dụng là suy đoán
POI_ZERO_COMMUNE_MAX = 0.50  # quá nửa số xã không có POI nào ⇒ lớp POI không đọc được
# Ngưỡng đo theo DÂN, không theo Ô — và đây là một cờ đã phải sửa sau khi đo.
#
# Bản đầu đặt "dưới 90% Ô tới được thì gắn cờ", và nó bắn ở 23/34 tỉnh. Truy ra thì nó
# không đo mạng đường: 8.558 ô không tới được của Khánh Hoà là **Đặc khu Trường Sa**, của
# Đà Nẵng là **Hoàng Sa** — biển và rạn, không có đường nào để mà thiếu. Cờ đó thực chất đo
# "bao nhiêu phần đa giác tỉnh là biển và núi".
#
# Tính theo DÂN thì cùng dữ liệu cho ra 0,1–0,9% ở mọi tỉnh, tức lớp khoảng cách LÀNH. Một ô
# không người mà không tới được thì không ai bị ảnh hưởng; một ô 400 người thì có.
# `share_cells_reachable` vẫn phát ra như BỐI CẢNH, nhưng nó không còn quyết định cờ nào.
MAX_POP_UNREACHABLE = 0.02
SECONDARY_MATCH_M = 100.0  # bán kính coi hai bản ghi là cùng một trạm vật lý

# Quy đổi mét ở vĩ độ trung bình Việt Nam — CHỈ dùng cho phép đối chiếu nguồn phụ, nơi sai
# số vài phần trăm trên bán kính 100 m không đổi kết luận nào.
_M_LAT = 110_574.0
_M_LON = 107_000.0


def _flagset(v) -> set[str]:
    """Cờ của một dòng thành tập. ``NaN`` là vắng cờ, không phải chuỗi rỗng — pandas trả về
    ``float('nan')`` cho ô trống của cột chuỗi, và ``nan or ""`` cho ra ``nan`` chứ không
    cho ra ``""`` vì ``nan`` là truthy. Đây là bẫy im lặng, nên nó có một hàm riêng."""
    return (
        set()
        if v is None or (isinstance(v, float) and pd.isna(v))
        else set(str(v).split("|")) - {""}
    )


def _national_pool() -> set[str]:
    """``station_id`` của toàn quốc sau đúng hai bộ lọc mà n03 áp trước khi chia tỉnh.

    Dùng làm MẪU SỐ cho phép kiểm phân mảnh. Dựng lại ở đây thay vì đọc lại từ n03 là có
    chủ ý: nếu hai đường cùng đọc một con số thì phép kiểm chỉ chứng minh phép cộng, không
    chứng minh phân mảnh.
    """
    import pyarrow.dataset as pads

    t = (
        pads.dataset(paths.SRC_CANON_STATIONS, format="parquet", partitioning="hive")
        .to_table(
            columns=[
                "station_id",
                "is_primary",
                "coord_resolved",
                "n_guns_installed",
                "current_type_asset",
            ]
        )
        .to_pandas()
    )
    t = t[t.is_primary & t.coord_resolved]
    priv = (t.n_guns_installed == 1) & (t.current_type_asset == "AC")
    return set(t.loc[~priv, "station_id"])


def _read(code: str, name: str, **kw) -> pd.DataFrame:
    p = paths.PROV / code / name
    if not p.exists():
        return pd.DataFrame()
    return pq.read_table(p, **kw).to_pandas()


def _secondary_gap() -> dict[str, dict]:
    """Trạm có ở nguồn PHỤ (evcs-dataset) mà không có ở nguồn chính, theo tỉnh.

    KHÔNG gộp hai nguồn — xem paths.SRC_SECONDARY_STATIONS. Đây là một PHÉP ĐO độ phủ nhà
    vận hành: nguồn chính gần như chỉ có VinFast, nguồn phụ có thêm 8 nhà khác. Con số này
    trả lời "bản đồ tỉnh này thiếu bao nhiêu trạm của nhà vận hành khác", và nó thuộc về
    cờ chất lượng chứ không thuộc về bảng cung.
    """
    if not paths.SRC_SECONDARY_STATIONS.exists():
        return {}
    sec = pq.read_table(
        paths.SRC_SECONDARY_STATIONS,
        columns=["station_id", "lat", "lng", "admin_l1_code", "operator"],
    ).to_pandas()
    sec = sec[sec.lat.notna() & sec.lng.notna()]

    prim = []
    for c in admin.province_codes():
        d = _read(c, "stations.parquet", columns=["lat", "lng", "scope"])
        if len(d):
            prim.append(d[d.scope == "IN"][["lat", "lng"]])
    if not prim:
        return {}
    p = pd.concat(prim, ignore_index=True)
    tree = cKDTree(np.c_[p.lng * _M_LON, p.lat * _M_LAT])
    dist, _ = tree.query(np.c_[sec.lng * _M_LON, sec.lat * _M_LAT])
    sec["unmatched"] = dist > SECONDARY_MATCH_M

    out = {}
    for code, g in sec.groupby("admin_l1_code"):
        u = g[g.unmatched]
        out[str(code)] = {
            "n_secondary": int(len(g)),
            "n_only_in_secondary": int(len(u)),
            "share_only_in_secondary": round(float(len(u) / max(len(g), 1)), 4),
            "operators_missing": {
                str(k): int(v) for k, v in u.operator.value_counts().head(6).items()
            },
        }
    return out


def _write_markdown(df: pd.DataFrame) -> None:
    """Bảng theo tỉnh ở dạng ĐỌC ĐƯỢC BẰNG MẮT, cạnh bản parquet.

    Parquet là để máy đọc; một bảng 34 dòng mà phải mở notebook mới xem được thì trên thực
    tế không ai xem. Đây là cùng lý do bước này sinh ``BAO_CAO_TINH.md`` bên cạnh các
    file JSON.
    """

    def n(x, nd=0):
        return "—" if pd.isna(x) else f"{x:,.{nd}f}".replace(",", ".")

    def pctv(x):
        return "—" if pd.isna(x) else f"{100 * x:.1f}%"

    hdr = [
        "mã", "tỉnh", "dân số", "trạm", "cổng", "MW", "1AC %trạm", "1AC %kW",
        "cổng/10k", "%đo được", "tới trạm TV", "%dân >2km", "built", "POI",
        "%xã 0POI", "neo VNSDI", "%ô tới được", "%dân kẹt", "cờ",
    ]
    rows = []
    for x in df.sort_values("n_stations", ascending=False).itertuples():
        rows.append([
            x.province_code,
            x.province_name.replace("Thành phố ", "TP ").replace("Tỉnh ", ""),
            n(x.population),
            n(x.n_stations),
            n(x.n_ports),
            n(x.power_kw_site / 1000, 1),
            pctv(x.private_ac_share_stations),
            pctv(x.private_ac_share_power),
            n(x.ports_per_10k_pop, 2),
            pctv(x.share_stations_measured),
            n(x.dist_station_network_median_m),
            pctv(x.share_pop_beyond_2km),
            pctv(x.built_frac_mean),
            n(x.n_poi_demand),
            pctv(x.share_communes_zero_poi),
            n(x.vnsdi_anchor_ratio, 2),
            pctv(x.share_cells_reachable),
            pctv(x.share_pop_unreachable),
            (x.quality_flags if isinstance(x.quality_flags, str) else "").replace("|", ", ") or "—",
        ])
    w = [max(len(str(r[i])) for r in [hdr] + rows) for i in range(len(hdr))]
    line = lambda r: "| " + " | ".join(str(v).ljust(w[i]) for i, v in enumerate(r)) + " |"  # noqa: E731
    body = [line(hdr), "|" + "|".join("-" * (w[i] + 2) for i in range(len(hdr))) + "|"]
    body += [line(r) for r in rows]

    doc = [
        "# Bảng thống kê theo tỉnh",
        "",
        f"Sinh tự động bởi `vn/n10_quality.py` — {len(df)} tỉnh có trong store.",
        "Mọi con số tính LẠI TỪ ĐẦU cho từng tỉnh; không hằng số toàn quốc nào.",
        "",
        "| cột | nghĩa |",
        "|---|---|",
        "| `1AC %trạm` / `1AC %kW` | phần bị loại vì là điểm sạc cá nhân (1 súng AC) |",
        "| `%đo được` | phần trạm có `util` đọc được — dưới 50% thì lớp mức sử dụng bị TẮT |",
        "| `tới trạm TV` | trung vị khoảng cách theo MẠNG ĐƯỜNG từ ô tới trạm gần nhất (m) |",
        "| `%dân >2km` | phần dân ở ô xa hơn 2 km theo đường |",
        "| `%xã 0POI` | phần xã không có MỘT POI nào trong OSM — chỗ KHÔNG được diễn giải |",
        "| `neo VNSDI` | `danso` công bố chia bề mặt WorldPop. >1 = số công bố cao hơn |",
        "| `%ô tới được` | phần Ô tới được trạm bằng đường bộ. **Bối cảnh, không phải cờ** — thấp = biển/đảo/núi trong đa giác tỉnh (Trường Sa chiếm 8.558 ô của Khánh Hoà) |",
        "| `%dân kẹt` | phần DÂN ở ô không tới được. Đây mới là con số nói lớp khoảng cách có lành hay không |",
        "",
        *body,
        "",
        "## Cờ chất lượng",
        "",
        "| cờ | nghĩa |",
        "|---|---|",
        "| `KHONG_CO_TRAM` / `QUA_IT_TRAM` | dưới ngưỡng số trạm — không nói được gì ở cấp xã |",
        "| `KHONG_DO_DUOC_SU_DUNG` | dưới nửa số trạm đo được `util` ⇒ lớp mức sử dụng TẮT ở tỉnh đó |",
        "| `POI_KHONG_DIEN_GIAI_DUOC` | quá nửa số xã không có POI — **không** loại tỉnh, chỉ cấm đọc POI như thước đo |",
        "| `DIA_GIOI_CO_SO_CONG_BO_HONG` | tỉnh có xã mang cờ chất lượng địa giới (xem `store/admin/communes.parquet`) |",
        "| `DAN_KHONG_TOI_DUOC_BANG_DUONG` | quá 2% DÂN ở ô không tới được trạm nào bằng đường — đọc `dist_station_*` dè dặt; **không** loại tỉnh |",
        "| `THIEU_NHA_VAN_HANH_KHAC` | nguồn phụ có >5% trạm mà nguồn chính không có |",
        "",
    ]
    (paths.QA / "BAO_CAO_TINH.md").write_text("\n".join(doc), encoding="utf-8")


def run() -> None:
    r = qa.Report(
        "n10_quality",
        vintage=admin.VINTAGE["name"],
        note="mọi con số ở đây tính lại từ phân mảnh của chính tỉnh — không hằng số toàn quốc",
    )
    pv = pq.read_table(paths.ADMIN / "provinces.parquet").to_pandas()
    cm = pq.read_table(
        paths.ADMIN / "communes.parquet",
        columns=[
            "commune_code",
            "province_code",
            "commune_kind",
            "area_km2",
            "area_km2_geom",
            "population",
            "quality_flag",
        ],
    ).to_pandas()
    secondary = _secondary_gap()

    rows = []
    for code in admin.province_codes():
        st = _read(code, "stations.parquet")
        if st.empty:
            continue  # tỉnh chưa chạy — bảng chỉ nói về những gì có trên đĩa
        occ = _read(code, "station_occupancy.parquet")
        # Bảng ĐÃ GHÉP nếu có (n09 đã chạy), nếu không thì khung lưới trần. Bảng này phải
        # nói được về store ở TRẠNG THÁI HIỆN TẠI, kể cả khi mới chạy tới n04.
        gp = paths.PROV / code / "grid_h3_r8.parquet"
        gc = (
            pq.read_table(gp).to_pandas()
            if gp.exists()
            else _read(code, "grid_cell.parquet", columns=["h3_r8", "n_poi_total", "n_stations"])
        )
        has_calc = "population" in gc.columns
        pc = _read(code, "poi_commune.parquet")
        vis = _read(code, "poi_visual.parquet", columns=["group", "geometry_wkb"])
        rd = _read(code, "roads.parquet", columns=["road_class", "in_province"])
        prow = pv[pv.province_code == code].iloc[0]
        ccm = cm[cm.province_code == code]

        ins = st[st.scope == "IN"]
        n_st = len(ins)
        ports = float(ins.n_ports.fillna(0).sum())
        kw = float(ins.power_kw_site.fillna(0).sum())

        qa_supply = json.loads((paths.QA / code / "n03_supply.json").read_text("utf-8"))
        drop = qa_supply["dropped_private_ac"]
        qa_pop = paths.QA / code / "n05_population.json"
        anchor_ratio = (
            json.loads(qa_pop.read_text("utf-8"))["stats"].get("anchor_ratio_province")
            if qa_pop.exists()
            else None
        )

        meas = (
            occ[occ.util_reportable & (occ.grade == "GOOD") & occ.util.notna()] if len(occ) else occ
        )
        share_meas = float(len(meas) / max(n_st, 1))

        # --- chỉ số độ phủ POI ------------------------------------------
        if len(pc):
            pcx = pc.merge(
                ccm[["commune_code", "commune_kind", "area_km2_geom", "population"]],
                on="commune_code",
                how="left",
            )
            zero = pcx.n_poi_total == 0
            share_zero = float(zero.mean())
            pop_zero = float(pcx.loc[zero, "population"].sum() / max(pcx.population.sum(), 1))
            share_zero_market = float((pcx.n_market == 0).mean())
            den = pcx.groupby("commune_kind").apply(
                lambda g: g.n_poi_total.sum() / max(g.area_km2_geom.sum(), 1e-9),
                include_groups=False,
            )
            d_ph, d_xa = float(den.get("PHUONG", np.nan)), float(den.get("XA", np.nan))
            bias = d_ph / d_xa if d_xa and np.isfinite(d_xa) and d_xa > 0 else np.nan
            n_poi = int(pcx.n_poi_total.sum())
        else:
            share_zero = pop_zero = share_zero_market = np.nan
            bias = np.nan
            n_poi = 0

        flags = []
        if n_st == 0:
            flags.append("KHONG_CO_TRAM")
        elif n_st < MIN_STATIONS:
            flags.append("QUA_IT_TRAM")
        if share_meas < MIN_OCC_MEASURED_SHARE:
            flags.append("KHONG_DO_DUOC_SU_DUNG")
        if np.isfinite(share_zero) and share_zero > POI_ZERO_COMMUNE_MAX:
            flags.append("POI_KHONG_DIEN_GIAI_DUOC")
        pop_unreach = (
            float(gc.loc[~gc.network_reachable, "population"].sum() / max(gc.population.sum(), 1))
            if has_calc
            else 0.0
        )
        if pop_unreach > MAX_POP_UNREACHABLE:
            flags.append("DAN_KHONG_TOI_DUOC_BANG_DUONG")
        if ccm.quality_flag.notna().any():
            flags.append("DIA_GIOI_CO_SO_CONG_BO_HONG")
        sec = secondary.get(code, {})
        if sec.get("share_only_in_secondary", 0) > 0.05:
            flags.append("THIEU_NHA_VAN_HANH_KHAC")

        rows.append(
            {
                "province_code": code,
                "province_name": prow.province_name,
                "population": int(prow.population),
                "area_km2_geom": round(float(prow.area_km2_geom), 1),
                "n_communes": int(prow.n_communes),
                "n_dac_khu": int(prow.n_dac_khu),
                "n_cells": int(len(gc)),
                # cung
                "n_stations": n_st,
                "n_stations_buffer": int((st.scope == "BUFFER").sum()),
                "n_ports": int(ports),
                "power_kw_site": round(kw, 1),
                "power_kw_per_station": round(kw / max(n_st, 1), 1),
                "ports_per_station": round(ports / max(n_st, 1), 2),
                "stations_per_100k_pop": round(1e5 * n_st / max(int(prow.population), 1), 2),
                "ports_per_10k_pop": round(1e4 * ports / max(int(prow.population), 1), 2),
                "kw_per_1k_pop": round(1e3 * kw / max(int(prow.population), 1), 1),
                # điểm sạc cá nhân — TÍNH LẠI cho tỉnh này
                "private_ac_share_stations": drop["share_of_stations_before"],
                "private_ac_share_ports": drop["share_of_ports_before"],
                "private_ac_share_power": drop["share_of_power_before"],
                "n_private_ac_dropped": drop["n_dropped_in"],
                # đo mức sử dụng
                "n_stations_with_occ": int(len(occ)),
                "share_stations_measured": round(share_meas, 4),
                "util_median": round(float(meas.util.median()), 4) if len(meas) else None,
                # POI
                "n_poi_demand": n_poi,
                "n_poi_visual": int(len(vis)),
                "poi_visual_share_polygon": round(float(vis.geometry_wkb.notna().mean()), 4)
                if len(vis)
                else None,
                "poi_per_100k_pop": round(1e5 * n_poi / max(int(prow.population), 1), 1),
                "share_communes_zero_poi": round(share_zero, 4)
                if np.isfinite(share_zero)
                else None,
                "pop_share_communes_zero_poi": round(pop_zero, 4)
                if np.isfinite(pop_zero)
                else None,
                "share_communes_zero_market": round(share_zero_market, 4)
                if np.isfinite(share_zero_market)
                else None,
                "poi_bias_phuong_vs_xa": round(bias, 2) if np.isfinite(bias) else None,
                # đường (lớp để nhìn)
                "n_road_ways_in_province": int(rd.in_province.sum()) if len(rd) else 0,
                "n_road_ways_shard": int(len(rd)),
                # nguồn phụ
                "n_only_in_secondary": sec.get("n_only_in_secondary"),
                "share_only_in_secondary": sec.get("share_only_in_secondary"),
                # lớp TÍNH TOÁN — vắng thì để None, không để 0 ("chưa tính" ≠ "bằng không")
                "population_grid": round(float(gc.population.sum()), 1) if has_calc else None,
                "pop_beyond_2km_network": int(
                    gc.loc[gc.dist_station_network_m > 2000, "population"].sum()
                )
                if has_calc
                else None,
                "share_pop_beyond_2km": round(
                    float(
                        gc.loc[gc.dist_station_network_m > 2000, "population"].sum()
                        / max(gc.population.sum(), 1)
                    ),
                    4,
                )
                if has_calc
                else None,
                "dist_station_network_median_m": round(
                    float(gc.dist_station_network_m.median()), 1
                )
                if has_calc
                else None,
                "detour_ratio_median": round(float(gc.detour_ratio.median()), 3)
                if has_calc and gc.detour_ratio.notna().any()
                else None,
                "built_frac_mean": round(float(gc.built_frac.mean()), 4) if has_calc else None,
                # BỐI CẢNH, không phải cờ: thấp = biển/đảo/núi trong đa giác tỉnh.
                "share_cells_reachable": round(float(gc.network_reachable.mean()), 4)
                if has_calc
                else None,
                "share_pop_unreachable": round(pop_unreach, 4) if has_calc else None,
                "share_cells_de_xuat": round(
                    float((gc.screen_decision == "DE_XUAT").mean()), 4
                )
                if has_calc
                else None,
                # Vết hỏng #2 của VNSDI, đo được: >1 nghĩa là số công bố CAO hơn bề mặt
                # WorldPop ở tỉnh này. Không sửa, chỉ phát — xem n05_population.
                "vnsdi_anchor_ratio": anchor_ratio,
                # địa giới
                "n_communes_flagged": int(ccm.quality_flag.notna().sum()),
                "quality_flags": "|".join(flags) if flags else None,
            }
        )

    df = pd.DataFrame(rows).sort_values("province_code").reset_index(drop=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), paths.QA / "provinces.parquet")

    # --- danh sách ĐỀ NGHỊ loại trừ --------------------------------------
    # ĐỀ NGHỊ, không tự loại. Bỏ một tỉnh khỏi bản đồ là một quyết định về phạm vi sản phẩm,
    # không phải một bước làm sạch dữ liệu; nó cần người ký. File này là đầu vào của quyết
    # định đó, và mỗi lý do đi kèm con số đã đo.
    hard = {"KHONG_CO_TRAM", "QUA_IT_TRAM", "KHONG_DO_DUOC_SU_DUNG"}
    excl = []
    for x in df.itertuples():
        fl = _flagset(x.quality_flags)
        if fl & hard:
            excl.append(
                {
                    "province_code": x.province_code,
                    "province_name": x.province_name,
                    "reasons": sorted(fl & hard),
                    "n_stations": x.n_stations,
                    "share_stations_measured": x.share_stations_measured,
                    "all_flags": sorted(fl),
                }
            )
    restrict = [
        {
            "province_code": x.province_code,
            "province_name": x.province_name,
            "flag": "POI_KHONG_DIEN_GIAI_DUOC",
            "share_communes_zero_poi": x.share_communes_zero_poi,
            "pop_share_communes_zero_poi": x.pop_share_communes_zero_poi,
            "poi_bias_phuong_vs_xa": x.poi_bias_phuong_vs_xa,
        }
        for x in df.itertuples()
        if "POI_KHONG_DIEN_GIAI_DUOC" in _flagset(x.quality_flags)
    ]
    (paths.QA / "exclusions.json").write_text(
        json.dumps(
            {
                "nguong": {
                    "MIN_STATIONS": MIN_STATIONS,
                    "MIN_OCC_MEASURED_SHARE": MIN_OCC_MEASURED_SHARE,
                    "POI_ZERO_COMMUNE_MAX": POI_ZERO_COMMUNE_MAX,
                },
                "de_nghi_loai_khoi_phan_tich": excl,
                "khong_loai_nhung_cam_dien_giai_POI": restrict,
                "ghi_chu": (
                    "ĐỀ NGHỊ, chưa loại. Không bước nào trong pipeline đọc file này để bỏ "
                    "tỉnh; loại trừ là quyết định về phạm vi sản phẩm và cần người ký."
                ),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    _write_markdown(df)

    # --- QA ---------------------------------------------------------------
    def spread(col: str) -> dict:
        s = df[col].dropna().astype(float)
        if s.empty:
            return {}
        lo, hi = df.loc[s.idxmin()], df.loc[s.idxmax()]
        return {
            "min": round(float(s.min()), 4),
            "min_province": lo.province_name,
            "p25": round(float(s.quantile(0.25)), 4),
            "median": round(float(s.median()), 4),
            "p75": round(float(s.quantile(0.75)), 4),
            "max": round(float(s.max()), 4),
            "max_province": hi.province_name,
            "hanoi": round(float(df.loc[df.province_code == "01", col].iloc[0]), 4)
            if (df.province_code == "01").any()
            and pd.notna(df.loc[df.province_code == "01", col].iloc[0])
            else None,
        }

    r.stat(
        n_provinces_in_store=int(len(df)),
        n_stations_total=int(df.n_stations.sum()),
        n_ports_total=int(df.n_ports.sum()),
        power_mw_total=round(float(df.power_kw_site.sum()) / 1000, 1),
        n_poi_demand_total=int(df.n_poi_demand.sum()),
        n_poi_visual_total=int(df.n_poi_visual.sum()),
        do_tan_private_ac_share_stations=spread("private_ac_share_stations"),
        do_tan_private_ac_share_power=spread("private_ac_share_power"),
        do_tan_power_kw_per_station=spread("power_kw_per_station"),
        do_tan_ports_per_10k_pop=spread("ports_per_10k_pop"),
        do_tan_share_communes_zero_poi=spread("share_communes_zero_poi"),
        do_tan_vnsdi_anchor_ratio=spread("vnsdi_anchor_ratio"),
        do_tan_share_pop_beyond_2km=spread("share_pop_beyond_2km"),
        do_tan_dist_station_network_median_m=spread("dist_station_network_median_m"),
        do_tan_built_frac_mean=spread("built_frac_mean"),
        do_tan_share_cells_reachable=spread("share_cells_reachable"),
        do_tan_share_pop_unreachable=spread("share_pop_unreachable"),
        do_tan_poi_bias_phuong_vs_xa=spread("poi_bias_phuong_vs_xa"),
        flag_counts={
            str(k): int(v)
            for k, v in df.quality_flags.dropna().str.split("|").explode().value_counts().items()
        },
        n_de_nghi_loai=len(excl),
        de_nghi_loai=[
            f"{e['province_code']} {e['province_name']}: {','.join(e['reasons'])}" for e in excl
        ],
        n_cam_dien_giai_poi=len(restrict),
    )
    r.check(
        "no_national_constant_for_private_ac",
        float(df.private_ac_share_stations.max() - df.private_ac_share_stations.min()) > 0.10,
        f"tỉ lệ trải {df.private_ac_share_stations.min():.1%}–{df.private_ac_share_stations.max():.1%} "
        "⇒ con số Hà Nội KHÔNG dùng làm hằng số toàn quốc",
    )
    # Bất biến quan trọng nhất của một store phân mảnh: Σ(IN) = tổng toàn quốc, không thừa
    # không thiếu. Kiểm bằng TẬP station_id chứ không bằng số đếm — hai tập lệch nhau vẫn có
    # thể cùng kích thước, và đó đúng là kiểu lỗi mà một phép đếm sẽ bỏ qua.
    nat = _national_pool()
    ids = set()
    dup = 0
    for c in admin.province_codes():
        d = _read(c, "stations.parquet", columns=["station_id", "scope"])
        if d.empty:
            continue
        s = set(d[d.scope == "IN"].station_id)
        dup += len(ids & s)
        ids |= s
    missing = nat - ids
    r.stat(
        partition_check={
            "n_national_after_filters": len(nat),
            "n_union_of_IN": len(ids),
            "n_duplicated_across_partitions": dup,
            "n_not_in_any_province": len(missing),
            "note_not_in_any_province": (
                "trạm nằm ngoài MỌI đa giác tỉnh (ven biển/đảo nhỏ). Nguồn thượng nguồn gán "
                "chúng bằng 'nearest' chứ không phải 'inside'. Ở đây chúng chỉ tồn tại với "
                "scope='BUFFER' — không bị mất, nhưng không tỉnh nào nhận là của mình."
            ),
        }
    )
    r.check(
        "station_partitions_do_not_double_count",
        dup == 0,
        f"{dup} trạm xuất hiện với scope=IN ở nhiều hơn một tỉnh",
    )
    r.check(
        "station_partitions_lose_nothing_silently",
        len(missing) == 0 or len(missing) / max(len(nat), 1) < 0.005,
        f"Σ(IN) = {len(ids):,} / {len(nat):,} toàn quốc · "
        f"{len(missing)} trạm không thuộc đa giác tỉnh nào (đã khai báo, không im lặng)",
    )
    r.check(
        "poi_coverage_measured_for_every_province",
        bool(df.share_communes_zero_poi.notna().all()),
        f"{int(df.share_communes_zero_poi.isna().sum())} tỉnh thiếu chỉ số độ phủ POI",
    )
    r.write()


STEP = Step(
    name="n10_quality",
    scope="global",
    version=VERSION,
    run=run,
    reads=(
        "src_canon_stations",
        "src_secondary_stations",
        "admin_communes",
        "admin_provinces",
        "grid_h3_r8",
        "commune",
        "stations",
        "poi_commune",
        "qa_n03_supply",
        "qa_n05_population",
        "poi_visual",
        "roads",
        "station_occupancy",
    ),
    writes=(
        "qa_provinces",
        "qa_exclusions",
        "qa_report",
    ),
    desc="bảng thống kê theo tỉnh + độ phủ POI + cờ chất lượng + đề nghị loại trừ",
)
