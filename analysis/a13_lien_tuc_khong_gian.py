"""A13 — Chỗ khoảng cách "nhảy" giữa hai ô kề: rào cản thật hay lỗi neo?

Hai ô r8 kề nhau cách tâm ~0,8 km. Khoảng cách tới trạm gần nhất không thể nhảy tuỳ tiện
giữa chúng — trừ khi có thứ gì đó chắn đường. Chỉ có hai loại nguyên nhân:

  RÀO CẢN THẬT  — sông Hồng ít cầu, đường sắt, cao tốc không điểm cắt. Đây là tín hiệu ĐÚNG.
  LỖI NEO       — ô gắn vào đỉnh cụt, mảnh đồ thị đứt lìa, trạm sai toạ độ.

Điều làm phép kiểm này dùng được: Hà Nội có **đối chứng dương có sẵn**. Sông Hồng ở đó, ai
cũng biết. Nếu các chỗ nhảy xếp thành dải trùng lòng sông ⇒ phép đo chạy đúng. Nếu chúng rải
rác vô tổ chức ⇒ đó là nhiễu kỹ thuật.

ĐẾM thì vô nghĩa, phải GIẢI THÍCH. Nên ở đây không có ngưỡng "bao nhiêu phần trăm là hỏng" —
có ba phép thử nói lên nguyên nhân:

  1. Nhảy lớn có tập trung vào ô ven sông không (so với ô bất kỳ)?
  2. Nhảy lớn có đi kèm `detour_ratio` cao không? Đi vòng nhiều = có vật chắn.
  3. Sau khi trừ hai lời giải thích trên, còn lại bao nhiêu và chúng ở đâu?

Ghi: data/qa/critique/a13.json + a13_nhay.parquet (để vẽ bản đồ)
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd
from _common import CRITIQUE, ROOT, emit, grid

JUMP_M = 2_000.0
WATER_NEAR_M = 400.0  # ô có mặt nước trong bán kính này quanh tâm coi là "ven sông/hồ"


def main() -> None:
    import sys

    sys.path.insert(0, str(ROOT / "src"))

    g = grid().set_index("h3_r8")
    d = g.dist_station_network_m.to_dict()
    cells = list(g.index)

    # --- cặp ô kề -----------------------------------------------------------
    rows = []
    for c in cells:
        a = d.get(c)
        if a is None or not np.isfinite(a):
            continue
        for nb in h3.grid_disk(c, 1):
            if nb <= c or nb not in d:
                continue
            b = d[nb]
            if np.isfinite(b):
                rows.append((c, nb, abs(a - b)))
    J = pd.DataFrame(rows, columns=["a", "b", "jump_m"])
    J["big"] = J.jump_m > JUMP_M

    # --- lời giải thích 1: mặt nước -----------------------------------------
    # `water_frac` đã có sẵn trong lưới (ESA WorldCover). Ô ven sông Hồng có water_frac cao;
    # nhưng cầu nằm ở ô KHÔNG nhiều nước, nên xét cả ô kề để bắt được "sát bờ".
    wf = g.water_frac.to_dict()
    near_water = {}
    for c in cells:
        vals = [wf.get(n, 0.0) for n in h3.grid_disk(c, 1) if n in wf]
        near_water[c] = max(vals) if vals else 0.0
    J["ven_nuoc"] = (J.a.map(near_water) > 0.10) | (J.b.map(near_water) > 0.10)

    # --- lời giải thích 2: đi vòng ------------------------------------------
    dr = g.detour_ratio.to_dict()
    J["detour_max"] = np.fmax(J.a.map(dr).astype(float), J.b.map(dr).astype(float))
    J["di_vong"] = J.detour_max > 2.0

    giai_thich = J.ven_nuoc | J.di_vong
    con_lai = J[J.big & ~giai_thich]

    # --- lời giải thích 3: còn lại thì vì sao -------------------------------
    # Ứng viên cuối: ô neo xa mạng đường bất thường (ngõ cụt dài, khu mới chưa map).
    off = g.road_access_offset_m.to_dict()
    con_lai = con_lai.assign(
        offset_max=np.fmax(con_lai.a.map(off).astype(float), con_lai.b.map(off).astype(float))
    )

    big = J[J.big]
    tong = len(J)
    p_big_all = float(J.big.mean())
    p_big_water = float(J[J.ven_nuoc].big.mean()) if J.ven_nuoc.any() else float("nan")
    p_big_dry = float(J[~J.ven_nuoc].big.mean())

    J.to_parquet(CRITIQUE / "a13_nhay.parquet", index=False)

    report = {
        "cau_hoi": "chỗ khoảng cách nhảy giữa hai ô kề là rào cản thật hay lỗi neo",
        "phuong_phap": (
            "mọi cặp ô r8 kề nhau (grid_disk k=1) cùng tới được; |Δ dist_station_network_m|; "
            "rồi thử giải thích bằng mặt nước và tỉ số đi vòng, KHÔNG bằng một ngưỡng tự đặt"
        ),
        "khoang_cach_tam_hai_o_ke_m": 800,
        "nguong_goi_la_nhay_m": JUMP_M,
        "0_phan_bo": {
            "n_cap_o_ke": tong,
            "trung_vi_m": round(float(J.jump_m.median()), 1),
            "p90_m": round(float(J.jump_m.quantile(0.9)), 1),
            "p99_m": round(float(J.jump_m.quantile(0.99)), 1),
            "max_m": round(float(J.jump_m.max()), 1),
            "n_nhay_lon": int(J.big.sum()),
            "share_nhay_lon": round(p_big_all, 4),
        },
        "1_doi_chung_duong_song_ho": {
            "share_nhay_lon_o_cap_VEN_NUOC": round(p_big_water, 4),
            "share_nhay_lon_o_cap_KHONG_ven_nuoc": round(p_big_dry, 4),
            "ti_le_tang": round(p_big_water / p_big_dry, 2) if p_big_dry > 0 else None,
            "dien_giai": (
                "nếu tỉ lệ tăng > 1 rõ rệt thì chỗ nhảy ĐANG bám vào rào cản thật — "
                "phép đo hoạt động đúng, không phải nhiễu"
            ),
        },
        "2_di_vong": {
            "detour_trung_vi_cap_NHAY": round(float(big.detour_max.median()), 3),
            "detour_trung_vi_cap_THUONG": round(float(J[~J.big].detour_max.median()), 3),
            "share_cap_nhay_co_detour_gt_2": round(float(big.di_vong.mean()), 4),
        },
        "3_con_lai_chua_giai_thich": {
            "n_cap": int(len(con_lai)),
            "share_tren_tong_cap_ke": round(len(con_lai) / tong, 5),
            "share_tren_so_nhay_lon": round(len(con_lai) / max(int(J.big.sum()), 1), 4),
            "offset_neo_trung_vi_m": round(float(con_lai.offset_max.median()), 1)
            if len(con_lai)
            else None,
            "offset_neo_trung_vi_TOAN_CUC_m": round(float(pd.Series(off).median()), 1),
            "vai_cap": con_lai.nlargest(10, "jump_m")[
                ["a", "b", "jump_m", "detour_max", "offset_max"]
            ].to_dict("records"),
        },
    }
    tot = (p_big_water > p_big_dry) and (len(con_lai) / tong < 0.02)
    report["ket_luan"] = [
        f"Nhảy trung vị {J.jump_m.median():.0f} m — đúng cỡ khoảng cách giữa hai tâm ô "
        f"(~800 m), nên bản thân việc 'nhảy' KHÔNG phải triệu chứng.",
        f"Cặp ven sông/hồ nhảy lớn ở tỉ lệ {p_big_water:.1%} so với {p_big_dry:.1%} ở cặp khô "
        f"— gấp {p_big_water / p_big_dry:.1f}× ⇒ chỗ nhảy bám vào rào cản thật.",
        f"Cặp nhảy lớn có đi vòng trung vị {big.detour_max.median():.2f}× so với "
        f"{J[~J.big].detour_max.median():.2f}× ở cặp thường.",
        f"Chưa giải thích được: {len(con_lai)} cặp = {len(con_lai) / tong:.2%} tổng số cặp kề.",
    ]
    emit("A13", "KHONG_HONG" if tot else "CANH_BAO", report)


if __name__ == "__main__":
    main()
