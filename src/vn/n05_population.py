"""N5 — Dân số theo ô: dasymetric WorldPop 2025 neo theo VNSDI, có xử lý hai vết hỏng nguồn.

Sinh (mỗi tỉnh):
  store/p/<code>/population_cell.parquet      h3_r8 · population · pop_density · pop_source
  store/p/<code>/population_commune.parquet   commune_code · population · anchor_ratio · pop_source
  store/qa/<code>/n05_population.json

Phương pháp giữ NGUYÊN của ``hanoi.s04``: bề mặt trọng số = WorldPop 2025 R2024B 100 m,
tổng kiểm soát = ``danso`` từng xã của VNSDI, mỗi pixel gán vào đúng một xã và đúng một ô H3.

── HAI VẾT HỎNG CỦA NGUỒN, VÀ CÁCH XỬ LÝ ──────────────────────────────────────────────

Bản Hà Nội bắt được 2 xã có ``danso`` hỏng vì **có người nhìn thấy chúng**. 3.321 xã thì
không ai nhìn hết, nên phải có luật — và luật đó phải hiệu chuẩn trên phân phối TOÀN QUỐC,
không trên phân phối Hà Nội.

**Vết 1 — ``danso`` từng xã sai bậc.** ``hanoi.s04`` dùng ``danso < 1.000 AND worldpop >
10× danso``, hiệu chuẩn theo câu "xã thưa nhất Hà Nội vẫn ~328 người/km²". Câu neo đó chỉ
đúng ở Hà Nội: toàn quốc có 52 xã mật độ công bố dưới 20 người/km², và phần lớn là xã miền
núi thưa THẬT. Ở đây luật không nằm trong bước này nữa — ``n01_admin`` đã đo và gắn cờ
``DANSO_CONG_BO_QUA_THAP`` cho từng xã, còn bước này chỉ **đọc cờ**. Một luật, một chỗ.

**Vết 2 — tổng ``danso`` toàn quốc lệch ~12% và lệch KHÔNG ĐỀU.** Cộng lại được
113.625.653 người, so với dân số Việt Nam ~101 triệu. Hà Nội sát thực tế (8,73 tr) nhưng
An Giang 4,99 tr so với ~3,6 tr cộng từ hai tỉnh cũ. Đây **không phải lỗi nhập liệu ở một
xã** — nó là tính chất của chính con số công bố, nên không có ngưỡng nào bắt được nó.

Cách xử lý: **phát cả hai, và phát cả tỉ số giữa chúng.**

  ``population``       neo theo ``danso`` — số PHẢI đối chiếu được với văn bản nhà nước
  ``population_wp``    WorldPop thô, không neo — số ĐỘC LẬP với văn bản
  ``anchor_ratio``     ``danso / worldpop`` theo xã, cộng lên theo tỉnh

Không bước nào chọn hộ. Người dùng nào cần con số chính thức thì lấy cột đầu; ai nghi ngờ
nó thì có cột thứ hai và tỉ số để biết nghi ngờ tới đâu. Giấu một trong hai là quyết định
hộ người đọc một chuyện mà dữ liệu không kết luận được.

**Mật độ chia cho diện tích ĐO TỪ ĐA GIÁC, không phải diện tích công bố.** Mật độ là đại
lượng TÍNH, nên mẫu số của nó phải là số ĐO. Phường Phú Lợi (TP.HCM) công bố 17.956 km²
là bằng chứng đủ: chia cho số công bố sẽ cho mật độ 6 người/km² giữa lòng thành phố.
"""

from __future__ import annotations

import h3
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import rasterio
import rasterio.windows
from shapely.geometry import Point
from shapely.strtree import STRtree

from evcs.core.grid import RES

from . import admin, paths, qa
from .runner import Step

VERSION = "1"

SRC_ANCHORED = "WORLDPOP2025_ANCHORED_VNSDI"
SRC_UNANCHORED = "WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE"
SRC_AREAL = "VNSDI_AREAL_FALLBACK"
SRC_ZERO = "ZERO_NO_WEIGHT"

# Cửa sổ raster nới thêm quanh bbox tỉnh, tính bằng độ. Chỉ để không cắt cụt pixel ở mép;
# pixel ngoài ranh giới vẫn bị loại bằng phép điểm-trong-đa-giác ngay sau đó.
PAD_DEG = 0.01


