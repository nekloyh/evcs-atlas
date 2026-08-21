"""A16 — Hai câu hỏi thiết kế: (L3) chọn thước đo khoảng cách nào · (L8) dựng được nhịp gì.

L3: nếu dùng BÁN KÍNH CHIM BAY thay vì QUÃNG ĐƯỜNG MẠNG, sai bao nhiêu và sai ở đâu?
L8: hồ sơ 168 giờ có tái dựng được "tỉ lệ súng đang bận theo giờ" không?
"""

from __future__ import annotations

import _graph
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from _common import ROOT, emit, grid, stations
from scipy.spatial import cKDTree

RADII = [1000, 2000, 3000, 5000]


def main() -> None:
    g = grid()
    st = stations()
    src = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]
    src = src[~((src.n_ports == 1) & (src.current_type == "AC"))]

    G = _graph.build()
    tree = cKDTree(np.c_[G["X"], G["Y"]])
    cells, ci, cd, clat, clng = _graph.cell_anchors(G, tree)
    sx, sy = _graph.xy(src.lng.to_numpy(), src.lat.to_numpy())
    sd, si = tree.query(np.c_[sx, sy])
    ok = sd <= _graph.SNAP_MAX_M
    off = pd.Series(sd[ok]).groupby(pd.Series(si[ok])).min()
    dn = _graph.multisource(G, G["dist_w"], off.index.to_numpy(np.int32), off.to_numpy())
    dd = np.where(cd <= _graph.SNAP_MAX_M, dn[ci], np.inf)
    net = np.where(np.isfinite(dd), dd + cd, np.nan)

    cx, cy = _graph.xy(clng, clat)
    eu, _ = cKDTree(np.c_[sx, sy]).query(np.c_[cx, cy])

    pop = g.set_index("h3_r8").loc[list(cells)].population.to_numpy()
    m = np.isfinite(net) & (eu > 200)
    detour = net[m] / eu[m]

    # --- L3: bán kính chim bay phân loại SAI bao nhiêu ô? -------------------
    radii = {}
    for R in RADII:
        cov_eu = eu <= R
        cov_net = net <= R
        fp = cov_eu & ~np.nan_to_num(cov_net, nan=False)  # chim bay nói "phủ", mạng nói "không"
        fn = ~cov_eu & np.nan_to_num(cov_net, nan=False)
        radii[f"R={R}m"] = {
            "n_o_phu_theo_chim_bay": int(cov_eu.sum()),
            "n_o_phu_theo_mang_duong": int(np.nan_to_num(cov_net, nan=False).sum()),
            "duong_tinh_gia_chim_bay_noi_phu_nhung_khong": int(fp.sum()),
            "ty_le_duong_tinh_gia": round(float(fp.sum() / max(1, cov_eu.sum())), 4),
            "dan_bi_tuong_la_da_phu": float(pop[fp].sum()),
            "am_tinh_gia": int(fn.sum()),
        }

    worst = np.argsort(-np.where(m, np.nan_to_num(net / np.maximum(eu, 1)), 0))[:12]
    l3 = {
        "cau_hoi": "Bán kính chim bay có thay được quãng đường mạng không?",
        "he_so_di_vong": {
            "trung_vi": round(float(np.median(detour)), 3),
            "p75": round(float(np.percentile(detour, 75)), 3),
            "p90": round(float(np.percentile(detour, 90)), 3),
            "p99": round(float(np.percentile(detour, 99)), 3),
            "max": round(float(detour.max()), 2),
            "n_o_tren_1_5x": int((detour > 1.5).sum()),
            "n_o_tren_2x": int((detour > 2).sum()),
            "n_o_tren_3x": int((detour > 3).sum()),
            "n_o_do_duoc": int(m.sum()),
        },
        "phan_loai_sai_theo_ban_kinh": radii,
        "12_o_di_vong_nhat": [
            {
                "h3_r8": cells[i],
                "commune": g.set_index("h3_r8").loc[cells[i]].commune_name,
                "chim_bay_m": round(float(eu[i])),
                "mang_duong_m": round(float(net[i])),
                "he_so": round(float(net[i] / eu[i]), 2),
                "dan": round(float(pop[i])),
            }
            for i in worst
        ],
    }

    # --- L8: hồ sơ 168 giờ dựng được gì? -----------------------------------
    prof = pq.read_table(ROOT / "data/processed/station_occupancy_profile_168h.parquet").to_pandas()
    occ = pq.read_table(ROOT / "data/processed/station_occupancy.parquet").to_pandas()
    keep_codes = set(st[(st.scope == "HANOI") & ~((st.n_ports == 1) & (st.current_type == "AC"))].station_code)
    den = occ.set_index("station_code").util_denominator_ports
    p = prof[prof.station_code.isin(keep_codes)].copy()
    p["den"] = p.station_code.map(den)
    p = p[p.den > 0]
    p["ty_le_ban"] = (p.occ / p.den).clip(upper=1.0)

    full = p.groupby(["dow", "hour"]).apply(
        lambda x: pd.Series({
            "ty_le_ban": np.average(x.ty_le_ban, weights=x.den),
            "obs_h_median": x.observed_h.median(),
        }), include_groups=False,
    )
    peak = full.ty_le_ban.idxmax()
    trough = full.ty_le_ban.idxmin()

    cover = p.groupby(["dow", "hour"]).observed_h.median()
    l8 = {
        "cau_hoi": "Hồ sơ 168 giờ có dựng được 'tỉ lệ súng đang bận theo giờ' không?",
        "quy_mo": {
            "n_dong_sau_loc": int(len(p)),
            "n_tram_co_ho_so": int(p.station_code.nunique()),
            "n_tram_giu_lai_tong": len(keep_codes),
            "ty_le_tram_co_ho_so": round(float(p.station_code.nunique() / len(keep_codes)), 3),
            "so_o_thoi_gian_day_du": int(len(full)),
        },
        "nhip_tuan_toan_mang": {
            "ty_le_ban_trung_binh": round(float(full.ty_le_ban.mean()), 4),
            "dinh": {"dow": int(peak[0]), "hour": int(peak[1]),
                     "ty_le_ban": round(float(full.ty_le_ban.max()), 4)},
            "day": {"dow": int(trough[0]), "hour": int(trough[1]),
                    "ty_le_ban": round(float(full.ty_le_ban.min()), 4)},
            "bien_do_dinh_tren_day": round(float(full.ty_le_ban.max() / full.ty_le_ban.min()), 2),
        },
        "do_tin_cay_theo_o_thoi_gian": {
            "observed_h_median_min": float(cover.min()),
            "observed_h_median_max": float(cover.max()),
            "n_o_thoi_gian_median_duoi_2h": int((cover < 2).sum()),
            "n_tram_du_168_o": int((p.groupby("station_code").size() == 168).sum()),
            "so_o_thoi_gian_trung_vi_moi_tram": float(p.groupby("station_code").size().median()),
        },
        "shape_class_sau_loc": occ[occ.station_code.isin(keep_codes)]
        .shape_class.value_counts(dropna=False)
        .rename(index=str)
        .to_dict(),
    }

    emit("A16", "CANH_BAO", {"L3": l3, "L8": l8})


if __name__ == "__main__":
    main()
