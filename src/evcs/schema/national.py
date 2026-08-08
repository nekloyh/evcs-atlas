"""Ô gộp H3 r6 (~36 km²) — đơn vị đọc THỨ BA, và nó được **SUY RA**, không khai lại.

Đây là khác biệt đáng nói so với ``GRID`` và ``COMMUNE``: hai bảng kia được khai từng cột
một, còn bảng này dựng bằng một luật:

    danh tính của ô r6  +  mọi cột ``national=True`` của GRID  +  một tỉ số tính lại

Vì sao suy chứ không khai: câu "lớp cả nước chở đúng những cột đã đánh dấu là cả-nước" phải
đúng **theo cấu trúc**, không phải theo kỷ luật. Khai lại 30 cột ở đây là dựng lại đúng cái
bệnh mà module này sinh ra để chữa — ``n12_national`` từng gõ tay 40 tên cột rồi truyền
thẳng vào ``pq.read_table(columns=…)``, nên đổi tên một cột ở ``n09`` là bước đó NỔ.

── HAI THỨ Ở ĐÂY KHÔNG PHẢI GIÁ TRỊ GỘP ────────────────────────────────────────────────

``lat``/``lng``/``area_km2`` là của chính ô r6, không phải trung bình của các ô r8 con.
``pop_density_ppkm2`` được **tính lại sau khi gộp** (dân chia diện tích), không phải trung
bình của các tỉ số con — trung bình của tỉ số không phải tỉ số của trung bình.

── HẠ ĐỘ CHÍNH XÁC LÀ CÓ CHỦ Ý ─────────────────────────────────────────────────────────

Mọi cột số ở đây là 32-bit, trong khi ở ``GRID`` chúng là 64-bit. Màn hình cả nước có ngân
sách tải đã đo và đã chốt (0,52 MB lần đầu). Ghi việc hạ ấy vào bản khai để nó là một
QUYẾT ĐỊNH đọc được, chứ không phải một mất mát ai đó phát hiện ra sau.
"""

from __future__ import annotations

from dataclasses import replace

from .column import DOWNCAST, Column, Table
from .grid import GRID


def _ha(c: Column) -> Column:
    """Cùng một cột, hạ xuống 32-bit và bỏ nhãn ``national`` (ở đây thì mọi cột đều thế)."""
    return replace(c, dtype=DOWNCAST.get(c.dtype, c.dtype), national=False)


# Danh tính của ô gộp — không cột nào trong đây là giá trị gộp từ r8.
_DINH_DANH = (
    Column("h3_r6", "str", "national", role="key", desc="Mã ô H3 r6, ~36 km²"),
    Column(
        "province_code",
        "str",
        "national",
        role="identity",
        desc="Tỉnh CHỦ của ô — tỉnh chiếm nhiều ô r8 nhất trong ô gộp này",
    ),
    Column(
        "n_provinces",
        "i32",
        "national",
        role="identity",
        unit="tỉnh",
        desc="Số tỉnh mà ô gộp chạm vào. Lớn hơn 1 nghĩa là ô nằm vắt qua biên.",
    ),
    Column(
        "n_cells_r8",
        "i32",
        "national",
        role="identity",
        unit="ô",
        desc="Số ô r8 gộp vào — MẪU SỐ của mọi tỉ số ở bậc này, và nó KHÔNG đều giữa các ô",
    ),
    Column("lat", "f32", "national", role="identity", unit="độ", desc="Vĩ độ tâm ô gộp"),
    Column("lng", "f32", "national", role="identity", unit="độ", desc="Kinh độ tâm ô gộp"),
    Column(
        "area_km2",
        "f32",
        "national",
        role="identity",
        unit="km²",
        desc="Diện tích phần ô gộp nằm trong lãnh thổ đã dựng — không phải 36 km² tròn",
    ),
)

# Tỉ số TÍNH LẠI sau khi gộp. Nó đứng cuối vì nó phụ thuộc các cột trên.
_DAN_XUAT = (
    Column(
        "pop_density_ppkm2",
        "f32",
        "national",
        unit="người/km²",
        desc=(
            "`population` gộp chia `area_km2` gộp. TÍNH LẠI, không phải trung bình của các "
            "tỉ số con — trung bình của tỉ số không phải tỉ số của trung bình."
        ),
    ),
)

NATIONAL_R6 = Table(
    name="grid_h3_r6",
    key="h3_r6",
    desc="Lưới gộp toàn quốc cho màn hình CẢ NƯỚC XEM MỘT LẦN",
    columns=(
        *_DINH_DANH,
        *(_ha(c) for c in GRID.where(agg="sum", national=True)),
        *(_ha(c) for c in GRID.where(agg="area_mean", national=True)),
        *_DAN_XUAT,
    ),
)
