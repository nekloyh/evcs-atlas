"""N6 — Lớp phủ mặt đất theo ô, từ ESA WorldCover 10 m (2021).

Sinh (mỗi tỉnh):
  store/p/<code>/landcover_cell.parquet   h3_r8 · n_px_10m · <lớp>_frac
  store/qa/<code>/n06_landcover.json

Cách tính giữ NGUYÊN của ``hanoi.s07``: đốt chỉ số ô H3 vào chính lưới raster 10 m rồi đếm
theo lớp phủ — mỗi pixel được gán đúng một ô, không có sai số lấy mẫu.

**KHÔNG có trường ``buildable``**, và đó là quyết định đã chốt ở ``DECISIONS.md §7``: quét
ngưỡng cho thấy hàm số-ô-buildable TRƠN (không có "vai" tự nhiên nào) và ngưỡng 0,05 LOẠI
NHẦM 3,3% trạm đang vận hành thật. Ghi lại ở đây để không ai "khôi phục" nó khi mở rộng.

── VÌ SAO PHẢI ĐỌC THEO DẢI, KHÔNG ĐỌC CẢ CỬA SỔ ─────────────────────────────────────

``s07`` đọc nguyên cửa sổ bbox của AOI vào RAM. Ở Hà Nội (3.400 km²) đó là ~40 triệu pixel.
Ở quy mô tỉnh thì bbox Nghệ An/Lâm Đồng ~2°×2° = **~4,8 tỉ pixel**, và mảng chỉ số ô đi kèm
(int32) còn nặng gấp bốn. Bước này vì thế đọc theo **dải ngang**: mỗi lần một khối
``BLOCK_ROWS`` hàng, và chỉ đốt những ô H3 thật sự giao với khối đó (lọc qua cây R).

Chỉ số ô dùng **uint16**, không phải int32: tỉnh nhiều ô nhất có 29.763 ô, còn dưới 65.535.
Có phép kiểm chặn ngay nếu ngưỡng đó bị vượt — im lặng tràn số ở đây sẽ trộn lớp phủ của
hai ô khác nhau và không có gì phía dưới phát hiện ra.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import rasterio
import rasterio.features
import rasterio.windows
from shapely.geometry import box
from shapely.strtree import STRtree

from evcs.core.grid import cell_polygon
from evcs.core.landcover import CLASSES

from . import admin, paths, qa
from .runner import Step

VERSION = "2"

BLOCK_ROWS = 2048
MAX_CELLS_UINT16 = 65_534  # 0 dành cho "ngoài lưới"; 65.535 dành cho tràn


def run(province_code: str) -> None:
    r = qa.Report(
        "n06_landcover",
        province_code,
        province_name=admin.province_names()[province_code],
        source="ESA WorldCover 10 m v200 (2021)",
        no_buildable_field=(
            "Trường `buildable` đã bị bỏ ở DECISIONS §7: ngưỡng không có cơ sở (hàm trơn, "
            "không có vai) và loại nhầm 3,3% trạm đang vận hành. Ảnh nguồn 2021 dùng cho 2026."
        ),
    )
    grid = pq.read_table(
        paths.PROV / province_code / "grid_cell.parquet", columns=["h3_r8"]
    ).to_pandas()
    cells = grid.h3_r8.tolist()
    if len(cells) > MAX_CELLS_UINT16:
        raise SystemExit(
            f"Tỉnh {province_code} có {len(cells)} ô, vượt {MAX_CELLS_UINT16} — chỉ số ô "
            "không còn vừa uint16. Đổi dtype ở n06_landcover trước khi chạy tiếp."
        )
    polys = [cell_polygon(c) for c in cells]
    tree = STRtree(polys)

    n_cls = max(CLASSES) + 1
    counts = np.zeros((len(cells) + 1, n_cls), dtype=np.int64)

    minx, miny, maxx, maxy = admin.boundary(province_code).bounds
    used, n_blocks = [], 0
    for tif in sorted(paths.SRC_WORLDCOVER_DIR.glob("*.tif")):
        with rasterio.open(tif) as ds:
            bb = ds.bounds
            if bb.right < minx or bb.left > maxx or bb.top < miny or bb.bottom > maxy:
                continue
            used.append(tif.name)
            win = (
                rasterio.windows.from_bounds(
                    max(minx, bb.left),
                    max(miny, bb.bottom),
                    min(maxx, bb.right),
                    min(maxy, bb.top),
                    ds.transform,
                )
                .round_offsets()
                .round_lengths()
            )
            for row0 in range(0, int(win.height), BLOCK_ROWS):
                h = min(BLOCK_ROWS, int(win.height) - row0)
                sub = rasterio.windows.Window(win.col_off, win.row_off + row0, win.width, h)
                arr = ds.read(1, window=sub)
                tr = ds.window_transform(sub)
                x0, y0 = tr * (0, 0)
                x1, y1 = tr * (arr.shape[1], arr.shape[0])
                # Chỉ đốt những ô GIAO với khối này. Không lọc thì mỗi khối phải thử toàn bộ
                # ô của tỉnh, và chi phí đi theo (số khối × số ô) thay vì theo số pixel.
                idx = tree.query(box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
                if len(idx) == 0:
                    continue
                shapes = [(polys[int(i)], int(i) + 1) for i in idx]
                cell_ras = rasterio.features.rasterize(
                    shapes,
                    out_shape=arr.shape,
                    transform=tr,
                    fill=0,
                    dtype="uint16",
                    all_touched=False,
                )
                flat = cell_ras.ravel().astype(np.int64) * n_cls + arr.ravel().astype(np.int64)
                bc = np.bincount(flat, minlength=(len(cells) + 1) * n_cls)
                counts += bc[: (len(cells) + 1) * n_cls].reshape(len(cells) + 1, n_cls)
                n_blocks += 1
                del arr, cell_ras, flat, bc

    c = counts[1:]  # bỏ hàng "ngoài lưới"
    total = c.sum(axis=1)
    out = pd.DataFrame({"h3_r8": pd.Series(cells, dtype="string")})
    out["n_px_10m"] = total
    # MỌI lớp WorldCover đều có cột, kể cả lớp bằng 0 trên cả tỉnh.
    #
    # `hanoi.s07` chỉ phát cột khi `frac.sum() > 0` — hợp lý với MỘT tỉnh. Với 34 phân mảnh
    # thì nó cho ra 34 schema khác nhau: Hà Nội không có `mangrove_frac`, Cà Mau có. Ai đó
    # đọc `store/p/*/grid_h3_r8.parquet` bằng một lần gọi sẽ hoặc nổ hoặc nhận cột toàn null
    # ở những tỉnh thiếu — và cột null đó đọc thành "không đo được" chứ không phải "bằng 0".
    # Schema ổn định giữa các phân mảnh là điều kiện để phân mảnh dùng được như một bảng.
    for code_, name in CLASSES.items():
        out[f"{name}_frac"] = np.divide(
            c[:, code_], total, out=np.zeros(len(cells)), where=total > 0
        )

    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False),
        paths.province_dir(province_code) / "landcover_cell.parquet",
    )

    fr = out[[k for k in out.columns if k.endswith("_frac")]].sum(axis=1)
    covered = out.n_px_10m > 0
    r.stat(
        n_cells=int(len(out)),
        n_cells_uncovered=int((~covered).sum()),
        tiles_used=used,
        raster_blocks_read=n_blocks,
        median_px_per_cell=int(np.median(total)) if len(total) else 0,
        built_frac_mean=round(float(out.built_frac.mean()), 4),
        built_frac_p90=round(float(out.built_frac.quantile(0.9)), 4),
        water_frac_mean=round(float(out.water_frac.mean()), 4),
        crop_frac_mean=round(float(out.crop_frac.mean()), 4),
        tree_frac_mean=round(float(out.tree_frac.mean()), 4),
    )
    r.check(
        "every_cell_covered",
        bool(covered.all()),
        f"{int((~covered).sum())} ô không có pixel WorldCover nào",
    )
    r.check(
        "fracs_sum_to_1",
        bool(((fr[covered] - 1).abs() < 1e-6).all()),
        f"max lệch {float((fr[covered] - 1).abs().max()):.2e}" if covered.any() else "",
    )
    r.check("all_grid_cells_present", len(out) == len(cells), f"{len(out)}/{len(cells)}")
    r.write(quiet=True)
    print(
        f"   {len(out):,} ô · {len(used)} tile · {n_blocks} khối · "
        f"built {out.built_frac.mean():.1%} · water {out.water_frac.mean():.1%} · "
        f"crop {out.crop_frac.mean():.1%} · tree {out.tree_frac.mean():.1%}"
    )


STEP = Step(
    name="n06_landcover",
    scope="province",
    version=VERSION,
    run=run,
    reads=(
        "src_worldcover",
        "src_vnsdi",
        "grid_cell",
    ),
    writes=(
        "landcover_cell",
    ),
    desc="lớp phủ ESA WorldCover 10 m theo ô, đọc theo dải để bộ nhớ bị chặn",
)
