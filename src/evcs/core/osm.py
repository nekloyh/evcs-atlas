"""Phân lớp đối tượng OSM: đường, POI đếm-cầu, POI để nhìn.

Ba taxonomy, ba mục đích khác nhau, cố ý không gộp:

* ``ROAD_CLASS``          — cấp đường, dùng cho ``road_len_*`` và trọng số hiển thị
* ``classify_poi``        — POI ĐẾM CẦU, 8 lớp, vào cột ``n_poi_*`` của lưới
* ``classify_poi_visual`` — POI ĐỂ NHÌN, 4 nhóm, giữ đa giác, chỉ để vẽ

Gộp hai bảng POI vào một lượt đọc sẽ đổi nghĩa các cột đếm mà lớp đầu tiên đã phát — xem
ghi chú ở ``Makefile``.
"""

from __future__ import annotations

ROAD_CLASS = {
    "motorway": "MOTORWAY",
    "motorway_link": "MOTORWAY",
    "trunk": "TRUNK",
    "trunk_link": "TRUNK",
    "primary": "PRIMARY",
    "primary_link": "PRIMARY",
    "secondary": "SECONDARY",
    "secondary_link": "SECONDARY",
    "tertiary": "TERTIARY",
    "tertiary_link": "TERTIARY",
    "unclassified": "LOCAL",
    "residential": "LOCAL",
    "living_street": "LOCAL",
    "road": "LOCAL",
    "service": "SERVICE",
}

ROAD_CLASSES = sorted(set(ROAD_CLASS.values()))

# Thẻ ``access`` coi là CHẶN xe công chúng. ``destination`` KHÔNG nằm đây: nó nghĩa là được
# vào nếu điểm đến nằm trong — mà trạm sạc chính là điểm đến.
ACCESS_BLOCKED = {"private", "no", "customers", "residents", "delivery", "permit"}

POI_CLASSES = [
    "FUEL",
    "PARKING_OFF",
    "PARKING_STREET",
    "MALL",
    "DEPT_STORE",
    "SUPERMARKET",
    "MARKET",
    "APARTMENT",
]


def classify_poi(tags) -> str | None:
    """Phân lớp POI đếm-cầu theo cùng taxonomy repo cũ, để hai bộ số so sánh được."""
    amenity = tags.get("amenity")
    shop = tags.get("shop")
    building = tags.get("building")
    if amenity == "fuel":
        return "FUEL"
    if amenity == "parking":
        kind = (tags.get("parking") or "").lower()
        return "PARKING_STREET" if kind in {"street_side", "lane", "on_street"} else "PARKING_OFF"
    if shop == "mall":
        return "MALL"
    if shop == "department_store":
        return "DEPT_STORE"
    if shop == "supermarket":
        return "SUPERMARKET"
    if amenity == "marketplace":
        return "MARKET"
    if building == "apartments" or tags.get("residential") == "apartments":
        return "APARTMENT"
    return None


POI_VISUAL_GROUPS = ("apartment", "mall", "public", "edu_health")


def classify_poi_visual(tags) -> tuple[str, str] | None:
    """(nhóm, tag khớp) của một đối tượng OSM, hoặc None.

    Hàm THUẦN trên một dict-like — nhiều nhánh, sai sẽ âm thầm, nên có self-test đi kèm.
    """
    building = tags.get("building")
    if building == "apartments" or tags.get("residential") == "apartments":
        key = "building" if building == "apartments" else "residential"
        return "apartment", f"{key}=apartments"

    shop = tags.get("shop")
    if shop in ("mall", "department_store"):
        return "mall", f"shop={shop}"

    leisure = tags.get("leisure")
    if leisure in ("park", "playground", "garden"):
        return "public", f"leisure={leisure}"
    amenity = tags.get("amenity")
    if amenity == "community_centre":
        return "public", "amenity=community_centre"

    if amenity in ("hospital", "school", "university", "college"):
        return "edu_health", f"amenity={amenity}"
    return None
