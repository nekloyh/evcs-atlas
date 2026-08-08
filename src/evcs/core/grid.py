"""Lưới phân tích H3 — sinh ứng viên, tỉ lệ diện tích, trạng thái ô.

Một ô thuộc bộ dữ liệu nếu đa giác ô GIAO với đa giác hành chính. Ô cắt biên KHÔNG bị bỏ và
cũng không bị tính trọn — nó mang ``area_frac`` = phần diện tích nằm trong, và mọi đại lượng
cộng dồn được chia theo tỉ lệ đó.

Mọi hàm THUẦN: vào là hình học, ra là ô và số. Không hàm nào biết "tỉnh hiện tại" — chính
cái đó là thứ khoá gói ``hanoi`` vào một tỉnh (``grid.hanoi_cells()`` là ``functools.cache``
KHÔNG tham số, tức một singleton toàn cục).
"""

from __future__ import annotations

import functools

import h3
from shapely.geometry import Polygon
from shapely.prepared import prep

from . import geo

RES = 8

# Ô có ``area_frac`` ≥ ngưỡng này coi như nằm trọn trong (INSIDE), dưới là ô biên (BORDER).
INSIDE_THRESHOLD = 0.999

# Ô chạm ranh giới bằng một mẩu nhỏ hơn ngưỡng này KHÔNG thuộc lưới báo cáo.
#
# Vì sao phải có ngưỡng: một ô r8 chỉ cần GIAO với đa giác là vào lưới, kể cả khi phần giao
# là vài trăm m². Nhưng ``road_len_*``, ``n_poi_*`` và các ``*_frac`` lớp phủ được đo trên
# TOÀN Ô — nên một ô nằm 99,99% ở tỉnh khác vẫn mang toàn bộ đường và POI của tỉnh đó vào
# bảng. Đo được ở Hà Nội: 27 ô dưới ngưỡng mang 139,9 km đường, cắt đúng ranh giới thì còn
# 0,29 km — 99,8% là đường của tỉnh khác. Giá phải trả khi bỏ: 78 người trên 8,83 triệu,
# 0 trạm sạc. Xem DECISIONS.md §2a.
MIN_AREA_FRAC = 0.01

# Bán kính ngoại tiếp lớn nhất của ô r8 ≈ 0,53 km. Nới 1 km là đủ chắc: mọi ô GIAO với đa
# giác đều có TÂM nằm trong đa giác nới 1 km, nên luật tâm-ô của h3 không thể sót ô nào.
CANDIDATE_PAD_M = 1_000

# Đơn giản hoá đa giác ĐÃ NỚI trước khi sinh ứng viên. Dung sai ~200 m ≪ mức nới 1 km, nên
# tập ứng viên vẫn là tập CHA của tập đúng. Không có bước này, chi phí ``h3shape_to_cells``
# đi theo SỐ ĐỈNH: đa giác Nghệ An hợp từ 130 xã có hàng chục nghìn đỉnh.
CANDIDATE_SIMPLIFY_DEG = 0.002


@functools.cache
def cell_polygon(cell: str) -> Polygon:
    """Đa giác ô H3, thứ tự (lon, lat)."""
    return Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(cell)])


def candidates(
    geom,
    res: int = RES,
    pad_m: float = CANDIDATE_PAD_M,
    simplify_deg: float = CANDIDATE_SIMPLIFY_DEG,
) -> list[str]:
    """Mọi ô giao với ``geom`` — phủ đầy đủ, kể cả ô chỉ chạm mép một mẩu nhỏ.

    ``h3shape_to_cells`` dùng luật tâm-ô nên tự nó bỏ sót ô cắt biên. Nới đa giác để lấy tập
    ứng viên THỪA, rồi lọc lại bằng phép giao hình học THẬT với đa giác gốc.
    """
    pad = geo.buffer_degrees(geom, pad_m)
    if simplify_deg:
        pad = pad.simplify(simplify_deg, preserve_topology=True)
    cand = set(h3.h3shape_to_cells(h3.geo_to_h3shape(geo.as_geojson(pad)), res))
    p = prep(geom)
    return sorted(c for c in cand if p.intersects(cell_polygon(c)))


def area_fractions(cells: list[str], geom) -> dict[str, float]:
    """Phần diện tích mỗi ô nằm trong ``geom``, trong [0, 1]."""
    p = prep(geom)
    out: dict[str, float] = {}
    for c in cells:
        poly = cell_polygon(c)
        if p.contains(poly):
            out[c] = 1.0
        else:
            a = poly.area
            out[c] = (poly.intersection(geom).area / a) if a > 0 else 0.0
    return out


def split_slivers(
    cells: list[str], frac: dict[str, float], min_area_frac: float = MIN_AREA_FRAC
) -> tuple[list[str], list[str]]:
    """(ô báo cáo, ô vụn bị loại). Trả cả hai vì ô vụn phải được ĐẾM, không được im lặng."""
    keep = [c for c in cells if frac[c] >= min_area_frac]
    sliver = [c for c in cells if frac[c] < min_area_frac]
    return keep, sliver


def cell_state(area_frac: float, inside_threshold: float = INSIDE_THRESHOLD) -> str:
    return "INSIDE" if area_frac >= inside_threshold else "BORDER"


def centroid(cell: str) -> tuple[float, float]:
    """(lat, lng) tâm ô."""
    return h3.cell_to_latlng(cell)


def cell_area_km2(cell: str) -> float:
    return h3.cell_area(cell, unit="km^2")


def cell_of(lat: float, lng: float, res: int = RES) -> str:
    return h3.latlng_to_cell(lat, lng, res)
