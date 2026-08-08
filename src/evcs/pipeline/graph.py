"""DAG của pipeline, suy từ ``reads``/``writes``. Không có danh sách thứ tự viết tay nào.

``DEFAULT_ORDER`` cũ là một ``list[str]`` viết tay, và comment của nó phải nói rằng "số thứ
tự Ở ĐÂY LÀ THỨ TỰ PHỤ THUỘC" — tức thông tin phụ thuộc được mã hoá vào *tên bước*. Nó đúng
chừng nào không ai chèn một bước vào giữa.
"""

from __future__ import annotations

from .dataset import Registry
from .step import Step


def producers(steps: list[Step]) -> dict[str, str]:
    """dataset → bước sinh ra nó. Hai bước cùng ghi một dataset là lỗi cấu hình."""
    out: dict[str, str] = {}
    for s in steps:
        for w in s.writes:
            if w in out:
                raise ValueError(f"dataset {w!r} bị ghi bởi cả {out[w]!r} và {s.name!r}")
            out[w] = s.name
    return out


def validate(steps: list[Step], reg: Registry) -> list[str]:
    """Danh sách vấn đề trong khai báo. Rỗng là DAG hợp lệ."""
    van_de: list[str] = []
    for s in steps:
        for n in (*s.reads, *s.writes):
            if n not in reg:
                van_de.append(f"{s.name}: dataset {n!r} chưa khai trong registry")
    if van_de:
        return van_de

    prod = producers(steps)
    for s in steps:
        for r in s.reads:
            ds = reg.get(r)
            if ds.tier != "source" and r not in prod:
                van_de.append(f"{s.name}: đọc {r!r} nhưng KHÔNG bước nào sinh ra nó")
    try:
        topo_order(steps)
    except ValueError as e:
        van_de.append(str(e))
    return van_de


def depends_on(steps: list[Step]) -> dict[str, set[str]]:
    """bước → tập bước phải chạy trước nó."""
    prod = producers(steps)
    return {s.name: {prod[r] for r in s.reads if r in prod and prod[r] != s.name} for s in steps}


def topo_order(steps: list[Step]) -> list[str]:
    """Thứ tự chạy hợp lệ. Giữ ổn định bằng cách sắp tên trong mỗi lớp — cùng đầu vào cho
    cùng thứ tự, để hai lần chạy so sánh được với nhau."""
    dep = depends_on(steps)
    con_lai = dict(dep)
    xong: list[str] = []
    while con_lai:
        san_sang = sorted(n for n, d in con_lai.items() if not (d - set(xong)))
        if not san_sang:
            raise ValueError(f"đồ thị bước có CHU TRÌNH giữa {sorted(con_lai)}")
        xong += san_sang
        for n in san_sang:
            con_lai.pop(n)
    return xong


def upstream_of(steps: list[Step], name: str) -> list[str]:
    """Mọi bước phải chạy trước ``name``, theo thứ tự topo."""
    dep = depends_on(steps)
    can: set[str] = set()
    hang_doi = [name]
    while hang_doi:
        n = hang_doi.pop()
        for d in dep.get(n, ()):
            if d not in can:
                can.add(d)
                hang_doi.append(d)
    thu_tu = topo_order(steps)
    return [n for n in thu_tu if n in can]
