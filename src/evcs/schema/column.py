"""Kiểu ``Column`` và ``Table`` — hợp đồng giữa tầng ETL và tầng nhìn.

Trước file này, schema của bảng chính là **sản phẩm phụ của một chuỗi left-join**: nó là
bất cứ thứ gì 5 bước thượng nguồn tình cờ ghi ra. Không đối tượng nào khai nó, và bốn nơi
kể lại nó thì kể ra bốn con số khác nhau — README nói 56, DATA_DICTIONARY nói 56,
``web/src/fields.ts`` nói 53, trên đĩa là 61.

Hệ quả không chỉ là tài liệu sai. ``n12_national`` hardcode **40 tên cột** rồi truyền vào
``pq.read_table(columns=…)``: đổi tên một cột ở ``n09`` là ``n12`` nổ, và không phép kiểm nào
bắt trước. Và bốn cột đã có trong dữ liệu (``population_wp``, ``snow_frac``,
``mangrove_frac``, ``moss_frac``) **không hiện lên giao diện** vì không ai nhớ thêm chúng
vào danh mục trường.

Ba thuộc tính chở phần lớn giá trị:

``role``      key / identity / measure — ``identity`` là cột ĐỊNH DANH & XUẤT XỨ, tô màu
              chúng lên bản đồ là vô nghĩa nên chúng cố ý vắng mặt ở danh mục trường.
``agg``       cách gộp lên bậc thô hơn. ``sum`` là quảng tính (dân số, số cổng, mét đường);
              ``area_mean`` là cường tính, cộng vào là vô nghĩa; ``none`` là thứ KHÔNG gộp
              được bằng bất kỳ phép nào — khoảng cách, tỉ số, nhãn của một rule.
``national``  cột có lên màn hình CẢ NƯỚC không. Khác ``agg``: ``road_len_local_m`` cộng
              được nhưng không lên, vì ngân sách tải của màn hình ấy đã đo và đã chốt.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Role = Literal["key", "identity", "measure"]
Agg = Literal["sum", "area_mean", "none"]
Dtype = Literal["str", "f64", "f32", "i64", "i32", "i8", "bool"]
Polarity = Literal["high-bad", "high-good"]

# Kiểu logic → kiểu pyarrow đọc được từ đĩa. Một chỗ, để phép kiểm schema so được kiểu
# thật với kiểu khai mà không phải đoán.
ARROW = {
    "str": ("string", "large_string"),
    "f64": ("double",),
    "f32": ("float",),
    "i64": ("int64",),
    "i32": ("int32",),
    "i8": ("int8",),
    "bool": ("bool",),
}

# Hạ độ chính xác khi chở lên bậc gộp — CÓ CHỦ Ý, không phải mất mát tình cờ.
#
# Màn hình CẢ NƯỚC có ngân sách tải đã đo và đã chốt (0,52 MB lần đầu). Ở bậc ô gộp 36 km²,
# `float32` cho ~7 chữ số có nghĩa — thừa cho một con số hiển thị ở mức phóng toàn quốc.
DOWNCAST = {"f64": "f32", "i64": "i32"}


@dataclass(frozen=True)
class Column:
    name: str
    dtype: Dtype
    layer: str
    """Bước sinh ra cột. Đây là cái làm ``manifest.missing_layers`` tính được: tỉnh thiếu
    lớp nào thì thiếu đúng những cột mang nhãn lớp đó."""
    role: Role = "measure"
    unit: str | None = None
    agg: Agg = "none"
    polarity: Polarity | None = None
    national: bool = False
    null_means: str | None = None
    """Null ở cột này CÓ NGHĨA gì. Rỗng nghĩa là "không biết". Cột có giá trị ở đây thì giao
    diện không được vẽ ⚠ — nó phải nói ra nghĩa ấy."""
    desc: str = ""

    @property
    def mappable(self) -> bool:
        """Có tô lên bản đồ được không — tức có cần một mục trong danh mục trường không."""
        return self.role == "measure"


@dataclass(frozen=True)
class Table:
    name: str
    key: str
    columns: tuple[Column, ...]
    desc: str = ""

    def __post_init__(self) -> None:
        seen = [c.name for c in self.columns]
        dup = {n for n in seen if seen.count(n) > 1}
        if dup:
            raise ValueError(f"{self.name}: tên cột trùng {sorted(dup)}")
        if self.key not in seen:
            raise ValueError(f"{self.name}: khoá {self.key!r} không có trong danh sách cột")

    # --- tra cứu ----------------------------------------------------------
    def names(self) -> list[str]:
        """Tên cột theo ĐÚNG thứ tự phát hành. Bảng ghi ra phải theo thứ tự này."""
        return [c.name for c in self.columns]

    def get(self, name: str) -> Column:
        for c in self.columns:
            if c.name == name:
                return c
        raise KeyError(f"{self.name}: không có cột {name!r}")

    def has(self, name: str) -> bool:
        return any(c.name == name for c in self.columns)

    def where(self, **kw) -> list[Column]:
        """Lọc theo thuộc tính: ``where(agg="sum", national=True)``."""
        return [c for c in self.columns if all(getattr(c, k) == v for k, v in kw.items())]

    def of_layer(self, layer: str) -> list[Column]:
        return [c for c in self.columns if c.layer == layer]

    def layers(self) -> list[str]:
        return list(dict.fromkeys(c.layer for c in self.columns))

    def measures(self) -> list[Column]:
        return [c for c in self.columns if c.role == "measure"]

    def identity(self) -> list[Column]:
        return [c for c in self.columns if c.role in ("key", "identity")]

    # --- phép kiểm --------------------------------------------------------
    def validate(self, present: list[str], types: dict[str, str] | None = None) -> list[str]:
        """Danh sách chênh lệch giữa bảng THẬT và bảng ĐÃ KHAI. Rỗng là khớp.

        Kiểm cả THỨ TỰ, không chỉ tập hợp: thứ tự cột là một phần của hợp đồng — bên đọc
        bằng vị trí (và có bên như thế) sẽ hỏng âm thầm khi thứ tự đổi.
        """
        want, got = self.names(), list(present)
        out: list[str] = []
        if set(want) - set(got):
            out.append(f"{self.name}: THIẾU cột {sorted(set(want) - set(got))}")
        if set(got) - set(want):
            out.append(f"{self.name}: THỪA cột chưa khai {sorted(set(got) - set(want))}")
        if set(want) == set(got) and want != got:
            lech = next(i for i, (a, b) in enumerate(zip(want, got)) if a != b)
            out.append(
                f"{self.name}: SAI thứ tự từ vị trí {lech} ({got[lech]!r}, chờ {want[lech]!r})"
            )
        for name, t in (types or {}).items():
            if self.has(name) and t not in ARROW[self.get(name).dtype]:
                out.append(f"{self.name}.{name}: kiểu {t} ≠ khai {self.get(name).dtype}")
        return out