def _read_window(bounds) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(giá trị, kinh độ tâm pixel, vĩ độ tâm pixel) của mọi pixel > 0 trong bbox."""
    minx, miny, maxx, maxy = bounds
    with rasterio.open(paths.SRC_WORLDPOP_2025) as ds:
        win = (
            rasterio.windows.from_bounds(
                minx - PAD_DEG, miny - PAD_DEG, maxx + PAD_DEG, maxy + PAD_DEG, ds.transform
            )
            .round_offsets()
            .round_lengths()
        )
        arr = ds.read(1, window=win)
        tr = ds.window_transform(win)
        nodata = ds.nodata
    v = arr.astype("float64")
    if nodata is not None:
        v = np.where(v == nodata, 0.0, v)
    v = np.where(np.isfinite(v) & (v > 0), v, 0.0)
    rr, cc = np.nonzero(v)
    return v[rr, cc], tr.c + (cc + 0.5) * tr.a, tr.f + (rr + 0.5) * tr.e


def run(province_code: str) -> None:
    r = qa.Report(
        "n05_population",
        province_code,
        province_name=admin.province_names()[province_code],
        method="dasymetric: WorldPop 2025 R2024B (trọng số) neo theo VNSDI danso (tổng kiểm soát)",
        weight_raster=str(paths.SRC_WORLDPOP_2025),
    )
    b = admin.boundary(province_code)
    cm, geoms = admin.communes(province_code)
    codes = cm.maxa.tolist()
    danso = dict(zip(cm.maxa, cm.danso.astype(float)))

    adm = pq.read_table(
        paths.ADMIN / "communes.parquet",
        columns=["commune_code", "province_code", "quality_flag", "area_km2_geom"],
    ).to_pandas()
    adm = adm[adm.province_code == province_code]
    # Cờ đọc từ n01, KHÔNG tính lại ở đây — một luật một chỗ (xem docstring).
    implausible = {
        c
        for c, f in zip(adm.commune_code, adm.quality_flag)
        if isinstance(f, str) and "DANSO_CONG_BO_QUA_THAP" in f
    }

    vals, xs, ys = _read_window(b.bounds)
    tree = STRtree(geoms)
    pts = [Point(x, y) for x, y in zip(xs, ys)]
    q = tree.query(pts, predicate="within")
    com_of_px = np.full(len(pts), -1, dtype=np.int32)
    com_of_px[q[0]] = q[1]
    inside = com_of_px >= 0

    px = pd.DataFrame(
        {
            "h3_r8": [h3.latlng_to_cell(y, x, RES) for x, y in zip(xs[inside], ys[inside])],
            "commune_code": [codes[i] for i in com_of_px[inside]],
            "w": vals[inside],
        }
    )
    wsum = px.groupby("commune_code").w.sum() if len(px) else pd.Series(dtype="float64")

    scale, src, no_weight = {}, {}, []
    for c in codes:
        s = float(wsum.get(c, 0.0))
        if s <= 0:
            scale[c], src[c] = np.nan, SRC_AREAL
            no_weight.append(c)
        elif c in implausible:
            # KHÔNG neo: neo vào một con số hỏng sẽ làm RỖNG cả một xã có thật. Dùng thẳng
            # WorldPop và ĐÁNH DẤU — thay thế CÓ KHAI BÁO, không phải impute âm thầm.
            scale[c], src[c] = 1.0, SRC_UNANCHORED
        else:
            scale[c], src[c] = danso[c] / s, SRC_ANCHORED

    if len(px):
        px["population"] = px.w * px.commune_code.map(scale)
        px["src"] = px.commune_code.map(src)

    # Xã không có pixel trọng số nào: rải đều theo phần diện tích ô nằm trong xã, có cờ.
    cc_pairs = pq.read_table(paths.PROV / province_code / "grid_cell_commune.parquet").to_pandas()
    fallback = []
    for c in no_weight:
        sub = cc_pairs[cc_pairs.commune_code == c]
        if len(sub) == 0 or sub.area_frac.sum() <= 0:
            continue
        share = sub.area_frac / sub.area_frac.sum()
        for hx, sh in zip(sub.h3_r8, share):
            fallback.append({"h3_r8": hx, "commune_code": c, "population": danso[c] * sh})

    cell_pop = px.groupby("h3_r8").population.sum() if len(px) else pd.Series(dtype="float64")
    cell_wp = px.groupby("h3_r8").w.sum() if len(px) else pd.Series(dtype="float64")
    if fallback:
        fb = pd.DataFrame(fallback).groupby("h3_r8").population.sum()
        cell_pop = cell_pop.add(fb, fill_value=0.0)

    grid = pq.read_table(
        paths.PROV / province_code / "grid_cell.parquet", columns=["h3_r8", "area_km2"]
    ).to_pandas()
    out = pd.DataFrame({"h3_r8": grid.h3_r8.astype("string")})
    out["population"] = out.h3_r8.map(cell_pop).fillna(0.0).astype("float64")
    out["population_wp"] = out.h3_r8.map(cell_wp).fillna(0.0).astype("float64")
    out["pop_density_ppkm2"] = out.population / grid.area_km2.to_numpy()
    if len(px):
        dom = px.groupby(["h3_r8", "src"]).population.sum().reset_index()
        dom = dom.sort_values("population", ascending=False).drop_duplicates("h3_r8")
        out["pop_source"] = out.h3_r8.map(dom.set_index("h3_r8").src)
    else:
        out["pop_source"] = pd.NA
    out["pop_source"] = out.pop_source.fillna(
        pd.Series(np.where(out.population > 0, SRC_AREAL, SRC_ZERO), index=out.index)
    ).astype("string")
    pdir = paths.province_dir(province_code)
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), pdir / "population_cell.parquet"
    )

    # --- theo xã: cả hai con số + tỉ số neo -------------------------------
    cp = pd.DataFrame({"commune_code": pd.Series(codes, dtype="string")})
    cp["province_code"] = province_code
    cp["population_published"] = cp.commune_code.map(danso).astype("float64")
    cp["population_wp"] = cp.commune_code.map(wsum).fillna(0.0).astype("float64")
    used = px.groupby("commune_code").population.sum() if len(px) else pd.Series(dtype="float64")
    cp["population"] = cp.commune_code.map(used)
    cp["population"] = cp.population.fillna(cp.commune_code.map(danso)).fillna(0.0)
    cp["pop_source"] = cp.commune_code.map(src).astype("string")
    # Tỉ số neo: >1 nghĩa là số công bố CAO hơn bề mặt WorldPop ở xã đó. Đây là chỗ vết
    # hỏng thứ hai nhìn thấy được, và nó KHÔNG bị sửa — chỉ bị đo.
    cp["anchor_ratio"] = np.where(
        cp.population_wp > 0, cp.population_published / cp.population_wp, np.nan
    )
    cp = cp.merge(adm[["commune_code", "area_km2_geom"]], on="commune_code", how="left")
    cp["pop_density_ppkm2"] = cp.population / cp.area_km2_geom
    pq.write_table(
        pa.Table.from_pandas(cp, preserve_index=False), pdir / "population_commune.parquet"
    )

    # --- QA ---------------------------------------------------------------
    official = float(cm.danso.sum())
    total = float(out.population.sum())
    wp_total = float(out.population_wp.sum())
    ratio = official / wp_total if wp_total > 0 else float("nan")
    n_impl = len(implausible)
    substituted = float(sum(wsum.get(c, 0.0) for c in implausible))
    replaced = float(sum(danso[c] for c in implausible))
    expected = official - replaced + substituted

    r.stat(
        population_total=round(total, 1),
        population_published_vnsdi=official,
        population_worldpop_raw=round(wp_total, 1),
        anchor_ratio_province=round(ratio, 4),
        anchor_ratio_commune_median=round(float(cp.anchor_ratio.median()), 4)
        if cp.anchor_ratio.notna().any()
        else None,
        anchor_ratio_commune_p90=round(float(cp.anchor_ratio.quantile(0.9)), 4)
        if cp.anchor_ratio.notna().any()
        else None,
        n_communes_unanchored_implausible=n_impl,
        n_communes_without_weight=len(no_weight),
        n_cells=int(len(out)),
        n_cells_with_pop=int((out.population > 0).sum()),
        pop_source_counts={str(k): int(v) for k, v in out.pop_source.value_counts().items()},
        max_cell_population=round(float(out.population.max()), 1),
    )
    r.check(
        "total_matches_official_plus_declared_substitutions",
        abs(total - expected) / max(expected, 1) < 1e-4,
        f"{total:,.0f} vs kỳ vọng {expected:,.0f} "
        f"(công bố {official:,.0f} − {replaced:,.0f} + {substituted:,.0f} thay thế)",
    )
    r.check("no_negative", bool((out.population >= 0).all()), "")
    r.check(
        "worldpop_covers_the_province",
        wp_total > 0 and float((out.population_wp > 0).mean()) > 0.5,
        f"{float((out.population_wp > 0).mean()):.1%} ô có trọng số WorldPop",
    )
    # KHÔNG có phép kiểm PASS/FAIL cho `anchor_ratio`, và đó là chủ ý: nó đo một tính chất
    # của con số CÔNG BỐ, không đo một lỗi của bước này. Đặt ngưỡng rồi tự phán là hỏng
    # chính là lỗi mà DECISIONS §7 đã kết án ở trường `buildable`.
    r.check(
        "anchor_ratio_is_reported_not_judged",
        True,
        f"tỉnh này neo ×{ratio:.2f} so với bề mặt WorldPop — số đo, không phải phán quyết",
    )
    r.write(quiet=True)
    print(
        f"   dân {total:,.0f} · WorldPop thô {wp_total:,.0f} · neo ×{ratio:.2f} · "
        f"{int((out.population > 0).sum()):,}/{len(out):,} ô có dân"
        + (f" · {n_impl} xã KHÔNG neo (danso hỏng)" if n_impl else "")
    )


def outputs(province_code: str) -> list:
    d = paths.PROV / province_code
    return [d / "population_cell.parquet", d / "population_commune.parquet"]


def upstream(province_code: str) -> list:
    d = paths.PROV / province_code
    return [d / "grid_cell.parquet", d / "grid_cell_commune.parquet"]


STEP = Step(
    name="n05_population",
    scope="province",
    version=VERSION,
    run=run,
    outputs=outputs,
    sources=(paths.SRC_WORLDPOP_2025, paths.SRC_VNSDI_COMMUNES),
    province_sources=upstream,
    desc="dân số theo ô — dasymetric WorldPop neo VNSDI, phát cả bản không neo",
)
