"""Chiều địa giới: MỘT niên bản, khoá ổn định, vành đệm đúng theo vĩ độ.

── NIÊN BẢN ĐÃ CHỐT ────────────────────────────────────────────────────────────────────

    VNSDI — 34 đơn vị hành chính cấp tỉnh · 3.321 đơn vị cấp xã
    hiệu lực 16/6/2025 · xuất bản 13/7/2025

Đây là cấu trúc SAU cải cách 01/7/2025: bỏ hẳn cấp huyện, còn hai cấp tỉnh → phường/xã/đặc
khu. Kiểm chứng bằng chính dữ liệu chứ không bằng trí nhớ, ba phép đếm cùng khớp:

    3.321 dòng · 34 giá trị ``matinh`` · tiền tố tên: 2.621 "Xã" + 687 "Phường" + 13 "Đặc khu"

Cấu trúc cũ (63 tỉnh, có cấp quận/huyện) KHÔNG được dùng ở bất kỳ đâu trong bộ dữ liệu này.
Nó vẫn còn sống trong MỘT chỗ và chỉ một chỗ: khoá phân mảnh ``province_code`` (mã alpha-3
kiểu ``HNO``/``BNI``) của bảng canonical trong aGiang-evcs. Xem ``crosswalk_legacy`` bên dưới.

── KHOÁ ────────────────────────────────────────────────────────────────────────────────

    province_code   2 ký tự, từ ``matinh``   ví dụ "01" = Thành phố Hà Nội
    commune_code    5 ký tự, từ ``maxa``     ví dụ "00004"

Không bảng nào được khoá bằng TÊN tiếng Việt. Tên trùng tràn lan giữa các tỉnh — đo được
trong ``n01_admin``: hàng trăm tên xã xuất hiện ở nhiều tỉnh khác nhau.

**``commune_code[:2]`` KHÔNG bằng ``province_code``** — đo được: 0,0% khớp trên 3.321 dòng.
Mã xã VNSDI đánh số chạy toàn quốc, không lồng mã tỉnh. Suy mã tỉnh từ mã xã là một lỗi im
lặng sẽ gán sai gần như toàn bộ; luôn dùng cột ``matinh`` hoặc phép điểm-trong-đa-giác.

── VÀNH ĐỆM ────────────────────────────────────────────────────────────────────────────

Giữ nguyên 5 km của bộ Hà Nội (DECISIONS §2). Nhưng hệ số quy đổi mét → độ kinh KHÔNG còn
là hằng số: gói ``hanoi`` khoá cứng ``111.320 × cos(21°)`` cho vĩ độ Hà Nội. Việt Nam trải
từ ~8,4°N tới ~23,4°N, ở đó ``cos`` đi từ 0,989 xuống 0,918 — dùng hằng số Hà Nội cho Cà Mau
làm vành đệm sai ~7%. Ở đây hệ số tính lại theo VĨ ĐỘ TÂM của chính đa giác được đệm.
"""

from __future__ import annotations

import functools

import pandas as pd
from shapely import wkb
from shapely.ops import unary_union

from evcs.core import geo

from . import paths

# Quy đổi mét ↔ độ sống ở ``evcs.core.geo``, không ở đây. Module này chỉ ĐỌC NGUỒN và dựng
# hình học của một tỉnh; nó không được sở hữu một hằng số vật lý nào.
m_per_deg_lon = geo.m_per_deg_lon
buffer_degrees = geo.buffer_degrees
area_km2 = geo.area_km2
as_geojson = geo.as_geojson

# --- niên bản ------------------------------------------------------------
VINTAGE = {
    "name": "VNSDI 2025-07 (sau cải cách 01/7/2025)",
    "source": "VNSDI qua aGiang-evcs data/interim/vnsdi/communes.parquet",
    "valid_from": "16/6/2025",
    "published": "13/07/2025",
    "levels": ["tỉnh/thành phố", "phường/xã/đặc khu"],
    "n_provinces": 34,
    "n_communes": 3321,
    "province_key": "province_code (2 ký tự, = VNSDI matinh)",
    "commune_key": "commune_code (5 ký tự, = VNSDI maxa)",
    "rejected": {
        "evcs-dataset data/ref/vn_admin/valid_from=2025-07-01": (
            "ranh giới dựng từ OSM adm6 — 3.930 đơn vị so với 3.321 chính thức (lệch 609). "
            "Chính báo cáo của nó ghi 'KHÔNG coi là danh mục HC chuẩn'. Thêm nữa nó là dẫn "
            "xuất ODbL, ràng buộc phát hành khác với dữ liệu nhà nước."
        ),
        "cấu trúc 63 tỉnh trước sáp nhập": (
            "hết hiệu lực 01/7/2025. Còn tồn tại như khoá phân mảnh của bảng canonical; "
            "xem crosswalk_legacy — và crosswalk chỉ để ĐỌC di sản, không để gán địa bàn."
        ),
    },
}

BUFFER_M = 5_000

# Cột lấy từ nguồn VNSDI. Giữ nguyên tên gốc ở tầng đọc; đổi tên ở tầng phát hành (n01).
_VNSDI_COLUMNS = [
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
]


@functools.cache
def _load() -> tuple[pd.DataFrame, list]:
    import pyarrow.parquet as pq

    t = pq.read_table(paths.SRC_VNSDI_COMMUNES, columns=_VNSDI_COLUMNS).to_pandas()
    t = t.sort_values("maxa").reset_index(drop=True)
    geoms = [wkb.loads(bytes(b)) for b in t.geom_wkb]
    return t, geoms


