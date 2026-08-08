"""Hợp đồng ETL→viz, kiểm trên SẢN PHẨM THẬT của cả 34 tỉnh.

Hai cổng đã có kiểm hai đầu riêng lẻ:

* ``test_schema_grid``  — bảng trong ``store/`` khớp bản khai
* ``web/columns.test`` — danh mục trường khớp bản khai

Còn thiếu đúng khúc giữa, và đó là khúc người dùng thật đi qua: **thứ ``n11`` xuất ra web
có đúng là thứ giao diện chờ đợi không.** Bước xuất có quyền bỏ cột, đổi kiểu, giảm độ
chính xác — nên "store đúng" và "danh mục đúng" cộng lại vẫn không suy ra "web chạy".

Đây là chỗ một tỉnh mới ETL vào sẽ hiện ra là RENDER hay TRẮNG MÀN HÌNH:
``manifest.available_columns`` nói dối một cột là ``SELECT`` cột không tồn tại, DuckDB ném
lỗi, và không có gì trên màn hình nói ra chuyện đó.
"""

from __future__ import annotations

import json
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from evcs.schema import GRID

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "data" / "p"


def _tinh() -> list[Path]:
    if not WEB.exists():
        return []
    return sorted(p for p in WEB.iterdir() if (p / "manifest.json").exists())


TINH = _tinh()
pytestmark = pytest.mark.skipif(not TINH, reason="chưa có web/public/data/p/*/manifest.json")


