"""A2 — Bảng tốc độ giả định gánh toàn bộ trường thời gian.

Chỉ 2.685/240.212 đoạn (1,1%) có tag ``maxspeed``. 98,9% còn lại dùng bảng 7 con số đặt
tay ``DEFAULT_KPH``. Chạy lại Dijkstra với bảng × 0,7 · 1,0 · 1,3 và với bảng PHẲNG.

Hỏng nếu: Spearman(0,7× ; 1,3×) < 0,95 hoặc > 10% ô đổi nhóm ngưỡng 3/5/10 phút.
"""

from __future__ import annotations

import numpy as np
from scipy.spatial import cKDTree
from scipy.stats import spearmanr

import _graph
from _common import emit
from _graph import DEFAULT_KPH, LINK_KPH

BINS = [0, 3, 5, 10, np.inf]


def main() -> None:
    G = _graph.build()
    tree = cKDTree(np.c_[G["X"], G["Y"]])
    snodes, soff, st, _ = _graph.station_nodes(G, tree)
    cells, ci, cd, *_ = _graph.cell_anchors(G, tree)

    scen = {
        "base": (DEFAULT_KPH, LINK_KPH),
        "x0_7": ({k: v * 0.7 for k, v in DEFAULT_KPH.items()}, LINK_KPH * 0.7),
        "x1_3": ({k: v * 1.3 for k, v in DEFAULT_KPH.items()}, LINK_KPH * 1.3),
        "phang_30": ({k: 30.0 for k in DEFAULT_KPH}, 30.0),
        "phang_25": ({k: 25.0 for k in DEFAULT_KPH}, 25.0),
        "khong_dung_tag": (DEFAULT_KPH, LINK_KPH),
    }
    res = {}
    for name, (tab, lk) in scen.items():
        w = _graph.time_weights(G, tab, lk, use_tags=(name != "khong_dung_tag"))
        off_mps = tab["SERVICE"] * 1000 / 3600
        t = _graph.multisource(G, w, snodes, soff / off_mps)
        tt = np.where(cd <= _graph.SNAP_MAX_M, t[ci], np.inf)
        res[name] = np.where(np.isfinite(tt), (tt + cd / off_mps) / 60.0, np.nan)

    ok = np.isfinite(res["base"])
    for v in res.values():
        ok &= np.isfinite(v)

    def sp(a, b):
        return round(float(spearmanr(res[a][ok], res[b][ok]).statistic), 4)

    def bin_change(a, b, norm=False):
        """norm=True: chuẩn hoá mỗi kịch bản về cùng trung vị trước khi cắt nhóm.

        Không chuẩn hoá thì phép nhân toàn cục 0,7× dịch MỌI ô qua ngưỡng — kết quả tầm
        thường. Chuẩn hoá tách được 'ngưỡng phút tuyệt đối không bền' khỏi 'cấu trúc
        tương đối không bền'; đó là hai kết luận khác nhau.
        """
        xa, xb = res[a][ok], res[b][ok]
        if norm:
            xa = xa / np.median(xa) * np.median(res["base"][ok])
            xb = xb / np.median(xb) * np.median(res["base"][ok])
        return float((np.digitize(xa, BINS[1:-1]) != np.digitize(xb, BINS[1:-1])).mean())

    def top_overlap(a, b, n=200):
        ia = set(np.argsort(-np.nan_to_num(res[a], nan=-1))[:n])
        ib = set(np.argsort(-np.nan_to_num(res[b], nan=-1))[:n])
        return len(ia & ib) / n

    # tập "thiếu phục vụ nhất" theo NGƯỜI-PHÚT, không theo thời gian trần
    import pyarrow.parquet as pq
    from _common import ROOT

    pop = (
        pq.read_table(ROOT / "data/processed/grid_h3_r8.parquet", columns=["h3_r8", "population"])
        .to_pandas()
        .set_index("h3_r8")
        .loc[list(cells)]
        .population.to_numpy()
    )

    def top_overlap_pm(a, b, n=200):
        ia = set(np.argsort(-np.nan_to_num(res[a] * pop, nan=-1))[:n])
        ib = set(np.argsort(-np.nan_to_num(res[b] * pop, nan=-1))[:n])
        return len(ia & ib) / n

    pairs = [("x0_7", "x1_3"), ("base", "x0_7"), ("base", "x1_3"), ("base", "phang_30"),
             ("base", "phang_25"), ("base", "khong_dung_tag")]

    report = {
        "cau_hoi": "Xếp hạng theo drive_time có sống sót khi bảng tốc độ đổi không?",
        "co_so": {
            "n_doan_co_maxspeed": 2685,
            "n_doan": 240212,
            "ty_trong_co_tag": 0.0112,
            "bang_hien_hanh": DEFAULT_KPH,
        },
        "trung_vi_phut_theo_kich_ban": {k: round(float(np.nanmedian(v)), 3) for k, v in res.items()},
        "so_sanh_cap": {
            f"{a}__vs__{b}": {
                "spearman": sp(a, b),
                "ty_le_o_doi_nhom_nguong_3_5_10": round(bin_change(a, b), 4),
                "ty_le_o_doi_nhom_sau_khi_chuan_hoa_trung_vi": round(bin_change(a, b, True), 4),
                "giu_lai_trong_top200_thoi_gian": round(top_overlap(a, b), 3),
                "giu_lai_trong_top200_nguoi_phut": round(top_overlap_pm(a, b), 3),
            }
            for a, b in pairs
        },
    }
    key = report["so_sanh_cap"]["x0_7__vs__x1_3"]
    hong = key["spearman"] < 0.95 or key["ty_le_o_doi_nhom_nguong_3_5_10"] > 0.10
    emit("A02", "HONG" if hong else "KHONG_HONG", report)


if __name__ == "__main__":
    main()
