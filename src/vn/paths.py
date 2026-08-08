"""Đường dẫn nguồn (CHỈ ĐỌC) và đích (ghi) cho bộ dữ liệu toàn quốc.

Ba repo cũ chỉ được ĐỌC. Không hàm nào trong gói này ghi vào chúng.

KHÔNG cào lại gì cả. Mọi nguồn ở đây là ảnh chụp đã đóng băng trong hai repo trước:
mở rộng phạm vi từ một tỉnh ra 34 tỉnh KHÔNG làm tăng một request nào tới evcs.vn, vì
bảng canonical đã là bảng TOÀN QUỐC ngay từ đầu — bộ dữ liệu Hà Nội chỉ lọc một phần của
nó ra. Xem ``docs/adr/0005-hai-tier-store.md``.
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

# Nguồn PHỤ, chỉ dùng để ĐỐI CHIẾU độ phủ nhà vận hành — không gộp vào bảng chính.
# Lý do không gộp: hai ảnh chụp khác ngày và hai dòng dõi khử-trùng-lặp khác nhau, không
# có khoá vật lý chung; gộp là mời trùng lặp im lặng vào bảng cung. Xem QUYET_DINH §5.
SRC_SECONDARY_STATIONS = (
    DATASET / "data/30_gold/stations/country=VN/snapshot_date=2026-07-20/part.parquet"
)

# --- đích: ghi ------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]
STORE = Path(os.environ.get("EVCS_STORE", ROOT / "store"))
ADMIN = STORE / "admin"
PROV = STORE / "p"  # store/p/<province_code>/…  — SẢN PHẨM
# store/cache/<province_code>/… — DỰNG LẠI ĐƯỢC, không ship, không backup.
# `road_graph.parquet` một mình chiếm 626/714 MB của store. Nó cần cho Dijkstra và giữ lại
# là có chủ ý (chạy lại Dijkstra không phải quét lại PBF 325 MB), nhưng nó phải nằm ở một
# tier CÓ TÊN, để "xoá cache" là một lệnh chứ không phải một cuộc rà soát bằng mắt.
CACHE = STORE / "cache"
QA = STORE / "qa"
STATE_FILE = STORE / "_state.json"


def province_dir(code: str) -> Path:
    d = PROV / code
    d.mkdir(parents=True, exist_ok=True)
    return d


def cache_dir(code: str) -> Path:
    d = CACHE / code
    d.mkdir(parents=True, exist_ok=True)
    return d


def ensure_dirs() -> None:
    for d in (STORE, ADMIN, ADMIN / "boundary", PROV, CACHE, QA):
        d.mkdir(parents=True, exist_ok=True)


REQUIRED = (
    SRC_VNSDI_COMMUNES,
    SRC_OSM_PBF,
    SRC_WORLDPOP_2025,
    SRC_WORLDCOVER_DIR,
    SRC_CANON_STATIONS,
    SRC_CANON_CONNECTORS,
    SRC_OCC_STATION,
    SRC_OCC_PROFILE_168,
)


def assert_sources(*extra: Path) -> None:
    """Dừng sớm với thông báo rõ nếu thiếu nguồn, thay vì lỗi khó đọc giữa chừng."""
    missing = [str(p) for p in (*REQUIRED, *extra) if not p.exists()]
    if missing:
        raise SystemExit(
            "Thiếu nguồn (chỉ đọc):\n  "
            + "\n  ".join(missing)
            + "\nĐặt EVCS_AGIANG_REPO / EVCS_DATASET_REPO nếu repo ở chỗ khác."
        )