def communes(province_code: str | None = None) -> tuple[pd.DataFrame, list]:
    """(bảng thuộc tính, list hình học) — toàn quốc, hoặc một tỉnh nếu truyền mã."""
    t, geoms = _load()
    if province_code is None:
        return t, geoms
    m = (t.matinh == province_code).to_numpy()
    if not m.any():
        raise SystemExit(f"Không có xã/phường nào mang matinh={province_code!r} trong VNSDI.")
    return t[m].reset_index(drop=True), [g for g, k in zip(geoms, m) if k]


@functools.cache
def province_codes() -> list[str]:
    """34 mã tỉnh, sắp xếp tăng."""
    t, _ = _load()
    return sorted(t.matinh.unique().tolist())


@functools.cache
def province_names() -> dict[str, str]:
    t, _ = _load()
    return dict(t.drop_duplicates("matinh").set_index("matinh").tentinh)


@functools.cache
def boundary(province_code: str):
    """Đa giác hành chính chính thức của tỉnh — hợp của toàn bộ xã/phường trong tỉnh."""
    _, geoms = communes(province_code)
    return unary_union(geoms)


@functools.cache
def buffered(province_code: str):
    """Ranh giới tỉnh nới 5 km — phạm vi THU THẬP, không phải phạm vi BÁO CÁO.

    Ở toàn quốc vành đệm của hai tỉnh kề nhau CHỒNG LÊN NHAU. Một đối tượng nằm trong vùng
    chồng sẽ có mặt ở phân mảnh của cả hai tỉnh với ``scope='BUFFER'``, và ở đúng MỘT phân
    mảnh với ``scope='IN'``. Cộng dồn toàn quốc phải lọc ``scope='IN'``; mọi bước ghi ra
    phân mảnh đều kèm một phép kiểm cho đúng điều đó.
    """
    return buffer_degrees(boundary(province_code), BUFFER_M)


def bbox(province_code: str, buffered_aoi: bool = True):
    return (buffered(province_code) if buffered_aoi else boundary(province_code)).bounds


def scale_for(province_code: str) -> tuple[float, float]:
    """(mét trên độ vĩ, mét trên độ kinh) tại vĩ độ TÂM của tỉnh.

    Một chỗ duy nhất trả lời câu này cho cả pipeline. Trước đây nó được trả lời ở
    ``roadgraph.scale_for`` và ``n04_grid._scale`` bằng hai khối mã giống hệt nhau, mỗi khối
    tự khai lại hằng ``110_574.0``.
    """
    return geo.scale_of(boundary(province_code))


# --- chọn tỉnh -----------------------------------------------------------
def parse_selection(spec: str, exclude: str = "") -> list[str]:
    """``"01"`` · ``"01,79,48"`` · ``"all"`` → danh sách mã tỉnh hợp lệ, đã sắp xếp.

    Mã sai thì DỪNG kèm gợi ý, không im lặng bỏ qua: một lệnh chạy 34 tỉnh mà gõ nhầm một
    mã sẽ chạy 33 tỉnh và không ai biết tỉnh nào thiếu.
    """
    valid = set(province_codes())
    names = province_names()

    def _explode(s: str) -> list[str]:
        return [x.strip() for x in s.split(",") if x.strip()]

    want = province_codes() if spec.strip().lower() in {"all", "toanquoc", "*"} else _explode(spec)
    bad = [c for c in want if c not in valid]
    if bad:
        raise SystemExit(
            f"Mã tỉnh không có trong niên bản {VINTAGE['name']}: {bad}\n"
            "Mã hợp lệ:\n  " + "\n  ".join(f"{c}  {names[c]}" for c in province_codes())
        )
    drop = set(_explode(exclude))
    return [c for c in dict.fromkeys(want) if c not in drop]


# --- crosswalk sang cấu trúc cũ -----------------------------------------
def crosswalk_legacy() -> pd.DataFrame:
    """Mã tỉnh CŨ (alpha-3, 63 tỉnh) → mã tỉnh MỚI, dựng bằng ĐO chứ không bằng bảng tay.

    Bảng canonical của aGiang mang cả hai: khoá phân mảnh ``province_code`` là mã cũ, còn
    ``admin_l1_code``/``commune_code`` đã được gán lại bằng điểm-trong-đa-giác trên VNSDI
    hiện hành (kiểm được: 100% ``commune_code`` có trong VNSDI, và 100% ``admin_l1_code``
    bằng ``matinh`` của xã đó). Đếm chéo hai cột cho ra ánh xạ thật, kèm tỉ lệ.

    Bảng này để ĐỌC di sản — biết một artefact cũ dán nhãn ``HNO`` thì thuộc tỉnh mới nào.
    Nó KHÔNG phải công cụ gán địa bàn: 44/65 mã cũ toả ra nhiều hơn một mã mới, và mã ``AC``
    là một sọt rác trải trên cả 34 tỉnh. Thẩm quyền gán địa bàn luôn là phép điểm-trong-đa-giác.
    """
    import pyarrow.dataset as pads

    t = (
        pads.dataset(paths.SRC_CANON_STATIONS, format="parquet", partitioning="hive")
        .to_table(columns=["province_code", "admin_l1_code"])
        .to_pandas()
    )
    t = t[t.admin_l1_code.notna()]
    cw = t.groupby(["province_code", "admin_l1_code"]).size().reset_index(name="n_stations")
    cw["share"] = cw.n_stations / cw.groupby("province_code").n_stations.transform("sum")
    n_new = cw.groupby("province_code").admin_l1_code.transform("size")
    cw["legacy_is_ambiguous"] = n_new > 1
    cw["province_name"] = cw.admin_l1_code.map(province_names())
    cw = cw.rename(columns={"province_code": "legacy_code", "admin_l1_code": "province_code"})
    return cw.sort_values(["legacy_code", "n_stations"], ascending=[True, False]).reset_index(
        drop=True
    )
