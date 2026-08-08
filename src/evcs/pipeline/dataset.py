"""``Dataset`` — một bảng có TÊN, không phải một đường dẫn.

Đây là chỗ hỏng cũ. ``Step`` trước đây bắt tác giả khai **đường dẫn**: một hàm
``outputs(province_code)`` trả về ``list[Path]`` và một hàm ``province_sources`` cũng trả về
``list[Path]``. Hai hệ quả, cả hai đo được:

* **7/12 bước đọc file mà không khai.** ``n08`` đọc ``grid_cell``, ``communes``, ``stations``
  — không cái nào trong ``upstream()``. Chạy lại ``n04`` (đổi ``commune_code``) để lại ``n08``
  ở trạng thái "đã xong". Resume phục vụ một kết quả đã hết hạn, đúng thứ mà chính docstring
  của nó gọi là "cách sai tệ nhất của một hệ thống resume".
* **Không có DAG.** ``province_sources`` trả về ``Path``; runner không bao giờ ánh xạ ngược
  path → bước sinh ra nó. Nó biết *cũ*, nhưng không biết *thứ tự*, nên không kiểm được
  "thượng nguồn đã có chưa" lúc lập kế hoạch — chỉ nổ giữa chừng ở tỉnh thứ 19.

Khai bằng TÊN thì đường dẫn, vân tay, thứ tự chạy và phép kiểm đều **suy ra**. Khai thiếu
trở thành *không thể*, thay vì *dễ quên*.

``tier`` chở quyết định thứ hai: cái gì là SẢN PHẨM và cái gì chỉ là CACHE dựng lại được.
Đo được: ``road_graph.parquet`` chiếm 626 MB trên 714 MB của store. Nó cần cho Dijkstra,
không ship cho web, và dựng lại được từ PBF — nhưng nó đang nằm cùng thư mục, cùng vòng
đời, cùng backup với sản phẩm.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from evcs.schema import Table

Scope = Literal["source", "global", "province"]
Tier = Literal["source", "product", "interim", "cache", "qa", "web"]


@dataclass(frozen=True)
class Dataset:
    name: str
    scope: Scope
    tier: Tier
    file: str
    """Tên file trong thư mục của tier. KHÔNG mang tên tỉnh — tỉnh nằm ở đường dẫn.

    Bộ Hà Nội đặt tỉnh vào TÊN FILE (``osm_hanoi_roads.parquet``) và đọc bằng chuỗi cứng ở
    3 file. Hệ quả không chỉ là đổi tỉnh phải sửa 3 chỗ: **hai tỉnh không cùng tồn tại được**.
    """
    schema: Table | None = None
    desc: str = ""
    abs_path: Path | None = None
    """Chỉ cho tier ``source``: nguồn nằm NGOÀI store, ở repo khác, và chỉ được ĐỌC."""

    @property
    def per_province(self) -> bool:
        return self.scope == "province"

    def path(self, roots, province_code: str | None = None) -> Path:
        """Đường dẫn thật, giải theo ``roots`` và tỉnh đang chạy."""
        if self.abs_path is not None:
            return self.abs_path
        if self.per_province and province_code is None:
            raise ValueError(f"dataset {self.name!r} theo tỉnh — phải truyền province_code")
        return roots.dir_for(self, province_code) / self.file


class Registry:
    """Tra cứu dataset theo tên. Tên lạ thì DỪNG kèm gợi ý, không trả None.

    Gõ nhầm tên một dataset trong ``reads`` mà chỉ nhận ``None`` là biến một lỗi chính tả
    thành một bước im lặng bỏ qua vân tay của thượng nguồn.
    """

    def __init__(self, items: list[Dataset]):
        seen = [d.name for d in items]
        dup = {n for n in seen if seen.count(n) > 1}
        if dup:
            raise ValueError(f"tên dataset trùng: {sorted(dup)}")
        self._by_name = {d.name: d for d in items}

    def __contains__(self, name: str) -> bool:
        return name in self._by_name

    def __iter__(self):
        return iter(self._by_name.values())

    def __len__(self) -> int:
        return len(self._by_name)

    def get(self, name: str) -> Dataset:
        try:
            return self._by_name[name]
        except KeyError:
            from difflib import get_close_matches

            goi_y = get_close_matches(name, self._by_name, n=3)
            them = f" — ý bạn là {goi_y}?" if goi_y else ""
            raise KeyError(f"không có dataset {name!r}{them}") from None

    def of_tier(self, *tiers: str) -> list[Dataset]:
        return [d for d in self if d.tier in tiers]

    def names(self) -> list[str]:
        return sorted(self._by_name)
