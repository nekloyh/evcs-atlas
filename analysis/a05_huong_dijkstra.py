"""A5 — Bất đối xứng đường một chiều: `dist_station_network_m` đo chiều nào, và có đúng không.

Hai câu hỏi TÁCH RỜI, câu đầu quan trọng hơn nhiều:

1. **NHÃN có đúng không?** s08 chạy Dijkstra đa nguồn trên đồ thị ĐẢO CHIỀU và nói kết quả là
   ô → trạm. Nếu khâu đảo làm ngược thì ta đang phát `trạm → ô` dưới nhãn `ô → trạm` trên
   2,77 triệu cạnh có hướng — không ai nhìn ra bằng mắt. Ở đây kiểm bằng một phép tính ĐỘC
   LẬP: Dijkstra một nguồn từ chính đỉnh neo của ô, trên đồ thị GỐC (không đảo), rồi lấy min
   qua các đỉnh-trạm. Đó là định nghĩa trực tiếp của d(ô → trạm), không mượn thủ thuật nào.

2. **Bất đối xứng có lớn không?** Kể cả nhãn đúng, d(ô→trạm) ≠ d(trạm→ô) ở nơi có cặp một
   chiều. Tài xế đi CẢ HAI chiều — vào sạc rồi về. Trường hiện tại chỉ đếm nửa hành trình.

Ghi: data/qa/critique/a05.json
"""

from __future__ import annotations

import _graph
import numpy as np
import pandas as pd
from _common import emit, grid
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from scipy.stats import spearmanr


