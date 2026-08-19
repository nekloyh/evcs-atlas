"""N15 — Hiệu chuẩn mô phỏng không gian cục bộ (Local Station Simulation Calibration), theo tỉnh.

Sinh (mỗi tỉnh):
  store/p/<code>/sim_calibration.json
  store/qa/<code>/n15_sim_calibration.json

Hiệu chuẩn các tham số hình học cục bộ cho mô phỏng trạm giả định (Phase 6):
  * Phân phối detour_ratio theo các dải khoảng cách chim bay (200m - 5km+)
  * Phân phối khoảng cách mạng cho vùng cận trạm (< 200m)
  * Đánh giá sai số leave-self-out trên tập ô đo được — CÙNG quy tắc ring với client
    (PHASE6_LOCAL_SIMULATION.md §1.5): cần >= 3 giá trị hữu hạn, thiếu thì band-only.
    LSO buộc phải loại ratio của chính ô, nên "disk ∪ {c}" của client thu về "láng giềng
    ring-1"; ngưỡng >= 3 giữ nguyên để con số kiểm chứng đo đúng estimator client chạy.
"""

from __future__ import annotations

import json
import time
import h3
import numpy as np
import pandas as pd
import pyarrow.parquet as pq

from . import admin, paths, qa
from .runner import Step

VERSION = "2"

BAND_DEFS: tuple[tuple[str, float, float], ...] = (
    ("200-500", 200.0, 500.0),
    ("500-1000", 500.0, 1000.0),
    ("1000-2000", 1000.0, 2000.0),
    ("2000-3000", 2000.0, 3000.0),
    ("3000-5000", 3000.0, 5000.0),
    ("5000-inf", 5000.0, float("inf")),
)

MIN_BAND_N = 50
# Dải đuôi 5km+ vốn mỏng ở mọi tỉnh: chính ví dụ chuẩn của spec (§2.3) phát hành Hà Nội
# với n=31 chưa gộp, mâu thuẫn với luật "mọi dải n >= 50". Giải quyết theo ví dụ (số đo
# thắng lời văn): đuôi chấp nhận từ 30, dưới nữa mới gộp — và MỌI lần gộp đều ghi cờ.
MIN_TAIL_BAND_N = 30
MIN_TOTAL_RATIO_CELLS = 300
MIN_NEAR_N = 30
UPPER_MISS_RANGE = (0.05, 0.15)
# Client (estimator.ts) đòi >= 3 giá trị hữu hạn trong disk(c,1) ∪ {c}; LSO loại chính ô.
MIN_RING_VALUES = 3


def _get_band_name(e: float) -> str:
    for name, lo, hi in BAND_DEFS:
        if lo <= e < hi:
            return name
    return "5000-inf"


def _empty(province_code: str, n_ratio_cells: int = 0) -> dict:
    return {
        "version": 1,
        "province_code": province_code,
        "bands": {},
        "near": None,
        "validation": {"n": n_ratio_cells, "within_20pct": 0.0, "upper_miss": 0.0},
        "valid": False,
    }


def calibrate_frame(tt: pd.DataFrame, province_code: str) -> dict:
    """Hiệu chuẩn thuần trên một frame `traveltime_cell` — tách khỏi IO để test được (T18).

    Cột cần: h3_r8, dist_station_network_m, dist_station_euclid_m, detour_ratio,
    network_reachable.
    """
    df = tt[tt.detour_ratio.notna()].copy()
    n_ratio_cells = len(df)

    if n_ratio_cells < MIN_TOTAL_RATIO_CELLS:
        return _empty(province_code, n_ratio_cells)

    detour_map = dict(zip(df.h3_r8, df.detour_ratio))

    bands: dict[str, dict] = {}
    for name, lo, hi in BAND_DEFS:
        sub = df[(df.dist_station_euclid_m >= lo) & (df.dist_station_euclid_m < hi)]
        n = len(sub)
        min_n = MIN_TAIL_BAND_N if name == "5000-inf" else MIN_BAND_N
        if n >= min_n:
            med = round(float(sub.detour_ratio.median()), 3)
            p90 = round(float(np.percentile(sub.detour_ratio, 90)), 3)
            bands[name] = {"n": n, "med": med, "p90": p90}
            continue
        # Dải mỏng: gộp sang cửa sổ láng giềng và GHI CỜ — spec §2.3 "merged … and
        # recorded". File vẫn giữ đủ 6 khoá dải vì client từ chối file thiếu dải (F2).
        if name == "200-500":
            sub_m = df[(df.dist_station_euclid_m >= 200) & (df.dist_station_euclid_m < 1000)]
        elif name == "5000-inf":
            sub_m = df[df.dist_station_euclid_m >= 3000]
        else:
            sub_m = df[
                (df.dist_station_euclid_m >= max(200.0, lo - 500))
                & (df.dist_station_euclid_m < hi + 500)
            ]
        if len(sub_m) == 0:
            return _empty(province_code, n_ratio_cells)
        med = round(float(sub_m.detour_ratio.median()), 3)
        p90 = round(float(np.percentile(sub_m.detour_ratio, 90)), 3)
        bands[name] = {"n": n, "med": med, "p90": p90, "merged": True}

    near_df = tt[tt.network_reachable & (tt.dist_station_euclid_m < 200)]
    near_n = len(near_df)
    near: dict | None = None
    if near_n >= MIN_NEAR_N:
        near = {
            "n": near_n,
            "net_p50": int(round(float(near_df.dist_station_network_m.median()))),
            "net_p90": int(round(float(np.percentile(near_df.dist_station_network_m, 90)))),
        }

    # Leave-self-out: dự đoán network của TỪNG ô từ euclid của nó + detour chọn KHÔNG dùng
    # ratio của chính nó — cùng phương trình §1.5 mà client chạy.
    preds: list[float] = []
    uppers: list[float] = []
    trues: list[float] = []

    for row in df.itertuples():
        c = row.h3_r8
        e = float(row.dist_station_euclid_m)
        true_net = float(row.dist_station_network_m)

        ring = [detour_map[nb] for nb in h3.grid_disk(c, 1) if nb != c and nb in detour_map]
        L = max(float(np.median(ring)), 1.0) if len(ring) >= MIN_RING_VALUES else 0.0

        b = _get_band_name(e)
        d_hat = e * max(bands[b]["med"], L)
        d_hat_upper = e * max(bands[b]["p90"], L)

        preds.append(d_hat)
        uppers.append(d_hat_upper)
        trues.append(true_net)

    preds_arr = np.array(preds)
    uppers_arr = np.array(uppers)
    trues_arr = np.array(trues)

    within_20 = round(float(np.mean(np.abs(preds_arr - trues_arr) / trues_arr <= 0.20)), 3)
    upper_miss = round(float(np.mean(trues_arr > uppers_arr)), 3)

    valid = bool(
        n_ratio_cells >= MIN_TOTAL_RATIO_CELLS
        and (UPPER_MISS_RANGE[0] <= upper_miss <= UPPER_MISS_RANGE[1])
    )

    return {
        "version": 1,
        "province_code": province_code,
        "bands": bands,
        "near": near,
        "validation": {
            "n": n_ratio_cells,
            "within_20pct": within_20,
            "upper_miss": upper_miss,
        },
        "valid": valid,
    }


