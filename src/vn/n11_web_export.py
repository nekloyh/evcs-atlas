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
from evcs.core.roadgraph import DETOUR_MIN_EUCLID_M

from . import admin, paths, qa
from .n10_quality import MIN_OCC_MEASURED_SHARE
from .runner import Step

VERSION = "10"  # 10: Phase 8 QA — luật null khai báo, ngày ISO suy ra, khối not_measured

# ── Ngày ĐÓNG BĂNG của nguồn thượng nguồn — MỘT nguồn sự thật ────────────────────────
#
# Không cột nào trong dữ liệu mang hai ngày này (chúng là ngày cắt của file PBF và của bảng
# canonical), nên chúng phải sống ở một hằng. Điều KHÔNG được phép là sống ở HAI hằng: manifest
# phát chúng hai lần — `snapshots` ở dạng hiển thị `dd/mm/yyyy` và `freshness.inputs` ở dạng
# ISO cho trình duyệt — và trước lượt này mỗi chỗ gõ lại một bản. Giờ cả hai dẫn xuất từ đây.
SNAPSHOT_DATES = {
    "osm_pbf": "2026-07-28",
    "stations_canonical": "2026-07-29",
}


def _display_date(iso: str) -> str:
    """`2026-07-28` → `28/07/2026`. Dạng hiển thị cũ của `snapshots`, giữ nguyên hợp đồng."""
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def _iso_date(display: str) -> str:
    """`16/6/2025` → `2025-06-16`. Chiều ngược, cho `admin.VINTAGE['valid_from']`."""
    d, m, y = display.split("/")
    return f"{y}-{int(m):02d}-{int(d):02d}"


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
        # `ship`, KHÔNG phải `df[df.in_province]`. Đếm trước bộ lọc class/access thì khoá
        # này nói về một tập KHÁC với tập nằm trong file, và hai con số ấy được in cạnh
        # nhau trong cùng một panel: gói 01 báo 3.319 trong khi parquet có 3.027 — vênh
        # 292 đoạn (9,6%) mà không có gì trên màn hình nói ra là chúng khác mẫu số.
        "bridge_ways_shipped": int(ship.bridge.sum()),
        # Cùng tên khoá với bộ Hà Nội — cột cảnh đọc đúng hai khoá này, và thiếu chúng là
        # chỗ `formatNumber(undefined)` từng ném TypeError.
        "ways_unreachable_null_dist": n_null,
    }


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


