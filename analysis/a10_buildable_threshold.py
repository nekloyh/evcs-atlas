"""A10 — Hai ngưỡng ``buildable`` là số đặt tay: built_frac ≥ 0,05 và water_frac ≤ 0,50.

Kiểm: quét ngưỡng, xem hàm số-ô-buildable có "vai" ổn định không, và ngưỡng nào giữ
được ≥ 99% trạm ĐANG VẬN HÀNH bên trong vùng buildable.
"""

from __future__ import annotations

import numpy as np
from _common import emit, grid


def main() -> None:
    g = grid()
    ports = g.n_ports.to_numpy(float)

    sweep = []
    for t in np.round(np.arange(0.0, 0.505, 0.01), 3):
        keep = (g.built_frac >= t) & (g.water_frac <= 0.50)
        sweep.append(
            {
                "built_min": float(t),
                "n_buildable": int(keep.sum()),
                "ty_trong_tram_giu_lai": float(g.n_stations[keep].sum() / g.n_stations.sum()),
                "ty_trong_cong_giu_lai": float(ports[keep].sum() / ports.sum()),
                "ty_trong_dan_giu_lai": float(g.population[keep].sum() / g.population.sum()),
            }
        )
    n = np.array([s["n_buildable"] for s in sweep], float)
    d1 = np.diff(n)
    # "vai" = chỗ đạo hàm bậc nhất đổi mạnh; nếu |d²| nhỏ đều thì hàm trơn ⇒ mọi ngưỡng tuỳ tiện
    d2 = np.abs(np.diff(d1))

    water_sweep = []
    for t in np.round(np.arange(0.1, 1.01, 0.05), 3):
        keep = (g.built_frac >= 0.05) & (g.water_frac <= t)
        water_sweep.append(
            {
                "water_max": float(t),
                "n_buildable": int(keep.sum()),
                "ty_trong_tram_giu_lai": float(g.n_stations[keep].sum() / g.n_stations.sum()),
            }
        )

    keep99 = [s["built_min"] for s in sweep if s["ty_trong_tram_giu_lai"] >= 0.99]
    now = next(s for s in sweep if abs(s["built_min"] - 0.05) < 1e-9)

    report = {
        "cau_hoi": "Hai ngưỡng có 'vai' tự nhiên nào không, hay mọi giá trị đều tuỳ tiện như nhau?",
        "nguong_hien_hanh": now,
        "hinh_dang_ham": {
            "note": "n_buildable theo built_min từ 0 đến 0,50 bước 0,01",
            "n_tai_0": int(n[0]),
            "n_tai_0_05": int(n[5]),
            "n_tai_0_10": int(n[10]),
            "n_tai_0_20": int(n[20]),
            "do_doc_max_tuyet_doi": float(np.abs(d1).max()),
            "vi_tri_do_doc_max_built_min": float(sweep[int(np.argmax(np.abs(d1)))]["built_min"]),
            "d2_median": float(np.median(d2)),
            "d2_max": float(d2.max()),
            "co_vai_ro_rang": bool(d2.max() > 5 * np.median(d2) and d2.max() > 40),
        },
        "nguong_giu_99pct_tram": {
            "built_min_lon_nhat_con_giu_99pct_tram": max(keep99) if keep99 else None,
            "nguong_0_05_giu_duoc": now["ty_trong_tram_giu_lai"],
        },
        "quet_water_max": water_sweep,
        "quet_built_min": sweep[::5],
    }
    emit("A10", "CANH_BAO", report)


if __name__ == "__main__":
    main()
