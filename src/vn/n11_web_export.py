"""N11 — Xuất store cho web, **thêm** vào bên cạnh bản Hà Nội đang chạy, không đè lên nó.

Sinh:
  web/public/data/provinces.parquet    chỉ mục 34 tỉnh — bảng NHẸ cho màn hình đầu
  web/public/data/provinces.geojson    34 đa giác tỉnh (đã đơn giản hoá) cho màn hình đầu
  web/public/data/p/<code>/…           một bộ file cho mỗi tỉnh, TÊN FILE GIỮ NGUYÊN

Hai quyết định làm nên tính "không vỡ" của bước này:

1. **Tên file trong mỗi thư mục tỉnh giống hệt tên file mà web đang đọc.** ``queries.ts``
   giữ nguyên các hằng ``GRID``/``STATIONS``/``ROADS``…; thứ duy nhất đổi là **tiền tố
   đường dẫn**. Không hàm nào trong web đổi chữ ký.

2. **`web/public/data/*.parquet` cũ không bị đụng.** Đường dẫn không có tiền tố tỉnh vẫn
   trỏ đúng bộ Hà Nội đầy đủ (có cả lớp TÍNH TOÁN). Tỉnh nào cũng mở được ở đường dẫn mới;
   Hà Nội mở được ở CẢ HAI, và hai bản khác nhau ở chỗ nào thì ``manifest.available_fields``
   nói ra.

── MANIFEST KHAI BÁO CỘT CÓ MẶT ───────────────────────────────────────────────────────

Đây là mấu chốt để giao diện không vỡ. Bộ toàn quốc lần này không có lớp TÍNH TOÁN, nên
``grid_h3_r8.parquet`` của tỉnh thiếu ``population``, ``built_frac``, ``dist_station_*``,
``screen_decision``, ``util_cell``. Một ``SELECT`` cột không tồn tại làm DuckDB ném lỗi và
màn hình trắng. ``manifest.available_columns`` liệt kê cột THẬT SỰ có; rail lọc trường theo
đó và nói rõ trường vắng vì **chưa tính**, không phải vì **dữ liệu hỏng**.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import mapping

from evcs.schema import COMMUNE, GRID
from evcs.core.osm import ACCESS_BLOCKED

from . import admin, paths, qa
from .n10_quality import MIN_OCC_MEASURED_SHARE
from .runner import Step

VERSION = "8"  # 8: web road surface chỉ còn public-driveable; thêm count access-blocked

WEB_DATA = paths.ROOT / "web/public/data"
WEB_PROV = WEB_DATA / "p"

# Bỏ khi SHIP, giữ khi TÍNH — cùng luật với bản Hà Nội (web_export_roads §3). Lối nội bộ
# không chở luận điểm nào và chiếm phần lớn số đoạn.
SHIP_EXCLUDE_ROAD_CLASS = {"SERVICE"}

# Đa giác tỉnh cho MÀN HÌNH ĐẦU được đơn giản hoá mạnh: ở mức phóng cả nước một tỉnh rộng
# vài chục pixel, giữ từng đỉnh là chở dữ liệu không ai nhìn thấy. 0,005° ≈ 550 m.
PROVINCE_SIMPLIFY_DEG = 0.005
# Đa giác xã trong một tỉnh thì KHÔNG đơn giản hoá — chúng là ĐƠN VỊ ĐỌC và là thứ người
# dùng bấm vào; bản Hà Nội đang chạy cũng không đơn giản hoá. Giữ giống nhau để hai bản so
# được. Chỉ làm tròn toạ độ: 5 chữ số ≈ 1,1 m, dưới hẳn độ chính xác của chính nguồn.
GEO_DECIMALS = 5
# Ranh giới tỉnh + vành đệm là lớp BỐI CẢNH thuần tuý — không bấm được, không mang số nào.
# Đo được: bờ biển Khánh Hoà chưa đơn giản hoá chiếm 3,5 MB, lớn hơn cả lưới và mạng đường
# cộng lại. 0,0005° ≈ 55 m, không thấy khác ở mức phóng của một tỉnh.
BOUNDARY_SIMPLIFY_DEG = 0.0005

CATEGORY_COLUMNS = ["cell_state", "pop_source", "evidence_grade_distance", "screen_decision"]


def _round_coords(c, nd: int):
    if isinstance(c, (float, int)):
        return round(float(c), nd)
    return [_round_coords(x, nd) for x in c]


def _fc(features: list) -> str:
    return json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _commune_geojson(code: str) -> tuple[str, int, list[str]]:
    """Đa giác xã của tỉnh — đọc thẳng ``commune.parquet`` mà ``n09_assemble`` đã dựng.

    Trước khi có lớp TÍNH TOÁN, bước này tự cộng cung theo xã. Giờ thì không: cộng ở hai
    chỗ là mời hai con số cho cùng một khái niệm, và đúng loại lỗi mà "một khái niệm một
    trường" cấm. Ở đây chỉ còn WKB → GeoJSON và làm tròn toạ độ.

    Trả thêm DANH SÁCH THUỘC TÍNH có mặt: trường của XÃ đọc từ file này chứ không từ lưới,
    nên ``available_columns`` (nói về lưới) không nói gì về chúng.
    """
    cm = pq.read_table(paths.PROV / code / "commune.parquet").to_pandas()
    feats = []
    for row in cm.to_dict("records"):
        m = mapping(wkb.loads(bytes(row.pop("geometry_wkb"))))
        geom = {"type": m["type"], "coordinates": _round_coords(m["coordinates"], GEO_DECIMALS)}
        props = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        feats.append({"type": "Feature", "geometry": geom, "properties": props})
    # Danh sách thuộc tính lấy từ BẢN KHAI, không từ dòng đầu tiên tình cờ có mặt: một xã
    # có `quality_flag` null vẫn phải khai rằng cột đó tồn tại. Giao diện lọc trường của XÃ
    # theo danh sách này (`fieldAvailable` nhánh `readAs === "commune"`), nên suy nó từ dữ
    # liệu là để một giá trị null quyết định một trường có hiện hay không.
    thuc_te = set(feats[0]["properties"].keys()) if feats else set()
    la = sorted(thuc_te - set(COMMUNE.names()))
    if la:
        raise SystemExit(f"Tỉnh {code}: commune.geojson có thuộc tính chưa khai ở schema: {la}")
    keys = sorted(COMMUNE.names())
    return _fc(feats), len(feats), keys


def _boundary_geojson(code: str) -> str:
    """Ranh giới + vành đệm, đã đơn giản hoá — lớp BỐI CẢNH, xem BOUNDARY_SIMPLIFY_DEG."""
    src = json.loads((paths.ADMIN / "boundary" / f"{code}.geojson").read_text("utf-8"))
    for f in src["features"]:
        from shapely.geometry import shape

        g = shape(f["geometry"]).simplify(BOUNDARY_SIMPLIFY_DEG, preserve_topology=True)
        m = mapping(g)
        f["geometry"] = {
            "type": m["type"],
            "coordinates": _round_coords(m["coordinates"], GEO_DECIMALS),
        }
        f["properties"]["simplify_tolerance_deg"] = BOUNDARY_SIMPLIFY_DEG
    return json.dumps(src, ensure_ascii=False, separators=(",", ":"))


def _poi_geojson(code: str) -> tuple[str, dict]:
    df = pq.read_table(paths.PROV / code / "poi_visual.parquet").to_pandas()
    feats = []
    for row in df.to_dict("records"):
        g = row.pop("geometry_wkb")
        if g is not None:
            m = mapping(wkb.loads(bytes(g)))
            geom = {"type": m["type"], "coordinates": _round_coords(m["coordinates"], 6)}
        else:
            geom = {"type": "Point", "coordinates": [round(row["lng"], 6), round(row["lat"], 6)]}
        props = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        feats.append({"type": "Feature", "geometry": geom, "properties": props})
    groups = {}
    for grp in sorted(df.group.unique()) if len(df) else []:
        sub = df[df.group == grp]
        n_poly = int(sub.geometry_wkb.notna().sum())
        groups[grp] = {
            "n": int(len(sub)),
            "n_polygon": n_poly,
            "share_polygon": round(n_poly / len(sub), 6),
        }
    return _fc(feats), {"groups": groups}


def _roads_parquet(code: str, dst) -> dict:
    t = pq.read_table(paths.PROV / code / "roads.parquet")
    df = t.to_pandas()
    n_all = len(df)
    # Surface web chỉ là mạng xe công cộng đi được. `roads.parquet` sản phẩm vẫn giữ đủ
    # đường để audit; không ship access=private/no/... rồi vẽ xám như thể đó là khoảng
    # cách chưa đo được. Null sau filter chỉ còn nghĩa nhãn distance thật sự vắng.
    in_scope = df.in_province
    excluded_class = df.road_class.isin(SHIP_EXCLUDE_ROAD_CLASS)
    excluded_access = df.access.fillna("").str.lower().isin(ACCESS_BLOCKED)
    ship = df[in_scope & ~excluded_class & ~excluded_access].copy()

    # Nhãn khoảng cách theo ĐOẠN, do `n07` tính. Nối bằng ``osm_id`` chứ không theo vị trí:
    # bảng nhãn chỉ có những đoạn NẰM TRONG đồ thị (đã lọc `access`), nên nó là tập con.
    #
    # Đoạn bị `access` chặn vẫn được SHIP (nó có thật, xe khác vẫn đi) nhưng KHÔNG có nhãn
    # — và `null` ở đây nghĩa là "không nằm trong mạng xe công chúng đi được", không phải
    # "khoảng cách bằng 0". Web vẽ chúng xám.
    rdp = paths.PROV / code / "road_dist.parquet"
    if rdp.exists():
        lab = pq.read_table(rdp).to_pandas()
        ship["dist_station_m"] = ship.osm_id.map(dict(zip(lab.osm_id, lab.dist_station_m)))
    else:
        ship["dist_station_m"] = pd.Series([pd.NA] * len(ship), dtype="Float32")

    cols = ["osm_id", "road_class", "bridge", "dist_station_m", "coords"]
    ship = ship[cols].sort_values("road_class")
    pq.write_table(pa.Table.from_pandas(ship, preserve_index=False), dst, compression="zstd")
    n_null = int(ship.dist_station_m.isna().sum())
    return {
        "ways_in_shard": n_all,
        "ways_shipped": int(len(ship)),
        "ways_dropped_buffer_copy": int((~df.in_province).sum()),
        "ways_dropped_service": int(
            (in_scope & excluded_class).sum()
        ),
        "ways_dropped_access_blocked": int((in_scope & ~excluded_class & excluded_access).sum()),
        "bridge_ways_shipped": int(df[df.in_province].bridge.sum()),
        # Cùng tên khoá với bộ Hà Nội — `story/bodies.tsx` đọc đúng hai khoá này, và thiếu
        # chúng là chỗ `formatNumber(undefined)` từng ném TypeError.
        "ways_unreachable_null_dist": n_null,
    }


def _substation_geojson(code: str) -> tuple[str, dict]:
    """Lớp ĐIỂM trạm biến áp của một tỉnh — chỉ ``scope='IN'``.

    Cùng hình dạng với bản Hà Nội, ba property và không hơn. File không mang hình học nào
    ngoài một cặp toạ độ, nên **không có đường nào để một bán kính phục vụ hay một bậc công
    suất lẻn vào** — xem ``evcs.core.osm.is_substation``.

    Số đếm đi kèm là SỐ ĐO, không phải một lời hứa về độ phủ: OSM phủ hạ tầng điện rất thưa
    nên ``n`` là **chặn dưới**. Manifest phát con số, giao diện phát câu chữ.
    """
    src = paths.PROV / code / "substations.parquet"
    if not src.exists():
        return "", {}
    df = pq.read_table(src).to_pandas()
    # Ship CẢ vành đệm, đúng như bộ Hà Nội. Đây là lớp BỐI CẢNH: một trạm biến áp ngay bên
    # kia ranh giới vẫn nói đúng điều nó nói, và lọc nó đi tạo một mép cứng giả tạo dọc
    # biên. Khác hẳn bảng trạm SẠC, nơi `scope` quyết định phép cộng dồn — lớp này không
    # được cộng dồn ở đâu cả, nên không có gì để đếm trùng.
    #
    # Đối chứng: 132 dòng ở tỉnh 01 = 98 IN + 34 BUFFER, trùng khít con số của bộ Hà Nội.
    feats = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(float(r["lng"]), 6), round(float(r["lat"]), 6)],
            },
            "properties": {
                "osm_type": r["osm_type"],
                "osm_id": int(r["osm_id"]),
                "name": None if pd.isna(r["name"]) else r["name"],
            },
        }
        for r in df.to_dict("records")
    ]
    by_type = {str(k): int(v) for k, v in df.osm_type.value_counts().items()}
    meta = {
        "n": int(len(df)),
        # Bao nhiêu cái được OSM vẽ bằng ĐA GIÁC — ta ship TÂM của chúng. Con số này để tab
        # LAYER nói được rằng lớp điểm là một LỰA CHỌN của ta, không phải giới hạn của nguồn.
        "n_mapped_as_area": int(sum(v for k, v in by_type.items() if k in ("way", "relation"))),
        "n_mapped_as_node": int(by_type.get("node", 0)),
        "n_named": int(df.name.notna().sum()),
        "n_in_province": int((df.scope == "IN").sum()),
        "n_in_buffer": int((df.scope == "BUFFER").sum()),
        "tag": "power=substation",
        "aoi": "ranh giới tỉnh + đệm 5 km",
    }
    return _fc(feats), meta


def _reference_columns() -> set[str]:
    """Tập cột ĐẦY ĐỦ theo khai báo — mốc so sánh để biết tỉnh nào còn thiếu gì.

    Trước đây mốc này đọc từ ``data/processed/grid_h3_r8.parquet``, tức từ bộ **Hà Nội**.
    Hai chỗ hỏng vì thế:

    * chạy lại pipeline Hà Nội đổi ``missing_layers`` của **cả 34 tỉnh** mà không làm hết
      hạn một vân tay nào — bước này không hề khai file đó là nguồn;
    * bộ Hà Nội có ``road_len_in_hanoi_m``, một cột chỉ có nghĩa ở một tỉnh. Đo được:
      manifest của **cả 34 tỉnh** đều khai thiếu nó. Giao diện được báo là thiếu một lớp
      không hề tồn tại.

    Mốc đúng là bảng ĐÃ KHAI, không phải một phân mảnh cụ thể nào.
    """
    return set(GRID.names())


def _coverage(grid: pd.DataFrame) -> dict:
    """Phủ theo Ô **và** theo DÂN cho mọi cột — hai nghĩa khác nhau, phải đi cùng nhau (§7).

    ``pop_share`` chỉ phát khi cột ``population`` tồn tại. Tính nó bằng trọng số đều rồi gọi
    là "phần dân" là bịa ra một số đo mà dữ liệu không có.
    """
    has_pop = "population" in grid.columns
    total_pop = float(grid.population.sum()) if has_pop else 0.0
    out = {}
    for c in grid.columns:
        present = grid[c].notna()
        rec = {
            "n_present": int(present.sum()),
            "cell_share": round(float(present.mean()), 6),
        }
        if has_pop and total_pop > 0:
            rec["pop_share"] = round(float(grid.loc[present, "population"].sum() / total_pop), 6)
        out[c] = rec
    if "util_cell" in grid.columns and "n_stations" in grid.columns:
        # `util_cell` đọc trên mẫu số toàn lưới thì ra "đo kém"; mẫu số đúng là số ô CÓ TRẠM.
        has_st = grid.n_stations > 0
        out["util_cell"]["cells_with_station"] = int(has_st.sum())
        out["util_cell"]["share_measured_among_cells_with_station"] = round(
            float(grid.loc[has_st, "util_cell"].notna().mean()) if has_st.any() else 0.0, 6
        )
    return out


def _totals(src) -> dict:
    """Khối ``totals`` của một tỉnh — KPI row của chế độ DỮ LIỆU (web/DESIGN.md §3f-1).

    **Cùng hình dạng với `hanoi/web_export.totals`, không phải một hình dạng thứ hai.** Nếu
    hai bộ dữ liệu phát hai hình dạng thì mọi chỗ đọc phải biết mình đang ở bộ nào, và cái
    biết đó sẽ rò ra khắp UI. Vì thế khoá là ``in_scope`` chứ không phải ``hanoi``/``tinh``,
    và mốc phân biệt neo vào ``BUFFER`` — hằng số duy nhất mang cùng nghĩa ở cả hai bộ
    (phía bên kia là ``HANOI`` ở bản Hà Nội và ``IN`` ở đây).

    **Mỗi tổng đi kèm số hàng KHUYẾT của chính cột đó.** Một phép cộng trên cột có null là
    một *chặn dưới*, không phải một số đo; KPI row in ra điều đó thay vì để một con số tròn
    trịa đứng một mình.
    """
    st = pq.read_table(
        src / "stations.parquet",
        columns=["scope", "n_ports", "power_kw_site", "op_status"],
    ).to_pandas()

    def cut(df: pd.DataFrame) -> dict:
        return {
            "n_stations": int(len(df)),
            "n_ports": int(df.n_ports.sum()),
            "n_ports_missing": int(df.n_ports.isna().sum()),
            "power_mw": round(float(df.power_kw_site.sum()) / 1000, 3),
            "power_missing": int(df.power_kw_site.isna().sum()),
        }

    out = {
        "all": cut(st),
        "in_scope": cut(st[st.scope != "BUFFER"]),
        "buffer": cut(st[st.scope == "BUFFER"]),
        "op_status": {str(k): int(v) for k, v in st.op_status.value_counts(dropna=False).items()},
    }

    cn = pq.read_table(
        src / "connectors.parquet",
        columns=["station_code", "connector_standard", "count_total"],
    ).to_pandas()
    out["connectors"] = {
        "by_standard": {
            str(k): {"n_rows": int(len(g)), "n_guns": int(g.count_total.sum())}
            for k, g in cn.groupby("connector_standard")
        },
        "n_guns": int(cn.count_total.sum()),
        "n_stations_with_connectors": int(cn.station_code.nunique()),
    }

    occ = pq.read_table(src / "station_occupancy.parquet", columns=["occ_status"]).to_pandas()
    if len(occ):
        out["occ_status_ok"] = {
            "n_total": int(len(occ)),
            "n_ok": int((occ.occ_status == "OK").sum()),
            "share": round(float((occ.occ_status == "OK").mean()), 6),
        }
    return out


def _private_ac_block(qrow: pd.DataFrame) -> dict:
    """Điểm sạc cá nhân đã loại, ở hình dạng TRUNG TÍNH của ``totals``.

    Số đã có sẵn trong `quality` của n05 nhưng dưới tên khác (`n_private_ac_dropped`,
    `private_ac_share_*`). Đổi tên ở đây chứ không để UI biết hai tên: đó đúng là việc mà
    một lớp export phải làm, và nó giữ cho `totals` là **một hợp đồng** thay vì một bản sao
    của bảng QA.

    Thiếu dòng QA thì **không phát khoá** — KPI in "bộ này chưa đo", không đoán một số 0.
    """
    if qrow.empty:
        return {}
    q = qrow.iloc[0]
    n = q.get("n_private_ac_dropped")
    if n is None or pd.isna(n):
        return {}

    def share(name: str):
        v = q.get(name)
        return None if v is None or pd.isna(v) else float(v)

    return {
        "private_ac_dropped": {
            "n": int(n),
            "share_stations": share("private_ac_share_stations"),
            "share_ports": share("private_ac_share_ports"),
            "share_power": share("private_ac_share_power"),
        }
    }


def export_province(code: str) -> dict:
    d = WEB_PROV / code
    d.mkdir(parents=True, exist_ok=True)
    src = paths.PROV / code
    files: dict[str, dict] = {}

    def note(name: str, path, rows: int | None = None):
        files[name] = {"bytes": path.stat().st_size, "rows": rows}

    # Lưới: bảng ĐÃ GHÉP của n09 — cùng tên, cùng hình dạng với bộ Hà Nội.
    grid = pq.read_table(src / "grid_h3_r8.parquet").to_pandas()
    gp = d / "grid_h3_r8.parquet"
    pq.write_table(pa.Table.from_pandas(grid, preserve_index=False), gp, compression="zstd")
    note("grid_h3_r8.parquet", gp, len(grid))

    for name in (
        "stations.parquet",
        "connectors.parquet",
        "station_occupancy.parquet",
        "station_occupancy_profile_168h.parquet",
    ):
        shutil.copy2(src / name, d / name)
        note(name, d / name, pq.read_metadata(d / name).num_rows)

    gj, n_comm, commune_keys = _commune_geojson(code)
    (d / "commune.geojson").write_text(gj, encoding="utf-8")
    note("commune.geojson", d / "commune.geojson", n_comm)

    (d / "admin_boundary.geojson").write_text(_boundary_geojson(code), encoding="utf-8")
    note("admin_boundary.geojson", d / "admin_boundary.geojson", 2)

    pgj, poi_meta = _poi_geojson(code)
    (d / "poi.geojson").write_text(pgj, encoding="utf-8")
    note(
        "poi.geojson",
        d / "poi.geojson",
        poi_meta and sum(g["n"] for g in poi_meta["groups"].values()),
    )

    road_meta = _roads_parquet(code, d / "roads.parquet")
    note("roads.parquet", d / "roads.parquet", road_meta["ways_shipped"])

    # Cặp tuyến minh hoạ — chỉ có ở tỉnh được `n14_showcase` dựng. Vắng file là bình
    # thường, và `storyDataReady` ở web đọc đúng chuyện đó để quyết định mở cảnh hay không.
    rsrc = paths.PROV / code / "routes_showcase.geojson"
    if rsrc.exists():
        shutil.copy2(rsrc, d / "routes_showcase.geojson")
        n_feat = len(json.loads(rsrc.read_text(encoding="utf-8"))["features"])
        note("routes_showcase.geojson", d / "routes_showcase.geojson", n_feat)
        road_meta["showcase_cells"] = sorted(
            {
                f["properties"]["h3_r8"]
                for f in json.loads(rsrc.read_text(encoding="utf-8"))["features"]
            }
        )

    sgj, sub_meta = _substation_geojson(code)
    if sgj:
        (d / "substations.geojson").write_text(sgj, encoding="utf-8")
        note("substations.geojson", d / "substations.geojson", sub_meta["n"])

    occ_tbl = pq.read_table(
        src / "station_occupancy.parquet",
        columns=["snapshot_id", "window_start_utc", "window_end_utc"],
    ).to_pandas()
    occ_snapshot = str(occ_tbl.snapshot_id.iloc[0]) if len(occ_tbl) else None
    occ_window = (
        [str(occ_tbl.window_start_utc.iloc[0]), str(occ_tbl.window_end_utc.iloc[0])]
        if len(occ_tbl)
        else None
    )

    pv = pq.read_table(paths.ADMIN / "provinces.parquet").to_pandas()
    prow = pv[pv.province_code == code].iloc[0]
    qa_prov = pq.read_table(paths.QA / "provinces.parquet").to_pandas()
    qrow = qa_prov[qa_prov.province_code == code]

    unusable = []
    if not qrow.empty:
        flags = qrow.iloc[0].quality_flags
        share = qrow.iloc[0].share_stations_measured
        if isinstance(flags, str) and "KHONG_DO_DUOC_SU_DUNG" in flags:
            unusable.append(
                {
                    "layer": "occupancy",
                    "reason": (
                        "dưới nửa số trạm của tỉnh có `util` đọc được — lớp mức sử dụng là "
                        "suy đoán, không phải quan sát"
                    ),
                    "measured": f"{share:.1%} số trạm đo được (ngưỡng {MIN_OCC_MEASURED_SHARE:.0%})",
                }
            )

    # Cột THẬT SỰ có trong hai file vừa ghi — đọc schema, không suy từ trí nhớ.
    road_cols = sorted(pq.read_schema(d / "roads.parquet").names)
    station_cols = sorted(pq.read_schema(d / "stations.parquet").names)

    manifest = {
        "exported_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "vintage": admin.VINTAGE,
        "province": {
            "province_code": code,
            "province_name": prow.province_name,
            "n_communes": int(prow.n_communes),
            "n_dac_khu": int(prow.n_dac_khu),
            "bbox": [
                float(prow.lng_min),
                float(prow.lat_min),
                float(prow.lng_max),
                float(prow.lat_max),
            ],
            "center": [float(prow.lng_center), float(prow.lat_center)],
        },
        "n_cells": int(len(grid)),
        "files": files,
        # Mấu chốt chống-vỡ: cột THẬT SỰ có trong lưới của tỉnh này.
        "available_columns": sorted(grid.columns),
        # Thuộc tính có mặt trong `commune.geojson`. Trường của XÃ đọc từ đó, không từ lưới.
        "available_commune_columns": commune_keys,
        # Giao diện có BỐN đơn vị đọc, và cho tới lượt này chỉ hai đơn vị đầu được khai.
        #
        # Hệ quả là một lỗi ĐANG SỐNG, không phải một khoảng trống lý thuyết: `fieldAvailable`
        # trả `true` cho mọi trường không phải của Ô, nên trường `road:dist_station_m` luôn
        # hiện trong rail — kể cả ở 34 tỉnh mà `roads.parquet` KHÔNG có cột đó. Chọn nó là
        # `fetchRoads` chạy `SELECT "dist_station_m"` trên một bảng không có cột ấy, DuckDB
        # ném Binder Error, và màn hình trắng.
        #
        # ĐO, không gõ tay: đọc thẳng schema của chính hai file vừa ghi.
        # Số đếm trạm biến áp là SỐ ĐO, không phải lời hứa về độ phủ — OSM phủ hạ tầng
        # điện rất thưa nên `n` là chặn dưới. Giao diện phát câu chữ, manifest phát con số.
        "source_metrics": {"osm_substations": sub_meta} if sub_meta else {},
        "available_road_columns": road_cols,
        "available_station_columns": station_cols,
        # ĐO, không gõ tay: cột nào bộ Hà Nội có mà tỉnh này không có. Danh sách gõ tay sẽ
        # nói dối ngay lần đầu một lớp được dựng thêm — và nó đã suýt nói dối ở lượt này.
        "missing_layers": {
            "reason": (
                "cột có ở bộ Hà Nội đầy đủ nhưng chưa dựng cho tỉnh này "
                "(xem DECISIONS.md §7)"
            ),
            "columns": sorted(_reference_columns() - set(grid.columns)),
        },
        "coverage": _coverage(grid),
        "categories": {
            c: {
                "values": {str(k): int(v) for k, v in grid[c].value_counts().items()},
                "n_null": int(grid[c].isna().sum()),
            }
            for c in CATEGORY_COLUMNS
            if c in grid.columns
        },
        # KPI row của chế độ DỮ LIỆU (web/DESIGN.md §3f-1) — CÙNG hình dạng với bản Hà Nội.
        # `private_ac_dropped` ghép vào đây từ `quality` chứ không để UI đọc `quality`: khối
        # `quality` là số đo QA của bước n05 (37 khoá, tên theo lối QA), còn `totals` là hợp
        # đồng với web. Trộn hai vai thì đổi một chỉ số QA sẽ vỡ một tile trên màn hình.
        "totals": _totals(src) | _private_ac_block(qrow),
        "poi": poi_meta,
        "roads": road_meta,
        "quality": (
            {}
            if qrow.empty
            else json.loads(qrow.iloc[0].to_json(orient="index", force_ascii=False))
        ),
        "story_enabled": code == "01",
        # Lớp CÓ cột nhưng KHÔNG đọc được — khác `missing_layers` (cột không tồn tại).
        # Quyết định 2026-08-07 (chủ dự án): giữ tỉnh, TẮT lớp. Loại cả tỉnh là vứt lớp
        # cung/POI/đường vẫn đúng của nó vì một lớp hỏng — Sơn La vẫn có 64 trạm / 540 cổng
        # / 17,6 MW đo chính xác. Ngưỡng ở `n10_quality.MIN_OCC_MEASURED_SHARE`.
        "unusable_layers": unusable,
        # Khối NGUỒN của rail đọc thẳng từ đây (§8). Bốn dòng đầu đọc được TỪ DỮ LIỆU; hai
        # dòng cuối là ngày đóng băng của nguồn thượng nguồn, không cột nào mang chúng —
        # giữ ở tầng dữ liệu chứ không ở TS, đúng chỗ bản Hà Nội đã đặt.
        "snapshots": {
            "occupancy_snapshot_id": occ_snapshot,
            "occupancy_window": occ_window,
            "vnsdi_valid_from": admin.VINTAGE["valid_from"],
            "osm_pbf": "28/07/2026",
            "stations_canonical": "29/07/2026",
        },
    }
    (d / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    note("manifest.json", d / "manifest.json")
    return {
        "province_code": code,
        "bytes_total": sum(f["bytes"] for f in files.values()),
        "files": files,
    }


def _province_index() -> dict:
    """Bảng + đa giác 34 tỉnh cho MÀN HÌNH ĐẦU. Đây là ngân sách tải lần đầu."""
    pv = pq.read_table(paths.ADMIN / "provinces.parquet").to_pandas()
    qp = pq.read_table(paths.QA / "provinces.parquet").to_pandas()
    idx = pv.merge(
        qp[
            [
                "province_code",
                "n_stations",
                "n_ports",
                "power_kw_site",
                "ports_per_10k_pop",
                "private_ac_share_stations",
                "private_ac_share_power",
                "share_communes_zero_poi",
                "share_stations_measured",
                "quality_flags",
            ]
        ],
        on="province_code",
        how="left",
    )
    idx["in_store"] = idx.n_stations.notna()
    p = WEB_DATA / "provinces.parquet"
    pq.write_table(pa.Table.from_pandas(idx, preserve_index=False), p, compression="zstd")

    feats = []
    for code in admin.province_codes():
        g = admin.boundary(code).simplify(PROVINCE_SIMPLIFY_DEG, preserve_topology=True)
        row = idx[idx.province_code == code].iloc[0]
        m = mapping(g)
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": m["type"], "coordinates": _round_coords(m["coordinates"], 4)},
                "properties": {
                    "province_code": code,
                    "province_name": row.province_name,
                    "n_stations": None if pd.isna(row.n_stations) else int(row.n_stations),
                    "n_ports": None if pd.isna(row.n_ports) else int(row.n_ports),
                    "ports_per_10k_pop": None
                    if pd.isna(row.ports_per_10k_pop)
                    else float(row.ports_per_10k_pop),
                    "population": int(row.population),
                    "in_store": bool(row.in_store),
                },
            }
        )
    gj = WEB_DATA / "provinces.geojson"
    gj.write_text(_fc(feats), encoding="utf-8")
    return {
        "provinces.parquet": p.stat().st_size,
        "provinces.geojson": gj.stat().st_size,
    }


def _export_root_bundle(code: str) -> list[str]:
    """Nhân bản bộ của một tỉnh ra đường dẫn KHÔNG TIỀN TỐ.

    Vì sao tồn tại: `/` (không có khoá `tinh`) là URL đã được chia sẻ, đã chụp ảnh vào tài
    liệu, đã bookmark. Giữ nó chạy được là **tách "đổi URL" khỏi "xoá mã"** — hai việc có
    thể sai độc lập, nên chúng phải kiểm được độc lập.

    Nhân bản chứ không dựng lại: hai bộ phải giống nhau tới từng byte, và cách chắc chắn
    nhất để hai thứ giống nhau là chỉ dựng MỘT.

    Không đụng `provinces.geojson` / `provinces.parquet` ở gốc — chúng là chỉ mục TOÀN QUỐC,
    không thuộc tỉnh nào, và tên file không trùng nên phép chép không chạm tới.
    """
    src = WEB_PROV / code
    chep = []
    for f in sorted(src.iterdir()):
        if f.is_file():
            shutil.copy2(f, WEB_DATA / f.name)
            chep.append(f.name)
    return chep


# Tỉnh được nhân bản ra đường dẫn không tiền tố. Một hằng, một chỗ.
ROOT_BUNDLE_PROVINCE = "01"


def run() -> None:
    WEB_PROV.mkdir(parents=True, exist_ok=True)
    r = qa.Report("n11_web_export", target=str(WEB_DATA.relative_to(paths.ROOT)))
    done = [c for c in admin.province_codes() if (paths.PROV / c / "grid_cell.parquet").exists()]
    out = [export_province(c) for c in done]
    index = _province_index()

    root_files: list[str] = []
    if ROOT_BUNDLE_PROVINCE in done:
        root_files = _export_root_bundle(ROOT_BUNDLE_PROVINCE)

    per = {o["province_code"]: o["bytes_total"] for o in out}
    tot = sum(per.values())
    first_load = sum(index.values())
    names = admin.province_names()
    biggest = max(per, key=per.get)
    smallest = min(per, key=per.get)

    # Ngân sách: hai con số khác nhau và cả hai đều phải nói ra. "Tải lần đầu" là thứ người
    # dùng trả giá TRƯỚC KHI thấy gì; "một tỉnh" là thứ họ trả khi chọn.
    r.stat(
        n_provinces_exported=len(done),
        root_bundle={
            "province_code": ROOT_BUNDLE_PROVINCE,
            "reason": (
                "`/` không có khoá `tinh` là URL đã chia sẻ và đã chụp ảnh vào tài liệu. "
                "Nhân bản (không dựng lại) để hai bộ giống nhau tới từng byte."
            ),
            "files": root_files,
        },
        ngan_sach_tai_lan_dau_bytes=first_load,
        ngan_sach_tai_lan_dau_MB=round(first_load / 1e6, 2),
        ngan_sach_moi_tinh_MB={
            "min": round(per[smallest] / 1e6, 2),
            "min_province": names[smallest],
            "median": round(float(pd.Series(list(per.values())).median()) / 1e6, 2),
            "max": round(per[biggest] / 1e6, 2),
            "max_province": names[biggest],
        },
        tong_store_web_MB=round(tot / 1e6, 1),
        per_province_MB={f"{c} {names[c]}": round(b / 1e6, 2) for c, b in sorted(per.items())},
        breakdown_tinh_lon_nhat={
            k: round(v["bytes"] / 1e6, 3)
            for k, v in sorted(
                next(o for o in out if o["province_code"] == biggest)["files"].items(),
                key=lambda kv: -kv[1]["bytes"],
            )
        },
    )
    r.check(
        "legacy_hanoi_bundle_untouched",
        (WEB_DATA / "grid_h3_r8.parquet").exists(),
        "bộ Hà Nội cũ ở đường dẫn không tiền tố vẫn nguyên — web hiện tại không đổi hành vi",
    )
    r.check(
        "first_load_under_2MB",
        first_load < 2_000_000,
        f"{first_load / 1e6:.2f} MB cho chỉ mục 34 tỉnh",
    )
    r.check(
        "every_province_declares_missing_columns",
        all((WEB_PROV / c / "manifest.json").exists() for c in done),
        "manifest từng tỉnh khai cột vắng ⇒ giao diện không hỏi cột không tồn tại",
    )
    r.write()


def outputs() -> list:
    return [WEB_DATA / "provinces.parquet", WEB_DATA / "provinces.geojson"]


STEP = Step(
    name="n11_web_export",
    scope="global",
    version=VERSION,
    run=run,
    reads=(
        "admin_provinces",
        "admin_communes",
        "admin_boundary",
        "qa_provinces",
        "grid_h3_r8",
        "commune",
        "stations",
        "connectors",
        "station_occupancy",
        "station_profile_168h",
        "roads",
        "poi_visual",
    ),
    extra_writes=lambda _p: outputs(),
    desc="xuất store cho web theo tỉnh + chỉ mục toàn quốc, đo ngân sách dung lượng",
)