def _source_metrics(grid: pd.DataFrame) -> dict:
    """Số đo về NGUỒN THƯỢNG NGUỒN — badge ⚠ nguồn của web (§7).

    Khối này từng phát rỗng ở mọi tỉnh, nên `coverageNote` của trường ``n_poi_1km`` mất câu
    dẫn của nó và cảnh "ba điều ta không biết" không có số cho giới hạn POI. Cả hai chỗ đọc
    đều đã xử lý đúng khi vắng khoá (không hiện gì, thay vì đoán) — nên thêm khoá vào là
    một phép **mở rộng**, không phải một phép sửa hành vi.

    Ý nghĩa phải nói cho đúng: số 0 ở ``n_poi_1km`` phần lớn KHÔNG có nghĩa "không có hoạt
    động" mà có nghĩa "OpenStreetMap chưa vẽ tới". Vì thế nó là một số đo về **nguồn**, và
    nó nằm ở đây chứ không nằm trong ``coverage`` — ``coverage`` trả lời "cột này có giá
    trị ở bao nhiêu ô", còn đây trả lời "giá trị ấy đáng tin tới đâu".
    """
    out: dict = {}
    if "n_poi_1km" not in grid.columns:
        return out
    zero = grid.n_poi_1km.fillna(0) == 0
    rec = {
        "n_cells": len(grid),
        "n_cells_zero": int(zero.sum()),
        "share_cells": round(float(zero.mean()), 6),
    }
    if "population" in grid.columns:
        total = float(grid.population.sum())
        if total > 0:
            rec["share_pop"] = round(float(grid.loc[zero, "population"].sum() / total), 6)
    out["poi_empty_1km"] = rec
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
        # "Chưa đo được" tách theo LÝ DO (§2.5). `occ_status_ok` chỉ nói bao nhiêu trạm đạt;
        # nó không phân biệt "thiếu quan sát" với "thiếu nhóm đối chuẩn", mà hai thứ đó gọi
        # hai hành động khác nhau ở thượng nguồn. Đếm trực tiếp, không gõ danh mục giá trị:
        # `AC-20` cấm cứng hoá từ vựng hạng mục, và tỉnh khác có thể có giá trị khác.
        out["occ_status_counts"] = {
            str(k): int(v) for k, v in occ.occ_status.value_counts(dropna=False).items()
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


def _s(series: pd.Series) -> pd.Series:
    """Mask bool KHÔNG có NA — `NaN` trong phép so sánh phải đọc thành *không khớp*.

    Cần vì `stations.port_config_source` và `occ.util_reportable` đều nullable: một phép
    `!=` trên pandas nullable trả `pd.NA`, và `pd.NA` trong `&` lan ra cả mask.
    """
    return series.fillna(False).astype(bool)


# ── Bảng luật NULL — MỘT nguồn sự thật ───────────────────────────────────────────────
#
# Phản chiếu `NULL_CONTRACTS` ở `web/src/data/null-states.ts`; `tests/test_n11_null_states.py`
# so hai bên theo tên cột nên một bên thêm cột mà bên kia quên là **đỏ test**, không phải một
# khác biệt âm thầm.
#
# Thứ tự trong danh sách LÀ thủ tục quyết định của §1.1 — NOT_APPLICABLE trước, rồi FILTERED,
# rồi NOT_MEASURED; khớp đầu tiên thắng, phần dư rơi về MISSING. Đảo thứ tự là đổi mẫu số:
# NOT_APPLICABLE bị TRỪ khỏi mẫu số còn FILTERED thì không.
#
# `basis` nói trạng thái được gán BẰNG GÌ, và đó là điều kiện để §1.1 Rule 0 kiểm được:
#   • "row_predicate"   — một cột đã ship trong CÙNG HÀNG nói ra điều đó. Kiểm lại được.
#   • "table_invariant" — cả bảng không có cột bạn đồng hành nào; trạng thái là một tuyên bố
#                         ở mức bảng, và nó phải mang `verified_by` trỏ tới một khoá manifest
#                         đối chiếu được. Ba cột rơi vào đây và UI vẽ chúng khác đi (§6.2).
#
# Rule 0 nguyên văn cấm gán trạng thái bằng "một chuỗi gõ tay trong TypeScript". Ba trường hợp
# `table_invariant` dưới đây được §0.3 thẩm định là NOT APPLICABLE và AC-6 buộc chúng KHÔNG
# mang cảnh báo, nên chúng ở lại — nhưng chúng tự khai là tuyên bố mức bảng thay vì giả trang
# thành một vị từ theo hàng. Xung đột §1.1-vs-§0.3 đã báo cáo ở QA 8-QA-022.

_NULL_RULES: dict[tuple[str, str], list[dict]] = {}


def _rule(table: str, column: str, state: str, rule: str, needs, pred, **extra) -> None:
    _NULL_RULES.setdefault((table, column), []).append(
        {"state": state, "rule": rule, "needs": needs, "pred": pred, **extra}
    )


_UNREACH = "evidence_grade_distance IN ('UNREACHABLE_NO_PATH', 'UNREACHABLE_NO_ROAD_ACCESS')"


def _unreachable(df: pd.DataFrame) -> pd.Series:
    return df["evidence_grade_distance"].isin(
        ["UNREACHABLE_NO_PATH", "UNREACHABLE_NO_ROAD_ACCESS"]
    )


# 1. grid — 4 cột nullable trên 61
for _c in ("dist_station_network_m", "dist_station_asym_m"):
    _rule("grid", _c, "NOT_APPLICABLE", _UNREACH, ["evidence_grade_distance"], _unreachable)

# `detour_ratio`: NOT_APPLICABLE đứng TRƯỚC FILTERED theo §1.1. Ở dữ liệu hôm nay hai thứ tự
# cho cùng con số (0 ô vừa không tới được vừa có chim bay < 200 m, đo trên cả 34 tỉnh), nên
# đây là sửa cho ĐÚNG LUẬT chứ không phải sửa một con số đang sai.
_rule("grid", "detour_ratio", "NOT_APPLICABLE", _UNREACH, ["evidence_grade_distance"], _unreachable)
_rule(
    "grid",
    "detour_ratio",
    "FILTERED",
    f"dist_station_euclid_m < {DETOUR_MIN_EUCLID_M}",
    ["dist_station_euclid_m"],
    lambda df: _s(df["dist_station_euclid_m"] < DETOUR_MIN_EUCLID_M),
    threshold={
        "name": "DETOUR_MIN_EUCLID_M",
        "value": float(DETOUR_MIN_EUCLID_M),
        "source": "src/evcs/core/roadgraph.py",
    },
)
_rule(
    "grid", "util_cell", "NOT_APPLICABLE", "n_stations = 0",
    ["n_stations"], lambda df: _s(df["n_stations"] == 0),
)
_rule(
    "grid", "util_cell", "NOT_MEASURED", "n_stations > 0 AND n_stations_measured = 0",
    ["n_stations", "n_stations_measured"],
    lambda df: _s((df["n_stations"] > 0) & (df["n_stations_measured"] == 0)),
)

# 2. stations — 9 cột nullable trên 26
for _c in ("commune_code", "commune_name", "commune_kind"):
    _rule(
        "stations", _c, "NOT_APPLICABLE", "scope = 'BUFFER'",
        ["scope"], lambda df: _s(df["scope"] == "BUFFER"),
    )
# `n_ports`/`current_type`/`power_kw_max_port`/`power_kw_site`: nguồn không khai cấu hình cổng.
# Trạng thái là MISSING ở CẢ HAI nhánh, nhưng nhánh có luật và phần dư KHÔNG được gộp làm một
# — gộp là dán một luật lên một hàng không thoả nó (§3.1, và đó là 8-QA-003).
for _c in ("n_ports", "current_type", "power_kw_max_port", "power_kw_site"):
    _rule(
        "stations", _c, "MISSING", "port_config_source = 'UNKNOWN'",
        ["port_config_source"], lambda df: _s(df["port_config_source"] == "UNKNOWN"),
        bucket="MISSING@unknown_port_config",
    )
_rule(
    "stations", "n_guns_imputed", "NOT_APPLICABLE", "port_config_source <> 'UNKNOWN'",
    ["port_config_source"], lambda df: _s(df["port_config_source"] != "UNKNOWN"),
)
_rule(
    "stations", "freshness", "NOT_APPLICABLE", "has_timeseries = false",
    ["has_timeseries"], lambda df: _s(df["has_timeseries"] == False),  # nullable bool: `== False` giữ NA là "không khớp"
)

# 3. station_occupancy — 8 cột nullable trên 25
for _c in ("util", "util_p95", "util_denominator_ports", "current_type"):
    _rule(
        "station_occupancy", _c, "NOT_MEASURED", "util_reportable = false",
        ["util_reportable"], lambda df: _s(df["util_reportable"] == False),  # nullable bool — xem trên
    )
for _c in ("night_share", "weekend_ratio"):
    _rule(
        "station_occupancy", _c, "NOT_APPLICABLE", "ever_active = false",
        ["ever_active"], lambda df: _s(df["ever_active"] == False),  # nullable bool — xem trên
    )
for _c in ("util_pctl", "util_pctl_peer"):
    _rule(
        "station_occupancy", _c, "NOT_APPLICABLE", "util IS NULL",
        ["util"], lambda df: df["util"].isna(),
    )
    _rule(
        "station_occupancy", _c, "FILTERED", "occ_status = 'THIEU_COVERAGE'",
        ["occ_status"], lambda df: _s(df["occ_status"] == "THIEU_COVERAGE"),
    )

# 4. roads — 1 cột nullable trên 5. KHÔNG có cột bạn đồng hành trong bảng đã ship
# (`osm_id, road_class, bridge, dist_station_m, coords`), nên đây là tuyên bố mức bảng và nó
# tự khai như vậy. Đối chiếu được: số phải khớp `roads.ways_unreachable_null_dist`.
_rule(
    "roads", "dist_station_m", "NOT_APPLICABLE",
    "đoạn đường không nối được tới trạm nào trong đồ thị dẫn đường",
    [], None, basis="table_invariant", verified_by="roads.ways_unreachable_null_dist",
)

# 5. commune — 2 cột nullable trên 21
_rule(
    "commune", "quality_flag", "NOT_APPLICABLE", "xã không phát sinh cờ chất lượng nào",
    [], None, basis="table_invariant", verified_by="quality.n_communes_flagged",
)
# `util_mean_port_weighted` thì CÓ cột bạn đồng hành, và nó tách được làm hai — đo trên cả 34
# tỉnh: 1.381 / 1.402 ô trống là xã KHÔNG có trạm nào (câu hỏi không áp dụng), 21 ô còn lại là
# xã CÓ trạm mà không trạm nào đo được (đã nhìn, không thấy gì). Gộp hai thứ đó vào một nhãn
# gõ tay là mất đúng phân biệt mà pha này dựng ra.
_rule(
    "commune", "util_mean_port_weighted", "NOT_APPLICABLE", "n_stations = 0",
    ["n_stations"], lambda df: _s(df["n_stations"].fillna(0) == 0),
)
_rule(
    "commune", "util_mean_port_weighted", "NOT_MEASURED",
    "n_stations > 0 AND không trạm nào đo được mức sử dụng",
    ["n_stations"], lambda df: _s(df["n_stations"].fillna(0) > 0),
)

# 6. poi — 2 cột nullable trên 8. OSM không mang thẻ; đó là MISSING theo §1.1 bước 4.
_rule("poi", "levels", "MISSING", "OSM không có thẻ building:levels", [], None,
      basis="table_invariant", verified_by="poi.n_visual")
_rule("poi", "name", "MISSING", "OSM không có thẻ name", [], None,
      basis="table_invariant", verified_by="poi.n_visual")

# 7. provinces — 1 cột nullable trên 28. Bảng 34 dòng ship ở `web/public/data/provinces.parquet`;
# nó là bảng TOÀN QUỐC nên giống `vintage`/`snapshots`, mỗi tỉnh mang một bản giống hệt.
_rule(
    "provinces", "quality_flags", "NOT_APPLICABLE", "tỉnh không phát sinh cờ chất lượng nào",
    [], None, basis="table_invariant", verified_by="vintage.n_provinces",
)


def _null_states_for(
    table: str,
    df: pd.DataFrame,
    columns: list[str],
    pop: pd.Series | None = None,
) -> dict:
    """Phân giải ô trống của MỘT bảng theo `_NULL_RULES`. Không có nhánh riêng cho cột nào.

    Bất biến mà hàm này giữ, và là lý do nó thay 300 dòng chép tay:
      • ``Σ states[*].n == n_rows − n_present`` — không hàng nào rơi mất, không hàng nào
        bị đếm hai lần (mask đã gán bị trừ khỏi mask tiếp theo).
      • Phần dư KHÔNG BAO GIỜ được cộng vào một xô đã mang luật. Nó ra xô ``MISSING`` riêng
        với ``rule: "residual"`` — đó là cách §9-1/2/3 còn nhìn thấy được.
    """
    total_pop = float(pop.sum()) if pop is not None else 0.0
    out: dict = {}
    for col in columns:
        if col not in df.columns:
            continue
        n_rows = len(df)
        blank = df[col].isna()
        n_blanks = int(blank.sum())
        if n_blanks == 0:
            continue

        states: dict[str, dict] = {}
        unassigned = blank.copy()
        for r in _NULL_RULES.get((table, col), []):
            if any(n not in df.columns for n in r["needs"]):
                continue
            mask = unassigned if r["pred"] is None else (unassigned & r["pred"](df))
            n = int(mask.sum())
            if n == 0:
                continue
            key = r.get("bucket", r["state"])
            rec = {
                "n": n,
                "state": r["state"],
                "rule": r["rule"],
                "basis": r.get("basis", "row_predicate"),
            }
            if "verified_by" in r:
                rec["verified_by"] = r["verified_by"]
            if "threshold" in r:
                rec["threshold"] = r["threshold"]
            states[key] = rec
            unassigned = unassigned & ~mask

        residual = int(unassigned.sum())
        if residual > 0:
            # Ô trống không luật nào giải thích. Nó là MỘT KHUYẾT TẬT và nó ở lại đúng như thế
            # — không nhập vào xô có luật, không làm tròn đi. §9-1/2/3 sống ở dòng này.
            states["MISSING@residual"] = {
                "n": residual,
                "state": "MISSING",
                "rule": "không luật nào giải thích — khuyết tật, xem §9",
                "basis": "residual",
            }

        n_not_app = sum(v["n"] for v in states.values() if v["state"] == "NOT_APPLICABLE")
        n_present = n_rows - n_blanks
        n_app = n_rows - n_not_app
        rec = {
            "n_rows": n_rows,
            "n_present": n_present,
            # `share_rows` là mẫu số THÔ — 9,93 % của `util_cell`. Nó đi cùng
            # `share_of_applicable` chứ không bị nó thay thế: AC-4 buộc CẢ HAI có mặt, vì
            # đúng một trong hai đáng báo động và người đọc phải thấy được là cái nào.
            "share_rows": round(n_present / n_rows, 6) if n_rows else 1.0,
            "states": states,
            "n_applicable": n_app,
            "share_of_applicable": round(n_present / n_app, 6) if n_app > 0 else 1.0,
        }
        if pop is not None and total_pop > 0:
            rec["pop_share"] = round(float(pop[df[col].notna()].sum() / total_pop), 6)
        out[col] = rec
    return out


_NULLABLE_COLUMNS: dict[str, list[str]] = {
    "grid": ["dist_station_network_m", "dist_station_asym_m", "detour_ratio", "util_cell"],
    "stations": [
        "commune_code", "commune_name", "commune_kind", "n_ports", "n_guns_imputed",
        "current_type", "power_kw_max_port", "power_kw_site", "freshness",
    ],
    "station_occupancy": [
        "util", "util_p95", "util_denominator_ports", "current_type",
        "night_share", "weekend_ratio", "util_pctl", "util_pctl_peer",
    ],
    "roads": ["dist_station_m"],
    "commune": ["quality_flag", "util_mean_port_weighted"],
    "poi": ["levels", "name"],
    "provinces": ["quality_flags"],
}


def _null_states(
    grid: pd.DataFrame,
    stations: pd.DataFrame,
    occ: pd.DataFrame,
    roads_df: pd.DataFrame,
    commune_df: pd.DataFrame,
    poi_df: pd.DataFrame,
    provinces_df: pd.DataFrame,
) -> dict:
    """`null_states` — §3.1. Sáu bảng của tỉnh + bảng 34 tỉnh toàn quốc.

    Cột chỉ xuất hiện khi nó CÓ ít nhất một ô trống (§3.1). Cột phủ 100 % nói chuyện ở
    `coverage`, không ở đây.
    """
    pop = grid["population"] if "population" in grid.columns else None
    frames = {
        "grid": (grid, pop),
        "stations": (stations, None),
        "station_occupancy": (occ, None),
        "roads": (roads_df, None),
        "commune": (commune_df, None),
        "poi": (poi_df, None),
        "provinces": (provinces_df, None),
    }
    out: dict = {}
    for table, (df, p) in frames.items():
        block = _null_states_for(table, df, _NULLABLE_COLUMNS[table], p)
        if block:
            out[table] = block
    return out


def _invalid_values(grid: pd.DataFrame, commune_df: pd.DataFrame) -> dict:
    out: dict = {}
    has_pop = "population" in grid.columns
    total_pop = float(grid.population.sum()) if has_pop else 0.0
    if "pop_source" in grid.columns:
        unanch = (
            grid["pop_source"] == "WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE"
        )
        n_unanch = int(unanch.sum())
        if n_unanch > 0:
            out["grid.population"] = {
                "n": n_unanch,
                "share_rows": round(n_unanch / len(grid), 6),
                "share_pop": round(
                    float(grid.loc[unanch, "population"].sum() / total_pop), 6
                )
                if total_pop > 0
                else 0.0,
                "rule": "pop_source = 'WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE'",
                "disposition": "shipped-with-label",
            }
        z_no_w = grid["pop_source"] == "ZERO_NO_WEIGHT"
        n_z = int(z_no_w.sum())
        if n_z > 0:
            out["grid.population@zero_no_weight"] = {
                "n": n_z,
                "share_rows": round(n_z / len(grid), 6),
                "rule": "pop_source = 'ZERO_NO_WEIGHT'",
                "disposition": "shipped-with-label",
            }
    if "quality_flag" in commune_df.columns:
        qf = commune_df["quality_flag"] == "DANSO_CONG_BO_QUA_THAP"
        n_qf = int(qf.sum())
        if n_qf > 0:
            out["commune.population"] = {
                "n": n_qf,
                "rule": "quality_flag = 'DANSO_CONG_BO_QUA_THAP'",
                "disposition": "shipped-with-label",
            }
    return out


def _degenerate_columns(grid: pd.DataFrame) -> dict:
    """Cột phủ 100 % mà KHÔNG chở thông tin nào — đúng một giá trị khác null (§3.3).

    Đây là một trong hai chuyện mà không bộ đếm null nào thấy được: `snow_frac` phủ 100 % ở
    cả 34 tỉnh và luôn bằng 0,0. Một bảng sức khoẻ chỉ đếm ô trống cho nó thanh màu xanh.

    `province_code` bị loại vì hằng theo định nghĩa — nó là khoá phân mảnh, không phải số đo.
    """
    degenerate = {}
    for c in grid.columns:
        if c == "province_code":
            continue
        if grid[c].nunique(dropna=True) == 1:
            val = grid[c].dropna().iloc[0]
            # `.item()` chứ không `isinstance(val, (int, float))`: `np.int64` KHÔNG là `int`
            # của Python, nên nhánh cũ đẩy mọi cột đếm nguyên (`n_mall`, `n_apartment`…) ra
            # thành chuỗi `"0"` trong khi `snow_frac` ra số `0.0` — cùng một hợp đồng, hai kiểu.
            item = val.item() if hasattr(val, "item") else val
            degenerate[c] = item if isinstance(item, (int, float)) and not isinstance(item, bool) else str(item)
    return degenerate


# Khoá của khối `quality` mà phép đo THƯỢNG NGUỒN chưa từng chạy — null ở cả 34 tỉnh (§9-8).
# Chúng phải hiện ra là CHƯA ĐO, không phải một dấu gạch đứng cạnh các số đã đo: một dấu gạch
# đọc thành "bằng 0" hoặc "không đáng kể", và cả hai đều sai.
_QUALITY_NOT_MEASURED = {
    "quality.n_only_in_secondary": {
        "reason": "phép đối chiếu nhà vận hành thứ cấp chưa từng chạy",
        "consequence": (
            "cờ THIEU_NHA_VAN_HANH_KHAC do đó KHÔNG THỂ nổ ở bất kỳ tỉnh nào "
            "(src/vn/n10_quality.py) — một cờ không tới được về mặt cấu trúc"
        ),
        "upstream_ask": "§10-2",
    },
    "quality.share_only_in_secondary": {
        "reason": "phép đối chiếu nhà vận hành thứ cấp chưa từng chạy",
        "consequence": "không có mẫu số để tính tỉ lệ",
        "upstream_ask": "§10-2",
    },
}


def _not_measured_block(qrow: pd.DataFrame) -> dict:
    """Khoá đã KHAI nhưng chưa ĐO. Chỉ phát khoá thực sự còn null — đo, không gõ tay.

    Nếu thượng nguồn chạy phép đối chiếu (§10-2) thì khoá tự biến khỏi khối này ở lần export
    kế tiếp, không cần ai nhớ xoá nó.
    """
    if qrow.empty:
        return {}
    row = qrow.iloc[0]
    out = {}
    for key, meta in _QUALITY_NOT_MEASURED.items():
        col = key.split(".", 1)[1]
        if col in row.index and pd.isna(row[col]):
            out[key] = dict(meta)
    return out


def _filters_block(
    totals_data: dict,
    road_meta: dict,
    occ: pd.DataFrame,
    grid: pd.DataFrame,
    poi_df: pd.DataFrame,
    poi_demand_path,
) -> dict:
    out: dict = {}

    # 1. Private AC
    p_ac = totals_data.get("private_ac_dropped", {})
    in_scope_stations = totals_data.get("in_scope", {}).get("n_stations", 0)
    n_dropped_ac = p_ac.get("n", 0)
    out["private_ac_charge_points"] = {
        "kind": "removal",
        "name": "Điểm sạc cá nhân AC (1 súng AC)",
        "rule_const": "is_private_ac(n_guns_installed, current_type_asset)",
        "source_file": "src/evcs/core/supply.py:16",
        "before": in_scope_stations + n_dropped_ac,
        "removed": n_dropped_ac,
        "after": in_scope_stations,
        "denominator": "trạm trong ranh giới (in_scope)",
        "share_removed_stations": p_ac.get("share_stations"),
        "share_removed_ports": p_ac.get("share_ports"),
        "share_removed_power": p_ac.get("share_power"),
    }

    # 2. Road ways
    ways_in_shard = road_meta.get("ways_in_shard", 0)
    ways_shipped = road_meta.get("ways_shipped", 0)
    dropped_roads = (
        road_meta.get("ways_dropped_buffer_copy", 0)
        + road_meta.get("ways_dropped_service", 0)
        + road_meta.get("ways_dropped_access_blocked", 0)
    )
    out["road_ways"] = {
        "kind": "removal",
        "name": "Đoạn đường không phải xe công cộng đi được",
        "rule_const": "in_province & ~road_class.isin(SERVICE) & ~access.isin(ACCESS_BLOCKED)",
        "source_file": "src/vn/n11_web_export.py:164",
        "before": ways_in_shard,
        "removed": dropped_roads,
        "after": ways_shipped,
        "denominator": "đoạn đường trong shard OSM",
    }

    # 3. Peer ranking exclusion
    removed_peer = (
        int((occ["util"].notna() & (occ["occ_status"] == "THIEU_COVERAGE")).sum())
        if len(occ) and "util" in occ.columns and "occ_status" in occ.columns
        else 0
    )
    after_peer = (
        int(occ["util_pctl"].notna().sum())
        if len(occ) and "util_pctl" in occ.columns
        else 0
    )
    out["peer_ranking_exclusion"] = {
        "kind": "removal",
        "name": "Loại khỏi xếp hạng phân vị do thiếu quan sát",
        "rule_const": "occ_status = 'THIEU_COVERAGE'",
        "source_file": "src/vn/n10_quality.py",
        "before": after_peer + removed_peer,
        "removed": removed_peer,
        "after": after_peer,
        "denominator": "trạm có đo mức sử dụng",
    }

    # 4. Detour suppression
    removed_detour = (
        int(
            (
                grid["detour_ratio"].isna()
                & (grid["dist_station_euclid_m"] < DETOUR_MIN_EUCLID_M)
            ).sum()
        )
        if "detour_ratio" in grid.columns and "dist_station_euclid_m" in grid.columns
        else 0
    )
    after_detour = (
        int(grid["detour_ratio"].notna().sum())
        if "detour_ratio" in grid.columns
        else 0
    )
    out["detour_suppression"] = {
        "kind": "removal",
        "name": "Triệt tiêu hệ số đi vòng khi chim bay < 200 m",
        "rule_const": f"dist_station_euclid_m < {DETOUR_MIN_EUCLID_M}",
        "source_file": "src/evcs/core/roadgraph.py:51",
        "before": after_detour + removed_detour,
        "removed": removed_detour,
        "after": after_detour,
        "denominator": "ô tiếp cận được",
    }

    # 5. POI nhu cầu vs POI trực quan — và đây KHÔNG phải một phép lọc.
    #
    # Hai chuyện đã sai ở bản trước. Chuyện nhỏ: tên file là `poi_demand.parquet`, không phải
    # `poi.parquet`, nên phép đọc trượt rồi rơi về `n_visual` và cả 34 tỉnh cùng ship
    # `removed: 0` — 1.977 dòng hiện ra là số không, trên đúng khối có nhiệm vụ nói ra cái gì
    # đã bị bỏ. Chuyện lớn: kể cả đọc đúng file thì `trước − đã loại = sau` vẫn là một câu SAI.
    #
    # ĐO trên cả 34 tỉnh: hai tập GIAO NHAU MỘT PHẦN, không lồng nhau. Ở Cao Bằng (04) tập nhu
    # cầu có 123 đối tượng còn tập trực quan có 84 — 27 chung, 96 chỉ-nhu-cầu, 57 chỉ-trực-quan.
    # Ép nó vào khuôn phép lọc cho ra `removed = −39`, và một phương trình vẫn "đóng kín" trong
    # khi con số nó khẳng định thì vô nghĩa. Hai tập là hai phép TRÍCH khác nhau với hai từ vựng
    # lớp khác nhau, nên khối này khai `kind: "two_sets"` và nói ra bốn con số thật.
    n_visual = len(poi_df)
    if not poi_demand_path.exists():
        raise FileNotFoundError(
            f"Thiếu {poi_demand_path} — khối POI không có mẫu số. Không được rơi về n_visual."
        )
    demand = pq.read_table(poi_demand_path, columns=["osm_type", "osm_id"]).to_pandas()
    kv = set(zip(poi_df["osm_type"], poi_df["osm_id"], strict=False))
    kd = set(zip(demand["osm_type"], demand["osm_id"], strict=False))
    out["poi_demand_vs_visual"] = {
        "kind": "two_sets",
        "name": "POI nhu cầu sạc vs POI bối cảnh trực quan",
        "rule_const": "demand_classes ∩ visual_classes ≠ ∅, KHÔNG lồng nhau",
        "source_file": "src/evcs/core/osm.py",
        "before": n_visual,
        # `null`, không phải 0. Không có phép loại nào xảy ra ở đây, và một số 0 đọc thành
        # "không có gì bị loại" — một tuyên bố khác hẳn "câu hỏi không áp dụng".
        "removed": None,
        "after": len(demand),
        "denominator": "hai tập độc lập; không tập nào là mẫu số của tập kia",
        "n_visual": n_visual,
        "n_demand": len(demand),
        "n_both": len(kv & kd),
        "n_visual_only": len(kv - kd),
        "n_demand_only": len(kd - kv),
    }

    return out


def _exclusions_block(code: str) -> dict:
    ex_file = paths.QA / "exclusions.json"
    if not ex_file.exists():
        return {}
    ex_data = json.loads(ex_file.read_text("utf-8"))
    excluded_entry = next(
        (
            e
            for e in ex_data.get("de_nghi_loai_khoi_phan_tich", [])
            if e["province_code"] == code
        ),
        None,
    )
    poi_entry = next(
        (
            e
            for e in ex_data.get("khong_loai_nhung_cam_dien_giai_POI", [])
            if e["province_code"] == code
        ),
        None,
    )
    return {
        "thresholds": ex_data.get("nguong", {}),
        "excluded": excluded_entry is not None,
        "exclusion_reasons": excluded_entry.get("reasons", [])
        if excluded_entry
        else [],
        "exclusion_flags": excluded_entry.get("all_flags", [])
        if excluded_entry
        else [],
        "poi_not_interpretable": poi_entry is not None,
        "poi_details": poi_entry or {},
    }


def _freshness_block(
    stations: pd.DataFrame, occ_window: list[str] | None, exported_utc: str
) -> dict:
    """`freshness` — §3.6. Ngày ở dạng ISO cho web, phân phối `freshness` theo hàng.

    **Ngày lấy từ `SNAPSHOT_DATES`, không gõ lại ở đây.** Bản trước gõ ba chuỗi ISO ngay
    trong khối này trong khi `snapshots` (cùng manifest, cách 20 dòng) dựng cùng ba ngày ấy
    từ nguồn khác — `vnsdi_valid_from` thì đọc `admin.VINTAGE`, hai ngày kia thì gõ ở dạng
    `dd/mm/yyyy`. Cùng một sự thật ở hai chỗ, hai định dạng: đổi niên bản là hai khối trên
    cùng một màn hình nói hai ngày khác nhau, và không có gì nổ.
    """
    fr = stations["freshness"] if "freshness" in stations.columns else None
    has = fr is not None and bool(fr.notna().any())

    def q(fn) -> float | None:
        return float(round(fn(), 4)) if has else None

    return {
        "exported_utc": exported_utc,
        # Đồng hồ MỨC GÓI, tuyệt đối. Web đọc ISO ở đây để khỏi phải phân tích `28/07/2026`
        # trong trình duyệt; `snapshots` giữ nguyên dạng hiển thị cũ của nó.
        "inputs": {
            "osm_pbf": SNAPSHOT_DATES["osm_pbf"],
            "stations_canonical": SNAPSHOT_DATES["stations_canonical"],
            "vnsdi_valid_from": _iso_date(admin.VINTAGE["valid_from"]),
            "occupancy_window": occ_window,
        },
        # Đồng hồ MỨC HÀNG, tương đối — và KHÔNG so sánh được với khối trên. Không đơn vị,
        # không mốc thời gian, không định nghĩa ở bất kỳ đâu trong repo này (§10-1). Cho tới
        # khi thượng nguồn trả lời, nó ship là một PHÂN PHỐI dưới nhãn "chưa định nghĩa" và
        # không được vạch ngưỡng, tô thang "cũ", hay gộp vào một điểm sức khoẻ nào.
        "row_level": {
            "column": "stations.freshness",
            "unit": None,
            "note": "0–1, nhỏ là mới; định nghĩa chưa có ở thượng nguồn",
            "p50": q(lambda: fr.median()),
            "p90": q(lambda: fr.quantile(0.9)),
            "max": q(lambda: fr.max()),
            "n_present": int(fr.notna().sum()) if fr is not None else 0,
            "n_rows": len(stations),
        },
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

    cal_path = src / "sim_calibration.json"
    if cal_path.exists():
        shutil.copy2(cal_path, d / "sim_calibration.json")
        note("sim_calibration.json", d / "sim_calibration.json")

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

    stations_df = pq.read_table(d / "stations.parquet").to_pandas()
    occ_df = pq.read_table(d / "station_occupancy.parquet").to_pandas()
    roads_shipped_df = pq.read_table(d / "roads.parquet").to_pandas()
    commune_df = pq.read_table(src / "commune.parquet").to_pandas()
    poi_df = pq.read_table(src / "poi_visual.parquet").to_pandas()
    poi_demand_path = src / "poi_demand.parquet"
    # Bảng 34 tỉnh — bảng TOÀN QUỐC, ship ở `web/public/data/provinces.parquet`. Nó vào
    # `null_states` của mọi tỉnh vì đó là nơi web đọc, cùng lối với `vintage`/`snapshots`:
    # một bản giống hệt trong cả 34 manifest.
    provinces_qa_df = qa_prov

    road_cols = sorted(roads_shipped_df.columns)
    station_cols = sorted(stations_df.columns)

    totals_dict = _totals(src) | _private_ac_block(qrow)
    exported_utc_str = datetime.now(UTC).isoformat(timespec="seconds")

    manifest = {
        "exported_utc": exported_utc_str,
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
        "source_metrics": _source_metrics(grid),
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
        "null_states": _null_states(
            grid, stations_df, occ_df, roads_shipped_df, commune_df, poi_df, provinces_qa_df
        ),
        "not_measured": _not_measured_block(qrow),
        "invalid_values": _invalid_values(grid, commune_df),
        "degenerate_columns": _degenerate_columns(grid),
        "filters": _filters_block(
            totals_dict, road_meta, occ_df, grid, poi_df, poi_demand_path
        ),
        "exclusions": _exclusions_block(code),
        "freshness": _freshness_block(stations_df, occ_window, exported_utc_str),
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
        "totals": totals_dict,
        "poi": poi_meta,
        "roads": road_meta,
        "quality": (
            {}
            if qrow.empty
            else json.loads(qrow.iloc[0].to_json(orient="index", force_ascii=False))
        ),
        # Cổng THÔ: gói này có lớp TÍNH TOÁN không? Chỉ hỏi được ngần ấy ở đây, và đó là
        # có chủ ý — TypeScript sở hữu bảng `requires` của từng cảnh (`story/spec.ts`), nên
        # chép bảng ấy sang Python là dựng đúng cái "một định nghĩa ở hai chỗ" mà cả pha
        # này đang gỡ. Web tự chấm từng cảnh trên chính manifest này và giấu cảnh nào không
        # dựng được (`renderableScenes`), nên khoá này KHÔNG còn là một phép so mã tỉnh.
        "story_enabled": bool({"population", "dist_station_network_m"} <= set(grid.columns)),
        # Lớp CÓ cột nhưng KHÔNG đọc được — khác `missing_layers` (cột không tồn tại).
        # Quyết định 2026-08-07 (chủ dự án): giữ tỉnh, TẮT lớp. Loại cả tỉnh là vứt lớp
        # cung/POI/đường vẫn đúng của nó vì một lớp hỏng — Sơn La vẫn có 64 trạm / 540 cổng
        # / 17,6 MW đo chính xác. Ngưỡng ở `n10_quality.MIN_OCC_MEASURED_SHARE`.
        "unusable_layers": unusable,
        # Khối NGUỒN của rail đọc thẳng từ đây (§8). Bốn dòng đầu đọc được TỪ DỮ LIỆU; hai
        # dòng cuối là ngày đóng băng của nguồn thượng nguồn, không cột nào mang chúng —
        # giữ ở tầng dữ liệu chứ không ở TS, đúng chỗ bản Hà Nội đã đặt. Cả hai dẫn xuất từ
        # `SNAPSHOT_DATES` để `freshness.inputs` không thể trôi khỏi khối này.
        "snapshots": {
            "occupancy_snapshot_id": occ_snapshot,
            "occupancy_window": occ_window,
            "vnsdi_valid_from": admin.VINTAGE["valid_from"],
            "osm_pbf": _display_date(SNAPSHOT_DATES["osm_pbf"]),
            "stations_canonical": _display_date(SNAPSHOT_DATES["stations_canonical"]),
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

    health = WEB_DATA / "province_health.json"
    health.write_text(
        json.dumps(_province_health(idx, qp), ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return {
        "provinces.parquet": p.stat().st_size,
        "provinces.geojson": gj.stat().st_size,
        "province_health.json": health.stat().st_size,
    }


def _province_health(idx: pd.DataFrame, qp: pd.DataFrame) -> dict:
    """Bảng sức khoẻ 34 TỈNH — §2.8, một file cho cả nước.

    Vì sao là file riêng chứ không nhét vào từng manifest tỉnh: đây là một sự thật TOÀN QUỐC.
    Chép 34 dòng vào cả 34 manifest là 34 bản có thể lệch nhau, và web thì đằng nào cũng phải
    đọc cả bảng để vẽ một dòng "tỉnh này đứng đâu". Một file 34 dòng, nạp lười khi mở chế độ
    DỮ LIỆU, rẻ hơn 34 lượt tải manifest.

    Suy thoái KHÔNG đều giữa các tỉnh và điều đó đo được — năm tín hiệu dưới đây là năm tín
    hiệu §2.8 nêu tên, đọc thẳng từ bảng QA chứ không gõ lại con số nào.
    """
    ex_file = paths.QA / "exclusions.json"
    ex = json.loads(ex_file.read_text("utf-8")) if ex_file.exists() else {}
    excluded = {e["province_code"]: e for e in ex.get("de_nghi_loai_khoi_phan_tich", [])}
    poi_bad = {e["province_code"] for e in ex.get("khong_loai_nhung_cam_dien_giai_POI", [])}

    def f(v):
        return None if pd.isna(v) else float(v)

    def i(v):
        return None if pd.isna(v) else int(v)

    rows = []
    for _, r in qp.sort_values("province_code").iterrows():
        code = str(r.province_code)
        flags = r.quality_flags
        name_row = idx[idx.province_code == code]
        rows.append(
            {
                "province_code": code,
                "province_name": (
                    str(name_row.iloc[0].province_name) if len(name_row) else str(r.province_name)
                ),
                "n_stations": i(r.n_stations),
                # Cờ chất lượng: 3 tỉnh sạch, 4 tỉnh mang cả bốn cờ.
                "quality_flags": [] if pd.isna(flags) else str(flags).split("|"),
                # Ô không tới được bằng đường: 0,07 % (01) → 66,6 % (56). Đi CÙNG phần dân bị
                # ảnh hưởng — một mình nó đọc thành "mất hai phần ba dữ liệu" ở Khánh Hoà,
                # trong khi phần dân sống trong đám ô đó là 0,87 %.
                "share_cells_reachable": f(r.share_cells_reachable),
                "share_pop_unreachable": f(r.share_pop_unreachable),
                # Đo được telemetry: 0,0 % (Điện Biên) → 96,9 % (Đồng Nai).
                "share_stations_measured": f(r.share_stations_measured),
                # POI diễn giải được: 3,6 % (79) → 76,6 % (96) số xã không có POI nào.
                "share_communes_zero_poi": f(r.share_communes_zero_poi),
                # Neo dân số: 0,9519 (01) → 1,6072 (91).
                "vnsdi_anchor_ratio": f(r.vnsdi_anchor_ratio),
                "excluded": code in excluded,
                "exclusion_reasons": excluded.get(code, {}).get("reasons", []),
                "poi_not_interpretable": code in poi_bad,
            }
        )
    return {
        "thresholds": ex.get("nguong", {}),
        "source": "store/qa/provinces.parquet + store/qa/exclusions.json",
        "provinces": rows,
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
        # n11 COPY file hiệu chuẩn P6 vào gói web — thiếu khai báo này thì topo-order có
        # thể chạy n11 trước n15 trên pipeline sạch và gói web thiếu file một cách im lặng.
        "sim_calibration",
    ),
    extra_writes=lambda _p: outputs(),
    desc="xuất store cho web theo tỉnh + chỉ mục toàn quốc, đo ngân sách dung lượng",
)
