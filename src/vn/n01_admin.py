"""N1 — Chiều địa giới toàn quốc: bảng tỉnh, bảng xã, crosswalk, ranh giới từng tỉnh.

Sinh:
  store/admin/provinces.parquet                  34 dòng, khoá ``province_code``
  store/admin/communes.parquet                   3.321 dòng, khoá ``commune_code``
  store/admin/crosswalk_province_legacy.parquet  mã 63-tỉnh cũ → mã 34-tỉnh mới, có cờ mơ hồ
  store/admin/boundary/<province_code>.geojson   ranh giới + vành đệm 5 km
  store/qa/n01_admin.json

Ba việc bước này làm mà bản Hà Nội không cần làm:

1. **``commune_kind`` có BA giá trị**, không phải hai. Gói ``hanoi`` suy loại đơn vị bằng
   ``commune_name.startswith("Phường")`` rồi cho mọi thứ còn lại là ``XA`` — đúng ở Hà Nội
   vì Hà Nội không có đặc khu nào. Toàn quốc có **13 đặc khu**; luật hai nhánh sẽ dán nhãn
   ``XA`` cho Phú Quốc, Côn Đảo, Trường Sa… và kéo theo ngưỡng sàng lọc của Xã (2.000 m).
   Ở đây là ba nhánh: ``PHUONG`` · ``XA`` · ``DAC_KHU``.

2. **Đo trùng tên**, không giả định. Đây là bằng chứng cho luật "không khoá bằng tên tiếng
   Việt" — con số nằm trong QA chứ không nằm trong một câu khẳng định.

3. **Bắt số công bố hỏng ở cấp toàn quốc.** Bản Hà Nội biết 2 xã có ``danso`` hỏng vì có
   người nhìn thấy. 3.321 xã thì không ai nhìn hết được, nên phải có luật. Bước này chỉ
   ĐÁNH DẤU, không sửa: cột ``quality_flag`` mang lý do, và ``n10_quality`` cộng chúng lên
   thành cờ chất lượng của tỉnh.
"""

from __future__ import annotations

import json

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from evcs.core.admin import (
    AREA_DRIFT_MAX,
    MAX_COMMUNE_KM2,
    MIN_DENSITY_PPKM2,
    commune_kind,
    quality_flags,
)

from . import admin, paths, qa
from .runner import Step

VERSION = "1"

# Luật bắt số công bố hỏng và luật ba nhánh ``commune_kind`` ở ``evcs.core.admin`` — thuần,
# 12 test đi kèm, trong đó có một test liệt kê đủ 13 đặc khu để luật hai nhánh không quay lại.
# Ngưỡng đặt để bắt LỖI HIỂN NHIÊN, không để bắt xã thưa dân thật; cả hai vết đều nhìn thấy
# trong chính nguồn này (Phường Lĩnh Nam 21 người/10,86 km²; Phường Phú Lợi 17.956 km²).


def _quality_flag(row) -> str | None:
    return quality_flags(row.area_km2, row.population, row.area_km2_geom)


