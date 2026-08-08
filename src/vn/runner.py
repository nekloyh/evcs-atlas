"""Bộ chạy có RESUME — cùng một lệnh cho 1 tỉnh, N tỉnh, hay toàn quốc.

    uv run python -m vn all --tinh 01
    uv run python -m vn all --tinh 01,79,48
    uv run python -m vn all --tinh all
    uv run python -m vn n03_osm n04_supply --tinh all --lam-lai

Resume KHÔNG phải "chạy lại nhanh hơn". Nó là: đứt ở tỉnh thứ 19 thì lần chạy sau bắt đầu
từ tỉnh thứ 19, không phải từ tỉnh thứ nhất. Đơn vị ghi nhận là CẶP (bước, tỉnh) — nhỏ nhất
mà vẫn có một sản phẩm hoàn chỉnh trên đĩa.

Ba điều kiện để bỏ qua một cặp (thiếu bất kỳ điều nào là chạy lại):

  1. state ghi nhận đã xong;
  2. mọi file sản phẩm còn nằm trên đĩa — xoá tay một file là bước đó phải chạy lại;
  3. VÂN TAY đầu vào không đổi — gồm phiên bản của chính bước đó và (kích thước, mtime) của
     mọi file nguồn nó đọc. Nguồn mới hay logic mới thì kết quả cũ hết giá trị, và cách sai
     tệ nhất của một hệ thống resume là phục vụ lại một kết quả đã hết hạn mà không nói gì.

Ghi state là ATOMIC (ghi file tạm rồi ``replace``): Ctrl-C giữa lúc ghi không được để lại
một file state hỏng, vì đó là thứ duy nhất biết đã chạy tới đâu.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import traceback
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from . import admin, paths


@dataclass(frozen=True)
class Step:
    name: str
    scope: str  # "global" (chạy một lần) | "province" (chạy mỗi tỉnh một lần)
    version: str  # đổi khi LOGIC đổi ⇒ mọi kết quả cũ của bước này hết hạn
    run: Callable  # run() hoặc run(province_code)
    outputs: Callable  # () -> list[Path]  hoặc  (province_code) -> list[Path]
    sources: Sequence[Path] = field(default_factory=tuple)
    # Sản phẩm của bước TRƯỚC mà bước này đọc, theo tỉnh. Có mặt trong vân tay để chạy lại
    # một bước thượng nguồn tự làm hết hạn các bước hạ nguồn của đúng tỉnh đó — không phải
    # của cả 34 tỉnh, và không phải là không gì cả.
    province_sources: Callable[[str], Sequence[Path]] | None = None
    desc: str = ""


# ---------------------------------------------------------------- state ---
def _load_state() -> dict:
    if not paths.STATE_FILE.exists():
        return {"steps": {}}
    try:
        return json.loads(paths.STATE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        # State hỏng thì coi như chưa chạy gì — thà chạy lại tất cả còn hơn tin một file rác.
        return {"steps": {}}


def _save_state(state: dict) -> None:
    paths.STORE.mkdir(parents=True, exist_ok=True)
    tmp = paths.STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, paths.STATE_FILE)


def _fingerprint(step: Step, prov: str | None = None) -> str:
    parts = [f"v={step.version}"]
    srcs = list(step.sources)
    if prov and step.province_sources is not None:
        srcs += list(step.province_sources(prov))
    for p in srcs:
        if p.is_dir():
            # Thư mục hive: gộp mọi file con, sắp xếp để ổn định giữa các lần chạy.
            items = sorted(p.rglob("*.parquet"))
            size = sum(f.stat().st_size for f in items)
            mtime = max((f.stat().st_mtime_ns for f in items), default=0)
            parts.append(f"{p.name}:{len(items)}:{size}:{mtime}")
        elif p.exists():
            s = p.stat()
            parts.append(f"{p.name}:{s.st_size}:{s.st_mtime_ns}")
        else:
            parts.append(f"{p.name}:MISSING")
    return "|".join(parts)


def _relpath(p) -> str:
    p = Path(p)
    try:
        return str(p.relative_to(paths.STORE))
    except ValueError:
        return str(p)


def _key(step: Step, prov: str | None) -> str:
    return f"{step.name}|{prov or '-'}"


def is_done(state: dict, step: Step, prov: str | None) -> tuple[bool, str]:
    rec = state["steps"].get(_key(step, prov))
    if rec is None:
        return False, "chưa chạy"
    outs = step.outputs(prov) if step.scope == "province" else step.outputs()
    missing = [str(p) for p in outs if not Path(p).exists()]
    if missing:
        return False, f"thiếu sản phẩm: {missing[0]}"
    if rec.get("fingerprint") != _fingerprint(step, prov):
        return False, "vân tay đầu vào đã đổi (nguồn mới hoặc logic mới)"
    return True, rec.get("done_utc", "")


def mark_done(state: dict, step: Step, prov: str | None, elapsed_s: float) -> None:
    outs = step.outputs(prov) if step.scope == "province" else step.outputs()
    state["steps"][_key(step, prov)] = {
        "done_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "fingerprint": _fingerprint(step, prov),
        "elapsed_s": round(elapsed_s, 1),
        "outputs": [_relpath(p) for p in outs],
        "bytes": sum(Path(p).stat().st_size for p in outs if Path(p).exists()),
    }
    _save_state(state)


# ---------------------------------------------------------------- chạy ---
def _registry() -> dict[str, Step]:
    from . import (
        n01_admin,
        n02_osm,
        n03_supply,
        n04_grid,
        n05_population,
        n06_landcover,
        n07_distance,
        n08_screening,
        n09_assemble,
        n10_quality,
        n11_web_export,
        n12_national,
    )

    steps = [
        n01_admin.STEP,
        n02_osm.STEP,
        n03_supply.STEP,
        n04_grid.STEP,
        n05_population.STEP,
        n06_landcover.STEP,
        n07_distance.STEP,
        n08_screening.STEP,
        n09_assemble.STEP,
        n10_quality.STEP,
        n11_web_export.STEP,
        n12_national.STEP,
    ]
    return {s.name: s for s in steps}


# Số thứ tự Ở ĐÂY LÀ THỨ TỰ PHỤ THUỘC, không phải nhãn tuỳ tiện: n04 đọc sản phẩm của n02
# và n03, n05 đọc sản phẩm của cả ba. Chạy lẻ một bước giữa chừng là hợp lệ và thường dùng
# (sửa n03 rồi chạy lại mỗi n03 + n04), miễn là thượng nguồn của nó đã có trên đĩa.
DEFAULT_ORDER = [
    "n01_admin",
    "n02_osm",
    "n03_supply",
    "n04_grid",
    "n05_population",
    "n06_landcover",
    "n07_distance",
    "n08_screening",
    "n09_assemble",
    "n10_quality",
    "n11_web_export",
    "n12_national",
]


def main(argv: list[str] | None = None) -> int:
    reg = _registry()
    ap = argparse.ArgumentParser(
        prog="python -m vn",
        description="Pipeline dữ liệu EVCS toàn quốc — tham số hoá theo tỉnh, resume được.",
    )
    ap.add_argument(
        "steps",
        nargs="*",
        default=["all"],
        help="tên bước, hoặc 'all' cho toàn bộ. Có: " + ", ".join(DEFAULT_ORDER),
    )
    ap.add_argument("--tinh", default="all", help="mã tỉnh: '01' · '01,79' · 'all' (mặc định)")
    ap.add_argument("--tru", default="", help="mã tỉnh loại khỏi lựa chọn, ngăn bằng dấu phẩy")
    ap.add_argument("--lam-lai", action="store_true", help="bỏ qua state, chạy lại từ đầu")
    ap.add_argument("--liet-ke", action="store_true", help="chỉ in kế hoạch, không chạy")
    a = ap.parse_args(argv)

    paths.assert_sources()
    paths.ensure_dirs()
    names = ["all"] if a.steps == ["all"] else a.steps
    if names == ["all"]:
        names = DEFAULT_ORDER
    bad = [n for n in names if n not in reg]
    if bad:
        raise SystemExit(f"Không có bước {bad}. Có: {', '.join(DEFAULT_ORDER)}")

    provs = admin.parse_selection(a.tinh, a.tru)
    state = _load_state()
    pnames = admin.province_names()

    plan: list[tuple[Step, str | None]] = []
    for n in names:
        s = reg[n]
        plan += [(s, None)] if s.scope == "global" else [(s, p) for p in provs]

    print(f"⇒ {len(provs)} tỉnh · {len(names)} bước · {len(plan)} cặp (bước, tỉnh)")
    if a.liet_ke:
        for s, p in plan:
            ok, why = is_done(state, s, p)
            tag = "BỎ QUA" if ok else "CHẠY  "
            print(f"  [{tag}] {s.name:12s} {p or '—':4s} {pnames.get(p or '', '')[:28]:30s} {why}")
        return 0

    # `--lam-lai` chỉ vô hiệu hoá NHỮNG CẶP TRONG KẾ HOẠCH, không xoá cả file state.
    #
    # Bản đầu đặt `state = {"steps": {}}` khi có cờ này, và đó là một lỗi mất dữ liệu thật:
    # chạy lại một bước toàn cục sẽ xoá luôn dấu vết của 34 cặp (bước, tỉnh) khác, nên lần
    # chạy tiếp theo làm lại từ đầu cả những thứ không ai đụng tới. Cờ này nghĩa là "bỏ qua
    # state cho việc tôi đang yêu cầu", không phải "quên hết mọi thứ".
    if a.lam_lai:
        for s, p in plan:
            state["steps"].pop(_key(s, p), None)

    t_all = time.time()
    n_run = n_skip = n_fail = 0
    failures: list[tuple[str, str, str]] = []
    for s, p in plan:
        ok, why = is_done(state, s, p)
        if ok:
            n_skip += 1
            continue
        label = f"{s.name} {p or ''}".strip()
        print(f"\n── {label}  {pnames.get(p or '', '')}  ({why})", flush=True)
        t0 = time.time()
        try:
            s.run(p) if s.scope == "province" else s.run()
        except Exception as e:  # một tỉnh hỏng KHÔNG được làm chết cả lần chạy 34 tỉnh
            n_fail += 1
            failures.append((s.name, p or "-", f"{type(e).__name__}: {e}"))
            print(f"   ✗ HỎNG: {type(e).__name__}: {e}", flush=True)
            traceback.print_exc()
            continue
        el = time.time() - t0
        mark_done(state, s, p, el)
        n_run += 1
        print(f"   ✓ {el:.1f}s", flush=True)

    print(
        f"\n⇒ xong: {n_run} chạy · {n_skip} bỏ qua · {n_fail} hỏng "
        f"· tổng {time.time() - t_all:.1f}s"
    )
    for name, p, msg in failures:
        print(f"   ✗ {name} {p}: {msg}")
    return 1 if failures else 0
