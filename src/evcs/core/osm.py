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


# ── TRẠM BIẾN ÁP ──────────────────────────────────────────────────────────────
#
# **Ranh giới phạm vi, đọc trước khi sửa** (``DECISIONS.md`` §8 sửa đổi):
# ``dist_substation_m`` đã bị bỏ và KHÔNG quay lại. Khả năng đấu nối lưới — kVA khả dụng,
# công suất trạm biến áp — nằm ngoài phạm vi bài toán. Lớp này chỉ xuất **vị trí**, và một
# trạm biến áp trên bản đồ chỉ nói đúng một điều: *"ở đây có một trạm biến áp trong OSM"*.
#
# Vì sao vẫn đáng trích dù trường phái sinh đã bị loại: **n nhỏ giết một TRƯỜNG, không giết
# một LỚP**. Một trường khoảng cách dựng trên mẫu thưa là bịa ra khác biệt giữa các ô (A12
# đo: một trạm biến áp làm láng giềng gần nhất cho tới 236 ô); một lớp điểm chỉ khẳng định
# đúng những điểm nó vẽ.


def is_substation(tags) -> bool:
    """``power=substation`` và chỉ thế.

    Ba thứ cố tình KHÔNG lấy, mỗi thứ một lý do:

    * ``power=transformer`` / ``pole`` / ``portal`` / ``minor_line`` — thiết bị trên cột,
      không phải trạm. Giữ nguyên phạm vi để con số so được với mũi phản biện A12.
    * ``substation=transmission|distribution|traction`` — phân hạng theo cấp điện áp. Đọc
      nó là mã hoá **công suất lưới điện**, thứ đã bị loại khỏi phạm vi. Một trạm biến áp ở
      đây không có hạng: nó chỉ có mặt.
    * ``building=transformer_tower`` — nhãn kiến trúc, không phải nhãn hạ tầng điện.

    Cám dỗ này LỚN HƠN ở quy mô toàn quốc, và con số nói ra điều đó: đo trên PBF đã đóng
    băng, **972/1.387** đối tượng CÓ tag ``voltage`` và **733/1.387** có ``substation=*``.
    Ở Hà Nội đó là vài chục dòng; ở toàn quốc nó là một cột phân hạng gần như đầy, nằm sẵn
    trong nguồn, chỉ chờ một lệnh ``.get()``.
    """
    return tags.get("power") == "substation"


# Self-test của luật phân loại — chạy MỖI lần bước trích chạy, nổ to nếu luật gãy.
# Ba case đầu khẳng định điều quan trọng nhất: phân hạng CÓ MẶT vẫn không đổi kết quả.
SUBSTATION_CASES: tuple[tuple[dict, bool], ...] = (
    ({"power": "substation"}, True),
    ({"power": "substation", "substation": "transmission"}, True),
    ({"power": "substation", "substation": "minor_distribution"}, True),
    ({"power": "substation", "voltage": "110000"}, True),
    ({"power": "transformer"}, False),
    ({"power": "pole"}, False),
    ({"power": "portal"}, False),
    ({"power": "minor_line"}, False),
    ({"power": "line"}, False),
    ({"power": "generator"}, False),
    ({"building": "transformer_tower"}, False),
    ({"substation": "distribution"}, False),
    ({"railway": "substation"}, False),
    ({"building": "yes"}, False),
    ({}, False),
)


def selftest_is_substation() -> None:
    for tags, want in SUBSTATION_CASES:
        got = is_substation(tags)
        assert got == want, f"is_substation({tags}) = {got}, muốn {want}"
