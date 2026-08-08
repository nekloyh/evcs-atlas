"""B6 — Occupancy: mức sử dụng thật của từng trạm Hà Nội.

Đây là tài sản dữ liệu KHÔNG nguồn nào khác có — telemetry evcs.vn 30 ngày, cửa sổ chốt ở
ảnh chụp ``evcs_vn_2026-07-29-full``. ev-crawl cũng đọc được luồng Socket.IO này nhưng phải
quét lại từ đầu; bảng đã dựng sẵn tốt hơn về mọi mặt (dài hơn, đã kiểm chất lượng).

Bảng nguồn có ~15 biến thể của CÙNG một khái niệm "mức bận" (``occ_twa``, ``occ_twa_hb``,
``occ_p50``, ``util``, ``util_hb``, ``load_factor``…). Ở đây mỗi khái niệm chỉ còn một
trường:

  mức sử dụng trung bình  → ``util``          (bỏ occ_twa/occ_twa_hb/util_hb/occ_p50/load_factor)
  mức sử dụng đỉnh        → ``util_p95``      (bỏ occ_p95/occ_max)
  tỉ lệ thời gian kín chỗ → ``saturation_frac`` (bỏ hours_at_full)
  chất lượng quan sát     → ``grade`` + ``coverage`` (bỏ n_obs/resolved_h/max_gap_h/…)

``util_pctl`` được TÍNH LẠI trong phạm vi Hà Nội. Bản gốc ``occ_pctl`` là phân vị trên lớp
tham chiếu TOÀN QUỐC — vô nghĩa trong một bộ dữ liệu không bao giờ nhìn ra ngoài Hà Nội.

Sinh:
  data/processed/station_occupancy.parquet
  data/processed/station_occupancy_profile_168h.parquet
  data/qa/s06_occupancy.json
"""

from __future__ import annotations

import json

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from . import paths

KEEP = {
    "station_code": "station_code",
    "util": "util",
    "util_p95": "util_p95",
    "sat_frac": "saturation_frac",
    "duty_cycle": "duty_cycle",
    "grade": "grade",
    "coverage": "coverage",
    "obs_days": "obs_days",
    "util_reportable": "util_reportable",
    "occ_status": "occ_status",
    "shape_class": "shape_class",
    "peak_hour": "peak_hour",
    "peak_dow": "peak_dow",
    "night_share": "night_share",
    "weekend_ratio": "weekend_ratio",
    "n_ports": "util_denominator_ports",
    "ever_active": "ever_active",
}

# ``urban_rural`` của repo cũ KHÔNG phải ước lượng mật độ — audit trên toàn bộ 19.426 trạm
# toàn quốc cho thấy nó là ánh xạ xác định từ LOẠI ĐƠN VỊ HÀNH CHÍNH: PHUONG→urban,
# DAC_KHU→urban, XA→rural, không một ô nào lệch khỏi đường chéo.
#
# Ở đây trường đó được DỰNG LẠI từ nguồn trong chính repo — tiền tố của ``commune_name``
# lấy từ VNSDI (hiệu lực 16/6/2025) — chứ không chép lại nhãn kế thừa, rồi ĐỐI CHIẾU với
# nhãn cũ như một phép kiểm. Tên tiếng Anh "urban/rural" bị bỏ vì nó gợi ý một ước lượng;
# ``commune_kind`` với giá trị PHUONG/XA nói đúng nó là gì.


