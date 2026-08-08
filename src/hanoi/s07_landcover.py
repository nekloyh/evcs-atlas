"""B7 — Lớp phủ mặt đất theo ô, từ ESA WorldCover 10 m (2021).

Repo cũ chỉ tính lớp này cho ~54% ô Hà Nội (chỉ những ô đã lọt vào tập ứng viên), nên không
dùng lại được — ô nào không có giá trị thì không phân biệt được "không xây được" với "chưa
tính". Ở đây tính cho TOÀN BỘ ô trong lưới báo cáo.

Cách tính: đốt chỉ số ô H3 vào chính lưới raster 10 m rồi đếm theo lớp phủ. Nhanh hơn nhiều
so với gọi H3 cho từng pixel, và không có sai số lấy mẫu vì mỗi pixel được gán đúng một ô.

Sinh:
  data/processed/layers/landcover_cell.parquet
  data/qa/s07_landcover.json
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import rasterio
import rasterio.features
import rasterio.windows

from . import aoi, grid, paths

# Mã lớp ESA WorldCover v200
CLASSES = {
    10: "tree",
    20: "shrub",
    30: "grass",
    40: "crop",
    50: "built",
    60: "bare",
    70: "snow",
    80: "water",
    90: "wetland",
    95: "mangrove",
    100: "moss",
}

# KHÔNG có trường ``buildable`` ở đây, và đó là một quyết định.
#
# Bản trước có ``buildable = built_frac >= 0,05 AND water_frac <= 0,50``. Quét ngưỡng cho
# thấy hàm số-ô-buildable TRƠN, không có "vai" tự nhiên nào — mọi ngưỡng tuỳ tiện như nhau.
# Tệ hơn, đối chiếu thực địa: ngưỡng 0,05 LOẠI NHẦM 3,3% trạm đang vận hành thật (và 5,8%
# ô có trạm bị gắn không-xây-được). Muốn giữ 99% trạm thì ngưỡng phải là 0,01 — tức gần như
# không lọc gì.
#
# Cộng thêm niên đại: ảnh WorldCover là **2021**, dùng cho Hà Nội **2026**. Điểm mù lệch có
# hệ thống vào đúng vành đai ven đô mới xây — chính vùng đáng quan tâm nhất.
#
# Các trường ``*_frac`` vẫn phát bình thường; người dùng muốn đặt ngưỡng thì tự đặt và tự
# chịu trách nhiệm về nó. Xem DECISIONS.md §7.


def main() -> None:
    paths.assert_sources()
    cells = grid.hanoi_cells()
    idx = {c: i + 1 for i, c in enumerate(cells)}  # 0 dành cho "ngoài lưới"
    shapes = [(grid.cell_polygon(c), idx[c]) for c in cells]

    n_cls = max(CLASSES) + 1
    counts = np.zeros((len(cells) + 1, n_cls), dtype=np.int64)

    minx, miny, maxx, maxy = aoi.bbox(False)
    tiles = sorted(paths.SRC_WORLDCOVER_DIR.glob("*.tif"))
    used = []
    for tif in tiles:
        with rasterio.open(tif) as ds:
            b = ds.bounds
            if b.right < minx or b.left > maxx or b.top < miny or b.bottom > maxy:
                continue
            used.append(tif.name)
            win = (
                rasterio.windows.from_bounds(
                    max(minx, b.left),
                    max(miny, b.bottom),
                    min(maxx, b.right),
                    min(maxy, b.top),
                    ds.transform,
                )
                .round_offsets()
                .round_lengths()
            )
            arr = ds.read(1, window=win)
            tr = ds.window_transform(win)
            cell_ras = rasterio.features.rasterize(
                shapes, out_shape=arr.shape, transform=tr, fill=0, dtype="int32", all_touched=False
            )
            flat = cell_ras.ravel().astype(np.int64) * n_cls + arr.ravel().astype(np.int64)
            bc = np.bincount(flat, minlength=(len(cells) + 1) * n_cls)
            counts += bc[: (len(cells) + 1) * n_cls].reshape(len(cells) + 1, n_cls)
            del arr, cell_ras, flat, bc

    c = counts[1:]  # bỏ hàng "ngoài lưới"
    total = c.sum(axis=1)
    out = pd.DataFrame({"h3_r8": pd.Series(cells, dtype="string")})
    out["n_px_10m"] = total
    for code, name in CLASSES.items():
        frac = np.divide(c[:, code], total, out=np.zeros(len(cells)), where=total > 0)
        if frac.sum() > 0:
            out[f"{name}_frac"] = frac

    for name in ("built", "water", "crop", "tree"):
        if f"{name}_frac" not in out:
            out[f"{name}_frac"] = 0.0

    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), paths.LAYERS / "landcover_cell.parquet"
    )

    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    fr = out[[k for k in out.columns if k.endswith("_frac")]].sum(axis=1)
    chk(
        "every_cell_covered",
        bool((out.n_px_10m > 0).all()),
        f"{int((out.n_px_10m == 0).sum())} ô rỗng",
    )
    chk(
        "fracs_sum_to_1",
        bool(((fr - 1).abs() < 1e-6).all()),
        f"max lệch {float((fr - 1).abs().max()):.2e}",
    )
    chk("all_grid_cells_present", len(out) == len(cells), f"{len(out)}/{len(cells)}")

    report = {
        "layer": "landcover",
        "source": "ESA WorldCover 10 m v200 (2021)",
        "tiles_used": used,
        "no_buildable_field": (
            "Trường `buildable` đã bị bỏ: ngưỡng không có cơ sở (hàm trơn, không có vai) và "
            "loại nhầm 3,3% trạm đang vận hành. Ảnh nguồn 2021 dùng cho 2026."
        ),
        "stats": {
            "n_cells": int(len(out)),
            "median_px_per_cell": int(np.median(total)),
            "built_frac_mean": round(float(out.built_frac.mean()), 4),
            "water_frac_mean": round(float(out.water_frac.mean()), 4),
            "crop_frac_mean": round(float(out.crop_frac.mean()), 4),
            "built_frac_p90": round(float(out.built_frac.quantile(0.9)), 4),
            "n_cells_built_frac_lt_0_05": int((out.built_frac < 0.05).sum()),
            "n_cells_water_frac_gt_0_50": int((out.water_frac > 0.50).sum()),
        },
        "checks": checks,
    }
    (paths.QA / "s07_landcover.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2, default=str))
    for c_ in checks:
        print(f"  [{c_['status']}] {c_['name']} {c_['detail']}")


if __name__ == "__main__":
    main()
