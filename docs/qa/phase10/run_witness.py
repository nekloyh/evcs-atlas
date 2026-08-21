"""Phase 10 CDP acceptance witness — TỰ dựng server, tự dọn.

    uv run python docs/qa/phase10/run_witness.py            # tự chạy `vite` ở :5174
    EVCS_APP=http://localhost:5173/ uv run python docs/qa/phase10/run_witness.py

Tự dựng server chứ không đòi một `pnpm dev` có sẵn (khác witness Phase 9): 10-QA-003 đòi
bằng chứng TÁI LẬP ĐƯỢC sau một lần checkout sạch, và "nhớ mở server ở cửa sổ khác" là
đúng cái bước con người quên.

Phase 10 vá hiệu năng, khả năng phục hồi và đường vào bàn phím. Phần lớn tiêu chí của nó
KHÔNG kiểm được bằng `node --test`: một error boundary chỉ tồn tại khi có cây React thật,
`prefers-reduced-motion` là một media query của trình duyệt, và "không tràn ngang ở 760 px"
là một phép đo layout. Witness này là nơi những thứ ấy được đo — `web/test/phase10-release
.test.ts` chỉ là cổng rẻ chặn tái phát trong `make kiem`.

Kết quả ghi ra `witness-report.json` cạnh file này (được Git theo dõi, xem `.gitignore`).
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from websockets.sync.client import connect
except ModuleNotFoundError:
    # Cổng phát hành gọi cả `python run_witness.py`. Nếu shell đang đứng ngoài môi trường
    # uv, re-exec đúng Python của project thay vì chết trước khi phép đo bắt đầu. Không tự
    # cài hay chạm mạng: checkout chưa `uv sync` vẫn fail rõ bằng lỗi import ban đầu.
    project_python = Path(__file__).parents[3] / ".venv/bin/python"
    if project_python.exists() and Path(sys.executable).resolve() != project_python.resolve():
        os.execv(str(project_python), [str(project_python), __file__, *sys.argv[1:]])
    raise

OUT = Path(__file__).parent
PORT = 9330
VITE_PORT = 5174
APP = os.environ.get("EVCS_APP", f"http://127.0.0.1:{VITE_PORT}/")
WEB = Path(__file__).parents[3] / "web"

# Năm bề rộng của §10.6. 760 và 900 là dải một cột; 1024 là mút dưới của hai cột.
WIDTHS = [760, 900, 1024, 1280, 1600]


class Cdp:
    def __init__(self, url: str):
        self.ws = connect(url, max_size=32 * 1024 * 1024)
        self.seq = 0
        self.events: list[dict] = []
        self.style_body: bytes | None = None

    def _record_or_fulfill(self, msg: dict):
        if msg.get("method") == "Fetch.requestPaused" and self.style_body is not None:
            self.seq += 1
            self.ws.send(
                json.dumps(
                    {
                        "id": self.seq,
                        "method": "Fetch.fulfillRequest",
                        "params": {
                            "requestId": msg["params"]["requestId"],
                            "responseCode": 200,
                            "responseHeaders": [
                                {"name": "content-type", "value": "application/json"},
                                {"name": "access-control-allow-origin", "value": "*"},
                            ],
                            "body": base64.b64encode(self.style_body).decode("ascii"),
                        },
                    }
                )
            )
        else:
            self.events.append(msg)

    def call(self, method: str, params: dict | None = None) -> dict:
        self.seq += 1
        ident = self.seq
        self.ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == ident:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            self._record_or_fulfill(msg)

    def evaluate(self, expression: str, await_promise: bool = False):
        result = self.call(
            "Runtime.evaluate",
            {"expression": expression, "awaitPromise": await_promise, "returnByValue": True},
        )["result"]
        if result.get("subtype") == "error":
            raise RuntimeError(result.get("description"))
        return result.get("value")

    def wait_for(self, expression: str, timeout: float = 30):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                value = self.evaluate(expression)
                if value:
                    return value
            except RuntimeError as exc:
                last = exc  # navigation huỷ execution context trong vài tick
            time.sleep(0.2)
        raise TimeoutError(f"{expression} (lần cuối: {last})")

    def key(self, key: str, code: str, vk: int, text: str | None = None):
        # `text` là bắt buộc cho Enter/Space: không có nó, Chrome gửi một keyDown "thô" và
        # <button> KHÔNG được kích hoạt — một cái bẫy đã làm AT10-3 báo FAIL giả một lần.
        for kind in ("keyDown", "keyUp"):
            params = {
                "type": kind,
                "key": key,
                "code": code,
                "windowsVirtualKeyCode": vk,
                "nativeVirtualKeyCode": vk,
            }
            if text is not None and kind == "keyDown":
                params["text"] = text
            self.call("Input.dispatchKeyEvent", params)
            time.sleep(0.02)

    def type_text(self, text: str):
        for ch in text:
            self.call("Input.dispatchKeyEvent", {"type": "keyDown", "text": ch, "key": ch})
            self.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": ch})
            time.sleep(0.01)

    def screenshot(self, name: str):
        data = self.call(
            "Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False}
        )["data"]
        (OUT / name).write_bytes(base64.b64decode(data))


def goto(cdp: Cdp, hash_part: str):
    """Điều hướng rồi RELOAD.

    Bẫy đã ăn một lần ở harness Phase 9 và một lần ở đây: `Page.navigate` tới một URL chỉ
    khác phần `#` là một same-document navigation — trang KHÔNG tải lại, mà `#tinh` là thứ
    được đọc MỘT LẦN lúc nạp module (`data/province.ts`). Không reload thì màn hình vẫn là
    bộ dữ liệu cũ và mọi phép đo sau đó đo nhầm màn hình.
    """
    # Ghé `about:blank` trước: nó ép một document MỚI, nên lần navigate sau luôn là một
    # lượt nạp đầy đủ. (`Page.reload` ngay sau `Page.navigate` đua với chính lượt navigate
    # đó và trả "Not attached to an active page".)
    cdp.call("Page.navigate", {"url": "about:blank"})
    time.sleep(0.2)
    cdp.call("Page.navigate", {"url": APP + hash_part})


def endpoint(path: str):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=1) as response:
        return json.load(response)


# ── các phép đo ──────────────────────────────────────────────────────────────────

# Một phần tử rộng hơn viewport ⇒ tràn ngang. Bỏ qua canvas của maplibre (nó tự quản
# devicePixelRatio) và các phần tử `position: fixed` cố ý phủ toàn màn.
OVERFLOW_JS = """
(() => {
  const w = document.documentElement.clientWidth;
  const bad = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (el.tagName === 'CANVAS') return false;
    return r.right > w + 1 || r.left < -1;
  }).slice(0, 5).map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').toString().slice(0, 60));
  return { viewport: w, scrollWidth: document.documentElement.scrollWidth, offenders: bad };
})()
"""


def at1_error_boundary(cdp: Cdp) -> dict:
    """Tiêm một exception render THẬT và đọc lại màn hình."""
    goto(cdp, "#tinh=01")
    cdp.wait_for("document.querySelector('main') !== null")
    time.sleep(1.5)

    before = cdp.evaluate("document.body.innerText.length")
    injected = cdp.evaluate(
        "import('/src/AppErrorBoundary.tsx').then(m => {"
        "  const s = m.AppErrorBoundary.getDerivedStateFromError(new Error('tiêm'));"
        "  return s && s.error instanceof Error && s.error.message === 'tiêm';"
        "})",
        True,
    )

    # Phép tiêm ĐẦY ĐỦ: root React riêng, boundary bọc một component ném. Dụng cụ nằm ở
    # `web/test/witness-probe.tsx` — JS trần qua CDP không giải được specifier trần.
    crash_text = cdp.evaluate(
        "import('/test/witness-probe.tsx').then(m => m.crashProbe('mô hình chart gặp ca biên'))",
        True,
    )
    after = cdp.evaluate("document.body.innerText.length")
    return {
        "derived_state_ok": bool(injected),
        "rendered_alert": bool(crash_text and crash_text["alert"]),
        "rendered_message": (crash_text or {}).get("text", "").strip()[:200],
        "rendered_html": (crash_text or {}).get("html", "")[:400],
        "message_carries_cause": "ca biên" in (crash_text or {}).get("text", ""),
        "host_app_survived": before > 0 and after > 0,
        "before_len": before,
        "after_len": after,
    }


def at1b_boot_fallback(cdp: Cdp) -> dict:
    """Chặn ĐÚNG module mà `boot()` import động ⇒ boot ngã trước khi React tồn tại.

    Đây là ca mà `AppErrorBoundary` KHÔNG với tới được (chưa có cây React nào để bọc), nên
    nó là phép kiểm riêng của nhánh `boot().catch` — thứ phải vẽ bằng DOM trần.
    """
    cdp.call("Network.setBlockedURLs", {"urls": ["*/src/App.tsx*"]})
    goto(cdp, "#tinh=01")
    try:
        cdp.wait_for("document.querySelector('#root [role=alert]') !== null", timeout=25)
        ok = True
        text = cdp.evaluate("document.querySelector('#root [role=alert]').textContent")
    except TimeoutError:
        ok = False
        text = cdp.evaluate("document.getElementById('root').textContent")
    finally:
        cdp.call("Network.setBlockedURLs", {"urls": []})
    return {"fallback_shown": ok, "text": (text or "").strip()[:200]}


def at2_filter_coherence(cdp: Cdp) -> dict:
    goto(cdp, "#tinh=01&d=1")
    cdp.wait_for(
        "[...document.querySelectorAll('input')].some(i => (i.placeholder||'').startsWith('Lọc theo'))"
    )
    # Chờ tới khi số đếm THẬT SỰ in ra một con số. `innerText.includes(" dòng")` không đủ:
    # chuỗi ấy có mặt ở bộ chọn cỡ trang trước cả khi truy vấn đầu tiên về.
    cdp.wait_for(
        """/[0-9]/.test(document.querySelector('[aria-live="polite"]')?.innerText || '')""",
        timeout=40,
    )
    time.sleep(0.5)

    js_state = """
    (() => {
      const input = [...document.querySelectorAll('input')].find(i => (i.placeholder||'').startsWith('Lọc theo'));
      const live = document.querySelector('[aria-live="polite"]');
      const exports = [...document.querySelectorAll('button')].filter(b => /^(CSV|PARQUET|ARROW|JSON|NDJSON|GEOJSON)(\\s|$|×)/.test(b.innerText.trim()));
      return {
        typed: input ? input.value : null,
        count: live ? live.innerText.trim() : null,
        exportsDisabled: exports.length > 0 && exports.every(b => b.disabled),
        nExports: exports.length,
      };
    })()
    """
    settled_before = cdp.evaluate(js_state)

    # Gõ vào ô lọc bằng bàn phím thật, rồi đọc ngay trong cửa sổ debounce.
    cdp.evaluate(
        "[...document.querySelectorAll('input')].find(i => (i.placeholder||'').startsWith('Lọc theo')).focus()"
    )
    cdp.type_text("vinfast")
    mid = cdp.evaluate(js_state)  # < 250 ms sau phím cuối
    cdp.screenshot("at10-2-pending.png")

    cdp.wait_for(
        """/[0-9]/.test(document.querySelector('[aria-live="polite"]').innerText)""",
        timeout=20,
    )
    time.sleep(0.3)
    settled_after = cdp.evaluate(js_state)
    cdp.screenshot("at10-2-settled.png")

    # Đổi CỘT SẮP XẾP thì `total` vẫn đúng nguyên — trạng thái chờ KHÔNG được bật ở đây.
    # Đây là phần tinh của R2c: gác bằng `loading` trần thì mỗi lần sắp xếp lại, số đếm
    # biến thành "đang lọc…", tức nói dối theo chiều ngược lại.
    cdp.evaluate(
        "(() => { const b = [...document.querySelectorAll('thead th button')][1];"
        " if (b) b.click(); })()"
    )
    time.sleep(0.25)
    during_sort = cdp.evaluate(js_state)
    return {
        "before": settled_before,
        "during_debounce": mid,
        "after": settled_after,
        "during_sort_change": during_sort,
        "no_stale_number_while_pending": "đang lọc" in (mid.get("count") or ""),
        "sort_change_keeps_number": bool(re.search(r"[0-9]", during_sort.get("count") or "")),
        "export_locked_while_pending": bool(mid.get("exportsDisabled")),
        "export_open_when_settled": settled_after.get("exportsDisabled") is False,
        "count_changed": settled_before.get("count") != settled_after.get("count"),
    }


def at3_keyboard_sort(cdp: Cdp) -> dict:
    header = cdp.evaluate("""
      (() => {
        const th = document.querySelector('thead th button');
        if (!th) return null;
        th.focus();
        return { focused: document.activeElement === th, label: th.innerText.trim() };
      })()
    """)
    cdp.key("Enter", "Enter", 13, "\r")
    time.sleep(1.2)
    sorted_state = cdp.evaluate("""
      (() => {
        const th = [...document.querySelectorAll('thead th')].find(x => x.getAttribute('aria-sort'));
        return th ? { col: th.innerText.trim(), ariaSort: th.getAttribute('aria-sort') } : null;
      })()
    """)
    return {
        "header": header,
        "after_enter": sorted_state,
        "ok": bool(header and header["focused"] and sorted_state and sorted_state["ariaSort"]),
    }


def at6_scrubber_keys(cdp: Cdp) -> dict:
    goto(cdp, "#tinh=01&f=station:occ&t=11")
    cdp.wait_for("document.querySelector('[role=slider][aria-label=\"Giờ trong tuần\"]') !== null")
    time.sleep(1.0)
    read = "(() => { const s = document.querySelector('[role=slider][aria-label=\"Giờ trong tuần\"]'); return { now: +s.getAttribute('aria-valuenow'), text: s.getAttribute('aria-valuetext'), min: +s.getAttribute('aria-valuemin'), max: +s.getAttribute('aria-valuemax') }; })()"
    cdp.evaluate("document.querySelector('[role=slider][aria-label=\"Giờ trong tuần\"]').focus()")
    focused = cdp.evaluate(
        "document.activeElement === document.querySelector('[role=slider][aria-label=\"Giờ trong tuần\"]')"
    )
    start = cdp.evaluate(read)
    for _ in range(3):
        cdp.key("ArrowRight", "ArrowRight", 39)
        time.sleep(0.15)
    after_right = cdp.evaluate(read)
    cdp.key("Home", "Home", 36)
    time.sleep(0.2)
    at_home = cdp.evaluate(read)
    cdp.key("ArrowLeft", "ArrowLeft", 37)  # quay vòng qua mút trái
    time.sleep(0.2)
    wrapped = cdp.evaluate(read)
    cdp.key("End", "End", 35)
    time.sleep(0.2)
    at_end = cdp.evaluate(read)
    play_label = cdp.evaluate(
        "(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label')?.startsWith('chạy') || x.getAttribute('aria-label') === 'dừng'); return b ? b.getAttribute('aria-label') : null; })()"
    )
    cdp.screenshot("at10-6-scrubber-end.png")
    return {
        "focusable": bool(focused),
        "start": start,
        "after_3x_right": after_right,
        "home": at_home,
        "wrap_left_from_home": wrapped,
        "end": at_end,
        "play_button_named": play_label,
        "ok": bool(
            focused
            and after_right["now"] == (start["now"] + 3) % 168
            and at_home["now"] == 0
            and wrapped["now"] == 167
            and at_end["now"] == 167
            and at_end["max"] == 167
            and play_label
        ),
    }


def _toggle_3d(cdp: Cdp, label: str) -> bool:
    return bool(
        cdp.evaluate(
            "(() => { const b = [...document.querySelectorAll('nav button')]"
            f".find(x => x.textContent.trim() === {json.dumps(label)});"
            " if (!b || b.getAttribute('aria-disabled') === 'true') return false; b.click(); return true; })()"
        )
    )


def at4_reduced_motion(cdp: Cdp) -> dict:
    """Đo XEM APP GỌI PHƯƠNG THỨC CAMERA NÀO, chứ không đo hệ quả của nó.

    Bản đầu của phép đo này đếm khung rAF trong 700 ms sau cú bấm và đã bị chính số đo
    BÁC: dưới SwiftShader headless, `easeTo(500 ms)` chỉ kịp 2 khung trong khi nhiễu nền
    là 7 — phép đo không phân biệt nổi hai nhánh. Thứ phân biệt được là lời gọi:
    reduced-motion phải đi `jumpTo`, mặc định đi `easeTo`. Sổ ghi do witness vá vào
    prototype của maplibre TỪ NGOÀI; `src/` không mở một cửa hậu nào.
    """
    # Trường Ô GỘP mới bật được 3D — `can3D` từ chối 34 khối tỉnh (xem `elevation.ts`).
    goto(cdp, "#tinh=vn&f=c:population")
    cdp.wait_for("document.querySelector('.maplibregl-canvas') !== null", timeout=60)
    time.sleep(3.0)

    def measure(reduce: bool) -> list:
        cdp.call(
            "Emulation.setEmulatedMedia",
            {
                "features": [
                    {
                        "name": "prefers-reduced-motion",
                        "value": "reduce" if reduce else "no-preference",
                    }
                ]
            },
        )
        assert (
            cdp.evaluate("window.matchMedia('(prefers-reduced-motion: reduce)').matches") is reduce
        )
        _toggle_3d(cdp, "2D")
        time.sleep(1.0)
        cdp.evaluate("import('/test/witness-probe.tsx').then(m => m.tapCamera())", True)
        assert _toggle_3d(cdp, "3D"), "nút 3D không bấm được — trường đang chọn không phải ô gộp?"
        time.sleep(0.9)
        return (
            cdp.evaluate("import('/test/witness-probe.tsx').then(m => m.readCamera())", True) or []
        )

    reduced = measure(True)
    normal = measure(False)
    cdp.call("Emulation.setEmulatedMedia", {"features": []})
    cdp.screenshot("at10-4-national-3d.png")

    def tilt(calls, method):
        return [c for c in calls if c["method"] == method and c["pitch"] == 50]

    return {
        "media_emulation_honoured": True,
        "calls_reduced": reduced,
        "calls_normal": normal,
        "measure": "phương thức camera của maplibre được gọi sau khi bấm 3D",
        "ok": bool(
            tilt(reduced, "jumpTo")
            and not tilt(reduced, "easeTo")
            and tilt(normal, "easeTo")
            and not tilt(normal, "jumpTo")
        ),
    }


def at9_focus_restore(cdp: Cdp) -> dict:
    goto(cdp, "#tinh=01")
    cdp.wait_for("document.querySelector('main[aria-label]') !== null")
    time.sleep(1.0)
    return cdp.evaluate("""
      (() => {
        const main = document.querySelector('main[aria-label="Không gian bản đồ chính"]');
        if (!main) return { ok: false, why: 'không có main khớp selector của EvidenceCard' };
        main.focus();
        return {
          ok: document.activeElement === main,
          tabIndex: main.tabIndex,
          label: main.getAttribute('aria-label'),
        };
      })()
    """)


# Ba primary surface — Final QA bắt được Story và National giữ rail inline dưới 1024 px
# (bản đồ còn 360/472 px ở màn 760) vì witness cũ chỉ đo route mặc định.
RESPONSIVE_ROUTES = {
    "map": "#tinh=01",
    "story": "#tinh=01&s=von-cuc",
    "national": "#tinh=vn",
}

# Bề rộng THẬT của vùng bản đồ — dưới 1024 px nó phải chiếm trọn viewport (DESIGN.md §3:
# màn hẹp là MỘT cột, cột đọc/cột cảnh/rail chỉ số đều thành sheet).
MAP_WIDTH_JS = """
(() => {
  const el = document.querySelector('.maplibregl-map') || document.querySelector('main');
  return el ? Math.round(el.getBoundingClientRect().width) : 0;
})()
"""


def at10_responsive(cdp: Cdp) -> dict:
    out = {}
    for route, hash_part in RESPONSIVE_ROUTES.items():
        for w in WIDTHS:
            cdp.call(
                "Emulation.setDeviceMetricsOverride",
                {
                    "width": w,
                    "height": 1000,
                    "deviceScaleFactor": 1,
                    "mobile": False,
                },
            )
            goto(cdp, hash_part)
            cdp.wait_for("document.querySelector('main') !== null", timeout=40)
            time.sleep(2.0)
            measured = cdp.evaluate(OVERFLOW_JS)
            measured["map_width"] = cdp.evaluate(MAP_WIDTH_JS)
            measured["no_overflow"] = (
                measured["scrollWidth"] <= measured["viewport"] + 1 and not measured["offenders"]
            )
            if w < 1024:
                # Một cột: bản đồ phủ hết bề ngang (chừa ≤ 8 px cho viền/scrollbar).
                measured["one_column"] = measured["map_width"] >= measured["viewport"] - 8
            out[f"{route}-{w}"] = measured
            cdp.screenshot(f"at10-10-{route}-w{w}.png")
    cdp.call("Emulation.clearDeviceMetricsOverride")
    return out


def start_vite():
    """Dựng dev server riêng ở 127.0.0.1:VITE_PORT. `None` nếu EVCS_APP trỏ ra ngoài."""
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


def main():
    chromium = shutil.which("chromium") or shutil.which("google-chrome-stable")
    if not chromium:
        raise RuntimeError("chromium not found")
    vite = start_vite()
    profile = tempfile.mkdtemp(prefix="evcs-phase10-cdp-")
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
            "--window-size=1600,1000",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(100):
            try:
                pages = endpoint("/json/list")
                break
            except (OSError, urllib.error.URLError, json.JSONDecodeError):
                time.sleep(0.1)
        else:
            raise RuntimeError("CDP did not start")
        page = next(item for item in pages if item["type"] == "page")
        cdp = Cdp(page["webSocketDebuggerUrl"])
        for domain in ("Page", "Runtime", "Network"):
            cdp.call(f"{domain}.enable")
        style_path = Path("/tmp/evcs-voyager-style.json")
        cdp.style_body = (
            style_path.read_bytes()
            if style_path.exists()
            else json.dumps(
                {
                    "version": 8,
                    "sources": {},
                    "layers": [
                        {
                            "id": "background",
                            "type": "background",
                            "paint": {"background-color": "#f2f3f0"},
                        }
                    ],
                }
            ).encode()
        )
        cdp.call(
            "Fetch.enable",
            {
                "patterns": [
                    {"urlPattern": "*voyager-gl-style/style.json*", "requestStage": "Request"}
                ]
            },
        )

        report = {
            "browser": cdp.call("Browser.getVersion").get("product"),
            "viewport": "1600x1000",
            "gpu": "swiftshader (headless) — số FPS KHÔNG lấy từ lần chạy này; xem baseline.md",
            "at10_1_error_boundary": at1_error_boundary(cdp),
            "at10_1b_boot_fallback": at1b_boot_fallback(cdp),
            "at10_2_filter_coherence": at2_filter_coherence(cdp),
            "at10_3_keyboard_sort": at3_keyboard_sort(cdp),
            "at10_6_scrubber_keys": at6_scrubber_keys(cdp),
            "at10_4_reduced_motion": at4_reduced_motion(cdp),
            "at10_9_focus_restore": at9_focus_restore(cdp),
            "at10_10_responsive": at10_responsive(cdp),
        }
        (OUT / "witness-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8"
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))

        a1 = report["at10_1_error_boundary"]
        assert a1["derived_state_ok"] and a1["rendered_alert"] and a1["message_carries_cause"], (
            "AT10-1"
        )
        assert report["at10_1b_boot_fallback"]["fallback_shown"], "AT10-1b"
        a2 = report["at10_2_filter_coherence"]
        assert a2["no_stale_number_while_pending"] and a2["export_locked_while_pending"], "AT10-2"
        assert a2["sort_change_keeps_number"], (
            "AT10-2 (đổi cột sắp xếp KHÔNG được bật trạng thái chờ)"
        )
        assert a2["export_open_when_settled"], "AT10-2 (mở lại sau khi settle)"
        assert report["at10_3_keyboard_sort"]["ok"], "AT10-3"
        assert report["at10_6_scrubber_keys"]["ok"], "AT10-6"
        assert report["at10_4_reduced_motion"]["ok"], (
            "AT10-4 (nhánh reduce vẫn quay vòng animation)"
        )
        assert report["at10_9_focus_restore"]["ok"], "AT10-9"
        for key, measured in report["at10_10_responsive"].items():
            assert measured["no_overflow"], f"AT10-10 tràn ngang ở {key}: {measured['offenders']}"
            if "one_column" in measured:
                assert measured["one_column"], (
                    f"AT10-10 {key}: dưới 1024 px bản đồ phải phủ hết bề ngang, "
                    f"đo được {measured['map_width']}/{measured['viewport']} px"
                )
        print("\nPHASE 10 WITNESS: PASS")
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