def main() -> None:
    G = _graph.build()
    tree = cKDTree(np.c_[G["X"], G["Y"]])
    snodes, soff, st, ok = _graph.station_nodes(G, tree)
    cells, ci, cd, clat, clng = _graph.cell_anchors(G, tree)
    n = len(G["X"])
    print(f"đỉnh={n:,} cạnh={len(G['src']):,} trạm-neo={len(snodes):,} ô={len(cells):,}")

    # --- hai chiều ----------------------------------------------------------
    w = G["dist_w"]
    d_to_node = _graph.multisource(G, w, snodes, soff, reverse=True)  # ô → trạm (như s08)
    d_from_node = _graph.multisource(G, w, snodes, soff, reverse=False)  # trạm → ô

    access = cd <= _graph.SNAP_MAX_M
    d_to = np.where(access, d_to_node[ci], np.inf) + cd
    d_from = np.where(access, d_from_node[ci], np.inf) + cd
    both = np.isfinite(d_to) & np.isfinite(d_from)
    # inf − inf = nan và numpy kêu; ô đó đã bị `both` loại nên chỉ cần tắt cảnh báo.
    with np.errstate(invalid="ignore"):
        asym_full = np.where(both, d_to - d_from, np.nan)
    rt_full = d_to + d_from  # inf + inf = inf, không sinh nan

    # đối chiếu với bảng đã build: phải trùng khít, nếu không thì _graph lệch khỏi s08
    g = grid().set_index("h3_r8")
    built = g.loc[list(cells), "dist_station_network_m"].to_numpy()
    m_built = np.isfinite(built) & np.isfinite(d_to)
    max_dev = float(np.abs(built[m_built] - d_to[m_built]).max()) if m_built.any() else np.nan

    # --- KIỂM NHÃN ĐỘC LẬP --------------------------------------------------
    # Dijkstra một nguồn từ đỉnh neo của ô trên đồ thị GỐC; min qua đỉnh-trạm (+ offset trạm).
    # Không dùng đồ thị đảo, không dùng siêu-nguồn ⇒ phép kiểm không chia giả định nào với s08.
    g_fwd = csr_matrix((w, (G["src"], G["dst"])), shape=(n, n))
    asym = np.where(both, np.abs(asym_full), -1.0)
    probe = np.argsort(-asym)[:25]  # 25 ô lệch nhất — chỗ dễ lộ lỗi nhãn nhất
    rng = np.random.default_rng(0)
    probe = np.unique(np.concatenate([probe, rng.choice(np.flatnonzero(both), 25, replace=False)]))

    soff_by_node = pd.Series(soff, index=snodes)
    rows = []
    for i in probe:
        dd = dijkstra(g_fwd, directed=True, indices=int(ci[i]))
        cand = dd[snodes] + soff_by_node.to_numpy()
        indep = float(np.min(cand)) + cd[i]  # + đoạn nối tâm ô ra mạng
        rows.append(
            {
                "h3_r8": cells[i],
                "doc_lap_o_den_tram_m": indep,
                "s08_d_to_m": float(d_to[i]),
                "d_from_m": float(d_from[i]),
                "lech_m": indep - float(d_to[i]),
            }
        )
    pr = pd.DataFrame(rows)
    finite = pr[np.isfinite(pr.doc_lap_o_den_tram_m) & np.isfinite(pr.s08_d_to_m)]
    nhan_dung = bool((finite.lech_m.abs() < 1.0).all())
    # Nếu nhãn bị ĐẢO thì phép độc lập phải khớp d_from thay vì d_to — kiểm cả khả năng đó.
    khop_d_from = bool((finite.doc_lap_o_den_tram_m - finite.d_from_m).abs().max() < 1.0)

    # --- độ lớn bất đối xứng ------------------------------------------------
    dto_b, dfrom_b = d_to[both], d_from[both]
    diff = dto_b - dfrom_b
    ratio = dto_b / np.where(dfrom_b > 0, dfrom_b, np.nan)
    rt = dto_b + dfrom_b
    rho = float(spearmanr(dto_b, dfrom_b).statistic)
    rho_rt = float(spearmanr(dto_b, rt).statistic)

    pop = g.loc[list(cells), "population"].to_numpy()

    def topn(a, b, N=200):
        ia = set(np.argsort(-np.where(np.isfinite(a), a, -np.inf))[:N])
        ib = set(np.argsort(-np.where(np.isfinite(b), b, -np.inf))[:N])
        return len(ia & ib) / N

    # xếp hạng thiếu hụt = người-mét, thứ mà L1 thật sự dùng
    deficit_to = pop * np.where(np.isfinite(d_to), d_to, 0)
    deficit_rt = pop * np.where(np.isfinite(rt_full), rt_full, 0)

    ad = np.abs(diff)
    report = {
        "cau_hoi": "dist_station_network_m đo chiều nào, nhãn có đúng không, lệch bao nhiêu",
        "do_thi": {
            "dinh": int(n),
            "canh_co_huong": int(len(G["src"])),
            "tram_neo_duoc": int(len(snodes)),
            "o": int(len(cells)),
            "o_co_ca_hai_chieu": int(both.sum()),
        },
        "1_kiem_nhan": {
            "phuong_phap": (
                "Dijkstra một nguồn từ đỉnh neo của ô trên đồ thị GỐC, min qua đỉnh-trạm — "
                "không dùng đồ thị đảo, không chia giả định nào với s08"
            ),
            "n_o_kiem": int(len(finite)),
            "nhan_dung_o_den_tram": nhan_dung,
            "trung_voi_d_from_thay_vi_d_to": khop_d_from,
            "lech_tuyet_doi_max_m": round(float(finite.lech_m.abs().max()), 6)
            if len(finite)
            else None,
            "vai_vi_du": pr.head(8).to_dict("records"),
        },
        "2_bat_doi_xung": {
            "lech_tuyet_doi_m": {
                "trung_vi": round(float(np.median(ad)), 1),
                "p90": round(float(np.percentile(ad, 90)), 1),
                "p99": round(float(np.percentile(ad, 99)), 1),
                "max": round(float(ad.max()), 1),
                "trung_binh": round(float(ad.mean()), 1),
            },
            "ti_so_d_to_tren_d_from": {
                "trung_vi": round(float(np.nanmedian(ratio)), 4),
                "p90": round(float(np.nanpercentile(ratio, 90)), 4),
                "max": round(float(np.nanmax(ratio)), 3),
            },
            "n_o_lech_gt_100m": int((ad > 100).sum()),
            "n_o_lech_gt_500m": int((ad > 500).sum()),
            "share_o_lech_gt_500m": round(float((ad > 500).mean()), 4),
            "dan_o_lech_gt_500m": int(pop[both][ad > 500].sum()),
            "spearman_d_to_vs_d_from": round(rho, 6),
        },
        "3_khu_hoi": {
            "khu_hoi_trung_vi_m": round(float(np.median(rt)), 1),
            "mot_chieu_trung_vi_m": round(float(np.median(dto_b)), 1),
            "ti_le_khu_hoi_tren_2_lan_mot_chieu": round(
                float(np.median(rt) / (2 * np.median(dto_b))), 4
            ),
            "spearman_d_to_vs_khu_hoi": round(rho_rt, 6),
            "top200_thieu_hut_trung_mot_chieu_vs_khu_hoi": round(
                topn(deficit_to, deficit_rt, 200), 4
            ),
        },
    }
    if not nhan_dung:
        verdict = "HONG"
    elif float((ad > 500).mean()) > 0.05:
        verdict = "CANH_BAO"
    else:
        verdict = "KHONG_HONG"
    report["ket_luan"] = _ket_luan(nhan_dung, khop_d_from, ad, rho, max_dev)
    report["khop_bang_da_build"] = {"lech_max_m": round(max_dev, 6)}
    emit("A05", verdict, report)


def _ket_luan(nhan_dung, khop_d_from, ad, rho, max_dev):
    out = []
    out.append(
        "NHÃN ĐÚNG: phép tính độc lập trên đồ thị gốc khớp d_to tới dưới 1 m."
        if nhan_dung
        else "NHÃN SAI: phép tính độc lập KHÔNG khớp d_to."
        + ("Nó khớp d_from — tức trường đang là trạm→ô." if khop_d_from else "")
    )
    out.append(f"Bảng đã build khớp lại được, lệch tối đa {max_dev:.3g} m.")
    out.append(
        f"Bất đối xứng: trung vị {np.median(ad):.0f} m, p90 {np.percentile(ad, 90):.0f} m, "
        f"{(ad > 500).mean():.2%} số ô lệch quá 500 m; Spearman hai chiều {rho:.4f}."
    )
    return out


if __name__ == "__main__":
    main()
