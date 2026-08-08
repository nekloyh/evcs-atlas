"""Bộ chạy có RESUME — cùng một lệnh cho 1 tỉnh, N tỉnh, hay toàn quốc.

Resume KHÔNG phải "chạy lại nhanh hơn". Nó là: đứt ở tỉnh thứ 19 thì lần chạy sau bắt đầu
từ tỉnh thứ 19, không phải từ tỉnh thứ nhất. Đơn vị ghi nhận là CẶP (bước, tỉnh) — nhỏ nhất
mà vẫn có một sản phẩm hoàn chỉnh trên đĩa.

Ba điều kiện để bỏ qua một cặp (thiếu bất kỳ điều nào là chạy lại):

  1. state ghi nhận đã xong;
  2. mọi file sản phẩm còn nằm trên đĩa — xoá tay một file là bước đó phải chạy lại;
  3. VÂN TAY đầu vào không đổi — phiên bản của chính bước đó và (kích thước, mtime) của mọi
     dataset nó ĐỌC. Nguồn mới hay logic mới thì kết quả cũ hết giá trị, và cách sai tệ
     nhất của một hệ thống resume là phục vụ lại một kết quả đã hết hạn mà không nói gì.

Điều 3 giờ ĐÚNG, trước đây thì không. Bản cũ bắt tác giả liệt kê đường dẫn nguồn bằng tay
và 7/12 bước liệt kê thiếu. Ở đây vân tay suy từ ``reads``, và ``--soi`` đo xem bản khai có
đúng không bằng cách ghi lại mọi file bước ấy thật sự mở.

Ghi state là ATOMIC (ghi file tạm rồi ``replace``): Ctrl-C giữa lúc ghi không được để lại
một file state hỏng, vì đó là thứ duy nhất biết đã chạy tới đâu.
"""

from __future__ import annotations

import json
import os
import time
import traceback
from datetime import UTC, datetime
from pathlib import Path

from . import graph
from .audit import record_reads, undeclared
from .dataset import Registry
from .step import Step
from .store import Roots


class Pipeline:
    """Một pipeline = registry dataset + danh sách bước + gốc store.

    Gộp ba thứ ấy vào một đối tượng thay vì ba biến module-level là điều kiện để dựng một
    pipeline thứ hai (store thử nghiệm, tập bước rút gọn trong test) mà không đụng cái đang
    chạy.
    """

    def __init__(
        self,
        registry: Registry,
        steps: list[Step],
        roots: Roots,
        sources: list[Path],
        provinces: list[str],
    ):
        van_de = graph.validate(steps, registry)
        if van_de:
            raise ValueError("khai báo pipeline sai:\n  " + "\n  ".join(van_de))
        self.reg = registry
        self.steps = {s.name: s for s in steps}
        self.roots = roots
        self.sources = sources
        self.provinces = provinces
        self.order = graph.topo_order(steps)

    # --- giải đường dẫn ---------------------------------------------------
    def _paths(self, names: tuple[str, ...], prov: str | None) -> list[Path]:
        """Giải tên dataset thành đường dẫn.

        Một bước TOÀN CỤC chạm dataset theo tỉnh thì chạm CẢ 34 tỉnh — `n02_osm` quét file
        PBF một lượt rồi rơi từng đối tượng vào phân mảnh của nó, `n10_quality` đọc lưới của
        mọi tỉnh để dựng bảng so sánh. Mở rộng ở đây thay vì bắt mỗi bước tự viết vòng lặp.
        """
        out = []
        for n in names:
            ds = self.reg.get(n)
            if ds.per_province and prov is None:
                out += [ds.path(self.roots, p) for p in self.provinces]
            else:
                out.append(ds.path(self.roots, prov if ds.per_province else None))
        return out

    def read_paths(self, step: Step, prov: str | None) -> list[Path]:
        return self._paths(step.reads, prov)

    def write_paths(self, step: Step, prov: str | None) -> list[Path]:
        return [*self._paths(step.writes, prov), *[Path(p) for p in step.extra_writes(prov)]]

    # --- vân tay ----------------------------------------------------------
    def fingerprint(self, step: Step, prov: str | None) -> str:
        parts = [f"v={step.version}"]
        for p in self.read_paths(step, prov):
            parts.append(f"{p.name}:{_stat(p)}")
        return "|".join(parts)

    # --- trạng thái -------------------------------------------------------
    def load_state(self) -> dict:
        f = self.roots.state_file
        if not f.exists():
            return {"steps": {}}
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            # State hỏng thì coi như chưa chạy gì — thà chạy lại tất cả còn hơn tin file rác.
            return {"steps": {}}

    def save_state(self, state: dict) -> None:
        self.roots.store.mkdir(parents=True, exist_ok=True)
        tmp = self.roots.state_file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.roots.state_file)

    def is_done(self, state: dict, step: Step, prov: str | None) -> tuple[bool, str]:
        rec = state["steps"].get(_key(step, prov))
        if rec is None:
            return False, "chưa chạy"
        thieu = [str(p) for p in self.write_paths(step, prov) if not p.exists()]
        if thieu:
            return False, f"thiếu sản phẩm: {thieu[0]}"
        if rec.get("fingerprint") != self.fingerprint(step, prov):
            return False, "vân tay đầu vào đã đổi (nguồn mới hoặc logic mới)"
        return True, rec.get("done_utc", "")

    def mark_done(self, state: dict, step: Step, prov: str | None, elapsed_s: float = 0.0) -> None:
        outs = self.write_paths(step, prov)
        state["steps"][_key(step, prov)] = {
            "done_utc": datetime.now(UTC).isoformat(timespec="seconds"),
            "fingerprint": self.fingerprint(step, prov),
            "elapsed_s": round(elapsed_s, 1),
            "reads": list(step.reads),
            "writes": [self._rel(p) for p in outs],
            "bytes": sum(p.stat().st_size for p in outs if p.exists()),
        }
        self.save_state(state)

    def _rel(self, p: Path) -> str:
        try:
            return str(Path(p).relative_to(self.roots.store))
        except ValueError:
            return str(p)

    # --- chạy một cặp -----------------------------------------------------
    def run_one(self, step: Step, prov: str | None, soi: bool = False) -> list[str]:
        """Chạy một cặp (bước, tỉnh). Trả danh sách cảnh báo (rỗng là sạch)."""
        if not soi:
            step.run(prov) if step.scope == "province" else step.run()
            return []

        watch = [self.roots.store, *self.sources]
        with record_reads(watch) as rec:
            step.run(prov) if step.scope == "province" else step.run()
        la = undeclared(
            rec.opened,
            set(self.read_paths(step, prov)),
            set(self.write_paths(step, prov)),
        )
        return [f"đọc mà KHÔNG khai: {self._rel(p)}" for p in la]


def _key(step: Step, prov: str | None) -> str:
    return f"{step.name}|{prov or '-'}"


def _stat(p: Path) -> str:
    if p.is_dir():
        # Thư mục hive hoặc thư mục tile: gộp MỌI file con, không chỉ parquet.
        #
        # Bản cũ glob riêng `*.parquet`, nên thư mục WorldCover (toàn `.tif`) có vân tay
        # `0:0:0` — đổi hết tile ảnh cũng không làm bước lớp phủ hết hạn.
        items = sorted(f for f in p.rglob("*") if f.is_file())
        size = sum(f.stat().st_size for f in items)
        mtime = max((f.stat().st_mtime_ns for f in items), default=0)
        return f"{len(items)}:{size}:{mtime}"
    if p.exists():
        s = p.stat()
        return f"{s.st_size}:{s.st_mtime_ns}"
    return "MISSING"
