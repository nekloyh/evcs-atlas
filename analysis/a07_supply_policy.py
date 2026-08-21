"""A7 — Cung thuần một nhà mạng ⇒ ``util`` là hàm của chính sách VinFast.

Kiểm: ở cấp xã, ``n_ports`` giải thích được bằng dân số hay bằng sự có mặt của khu đô thị
lớn (Vinhomes)? So R² / Spearman của hai mô hình.

Không "hỏng" theo nghĩa lỗi kỹ thuật — nhưng nếu (b) mạnh hơn (a) thì mọi diễn giải
``util`` như tín hiệu NHU CẦU phải kèm cảnh báo ngay ở chú giải bản đồ.
"""

from __future__ import annotations

import numpy as np
from _common import communes, emit, stations
from scipy.stats import spearmanr

# Nhận diện khu đô thị lớn qua CHÍNH TÊN TRẠM trong nguồn evcs (không có lớp ranh giới
# khu đô thị nào trong bộ dữ liệu). Đây là proxy KHAI BÁO, không phải lớp dữ liệu.
MEGA_KEYS = ["vinhomes", "ocean park", "ocean city", "smart city", "times city", "royal city"]


def main() -> None:
    st = stations()
    hn = st[st.scope == "HANOI"].copy()
    blob = (hn.name.fillna("") + " | " + hn.address.fillna("")).str.lower()
    hn["mega"] = blob.apply(lambda s: any(k in s for k in MEGA_KEYS))

    c = communes().set_index("commune_code")
    by = hn.groupby("commune_code").agg(
        ports=("n_ports", "sum"), st_n=("station_id", "count"), mega_ports=("n_ports", "sum")
    )
    mega = hn[hn.mega].groupby("commune_code").n_ports.sum()
    c["ports"] = c.index.map(by.ports).fillna(0)
    c["mega_ports"] = c.index.map(mega).fillna(0)
    c["mega_share"] = np.where(c.ports > 0, c.mega_ports / c.ports, 0.0)
    c["has_mega"] = c.mega_ports > 0

    r_pop = spearmanr(c.population, c.ports)
    r_dens = spearmanr(c.pop_density_ppkm2, c.ports)

    # Sức giải thích: log-cổng ~ log-dân  vs  log-cổng ~ có-mega
    y = np.log1p(c.ports.to_numpy(float))
    x_pop = np.log1p(c.population.to_numpy(float))
    x_mega = c.has_mega.to_numpy(float)

    def r2(x):
        X = np.c_[np.ones(len(x)), x]
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        resid = y - X @ beta
        return 1 - resid.var() / y.var()

    def r2_both():
        X = np.c_[np.ones(len(y)), x_pop, x_mega]
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        return 1 - (y - X @ beta).var() / y.var()

    top = c.nlargest(8, "ports")[
        ["commune_name", "population", "ports", "mega_ports", "mega_share"]
    ]
    tot = c.ports.sum()

    report = {
        "cau_hoi": "Phân bố cung theo dân số, hay theo chiến lược đặt trạm của một nhà mạng?",
        "doc_quyen": {
            "n_tram_hanoi": int(len(hn)),
            "n_vinfast_cs": int((hn.station_type == "VINFAST_CS").sum()),
            "ty_trong": float((hn.station_type == "VINFAST_CS").mean()),
        },
        "tuong_quan_cap_xa": {
            "spearman_ports_vs_population": round(float(r_pop.statistic), 3),
            "spearman_ports_vs_pop_density": round(float(r_dens.statistic), 3),
            "r2_log_ports_tu_log_pop": round(float(r2(x_pop)), 3),
            "r2_log_ports_tu_co_khu_do_thi_lon": round(float(r2(x_mega)), 3),
            "r2_ca_hai": round(float(r2_both()), 3),
        },
        "tap_trung_cung": {
            "n_xa_co_khu_do_thi_lon": int(c.has_mega.sum()),
            "ty_trong_cong_thuoc_khu_do_thi_lon": float(c.mega_ports.sum() / tot),
            "ty_trong_cong_o_10_xa_dau": float(c.nlargest(10, "ports").ports.sum() / tot),
            "gini_ports_theo_xa": float(_gini(c.ports.to_numpy(float))),
            "gini_population_theo_xa": float(_gini(c.population.to_numpy(float))),
            "proxy_khu_do_thi": "khớp chuỗi trong name/address của trạm: " + ", ".join(MEGA_KEYS),
        },
        "10_xa_nhieu_cong_nhat": top.reset_index().to_dict("records"),
    }
    emit("A07", "CANH_BAO", report)


def _gini(x):
    x = np.sort(x)
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))


if __name__ == "__main__":
    main()
