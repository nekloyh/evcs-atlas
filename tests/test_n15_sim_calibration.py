"""Tests for n15_sim_calibration pipeline step and calibration data contracts.

Verifies deterministic band percentiles, near band metrics, leave-self-out validation,
and valid/invalid thresholds.
Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.4, §1.5, §2.1
"""

from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from vn.n15_sim_calibration import compute_calibration, _get_band_name, BAND_DEFS


def test_band_definitions():
    assert len(BAND_DEFS) == 6
    assert _get_band_name(100.0) == "5000-inf"  # < 200m is near band, fallback
    assert _get_band_name(250.0) == "200-500"
    assert _get_band_name(750.0) == "500-1000"
    assert _get_band_name(1500.0) == "1000-2000"
    assert _get_band_name(2500.0) == "2000-3000"
    assert _get_band_name(4000.0) == "3000-5000"
    assert _get_band_name(6000.0) == "5000-inf"


def test_compute_calibration_hanoi():
    cal = compute_calibration("01")
    assert cal["version"] == 1
    assert cal["province_code"] == "01"
    assert cal["valid"] is True
    assert "bands" in cal
    assert len(cal["bands"]) == 6
    assert cal["near"]["n"] > 0
    assert 0.05 <= cal["validation"]["upper_miss"] <= 0.15


def test_hanoi_calibration_file_contract():
    path = Path("web/public/data/p/01/sim_calibration.json")
    if not path.exists():
        path = Path("store/01/sim_calibration.json")
    if not path.exists():
        pytest.skip("Hanoi calibration file not present yet")

    data = json.loads(path.read_text(encoding="utf-8"))

    assert data["version"] == 1
    assert data["province_code"] == "01"
    assert data["valid"] is True

    # Check bands
    for band_name in ["200-500", "500-1000", "1000-2000", "2000-3000", "3000-5000", "5000-inf"]:
        assert band_name in data["bands"]
        b = data["bands"][band_name]
        assert b["n"] > 0
        assert b["med"] >= 1.0
        assert b["p90"] >= b["med"]

    # Check near band
    assert data["near"]["n"] > 0
    assert data["near"]["net_p50"] > 0
    assert data["near"]["net_p90"] >= data["near"]["net_p50"]

    # Check validation metrics (spec §1.4: miss rate in [0.05, 0.15])
    assert 0.05 <= data["validation"]["upper_miss"] <= 0.15
    assert data["validation"]["within_20pct"] > 0.50


# ── T18 + integration check gói 01 (bổ sung theo QA Phase 6) ───────────────────────────

import h3
import numpy as np
from vn.n15_sim_calibration import calibrate_frame, MIN_RING_VALUES

_CENTER = h3.latlng_to_cell(21.0285, 105.8542, 8)


def _cells(k: int) -> list[str]:
    return sorted(h3.grid_disk(_CENTER, k))


def test_t18_thin_bands_merged_and_recorded():
    """T18a — dải mỏng (n < 50) lấy giá trị từ cửa sổ gộp VÀ mang cờ `merged` trong file."""
    cells = _cells(10)  # 331 ô >= MIN_TOTAL_RATIO_CELLS
    n = len(cells)
    # 10 ô ở dải 200-500 (mỏng), 45 ô ở 500-1000 (mỏng), phần còn lại chia đều >= 50/dải
    e = np.empty(n)
    e[:10] = np.linspace(250, 480, 10)
    e[10:55] = np.linspace(520, 980, 45)
    # phân đủ >= 50 ô cho từng dải còn lại một cách TƯỜNG MINH (linspace trải đều dễ hụt)
    e[55:115] = np.linspace(1050, 1950, 60)
    e[115:175] = np.linspace(2050, 2950, 60)
    e[175:235] = np.linspace(3050, 4950, 60)
    e[235:] = np.linspace(5050, 6500, n - 235)
    ratio = 1.4 + 0.001 * (np.arange(n) % 50)
    df = pd.DataFrame(
        {
            "h3_r8": cells,
            "dist_station_euclid_m": e,
            "dist_station_network_m": e * ratio,
            "detour_ratio": ratio,
            "network_reachable": True,
        }
    )
    cal = calibrate_frame(df, "99")
    assert cal["bands"]["200-500"]["merged"] is True
    assert cal["bands"]["200-500"]["n"] == 10
    assert cal["bands"]["500-1000"]["merged"] is True
    assert "merged" not in cal["bands"]["1000-2000"]
    assert set(cal["bands"]) == {
        "200-500", "500-1000", "1000-2000", "2000-3000", "3000-5000", "5000-inf",
    }
    assert cal["near"] is None  # không có ô < 200 m


