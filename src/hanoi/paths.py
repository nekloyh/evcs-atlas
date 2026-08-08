"""Đường dẫn nguồn (CHỈ ĐỌC) và đích (ghi).

Hai repo cũ chỉ được ĐỌC. Không hàm nào trong gói này ghi vào chúng.
Ghi đè bằng biến môi trường nếu repo nằm chỗ khác.
"""

from __future__ import annotations

import os
from pathlib import Path

HOME_WORK = Path(os.environ.get("EVCS_WORKSPACE", Path.home() / "Work" / "internVSF"))

# --- nguồn: chỉ đọc -------------------------------------------------------
AGIANG = Path(os.environ.get("EVCS_AGIANG_REPO", HOME_WORK / "aGiang-evcs"))
DATASET = Path(os.environ.get("EVCS_DATASET_REPO", HOME_WORK / "evcs-dataset"))

SRC_VNSDI_COMMUNES = AGIANG / "data/interim/vnsdi/communes.parquet"
SRC_OSM_PBF = AGIANG / "data/raw/osm/vietnam-latest.osm.pbf"
SRC_WORLDPOP_2025 = AGIANG / "data/raw/worldpop/vnm_pop_2025_CN_100m_R2024B_v1.tif"
SRC_WORLDCOVER_DIR = AGIANG / "data/raw/landuse/worldcover"
SRC_CANON_STATIONS = AGIANG / "data/interim/canonical/stations"
SRC_CANON_CONNECTORS = AGIANG / "data/interim/canonical/connectors"
SRC_OCC_STATION = AGIANG / "data/interim/occ/occ_station.parquet"
SRC_OCC_PROFILE_168 = AGIANG / "data/interim/occ/occ_profile_168.parquet"
SRC_TARIFF = AGIANG / "data/external/opex_electricity_tariff.csv"

# --- đích: ghi ------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw"
PROCESSED = ROOT / "data/processed"
LAYERS = PROCESSED / "layers"
QA = ROOT / "data/qa"

for _d in (RAW, PROCESSED, LAYERS, QA):
    _d.mkdir(parents=True, exist_ok=True)


def assert_sources() -> None:
    """Dừng sớm với thông báo rõ nếu thiếu nguồn, thay vì lỗi khó đọc giữa chừng."""
    missing = [
        str(p)
        for p in (
            SRC_VNSDI_COMMUNES,
            SRC_OSM_PBF,
            SRC_WORLDPOP_2025,
            SRC_WORLDCOVER_DIR,
            SRC_CANON_STATIONS,
        )
        if not p.exists()
    ]
    if missing:
        raise SystemExit(
            "Thiếu nguồn (chỉ đọc):\n  "
            + "\n  ".join(missing)
            + "\nĐặt EVCS_AGIANG_REPO nếu repo ở chỗ khác."
        )