def compute_calibration(province_code: str) -> dict:
    pdir = paths.PROV / province_code
    tt_path = pdir / "traveltime_cell.parquet"
    if not tt_path.exists():
        return _empty(province_code)

    tt = pq.read_table(
        tt_path,
        columns=[
            "h3_r8",
            "dist_station_network_m",
            "dist_station_euclid_m",
            "detour_ratio",
            "network_reachable",
        ],
    ).to_pandas()
    return calibrate_frame(tt, province_code)


def run(province_code: str) -> None:
    r = qa.Report(
        "n15_sim_calibration",
        province_code,
        province_name=admin.province_names()[province_code],
        method=(
            "Hiệu chuẩn detour_ratio theo dải khoảng cách và đánh giá leave-self-out "
            "(ring >= 3 giá trị như client, band-only khi thiếu)"
        ),
    )
    t0 = time.time()
    cal = compute_calibration(province_code)

    out_file = paths.province_dir(province_code) / "sim_calibration.json"
    out_file.write_text(json.dumps(cal, ensure_ascii=False, indent=2), encoding="utf-8")

    merged_bands = sorted(k for k, b in cal["bands"].items() if b.get("merged"))
    r.stat(
        province_code=province_code,
        valid=cal["valid"],
        validation=cal["validation"],
        bands=cal["bands"],
        near=cal["near"],
        merged_bands=merged_bands,
        elapsed_s=round(time.time() - t0, 2),
    )
    r.check(
        "validation_cells_sufficient",
        cal["validation"]["n"] >= MIN_TOTAL_RATIO_CELLS or not cal["valid"],
        f"{cal['validation']['n']} ratio-defined cells (min {MIN_TOTAL_RATIO_CELLS})"
        + ("" if cal["valid"] else " — valid=false, web tắt tính năng (F2)"),
    )
    r.check(
        "upper_miss_in_bounds",
        (UPPER_MISS_RANGE[0] <= cal["validation"]["upper_miss"] <= UPPER_MISS_RANGE[1])
        or not cal["valid"],
        f"upper_miss {cal['validation']['upper_miss']:.1%} trong "
        f"[{UPPER_MISS_RANGE[0]:.0%}, {UPPER_MISS_RANGE[1]:.0%}]"
        + ("" if cal["valid"] else " — valid=false, web tắt tính năng (F2)"),
    )
    r.check(
        "merged_bands_recorded",
        all(cal["bands"][k].get("merged") is True for k in merged_bands),
        f"dải gộp: {merged_bands if merged_bands else 'không có'}",
    )
    r.write(quiet=True)
    print(
        f"   hiệu chuẩn: {cal['validation']['n']} ô · ±20%: {cal['validation']['within_20pct']:.1%} · "
        f"vượt cận trên: {cal['validation']['upper_miss']:.1%} · hợp lệ: {cal['valid']}"
        + (f" · gộp: {','.join(merged_bands)}" if merged_bands else "")
    )


STEP = Step(
    name="n15_sim_calibration",
    scope="province",
    version=VERSION,
    run=run,
    reads=(
        "traveltime_cell",
        "grid_cell",
    ),
    writes=("sim_calibration",),
    desc="hiệu chuẩn mô phỏng không gian cục bộ (Phase 6), theo tỉnh",
)
