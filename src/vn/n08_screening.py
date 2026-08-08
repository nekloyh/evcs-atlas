"""N8 — Engine sàng lọc đơn xin đặt trạm, dựng thành một lớp bản đồ, theo tỉnh.

Sinh (mỗi tỉnh):
  store/p/<code>/screening_cell.parquet   h3_r8 · screen_margin_m · screen_decision
  store/qa/<code>/n08_screening.json

Bài toán KHÔNG phải "gợi ý chỗ đặt trạm": một đơn nộp tại một toạ độ đi qua engine, engine
trả **ĐỀ XUẤT** hoặc **TỪ CHỐI**, cấp trên ký cuối. Lớp này trả lời trước câu đó cho MỌI ô.

Bộ rule và ba lựa chọn trong chỗ mơ hồ giữ NGUYÊN của ``hanoi.s12`` (DECISIONS §16):
khoảng cách CHIM BAY (khách hàng chốt) · cao tải = ``util`` ≥ 0,40 trung bình cả cửa sổ ·
"phải có DC" = trạm XIN phải có DC.

── MỘT CHỖ KHÁC, VÀ NÓ SỬA MỘT LỖI THẬT ───────────────────────────────────────────────

``s12`` chọn ngưỡng bằng ``commune_name.startswith("Phường")`` → 500 m, **còn lại** → 2.000 m.
Toàn quốc có **13 đặc khu**, và luật hai nhánh áp ngưỡng của Xã cho Phú Quốc, Côn Đảo,
Vân Đồn… Ở đây ngưỡng đọc từ ``commune_kind`` ba nhánh của ``n01_admin``, và **đặc khu dùng
ngưỡng của PHƯỜNG**: đặc khu là đơn vị đô thị/đảo có mật độ và cách tổ chức gần phường hơn
xã, và rule của khách hàng viết trước khi cấp đặc khu tồn tại nên nó không nói gì về chúng.
Đây là một SUY LUẬN, không phải một điều khoản — nên nó được đếm riêng trong QA
(``n_o_dac_khu``) để ai cần thì lật lại.

── KHOẢNG TRỐNG PHẢI KHAI BÁO ─────────────────────────────────────────────────────────

Rule xét cả trạm **chuẩn bị vận hành / đang xây / đã cấp phép**. Nguồn evcs.vn chỉ phát trạm
ĐANG SỐNG. Khoảng trống này **lệch về một phía**: engine sẽ ĐỀ XUẤT đúng những chỗ sắp có
trạm. Đó là dạng sai nguy hiểm hơn dạng ngược lại, nên nó nằm trong QA chứ không nằm trong
một ghi chú cuối trang.
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.spatial import cKDTree

from evcs.core import screening
from evcs.core.screening import CAO_TAI, NGUONG_DAC_KHU, NGUONG_M, NGUONG_NGOAI_LE_M

from . import admin, paths, qa, roadgraph
from .runner import Step

VERSION = "1"


def run(province_code: str) -> None:
    r = qa.Report(
        "n08_screening",
        province_code,
        province_name=admin.province_names()[province_code],
        rule={
            "nguong_m": {**NGUONG_M, "DAC_KHU": NGUONG_DAC_KHU},
            "nguong_ngoai_le_m": NGUONG_NGOAI_LE_M,
            "cao_tai_nguong_util": CAO_TAI,
            "khoang_cach": "CHIM BAY (dist_station_euclid_m) — khách hàng chốt",
            "dac_khu": (
                "áp ngưỡng của PHƯỜNG. Rule viết trước khi cấp đặc khu tồn tại nên không "
                "nói gì về chúng — đây là suy luận, được đếm riêng ở stats.n_o_dac_khu."
            ),
        },
    )
    pdir = paths.PROV / province_code
    gc = pq.read_table(pdir / "grid_cell.parquet", columns=["h3_r8", "commune_code"]).to_pandas()
    tt = pq.read_table(
        pdir / "traveltime_cell.parquet", columns=["h3_r8", "dist_station_euclid_m"]
    ).to_pandas()
    pop = pq.read_table(
        pdir / "population_cell.parquet", columns=["h3_r8", "population"]
    ).to_pandas()
    df = gc.merge(tt, on="h3_r8", validate="1:1").merge(pop, on="h3_r8", validate="1:1")

    adm = pq.read_table(
        paths.ADMIN / "communes.parquet", columns=["commune_code", "commune_kind"]
    ).to_pandas()
    kind = df.commune_code.map(dict(zip(adm.commune_code, adm.commune_kind))).to_numpy()
    d_eu = df.dist_station_euclid_m.to_numpy()

    # --- trạm gần nhất có cao tải không -------------------------------------
    st = pq.read_table(
        pdir / "stations.parquet",
        columns=["station_code", "lat", "lng", "op_status", "access"],
    ).to_pandas()
    st = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]
    occ = pq.read_table(
        pdir / "station_occupancy.parquet",
        columns=["station_code", "util", "util_reportable", "grade"],
    ).to_pandas()
    u = occ.set_index("station_code")
    do_duoc = (u.util_reportable & (u.grade == "GOOD") & u.util.notna()).to_dict()
    util = u.util.to_dict()

    m_lat, m_lon = roadgraph.scale_for(province_code)
    latlng = [h3.cell_to_latlng(c) for c in df.h3_r8]
    clat = np.array([p[0] for p in latlng])
    clng = np.array([p[1] for p in latlng])
    _, nn = cKDTree(np.c_[st.lng.to_numpy() * m_lon, st.lat.to_numpy() * m_lat]).query(
        np.c_[clng * m_lon, clat * m_lat]
    )
    codes = st.station_code.to_numpy()[nn]

    # Trạm gần nhất KHÔNG đo được `util` thì KHÔNG coi là cao tải — "không biết" không phải
    # "không cao tải", nhưng ngoại lệ là thứ NỚI LỎNG rule, nên thiếu bằng chứng phải nghiêng
    # về phía KHÔNG nới. Số ô rơi vào tình huống này được đếm và báo cáo.
    nn_do_duoc = np.array([bool(do_duoc.get(c, False)) for c in codes])
    nn_util = np.array([float(util.get(c, np.nan)) for c in codes])
    nn_cao_tai = nn_do_duoc & (nn_util >= CAO_TAI)

    # Luật quyết định ở ``evcs.core.screening`` — thuần, vector hoá, 13 test đi kèm. Ba bất
    # biến nó giữ: đặc khu dùng ngưỡng Phường; ngoại lệ chỉ mở cho Xã và không phá sàn 500 m;
    # ô không tính được khoảng cách ra ``None`` chứ không phải ``TU_CHOI``.
    nguong = screening.threshold_for(kind)
    du_xa = d_eu > nguong
    decision, margin = screening.decide(d_eu, kind, nn_cao_tai)

    out = pd.DataFrame(
        {
            "h3_r8": df.h3_r8.astype("string"),
            "screen_margin_m": margin,
            "screen_decision": pd.Series(decision, dtype="string"),
        }
    )
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False),
        paths.province_dir(province_code) / "screening_cell.parquet",
    )

    n_dx = int((out.screen_decision == "DE_XUAT").sum())
    n_ex = int((out.screen_decision == "DE_XUAT_NEU_CO_DC").sum())
    n_tc = int((out.screen_decision == "TU_CHOI").sum())
    pop_a = df.population.to_numpy()
    r.doc["KHOANG_TRONG"] = {
        "tram_sap_van_hanh": (
            "Rule yêu cầu xét cả trạm chuẩn bị vận hành / đang xây / đã cấp phép. Nguồn "
            "không có trạng thái đó. Engine vì thế sẽ ĐỀ XUẤT ở những chỗ sắp có trạm — "
            "sai theo hướng nới lỏng."
        ),
        "khong_co_ho_so_that": (
            "Không tồn tại tập đơn thật (được duyệt/bị từ chối) để kiểm chứng đầu-cuối."
        ),
        "n_o_ngoai_le_bi_chan_vi_thieu_util": int(
            ((kind == "XA") & ~du_xa & (d_eu > NGUONG_NGOAI_LE_M) & ~nn_do_duoc).sum()
        ),
    }
    r.stat(
        n_cells=int(len(out)),
        DE_XUAT=n_dx,
        DE_XUAT_NEU_CO_DC=n_ex,
        TU_CHOI=n_tc,
        share_de_xuat=round((n_dx + n_ex) / max(len(out), 1), 4),
        dan_o_DE_XUAT=int(np.nansum(pop_a * (out.screen_decision == "DE_XUAT").to_numpy())),
        dan_o_TU_CHOI=int(np.nansum(pop_a * (out.screen_decision == "TU_CHOI").to_numpy())),
        theo_loai_don_vi={
            k: {
                "n_o": int((kind == k).sum()),
                "DE_XUAT": int(((kind == k) & (out.screen_decision == "DE_XUAT")).sum()),
                "TU_CHOI": int(((kind == k) & (out.screen_decision == "TU_CHOI")).sum()),
            }
            for k in ("PHUONG", "XA", "DAC_KHU")
        },
        n_o_dac_khu=int((kind == "DAC_KHU").sum()),
        margin_median_m=round(float(np.nanmedian(margin)), 1),
        n_o_sat_nguong_100m=int((np.abs(margin) <= 100).sum()),
        n_tram_cao_tai=int(
            sum(1 for c in st.station_code if do_duoc.get(c, False) and util.get(c, 0) >= CAO_TAI)
        ),
    )
    r.check("all_cells_present", len(out) == len(df), f"{len(out)}/{len(df)}")
    r.check(
        "decision_matches_margin",
        bool(((out.screen_decision == "DE_XUAT") == (out.screen_margin_m > 0)).all()),
        "DE_XUAT khi và chỉ khi vượt ngưỡng — ngoại lệ nằm ở nhãn riêng",
    )
    r.check(
        "exception_only_in_xa",
        bool((kind[(out.screen_decision == "DE_XUAT_NEU_CO_DC").to_numpy()] == "XA").all()),
        "ngoại lệ cao tải chỉ áp cho Xã, đúng như rule",
    )
    r.write(quiet=True)
    print(
        f"   ĐỀ XUẤT {n_dx:,} · nếu có DC {n_ex:,} · TỪ CHỐI {n_tc:,} "
        f"({(n_dx + n_ex) / max(len(out), 1):.1%} ô có cửa)"
        + (f" · {int((kind == 'DAC_KHU').sum())} ô đặc khu" if (kind == "DAC_KHU").any() else "")
    )


STEP = Step(
    name="n08_screening",
    scope="province",
    version=VERSION,
    run=run,
    reads=(
        "src_vnsdi",
        "traveltime_cell",
        "population_cell",
        "station_occupancy",
        "grid_cell",
        "admin_communes",
        "stations",
    ),
    writes=(
        "screening_cell",
    ),
    desc="engine sàng lọc đơn xin đặt trạm, dựng thành lớp bản đồ theo tỉnh",
)
