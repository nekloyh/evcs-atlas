"""B12 — Sàng lọc đơn xin đặt trạm: engine quy hoạch, dựng thành một lớp bản đồ.

Bài toán KHÔNG phải "gợi ý chỗ đặt trạm". Nó là: một đơn xin lắp đặt tại một toạ độ cụ thể
đi qua engine, engine trả về **ĐỀ XUẤT** hoặc **TỪ CHỐI**, rồi cấp trên là người ký cuối.

Lớp này trả lời trước câu đó cho MỌI ô: *"nếu có đơn nộp ở đây, engine sẽ nói gì?"*

── Bộ rule (khách hàng cung cấp) ────────────────────────────────────────────────────────

  PHƯỜNG  khoảng cách tới trạm gần nhất phải > 500 m
  XÃ      phải > 2.000 m
          NGOẠI LỆ — nếu trạm gần nhất CAO TẢI thì hạ xuống > 500 m, với điều kiện có DC
  cao tải = 40% thời gian chiếm dụng

── Ba chỗ mơ hồ, và lựa chọn ở đây ─────────────────────────────────────────────────────

1. **Khoảng cách: CHIM BAY** — khách hàng chốt. Đo được: chim bay từ chối thêm 130/660 trạm
   (19,7%) so với mạng đường, và mọi lệch đều theo một chiều (đường đi không bao giờ ngắn
   hơn chim bay). Đây là lựa chọn CHẶT HƠN, và nó là lựa chọn của khách hàng.

2. **Cao tải = `util` ≥ 0,40 trung bình CẢ CỬA SỔ 30 ngày**, không phải đỉnh khung giờ. Hai
   lý do: (a) "40% thời gian chiếm dụng" đọc theo nghĩa đen chính là mức trung bình có trọng
   số thời lượng, tức `util`; (b) nó PHÂN BIỆT ĐƯỢC — 148 trạm (23,4%) so với 453 trạm
   (71,7%) nếu dùng đỉnh khung giờ. Một tiêu chí mà 72% đối tượng đều đạt thì không sàng lọc
   được gì.

3. **"Phải có trạm DC" = trạm XIN phải có DC.** Ảnh hưởng nhỏ (5–10 quyết định trên 660), nên
   chọn theo thiết kế chứ không theo số: chỉ trụ DC mới thật sự chia tải cho một trạm đang
   quá tải, và đó là điều kiện NGƯỜI NỘP ĐƠN kiểm soát được. Buộc điều kiện vào tài sản của
   người khác thì người nộp đơn không có cách nào tuân thủ.

── KHOẢNG TRỐNG PHẢI KHAI BÁO ──────────────────────────────────────────────────────────

Rule nói xét cả trạm **chuẩn bị vận hành / đang xây / đã cấp phép**. Nguồn evcs.vn chỉ phát
trạm ĐANG SỐNG; không có trạng thái nào tương ứng, và khách hàng xác nhận hiện chưa có danh
sách. Khoảng trống này **lệch về một phía**: engine sẽ ĐỀ XUẤT đúng những chỗ sắp có trạm.
Đó là dạng sai nguy hiểm hơn dạng ngược lại, nên nó phải nằm trong QA chứ không nằm trong
một ghi chú cuối trang.

Sinh:
  data/processed/layers/screening_cell.parquet
  data/qa/s12_screening.json
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from . import grid, paths
from .roadnet import M_PER_DEG_LAT, M_PER_DEG_LON

NGUONG_M = {"PHUONG": 500.0, "XA": 2000.0}
NGUONG_NGOAI_LE_M = 500.0
CAO_TAI = 0.40


def main() -> None:
    cells = grid.hanoi_cells()
    gc = pq.read_table(paths.LAYERS / "grid_cell.parquet").to_pandas().set_index("h3_r8")
    tt = pq.read_table(paths.LAYERS / "traveltime_cell.parquet").to_pandas().set_index("h3_r8")

    # Loại đơn vị hành chính của Ô, dựng từ cùng nguồn VNSDI như `commune_kind` của trạm
    # (DECISIONS §11). Không phát thành cột: `commune_name` đã mang thông tin đó.
    kind = np.where(
        gc.loc[cells, "commune_name"].fillna("").str.startswith("Phường").to_numpy(),
        "PHUONG",
        "XA",
    )
    d_eu = tt.loc[cells, "dist_station_euclid_m"].to_numpy()

    # --- trạm gần nhất có cao tải không -------------------------------------
    st = pq.read_table(paths.PROCESSED / "stations.parquet").to_pandas()
    st = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]
    occ = pq.read_table(paths.PROCESSED / "station_occupancy.parquet").to_pandas()
    u = occ.set_index("station_code")
    do_duoc = (u.util_reportable & (u.grade == "GOOD") & u.util.notna()).to_dict()
    util = u.util.to_dict()

    sx = st.lng.to_numpy() * M_PER_DEG_LON
    sy = st.lat.to_numpy() * M_PER_DEG_LAT
    clat = np.array([grid.centroid(c)[0] for c in cells])
    clng = np.array([grid.centroid(c)[1] for c in cells])
    _, nn = cKDTree(np.c_[sx, sy]).query(np.c_[clng * M_PER_DEG_LON, clat * M_PER_DEG_LAT])
    codes = st.station_code.to_numpy()[nn]

    # Trạm gần nhất KHÔNG đo được `util` thì KHÔNG được coi là cao tải — "không biết" không
    # phải "không cao tải", nhưng ngoại lệ là thứ NỚI LỎNG rule, nên khi thiếu bằng chứng
    # phải nghiêng về phía KHÔNG nới. Số ô rơi vào tình huống này được đếm và báo cáo.
    nn_do_duoc = np.array([bool(do_duoc.get(c, False)) for c in codes])
    nn_util = np.array([float(util.get(c, np.nan)) for c in codes])
    nn_cao_tai = nn_do_duoc & (nn_util >= CAO_TAI)

    # --- quyết định ----------------------------------------------------------
    nguong = np.where(kind == "PHUONG", NGUONG_M["PHUONG"], NGUONG_M["XA"])
    margin = d_eu - nguong

    du_xa = d_eu > nguong
    # ngoại lệ CHỈ cho Xã: chưa đủ xa theo ngưỡng 2 km, nhưng vẫn trên sàn 500 m và trạm gần
    # nhất đang cao tải ⇒ đơn có cửa NẾU mang theo trụ DC
    ngoai_le = (kind == "XA") & ~du_xa & (d_eu > NGUONG_NGOAI_LE_M) & nn_cao_tai

    decision = np.where(du_xa, "DE_XUAT", np.where(ngoai_le, "DE_XUAT_NEU_CO_DC", "TU_CHOI"))
    # Ô không tới được bằng đường bộ vẫn có chim bay, nên rule vẫn chạy được; nhưng ô thiếu
    # chim bay thì không. Để null thay vì đoán.
    decision = np.where(np.isfinite(d_eu), decision, None)
    margin = np.where(np.isfinite(d_eu), margin, np.nan)

    out = pd.DataFrame(
        {
            "h3_r8": pd.Series(cells, dtype="string"),
            "screen_margin_m": margin,
            "screen_decision": pd.Series(decision, dtype="string"),
        }
    )
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), paths.LAYERS / "screening_cell.parquet"
    )

    # --- QA ------------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    chk("all_cells_present", len(out) == len(cells), f"{len(out)}/{len(cells)}")
    chk(
        "decision_matches_margin",
        bool(((out.screen_decision == "DE_XUAT") == (out.screen_margin_m > 0)).all()),
        "DE_XUAT khi và chỉ khi vượt ngưỡng — ngoại lệ nằm ở nhãn riêng, không lẫn vào đây",
    )
    chk(
        "exception_only_in_xa",
        bool((kind[out.screen_decision == "DE_XUAT_NEU_CO_DC"] == "XA").all()),
        "ngoại lệ cao tải chỉ áp cho Xã, đúng như rule",
    )
    chk(
        "exception_respects_floor",
        bool(
            (
                out.loc[out.screen_decision == "DE_XUAT_NEU_CO_DC", "screen_margin_m"]
                > NGUONG_NGOAI_LE_M - NGUONG_M["XA"]
            ).all()
        ),
        f"mọi ô ngoại lệ đều còn trên sàn {NGUONG_NGOAI_LE_M:.0f} m",
    )

    n_dx = int((out.screen_decision == "DE_XUAT").sum())
    n_ex = int((out.screen_decision == "DE_XUAT_NEU_CO_DC").sum())
    n_tc = int((out.screen_decision == "TU_CHOI").sum())
    pop = gc.loc[cells, "population"].to_numpy() if "population" in gc.columns else None
    if pop is None:
        popc = pq.read_table(paths.LAYERS / "population_cell.parquet").to_pandas()
        pop = popc.set_index("h3_r8").loc[cells, "population"].to_numpy()

    report = {
        "layer": "screening",
        "rule": {
            "nguong_m": NGUONG_M,
            "nguong_ngoai_le_m": NGUONG_NGOAI_LE_M,
            "cao_tai_nguong_util": CAO_TAI,
            "khoang_cach": "CHIM BAY (dist_station_euclid_m) — khách hàng chốt",
            "cao_tai_dinh_nghia": "util ≥ 0,40 trung bình cả cửa sổ 30 ngày (không phải đỉnh khung giờ)",
            "dieu_kien_dc": "trạm XIN phải có DC — điều kiện người nộp đơn kiểm soát được",
        },
        "KHOANG_TRONG": {
            "tram_sap_van_hanh": (
                "Rule yêu cầu xét cả trạm chuẩn bị vận hành / đang xây / đã cấp phép. Nguồn "
                "không có trạng thái đó và khách hàng chưa có danh sách. Engine vì thế sẽ ĐỀ "
                "XUẤT ở những chỗ sắp có trạm — sai theo hướng nới lỏng."
            ),
            "khong_co_ho_so_that": (
                "Không tồn tại tập đơn thật (được duyệt/bị từ chối) để kiểm chứng đầu-cuối. "
                "Mọi hiệu chuẩn tới nay dùng CHÍNH trạm đang vận hành làm đơn giả định."
            ),
            "n_o_ngoai_le_bi_chan_vi_thieu_util": int(
                ((kind == "XA") & ~du_xa & (d_eu > NGUONG_NGOAI_LE_M) & ~nn_do_duoc).sum()
            ),
        },
        "stats": {
            "n_cells": int(len(out)),
            "DE_XUAT": n_dx,
            "DE_XUAT_NEU_CO_DC": n_ex,
            "TU_CHOI": n_tc,
            "share_de_xuat": round((n_dx + n_ex) / len(out), 4),
            "dan_o_DE_XUAT": int(np.nansum(pop * (out.screen_decision == "DE_XUAT").to_numpy())),
            "dan_o_TU_CHOI": int(np.nansum(pop * (out.screen_decision == "TU_CHOI").to_numpy())),
            "theo_loai_don_vi": {
                k: {
                    "n_o": int((kind == k).sum()),
                    "DE_XUAT": int(((kind == k) & (out.screen_decision == "DE_XUAT")).sum()),
                    "TU_CHOI": int(((kind == k) & (out.screen_decision == "TU_CHOI")).sum()),
                }
                for k in ("PHUONG", "XA")
            },
            "margin_median_m": round(float(np.nanmedian(margin)), 1),
            "n_o_sat_nguong_100m": int((np.abs(margin) <= 100).sum()),
            "n_tram_cao_tai": int(
                sum(
                    1
                    for c in st.station_code
                    if do_duoc.get(c, False) and util.get(c, 0) >= CAO_TAI
                )
            ),
        },
        "checks": checks,
    }
    (paths.QA / "s12_screening.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
