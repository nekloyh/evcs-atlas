"""``Step`` — khai ĐỌC GÌ / GHI GÌ bằng tên dataset. Mọi thứ khác suy ra.

So với bản cũ:

    cũ:  outputs=Callable[[str], list[Path]]        mới:  writes=("grid_cell", …)
         sources=Sequence[Path]                           reads=("stations", …)
         province_sources=Callable[[str], list[Path]]

Ba thứ trước đây phải viết tay lần thứ hai, nay suy ra:

    đường dẫn   Dataset.path(roots, province) — tier quyết định thư mục
    vân tay     mọi ``reads`` đã giải, không phải một danh sách chọn lọc bằng trí nhớ
    thứ tự      topo sort trên (reads, writes) — DAG có thật, không phải một list phẳng

Và một thứ trước đây KHÔNG THỂ có: phép kiểm lúc LẬP KẾ HOẠCH rằng mọi thứ một bước đọc
đều có người sinh ra. Trước đây ``python -m vn n09_assemble`` với store rỗng chạy được tới
tận ``pq.read_table`` rồi mới nổ.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Step:
    name: str
    scope: str
    """``"global"`` chạy một lần · ``"province"`` chạy mỗi tỉnh một lần."""
    version: str
    """Đổi khi LOGIC đổi ⇒ mọi kết quả cũ của bước này hết hạn."""
    run: Callable
    reads: tuple[str, ...] = ()
    writes: tuple[str, ...] = ()
    desc: str = ""

    # Đường dẫn phụ mà bước ghi ra nhưng chưa đáng nâng thành dataset có tên (báo cáo QA
    # dạng JSON/Markdown, thư mục geojson theo tỉnh). Vẫn vào vân tay và phép kiểm sản phẩm.
    extra_writes: Callable[[str | None], Sequence] = field(default=lambda _p: ())

    def __post_init__(self) -> None:
        if self.scope not in ("global", "province"):
            raise ValueError(f"{self.name}: scope phải là 'global' hoặc 'province'")
        chung = set(self.reads) & set(self.writes)
        if chung:
            raise ValueError(
                f"{self.name}: vừa đọc vừa ghi {sorted(chung)} — bước sửa tại chỗ không "
                "resume được, vì chạy lại lần hai sẽ đọc chính đầu ra của lần một"
            )
