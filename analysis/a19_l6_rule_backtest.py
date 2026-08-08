"""L6/A19 — Chạy NGƯỢC bộ rule phê duyệt trên chính các trạm đang vận hành.

Bộ rule khách hàng cung cấp:

  · xét trên trạm ĐANG VẬN HÀNH + trạm CHUẨN BỊ VẬN HÀNH
  · trạm chỉ có 1 trụ AC coi như không tồn tại                    (đã làm ở s05)
  · PHƯỜNG: khoảng cách tới trạm gần nhất phải > 500 m
  · XÃ:     phải > 2.000 m; NGOẠI LỆ — nếu trạm gần nhất CAO TẢI thì hạ xuống > 500 m,
            với điều kiện có trạm DC
  · cao tải = 40% thời gian chiếm dụng
  · đầu ra: "đề xuất" / "từ chối"

Phép thử bắt buộc trước khi bất kỳ rule nào được vào engine: **rule loại nhầm bao nhiêu trạm
đang chạy thật?** Một trạm đang vận hành mà bị chính rule của mình từ chối là dương tính giả
CÓ BẰNG CHỨNG THỰC ĐỊA — khác hẳn một dương tính giả trên giấy.

Ba chỗ mơ hồ trong rule được đo THÀNH HAI PHƯƠNG ÁN mỗi chỗ, không tự chọn:
  (1) khoảng cách: chim bay hay theo mạng đường?
  (2) cao tải 40%: trung bình cả ngày hay đỉnh theo khung giờ?
  (3) "phải có trạm DC": trạm hiện hữu có DC, hay trạm xin đặt phải là DC?

Ghi: data/qa/critique/a19_l6.json
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

from _common import ROOT, emit

sys.path.insert(0, str(ROOT / "src"))
from hanoi import roadnet  # noqa: E402

NGUONG = {"PHUONG": 500.0, "XA": 2000.0}
NGUONG_NGOAI_LE = 500.0
CAO_TAI = 0.40
LIMIT_M = 3_100.0  # chỉ cần phân biệt quanh 500 m và 2.000 m


def khoang_cach_mang(g, st: pd.DataFrame) -> np.ndarray:
    """Khoảng cách theo mạng đường từ mỗi trạm tới trạm KHÁC gần nhất (inf nếu > LIMIT_M)."""
    sx, sy = roadnet.xy(st.lng.to_numpy(), st.lat.to_numpy())
    sd, si = g.tree.query(np.c_[sx, sy])
    node = g.gidx[si]  # đỉnh neo của từng trạm (chỉ số toàn cục)
    gm = csr_matrix((g.dist_w, (g.src, g.dst)), shape=(g.n_nodes, g.n_nodes))

    uniq = np.unique(node)
    out = np.full(len(st), np.inf)
    for i in range(0, len(uniq), 30):  # chia lô cho khỏi vỡ RAM
        blk = uniq[i : i + 30]
        D = dijkstra(gm, directed=True, indices=blk, limit=LIMIT_M)
        sub = D[:, node]  # (lô, mọi trạm)
        row = {int(n): k for k, n in enumerate(blk)}
        for j in range(len(st)):
            n_j = int(node[j])
            if n_j not in row:
                continue
            d = sub[row[n_j]].copy()
            # loại chính nó VÀ mọi trạm neo cùng một đỉnh (khoảng cách mạng = 0, vô nghĩa)
            d[node == n_j] = np.inf
            # cộng độ lệch neo hai đầu để so được với chim bay
            out[j] = float(np.min(d + sd)) + sd[j] if np.isfinite(np.min(d)) else np.inf
    return out


def main() -> None:
    st_all = pq.read_table(ROOT / "data/processed/stations.parquet").to_pandas()
    st = st_all[
        (st_all.scope == "HANOI")
        & st_all.op_status.isin(["OPERATIONAL", "MAINTENANCE"])
        & (st_all.access != "RESTRICTED")
    ].reset_index(drop=True)
    st["commune_kind"] = np.where(
        st.commune_name.fillna("").str.startswith("Phường"), "PHUONG", "XA"
    )

    occ = pq.read_table(ROOT / "data/processed/station_occupancy.parquet").to_pandas()
    prof = pq.read_table(ROOT / "data/processed/station_occupancy_profile_168h.parquet").to_pandas()

    # --- (2) hai cách hiểu "cao tải 40%" ------------------------------------
    u_ngay = dict(zip(occ.station_code, occ.util))  # trung bình cả cửa sổ 30 ngày
    # `occ` trong hồ sơ 168 giờ là SỐ XE, không phải tỉ lệ — nguồn tính
    # `util = occ_twa / n_ports` (aGiang occ/station.py:192). Chia cho số cổng mới ra tỉ lệ
    # so được với ngưỡng 40%. Kiểm: corr(occ/n_ports, util) = 0,9985.
    dinh_xe = prof.groupby("station_code").occ.max()
    st["util_dinh_khung"] = st.station_code.map(dinh_xe) / st.n_ports.replace(0, np.nan)
    st["util_ngay"] = st.station_code.map(u_ngay)
    do_duoc = dict(zip(occ.station_code, occ.util_reportable & (occ.grade == "GOOD")))
    st["util_do_duoc"] = st.station_code.map(do_duoc).fillna(False).astype(bool)

    cao_tai_ngay = (st.util_ngay >= CAO_TAI) & st.util_do_duoc
    cao_tai_khung = (st.util_dinh_khung >= CAO_TAI) & st.util_do_duoc

    # --- (1) hai cách đo khoảng cách ----------------------------------------
    sx, sy = roadnet.xy(st.lng.to_numpy(), st.lat.to_numpy())
    tree = cKDTree(np.c_[sx, sy])
    dd, ii = tree.query(np.c_[sx, sy], k=2)
    d_chim_bay = dd[:, 1]
    nn_idx = ii[:, 1]  # trạm gần nhất theo chim bay

    roads, _ = roadnet.load_roads()
    g = roadnet.build_graph(roads)
    d_mang = khoang_cach_mang(g, st)

    st["d_chim_bay"] = d_chim_bay
    st["d_mang"] = d_mang
    st["nn_code"] = st.station_code.to_numpy()[nn_idx]
    st["nn_cao_tai_ngay"] = cao_tai_ngay.to_numpy()[nn_idx]
    st["nn_cao_tai_khung"] = cao_tai_khung.to_numpy()[nn_idx]
    st["co_dc"] = st.current_type.isin(["DC", "MIXED"])
    st["nn_co_dc"] = st.co_dc.to_numpy()[nn_idx]

    # --- áp rule ------------------------------------------------------------
    def quyet_dinh(d, kind, nn_cao_tai, dc_ok):
        """True = ĐỀ XUẤT (đủ xa), False = TỪ CHỐI (quá gần trạm sẵn có)."""
        nguong = np.where(kind == "PHUONG", NGUONG["PHUONG"], NGUONG["XA"])
        # ngoại lệ chỉ áp cho XÃ: trạm gần nhất cao tải + có DC ⇒ hạ ngưỡng xuống 500 m
        ngoai_le = (kind == "XA") & nn_cao_tai & dc_ok
        nguong = np.where(ngoai_le, NGUONG_NGOAI_LE, nguong)
        return d > nguong, ngoai_le

    kich_ban = {}
    for ten_d, d in [("chim_bay", d_chim_bay), ("mang_duong", d_mang)]:
        for ten_t, ct in [
            ("cao_tai_ca_ngay", "nn_cao_tai_ngay"),
            ("cao_tai_dinh_khung", "nn_cao_tai_khung"),
        ]:
            for ten_dc, dc in [
                ("tram_XIN_phai_co_DC", st.co_dc),
                ("tram_HIEN_HUU_co_DC", st.nn_co_dc),
            ]:
                ok, ngoai_le = quyet_dinh(
                    d, st.commune_kind.to_numpy(), st[ct].to_numpy(), dc.to_numpy()
                )
                kich_ban[f"{ten_d}|{ten_t}|{ten_dc}"] = {
                    "n_tu_choi": int((~ok).sum()),
                    "share_tu_choi": round(float((~ok).mean()), 4),
                    "tu_choi_PHUONG": int((~ok & (st.commune_kind == "PHUONG")).sum()),
                    "tu_choi_XA": int((~ok & (st.commune_kind == "XA")).sum()),
                    "n_duoc_cuu_boi_ngoai_le": int(ngoai_le.sum()),
                    "cong_bi_tu_choi": int(st.loc[~ok, "n_ports"].sum()),
                    "kw_bi_tu_choi": round(float(st.loc[~ok, "power_kw_site"].sum()), 1),
                }

    base = kich_ban["mang_duong|cao_tai_ca_ngay|tram_XIN_phai_co_DC"]
    ok_cb, _ = quyet_dinh(
        d_chim_bay, st.commune_kind.to_numpy(), st.nn_cao_tai_ngay.to_numpy(), st.co_dc.to_numpy()
    )
    ok_md, _ = quyet_dinh(
        d_mang, st.commune_kind.to_numpy(), st.nn_cao_tai_ngay.to_numpy(), st.co_dc.to_numpy()
    )

    report = {
        "cau_hoi": "bộ rule phê duyệt loại nhầm bao nhiêu trạm ĐANG VẬN HÀNH",
        "tap_thu": {
            "n_tram_hanoi_du_dieu_kien": int(len(st)),
            "PHUONG": int((st.commune_kind == "PHUONG").sum()),
            "XA": int((st.commune_kind == "XA").sum()),
            "n_co_util_do_duoc": int(st.util_do_duoc.sum()),
        },
        "0_KHOANG_TRONG_DU_LIEU": {
            "trang_thai_op_status_co_that": st_all[st_all.scope == "HANOI"]
            .op_status.value_counts()
            .to_dict(),
            "van_de": (
                "Rule nói xét cả trạm CHUẨN BỊ VẬN HÀNH và trạm ĐANG XÂY / ĐÃ CẤP PHÉP. "
                "Nguồn evcs.vn chỉ phát trạm ĐANG SỐNG — không có trạng thái nào tương ứng. "
                "Phần rule đó KHÔNG THỰC THI ĐƯỢC với dữ liệu hiện có, và khoảng trống này "
                "lệch VỀ MỘT PHÍA: engine sẽ đề xuất những chỗ thật ra sắp có trạm."
            ),
        },
        "1_do_nhay_ba_cho_mo_ho": kich_ban,
        "2_chim_bay_vs_mang_duong": {
            "n_quyet_dinh_LECH_NHAU": int((ok_cb != ok_md).sum()),
            "share_lech": round(float((ok_cb != ok_md).mean()), 4),
            "chim_bay_cho_qua_mang_duong_tu_choi": int((ok_cb & ~ok_md).sum()),
            "mang_duong_cho_qua_chim_bay_tu_choi": int((~ok_cb & ok_md).sum()),
            "d_chim_bay_trung_vi_m": round(float(np.median(d_chim_bay)), 1),
            "d_mang_trung_vi_m": round(float(np.median(d_mang[np.isfinite(d_mang)])), 1),
        },
        "3_cao_tai_hai_cach_hieu": {
            "n_cao_tai_theo_TRUNG_BINH_CA_NGAY": int(cao_tai_ngay.sum()),
            "n_cao_tai_theo_DINH_KHUNG_GIO": int(cao_tai_khung.sum()),
            "share_ca_ngay": round(float(cao_tai_ngay.sum() / max(st.util_do_duoc.sum(), 1)), 4),
            "share_dinh_khung": round(
                float(cao_tai_khung.sum() / max(st.util_do_duoc.sum(), 1)), 4
            ),
            "util_ca_ngay_trung_vi": round(float(st.util_ngay.median()), 4),
            "util_dinh_khung_trung_vi": round(float(st.util_dinh_khung.median()), 4),
        },
        "4_ket_qua_chinh": base,
    }
    lo = min(v["share_tu_choi"] for v in kich_ban.values())
    hi = max(v["share_tu_choi"] for v in kich_ban.values())
    report["ket_luan"] = [
        f"Bộ rule từ chối {lo:.1%}–{hi:.1%} số trạm ĐANG VẬN HÀNH, tuỳ cách giải nghĩa "
        f"ba chỗ mơ hồ.",
        f"Chim bay vs mạng đường làm lệch {int((ok_cb != ok_md).sum())} quyết định "
        f"({(ok_cb != ok_md).mean():.1%}).",
        f"'Cao tải 40%': hiểu theo trung bình cả ngày có {int(cao_tai_ngay.sum())} trạm, "
        f"theo đỉnh khung giờ có {int(cao_tai_khung.sum())} trạm.",
        "Trạm CHUẨN BỊ VẬN HÀNH / ĐANG XÂY không có trong nguồn — phần rule đó chưa chạy được.",
    ]
    st[
        [
            "station_code",
            "commune_name",
            "commune_kind",
            "current_type",
            "n_ports",
            "power_kw_site",
            "d_chim_bay",
            "d_mang",
            "util_ngay",
            "util_dinh_khung",
        ]
    ].to_parquet(ROOT / "data/qa/critique/a19_l6_tram.parquet", index=False)
    emit("A19_L6", "CANH_BAO", report)


if __name__ == "__main__":
    main()
