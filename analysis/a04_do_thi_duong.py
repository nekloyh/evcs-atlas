"""A4 — Đồ thị đường có đúng là "ô tô điện đi được" không, và mọi trạm có tới được không.

Ba lỗ nghi ngờ, đo riêng từng cái:

1. **Thẻ `access` được trích nhưng KHÔNG lớp nào đọc.** Đường `access=private` / `no` /
   `customers` vẫn đang tính là đi được. Đo: lọc rồi so khoảng cách.

2. **Chỉ đường lớn mới đi được?** (giả thuyết của người dùng) Trong đô thị, ngõ nhỏ ô tô
   không lọt. Đo bằng quét HẠN CHẾ CẤP ĐƯỜNG: bỏ SERVICE, rồi bỏ cả LOCAL, xem khoảng cách
   và độ phủ đổi thế nào. Khi hạn chế, điểm vào mạng phải neo lại vào đỉnh CÒN CẠNH — nếu
   không thì ô sẽ neo vào một con ngõ vừa bị xoá và giả vờ không tới được.

3. **Liên thông.** 50 ô không tới được — chưa ai đếm số thành phần. Với đồ thị CÓ HƯỚNG,
   thứ cần đếm là thành phần liên thông MẠNH (SCC): hai đỉnh cùng SCC mới đi lại được cả hai
   chiều. Kèm câu hỏi của người dùng: "mọi trạm đều tới được" — kiểm từng trạm.

Ghi: data/qa/critique/a04.json
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree
from scipy.stats import spearmanr

from _common import ROOT, emit, grid, stations

M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 103_940.0
SNAP_MAX_M = 2_000.0

# access coi là CHẶN ô tô. `permissive`/`destination`/`yes` KHÔNG chặn (destination = được vào
# nếu điểm đến nằm trong — trạm sạc chính là điểm đến).
ACCESS_CHAN = {"private", "no", "customers", "residents", "delivery", "permit"}
BIG = ("MOTORWAY", "TRUNK", "PRIMARY", "SECONDARY", "TERTIARY")


def xy(lng, lat):
    return np.asarray(lng) * M_PER_DEG_LON, np.asarray(lat) * M_PER_DEG_LAT


def build_edges():
    """Cạnh có hướng kèm thuộc tính, dựng đúng luật của s08 nhưng giữ thêm class/access."""
    roads = pq.read_table(
        ROOT / "data/raw/osm_hanoi_roads.parquet",
        columns=["road_class", "oneway", "access", "node_ids", "geometry_wkb"],
    ).to_pandas()
    from shapely import wkb as shwkb

    node_xy: dict[int, tuple[float, float]] = {}
    seqs, meta = [], []
    for nids, gwkb, rc, ow, acc in zip(
        roads.node_ids, roads.geometry_wkb, roads.road_class, roads.oneway, roads.access
    ):
        coords = list(shwkb.loads(bytes(gwkb)).coords)
        nids = list(nids)
        if len(nids) != len(coords) or len(nids) < 2:
            continue
        for nd, (x, y) in zip(nids, coords):
            if nd not in node_xy:
                node_xy[nd] = (x, y)
        seqs.append(nids)
        meta.append((rc, int(ow), None if pd.isna(acc) else str(acc)))

    ids = np.sort(np.fromiter(node_xy.keys(), dtype=np.int64, count=len(node_xy)))
    lon = np.array([node_xy[i][0] for i in ids])
    lat = np.array([node_xy[i][1] for i in ids])
    pos = {int(nd): i for i, nd in enumerate(ids)}
    X, Y = xy(lon, lat)

    src, dst, w, cls, blocked = [], [], [], [], []
    for nids, (rc, ow, acc) in zip(seqs, meta):
        bl = acc in ACCESS_CHAN
        for a, b in zip(nids[:-1], nids[1:]):
            ia, ib = pos[int(a)], pos[int(b)]
            if ia == ib:
                continue
            d = math.hypot(X[ia] - X[ib], Y[ia] - Y[ib])
            if d <= 0:
                continue
            for u, v in ((ia, ib), (ib, ia)):
                if (u, v) == (ia, ib) and ow < 0:
                    continue
                if (u, v) == (ib, ia) and ow > 0:
                    continue
                src.append(u)
                dst.append(v)
                w.append(d)
                cls.append(rc)
                blocked.append(bl)

    return {
        "X": X,
        "Y": Y,
        "src": np.asarray(src, np.int32),
        "dst": np.asarray(dst, np.int32),
        "w": np.asarray(w, np.float64),
        "cls": np.asarray(cls, dtype=object),
        "blocked": np.asarray(blocked, bool),
        "roads": roads,
    }


def variant_dist(E, keep, cells_xy, st_xy, node_ok=None):
    """Khoảng cách ô→trạm trên đồ thị con `keep`, neo lại vào đỉnh CÒN CẠNH.

    ``node_ok`` hạn chế thêm tập đỉnh được phép neo vào — dùng để thử cách sửa: chỉ neo vào
    đỉnh thuộc SCC lớn, tránh neo trúng đỉnh cụt một chiều (vào được nhưng không ra được).
    """
    n = len(E["X"])
    src, dst, w = E["src"][keep], E["dst"][keep], E["w"][keep]
    live = np.zeros(n, bool)
    live[src] = True
    live[dst] = True
    if node_ok is not None:
        live &= node_ok
    lidx = np.flatnonzero(live)
    tree = cKDTree(np.c_[E["X"][lidx], E["Y"][lidx]])

    sd, si_ = tree.query(st_xy)
    ok = sd <= SNAP_MAX_M
    off = pd.Series(sd[ok]).groupby(pd.Series(lidx[si_[ok]])).min()
    snodes, soff = off.index.to_numpy(np.int32), off.to_numpy()

    rs = np.concatenate([dst, np.full(len(snodes), n, np.int32)])
    rd = np.concatenate([src, snodes])
    g = csr_matrix((np.concatenate([w, soff]), (rs, rd)), shape=(n + 1, n + 1))
    nd = dijkstra(g, directed=True, indices=n)[:n]

    cd, cidx = tree.query(cells_xy)
    anchor = lidx[cidx]
    acc = cd <= SNAP_MAX_M
    d = np.where(acc, nd[anchor], np.inf) + cd
    return d, int(ok.sum()), int(np.isfinite(d).sum()), anchor, snodes


def main() -> None:
    E = build_edges()
    n = len(E["X"])
    roads = E["roads"]
    g = grid().set_index("h3_r8")
    cells = list(g.index)

    import sys

    sys.path.insert(0, str(ROOT / "src"))
    from hanoi import grid as gridmod

    clat = np.array([gridmod.centroid(c)[0] for c in cells])
    clng = np.array([gridmod.centroid(c)[1] for c in cells])
    cx, cy = xy(clng, clat)
    cells_xy = np.c_[cx, cy]

    # Cùng bộ lọc nguồn với s08: KHÔNG lọc theo scope — trạm ngay ngoài ranh giới vẫn phục vụ
    # ô biên, bỏ đi là tự tạo ra thiếu hụt giả ở rìa bản đồ.
    st = stations()
    st_used = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]
    sx, sy = xy(st_used.lng.to_numpy(), st_used.lat.to_numpy())
    st_xy = np.c_[sx, sy]
    print(f"đỉnh={n:,} cạnh={len(E['src']):,} trạm dùng làm nguồn={len(st_used):,}")

    # --- 1. access ----------------------------------------------------------
    by_acc = roads.access.value_counts(dropna=False)
    acc_tab = {
        ("(không tag)" if pd.isna(k) else str(k)): {
            "n_doan": int(v),
            "chan_o_to": (False if pd.isna(k) else str(k) in ACCESS_CHAN),
        }
        for k, v in by_acc.items()
    }
    blocked_by_cls = (
        roads[roads.access.isin(ACCESS_CHAN)].road_class.value_counts().to_dict()
        if roads.access.isin(ACCESS_CHAN).any()
        else {}
    )

    # --- 3. liên thông MẠNH -------------------------------------------------
    gdir = csr_matrix((E["w"], (E["src"], E["dst"])), shape=(n, n))
    n_scc, lab = connected_components(gdir, directed=True, connection="strong")
    sizes = np.bincount(lab)
    giant = int(np.argmax(sizes))
    n_weak, labw = connected_components(gdir, directed=False)
    sizew = np.bincount(labw)

    # --- các kịch bản đồ thị -------------------------------------------------
    keeps = {
        "FULL": np.ones(len(E["src"]), bool),
        "LOC_ACCESS": ~E["blocked"],
        "BO_SERVICE": E["cls"] != "SERVICE",
        "CHI_DUONG_LON": np.isin(E["cls"], BIG),
    }
    base = None
    variants = {}
    for name, keep in keeps.items():
        d, nst, nreach, anchor, snodes = variant_dist(E, keep, cells_xy, st_xy)
        fin = np.isfinite(d)
        if base is None:
            base = d
            anchor_full, snodes_full = anchor, snodes
        m = fin & np.isfinite(base)
        variants[name] = {
            "canh_giu": int(keep.sum()),
            "canh_bo": int((~keep).sum()),
            "tram_neo_duoc": nst,
            "o_toi_duoc": nreach,
            "o_toi_duoc_share": round(nreach / len(cells), 4),
            "dist_trung_vi_m": round(float(np.nanmedian(d[fin])), 1),
            "dist_p90_m": round(float(np.nanpercentile(d[fin], 90)), 1),
            "spearman_vs_full": round(float(spearmanr(base[m], d[m]).statistic), 6)
            if m.sum() > 10
            else None,
            "n_o_doi_gt_500m": int((np.abs(d[m] - base[m]) > 500).sum()),
            "share_o_doi_gt_500m": round(float((np.abs(d[m] - base[m]) > 500).mean()), 4),
            "n_o_doi_gt_2000m": int((np.abs(d[m] - base[m]) > 2000).sum()),
        }

    # --- trạm có tới được không --------------------------------------------
    # "tới được" = đỉnh neo của trạm nằm trong SCC khổng lồ (đi vào và đi ra đều được)
    tree_all = cKDTree(np.c_[E["X"], E["Y"]])
    sd_all, si_all = tree_all.query(st_xy)
    st_ok_snap = sd_all <= SNAP_MAX_M
    st_in_giant = np.asarray((lab[si_all] == giant) & st_ok_snap)
    bad = ~st_in_giant
    st_bad = st_used.loc[bad, ["station_code", "lat", "lng", "n_ports"]].copy()
    st_bad["snap_m"] = np.round(sd_all[bad], 1)
    st_bad["scc_size"] = sizes[lab[si_all[bad]]]

    # --- 50 ô không tới được: mổ từng ô -------------------------------------
    unreach = ~np.isfinite(base)
    cd_full, ci_full = tree_all.query(cells_xy)
    diag = pd.DataFrame(
        {
            "h3_r8": cells,
            "snap_m": np.round(cd_full, 1),
            "trong_scc_lon": lab[ci_full] == giant,
            "scc_size": sizes[lab[ci_full]],
            "wcc_size": sizew[labw[ci_full]],
            "dan": g.population.to_numpy(),
            "euclid_m": g.dist_station_euclid_m.to_numpy(),
        }
    )[unreach]
    # Phân loại phải hỏi "có thuộc SCC LỚN không", không phải "SCC có to hơn 100 đỉnh không" —
    # một SCC 336 đỉnh vẫn là ốc đảo. Nhánh cuối là trường hợp thật sự lạ: thuộc SCC lớn (nơi
    # 884/886 trạm nằm) mà vẫn không có đường tới ⇒ phải điều tra tay, không được gộp chung.
    # --- thử CÁCH SỬA: chỉ neo vào đỉnh thuộc SCC lớn ------------------------
    # Nguyên nhân gốc của phần lớn ô/trạm "không tới được" không phải thiếu đường, mà là
    # neo trúng một đỉnh cụt một chiều (SCC = 1 đỉnh, vào được nhưng không ra được). Điểm vào
    # mạng phải là nơi xe THẬT SỰ đi tiếp được — tức phải thuộc SCC lớn.
    in_giant = lab == giant
    d_fix, nst_fix, nreach_fix, _, _ = variant_dist(
        E, keeps["FULL"], cells_xy, st_xy, node_ok=in_giant
    )
    sd_fix, si_fix = cKDTree(np.c_[E["X"][in_giant], E["Y"][in_giant]]).query(st_xy)
    sua = {
        "o_toi_duoc_truoc": int(np.isfinite(base).sum()),
        "o_toi_duoc_sau": int(nreach_fix),
        "o_duoc_cuu": int(nreach_fix - np.isfinite(base).sum()),
        "tram_neo_duoc_sau": int((sd_fix <= SNAP_MAX_M).sum()),
        "dist_trung_vi_sau_m": round(float(np.nanmedian(d_fix[np.isfinite(d_fix)])), 1),
        "n_o_doi_gt_500m": int(
            (np.abs(d_fix - base)[np.isfinite(d_fix) & np.isfinite(base)] > 500).sum()
        ),
        "do_lech_neo_them_trung_vi_m": round(float(np.median(sd_fix - sd_all)), 2),
    }

    diag["ly_do"] = np.where(
        diag.snap_m > SNAP_MAX_M,
        "KHONG_CO_DUONG_TRONG_2KM",
        np.where(~diag.trong_scc_lon, "NGOAI_SCC_LON_OC_DAO", "TRONG_SCC_LON_MA_VAN_KHONG_TOI"),
    )

    report = {
        "cau_hoi": "đồ thị có phải 'ô tô đi được' không; mọi trạm có tới được không",
        "do_thi": {"dinh": n, "canh_co_huong": int(len(E["src"])), "n_doan_osm": int(len(roads))},
        "1_access": {
            "phan_bo_the_access": acc_tab,
            "coi_la_chan_o_to": sorted(ACCESS_CHAN),
            "n_doan_bi_chan": int(roads.access.isin(ACCESS_CHAN).sum()),
            "share_doan_bi_chan": round(float(roads.access.isin(ACCESS_CHAN).mean()), 5),
            "doan_bi_chan_theo_cap": {str(k): int(v) for k, v in blocked_by_cls.items()},
            "ghi_chu": (
                "`service=driveway|parking_aisle` KHÔNG đo được: s03 không trích thẻ phụ "
                "`service`. Cần quét lại PBF nếu muốn tách. Ở đây SERVICE được đo trọn cấp."
            ),
        },
        "2_han_che_cap_duong": variants,
        "3_lien_thong": {
            "n_scc": int(n_scc),
            "scc_lon_nhat_dinh": int(sizes[giant]),
            "scc_lon_nhat_share": round(float(sizes[giant] / n), 5),
            "n_scc_co_tren_1000_dinh": int((sizes > 1000).sum()),
            "n_dinh_ngoai_scc_lon": int(n - sizes[giant]),
            "n_wcc": int(n_weak),
            "wcc_lon_nhat_dinh": int(sizew.max()),
            "top10_scc": [int(x) for x in np.sort(sizes)[::-1][:10]],
        },
        "4_tram_toi_duoc": {
            "n_tram_nguon": int(len(st_used)),
            "n_tram_trong_scc_lon": int(st_in_giant.sum()),
            "n_tram_KHONG_toi_duoc": int((~st_in_giant).sum()),
            "share_toi_duoc": round(float(st_in_giant.mean()), 5),
            "tram_co_van_de": st_bad.to_dict("records")[:20],
        },
        "5_o_khong_toi_duoc": {
            "n_o": int(unreach.sum()),
            "dan": int(diag.dan.sum()),
            "theo_ly_do": diag.ly_do.value_counts().to_dict(),
            "chi_tiet": diag.sort_values("dan", ascending=False).head(25).to_dict("records"),
        },
        "6_thu_cach_sua_neo_vao_scc_lon": sua,
    }
    v = variants
    verdict = "KHONG_HONG"
    if v["LOC_ACCESS"]["share_o_doi_gt_500m"] > 0.05:
        verdict = "CANH_BAO"
    if int((~st_in_giant).sum()) > 0 or sizes[giant] / n < 0.9:
        verdict = "CANH_BAO"
    report["ket_luan"] = [
        f"access: {int(roads.access.isin(ACCESS_CHAN).sum())} đoạn bị chặn "
        f"({roads.access.isin(ACCESS_CHAN).mean():.3%}); lọc đi thì "
        f"{v['LOC_ACCESS']['n_o_doi_gt_500m']} ô đổi quá 500 m.",
        f"SCC lớn nhất chứa {sizes[giant] / n:.2%} số đỉnh; "
        f"{int((~st_in_giant).sum())}/{len(st_used)} trạm nằm ngoài.",
        f"Chỉ giữ đường lớn: {v['CHI_DUONG_LON']['o_toi_duoc_share']:.1%} ô còn tới được, "
        f"trung vị {v['CHI_DUONG_LON']['dist_trung_vi_m']:.0f} m "
        f"(FULL: {v['FULL']['dist_trung_vi_m']:.0f} m).",
        f"Neo vào SCC lớn cứu được {sua['o_duoc_cuu']} ô, trạm neo được "
        f"{sua['tram_neo_duoc_sau']}/{len(st_used)}, đổi {sua['n_o_doi_gt_500m']} ô quá 500 m.",
    ]
    emit("A04", verdict, report)


if __name__ == "__main__":
    main()
