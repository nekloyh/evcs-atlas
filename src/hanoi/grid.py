"""Lưới phân tích H3 độ phân giải 8 (~0,74 km²/ô).

Một ô thuộc bộ dữ liệu nếu đa giác ô GIAO với đa giác hành chính chính thức. Ô cắt biên
KHÔNG bị bỏ và cũng không bị tính trọn — nó mang ``area_frac`` = phần diện tích nằm trong
Hà Nội, và mọi đại lượng cộng dồn (dân số, chiều dài đường) được chia theo tỉ lệ đó.

Cách này thay cho luật "tâm ô nằm trong tỉnh" của repo cũ: ở quy mô một thành phố, tỉ lệ
chu vi/diện tích cao nên ô biên chiếm phần đáng kể, làm tròn 0/1 gây lệch có hệ thống dọc
biên — đúng chỗ sông Hồng và các trục vành đai đi qua.
"""

from __future__ import annotations

import functools

import h3
from shapely.geometry import Polygon
from shapely.prepared import prep

from . import aoi

RES = 8
INSIDE_THRESHOLD = 0.999

# Ô chạm ranh giới bằng một mẩu nhỏ hơn ngưỡng này KHÔNG thuộc lưới báo cáo.
#
# Vì sao phải có ngưỡng: một ô r8 chỉ cần GIAO với đa giác Hà Nội là vào lưới, kể cả khi
# phần giao là một mẩu vài trăm m². Nhưng `road_len_*`, `n_poi_*` và các `*_frac` lớp phủ
# được đo trên TOÀN Ô — nên một ô nằm 99,99% ở tỉnh khác vẫn mang theo toàn bộ đường và POI
# của tỉnh đó vào bảng Hà Nội. Đo được: 27 ô dưới ngưỡng này mang 139,9 km đường, mà cắt
# đúng theo ranh giới thì chỉ còn 0,29 km — tức 99,8% là đường của tỉnh khác.
#
# Chúng không phải "ô biên", chúng là HIỆN VẬT HÌNH HỌC. Giá phải trả khi bỏ: 78 người trên
# 8,83 triệu (0,0009%), 0 trạm sạc. Xem DECISIONS.md §2a.
MIN_AREA_FRAC = 0.01


@functools.cache
def cell_polygon(cell: str) -> Polygon:
    """Đa giác ô H3, thứ tự (lon, lat)."""
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


# Bán kính ngoại tiếp lớn nhất của ô r8 ≈ 0,53 km. Nới 1 km là đủ chắc: mọi ô GIAO với đa
# giác đều có TÂM nằm trong đa giác nới 1 km, nên luật tâm-ô của h3 không thể sót ô nào.
_CANDIDATE_PAD_M = 1_000


def _cells_covering(geom) -> list[str]:
    """Mọi ô r8 giao với ``geom`` (phủ đầy đủ, kể cả ô chỉ chạm mép một mẩu nhỏ).

    ``h3shape_to_cells`` dùng luật tâm-ô nên tự nó bỏ sót ô cắt biên. Nới đa giác 1 km để
    lấy tập ứng viên thừa, rồi lọc lại bằng phép giao hình học THẬT với đa giác gốc.
    """
    pad = aoi.buffer_degrees(geom, _CANDIDATE_PAD_M)
    cand = set(h3.h3shape_to_cells(h3.geo_to_h3shape(aoi.as_geojson(pad)), RES))
    p = prep(geom)
    return sorted(c for c in cand if p.intersects(cell_polygon(c)))


@functools.cache
def _hanoi_candidates() -> list[str]:
    """Mọi ô r8 GIAO với ranh giới Hà Nội, chưa lọc mẩu vụn."""
    return _cells_covering(aoi.boundary())


@functools.cache
def hanoi_cells() -> list[str]:
    """Ô r8 thuộc lưới BÁO CÁO: giao ranh giới Hà Nội và ``area_frac`` ≥ ``MIN_AREA_FRAC``."""
    cand = _hanoi_candidates()
    frac = area_fractions(cand)
    return [c for c in cand if frac[c] >= MIN_AREA_FRAC]


@functools.cache
def sliver_cells() -> list[str]:
    """Ô bị loại vì quá vụn. Giữ hàm này để QA đếm và báo cáo được, không để im lặng."""
    cand = _hanoi_candidates()
    frac = area_fractions(cand)
    return [c for c in cand if frac[c] < MIN_AREA_FRAC]


@functools.cache
def buffered_cells() -> list[str]:
    """Ô r8 giao với ranh giới nới 5 km — tập ô THU THẬP, không báo cáo."""
    return _cells_covering(aoi.buffered())


def area_fractions(cells: list[str], geom=None) -> dict[str, float]:
    """Phần diện tích mỗi ô nằm trong ``geom`` (mặc định: ranh giới Hà Nội)."""
    geom = aoi.boundary() if geom is None else geom
    p = prep(geom)
    out = {}
    for c in cells:
        poly = cell_polygon(c)
        if p.contains(poly):
            out[c] = 1.0
        else:
            a = poly.area
            out[c] = (poly.intersection(geom).area / a) if a > 0 else 0.0
    return out


def centroid(cell: str) -> tuple[float, float]:
    """(lat, lng) tâm ô."""
    return h3.cell_to_latlng(cell)


def cell_area_km2(cell: str) -> float:
    return h3.cell_area(cell, unit="km^2")


def cell_of(lat: float, lng: float) -> str:
    return h3.latlng_to_cell(lat, lng, RES)
