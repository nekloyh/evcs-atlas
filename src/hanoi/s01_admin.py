"""B1 — Lớp hành chính Hà Nội từ VNSDI (nguồn chính thức).

Sinh:
  data/raw/vnsdi_hanoi_communes.parquet   — 126 xã/phường, giữ nguyên trường gốc VNSDI
  data/processed/layers/admin_commune.parquet    — bảng xã/phường đã dọn (một khái niệm một trường)
  data/processed/admin_boundary.geojson   — đa giác Hà Nội + vành đệm 5 km
  data/qa/s01_admin.json

Vì sao VNSDI chứ không phải OSM hay GIS.vn: xem DECISIONS.md §1.
"""

from __future__ import annotations

import json

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely import wkb

from . import aoi, paths


def main() -> None:
    paths.assert_sources()
    hn, geoms = aoi.communes()
    b = aoi.boundary()
    bb = aoi.buffered()

    # --- bản sao Hà Nội của nguồn thô: bộ dữ liệu đứng độc lập sau lần build đầu ---
    pq.write_table(
        pa.Table.from_pandas(hn, preserve_index=False), paths.RAW / "vnsdi_hanoi_communes.parquet"
    )

    # --- bảng đã dọn -----------------------------------------------------
    # dientich_km2/danso là số CÔNG BỐ của VNSDI; area_km2_geom là số ĐO LẠI từ đa giác.
    # Giữ cả hai KHÔNG vi phạm "một khái niệm một trường": một cái là số liệu công bố, một cái
    # là số đo hình học — chúng lệch nhau thì đó là thông tin, không phải trùng lặp.
    lat0 = b.centroid.y
    import math

    m_lat = 110_574.0
    m_lon = 111_320.0 * math.cos(math.radians(lat0))
    area_geom = [g.area * m_lat * m_lon / 1e6 for g in geoms]

    out = pd.DataFrame(
        {
            "commune_code": hn.maxa.astype("string"),
            "commune_name": hn.tenxa.astype("string"),
            "province_code": hn.matinh.astype("string"),
            "province_name": hn.tentinh.astype("string"),
            "area_km2": hn.dientich_km2.astype("float64"),
            "population": hn.danso.astype("int64"),
            "valid_from": hn.ngayhieuluc.astype("string") if "ngayhieuluc" in hn else pd.NA,
            "geometry_wkb": [g.wkb for g in geoms],
        }
    )
    out["pop_density_ppkm2"] = out.population / out.area_km2
    out = out.sort_values("commune_code").reset_index(drop=True)
    pq.write_table(
        pa.Table.from_pandas(out, preserve_index=False), paths.LAYERS / "admin_commune.parquet"
    )

    # --- ranh giới + vành đệm -------------------------------------------
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"kind": "boundary", "name": "Thành phố Hà Nội", "source": "VNSDI"},
                "geometry": aoi.as_geojson(b),
            },
            {
                "type": "Feature",
                "properties": {"kind": "buffer", "buffer_m": aoi.BUFFER_M, "source": "derived"},
                "geometry": aoi.as_geojson(bb),
            },
        ],
    }
    (paths.PROCESSED / "admin_boundary.geojson").write_text(json.dumps(fc), encoding="utf-8")

    # --- QA ---------------------------------------------------------------
    checks = []

    def chk(name, ok, detail=""):
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    chk("commune_code_unique", out.commune_code.is_unique, f"{out.commune_code.nunique()} mã")
    chk("all_geoms_valid", all(g.is_valid for g in geoms), "")
    chk("single_province", set(out.province_code) == {"01"}, str(sorted(set(out.province_code))))
    drift = abs(sum(area_geom) - out.area_km2.sum()) / out.area_km2.sum()
    chk("area_published_vs_geom_lt_2pct", drift < 0.02, f"lệch {drift:.2%}")
    chk("boundary_is_single_polygon", b.geom_type in ("Polygon", "MultiPolygon"), b.geom_type)
    chk("buffer_contains_boundary", bb.contains(b), "")

    report = {
        "layer": "admin",
        "source": "VNSDI (crawl aGiang-evcs data/interim/vnsdi)",
        "valid_from": str(hn.ngayhieuluc.iloc[0]),
        "published": str(hn.ngayxuatban.iloc[0]) if "ngayxuatban" in hn else None,
        "stats": {
            "n_communes": int(len(out)),
            "population_total": int(out.population.sum()),
            "area_km2_published": round(float(out.area_km2.sum()), 2),
            "area_km2_geom": round(float(sum(area_geom)), 2),
            "bbox_boundary": [round(v, 6) for v in b.bounds],
            "bbox_buffered": [round(v, 6) for v in bb.bounds],
            "buffer_m": aoi.BUFFER_M,
        },
        "checks": checks,
    }
    (paths.QA / "s01_admin.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report["stats"], ensure_ascii=False, indent=2))
    for c in checks:
        print(f"  [{c['status']}] {c['name']} {c['detail']}")


if __name__ == "__main__":
    main()
