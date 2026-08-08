"""Tiện ích QA dùng chung: cùng một hình dạng báo cáo với gói ``hanoi``.

Một báo cáo QA là một file JSON có ``layer`` · ``stats`` · ``checks``. Bước theo tỉnh ghi
thêm ``province_code``. Giữ đúng hình dạng cũ để hai bộ đọc bằng cùng một công cụ.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import paths


class Report:
    def __init__(self, layer: str, province_code: str | None = None, **meta):
        self.doc: dict = {"layer": layer, **meta}
        if province_code:
            self.doc["province_code"] = province_code
        self.doc["stats"] = {}
        self.doc["checks"] = []
        self._prov = province_code

    def stat(self, **kw) -> None:
        self.doc["stats"].update(kw)

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.doc["checks"].append(
            {"name": name, "status": "PASS" if ok else "FAIL", "detail": detail}
        )

    def path(self) -> Path:
        stem = self.doc["layer"]
        d = paths.QA / (self._prov or "")
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{stem}.json"

    def write(self, quiet: bool = False) -> Path:
        p = self.path()
        p.write_text(json.dumps(self.doc, ensure_ascii=False, indent=2, default=str), "utf-8")
        if not quiet:
            print(json.dumps(self.doc["stats"], ensure_ascii=False, indent=2, default=str))
            for c in self.doc["checks"]:
                print(f"  [{c['status']}] {c['name']} {c['detail']}")
        n_fail = sum(c["status"] != "PASS" for c in self.doc["checks"])
        if n_fail:
            print(f"  ⚠ {n_fail} phép kiểm FAIL — xem {p}")
        return p
