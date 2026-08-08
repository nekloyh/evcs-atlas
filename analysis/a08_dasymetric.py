"""A8 — Dasymetric: neo tổng đúng không cứu được HÌNH DẠNG sai trong xã.

Tổng từng xã chắc chắn đúng (neo VNSDI). Phân bố BÊN TRONG xã hoàn toàn theo WorldPop
2025 và không có gì kiểm chứng. Đối chứng bằng biến KHÔNG tham gia phép tính: lớp phủ
đã xây dựng và chiều cao chung cư OSM.

Hỏng nếu: tồn tại CỤM ô đông dân theo WorldPop mà lớp phủ nói là ruộng/mặt nước.
"""

from __future__ import annotations

import numpy as np
from scipy.stats import spearmanr

from _common import emit, grid


def main() -> None:
    g = grid()
    g = g[g.pop_source == "WORLDPOP2025_ANCHORED_VNSDI"].copy()
    g["built_km2"] = g.built_frac * g.area_km2 * g.area_frac

    r_built = spearmanr(g.population, g.built_frac)
    r_builtkm = spearmanr(g.population, g.built_km2)
    r_lv = spearmanr(g.population, g.apartment_levels_sum)
    r_road = spearmanr(g.population, g.road_len_m)

    # tương quan TRONG xã (loại bỏ hiệu ứng giữa các xã)
    within = []
    for _, sub in g.groupby("commune_code"):
        if len(sub) >= 8 and sub.built_frac.std() > 0 and sub.population.std() > 0:
            within.append(spearmanr(sub.population, sub.built_frac).statistic)
    within = np.array([w for w in within if np.isfinite(w)])

    # ô "đông dân mà lớp phủ nói là không xây dựng"
    p_hi = g.pop_density_ppkm2 > np.percentile(g.pop_density_ppkm2, 90)
    mismatch = g[p_hi & (g.built_frac < 0.05)]
    agri = g[p_hi & ((g.crop_frac + g.water_frac) > 0.7)]

    # ô "nhiều tầng chung cư mà dân thấp" — dấu hiệu WorldPop bỏ sót chung cư mới
    lv_hi = g[g.apartment_levels_sum > 0]
    lv_hi = lv_hi[lv_hi.apartment_levels_sum > np.percentile(lv_hi.apartment_levels_sum, 75)]
    undercount = lv_hi[lv_hi.pop_density_ppkm2 < np.median(g.pop_density_ppkm2)]

    # có thành CỤM không? đếm cụm liền kề trong tập mismatch
    import h3

    s = set(mismatch.h3_r8)
    seen, clusters = set(), []
    for c in s:
        if c in seen:
            continue
        stack, comp = [c], []
        seen.add(c)
        while stack:
            x = stack.pop()
            comp.append(x)
            for nb in h3.grid_disk(x, 1):
                if nb in s and nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        clusters.append(comp)
    clusters.sort(key=len, reverse=True)

    report = {
        "cau_hoi": "Hình dạng dân số bên trong xã có được biến độc lập nào xác nhận không?",
        "tuong_quan_doi_chung": {
            "spearman_pop_vs_built_frac": round(float(r_built.statistic), 3),
            "spearman_pop_vs_built_km2": round(float(r_builtkm.statistic), 3),
            "spearman_pop_vs_apartment_levels_sum": round(float(r_lv.statistic), 3),
            "spearman_pop_vs_road_len_m": round(float(r_road.statistic), 3),
            "spearman_trong_xa_median": round(float(np.median(within)), 3),
            "spearman_trong_xa_p10": round(float(np.percentile(within, 10)), 3),
            "n_xa_du_o_de_tinh": int(len(within)),
            "n_xa_tuong_quan_am": int((within < 0).sum()),
        },
        "o_mau_thuan": {
            "note": "mật độ dân ở nhóm 10% cao nhất nhưng built_frac < 0,05",
            "n_o": int(len(mismatch)),
            "dan_so": float(mismatch.population.sum()),
            "n_o_dong_dan_tren_ruong_hoac_nuoc": int(len(agri)),
            "dan_so_tren_ruong_hoac_nuoc": float(agri.population.sum()),
            "cum_lien_ke_lon_nhat": int(len(clusters[0])) if clusters else 0,
            "n_cum": len(clusters),
            "cum_lon_nhat_o": clusters[0][:12] if clusters else [],
        },
        "nghi_bo_sot_chung_cu": {
            "note": "apartment_levels_sum ở nhóm 25% cao nhất nhưng mật độ dân dưới trung vị",
            "n_o": int(len(undercount)),
            "vi_du": undercount.nlargest(8, "apartment_levels_sum")[
                ["h3_r8", "commune_name", "apartment_levels_sum", "pop_density_ppkm2", "built_frac"]
            ].to_dict("records"),
        },
    }
    hong = len(clusters) > 0 and len(clusters[0]) >= 3
    emit("A08", "HONG" if hong else "CANH_BAO", report)


if __name__ == "__main__":
    main()
