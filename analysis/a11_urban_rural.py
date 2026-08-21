"""A11 — Nhãn ``urban_rural`` kế thừa từ repo cũ, chưa ai kiểm lại.

Nhãn này quyết định lớp tham chiếu của ``util_pctl``. Đối chiếu với mật độ dân của ô
chứa trạm: nhãn "rural" ở ô > 5.000 người/km² là mâu thuẫn.
"""

from __future__ import annotations

from _common import emit, grid, occupancy, stations

DENSE_PPKM2 = 5_000.0


def main() -> None:
    st = stations()[["station_code", "h3_r8", "commune_name", "scope", "current_type"]]
    oc = occupancy()[["station_code", "urban_rural", "util", "util_pctl", "grade"]]
    g = grid().set_index("h3_r8")

    m = oc.merge(st, on="station_code", how="left")
    m["pop_density"] = m.h3_r8.map(g.pop_density_ppkm2)
    m["built_frac"] = m.h3_r8.map(g.built_frac)
    m = m[m.pop_density.notna()]

    ru = m[m.urban_rural == "rural"]
    ur = m[m.urban_rural == "urban"]

    contradiction = ru[ru.pop_density > DENSE_PPKM2]
    reverse = ur[ur.pop_density < 1_000]

    # nhãn có tách được mật độ không?
    from scipy.stats import mannwhitneyu

    u = mannwhitneyu(ur.pop_density, ru.pop_density)
    auc = float(u.statistic / (len(ur) * len(ru)))

    report = {
        "cau_hoi": "Nhãn urban/rural có khớp mật độ dân đo được của ô chứa trạm không?",
        "phan_bo": {
            "n_rural": int(len(ru)),
            "n_urban": int(len(ur)),
            "mat_do_median_rural": float(ru.pop_density.median()),
            "mat_do_median_urban": float(ur.pop_density.median()),
            "auc_urban_vs_rural_theo_mat_do": round(auc, 3),
        },
        "mau_thuan": {
            "n_rural_o_mat_do_tren_5000": int(len(contradiction)),
            "ty_trong_trong_rural": float(len(contradiction) / max(1, len(ru))),
            "mat_do_max_cua_mot_tram_rural": float(ru.pop_density.max()),
            "n_urban_o_mat_do_duoi_1000": int(len(reverse)),
            "ty_trong_trong_urban": float(len(reverse) / max(1, len(ur))),
        },
        "anh_huong_toi_util_pctl": {
            "note": "util_pctl phân theo current_type, KHÔNG theo urban_rural — nhãn này hiện chỉ mang tính mô tả",
            "n_tram_grade_GOOD": int((m.grade == "GOOD").sum()),
            "util_median_rural": float(ru.util.median()),
            "util_median_urban": float(ur.util.median()),
        },
        "vi_du_mau_thuan": contradiction.nlargest(8, "pop_density")[
            ["station_code", "commune_name", "pop_density", "built_frac", "util"]
        ].to_dict("records"),
    }
    hong = len(contradiction) / max(1, len(ru)) > 0.10
    emit("A11", "HONG" if hong else "CANH_BAO", report)


if __name__ == "__main__":
    main()
