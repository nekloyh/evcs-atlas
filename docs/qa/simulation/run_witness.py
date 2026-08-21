"""Witness CDP cho panel MÔ PHỎNG TRẠM GIẢ ĐỊNH — UX_SIMULATION_REDESIGN_SPEC §20.3.

    uv run python docs/qa/simulation/run_witness.py             # tự dựng `vite` ở :5175
    EVCS_APP=http://127.0.0.1:4173/ uv run python docs/qa/simulation/run_witness.py

Bảy tiêu chí của spec chỉ tồn tại trong một trình duyệt thật và không một test `node --test`
nào với tới được: bề rộng/chiều cao thật của thẻ, tràn ngang, tương phản trên NỀN ĐÃ
COMPOSITE, và "outcome nằm trong khung nhìn đầu tiên của panel". `web/test/simulation-panel
.test.ts` là cổng rẻ chặn tái phát; đây là nơi các con số được ĐO.

Lớp `Cdp` dùng lại từ witness Phase 10 — một client CDP, một chỗ sửa.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
WEB = ROOT / "web"

_spec = importlib.util.spec_from_file_location(
    "_phase10_witness", ROOT / "docs/qa/phase10/run_witness.py"
)
assert _spec and _spec.loader
_phase10 = importlib.util.module_from_spec(_spec)
sys.modules["_phase10_witness"] = _phase10
_spec.loader.exec_module(_phase10)
Cdp = _phase10.Cdp

PORT = 9331
VITE_PORT = 5175
APP = os.environ.get("EVCS_APP", f"http://127.0.0.1:{VITE_PORT}/")
LIVE = urlparse(APP).hostname not in {"127.0.0.1", "localhost", "::1"}

# §3.1 — deep link baseline. Toạ độ nằm ở Xã Tây Phương của gói p/01. Các con số kết quả
# KHÔNG được hằng số hoá ở đây: witness đọc chúng từ chính DOM và chỉ khẳng định các bất
# biến về HÌNH DẠNG.
DEEP_LINK = "#tinh=01&f=population&m=2d&sim=21.05239,105.61395"
DEFAULT_VIEWPORTS = [(1280, 800), (1440, 900), (1600, 1000), (1920, 1080), (2560, 1600)]


def configured_viewports() -> list[tuple[int, int]]:
    """Cho phép QA thị giác chạy riêng màn desktop thật mà không nới AC mặc định."""
    raw = os.environ.get("EVCS_VIEWPORTS")
    if not raw:
        return DEFAULT_VIEWPORTS
    return [tuple(map(int, item.lower().split("x", 1))) for item in raw.split(",")]


VIEWPORTS = configured_viewports()


# §17 — 320 px dưới 1440, 340 px từ 1440.
def expected_width(w: int) -> int:
    return 340 if w >= 1440 else 320


MEASURE_JS = r"""
(() => {
  const card = document.querySelector('aside[aria-labelledby="sim-panel-title"]');
  if (!card) return { error: 'no-sim-card' };
  const map = document.querySelector('main[aria-label="Không gian bản đồ chính"]')
    ?? document.querySelector('main');
  const cardRect = card.getBoundingClientRect();
  const mapRect = map.getBoundingClientRect();
  const scroller = card.querySelector('.custom-scrollbar');

  // Nền ĐÃ COMPOSITE: đi ngược cây tổ tiên tới lớp nền đầu tiên không trong suốt, rồi
  // alpha-blend từ ngoài vào. Đọc `backgroundColor` của chính phần tử là cách bỏ sót
  // đúng lỗi mà spec bắt được — chữ sáng trên một tấm `bg-*/60` đè lên nền sáng.
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) stack.push(c);
      if (c && c.a >= 1) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const bad = [];
  const texts = [];
  const textContrasts = [];
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    if (!t) continue;
    const el = n.parentElement;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('.sr-only')) continue;
    if (!el.getClientRects().length) continue;
    texts.push(t);
    const fg = parse(cs.color);
    if (!fg) continue;
    const r = ratio(over(fg, bgOf(el)), bgOf(el));
    textContrasts.push(r);
    if (r < 4.5) bad.push({ text: t.slice(0, 60), ratio: Math.round(r * 100) / 100, size: cs.fontSize });
  }

  const surfaceMetric = (selector) => {
    const el = card.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    return {
      background: cs.backgroundColor,
      foreground: cs.color,
      contrast: fg ? Math.round(ratio(over(fg, bg), bg) * 100) / 100 : null,
    };
  };

  const outcome = card.querySelector('[role="status"]');
  const headings = [...card.querySelectorAll('h2')].map((h) => h.textContent.trim());
  const inFirstViewport = (el) => {
    if (!el || !scroller) return false;
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    return r.bottom <= s.bottom + 1;
  };

  // Vòng 2.1 AC-01 — V1+V2+V3 trọn trong khung nhìn đầu của scroller (đo rect); V4
  // được phép bắt đầu dưới mép. Đo cả rect để report còn đọc được số.
  const blockRect = (k) => {
    const el = card.querySelector(`[data-sim-block="${k}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), inFold: inFirstViewport(el) };
  };
  const blocks = { v1: blockRect('v1'), v2: blockRect('v2'), v3: blockRect('v3'), v4: blockRect('v4') };

  // Vòng 2.1 AC-03 — segmented bar: chỉ phân đoạn ≠0 được render.
  const segbar = card.querySelector('[data-sim-segbar]');
  const segments = segbar
    ? [...segbar.querySelectorAll('[data-sim-seg]')].map((d) => ({
        key: d.getAttribute('data-sim-seg'),
        label: d.textContent.trim(),
        w: Math.round(d.getBoundingClientRect().width),
      }))
    : null;

  const bars = [...card.querySelectorAll('figure > div > div')]
    .map((d) => Math.round(d.getBoundingClientRect().width));
  const badge = card.querySelector('[data-sim-badge]');
  const medians = card.querySelector('[data-sim-medians]');
  const delta = card.querySelector('[data-sim-delta]');
  const lineCount = (el) => {
    if (!el) return null;
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
    return lineHeight > 0 ? Math.round(el.getBoundingClientRect().height / lineHeight) : null;
  };
  const deltaChildren = delta ? [...delta.children].map((el) => el.getBoundingClientRect()) : [];
  const deltaGaps = deltaChildren.slice(1).map((r, i) => r.left - deltaChildren[i].right);

  return {
    card: { w: Math.round(cardRect.width), h: Math.round(cardRect.height) },
    mapH: Math.round(mapRect.height),
    heightFrac: Math.round((cardRect.height / mapRect.height) * 1000) / 1000,
    scroller: scroller
      ? { scrollW: scroller.scrollWidth, clientW: scroller.clientWidth,
          scrollH: scroller.scrollHeight, clientH: scroller.clientHeight }
      : null,
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    h1: card.querySelectorAll('h1').length,
    locality: card.querySelector('#sim-panel-title')?.nextElementSibling?.textContent ?? null,
    headings,
    outcomeText: outcome ? outcome.textContent.trim() : null,
    blocks,
    segments,
    segbarAria: segbar ? segbar.getAttribute('aria-label') : null,
    detailsOpen: [...card.querySelectorAll('details')].map((d) => d.open),
    barWidths: bars,
    compression: {
      badgeLines: lineCount(badge),
      medianLines: lineCount(medians),
      medianOverflow: medians ? medians.scrollWidth > medians.clientWidth + 1 : null,
      deltaOverflow: delta ? delta.scrollWidth > delta.clientWidth + 1 : null,
      deltaMinGap: deltaGaps.length ? Math.round(Math.min(...deltaGaps)) : null,
    },
    // §UX-SIM-09 — không H3 và không toạ độ trước khi mở `Chi tiết vị trí`.
    h3Visible: /\b8[0-9a-f]{14}\b/.test(card.innerText),
    coordVisible: /\d{2}\.\d{5},\s*\d{3}\.\d{5}/.test(card.innerText),
    // §UX-SIM-15 — không con số nào đọc được còn dấu chấm THẬP PHÂN. Dấu chấm PHÂN NHÓM
    // của vi-VN ("31.746") là đúng, nên phần sau dấu chấm phải khác 3 chữ số mới là lỗi.
    dotDecimals: (card.innerText.match(/\d\.\d{1,2}(?!\d)/g) ?? []).slice(0, 5),
    // Vòng 2.1 AC-04 — thêm ngôn ngữ phê duyệt/đề xuất/khuyến nghị vào danh sách cấm.
    forbidden: ['ĐỀ XUẤT', 'TỪ CHỐI', 'Sàng lọc L6', 'doanh thu', 'giảm tải', 'tối ưu',
                'phê duyệt', 'đề xuất', 'khuyến nghị', 'nên đầu tư']
      .filter((w) => card.innerText.includes(w)),
    badContrast: bad,
    minTextContrast: textContrasts.length
      ? Math.round(Math.min(...textContrasts) * 100) / 100
      : null,
    colorSurfaces: {
      banner: surfaceMetric('[data-sim-banner]'),
      heroReadout: surfaceMetric('[data-sim-hero="readout"]'),
      heroUncertain: surfaceMetric('[data-sim-hero="display"]'),
      nearest: surfaceMetric('[data-sim-nearest]'),
    },
    nTexts: texts.length,
  };
})()
"""


def start_vite():
    if "EVCS_APP" in os.environ:
        return None
    proc = subprocess.Popen(
        ["pnpm", "exec", "vite", "--host", "127.0.0.1", "--port", str(VITE_PORT), "--strictPort"],
        cwd=WEB,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(200):
        try:
            with urllib.request.urlopen(APP, timeout=1):
                return proc
        except (OSError, urllib.error.URLError):
            time.sleep(0.15)
    proc.terminate()
    raise RuntimeError(f"vite không lên ở {APP}")


def main() -> None:
    chromium = shutil.which("chromium") or shutil.which("google-chrome-stable")
    if not chromium:
        raise RuntimeError("chromium not found")
    vite = start_vite()
    profile = tempfile.mkdtemp(prefix="evcs-sim-cdp-")
    proc = subprocess.Popen(
        [
            chromium,
            "--headless=new",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={profile}",
            "--window-size=2560,1600",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    report: dict = {"app": APP, "mode": "live" if LIVE else "local", "viewports": {}}
    try:
        for _ in range(120):
            try:
                pages = json.loads(
                    urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=1).read()
                )
                break
            except (OSError, urllib.error.URLError, json.JSONDecodeError):
                time.sleep(0.1)
        else:
            raise RuntimeError("CDP không lên")
        page = next(p for p in pages if p["type"] == "page")
        cdp = Cdp(page["webSocketDebuggerUrl"])
        for domain in ("Page", "Runtime", "Network"):
            cdp.call(f"{domain}.enable")

        failures: list[str] = []
        for w, h in VIEWPORTS:
            cdp.call(
                "Emulation.setDeviceMetricsOverride",
                {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False},
            )
            cdp.call("Page.navigate", {"url": f"{APP}{DEEP_LINK}"})
            cdp.wait_for(
                "!!document.querySelector('aside[aria-labelledby=\"sim-panel-title\"] h2')",
                timeout=60,
            )
            time.sleep(1.2)  # để lượt tính vùng và một khung vẽ deck ổn định
            m = cdp.evaluate(MEASURE_JS)
            report["viewports"][f"{w}x{h}"] = m
            cdp.screenshot(str(HERE / f"sim-{w}x{h}.png"))

            # Ảnh thứ hai, đã cuộn tới đáy: mọi tiết SAU fold (Trước/Sau, khu vực, cần
            # kiểm tra tiếp, ba disclosure) chỉ chứng minh được là có render bằng một ảnh
            # thật. Đo chiều rộng ở trạng thái cuộn cũng là phép kiểm §17 lần thứ hai.
            cdp.evaluate(
                "(() => { const s = document.querySelector("
                "'aside[aria-labelledby=\"sim-panel-title\"] .custom-scrollbar');"
                " s.scrollTop = s.scrollHeight; return s.scrollTop; })()"
            )
            time.sleep(0.4)
            cdp.screenshot(str(HERE / f"sim-{w}x{h}-scrolled.png"))
            tail = cdp.evaluate(MEASURE_JS)
            if (
                tail.get("scroller")
                and tail["scroller"]["scrollW"] > tail["scroller"]["clientW"] + 1
            ):
                failures.append(f"UX-SIM-17 {w}x{h}: scroller tràn ngang khi đã cuộn")
            if tail.get("badContrast"):
                failures.append(
                    f"UX-SIM-02 {w}x{h} (đã cuộn): {len(tail['badContrast'])} chuỗi dưới 4,5:1 — "
                    + json.dumps(tail["badContrast"][:3], ensure_ascii=False)
                )
            report["viewports"][f"{w}x{h}-scrolled"] = tail

            # UX-SIM-10 — bấm một hàng địa danh phải đưa bản đồ tới nhóm ấy mà KHÔNG tạo
            # selection và KHÔNG xoá ứng viên. Đây là chỗ dễ hỏng nhất của luật một-tiêu-
            # điểm: một `selectEntity` lẻn vào là ứng viên biến mất ngay giữa thao tác.
            interaction = cdp.evaluate(
                r"""
                (() => {
                  const card = document.querySelector('aside[aria-labelledby="sim-panel-title"]');
                  // Vòng 2.1 §3 — hàng địa danh nằm trong disclosure "Khu vực liên quan"
                  // (đóng mặc định): mở nó trước, như một người dùng thật.
                  const locDetails = [...card.querySelectorAll('details')].find((d) =>
                    d.querySelector('summary')?.textContent.includes('Khu vực liên quan'));
                  if (locDetails) locDetails.open = true;
                  const row = [...card.querySelectorAll('button[aria-label^="Xem "]')][0];
                  if (!row) return { skipped: 'không có hàng địa danh' };
                  const before = location.hash;
                  // `el.click()` KHÔNG đưa tiêu điểm như một cú bấm chuột thật — trình
                  // duyệt mới là bên focus `<button>`. Focus tay trước rồi mới click, nếu
                  // không phép đo bên dưới đo chính cái probe chứ không đo ứng dụng.
                  row.focus();
                  const focusedRow = document.activeElement === row;
                  row.click();
                  return {
                    label: row.getAttribute('aria-label').slice(0, 50),
                    hashBefore: before,
                    focusedRow,
                    // Panel còn sống ⇒ ứng viên còn; `c=` vắng ⇒ không có selection nào.
                    stillSim: !!document.querySelector('aside[aria-labelledby="sim-panel-title"]'),
                    focusStillOnRow: document.activeElement === row,
                    focusStillInPanel: card.contains(document.activeElement),
                  };
                })()
                """
            )
            time.sleep(0.8)
            after_hash = cdp.evaluate("location.hash")
            interaction["hashAfter"] = after_hash
            report["viewports"][f"{w}x{h}-locality-click"] = interaction
            if not interaction.get("skipped"):
                if not interaction["stillSim"]:
                    failures.append(f"UX-SIM-10 {w}x{h}: bấm địa danh làm mất ứng viên")
                if "&c=" in after_hash or after_hash.startswith("#c="):
                    failures.append(f"UX-SIM-10 {w}x{h}: bấm địa danh tạo selection ({after_hash})")
                if "sim=" not in after_hash:
                    failures.append(f"UX-SIM-10 {w}x{h}: `sim=` rụng khỏi hash sau khi bấm")
                if not interaction["focusStillOnRow"]:
                    failures.append(
                        f"§14.4 {w}x{h}: tiêu điểm rời khỏi hàng sau khi bấm "
                        f"(focusedRow={interaction['focusedRow']})"
                    )
            cdp.screenshot(str(HERE / f"sim-{w}x{h}-locality.png"))
            cdp.evaluate(
                "(() => { const c = document.querySelector("
                "'aside[aria-labelledby=\"sim-panel-title\"]'); if (!c) return;"
                " c.querySelectorAll('details').forEach((d) => { d.open = false; });"
                " const s = c.querySelector('.custom-scrollbar'); if (s) s.scrollTop = 0; })()"
            )

            want = expected_width(w)
            if m.get("error"):
                failures.append(f"{w}x{h}: {m['error']}")
                continue
            if m["card"]["w"] != want:
                failures.append(f"UX-SIM-01 {w}x{h}: thẻ rộng {m['card']['w']} px, phải {want}")
            if m["heightFrac"] > 0.725:
                failures.append(f"UX-SIM-01 {w}x{h}: cao {m['heightFrac']:.1%} vùng bản đồ")
            if m["docScrollW"] > m["innerW"]:
                failures.append(f"UX-SIM-17 {w}x{h}: trang tràn ngang")
            if m["scroller"] and m["scroller"]["scrollW"] > m["scroller"]["clientW"] + 1:
                failures.append(f"UX-SIM-17 {w}x{h}: scroller tràn ngang")
            if m["badContrast"]:
                failures.append(
                    f"UX-SIM-02 {w}x{h}: {len(m['badContrast'])} chuỗi dưới 4,5:1 — "
                    + json.dumps(m["badContrast"][:3], ensure_ascii=False)
                )
            if m["h1"] != 1:
                failures.append(f"§15 {w}x{h}: {m['h1']} thẻ h1 (phải đúng 1)")
            # Vòng 2.1 AC-01 — V1+V2+V3 trọn trong fold; V4 được phép cắt.
            blocks = m.get("blocks") or {}
            for key in ("v1", "v2", "v3"):
                b = blocks.get(key)
                if not b:
                    failures.append(f"AC-01 {w}x{h}: thiếu khối {key} trong DOM")
                elif not b["inFold"]:
                    failures.append(f"AC-01 {w}x{h}: {key} tràn khỏi fold (bottom={b['bottom']})")
            # Vòng 2.1 AC-03 — segmented bar tồn tại và không phân đoạn 0 px.
            segs = m.get("segments")
            if segs is None:
                failures.append(f"AC-03 {w}x{h}: không có segmented bar V4")
            else:
                if not (1 <= len(segs) <= 3):
                    failures.append(f"AC-03 {w}x{h}: {len(segs)} phân đoạn")
                for s_ in segs:
                    if s_["w"] <= 0:
                        failures.append(f"AC-03 {w}x{h}: phân đoạn {s_['key']} rộng 0 px")
                if not m.get("segbarAria"):
                    failures.append(f"§9.2 {w}x{h}: segmented bar thiếu aria-label")
            # Vòng 2.1 §3 — 5 disclosure IA + 1 disclosure bảng số của chart (vòng 1) = 6.
            if len(m["detailsOpen"]) != 6:
                failures.append(f"§3 {w}x{h}: {len(m['detailsOpen'])} disclosure (phải 6)")
            if m["h3Visible"] or m["coordVisible"]:
                failures.append(f"UX-SIM-09 {w}x{h}: H3/toạ độ lộ ra trước disclosure")
            if any(m["detailsOpen"]):
                failures.append(f"UX-SIM-11 {w}x{h}: có disclosure mở sẵn")
            if m["forbidden"]:
                failures.append(f"UX-SIM-06/19 {w}x{h}: chuỗi cấm {m['forbidden']}")
            if m["dotDecimals"]:
                failures.append(f"UX-SIM-15 {w}x{h}: dấu chấm thập phân {m['dotDecimals']}")
            if not m["locality"] or "," in (m["locality"] or "") and "·" not in m["locality"]:
                failures.append(f"§10.2 {w}x{h}: dòng địa danh = {m['locality']!r}")

        cdp.call("Emulation.clearDeviceMetricsOverride")
        report["failures"] = failures
        (HERE / "witness-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8"
        )
        if failures:
            print("SIMULATION WITNESS: FAIL")
            for f in failures:
                print(" ·", f)
            sys.exit(1)
        print("SIMULATION WITNESS: PASS")
    finally:
        for child in (proc, vite):
            if child is None:
                continue
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
