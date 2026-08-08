"""Cho phép test import ``golden`` — nó là công cụ ở gốc repo, không phải gói cài đặt.

``src/evcs``, ``src/hanoi``, ``src/vn`` được hatchling cài vào môi trường; ``golden/`` thì
cố ý KHÔNG — nó là một harness kiểm thử, không phải thư viện để ai đó import từ nơi khác.
Nhưng chính nó cũng cần được kiểm, nên gốc repo phải nằm trên ``sys.path`` lúc chạy test.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