def main() -> None:
    st = pq.read_table(paths.PROCESSED / "stations.parquet").to_pandas()
    hn_codes = set(st[st.scope == "HANOI"].station_code)

    o = pq.read_table(paths.SRC_OCC_STATION).to_pandas()
    o = o[o.station_code.isin(hn_codes)].copy()

    win_start = pd.to_datetime(o.window_start.min(), unit="ms", utc=True)
    win_end = pd.to_datetime(o.window_end.max(), unit="ms", utc=True)
    snapshot = str(o.snapshot_id.iloc[0]) if len(o) else None

    out = o[[c for c in KEEP if c in o.columns]].rename(columns=KEEP).copy()
    out["current_type"] = out.station_code.map(dict(zip(st.station_code, st.current_type)))

    # --- loại đơn vị hành chính, dựng lại từ VNSDI ---------------------------
    cname = dict(zip(st.station_code, st.commune_name))
    out["commune_kind"] = pd.Series(
        [
            None
            if pd.isna(cname.get(c))
            else ("PHUONG" if str(cname.get(c)).startswith("Phường") else "XA")
            for c in out.station_code
        ],
        dtype="string",
        index=out.index,
    )
    # phép kiểm: nhãn dựng lại phải khớp 100% nhãn kế thừa
    _old = o.set_index("station_code").urban_rural if "urban_rural" in o.columns else None
    _map = {"PHUONG": "urban", "XA": "rural"}
    kind_agree = (
        bool(
            (out.commune_kind.map(_map) == out.station_code.map(_old))[
                out.commune_kind.notna() & out.station_code.map(_old).notna()
            ].all()
        )
        if _old is not None
        else None
    )

    # --- phân vị TRONG Hà Nội, chỉ trên trạm đo được tin cậy ------------------
    ok = (out.grade == "GOOD") & out.util_reportable & out.util.notna()
    out["util_pctl"] = pd.NA
    grp = out.loc[ok].groupby(out.loc[ok, "current_type"].astype("string"), dropna=False)
    out.loc[ok, "util_pctl"] = grp.util.rank(pct=True) * 100
    out["util_pctl"] = pd.to_numeric(out.util_pctl, errors="coerce")
    out["util_pctl_peer"] = pd.Series(
        [f"HANOI|{c}" if k else pd.NA for c, k in zip(out.current_type.astype("string"), ok)],
        dtype="string",
        index=out.index,
    )

    out["window_start_utc"] = win_start.isoformat()
    out["window_end_utc"] = win_end.isoformat()
    out["snapshot_id"] = snapshot
    for c in ("station_code", "grade", "occ_status", "shape_class", "commune_kind", "current_type"):
        if c in out:
            out[c] = out[c].astype("string")
    out = out.sort_values("station_code").reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False),
        paths.PROCESSED / "station_occupancy.parquet",
    )

    # --- hồ sơ 168 giờ (dow × hour) -----------------------------------------
    p = pq.read_table(paths.SRC_OCC_PROFILE_168).to_pandas()
    p = p[p.station_code.isin(hn_codes)].copy()
    p = p[["station_code", "dow", "hour", "occ", "observed_h", "n_obs"]]
    p["station_code"] = p.station_code.astype("string")
    p = p.sort_values(["station_code", "dow", "hour"]).reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(p, preserve_index=False),
        paths.PROCESSED / "station_occupancy_profile_168h.parquet",
    )

    # --- QA ------------------------------------------------------------------
    checks = []

    def chk(name, ok_, detail=""):
        checks.append({"name": name, "status": "PASS" if ok_ else "FAIL", "detail": detail})

    chk("station_code_unique", out.station_code.is_unique, f"{len(out)} trạm")
    chk("all_codes_are_hanoi", bool(out.station_code.isin(hn_codes).all()), "")
    chk("util_in_0_1", bool(out.util.dropna().between(0, 1).all()), "")
    chk(
        "pctl_only_on_good_grade",
        bool(out.loc[out.util_pctl.notna(), "grade"].eq("GOOD").all()),
        f"{int(out.util_pctl.notna().sum())} trạm có phân vị",
    )
    chk(
        "profile_cells_le_168",
        bool(p.groupby("station_code").size().max() <= 168),
        f"max {int(p.groupby('station_code').size().max())} ô/trạm",
    )
    cov = len(out) / max(len(hn_codes), 1)
    chk("occ_covers_most_stations", cov > 0.9, f"{len(out)}/{len(hn_codes)} = {cov:.1%}")
    chk(
        "commune_kind_matches_inherited_label",
        kind_agree is not False,
        "PHUONG/XA dựng từ VNSDI khớp 100% nhãn urban_rural kế thừa"
        if kind_agree
        else "không đối chiếu được (nguồn thiếu urban_rural)",
    )

    report = {
        "layer": "occupancy",
        "source": "aGiang-evcs data/interim/occ (telemetry evcs.vn)",
        "snapshot_id": snapshot,
        "window_utc": [win_start.isoformat(), win_end.isoformat()],
        "stats": {
            "n_stations_hanoi_total": len(hn_codes),
            "n_stations_with_occ": int(len(out)),
            "n_profile_rows": int(len(p)),
            "grade": out.grade.value_counts(dropna=False).to_dict(),
            "occ_status": out.occ_status.value_counts(dropna=False).to_dict(),
            "util_mean": round(float(out.util.mean()), 4),
            "util_median": round(float(out.util.median()), 4),
            "util_p90_of_stations": round(float(out.util.quantile(0.9)), 4),
            "saturation_frac_mean": round(float(out.saturation_frac.mean()), 4),
            "n_with_pctl": int(out.util_pctl.notna().sum()),
            "shape_class": out.shape_class.value_counts(dropna=False).to_dict(),
            "commune_kind": {
                str(k): int(v) for k, v in out.commune_kind.value_counts(dropna=False).items()
            },
        },
        "checks": checks,
    }
    (paths.QA / "s06_occupancy.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