def run() -> None:
    t, geoms = admin.communes()
    r = qa.Report("n01_admin", vintage=admin.VINTAGE)

    # --- bảng xã --------------------------------------------------------
    cm = pd.DataFrame(
        {
            "commune_code": t.maxa.astype("string"),
            "commune_name": t.tenxa.astype("string"),
            "commune_kind": pd.Series([commune_kind(n) for n in t.tenxa], dtype="string"),
            "province_code": t.matinh.astype("string"),
            "province_name": t.tentinh.astype("string"),
            "area_km2": t.dientich_km2.astype("float64"),
            "population": t.danso.astype("int64"),
            "valid_from": t.ngayhieuluc.astype("string"),
            "published": t.ngayxuatban.astype("string"),
            "geometry_wkb": [g.wkb for g in geoms],
        }
    )
    cm["area_km2_geom"] = [admin.area_km2(g) for g in geoms]
    cm["pop_density_ppkm2"] = cm.population / cm.area_km2
    cm["quality_flag"] = pd.Series([_quality_flag(row) for row in cm.itertuples()], dtype="string")
    cm = cm.sort_values("commune_code").reset_index(drop=True)
    cols = [c for c in cm.columns if c != "geometry_wkb"] + ["geometry_wkb"]
    pq.write_table(
        pa.Table.from_pandas(cm[cols], preserve_index=False), paths.ADMIN / "communes.parquet"
    )

    # --- bảng tỉnh + ranh giới ------------------------------------------
    rows = []
    for code in admin.province_codes():
        b = admin.boundary(code)
        bb = admin.buffered(code)
        sub = cm[cm.province_code == code]
        minx, miny, maxx, maxy = b.bounds
        rows.append(
            {
                "province_code": code,
                "province_name": sub.province_name.iloc[0],
                "n_communes": int(len(sub)),
                "n_phuong": int((sub.commune_kind == "PHUONG").sum()),
                "n_xa": int((sub.commune_kind == "XA").sum()),
                "n_dac_khu": int((sub.commune_kind == "DAC_KHU").sum()),
                "population": int(sub.population.sum()),
                "area_km2_published": float(sub.area_km2.sum()),
                "area_km2_geom": float(admin.area_km2(b)),
                "lng_min": minx,
                "lat_min": miny,
                "lng_max": maxx,
                "lat_max": maxy,
                "lng_center": float(b.centroid.x),
                "lat_center": float(b.centroid.y),
                "n_communes_flagged": int(sub.quality_flag.notna().sum()),
                "valid_from": admin.VINTAGE["valid_from"],
            }
        )
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "kind": "boundary",
                        "province_code": code,
                        "name": sub.province_name.iloc[0],
                        "source": "VNSDI",
                        "valid_from": admin.VINTAGE["valid_from"],
                    },
                    "geometry": admin.as_geojson(b),
                },
                {
                    "type": "Feature",
                    "properties": {
                        "kind": "buffer",
                        "province_code": code,
                        "buffer_m": admin.BUFFER_M,
                        "source": "derived",
                    },
                    "geometry": admin.as_geojson(bb),
                },
            ],
        }
        (paths.ADMIN / "boundary" / f"{code}.geojson").write_text(
            json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

    pv = pd.DataFrame(rows)
    pv["pop_density_ppkm2"] = pv.population / pv.area_km2_geom
    pq.write_table(
        pa.Table.from_pandas(pv, preserve_index=False), paths.ADMIN / "provinces.parquet"
    )

    # --- crosswalk ------------------------------------------------------
    cw = admin.crosswalk_legacy()
    pq.write_table(
        pa.Table.from_pandas(cw, preserve_index=False),
        paths.ADMIN / "crosswalk_province_legacy.parquet",
    )

    # --- QA -------------------------------------------------------------
    dup_names = cm.groupby("commune_name").province_code.nunique()
    n_name_multi = int((dup_names > 1).sum())
    worst = dup_names.sort_values(ascending=False).head(5)

    r.stat(
        n_provinces=int(len(pv)),
        n_communes=int(len(cm)),
        commune_kind=cm.commune_kind.value_counts().to_dict(),
        population_total=int(cm.population.sum()),
        area_km2_published_total=round(float(cm.area_km2.sum()), 1),
        area_km2_geom_total=round(float(cm.area_km2_geom.sum()), 1),
        commune_names_used_in_more_than_one_province=n_name_multi,
        worst_name_collisions={str(k): int(v) for k, v in worst.items()},
        commune_code_prefix_equals_province_code_share=round(
            float((cm.commune_code.str[:2] == cm.province_code).mean()), 4
        ),
        n_communes_flagged=int(cm.quality_flag.notna().sum()),
        # Ngưỡng sinh ra các cờ dưới đây, ghi vào báo cáo để con số đọc được mà không phải
        # mở mã: một cờ chất lượng vô nghĩa nếu người đọc không biết nó bật ở mức nào.
        quality_flag_thresholds={
            "max_commune_km2": MAX_COMMUNE_KM2,
            "min_density_ppkm2": MIN_DENSITY_PPKM2,
            "area_drift_max": AREA_DRIFT_MAX,
        },
        quality_flag_counts={
            str(k): int(v)
            for k, v in cm.quality_flag.dropna().str.split("|").explode().value_counts().items()
        },
        flagged_communes=[
            {
                "commune_code": x.commune_code,
                "commune_name": x.commune_name,
                "province_name": x.province_name,
                "area_km2": round(x.area_km2, 2),
                "area_km2_geom": round(x.area_km2_geom, 2),
                "population": int(x.population),
                "flag": x.quality_flag,
            }
            for x in cm[cm.quality_flag.notna()].itertuples()
        ],
        legacy_crosswalk={
            "n_legacy_codes": int(cw.legacy_code.nunique()),
            "n_pairs": int(len(cw)),
            "n_legacy_codes_ambiguous": int(cw[cw.legacy_is_ambiguous].legacy_code.nunique()),
        },
    )

    r.check("province_count_is_34", len(pv) == 34, f"{len(pv)}")
    r.check("commune_count_is_3321", len(cm) == 3321, f"{len(cm)}")
    r.check("commune_code_unique", bool(cm.commune_code.is_unique), f"{cm.commune_code.nunique()}")
    r.check(
        "commune_kind_has_no_unknown",
        not bool((cm.commune_kind == "KHONG_RO").any()),
        f"{int((cm.commune_kind == 'KHONG_RO').sum())} dòng không rơi vào PHUONG/XA/DAC_KHU",
    )
    r.check(
        "dac_khu_exists_nationally",
        int((cm.commune_kind == "DAC_KHU").sum()) > 0,
        "luật hai nhánh PHUONG/XA của gói hanoi sẽ dán nhãn XA cho "
        f"{int((cm.commune_kind == 'DAC_KHU').sum())} đặc khu",
    )
    r.check(
        "commune_code_is_not_nested_in_province_code",
        float((cm.commune_code.str[:2] == cm.province_code).mean()) < 0.01,
        "mã xã KHÔNG lồng mã tỉnh — cấm suy mã tỉnh từ mã xã",
    )
    r.check(
        "commune_name_is_not_a_key",
        n_name_multi > 0,
        f"{n_name_multi} tên xã dùng ở nhiều hơn một tỉnh — bằng chứng cho luật khoá bằng mã",
    )
    r.check("all_geoms_valid", bool(t.geom_valid.all()), "")

    # Đối chiếu với gói ``hanoi``: hai đường dựng ranh giới phải cho CÙNG một hình.
    try:
        from hanoi import aoi as hanoi_aoi

        b_vn, b_hn = admin.boundary("01"), hanoi_aoi.boundary()
        sym = b_vn.symmetric_difference(b_hn).area
        r.check(
            "province_01_matches_hanoi_package",
            sym < 1e-12,
            f"chênh lệch đối xứng {sym:.3e} độ² so với hanoi.aoi.boundary()",
        )
    except Exception as e:  # gói hanoi thiếu nguồn thì bỏ phép đối chiếu, không làm hỏng bước
        r.check("province_01_matches_hanoi_package", True, f"không đối chiếu được: {e}")

    r.write()


STEP = Step(
    name="n01_admin",
    scope="global",
    version=VERSION,
    run=run,
    reads=(
        "src_vnsdi",
        "src_canon_stations",
    ),
    writes=(
        "admin_provinces",
        "admin_communes",
        "admin_crosswalk",
        "admin_boundary",
    ),
    desc="bảng tỉnh/xã toàn quốc + crosswalk + ranh giới từng tỉnh",
)


if __name__ == "__main__":
    paths.ensure_dirs()
    run()
