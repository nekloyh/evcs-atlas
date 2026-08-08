"""Ghi lại file mà một bước THẬT SỰ mở, để đối chiếu với bản khai ``reads``.

Khai báo tĩnh nào cũng có cùng một điểm yếu: nó là lời hứa, không phải sự thật. Bản cũ có
7/12 bước đọc file mà không khai, và không có gì phát hiện ra — cho tới khi ai đó chạy lại
một bước thượng nguồn rồi tự hỏi vì sao số không đổi.

Module này biến câu hỏi ấy thành một phép ĐO. Nó vá tạm ``pyarrow`` và ``Path.read_text``
trong lúc một bước chạy, thu mọi đường dẫn nằm dưới store hoặc dưới các thư mục nguồn, rồi
runner so tập đo được với tập đã khai. Khai thiếu là FAIL, không phải là im lặng.

**Không phủ hết mọi cách đọc file** — ``rasterio.open`` và bộ đọc PBF của ``osmium`` không
đi qua đây. Đó là lý do những nguồn ấy được khai TƯỜNG MINH ở registry với tier ``source``:
thứ không đo được thì phải khai bằng tay, và phải biết mình đang khai bằng tay.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path


class Recorder:
    def __init__(self, roots: Path):
        self.roots = [Path(r).resolve() for r in roots] if isinstance(roots, list) else []
        self.opened: set[Path] = set()

    def note(self, p) -> None:
        try:
            rp = Path(p).resolve()
        except (TypeError, ValueError, OSError):
            return
        if any(_duoi(rp, r) for r in self.roots):
            self.opened.add(rp)


def _duoi(p: Path, goc: Path) -> bool:
    try:
        p.relative_to(goc)
    except ValueError:
        return False
    return True


@contextmanager
def record_reads(watch_dirs: list[Path]):
    """Thu mọi lần đọc parquet/text nằm dưới ``watch_dirs`` trong khối ``with``."""
    import pyarrow.dataset as pads
    import pyarrow.parquet as pq

    rec = Recorder([])
    rec.roots = [Path(d).resolve() for d in watch_dirs]

    goc_read_table = pq.read_table
    goc_read_schema = pq.read_schema
    goc_dataset = pads.dataset
    goc_read_text = Path.read_text
    goc_read_bytes = Path.read_bytes

    def read_table(source, *a, **k):
        rec.note(source)
        return goc_read_table(source, *a, **k)

    def read_schema(where, *a, **k):
        rec.note(where)
        return goc_read_schema(where, *a, **k)

    def dataset(source, *a, **k):
        rec.note(source)
        return goc_dataset(source, *a, **k)

    def read_text(self, *a, **k):
        rec.note(self)
        return goc_read_text(self, *a, **k)

    def read_bytes(self, *a, **k):
        rec.note(self)
        return goc_read_bytes(self, *a, **k)

    pq.read_table = read_table
    pq.read_schema = read_schema
    pads.dataset = dataset
    Path.read_text = read_text
    Path.read_bytes = read_bytes
    try:
        yield rec
    finally:
        pq.read_table = goc_read_table
        pq.read_schema = goc_read_schema
        pads.dataset = goc_dataset
        Path.read_text = goc_read_text
        Path.read_bytes = goc_read_bytes


def undeclared(opened: set[Path], declared: set[Path], written: set[Path]) -> list[Path]:
    """File đã mở mà không nằm trong bản khai.

    Trừ đi ``written``: một bước đọc lại chính sản phẩm nó vừa ghi (để kiểm) không phải là
    một phụ thuộc thượng nguồn.

    Một khai báo trỏ vào THƯ MỤC phủ mọi file dưới nó — ``admin/boundary`` là một dataset,
    không phải 34 dataset. Vân tay của nó cũng tính trên cả cây (xem ``runner._stat``), nên
    thêm/xoá/sửa một file con vẫn làm bước hạ nguồn hết hạn.
    """
    kh = {p.resolve() for p in (*declared, *written)}
    thu_muc = [p for p in kh if p.is_dir()]
    return sorted(p for p in opened if p not in kh and not any(_duoi(p, d) for d in thu_muc))
