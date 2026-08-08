"""A6 — ``util_cell`` chỉ đo được ở nơi đã có trạm ⇒ thiên lệch chọn mẫu.

Kiểm: so phân bố các biến giải thích giữa ô có trạm đo được và ô không có. Nếu hai
miền tách nhau rõ thì mọi mô hình học từ ``util_cell`` để dự đoán ô chưa có trạm là
NGOẠI SUY NGOÀI MIỀN.

Hỏng nếu: overlap coefficient thấp / AUC phân biệt cao — miền giá trị không chồng nhau.
"""

from __future__ import annotations

import numpy as np

from _common import emit, grid

VARS = [
    "population",
    "pop_density_ppkm2",
    "built_frac",
    "n_poi_total",
    "road_len_arterial_m",
    "road_len_m",
    "apartment_levels_sum",
    "drive_time_station_min",
]


def auc(pos, neg):
    """AUC = P(x_pos > x_neg), qua thống kê hạng Mann-Whitney."""
    from scipy.stats import rankdata

    a = np.concatenate([pos, neg])
    r = rankdata(a)
    n1, n2 = len(pos), len(neg)
    return (r[:n1].sum() - n1 * (n1 + 1) / 2) / (n1 * n2)


def main() -> None:
    g = grid()
    has = g.util_cell.notna()
    obs, unobs = g[has], g[~has]

    per_var = {}
    for v in VARS:
        a = obs[v].dropna().to_numpy(float)
        b = unobs[v].dropna().to_numpy(float)
        per_var[v] = {
            "median_co_do": float(np.median(a)),
            "median_khong_do": float(np.median(b)),
            "ty_so_median": float(np.median(a) / np.median(b)) if np.median(b) else None,
            "auc_phan_biet": round(float(auc(a, b)), 3),
            "p90_khong_do_vuot_p90_co_do": bool(
                np.percentile(b, 90) > np.percentile(a, 90)
            ),
        }

    # phần dân số sống ở ô KHÔNG quan sát được
    report = {
        "cau_hoi": "util_cell học được ở đâu, và suy ra được cho đâu?",
        "phu": {
            "n_o_co_util": int(has.sum()),
            "n_o_khong_util": int((~has).sum()),
            "tat_ca_o_co_util_deu_co_tram": bool((obs.n_stations > 0).all()),
            "n_o_co_tram_nhung_khong_do_duoc": int(((g.n_stations > 0) & ~has).sum()),
            "dan_so_o_co_util": float(obs.population.sum()),
            "dan_so_o_khong_util": float(unobs.population.sum()),
            "ty_trong_dan_khong_quan_sat_duoc": float(
                unobs.population.sum() / g.population.sum()
            ),
        },
        "so_sanh_mien_gia_tri": per_var,
        "ngoai_suy": {
            "note": "Ô không trạm nằm ngoài khoảng [p5,p95] của ô có trạm ở ÍT NHẤT một biến",
            **{
                f"n_o_khong_tram_ngoai_p5_p95_{v}": int(
                    (
                        (unobs[v] < np.nanpercentile(obs[v], 5))
                        | (unobs[v] > np.nanpercentile(obs[v], 95))
                    ).sum()
                )
                for v in VARS
            },
        },
    }
    hong = any(x["auc_phan_biet"] > 0.75 for x in per_var.values())
    emit("A06", "HONG" if hong else "CANH_BAO", report)


if __name__ == "__main__":
    main()
