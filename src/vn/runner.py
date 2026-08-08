"""CLI của pipeline toàn quốc — mỏng, mọi cơ chế ở ``evcs.pipeline``.

    uv run python -m vn all --tinh 01
    uv run python -m vn all --tinh 01,79,48
    uv run python -m vn n03_supply n04_grid --tinh all --lam-lai
    uv run python -m vn all --liet-ke          # in kế hoạch, không chạy
    uv run python -m vn all --tinh 01 --soi    # chạy VÀ đo bản khai reads có đúng không
    uv run python -m vn --do-thi               # in DAG suy từ reads/writes

``Step`` re-export ở đây để 12 file bước không phải biết ``evcs.pipeline`` nằm đâu — chúng
chỉ cần biết hàng xóm của mình.
"""

from __future__ import annotations

import argparse
import time
import traceback

from evcs.pipeline import graph
from evcs.pipeline.runner import Pipeline
from evcs.pipeline.step import Step
from evcs.pipeline.store import Roots

from . import admin, paths
from .datasets import REGISTRY, SOURCE_DIRS

__all__ = ["Step", "build_pipeline", "main"]


def _steps() -> list[Step]:
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
        n13_substation,
        n14_showcase,
    )

    return [
        m.STEP
        for m in (
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
            n13_substation,
            n14_showcase,
        )
    ]


def build_pipeline() -> Pipeline:
    return Pipeline(
        registry=REGISTRY,
        steps=_steps(),
        roots=Roots(store=paths.STORE),
        sources=SOURCE_DIRS,
        provinces=admin.province_codes(),
    )


def _in_do_thi(steps: list[Step]) -> None:
    prod = graph.producers(steps)
    dep = graph.depends_on(steps)
    print(f"⇒ {len(steps)} bước · {len(REGISTRY)} dataset · thứ tự suy từ reads/writes\n")
    for name in graph.topo_order(steps):
        s = next(x for x in steps if x.name == name)
        truoc = sorted(dep[name])
        print(f"  {name:16s} [{s.scope:8s}] ← {', '.join(truoc) if truoc else 'NGUỒN'}")
    mo_coi = [d.name for d in REGISTRY if d.tier != "source" and d.name not in prod]
    if mo_coi:
        print(f"\n  ⚠ dataset khai mà không bước nào sinh: {mo_coi}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="python -m vn",
        description="Pipeline dữ liệu EVCS toàn quốc — tham số hoá theo tỉnh, resume được.",
    )
    ap.add_argument("steps", nargs="*", default=["all"], help="tên bước, hoặc 'all'")
    ap.add_argument("--tinh", default="all", help="mã tỉnh: '01' · '01,79' · 'all' (mặc định)")
    ap.add_argument("--tru", default="", help="mã tỉnh loại khỏi lựa chọn, ngăn bằng dấu phẩy")
    ap.add_argument("--lam-lai", action="store_true", help="bỏ qua state, chạy lại từ đầu")
    ap.add_argument("--liet-ke", action="store_true", help="chỉ in kế hoạch, không chạy")
    ap.add_argument("--do-thi", action="store_true", help="in DAG rồi thoát")
    ap.add_argument(
        "--soi",
        action="store_true",
        help="ghi lại file mỗi bước THẬT SỰ mở, báo chỗ khai thiếu trong `reads`",
    )
    a = ap.parse_args(argv)

    paths.assert_sources()
    paths.ensure_dirs()
    pl = build_pipeline()
    steps = list(pl.steps.values())

    if a.do_thi:
        _in_do_thi(steps)
        return 0

    names = pl.order if a.steps in ([], ["all"]) else a.steps
    bad = [n for n in names if n not in pl.steps]
    if bad:
        raise SystemExit(f"Không có bước {bad}. Có: {', '.join(pl.order)}")
    # Giữ THỨ TỰ TOPO kể cả khi người dùng gõ lộn xộn: `n09 n04` phải chạy n04 trước.
    names = [n for n in pl.order if n in set(names)]

    provs = admin.parse_selection(a.tinh, a.tru)
    state = pl.load_state()
    pnames = admin.province_names()

    plan: list[tuple[Step, str | None]] = []
    for n in names:
        s = pl.steps[n]
        plan += [(s, None)] if s.scope == "global" else [(s, p) for p in provs]

    print(f"⇒ {len(provs)} tỉnh · {len(names)} bước · {len(plan)} cặp (bước, tỉnh)")
    if a.liet_ke:
        for s, p in plan:
            ok, why = pl.is_done(state, s, p)
            tag = "BỎ QUA" if ok else "CHẠY  "
            print(f"  [{tag}] {s.name:16s} {p or '—':4s} {pnames.get(p or '', '')[:26]:28s} {why}")
        return 0

    # `--lam-lai` chỉ vô hiệu hoá NHỮNG CẶP TRONG KẾ HOẠCH, không xoá cả file state.
    #
    # Bản đầu đặt `state = {"steps": {}}` khi có cờ này, và đó là một lỗi mất dữ liệu thật:
    # chạy lại một bước toàn cục sẽ xoá luôn dấu vết của 34 cặp khác. Cờ này nghĩa là "bỏ
    # qua state cho việc tôi đang yêu cầu", không phải "quên hết mọi thứ".
    if a.lam_lai:
        for s, p in plan:
            state["steps"].pop(f"{s.name}|{p or '-'}", None)

    t_all = time.time()
    n_run = n_skip = n_fail = 0
    failures: list[tuple[str, str, str]] = []
    canh_bao: list[str] = []
    for s, p in plan:
        ok, why = pl.is_done(state, s, p)
        if ok:
            n_skip += 1
            continue
        print(f"\n── {s.name} {p or ''}  {pnames.get(p or '', '')}  ({why})", flush=True)
        t0 = time.time()
        try:
            cb = pl.run_one(s, p, soi=a.soi)
        except Exception as e:  # một tỉnh hỏng KHÔNG được làm chết cả lần chạy 34 tỉnh
            n_fail += 1
            failures.append((s.name, p or "-", f"{type(e).__name__}: {e}"))
            print(f"   ✗ HỎNG: {type(e).__name__}: {e}", flush=True)
            traceback.print_exc()
            continue
        for w in cb:
            canh_bao.append(f"{s.name} {p or '-'}: {w}")
            print(f"   ⚠ {w}", flush=True)
        el = time.time() - t0
        pl.mark_done(state, s, p, el)
        n_run += 1
        print(f"   ✓ {el:.1f}s", flush=True)

    print(
        f"\n⇒ xong: {n_run} chạy · {n_skip} bỏ qua · {n_fail} hỏng "
        f"· tổng {time.time() - t_all:.1f}s"
    )
    for name, p, msg in failures:
        print(f"   ✗ {name} {p}: {msg}")
    if canh_bao:
        print(f"\n⚠ {len(canh_bao)} chỗ ĐỌC MÀ KHÔNG KHAI — vân tay resume không phủ chúng:")
        for c in sorted(set(canh_bao)):
            print(f"   {c}")
    return 1 if failures else 0
