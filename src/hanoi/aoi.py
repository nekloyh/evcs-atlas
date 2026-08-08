"""Vùng nghiên cứu (AOI) Hà Nội.

Hai khái niệm KHÁC NHAU, không được lẫn:

* ``boundary``  — đa giác hành chính CHÍNH THỨC của Hà Nội (VNSDI, hợp từ 126 xã/phường).
  Đây là phạm vi BÁO CÁO: một ô chỉ thuộc bộ dữ liệu nếu tâm ô nằm trong đa giác này.
* ``buffer``    — đa giác trên nới ra 5 km. Đây là phạm vi THU THẬP cho các phép tính không
  gian có tầm với (trạm phục vụ ô sát biên, đường đi vòng qua ngoài tỉnh, trạm biến áp gần
  nhất). Không có đối tượng nào trong vành đệm được báo cáo như "thuộc Hà Nội".

5 km chọn theo bán kính phục vụ R = 3.000 m của tầng chấm điểm nhân hệ số đi vòng đường bộ
~1,4 (3.000 × 1,4 = 4.200 m) rồi làm tròn lên. Xem DECISIONS.md §2.
"""

from __future__ import annotations

import functools

from shapely import wkb
from shapely.geometry import shape
from shapely.ops import unary_union

BUFFER_M = 5_000
HANOI_MATINH = "01"  # mã tỉnh VNSDI của Thành phố Hà Nội

# ~ chuyển mét sang độ ở vĩ độ Hà Nội (21°N). 1° vĩ ≈ 110.574 m; 1° kinh ≈ 111.320·cos(21°).
_M_PER_DEG_LAT = 110_574.0
_M_PER_DEG_LON = 103_940.0  # 111_320 * cos(21°)


@functools.cache
def _load():
    import pyarrow.parquet as pq

    from . import paths

    t = pq.read_table(
        paths.SRC_VNSDI_COMMUNES,
        columns=[
            "maxa",
            "tenxa",
            "matinh",
            "tentinh",
            "dientich_km2",
            "danso",
            "ngayhieuluc",
            "ngayxuatban",
            "geom_wkb",
            "geom_valid",
        ],
    ).to_pandas()
    hn = t[t.matinh == HANOI_MATINH].reset_index(drop=True)
    if len(hn) == 0:
        raise SystemExit("Không tìm thấy xã/phường nào có matinh='01' trong nguồn VNSDI.")
    geoms = [wkb.loads(bytes(b)) for b in hn.geom_wkb]
    return hn, geoms


def communes():
    """(DataFrame thuộc tính, list[shapely geometry]) của 126 xã/phường Hà Nội."""
    return _load()


@functools.cache
def boundary():
    """Đa giác hành chính chính thức Hà Nội — hợp của toàn bộ xã/phường."""
    _, geoms = _load()
    return unary_union(geoms)


def buffer_degrees(geom, metres: float):
    """Nới ``geom`` ra ``metres`` trong hệ toạ độ độ.

    Một độ kinh ngắn hơn một độ vĩ ở vĩ độ Hà Nội, nên ``buffer`` thẳng trong hệ độ sẽ tạo
    vành lệch. Kéo giãn trục x trước, đệm tròn, rồi co lại — cho vành gần đúng đẳng hướng
    theo mét (sai số < 0,5% trong phạm vi một thành phố).
    """
    from shapely import affinity

    dy = metres / _M_PER_DEG_LAT
    dx = metres / _M_PER_DEG_LON
    scaled = affinity.scale(geom, xfact=dy / dx, yfact=1.0, origin=(0, 0))
    return affinity.scale(scaled.buffer(dy, quad_segs=8), xfact=dx / dy, yfact=1.0, origin=(0, 0))


@functools.cache
def buffered():
    """``boundary`` nới 5 km, dùng cho thu thập không gian (KHÔNG dùng để báo cáo)."""
    return buffer_degrees(boundary(), BUFFER_M)


def bbox(buffered_aoi: bool = True):
    """(min_lon, min_lat, max_lon, max_lat)."""
    return (buffered() if buffered_aoi else boundary()).bounds


def as_geojson(geom) -> dict:
    from shapely.geometry import mapping

    return mapping(geom)


__all__ = [
    "BUFFER_M",
    "HANOI_MATINH",
    "boundary",
    "buffered",
    "buffer_degrees",
    "bbox",
    "communes",
    "as_geojson",
    "shape",
]
