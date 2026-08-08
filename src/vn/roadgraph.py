"""Adapter I/O cho đồ thị đường bộ: đọc phân mảnh của một tỉnh, giao cho ``evcs.core``.

Luật dựng đồ thị (lọc ``access``, cạnh có hướng, neo vào SCC đủ lớn, Dijkstra đa nguồn)
KHÔNG ở đây — chúng ở ``evcs.core.roadgraph``, thuần và test được không cần đĩa. File này
chỉ làm hai việc mà core cố ý không làm: **biết tỉnh nào** và **đọc file**.

**Đầu vào là ``road_graph.parquet``, không phải ``roads.parquet``.** File hiển thị đã đơn
giản hoá ~10 m nên số đỉnh không còn khớp ``node_ids`` và vĩnh viễn không dựng đồ thị được.
Hai lớp là hai file, và đó là một quyết định chứ không phải một sự trùng lặp.
"""

from __future__ import annotations

import pandas as pd
import pyarrow.parquet as pq

from evcs.core.osm import ACCESS_BLOCKED
from evcs.core.roadgraph import (
    MIN_SCC_NODES,
    SNAP_MAX_M,
    RoadGraph,
    multisource,
    snap,
)
from evcs.core.roadgraph import build as _build

from . import admin, paths

__all__ = [
    "ACCESS_BLOCKED",
    "MIN_SCC_NODES",
    "SNAP_MAX_M",
    "RoadGraph",
    "build",
    "load_ways",
    "multisource",
    "scale_for",
    "snap",
]


def scale_for(province_code: str) -> tuple[float, float]:
    """(mét trên độ vĩ, mét trên độ kinh) tại vĩ độ tâm tỉnh."""
    return admin.scale_for(province_code)


def load_ways(province_code: str) -> tuple[pd.DataFrame, int]:
    """Đọc phân mảnh đồ thị của tỉnh, áp bộ lọc ``access``. Trả (df, tổng trước lọc)."""
    t = pq.read_table(paths.PROV / province_code / "road_graph.parquet").to_pandas()
    n_all = len(t)
    return t[~t.access.isin(ACCESS_BLOCKED)].reset_index(drop=True), n_all


def build(province_code: str, ways: pd.DataFrame) -> RoadGraph:
    """Dựng đồ thị của tỉnh — hệ số mét/độ lấy theo vĩ độ tâm của chính tỉnh đó."""
    m_lat, m_lon = scale_for(province_code)
    return _build(ways, m_lat, m_lon)