def _manifest(pdir: Path) -> dict:
    return json.loads((pdir / "manifest.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_available_columns_dung_bang_cot_that_tren_dia(pdir: Path):
    """Manifest nói dối MỘT cột là màn hình trắng. Đây là bất biến quan trọng nhất."""
    m = _manifest(pdir)
    that = set(pq.read_schema(pdir / "grid_h3_r8.parquet").names)
    khai = set(m["available_columns"])
    assert khai == that, f"khai thừa {sorted(khai - that)} · khai thiếu {sorted(that - khai)}"


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_moi_cot_xuat_ra_deu_co_trong_ban_khai(pdir: Path):
    """Cột lạ ở bản xuất nghĩa là schema đã trôi khỏi thực tế — bắt ở đây, không ở runtime."""
    that = set(pq.read_schema(pdir / "grid_h3_r8.parquet").names)
    assert that - set(GRID.names()) == set()


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_missing_layers_chi_noi_ve_cot_co_that_trong_schema(pdir: Path):
    """Trước đây khối này khai thiếu ``road_len_in_hanoi_m`` ở CẢ 34 tỉnh — một cột chỉ có
    nghĩa ở Hà Nội. Giao diện được báo là thiếu một lớp không hề tồn tại."""
    thieu = set(_manifest(pdir)["missing_layers"]["columns"])
    assert thieu - set(GRID.names()) == set()


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_moi_file_manifest_khai_deu_co_that(pdir: Path):
    """`files` là thứ giao diện dùng để quyết định lớp nào bật được."""
    m = _manifest(pdir)
    vang = [f for f in m.get("files", {}) if not (pdir / f).exists()]
    assert vang == []


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_unusable_layers_khai_dung_hinh_dang(pdir: Path):
    for x in _manifest(pdir).get("unusable_layers", []):
        assert "layer" in x and x["layer"]
        # Lớp bị tắt phải nói LÝ DO: "tắt mà không nói vì sao" đọc như "không có dữ liệu".
        assert any(k in x for k in ("reason", "ly_do", "detail")), x


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_bbox_cua_tinh_nam_trong_lanh_tho_viet_nam(pdir: Path):
    """Khung nhìn ban đầu đọc từ đây. bbox sai là mở tỉnh nào cũng bay ra biển.

    Cận dưới là **6,9°N / 117,9°E**, không phải cận của phần đất liền: Khánh Hoà mang cả
    Trường Sa, nên bbox của nó rộng 11° kinh và chạm 6,93°N. Đây là dữ liệu ĐÚNG — và nó
    cũng là lý do khung nhìn mặc định fit theo DÂN chứ không theo lãnh thổ
    (``QUYET_DINH_TOAN_QUOC.md`` §11): fit theo bbox thì mở Khánh Hoà ra là thấy Biển Đông.
    """
    p = _manifest(pdir).get("province")
    assert p, "manifest thiếu khối province ⇒ khung nhìn rơi về mặc định Hà Nội"
    lo, la, hi_lo, hi_la = p["bbox"]
    assert 102 < lo < hi_lo < 118, p["bbox"]
    assert 6.5 < la < hi_la < 24, p["bbox"]


def test_34_tinh_cung_mot_bo_cot_xuat_ra():
    """Một schema duy nhất giữa 34 phân mảnh — điều kiện để giao diện dùng lại được."""
    bo = {tuple(pq.read_schema(p / "grid_h3_r8.parquet").names) for p in TINH}
    assert len(bo) == 1, f"{len(bo)} bộ cột khác nhau giữa các tỉnh"


def test_cot_national_deu_co_mat_o_moi_tinh():
    """Màn hình CẢ NƯỚC gộp từ 34 phân mảnh — thiếu một cột ở một tỉnh là gộp ra sai."""
    can = {c.name for c in GRID.where(national=True)}
    for p in TINH:
        co = set(pq.read_schema(p / "grid_h3_r8.parquet").names)
        assert can - co == set(), f"{p.name} thiếu {sorted(can - co)}"


def test_lop_gop_toan_quoc_khong_cho_dai_luong_khong_gop_duoc():
    """Lớp r6 chỉ được chở SỐ ĐO và PHÉP CHIA CỦA HAI SỐ ĐO — không lớp tính toán nào.

    Ba thứ tuyệt đối không được lên bậc r6, và mỗi thứ vì một lý do khác nhau:

    * **khoảng cách** — khoảng cách tới trạm gần nhất của một vùng KHÔNG phải trung bình
      khoảng cách của các ô trong nó. Không có trọng số nào làm phép ấy đúng.
    * **tỉ số đi vòng** — cùng lý do, cộng thêm mẫu số khác nhau ở từng ô.
    * **quyết định của rule** — ``screen_decision`` là đầu ra của một rule chạy trên NGƯỠNG
      của xã. Gộp nó lên 36 km² là bịa ra một quyết định chưa ai ký.

    ``lat``/``lng``/``province_code`` CÓ mặt và đó là đúng: chúng là danh tính của chính ô
    r6, không phải giá trị gộp từ r8. ``pop_density_ppkm2`` cũng vậy — nó được TÍNH LẠI sau
    khi gộp (dân chia diện tích), không phải trung bình của các tỉ số con.
    """
    vn = ROOT / "web/public/data/vn/grid_h3_r6.parquet"
    if not vn.exists():
        pytest.skip("chưa dựng lớp toàn quốc")
    co = set(pq.read_schema(vn).names)

    cam = {
        c.name
        for c in GRID.columns
        if c.agg == "none" and c.role == "measure" and c.layer in ("distance", "screening")
    }
    assert cam, "không có cột nào để cấm — luật này đã trôi khỏi schema"
    assert co & cam == set(), f"chở lớp tính toán lên bậc r6: {sorted(co & cam)}"

    # Và nó PHẢI chở đủ các cột đã khai là `national`.
    can = {c.name for c in GRID.where(national=True)}
    assert can - co == set(), f"thiếu cột national: {sorted(can - co)}"


# ── bảng XÃ: manifest phải khai đúng thuộc tính có thật ───────────────────
from evcs.schema import COMMUNE  # noqa: E402


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_available_commune_columns_dung_bang_ban_khai(pdir: Path):
    """Giao diện lọc trường của XÃ theo danh sách này — nhánh riêng, không dùng cột lưới.

    Trước đây nó suy từ ``sorted(feats[0]["properties"].keys())``: một xã có `quality_flag`
    null ở dòng đầu vẫn khai đủ cột (vì GeoJSON giữ khoá null), nhưng hợp đồng dựa vào
    "dòng đầu tiên tình cờ có mặt" là hợp đồng không kiểm được.
    """
    khai = set(_manifest(pdir)["available_commune_columns"])
    assert khai == set(COMMUNE.names())


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_commune_geojson_khong_mang_thuoc_tinh_la(pdir: Path):
    f = pdir / "commune.geojson"
    if not f.exists():
        pytest.skip("tỉnh chưa có commune.geojson")
    fc = json.loads(f.read_text(encoding="utf-8"))
    feats = fc.get("features") or []
    if not feats:
        pytest.skip("không có xã nào")
    la = set(feats[0]["properties"]) - set(COMMUNE.names())
    assert la == set(), f"thuộc tính chưa khai: {sorted(la)}"


# ── lớp trạm biến áp: hàng rào phạm vi kiểm bằng MÁY ─────────────────────
@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_substations_khong_mang_cot_cong_suat_hay_dien_ap(pdir: Path):
    """Đây là chỗ DECISIONS §8 có thể bị đảo ngược bằng một dòng ba từ.

    Ở toàn quốc cám dỗ lớn hơn hẳn Hà Nội: đo được 972/1.387 đối tượng CÓ tag `voltage`
    và 733/1.387 có `substation=*`. Hàng rào phải có một phép kiểm chạy, không phải một câu.
    """
    f = ROOT / "store" / "p" / pdir.name / "substations.parquet"
    if not f.exists():
        pytest.skip("tỉnh chưa có lớp trạm biến áp")
    co = {c.lower() for c in pq.read_schema(f).names}
    cam = {"voltage", "substation", "capacity", "power", "rating", "kva", "dist_substation_m"}
    assert co & cam == set(), f"cột phạm phạm vi: {sorted(co & cam)}"
    assert co == {"osm_type", "osm_id", "name", "lat", "lng", "province_code", "scope"}


def test_substations_tinh_01_khop_bo_ha_noi():
    """Đối chứng mạnh nhất của bản port: cùng nguồn, hai đường mã, cùng con số.

    132 dòng = 98 IN + 34 BUFFER, và cả bốn số đếm của manifest trùng khít.
    """
    a = ROOT / "data" / "raw" / "osm_hanoi_substations.parquet"
    b = ROOT / "store" / "p" / "01" / "substations.parquet"
    if not (a.exists() and b.exists()):
        pytest.skip("thiếu một trong hai bộ")
    ha_noi = pq.read_table(a).to_pandas()
    tinh01 = pq.read_table(b).to_pandas()
    assert len(tinh01) == len(ha_noi)
    assert set(zip(tinh01.osm_type, tinh01.osm_id)) == set(zip(ha_noi.osm_type, ha_noi.osm_id))
    assert int((tinh01.scope == "IN").sum()) + int((tinh01.scope == "BUFFER").sum()) == len(ha_noi)


# ── B4: cặp tuyến + nhãn đường theo đoạn ─────────────────────────────────
@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_roads_co_nhan_dist_station_m(pdir: Path):
    """Cột này vắng ở cả 34 tỉnh cho tới B4, và `road:dist_station_m` chọn được trong rail
    ⇒ SELECT cột không tồn tại ⇒ Binder Error ⇒ màn hình trắng."""
    co = set(pq.read_schema(pdir / "roads.parquet").names)
    assert "dist_station_m" in co
    assert set(_manifest(pdir)["available_road_columns"]) == co


@pytest.mark.parametrize("pdir", TINH, ids=lambda p: p.name)
def test_hai_khoa_manifest_roads_ma_cot_canh_doc(pdir: Path):
    """`story/bodies.tsx` đọc đúng hai khoá này. Thiếu chúng là `formatNumber(undefined)`."""
    roads = _manifest(pdir)["roads"]
    for k in ("bridge_ways_shipped", "ways_unreachable_null_dist"):
        assert k in roads and isinstance(roads[k], int), k


def test_cap_tuyen_chi_dung_cho_tinh_da_khai():
    """Một hằng, một chỗ. Dựng cho tỉnh không khai là chở trọng lượng không ai đọc; thiếu ở
    tỉnh đã khai là cảnh mở ra mà nửa trống."""
    from vn.n14_showcase import FILE, SHOWCASE_PROVINCES

    for p in TINH:
        co = (p / FILE).exists()
        assert co == (p.name in SHOWCASE_PROVINCES), f"{p.name}: có file={co}"


def test_cap_tuyen_du_ba_bac_va_moi_o_hai_tuyen():
    from vn.n14_showcase import FILE, SHOWCASE_POP_TIERS, SHOWCASE_PROVINCES

    for code in SHOWCASE_PROVINCES:
        f = WEB / code / FILE
        if not f.exists():
            pytest.skip(f"tỉnh {code} chưa xuất")
        feats = json.loads(f.read_text(encoding="utf-8"))["features"]
        o = {x["properties"]["h3_r8"] for x in feats}
        assert len(o) == len(SHOWCASE_POP_TIERS)
        assert len(feats) == 2 * len(o), "mỗi ô đúng hai tuyến: mạng đường và chim bay"
        assert {x["properties"]["kind"] for x in feats} == {"network", "euclid"}


def test_tuyen_mang_duong_luon_DAI_HON_doan_chim_bay():
    """Bất biến vật lý, và là cả luận điểm của cảnh C: đường đi thật không bao giờ ngắn hơn
    chim bay. Một cặp vi phạm nghĩa là tuyến dựng sai, không phải dữ liệu lạ."""
    from vn.n14_showcase import FILE, SHOWCASE_PROVINCES

    for code in SHOWCASE_PROVINCES:
        f = WEB / code / FILE
        if not f.exists():
            pytest.skip(f"tỉnh {code} chưa xuất")
        for x in json.loads(f.read_text(encoding="utf-8"))["features"]:
            p = x["properties"]
            assert p["dist_station_network_m"] >= p["dist_station_euclid_m"], p["h3_r8"]
            assert p["detour_ratio"] >= 1.0, p["h3_r8"]
