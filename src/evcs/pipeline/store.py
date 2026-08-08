"""Hình dạng store: sản phẩm và cache là HAI TIER, hai vòng đời.

    store/
      admin/          địa giới dùng chung — sản phẩm, toàn cục
      p/<code>/       sản phẩm và bảng trung gian của một tỉnh
      cache/<code>/   dựng lại được: đồ thị đường bộ. KHÔNG backup, KHÔNG ship.
      qa/             báo cáo chất lượng
      _state.json     trạng thái resume

Vì sao tách: ``road_graph.parquet`` (node_ids + toạ độ nguyên, cần cho Dijkstra) làm store
tăng từ **88 MB lên 714 MB** — 88% dung lượng nằm ở một loại file không ship cho web và
dựng lại được từ PBF. Giữ nó lại sau khi bước khoảng cách chạy xong là CÓ CHỦ Ý (chạy lại
Dijkstra không phải quét lại file PBF 325 MB), nhưng nó phải nằm ở một tier có tên, để
"xoá cache" là một lệnh chứ không phải một cuộc rà soát bằng mắt.

Ở 34 tỉnh, 714 MB còn chịu được. Thêm MỘT trục scale nữa — độ phân giải r9, hoặc cửa sổ
telemetry thứ hai — là nó nhân lên mà không ai chọn.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .dataset import Dataset

ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Roots:
    store: Path
    """Gốc của cây ghi. Đổi qua ``EVCS_STORE`` để dựng một store thứ hai cạnh store thật."""

    @property
    def admin(self) -> Path:
        return self.store / "admin"

    @property
    def prov(self) -> Path:
        return self.store / "p"

    @property
    def cache(self) -> Path:
        return self.store / "cache"

    @property
    def qa(self) -> Path:
        return self.store / "qa"

    @property
    def state_file(self) -> Path:
        return self.store / "_state.json"

    def dir_for(self, ds: Dataset, province_code: str | None = None) -> Path:
        """Thư mục chứa một dataset — tier quyết định, không phải bước sinh ra nó."""
        if ds.tier == "cache":
            d = self.cache / province_code if ds.per_province else self.cache
        elif ds.tier == "qa":
            d = self.qa / province_code if ds.per_province else self.qa
        elif ds.per_province:
            d = self.prov / province_code
        else:
            d = self.admin
        d.mkdir(parents=True, exist_ok=True)
        return d

    def ensure(self) -> None:
        for d in (self.store, self.admin, self.admin / "boundary", self.prov, self.cache, self.qa):
            d.mkdir(parents=True, exist_ok=True)

    def bytes_of_tier(self, tier: str) -> int:
        base = {"cache": self.cache, "qa": self.qa, "product": self.prov}.get(tier)
        if base is None or not base.exists():
            return 0
        return sum(f.stat().st_size for f in base.rglob("*") if f.is_file())


def default_roots() -> Roots:
    return Roots(store=Path(os.environ.get("EVCS_STORE", ROOT / "store")))
