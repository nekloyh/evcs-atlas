"""Phase 8 — thẩm định `null_states` và bạn hữu, trên CẢ 34 TỈNH.

Phép kiểm nặng nhất ở đây là §8.5: **tính lại từ frame gốc rồi so với cái manifest đã ghi.**
Nó tồn tại vì bản trước của exporter làm đúng một việc mà không bất biến hình dạng nào bắt
được — cộng phần ô trống DƯ vào một xô đã mang luật, thành ra 27 hàng đứng dưới một vị từ chỉ
27 hàng chỉ thoả 26 hàng. Manifest vẫn cân, tổng vẫn khớp, và con số vẫn nói dối. Cách duy
nhất để bắt được là tính lại từng vị từ trên chính dữ liệu.
"""

from __future__ import annotations

import json

import pandas as pd
import pyarrow.parquet as pq
import pytest

from vn import admin, paths
from vn.n11_web_export import (
    _NULL_RULES,
    _NULLABLE_COLUMNS,
    SNAPSHOT_DATES,
    _iso_date,
)

PROVINCES = admin.province_codes()
WEB = paths.ROOT / "web/public/data"


def manifest(code: str) -> dict:
    return json.loads((WEB / "p" / code / "manifest.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def manifests() -> dict[str, dict]:
    return {c: manifest(c) for c in PROVINCES}


# ── Hình dạng, trên cả 34 ────────────────────────────────────────────────────────────


def test_every_province_ships_every_phase8_block(manifests):
    for code, m in manifests.items():
        for key in (
            "null_states",
            "not_measured",
            "invalid_values",
            "degenerate_columns",
            "filters",
            "exclusions",
            "freshness",
        ):
            assert key in m, f"{code} thiếu {key}"


def test_null_state_buckets_partition_every_blank(manifests):
    """Σ các xô = số ô trống. Không hàng nào mất, không hàng nào đếm hai lần."""
    for code, m in manifests.items():
        for tbl, cols in m["null_states"].items():
            for col, d in cols.items():
                total = sum(b["n"] for b in d["states"].values())
                assert total == d["n_rows"] - d["n_present"], f"{code} {tbl}.{col}"
                na = sum(b["n"] for b in d["states"].values() if b["state"] == "NOT_APPLICABLE")
                assert d["n_applicable"] == d["n_rows"] - na, f"{code} {tbl}.{col} mẫu số"


def test_no_bucket_mixes_two_states_under_one_rule(manifests):
    """Mỗi xô mang ĐÚNG một trạng thái và ĐÚNG một luật, và luật không rỗng."""
    for code, m in manifests.items():
        for tbl, cols in m["null_states"].items():
            for col, d in cols.items():
                for key, b in d["states"].items():
                    assert b["state"] in {
                        "MISSING",
                        "NOT_APPLICABLE",
                        "NOT_MEASURED",
                        "FILTERED",
                    }, f"{code} {tbl}.{col}.{key}"
                    assert b["basis"] in {"row_predicate", "table_invariant", "residual"}
                    assert b["rule"], f"{code} {tbl}.{col}.{key} luật rỗng"
                    if b["basis"] == "table_invariant":
                        assert b.get("verified_by"), f"{code} {tbl}.{col} không đối chiếu được"


# ── §8.5 — TÍNH LẠI TỪ FRAME, cả 34 tỉnh ─────────────────────────────────────────────


def _frames(code: str) -> dict[str, pd.DataFrame]:
    d = WEB / "p" / code
    src = paths.PROV / code
    qa_prov = pq.read_table(paths.QA / "provinces.parquet").to_pandas()
    return {
        "grid": pq.read_table(d / "grid_h3_r8.parquet").to_pandas(),
        "stations": pq.read_table(d / "stations.parquet").to_pandas(),
        "station_occupancy": pq.read_table(d / "station_occupancy.parquet").to_pandas(),
        "roads": pq.read_table(d / "roads.parquet").to_pandas(),
        "commune": pq.read_table(src / "commune.parquet").to_pandas(),
        "poi": pq.read_table(src / "poi_visual.parquet").to_pandas(),
        "provinces": qa_prov,
    }


@pytest.mark.parametrize("code", PROVINCES)
def test_null_state_counts_recomputed_from_frames(code):
    """§8.5 — chạy lại chính bảng luật trên chính frame, so từng xô một.

    Đây là phép kiểm bắt được lỗi mà không bất biến số học nào bắt được: một hàng nằm dưới
    một vị từ mà nó KHÔNG thoả. Nó cũng ghim thứ tự quyết định của §1.1 — tính lại theo đúng
    thứ tự trong `_NULL_RULES`, nên đảo NOT_APPLICABLE với FILTERED sẽ làm đỏ ở đây.
    """
    m = manifest(code)
    frames = _frames(code)
    for table, cols in _NULLABLE_COLUMNS.items():
        df = frames[table]
        for col in cols:
            if col not in df.columns:
                continue
            blank = df[col].isna()
            n_blanks = int(blank.sum())
            shipped = m["null_states"].get(table, {}).get(col)
            if n_blanks == 0:
                assert shipped is None, f"{code} {table}.{col}: phát một cột không có ô trống"
                continue
            assert shipped is not None, f"{code} {table}.{col}: có ô trống mà không phát"
            assert shipped["n_rows"] == len(df)
            assert shipped["n_present"] == len(df) - n_blanks

            unassigned = blank.copy()
            expected: dict[str, int] = {}
            for r in _NULL_RULES.get((table, col), []):
                if any(n not in df.columns for n in r["needs"]):
                    continue
                mask = unassigned if r["pred"] is None else (unassigned & r["pred"](df))
                n = int(mask.sum())
                if n:
                    expected[r.get("bucket", r["state"])] = n
                unassigned = unassigned & ~mask
            residual = int(unassigned.sum())
            if residual:
                expected["MISSING@residual"] = residual

            got = {k: b["n"] for k, b in shipped["states"].items()}
            assert got == expected, f"{code} {table}.{col}: manifest {got} ≠ tính lại {expected}"


@pytest.mark.parametrize("code", PROVINCES)
def test_rule_predicate_actually_holds_for_every_row_it_claims(code):
    """Mỗi xô CÓ LUẬT chỉ được chứa hàng THOẢ luật ấy — không một hàng dư nào.

    §9-2 là ca cụ thể: `power_kw_site` có 27 ô trống nhưng chỉ 26 hàng thoả
    `port_config_source = 'UNKNOWN'`. Bản trước cộng hàng thứ 27 vào cùng xô, nên nó ship dưới
    một luật mà chính nó không thoả.
    """
    m = manifest(code)
    frames = _frames(code)
    for table, cols in _NULLABLE_COLUMNS.items():
        df = frames[table]
        for col in cols:
            shipped = m["null_states"].get(table, {}).get(col)
            if shipped is None or col not in df.columns:
                continue
            blank = df[col].isna()
            for r in _NULL_RULES.get((table, col), []):
                if r["pred"] is None or any(n not in df.columns for n in r["needs"]):
                    continue
                key = r.get("bucket", r["state"])
                if key not in shipped["states"]:
                    continue
                n_satisfying = int((blank & r["pred"](df)).sum())
                assert shipped["states"][key]["n"] <= n_satisfying, (
                    f"{code} {table}.{col}: xô `{key}` khai {shipped['states'][key]['n']} hàng "
                    f"nhưng chỉ {n_satisfying} hàng thoả `{r['rule']}`"
                )


def test_residual_inventory_is_pinned(manifests):
    """Kiểm kê ô trống DƯ, ghim theo số — cùng bản với `web/test/data-health.test.ts`.

    §9 của đặc tả nêu ba khuyết tật, đo trên Hà Nội. Máy phân giải khai báo cho thấy §9 đo
    THIẾU: trên cả nước có tám cột mang ô trống không luật nào giải thích. Ghim cả tám.
    """
    seen: dict[str, int] = {}
    for m in manifests.values():
        for tbl, cols in m["null_states"].items():
            for col, d in cols.items():
                for b in d["states"].values():
                    if b["basis"] == "residual":
                        seen[f"{tbl}.{col}"] = seen.get(f"{tbl}.{col}", 0) + b["n"]
    assert seen == {
        "grid.dist_station_asym_m": 22,
        "stations.current_type": 7,
        "stations.power_kw_max_port": 7,
        "stations.power_kw_site": 7,
        "station_occupancy.night_share": 2,
        "station_occupancy.weekend_ratio": 8,
        "station_occupancy.util_pctl": 7,
        "station_occupancy.util_pctl_peer": 7,
    }


# ── Phép lọc ─────────────────────────────────────────────────────────────────────────


def test_removal_filters_close_and_two_set_row_does_not_pretend(manifests):
    for code, m in manifests.items():
        f = m["filters"]
        assert len(f) == 5, code
        removals = {k: v for k, v in f.items() if v["kind"] == "removal"}
        assert len(removals) == 4, code
        for k, v in removals.items():
            assert v["removed"] is not None, f"{code} {k}"
            assert v["before"] - v["removed"] == v["after"], f"{code} {k}"
            assert v["removed"] >= 0, f"{code} {k}: 'đã loại' âm ⇒ đây không phải phép loại"
        poi = f["poi_demand_vs_visual"]
        assert poi["kind"] == "two_sets"
        assert poi["removed"] is None
        assert poi["n_both"] + poi["n_visual_only"] == poi["n_visual"], code
        assert poi["n_both"] + poi["n_demand_only"] == poi["n_demand"], code


def test_poi_sets_are_not_nested_somewhere_in_the_country(manifests):
    """Bằng chứng cho quyết định mô hình: hai tập POI KHÔNG lồng nhau."""
    bigger = [
        c
        for c, m in manifests.items()
        if m["filters"]["poi_demand_vs_visual"]["n_demand"]
        > m["filters"]["poi_demand_vs_visual"]["n_visual"]
    ]
    assert bigger, "nếu không tỉnh nào có tập nhu cầu lớn hơn, mô hình 'hai tập' cần xét lại"


# ── Ngày, cột hằng, khoá chưa đo ─────────────────────────────────────────────────────


def test_freshness_dates_derive_from_one_source(manifests):
    """`freshness.inputs` và `snapshots` phải mô tả CÙNG ngày, ở hai định dạng."""
    for code, m in manifests.items():
        fi = m["freshness"]["inputs"]
        sn = m["snapshots"]
        assert fi["osm_pbf"] == SNAPSHOT_DATES["osm_pbf"], code
        assert fi["stations_canonical"] == SNAPSHOT_DATES["stations_canonical"], code
        assert fi["vnsdi_valid_from"] == _iso_date(sn["vnsdi_valid_from"]), code
        # Và dạng hiển thị của `snapshots` phải là chính hai ngày ISO ấy, đảo lại.
        d, mo, y = sn["osm_pbf"].split("/")
        assert f"{y}-{mo}-{d}" == fi["osm_pbf"], code
        assert m["freshness"]["row_level"]["unit"] is None, f"{code}: §10-1 chưa trả lời"


def test_degenerate_columns_keep_numeric_type(manifests):
    for code, m in manifests.items():
        assert "snow_frac" in m["degenerate_columns"], code
        assert "moss_frac" in m["degenerate_columns"], code
        for col, val in m["degenerate_columns"].items():
            assert isinstance(val, (int, float)) and not isinstance(val, bool), (
                f"{code} {col}: cột hằng bị đẩy thành {type(val).__name__}"
            )


def test_not_measured_keys_are_actually_null_upstream(manifests):
    """§9-8 — chỉ khai CHƯA ĐO cho khoá thật sự còn null. Thượng nguồn chạy thì khối tự biến."""
    for code, m in manifests.items():
        nm = m["not_measured"]
        assert "quality.n_only_in_secondary" in nm, code
        assert "THIEU_NHA_VAN_HANH_KHAC" in nm["quality.n_only_in_secondary"]["consequence"]
        for key in nm:
            col = key.split(".", 1)[1]
            assert m["quality"].get(col) is None, f"{code} {key} đã có số mà vẫn khai chưa đo"


def test_occ_status_counts_break_down_the_unmeasured(manifests):
    """§2.5 — 'chưa đo' phải tách theo LÝ DO, và tổng phải khớp số dòng."""
    for code, m in manifests.items():
        counts = m["totals"].get("occ_status_counts")
        ok = m["totals"].get("occ_status_ok")
        if ok is None:
            continue
        assert counts, f"{code} thiếu occ_status_counts"
        assert sum(counts.values()) == ok["n_total"], code
        assert counts.get("OK", 0) == ok["n_ok"], code


# ── Bảng sức khoẻ 34 tỉnh ────────────────────────────────────────────────────────────


def test_province_health_table_covers_all_34_with_thresholds():
    h = json.loads((WEB / "province_health.json").read_text(encoding="utf-8"))
    assert len(h["provinces"]) == 34
    assert set(h["thresholds"]) == {
        "MIN_STATIONS",
        "MIN_OCC_MEASURED_SHARE",
        "POI_ZERO_COMMUNE_MAX",
    }
    codes = {r["province_code"] for r in h["provinces"]}
    assert codes == set(PROVINCES)
    # Bốn tỉnh mà `exclusions.json` đề nghị loại — ghim để bảng không âm thầm rỗng đi.
    excluded = sorted(r["province_code"] for r in h["provinces"] if r["excluded"])
    assert excluded == ["04", "11", "12", "14"]
    for r in h["provinces"]:
        # Phủ ô và phần dân phải ĐI CÙNG NHAU — một mình phủ ô là con số gây hiểu lầm.
        assert r["share_cells_reachable"] is not None, r["province_code"]
        assert r["share_pop_unreachable"] is not None, r["province_code"]


def test_khanh_hoa_shows_the_lesson_of_the_phase():
    """56: một phần ba số ô tới được, nhưng gần như toàn bộ dân số còn nguyên."""
    h = json.loads((WEB / "province_health.json").read_text(encoding="utf-8"))
    kh = next(r for r in h["provinces"] if r["province_code"] == "56")
    assert kh["share_cells_reachable"] < 0.4
    assert kh["share_pop_unreachable"] < 0.02


# ── Giá trị đã ghim của Hà Nội (§0.1–§0.5) ───────────────────────────────────────────


def test_hanoi_audited_values():
    m = json.loads((WEB / "manifest.json").read_text(encoding="utf-8"))

    util_cell = m["null_states"]["grid"]["util_cell"]
    assert util_cell["n_rows"] == 4400
    assert util_cell["n_present"] == 437
    assert util_cell["states"]["NOT_APPLICABLE"]["n"] == 3951
    assert util_cell["states"]["NOT_MEASURED"]["n"] == 12
    assert util_cell["n_applicable"] == 449
    assert abs(util_cell["share_of_applicable"] - 0.973274) < 1e-5
    # AC-4 — mẫu số THÔ phải có mặt cạnh mẫu số THẬT, không bị nó thay thế.
    assert abs(util_cell["share_rows"] - 0.099318) < 1e-5

    detour = m["null_states"]["grid"]["detour_ratio"]
    assert detour["states"]["FILTERED"]["n"] == 87
    assert detour["states"]["NOT_APPLICABLE"]["n"] == 3
    assert detour["states"]["FILTERED"]["threshold"]["name"] == "DETOUR_MIN_EUCLID_M"
    assert detour["states"]["FILTERED"]["threshold"]["value"] == 200.0

    # §9-2 — hàng dư ĐỨNG RIÊNG, không nấp dưới luật `UNKNOWN`.
    pks = m["null_states"]["stations"]["power_kw_site"]
    assert pks["states"]["MISSING@unknown_port_config"]["n"] == 26
    assert pks["states"]["MISSING@residual"]["n"] == 1
    assert pks["states"]["MISSING@residual"]["basis"] == "residual"

    rw = m["filters"]["road_ways"]
    assert (rw["before"], rw["removed"], rw["after"]) == (240215, 124284, 115931)

    pac = m["filters"]["private_ac_charge_points"]
    assert (pac["before"], pac["removed"], pac["after"]) == (2521, 1811, 710)
    assert abs(pac["share_removed_stations"] - 1811 / 2521) < 1e-4

    poi = m["filters"]["poi_demand_vs_visual"]
    assert (poi["n_visual"], poi["n_demand"]) == (5896, 3919)

    assert m["invalid_values"]["grid.population"]["n"] == 55
    assert m["invalid_values"]["grid.population@zero_no_weight"]["n"] == 135
    assert m["invalid_values"]["commune.population"]["n"] == 2

    # §2.1 — đối soát súng/cổng đứng trên CÙNG phạm vi IN+BUFFER.
    assert m["totals"]["connectors"]["n_guns"] == 8823
    assert m["totals"]["all"]["n_ports"] == 9878
    assert (
        m["totals"]["all"]["n_stations"] - m["totals"]["connectors"]["n_stations_with_connectors"]
        == 28
    )
