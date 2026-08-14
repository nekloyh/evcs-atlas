"""Taxonomy OSM — đường, POI đếm-cầu, POI để nhìn.

Hai bảng POI cố ý KHÁC nhau và cả hai đều đúng: một bảng đếm cầu (8 lớp, vào cột
``n_poi_*``), một bảng để vẽ (4 nhóm, giữ đa giác). Test ở đây khoá chặt sự khác nhau ấy —
gộp chúng lại sẽ đổi nghĩa các cột đếm mà lớp đầu tiên đã phát.
"""

from __future__ import annotations

import pytest

from evcs.core import osm


def test_moi_gia_tri_road_class_deu_viet_hoa_va_co_trong_ROAD_CLASSES():
    for v in osm.ROAD_CLASS.values():
        assert v == v.upper()
        assert v in osm.ROAD_CLASSES


def test_link_gop_ve_cung_cap_voi_duong_chinh():
    for base in ("motorway", "trunk", "primary", "secondary", "tertiary"):
        assert osm.ROAD_CLASS[base] == osm.ROAD_CLASS[f"{base}_link"]


def test_destination_khong_bi_coi_la_chan():
    """Trạm sạc CHÍNH LÀ điểm đến — chặn `destination` là chặn nhầm."""
    assert "destination" not in osm.ACCESS_BLOCKED
    assert "private" in osm.ACCESS_BLOCKED


@pytest.mark.parametrize(
    "tags,mong_doi",
    [
        ({"amenity": "fuel"}, "FUEL"),
        ({"amenity": "parking"}, "PARKING_OFF"),
        ({"amenity": "parking", "parking": "street_side"}, "PARKING_STREET"),
        ({"amenity": "parking", "parking": "LANE"}, "PARKING_STREET"),
        ({"shop": "mall"}, "MALL"),
        ({"shop": "department_store"}, "DEPT_STORE"),
        ({"shop": "supermarket"}, "SUPERMARKET"),
        ({"amenity": "marketplace"}, "MARKET"),
        ({"building": "apartments"}, "APARTMENT"),
        ({"residential": "apartments"}, "APARTMENT"),
        ({"amenity": "hospital"}, None),
        ({}, None),
    ],
)
def test_classify_poi(tags, mong_doi):
    assert osm.classify_poi(tags) == mong_doi


def test_moi_lop_poi_phat_ra_deu_co_trong_POI_CLASSES():
    mau = [
        {"amenity": "fuel"},
        {"amenity": "parking"},
        {"amenity": "parking", "parking": "lane"},
        {"shop": "mall"},
        {"shop": "department_store"},
        {"shop": "supermarket"},
        {"amenity": "marketplace"},
        {"building": "apartments"},
    ]
    got = {osm.classify_poi(t) for t in mau}
    assert got == set(osm.POI_CLASSES)


@pytest.mark.parametrize(
    "tags,nhom",
    [
        ({"building": "apartments"}, "apartment"),
        ({"residential": "apartments"}, "apartment"),
        ({"shop": "mall"}, "mall"),
        ({"shop": "department_store"}, "mall"),
        ({"leisure": "park"}, "public"),
        ({"leisure": "playground"}, "public"),
        ({"leisure": "garden"}, "public"),
        ({"amenity": "community_centre"}, "public"),
        ({"amenity": "hospital"}, "edu_health"),
        ({"amenity": "school"}, "edu_health"),
        ({"amenity": "university"}, "edu_health"),
        ({"amenity": "college"}, "edu_health"),
        ({"amenity": "fuel"}, None),
    ],
)
def test_classify_poi_visual(tags, nhom):
    got = osm.classify_poi_visual(tags)
    assert (got[0] if got else None) == nhom


def test_poi_visual_luon_kem_tag_khop():
    got = osm.classify_poi_visual({"leisure": "park"})
    assert got == ("public", "leisure=park")


def test_moi_nhom_visual_deu_co_trong_POI_VISUAL_GROUPS():
    mau = [{"building": "apartments"}, {"shop": "mall"}, {"leisure": "park"}, {"amenity": "school"}]
    got = {osm.classify_poi_visual(t)[0] for t in mau}
    assert got == set(osm.POI_VISUAL_GROUPS)


def test_hai_taxonomy_khong_dong_nhat():
    """Bằng chứng chúng là hai khái niệm: cây xăng có ở bảng đếm, không có ở bảng vẽ."""
    assert osm.classify_poi({"amenity": "fuel"}) == "FUEL"
    assert osm.classify_poi_visual({"amenity": "fuel"}) is None
    assert osm.classify_poi({"amenity": "school"}) is None
    assert osm.classify_poi_visual({"amenity": "school"})[0] == "edu_health"
