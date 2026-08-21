"""L8/A18 — Vì sao mọi đường cong nhịp trông giống nhau: audit cách GỘP từ dữ liệu THÔ.

Người dùng phản biện: "theo các graph tôi thấy thì cảm giác mọi lúc đều giống nhau… chưa
tận dụng hết data". Ba nghi ngờ, đo riêng:

  (a) `h168`/`d30` gộp bằng **ĐỈNH (max)**, không phải trung bình  → mọi đường bị kéo sát
      trần nên đương nhiên giống nhau. Metadata nguồn KHAI BÁO điều này; câu hỏi là tầng
      hiển thị của ta có tôn trọng không.
  (b) trục `dow`/`hour` là giờ địa phương hay UTC → nếu sai thì mọi đỉnh lệch 7 tiếng.
  (c) đường tổng hợp bị vài trạm lớn nuốt (trung bình có trọng số theo cổng).

Và câu hỏi thực thi: nguồn có ĐỦ DÀY để dựng tuần 10/15/20′ và tháng 15/30/60′ không —
hay đó chỉ là carry-forward được vẽ cho mượt.

Nguồn thô: aGiang-evcs/data/raw/evcs/load_ts.csv (CHỈ ĐỌC) — station_code, timestamp(ms), n_cars.

Ghi: data/qa/critique/a18_l8.json
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from _common import CRITIQUE, ROOT, emit, stations
from pyarrow import csv as pacsv

# PHẢI là file mà occ_profile_168.meta.json khai là nguồn. Thư mục cha còn `load_ts.csv`
# (508 MB) — một lượt crawl CŨ, ngắn hơn ~8,5 ngày. Đọc nhầm nó thì "tháng" chỉ phủ 23%
# và mọi kết luận về độ dày dữ liệu sẽ sai.
RAW_CSV = ROOT.parent / "aGiang-evcs/data/raw/evcs/timeseries_runs/load_ts_2026-07-29-full.csv"
TZ_MS = 7 * 3_600_000
CARRY_MS = 60 * 60_000
GRID_MS = 300_000


def doc_tho(codes: set[str]) -> pd.DataFrame:
    """Đọc CSV 508 MB theo lô, chỉ giữ trạm Hà Nội."""
    rd = pacsv.open_csv(
        RAW_CSV,
        read_options=pacsv.ReadOptions(block_size=64 << 20),
        convert_options=pacsv.ConvertOptions(
            column_types={
                "station_code": "string",
                "timestamp": "int64",
                "n_cars_charging": "int32",
            }
        ),
    )
    keep, n_all = [], 0
    for batch in rd:
        n_all += batch.num_rows
        t = batch.to_pandas()
        t = t[t.station_code.isin(codes)]
        if len(t):
            keep.append(t)
    df = pd.concat(keep, ignore_index=True)
    df = df.sort_values(["station_code", "timestamp"], kind="stable").reset_index(drop=True)
    df.attrs["rows_all"] = n_all
    return df


def gaps(df: pd.DataFrame) -> np.ndarray:
    """Khoảng cách tới quan sát KẾ TIẾP của cùng trạm (ms); quan sát cuối = NaN."""
    g = df.groupby("station_code", sort=False).timestamp
    return (g.shift(-1) - df.timestamp).to_numpy(dtype="float64")


def main() -> None:
    st = stations()
    hn = st[st.scope == "HANOI"]
    codes = set(hn.station_code)
    print(f"trạm Hà Nội: {len(codes)}")

    df = doc_tho(codes)
    d = gaps(df)
    fin = np.isfinite(d)
    print(f"dòng thô toàn quốc {df.attrs['rows_all']:,} → Hà Nội {len(df):,}")

    # ---------- (1) NHỊP LẤY MẪU THẬT -------------------------------------
    q = np.nanpercentile(d[fin], [5, 25, 50, 75, 90, 95, 99])
    t0, t1 = int(df.timestamp.min()), int(df.timestamp.max())
    # Độ dài cửa sổ quyết định cửa sổ "tháng" có tồn tại hay không. Đo trên chính dữ liệu,
    # không tin nhãn "30 ngày" của tầng trên.
    span_ngay = (t1 - t0) / 86_400_000
    ngay_co_dl = (
        pd.to_datetime(df.timestamp + TZ_MS, unit="ms").dt.floor("D").nunique()  # theo giờ VN
    )
    nhip = {
        "n_quan_sat_ha_noi": int(len(df)),
        "n_tram_co_du_lieu": int(df.station_code.nunique()),
        "bat_dau_utc": pd.to_datetime(t0, unit="ms", utc=True).isoformat(),
        "ket_thuc_utc": pd.to_datetime(t1, unit="ms", utc=True).isoformat(),
        "do_dai_cua_so_ngay": round(span_ngay, 2),
        "so_ngay_lich_co_du_lieu": int(ngay_co_dl),
        "khoang_cach_quan_sat_phut": {
            "p5": round(q[0] / 60000, 2),
            "p25": round(q[1] / 60000, 2),
            "trung_vi": round(q[2] / 60000, 2),
            "p75": round(q[3] / 60000, 2),
            "p90": round(q[4] / 60000, 2),
            "p95": round(q[5] / 60000, 2),
            "p99": round(q[6] / 60000, 2),
        },
        "share_khoang_le_5p": round(float((d[fin] <= GRID_MS).mean()), 4),
        "share_khoang_le_10p": round(float((d[fin] <= 2 * GRID_MS).mean()), 4),
        "share_khoang_le_15p": round(float((d[fin] <= 3 * GRID_MS).mean()), 4),
        "share_khoang_le_30p": round(float((d[fin] <= 6 * GRID_MS).mean()), 4),
        "share_khoang_le_60p": round(float((d[fin] <= CARRY_MS).mean()), 4),
        "share_khoang_gt_60p_bi_bo": round(float((d[fin] > CARRY_MS).mean()), 4),
    }

    # ---------- (2) ĐỘ PHỦ THẬT Ở TỪNG ĐỘ PHÂN GIẢI -----------------------
    # Ô được coi là CÓ DỮ LIỆU nếu có ít nhất một quan sát RESOLVED phủ lên nó.
    # "quan sát gốc" = ô chứa đúng mốc lấy mẫu; phần còn lại là CARRY (nội suy bậc thang).
    ts = df.timestamp.to_numpy(np.int64)
    dur = np.where(fin, np.minimum(d, CARRY_MS), 0).astype(np.int64)
    resolved = fin & (d <= CARRY_MS)
    t_end = int(ts.max())
    sid_all, uniq = pd.factorize(df.station_code)

    phu = {}
    for ten, o_ms, n_o in [
        ("ngay_5p", 300_000, 288),
        ("tuan_10p", 600_000, 7 * 144),
        ("tuan_15p", 900_000, 7 * 96),
        ("tuan_20p", 1_200_000, 7 * 72),
        ("thang_15p", 900_000, 30 * 96),
        ("thang_30p", 1_800_000, 30 * 48),
        ("thang_60p", 3_600_000, 30 * 24),
    ]:
        goc = ((t_end + TZ_MS) // o_ms) - n_o + 1
        # ô có QUAN SÁT GỐC
        i0 = (ts + TZ_MS) // o_ms - goc
        m0 = (i0 >= 0) & (i0 < n_o)
        o_goc = len(np.unique(i0[m0]))
        # ô được phủ nhờ CARRY (trải khoảng resolved ra mọi ô nó chạm)
        sel = resolved & m0
        a = (ts[sel] + TZ_MS) // o_ms - goc
        b = (ts[sel] + np.maximum(dur[sel], 1) - 1 + TZ_MS) // o_ms - goc
        cov = np.zeros(n_o, bool)
        for lo, hi in zip(a, np.minimum(b, n_o - 1)):
            if hi >= 0:
                cov[max(lo, 0) : hi + 1] = True
        # Độ phủ GỘP MỌI TRẠM gần như luôn là 100% và vì thế vô nghĩa — chỉ cần MỘT trạm có
        # số liệu là ô được tính. Thứ quyết định vẽ được hay không là độ phủ TỪNG TRẠM.
        s_ = pd.DataFrame({"s": sid_all[m0], "i": i0[m0]}).drop_duplicates()
        per = s_.groupby("s").size() / n_o
        phu[ten] = {
            "n_o": n_o,
            "do_dai_o_phut": o_ms // 60000,
            "gop_moi_tram__o_co_quan_sat": int(o_goc),
            "gop_moi_tram__share": round(o_goc / n_o, 4),
            "gop_moi_tram__share_ke_ca_carry": round(float(cov.mean()), 4),
            "tung_tram__share_o_trung_vi": round(float(per.median()), 4),
            "tung_tram__share_o_p10": round(float(per.quantile(0.1)), 4),
            "tung_tram__n_tram_phu_tren_80pct": int((per >= 0.8).sum()),
            "tung_tram__n_tram_phu_duoi_50pct": int((per < 0.5).sum()),
        }

    # ---------- (3) MÚI GIỜ: dựng lại hồ sơ 168 với hai giả thuyết ---------
    p = pq.read_table(ROOT / "data/processed/station_occupancy_profile_168h.parquet").to_pandas()
    sid = sid_all
    w = dur.astype(np.float64)
    val = df.n_cars_charging.to_numpy(np.float64)
    ok = resolved

    def dung_ho_so(off_ms: int) -> pd.DataFrame:
        loc = (ts[ok] + off_ms) // 3_600_000
        dow = ((loc // 24) + 4) % 7  # epoch 1/1/1970 = thứ Năm ⇒ +4 để Thứ Hai = 0
        hour = loc % 24
        k = pd.DataFrame({"s": sid[ok], "dow": dow, "hour": hour, "v": val[ok] * w[ok], "w": w[ok]})
        a = k.groupby(["s", "dow", "hour"], sort=False)[["v", "w"]].sum()
        a["m"] = a.v / a.w
        a = a.reset_index()
        a["station_code"] = uniq[a.s.to_numpy()]
        return a[["station_code", "dow", "hour", "m"]]

    tz_test = {}
    for lab, off in [("UTC+7_dia_phuong", TZ_MS), ("UTC+0", 0)]:
        a = dung_ho_so(off)
        j = p.merge(a, on=["station_code", "dow", "hour"], how="inner")
        # tương quan HÌNH DẠNG theo từng trạm (bất biến với mẫu số) rồi lấy trung vị
        r = (
            j.groupby("station_code")
            .apply(lambda x: x.occ.corr(x.m) if len(x) > 20 else np.nan, include_groups=False)
            .dropna()
        )
        tz_test[lab] = {
            "n_o_doi_chieu": int(len(j)),
            "n_tram": int(len(r)),
            "tuong_quan_trung_vi": round(float(r.median()), 4),
            "share_tram_r_gt_0_9": round(float((r > 0.9).mean()), 4),
        }

    # ---------- (4) ĐỈNH vs TRUNG BÌNH: chênh bao nhiêu -------------------
    def gop(o_ms: int, n_o: int, how: str) -> np.ndarray:
        goc = ((t_end + TZ_MS) // o_ms) - n_o + 1
        i = (ts + TZ_MS) // o_ms - goc
        m = ok & (i >= 0) & (i < n_o)
        k = pd.DataFrame({"s": sid[m], "i": i[m], "v": val[m], "w": w[m]})
        if how == "dinh":
            a = k.groupby(["s", "i"]).v.max()
        elif how == "tb":
            k["vw"] = k.v * k.w
            gg = k.groupby(["s", "i"])[["vw", "w"]].sum()
            a = gg.vw / gg.w
        else:
            a = k.groupby(["s", "i"]).v.median()
        out = np.full((len(uniq), n_o), np.nan)
        idx = a.index.to_frame().to_numpy()
        out[idx[:, 0], idx[:, 1]] = a.to_numpy()
        return out

    cmp_gop = {}
    for ten, o_ms, n_o in [("gio_168", 3_600_000, 168), ("ngay_30", 86_400_000, 30)]:
        A, B = gop(o_ms, n_o, "dinh"), gop(o_ms, n_o, "tb")
        m = np.isfinite(A) & np.isfinite(B)
        ca, cb = np.nanmean(np.where(m, A, np.nan), 0), np.nanmean(np.where(m, B, np.nan), 0)
        cmp_gop[ten] = {
            "dinh_trung_binh": round(float(A[m].mean()), 3),
            "trung_binh_trung_binh": round(float(B[m].mean()), 3),
            "ti_le_dinh_tren_tb": round(float(A[m].mean() / B[m].mean()), 3),
            "bien_thien_duong_cong_tong_hop_CV": {
                "dinh": round(float(np.nanstd(ca) / np.nanmean(ca)), 4),
                "trung_binh": round(float(np.nanstd(cb) / np.nanmean(cb)), 4),
            },
        }

    # ---------- (5) TRẠM LỚN CÓ NUỐT ĐƯỜNG TỔNG HỢP KHÔNG ----------------
    np_ports = hn.set_index("station_code").n_ports
    H = gop(3_600_000, 168, "dinh")
    ports = np_ports.reindex(uniq).fillna(1).clip(lower=1).to_numpy()
    big = ports >= np.nanpercentile(ports, 90)
    with np.errstate(invalid="ignore"):
        curve_all = np.nanmean(H, 0)
        curve_w = np.nansum(H * ports[:, None], 0) / np.nansum(np.isfinite(H) * ports[:, None], 0)
        curve_small = np.nanmean(H[~big], 0)
        curve_big = np.nanmean(H[big], 0)
    hh = np.arange(168) % 24

    def dinh_gio(c):
        by = pd.Series(c).groupby(hh).mean()
        return int(by.idxmax())

    nuot = {
        "n_tram_lon_top10pct": int(big.sum()),
        "cong_trung_vi_tram_lon": float(np.nanmedian(ports[big])),
        "cong_trung_vi_tram_nho": float(np.nanmedian(ports[~big])),
        "gio_dinh_trung_binh_khong_trong_so": dinh_gio(curve_all),
        "gio_dinh_co_trong_so_cong": dinh_gio(curve_w),
        "gio_dinh_chi_tram_lon": dinh_gio(curve_big),
        "gio_dinh_chi_tram_nho": dinh_gio(curve_small),
        "tuong_quan_duong_tongtrongso_vs_tramlon": round(
            float(pd.Series(curve_w).corr(pd.Series(curve_big))), 4
        ),
        "tuong_quan_duong_tongtrongso_vs_tramnho": round(
            float(pd.Series(curve_w).corr(pd.Series(curve_small))), 4
        ),
    }

    # ---------- (6) GỘP CÓ TRIỆT TIÊU NHỊP KHÔNG --------------------------
    # Giả thuyết mạnh nhất cho "mọi lúc đều giống nhau": từng trạm CÓ nhịp rõ, nhưng các trạm
    # LỆCH PHA nhau, nên trung bình cộng triệt tiêu biên độ. Kiểm bằng cách so biên độ tương
    # đối của TỪNG trạm với biên độ của đường đã gộp.
    mu = np.nanmean(H, axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        Hn = H / mu  # chuẩn hoá theo chính trạm ⇒ bỏ ảnh hưởng quy mô
        cv_tram = np.nanstd(H, axis=1) / mu[:, 0]
    du = np.isfinite(H).sum(axis=1) >= 120  # đủ ô mới xét hình dạng
    curve_shape = np.nanmean(Hn[du], axis=0)  # trung bình các HÌNH DẠNG
    cv_tong_tho = float(np.nanstd(curve_all) / np.nanmean(curve_all))
    cv_tong_shape = float(np.nanstd(curve_shape) / np.nanmean(curve_shape))

    # Trạm có thể rỗng trọn một giờ-trong-ngày ⇒ nhóm toàn NaN ⇒ idxmax ném lỗi. Bỏ qua trạm
    # đó thay vì để cả script chết; số trạm bị bỏ được báo cáo chứ không im lặng.
    gio_dinh_tram, bo_qua = [], 0
    for i in np.flatnonzero(du):
        s = pd.Series(Hn[i]).groupby(hh).mean()
        if s.notna().any():
            gio_dinh_tram.append(int(s.idxmax()))
        else:
            bo_qua += 1
    gio_dinh_tram = np.asarray(gio_dinh_tram)
    phan_bo_dinh = pd.Series(gio_dinh_tram).value_counts().sort_index()

    triet_tieu = {
        "n_tram_du_o": int(du.sum()),
        "n_tram_bo_qua_vi_thieu_gio": int(bo_qua),
        "CV_tung_tram_trung_vi": round(float(np.nanmedian(cv_tram[du])), 4),
        "CV_duong_da_gop_tho": round(cv_tong_tho, 4),
        "CV_duong_da_gop_theo_hinh_dang": round(cv_tong_shape, 4),
        "ti_le_biên_do_bi_mat": round(1 - cv_tong_tho / float(np.nanmedian(cv_tram[du])), 4),
        "gio_dinh_theo_hinh_dang": int(pd.Series(curve_shape).groupby(hh).mean().idxmax()),
        "phan_bo_gio_dinh_tung_tram": {int(k): int(v) for k, v in phan_bo_dinh.items()},
        "share_tram_dinh_trong_22_23_0h": round(
            float(np.isin(gio_dinh_tram, [22, 23, 0]).mean()), 4
        ),
        "so_gio_khac_nhau_lam_dinh": int(len(phan_bo_dinh)),
    }

    # ---------- (7) `max` CÓ BỊ BÃO HOÀ KHÔNG -----------------------------
    # Với nhịp 5 phút, một ô GIỜ chứa ~12 quan sát. Nếu trạm chạm mức cao nhất của nó ở hầu
    # hết các giờ thì `max` sẽ ra CÙNG một số ở mọi giờ — đường cong phẳng KHÔNG phải vì nhu
    # cầu đều, mà vì phép gộp mất khả năng phân biệt. Đối chứng: cùng dữ liệu, gộp TRUNG BÌNH.
    Hm = gop(3_600_000, 168, "tb")
    with np.errstate(invalid="ignore"):
        tran = np.nanmax(H, axis=1, keepdims=True)
        cham_tran = np.nanmean(H == tran, axis=1)  # tỉ lệ ô giờ chạm đúng trần của trạm
        cv_tram_tb = np.nanstd(Hm, axis=1) / np.nanmean(Hm, axis=1)
        Hmn = Hm / np.nanmean(Hm, axis=1, keepdims=True)

    def dinh_tung_tram(M):
        out = []
        for i in np.flatnonzero(du):
            s = pd.Series(M[i]).groupby(hh).mean()
            if s.notna().any():
                out.append(int(s.idxmax()))
        return np.asarray(out)

    dinh_max, dinh_tb = dinh_tung_tram(Hn), dinh_tung_tram(Hmn)

    def tan_man(x):
        """Độ tản mạn TRÒN của giờ đỉnh: 0 = mọi trạm cùng giờ, 1 = rải đều quanh đồng hồ."""
        a = x / 24 * 2 * np.pi
        return round(float(1 - np.hypot(np.cos(a).mean(), np.sin(a).mean())), 4)

    bao_hoa = {
        "share_o_gio_cham_tran_cua_tram__trung_vi": round(float(np.nanmedian(cham_tran[du])), 4),
        "n_tram_cham_tran_tren_50pct_so_o": int((cham_tran[du] > 0.5).sum()),
        "CV_tung_tram__gop_MAX": round(float(np.nanmedian(cv_tram[du])), 4),
        "CV_tung_tram__gop_TRUNG_BINH": round(float(np.nanmedian(cv_tram_tb[du])), 4),
        "tan_man_gio_dinh__gop_MAX": tan_man(dinh_max),
        "tan_man_gio_dinh__gop_TRUNG_BINH": tan_man(dinh_tb),
        "gio_dinh_hinh_dang__gop_MAX": int(pd.Series(curve_shape).groupby(hh).mean().idxmax()),
        "gio_dinh_hinh_dang__gop_TRUNG_BINH": int(
            pd.Series(np.nanmean(Hmn[du], axis=0)).groupby(hh).mean().idxmax()
        ),
        "dien_giai": (
            "tản mạn gần 1 = giờ đỉnh rải đều quanh đồng hồ (không có nhịp chung); "
            "nếu MAX tản mạn hơn hẳn TRUNG BÌNH thì phẳng là do PHÉP GỘP, không do dữ liệu"
        ),
    }

    # --- xuất lưới MỊN để notebook vẽ mà không phải đọc lại CSV 1 GB --------
    # Đây chính là các độ phân giải người dùng yêu cầu; xuất cả hai cách gộp để so trực tiếp.
    for ten, o_ms, n_o in [("tuan_15p", 900_000, 672), ("thang_60p", 3_600_000, 720)]:
        np.save(CRITIQUE / f"l8_{ten}_dinh.npy", gop(o_ms, n_o, "dinh").astype(np.float32))
        np.save(CRITIQUE / f"l8_{ten}_tb.npy", gop(o_ms, n_o, "tb").astype(np.float32))
    np.save(CRITIQUE / "l8_h168_tb.npy", Hm.astype(np.float32))

    # lưu đường cong để notebook vẽ lại mà không phải đọc CSV 1 GB
    pd.DataFrame(
        {
            "gio_tuan": np.arange(168),
            "hour": hh,
            "dinh_khong_trong_so": curve_all,
            "dinh_trong_so_cong": curve_w,
            "chi_tram_lon": curve_big,
            "chi_tram_nho": curve_small,
            "trung_binh_hinh_dang": curve_shape,
        }
    ).to_parquet(CRITIQUE / "l8_duong_cong_168.parquet", index=False)
    np.save(CRITIQUE / "l8_h168_dinh.npy", H)
    pd.Series(uniq).to_frame("station_code").to_parquet(
        CRITIQUE / "l8_station_index.parquet", index=False
    )

    tz_ok = (
        tz_test["UTC+7_dia_phuong"]["tuong_quan_trung_vi"] > tz_test["UTC+0"]["tuong_quan_trung_vi"]
    )
    report = {
        "cau_hoi": "vì sao đường cong nhịp trông giống nhau; nguồn có đủ dày cho 10/15/20′ không",
        "nguon_tho": str(RAW_CSV),
        "1_nhip_lay_mau": nhip,
        "2_do_phu_theo_do_phan_giai": phu,
        "3_mui_gio": {
            "phuong_phap": "dựng lại hồ sơ 168 với UTC+7 và UTC+0, so tương quan hình dạng "
            "với bảng đã build",
            "ket_qua": tz_test,
            "ket_luan": "giờ ĐỊA PHƯƠNG (UTC+7)" if tz_ok else "NGHI VẤN — UTC+0 khớp hơn",
        },
        "4_dinh_vs_trung_binh": cmp_gop,
        "5_tram_lon_nuot_duong_tong_hop": nuot,
        "6_gop_triet_tieu_nhip": triet_tieu,
        "7_max_co_bao_hoa_khong": bao_hoa,
    }
    verdict = "CANH_BAO"
    if not tz_ok:
        verdict = "HONG"
    report["ket_luan"] = [
        f"Cửa sổ thật: {nhip['do_dai_cua_so_ngay']:.1f} ngày "
        f"({nhip['so_ngay_lich_co_du_lieu']} ngày lịch có dữ liệu).",
        f"Nhịp lấy mẫu thật: trung vị {nhip['khoang_cach_quan_sat_phut']['trung_vi']:.1f} phút, "
        f"p90 {nhip['khoang_cach_quan_sat_phut']['p90']:.1f} phút — "
        f"{nhip['share_khoang_le_5p']:.1%} số khoảng ≤ 5 phút.",
        f"Múi giờ: {report['3_mui_gio']['ket_luan']}.",
        f"Gộp ĐỈNH cho giá trị lớn hơn trung bình {cmp_gop['gio_168']['ti_le_dinh_tren_tb']:.2f}× "
        f"ở ô giờ; CV đường tổng hợp đỉnh {cmp_gop['gio_168']['bien_thien_duong_cong_tong_hop_CV']['dinh']:.3f} "
        f"vs trung bình {cmp_gop['gio_168']['bien_thien_duong_cong_tong_hop_CV']['trung_binh']:.3f}.",
        f"Giờ đỉnh: không trọng số {nuot['gio_dinh_trung_binh_khong_trong_so']}h · "
        f"trọng số cổng {nuot['gio_dinh_co_trong_so_cong']}h · "
        f"trạm lớn {nuot['gio_dinh_chi_tram_lon']}h · trạm nhỏ {nuot['gio_dinh_chi_tram_nho']}h.",
        f"Biên độ: từng trạm CV trung vị {triet_tieu['CV_tung_tram_trung_vi']:.3f}, "
        f"đường đã gộp CV {triet_tieu['CV_duong_da_gop_tho']:.3f} — "
        f"mất {triet_tieu['ti_le_biên_do_bi_mat']:.1%} biên độ khi gộp; "
        f"đỉnh của từng trạm rải ra {triet_tieu['so_gio_khac_nhau_lam_dinh']} giờ khác nhau.",
        f"Bão hoà MAX: {bao_hoa['share_o_gio_cham_tran_cua_tram__trung_vi']:.1%} số ô giờ chạm "
        f"đúng trần của trạm; tản mạn giờ đỉnh MAX {bao_hoa['tan_man_gio_dinh__gop_MAX']:.3f} "
        f"vs TRUNG BÌNH {bao_hoa['tan_man_gio_dinh__gop_TRUNG_BINH']:.3f}.",
    ]
    emit("A18_L8", verdict, report)


if __name__ == "__main__":
    main()
