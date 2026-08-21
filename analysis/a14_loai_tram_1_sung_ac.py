"""A14 — Kiểm lại A7 sau khi áp luật loại trạm "1 súng và súng đó là AC".

Luật (quyết định người dùng): trạm có ``n_ports == 1`` VÀ ``current_type == 'AC'`` coi như
KHÔNG TỒN TẠI — không lên bản đồ, không vào bất kỳ công thức nào.

Ba câu hỏi:
  1. Luật này cắt đi bao nhiêu, và cắt đúng cái gì?
  2. Kết luận A7 ("cung không phân bố theo cầu") còn đúng không?
  3. Trường ``dist_station_network_m`` đổi bao nhiêu khi 1.8k nguồn Dijkstra biến mất?
"""

from __future__ import annotations

import _graph
import numpy as np
import pandas as pd
from _common import communes, emit, grid, occupancy, stations
from scipy.spatial import cKDTree
from scipy.stats import spearmanr


def gini(x):
    x = np.sort(np.asarray(x, float))
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1) @ x / (n * x.sum()))


def main() -> None:
    st = stations()
    hn = st[st.scope == "HANOI"].copy()
    drop = (st.n_ports == 1) & (st.current_type == "AC")
    hn_drop = drop.loc[hn.index]

    nm = hn.name.fillna("").str.lower()
    cut = {
        "n_tram_bi_loai": int(hn_drop.sum()),
        "n_tram_con_lai": int((~hn_drop).sum()),
        "ty_trong_tram_bi_loai": float(hn_drop.mean()),
        "ty_trong_cong_bi_loai": float(hn.n_ports[hn_drop].sum() / hn.n_ports.sum()),
        "ty_trong_cong_suat_bi_loai": float(
            hn.power_kw_site[hn_drop].sum() / hn.power_kw_site.sum()
        ),
        "trong_so_tram_bi_loai_bao_nhieu_la_tu_nhan": float(
            nm[hn_drop].str.contains("tư nhân").mean()
        ),
        "n_tram_1_sung_KHONG_phai_AC_van_giu": int(
            ((hn.n_ports == 1) & (hn.current_type != "AC")).sum()
        ),
        "cong_suat_trung_vi_tram_bi_loai_kw": float(hn.power_kw_site[hn_drop].median()),
    }

    # --- A7 tính lại trên tập đã lọc ---------------------------------------
    c = communes().set_index("commune_code")
    for lab, sub in (("truoc", hn), ("sau", hn[~hn_drop])):
        g = sub.groupby("commune_code").agg(p=("n_ports", "sum"), s=("station_id", "count"))
        c[f"ports_{lab}"] = c.index.map(g.p).fillna(0)
        c[f"stations_{lab}"] = c.index.map(g.s).fillna(0)

    a7 = {}
    for lab in ("truoc", "sau"):
        p = c[f"ports_{lab}"]
        a7[lab] = {
            "spearman_ports_vs_population": round(float(spearmanr(c.population, p).statistic), 3),
            "spearman_ports_vs_pop_density": round(
                float(spearmanr(c.pop_density_ppkm2, p).statistic), 3
            ),
            "gini_ports": round(gini(p.to_numpy()), 3),
            "n_xa_khong_co_cong_nao": int((p == 0).sum()),
            "dan_o_xa_khong_co_cong": float(c.population[p == 0].sum()),
            "ty_trong_cong_o_10_xa_dau": round(float(p.nlargest(10).sum() / p.sum()), 3),
        }
    a7["gini_population"] = round(gini(c.population.to_numpy()), 3)

    # --- util tính lại ------------------------------------------------------
    oc = occupancy()
    m = hn.merge(oc[["station_code", "util", "grade"]], on="station_code", how="left")
    gi = grid().set_index("h3_r8")
    m["dens"] = m.h3_r8.map(gi.pop_density_ppkm2)
    G = m[(m.grade == "GOOD") & m.dens.notna() & m.util.notna()].copy()
    G_after = G[~((G.n_ports == 1) & (G.current_type == "AC"))]
    ut = {
        "n_grade_GOOD_truoc": int(len(G)),
        "n_grade_GOOD_sau": int(len(G_after)),
        "spearman_util_vs_dens_truoc": round(float(spearmanr(G.dens, G.util).statistic), 3),
        "spearman_util_vs_dens_sau": round(
            float(spearmanr(G_after.dens, G_after.util).statistic), 3
        ),
        "spearman_util_vs_logports_sau": round(
            float(spearmanr(np.log1p(G_after.n_ports), G_after.util).statistic), 3
        ),
        "util_median_truoc": round(float(G.util.median()), 3),
        "util_median_sau": round(float(G_after.util.median()), 3),
        "util_median_theo_current_type_sau": {
            k: round(float(v), 3) for k, v in G_after.groupby("current_type").util.median().items()
        },
    }

    # --- khoảng cách mạng đường tính lại ------------------------------------
    Gr = _graph.build()
    tree = cKDTree(np.c_[Gr["X"], Gr["Y"]])
    cells, ci, cd, *_ = _graph.cell_anchors(Gr, tree)
    src = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]

    def dist_for(sub):
        sx, sy = _graph.xy(sub.lng.to_numpy(), sub.lat.to_numpy())
        sd, si = tree.query(np.c_[sx, sy])
        ok = sd <= _graph.SNAP_MAX_M
        off = pd.Series(sd[ok]).groupby(pd.Series(si[ok])).min()
        d = _graph.multisource(
            Gr, Gr["dist_w"], off.index.to_numpy(np.int32), off.to_numpy(), reverse=True
        )
        dd = np.where(cd <= _graph.SNAP_MAX_M, d[ci], np.inf)
        return np.where(np.isfinite(dd), dd + cd, np.nan), int(ok.sum())

    d_before, n_b = dist_for(src)
    src_after = src[~((src.n_ports == 1) & (src.current_type == "AC"))]
    d_after, n_a = dist_for(src_after)

    ok = np.isfinite(d_before) & np.isfinite(d_after)
    delta = d_after[ok] - d_before[ok]
    pop = (
        grid().set_index("h3_r8").loc[list(cells)].population.to_numpy()
    )
    dist = {
        "nguon_dijkstra_truoc": n_b,
        "nguon_dijkstra_sau": n_a,
        "median_m_truoc": round(float(np.nanmedian(d_before)), 1),
        "median_m_sau": round(float(np.nanmedian(d_after)), 1),
        "p90_m_truoc": round(float(np.nanpercentile(d_before, 90)), 1),
        "p90_m_sau": round(float(np.nanpercentile(d_after, 90)), 1),
        "tang_trung_vi_m": round(float(np.median(delta)), 1),
        "tang_trung_binh_co_trong_so_dan_m": round(
            float(np.average(delta, weights=pop[ok])), 1
        ),
        "ty_le_o_tang_qua_500m": round(float((delta > 500).mean()), 3),
        "ty_le_o_tang_qua_2000m": round(float((delta > 2000).mean()), 3),
        "spearman_xep_hang_truoc_sau": round(
            float(spearmanr(d_before[ok], d_after[ok]).statistic), 4
        ),
        "n_o_khong_con_toi_duoc_tram_nao": int(
            (np.isfinite(d_before) & ~np.isfinite(d_after)).sum()
        ),
        "dan_o_tang_qua_2000m": float(pop[ok][delta > 2000].sum()),
    }

    report = {
        "luat": "loại trạm có n_ports == 1 VÀ current_type == 'AC'",
        "cat_di_bao_nhieu": cut,
        "A7_truoc_va_sau": a7,
        "util": ut,
        "khoang_cach_mang_duong": dist,
    }
    emit("A14", "CANH_BAO", report)


if __name__ == "__main__":
    main()
