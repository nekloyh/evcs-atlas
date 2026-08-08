"""Xuất dữ liệu cho web app — `make web-data`.

Ghi vào web/public/data/. Xem web/DESIGN.md §5.

Hai quyết định:
  · KHÔNG ship grid_h3_r8.geojson (8,3 MB). Web chỉ cần cột `h3_r8`; H3HexagonLayer
    của deck.gl tự dựng đa giác. Ràng buộc 3.
  · Convert commune.geometry_wkb → GeoJSON NGAY Ở ĐÂY (chỉ 126 đa giác), để phía web
    không phải thêm dependency parse WKB.

Ngoài hai việc đó, mọi thứ là copy nguyên bản — bước này không tạo khái niệm mới.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime

import pandas as pd
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import mapping

from . import paths

WEB_DATA = paths.ROOT / "web/public/data"

# Copy nguyên bản
COPY_PARQUET = [
    "grid_h3_r8.parquet",
    "stations.parquet",
    "connectors.parquet",
    "station_occupancy.parquet",
    "station_occupancy_profile_168h.parquet",
]
COPY_GEOJSON = ["admin_boundary.geojson"]

# Không ship — web tự dựng hình học từ mã H3
SKIP = ["grid_h3_r8.geojson"]

# Cột hạng mục — manifest ghi số đếm từng giá trị. Web dùng chúng cho hai việc: thứ tự
# bậc màu của trường hạng mục (§6a quy tắc 5) và các con số trong ngoặc ở panel Ô (§8).
CATEGORY_COLUMNS = [
    "pop_source",
    "evidence_grade_distance",
    "screen_decision",
    "cell_state",
]


def commune_geojson() -> dict:
    """126 đa giác xã/phường, WKB → GeoJSON. Bỏ cột geometry_wkb khỏi properties."""
    df = pq.read_table(paths.PROCESSED / "commune.parquet").to_pandas()
    features = []
    for row in df.to_dict("records"):
        geom = wkb.loads(bytes(row.pop("geometry_wkb")))
        props = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        features.append({"type": "Feature", "geometry": mapping(geom), "properties": props})
    return {"type": "FeatureCollection", "features": features}


def poi_geojson() -> tuple[dict, dict]:
    """(FeatureCollection, khối `poi` cho manifest) — lớp POI VISUAL 4 nhóm (DESIGN §11 M3.5).

    Polygon/MultiPolygon cho POI có hình thật; Point cho POI chỉ-điểm — hai loại feature
    trong CÙNG một file, vì "có polygon hay không" là một thuộc tính của từng POI mà web
    phải đọc được từ hình học, không phải từ một cờ ngoài lề.

    Khối manifest mang tỉ lệ có-polygon từng nhóm: tab LAYER in con số đó (ràng buộc 4 —
    tính lúc export, không hardcode trong TS).
    """
    src = paths.RAW / "osm_hanoi_poi_visual.parquet"
    if not src.exists():
        raise SystemExit(f"Thiếu {src} — chạy `uv run python -m hanoi.s03b_osm_poi_visual` trước.")
    df = pq.read_table(src).to_pandas()

    # 6 chữ số thập phân ≈ 0,11 m — dưới hẳn độ chính xác vẽ tay của OSM, và tiết kiệm
    # ~25% dung lượng so với float đầy đủ. Đây là làm tròn MÃ HOÁ, không phải đơn giản
    # hoá hình học: không đỉnh nào bị bỏ.
    def r6(coords):
        if isinstance(coords, (float, int)):
            return round(float(coords), 6)
        return [r6(c) for c in coords]

    features = []
    for row in df.to_dict("records"):
        gwkb = row.pop("geometry_wkb")
        if gwkb is not None:
            geom = mapping(wkb.loads(bytes(gwkb)))
            geom = {"type": geom["type"], "coordinates": r6(geom["coordinates"])}
        else:
            geom = {"type": "Point", "coordinates": [r6(row["lng"]), r6(row["lat"])]}
        props = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        features.append({"type": "Feature", "geometry": geom, "properties": props})

    groups = {}
    for g in sorted(df.group.unique()):
        sub = df[df.group == g]
        n_poly = int(sub.geometry_wkb.notna().sum())
        groups[g] = {
            "n": int(len(sub)),
            "n_polygon": n_poly,
            "share_polygon": round(n_poly / len(sub), 6),
        }
    return {"type": "FeatureCollection", "features": features}, {"groups": groups}


def substation_geojson() -> tuple[dict, dict]:
    """(FeatureCollection điểm, khối cho `source_metrics.osm_substations`) — M5.

    LỚP ĐIỂM và chỉ điểm. Đa giác của trạm biến áp đã bị nén thành tâm ngay ở `s03c`, nên
    ở đây không có gì để chọn: file này không mang hình học nào ngoài một cặp toạ độ, và
    vì thế không có đường nào để một bán kính phục vụ hay một bậc công suất lẻn vào (§12).

    Số đếm đi kèm là số đo, KHÔNG phải một lời hứa về độ phủ: OSM phủ hạ tầng điện rất
    thưa, nên `n` là **chặn dưới**. Cùng khuôn `apartment_levels_sum` ở §7 — manifest phát
    con số, TS phát câu chữ.
    """
    src = paths.RAW / "osm_hanoi_substations.parquet"
    if not src.exists():
        raise SystemExit(f"Thiếu {src} — chạy `uv run python -m hanoi.s03c_osm_substation` trước.")
    df = pq.read_table(src).to_pandas()

    features = []
    for row in df.to_dict("records"):
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(float(row["lng"]), 6), round(float(row["lat"]), 6)],
                },
                "properties": {
                    "osm_type": row["osm_type"],
                    "osm_id": int(row["osm_id"]),
                    "name": None if pd.isna(row["name"]) else row["name"],
                },
            }
        )

    by_type = {str(k): int(v) for k, v in df.osm_type.value_counts().items()}
    meta = {
        "n": int(len(df)),
        # Bao nhiêu cái được OSM vẽ bằng ĐA GIÁC (way/relation) — ta ship tâm của chúng.
        # Con số này để tab LAYER nói được rằng lớp điểm là một LỰA CHỌN của ta, không
        # phải giới hạn của nguồn.
        "n_mapped_as_area": int(sum(v for k, v in by_type.items() if k in ("way", "relation"))),
        "n_mapped_as_node": int(by_type.get("node", 0)),
        "n_named": int(df.name.notna().sum()),
        "tag": "power=substation",
        "aoi": "Hà Nội + đệm 5 km",
    }
    return {"type": "FeatureCollection", "features": features}, meta


def field_coverage(grid: pd.DataFrame) -> dict:
    """Phủ theo Ô và phủ theo DÂN — hai nghĩa khác nhau, phải đi cùng nhau (§7).

    Tính cho **mọi** cột, không cho một danh sách chọn sẵn: badge ⚠ phủ-ô ở web là một
    quy tắc chạy trên số đo (`cell_share < 1`), không phải một danh sách gõ tay. Cột nào
    tương lai bị khuyết thì badge tự mọc.
    """
    total_pop = float(grid.population.sum())
    out = {}
    for f in grid.columns:
        present = grid[f].notna()
        out[f] = {
            "n_present": int(present.sum()),
            "cell_share": round(float(present.mean()), 6),
            "pop_share": round(float(grid.loc[present, "population"].sum() / total_pop), 6),
        }
    # apartment_levels_sum không có null nhưng lệch 0 nặng — phủ thật là chuyện khác.
    has_apt = grid.n_apartment > 0
    out["apartment_levels_sum"]["nonzero_cells"] = int((grid.apartment_levels_sum > 0).sum())
    out["apartment_levels_sum"]["share_of_cells_with_apartments"] = round(
        float((grid.loc[has_apt, "apartment_levels_sum"] > 0).mean()), 6
    )

    # `util_cell` đọc trên mẫu số 4.427 thì ra "đo kém"; mẫu số đúng là số ô CÓ TRẠM.
    # Hai con số này để web nói được điều đó mà không phải gõ phần trăm vào TS (§7c).
    has_st = grid.n_stations > 0
    out["util_cell"]["cells_with_station"] = int(has_st.sum())
    out["util_cell"]["share_measured_among_cells_with_station"] = round(
        float(grid.loc[has_st, "util_cell"].notna().mean()), 6
    )
    return out


def category_counts(grid: pd.DataFrame) -> dict:
    """Số đếm từng giá trị của các cột hạng mục, kèm số ô null."""
    out = {}
    for c in CATEGORY_COLUMNS:
        vc = grid[c].value_counts(dropna=True)
        out[c] = {
            "values": {str(k): int(v) for k, v in vc.items()},
            "n_null": int(grid[c].isna().sum()),
        }
    return out


def totals() -> dict:
    """Tổng CUNG — KPI row của chế độ DỮ LIỆU (DESIGN §3f-1), thi công M4.2.

    §3f nói thẳng: *"mọi số đọc từ `manifest.json`, không gõ tay số nào"*. Tổng cổng và
    tổng MW là hai con số duy nhất của KPI row chưa có nguồn nào phát ra, nên chúng phát
    ở đây — tính lúc export, đúng ràng buộc 4.

    **Mỗi tổng đi kèm số hàng KHUYẾT của chính cột đó, và đó không phải trang trí.** Một
    phép cộng trên cột có null là một **chặn dưới**, không phải một số đo: 26 trạm khuyết
    `n_ports` và 27 trạm khuyết `power_kw_site`. In tổng mà im lặng về mẫu số là đúng loại
    nói dối mà ràng buộc 1 cấm trên bản đồ, chỉ khác là bằng chữ — nên `n_missing` đi cùng
    tổng ở mọi khối dưới đây, và web phải hiện nó.

    Cắt theo `scope` vì `HANOI` và `BUFFER` là hai tư cách khác nhau (§4d): trạm vành đệm
    có mặt để tính phủ đúng ở biên và **không vào bất kỳ con số nào của thành phố**.
    """
    st = pq.read_table(
        paths.PROCESSED / "stations.parquet",
        columns=["scope", "n_ports", "power_kw_site", "op_status"],
    ).to_pandas()

    def cut(df: pd.DataFrame) -> dict:
        return {
            "n_stations": int(len(df)),
            "n_ports": int(df.n_ports.sum()),
            "n_ports_missing": int(df.n_ports.isna().sum()),
            # kW → MW ở đây chứ không ở web: đơn vị là một quyết định về dữ liệu, và làm
            # phép chia hai lần ở hai chỗ là cách hai chỗ trôi khỏi nhau.
            "power_mw": round(float(df.power_kw_site.sum()) / 1000, 3),
            "power_missing": int(df.power_kw_site.isna().sum()),
        }

    # Khoá là `in_scope`, KHÔNG phải `hanoi`. Lý do không phải thẩm mỹ: store toàn quốc
    # phát cùng khối này cho từng tỉnh, và một khoá tên `hanoi` trong manifest của Cao Bằng
    # hoặc phải bỏ trống (KPI row mất) hoặc phải mang số của Cao Bằng (tên nói dối). Mốc
    # phân biệt cũng neo vào `BUFFER` chứ không vào tên phạm vi — `HANOI` ở bộ này, `IN` ở
    # store toàn quốc, và chỉ `BUFFER` mang cùng một nghĩa ở cả hai.
    out = {
        "all": cut(st),
        "in_scope": cut(st[st.scope != "BUFFER"]),
        "buffer": cut(st[st.scope == "BUFFER"]),
        # Trạng thái vận hành — cùng bộ số mà toggle §4d-3a của M4.1 bật/tắt trên bản đồ.
        # Bảng và bản đồ đọc CÙNG một nguồn, nên chúng không nói hai con số khác nhau.
        "op_status": {str(k): int(v) for k, v in st.op_status.value_counts(dropna=False).items()},
    }

    # Chuẩn phích — khối 4 của §3f. `UNKNOWN` là **vắng thông tin**, không phải một chuẩn
    # thứ ba: web vẽ nó bằng vân xám, cùng khái niệm với ô null (ràng buộc 1). Ở đây chỉ
    # phát số; việc nó KHÔNG được một bậc màu là quyết định của tầng vẽ.
    cn = pq.read_table(
        paths.PROCESSED / "connectors.parquet",
        columns=["station_code", "connector_standard", "count_total"],
    ).to_pandas()
    out["connectors"] = {
        "by_standard": {
            str(k): {
                "n_rows": int(len(g)),
                "n_guns": int(g.count_total.sum()),
            }
            for k, g in cn.groupby("connector_standard")
        },
        "n_guns": int(cn.count_total.sum()),
        "n_stations_with_connectors": int(cn.station_code.nunique()),
    }

    # Hai khối TRUNG TÍNH — cùng số với `source_metrics.occ_status_ok` và
    # `source_metrics.private_ac_dropped`, khác ở chỗ **tên trường không mang chữ `hanoi`**
    # nên store toàn quốc phát được y hệt. UI đọc bản này; hai khối cũ ở `source_metrics`
    # giữ nguyên (chúng là số đo về NGUỒN, và DATA_DICTIONARY trỏ tới chúng), nhưng không
    # còn chỗ nào trong web đọc chúng. Một khái niệm, một hình dạng.
    occf = paths.PROCESSED / "station_occupancy.parquet"
    if occf.exists():
        o = pq.read_table(occf, columns=["occ_status"]).to_pandas()
        out["occ_status_ok"] = {
            "n_total": int(len(o)),
            "n_ok": int((o.occ_status == "OK").sum()),
            "share": round(float((o.occ_status == "OK").mean()), 6),
        }

    qa = paths.QA / "s05_stations.json"
    if qa.exists():
        d = json.loads(qa.read_text(encoding="utf-8"))["dropped_private_ac"]
        out["private_ac_dropped"] = {
            "n": int(d["n_dropped_total"]),
            "share_stations": d["share_of_hanoi_stations_before"],
            "share_ports": d["share_of_hanoi_ports_before"],
            "share_power": d["share_of_hanoi_power_before"],
        }
    return out


def source_metrics() -> dict:
    """Số đo về **nguồn thượng nguồn**, cho badge ⚠ nguồn (§7).

    Đây là loại khuyết mà cột không thấy được: cột 100% không-null nhưng bản thân nguồn
    chỉ mô tả một phần thực tế. Đo trên bản trích Hà Nội trong `data/raw/` — thiếu file
    thì bỏ chỉ số đó đi, chứ không đoán.
    """
    out: dict = {}

    poi = paths.RAW / "osm_hanoi_poi.parquet"
    if poi.exists():
        apt = pq.read_table(poi, columns=["poi_class", "levels"]).to_pandas()
        apt = apt[apt.poi_class == "APARTMENT"]
        out["apartment_levels_tagged"] = {
            "n_total": int(len(apt)),
            "n_tagged": int(apt.levels.notna().sum()),
            "share": round(float(apt.levels.notna().mean()), 6),
        }

    # Khoảng trống POI — loại khuyết mà cột KHÔNG thấy được: `n_poi_1km` không có ô null
    # nào, nhưng phần lớn số 0 nghĩa là "OSM chưa vẽ tới", không phải "không có hoạt động".
    # Đo được ở notebook `poi_chat_luong`: 47,6% xã/phường không có một cái chợ nào trong OSM,
    # và một km² đất đã xây ở Phường có POI gấp 14 lần cùng diện tích ở Xã.
    gridf = paths.PROCESSED / "grid_h3_r8.parquet"
    if gridf.exists():
        g = pq.read_table(gridf, columns=["n_poi_1km", "population", "commune_code"]).to_pandas()
        z = g.n_poi_1km == 0
        out["poi_empty_1km"] = {
            "n_cells": int(len(g)),
            "n_cells_zero": int(z.sum()),
            "share_cells": round(float(z.mean()), 6),
            "share_pop": round(float(g.loc[z, "population"].sum() / g.population.sum()), 6),
        }

    # Chất lượng đo ở TẦNG TRẠM — khác hẳn phủ ở tầng ô, và web phải nói được cả hai
    # (DESIGN §7b). Không có nó thì câu "96,2%" là số gõ tay.
    occ = paths.PROCESSED / "station_occupancy.parquet"
    if occ.exists():
        o = pq.read_table(occ, columns=["occ_status"]).to_pandas()
        out["occ_status_ok"] = {
            "n_total": int(len(o)),
            "n_ok": int((o.occ_status == "OK").sum()),
            "share": round(float((o.occ_status == "OK").mean()), 6),
        }

    # Số trạm bị loại bởi bộ lọc điểm sạc cá nhân (DECISIONS §3a). Lớp TRẠM của M2 phải
    # nói ra được rằng bản đồ này KHÔNG vẽ 3.347 trạm — im lặng ở đây là nói dối về cung.
    qa = paths.QA / "s05_stations.json"
    if qa.exists():
        out["private_ac_dropped"] = json.loads(qa.read_text(encoding="utf-8"))["dropped_private_ac"]

    return out


def snapshots() -> dict:
    """Ngày ảnh chụp cho khối NGUỒN (§8). Đọc từ dữ liệu ở đâu đọc được."""
    occ = pq.read_table(
        paths.PROCESSED / "station_occupancy.parquet",
        columns=["snapshot_id", "window_start_utc", "window_end_utc"],
    ).to_pandas()
    comm = pq.read_table(paths.PROCESSED / "commune.parquet", columns=["valid_from"]).to_pandas()
    return {
        # Hai dòng này đọc được từ dữ liệu.
        "occupancy_snapshot_id": str(occ.snapshot_id.iloc[0]),
        "occupancy_window": [str(occ.window_start_utc.iloc[0]), str(occ.window_end_utc.iloc[0])],
        "vnsdi_valid_from": str(comm.valid_from.iloc[0]),
        # Hai dòng này KHÔNG: chúng là ngày freeze của nguồn thượng nguồn, không có cột
        # nào mang chúng. Giữ ở đây (tầng dữ liệu) chứ không ở TS, và khớp với
        # DATA_DICTIONARY "Ngày ảnh chụp của từng nguồn".
        "osm_pbf": "28/07/2026",
        "stations_canonical": "29/07/2026",
    }


def main() -> None:
    WEB_DATA.mkdir(parents=True, exist_ok=True)

    files = {}
    for name in COPY_PARQUET + COPY_GEOJSON:
        src = paths.PROCESSED / name
        if not src.exists():
            raise SystemExit(f"Thiếu {src} — chạy `make all` trước.")
        dst = WEB_DATA / name
        shutil.copy2(src, dst)
        rows = pq.read_metadata(src).num_rows if name.endswith(".parquet") else None
        files[name] = {"bytes": dst.stat().st_size, "rows": rows}
        print(
            f"  {name:44s} {dst.stat().st_size / 1e6:6.2f} MB"
            + (f"  {rows:,} dòng" if rows else "")
        )

    gj = commune_geojson()
    dst = WEB_DATA / "commune.geojson"
    dst.write_text(json.dumps(gj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    files["commune.geojson"] = {"bytes": dst.stat().st_size, "rows": len(gj["features"])}
    print(
        f"  {'commune.geojson':44s} {dst.stat().st_size / 1e6:6.2f} MB  {len(gj['features'])} đa giác"
    )

    # M3.5 — lớp POI VISUAL 4 nhóm, hình học thật (DESIGN §5a + §11 M3.5).
    pgj, poi_meta = poi_geojson()
    dst = WEB_DATA / "poi.geojson"
    dst.write_text(json.dumps(pgj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    files["poi.geojson"] = {"bytes": dst.stat().st_size, "rows": len(pgj["features"])}
    print(f"  {'poi.geojson':44s} {dst.stat().st_size / 1e6:6.2f} MB  {len(pgj['features']):,} POI")

    # M5 — lớp trạm biến áp OSM (DESIGN §5a + §11 M5). Điểm, và chỉ điểm.
    sgj, sub_meta = substation_geojson()
    dst = WEB_DATA / "substations.geojson"
    dst.write_text(json.dumps(sgj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    files["substations.geojson"] = {"bytes": dst.stat().st_size, "rows": len(sgj["features"])}
    print(
        f"  {'substations.geojson':44s} {dst.stat().st_size / 1e6:6.2f} MB  "
        f"{len(sgj['features'])} trạm biến áp"
    )

    # M3-R — lớp mạng đường + cặp đường minh hoạ (DESIGN §5a, khối M3 trong §11).
    from . import web_export_roads

    roads_info = web_export_roads.export(WEB_DATA)
    files.update(roads_info["files"])

    grid = pq.read_table(paths.PROCESSED / "grid_h3_r8.parquet").to_pandas()
    # §7c liệt kê `osm_substations` trong `source_metrics` từ M1 nhưng chưa bao giờ có
    # bước nào phát nó — M5 trả nợ. Nó thuộc đúng khối đó chứ không phải một khối mới:
    # đây là số đo về **nguồn thượng nguồn** (OSM khuyết tới mức nào), cùng loại với
    # `apartment_levels_tagged`, không phải phủ của một cột.
    sm = source_metrics()
    sm["osm_substations"] = sub_meta
    manifest = {
        "exported_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "n_cells": int(len(grid)),
        "files": files,
        "coverage": field_coverage(grid),
        "categories": category_counts(grid),
        # M4.2 — KPI row của chế độ DỮ LIỆU (§3f-1). Khối riêng chứ không nhét vào
        # `source_metrics`: đó là số đo về *chất lượng nguồn*, còn đây là *tổng cung* —
        # hai câu hỏi khác nhau, và trộn chúng sẽ làm khối kia mất nghĩa.
        "totals": totals(),
        "source_metrics": sm,
        "poi": poi_meta,
        "roads": roads_info["meta"],
        "snapshots": snapshots(),
        "not_shipped": {name: "web dựng hình học từ cột h3_r8 (ràng buộc 3)" for name in SKIP},
    }
    (WEB_DATA / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    total = sum(f["bytes"] for f in files.values())
    print(f"\n  tổng {total / 1e6:.1f} MB → {WEB_DATA.relative_to(paths.ROOT)}")
    print("\n  phủ ô < 100% (những trường này mang badge ⚠ phủ ô trong rail):")
    for f, c in manifest["coverage"].items():
        if c["cell_share"] < 1:
            print(f"    {f:26s} {c['cell_share']:6.1%} ô  ·  {c['pop_share']:6.1%} dân")
    print("\n  số đo nguồn (badge ⚠ nguồn):")
    for k, v in manifest["source_metrics"].items():
        print(f"    {k:26s} {v}")


if __name__ == "__main__":
    main()