def test_t18_too_few_ratio_cells_invalid():
    """T18b — tổng ô có ratio < 300 ⇒ valid=false ⇒ web tắt tính năng (F2)."""
    cells = _cells(8)  # 217 ô < 300
    n = len(cells)
    e = np.linspace(600, 4500, n)
    df = pd.DataFrame(
        {
            "h3_r8": cells,
            "dist_station_euclid_m": e,
            "dist_station_network_m": e * 1.5,
            "detour_ratio": 1.5,
            "network_reachable": True,
        }
    )
    cal = calibrate_frame(df, "99")
    assert cal["valid"] is False
    assert cal["validation"]["n"] == n


def test_integration_package_01_upper_bound_guard():
    """Integration check §4 — chạy estimator §1.5 với ứng viên đặt TẠI một trạm hiện hữu
    của gói 01, trên các ô mà trạm đó là trạm gần nhất theo euclid (tức cột công bố
    `dist_station_network_m` chính là khoảng cách thật tới ứng viên).

    Diễn giải: câu spec "≥ 85 % of IMPROVES-classified cells satisfy d̂⁺ ≥ ..." đọc theo
    nghĩa đen là bất khả thi (IMPROVES ⇔ d̂⁺ < d_old = khoảng cách thật ở chính các ô này),
    nên kiểm theo Ý ĐỊNH được spec nêu ("mirroring the measured 9,7 % miss"): cận trên
    d̂⁺ phải phủ >= 85 % khoảng cách thật — tương đương <= 15 % ô bị xếp IMPROVES oan.
    """
    grid_path = Path("web/public/data/p/01/grid_h3_r8.parquet")
    st_path = Path("web/public/data/p/01/stations.parquet")
    cal_path = Path("web/public/data/p/01/sim_calibration.json")
    if not (grid_path.exists() and st_path.exists() and cal_path.exists()):
        pytest.skip("gói web 01 chưa xuất")

    import pyarrow.parquet as pq

    cal = json.loads(cal_path.read_text(encoding="utf-8"))
    grid = pq.read_table(
        grid_path,
        columns=["h3_r8", "lat", "lng", "dist_station_network_m", "detour_ratio"],
    ).to_pandas()
    st = pq.read_table(
        st_path, columns=["station_code", "lat", "lng", "op_status", "access"]
    ).to_pandas()
    # Bộ lọc §1.2 — byte-identical n07_distance.py:66
    st = st[st.op_status.isin(["OPERATIONAL", "MAINTENANCE"]) & (st.access != "RESTRICTED")]

    def hav(lat1, lng1, lat2, lng2):
        R = 6371008.8
        p1, p2 = np.radians(lat1), np.radians(lat2)
        dp, dl = np.radians(lat2 - lat1), np.radians(lng2 - lng1)
        a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
        return 2 * R * np.arcsin(np.sqrt(a))

    # Trạm gần nhất theo euclid cho từng ô (equirect cục bộ đủ cho việc CHỌN trạm)
    m_lat = 111132.0
    m_lon = 111320.0 * np.cos(np.radians(21.0))
    from scipy.spatial import cKDTree

    tree = cKDTree(np.c_[st.lng.to_numpy() * m_lon, st.lat.to_numpy() * m_lat])
    _, nn = tree.query(np.c_[grid.lng.to_numpy() * m_lon, grid.lat.to_numpy() * m_lat])
    grid = grid.assign(nn_code=st.station_code.to_numpy()[nn])

    # Chọn trạm có nhiều ô kiểm chứng nhất (ô đo được, trong 5 km)
    reach = grid[grid.dist_station_network_m.notna()]
    s_code = reach.nn_code.value_counts().idxmax()
    srow = st[st.station_code == s_code].iloc[0]

    val = reach[reach.nn_code == s_code].copy()
    val["e"] = hav(val.lat, val.lng, srow.lat, srow.lng)
    val = val[(val.e >= 200) & (val.e <= 5000)]
    assert len(val) >= 30, f"trạm {s_code} chỉ có {len(val)} ô kiểm chứng"

    detour_map = dict(zip(grid.h3_r8, grid.detour_ratio))

    def band_of(e):
        if e < 500: return "200-500"
        if e < 1000: return "500-1000"
        if e < 2000: return "1000-2000"
        if e < 3000: return "2000-3000"
        if e < 5000: return "3000-5000"
        return "5000-inf"

    covered = 0
    for row in val.itertuples():
        ring = [
            detour_map[c]
            for c in h3.grid_disk(row.h3_r8, 1)
            if c in detour_map and pd.notna(detour_map[c])
        ]
        L = max(float(np.median(ring)), 1.0) if len(ring) >= MIN_RING_VALUES else 0.0
        d_upper = row.e * max(cal["bands"][band_of(row.e)]["p90"], L)
        if d_upper >= row.dist_station_network_m:
            covered += 1
    share = covered / len(val)
    assert share >= 0.85, (
        f"cận trên p90 chỉ phủ {share:.1%} trên {len(val)} ô quanh trạm {s_code} (cần >= 85%)"
    )
