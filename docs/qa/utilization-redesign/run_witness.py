"""Production CDP witness cho redesign lens Sử dụng (desktop only).

Chạy sau ``npm run build`` và ``npm run preview -- --host 127.0.0.1 --port 4173``::

    EVCS_APP=http://127.0.0.1:4173/ uv run python docs/qa/utilization-redesign/run_witness.py

Artifact gồm screenshot ba viewport, các state peak/trough/missing-heavy/disabled/story,
DOM/accessibility probes và performance/query evidence. Mobile cố ý ngoài phạm vi theo spec.
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

HERE = Path(__file__).parent
ROOT = HERE.parents[2]

_spec = importlib.util.spec_from_file_location(
    "_phase10_witness", ROOT / "docs/qa/phase10/run_witness.py"
)
assert _spec and _spec.loader
_phase10 = importlib.util.module_from_spec(_spec)
sys.modules["_phase10_witness"] = _phase10
_spec.loader.exec_module(_phase10)
Cdp = _phase10.Cdp

APP = os.environ.get("EVCS_APP", "http://127.0.0.1:4173/")
PORT = 9334
VIEWPORTS = [(1280, 800), (1440, 900), (1600, 1000)]


PROBE_JS = r"""
(() => {
  const chartLabel = 'tỉ lệ cổng bận theo ô giờ';
  const chart = [...document.querySelectorAll('div')].find((el) =>
    [...el.children].some((c) => c.textContent?.trim() === chartLabel));
  const read = document.querySelector('aside') ?? document.querySelector('[class*=read]');
  const buttons = [...document.querySelectorAll('button[aria-label*="cổng bận"], button[aria-label*="quan sát"]')];
  const selected = buttons.find((b) => b.getAttribute('aria-pressed') === 'true');
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1),
      visible:r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth};
  };
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(Number); return {r:p[0],g:p[1],b:p[2],a:p[3] ?? 1};
  };
  const over = (fg,bg) => ({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1});
  const lum = (c) => { const f=(v)=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}; return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b); };
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const bgOf=(el)=>{const stack=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0)stack.push(c);if(c&&c.a>=1)break;}let b={r:255,g:255,b:255,a:1};for(let i=stack.length-1;i>=0;i--)b=over(stack[i],b);return b;};
  const badContrast=[];
  if (read) {
    const walker=document.createTreeWalker(read,NodeFilter.SHOW_TEXT);
    for(let n=walker.nextNode();n;n=walker.nextNode()){
      const text=n.textContent.trim(); if(!text)continue; const el=n.parentElement; const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden'||!el.getClientRects().length||el.closest('.sr-only'))continue;
      const fg=parse(cs.color); if(!fg)continue; const bg=bgOf(el); const cr=ratio(over(fg,bg),bg);
      if(cr<4.5)badContrast.push({text:text.slice(0,70),ratio:+cr.toFixed(2),size:cs.fontSize});
    }
  }
  const tooSmall=[...document.querySelectorAll('button,input,[role=button]')].filter((el)=>{
    const r=el.getBoundingClientRect(); return r.width>0&&r.height>0&&(r.width<24||r.height<24);
  }).slice(0,20).map((el)=>({label:(el.getAttribute('aria-label')||el.textContent||el.tagName).trim().slice(0,60),...rect(el)}));
  const bodyText=document.body.innerText;
  return {
    hash: location.hash,
    chart: rect(chart),
    chartCells: buttons.length,
    selectedName: selected?.getAttribute('aria-label') ?? null,
    selectedRect: rect(selected),
    hasSharedAxis: bodyText.includes('trục 0–100% chung cho cả 7 ngày'),
    hasMetricDefinition: bodyText.includes('Σ cổng bận trung bình ÷ Σ cổng lắp đặt'),
    hasOverloadDisclaimer: bodyText.includes('không phải “quá tải”'),
    hasTimezoneDisclosure: bodyText.toLowerCase().includes('múi giờ') && bodyText.toLowerCase().includes('chưa'),
    hasRegionMode: bodyText.includes('VÙNG TẢI'),
    hasStationMode: bodyText.includes('TRẠM'),
    hasCoverage: bodyText.includes('Coverage toàn tỉnh ở giờ này'),
    hasMissingLegend: bodyText.includes('vân xám: không có giá trị'),
    hasExtremaReadout: bodyText.includes('Cao nhất') && bodyText.includes('thấp nhất'),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    badContrast,
    tooSmall,
    bodyExcerpt: bodyText.slice(0,1800),
  };
})()
"""


def goto(cdp: Cdp, hash_part: str) -> None:
    cdp.call("Page.navigate", {"url": "about:blank"})
    time.sleep(0.15)
    cdp.call("Page.navigate", {"url": APP + hash_part})
    cdp.wait_for("document.body && document.body.innerText.length > 500", timeout=60)


def main() -> None:
    chromium = shutil.which("chromium") or shutil.which("google-chrome-stable")
    if not chromium:
        raise RuntimeError("chromium not found")
    profile = tempfile.mkdtemp(prefix="evcs-util-cdp-")
    proc = subprocess.Popen([
        chromium, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
        "--window-size=1600,1000", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    report: dict = {
        "app": APP,
        "dpr": 1,
        "mobile": "out-of-scope",
        # Render phần mềm: `frame*Ms` phản ánh SwiftShader, không phản ánh mã. Chỉ
        # `commit*Ms`, `resourceDelta` và `longTasks` là số có thể chấm ở đây.
        "renderer": "headless swiftshader (software) — frame timings not comparable to Phase 10 GPU baseline",
        "states": {},
        "failures": [],
    }
    try:
        for _ in range(150):
            try:
                pages = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=1).read())
                break
            except (OSError, urllib.error.URLError, json.JSONDecodeError):
                time.sleep(0.1)
        else:
            raise RuntimeError("CDP không lên")
        page = next(p for p in pages if p["type"] == "page")
        cdp = Cdp(page["webSocketDebuggerUrl"])
        for domain in ("Page", "Runtime", "Network", "Performance"):
            cdp.call(f"{domain}.enable")

        # Ba viewport bắt buộc, cùng state peak để so layout trực tiếp.
        for width, height in VIEWPORTS:
            cdp.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
            goto(cdp, "#tinh=01&f=station%3Aocc&m=2d&t=167&ur=region")
            cdp.wait_for("document.body.innerText.includes('tỉ lệ cổng bận theo ô giờ')", timeout=60)
            cdp.wait_for("document.querySelectorAll('button[aria-label*=\"cổng bận\"],button[aria-label*=\"quan sát\"]').length === 168", timeout=60)
            time.sleep(1.2)
            key = f"peak-{width}x{height}"
            report["states"][key] = cdp.evaluate(PROBE_JS)
            cdp.screenshot(str(HERE / f"after-{key}.png"))

        # Các state còn lại ở viewport chuẩn 1440×900.
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        for name, hash_part, wait_text in [
            ("trough", "#tinh=01&f=station%3Aocc&m=2d&t=51&ur=region", "tỉ lệ cổng bận theo ô giờ"),
            ("selected-zero-station", "#tinh=01&f=station%3Aocc&m=2d&t=51&ur=station&c=station%3Avn-c-hno0001", "vn-c-hno0001"),
            ("selected-region", "#tinh=01&f=station%3Aocc&m=2d&t=51&ur=region&c=ur1%3A6%3A86415ca57ffffff", "Vùng tải"),
            ("missing-heavy", "#tinh=68&f=station%3Aocc&m=2d&t=99&ur=region", "tỉ lệ cổng bận theo ô giờ"),
            # Gói disabled có thể canonicalize field hash; probe phải ghi lại ĐÚNG màn hình
            # thực tế thay vì timeout trước khi ta biết nó đã làm gì.
            ("disabled", "#tinh=11&f=station%3Aocc&m=2d&t=108&ur=region", None),
            ("story", "#s=nhip-tuan&m=2d", "múi giờ"),
        ]:
            goto(cdp, hash_part)
            if wait_text:
                cdp.wait_for(f"document.body.innerText.includes({json.dumps(wait_text)})", timeout=60)
            if name == "selected-zero-station":
                cdp.wait_for(
                    "!document.body.innerText.includes('Đang nạp dữ liệu trạm') && "
                    "document.body.innerText.includes('Tỉ lệ cổng bận tại')",
                    timeout=60,
                )
            if name == "selected-region":
                cdp.wait_for(
                    "!document.body.innerText.includes('Đang dựng chỉ mục vùng tải') && "
                    "document.body.innerText.includes('trạm đóng góp')",
                    timeout=60,
                )
            time.sleep(1.0)
            report["states"][name] = cdp.evaluate(PROBE_JS)
            cdp.screenshot(str(HERE / f"after-{name}-1440x900.png"))

        # Keyboard: focus ô đang chọn, ArrowRight phải đổi cả hash và aria-pressed.
        goto(cdp, "#tinh=01&f=station%3Aocc&m=2d&t=51&ur=region")
        cdp.wait_for("document.querySelectorAll('button[aria-label*=\"cổng bận\"],button[aria-label*=\"quan sát\"]').length === 168", timeout=60)
        cdp.evaluate("document.querySelector('button[aria-pressed=true][aria-label*=\"cổng bận\"],button[aria-pressed=true][aria-label*=\"quan sát\"]')?.focus()")
        before = cdp.evaluate("({hash:location.hash,label:document.activeElement?.getAttribute('aria-label')})")
        cdp.key("ArrowRight", "ArrowRight", 39)
        time.sleep(0.35)
        after = cdp.evaluate("({hash:location.hash,label:document.activeElement?.getAttribute('aria-label'),pressed:document.activeElement?.getAttribute('aria-pressed')})")
        report["keyboard"] = {"before": before, "after": after}

        # ── Sonde MÃ HOÁ (§21.5 mục 4) ────────────────────────────────────────────────
        #
        # Ba test `node --test` khoá `utilY` như một hàm. Sonde này khoá thứ khác: rằng cái
        # ĐƯỢC VẼ RA thật sự đi qua hàm ấy. Nó đọc phần trăm từ dòng đọc số (thứ người dùng
        # đọc), đọc toạ độ dấu chọn từ SVG (thứ người dùng nhìn), rồi kiểm hai cái khớp
        # nhau theo đúng công thức trục tuyệt đối. Một lần lật dấu, một lần autoscale lén,
        # hay một hàng lệch chỗ đều gãy ở đây và không gãy ở đâu khác.
        encoding = cdp.evaluate(r"""
          (() => {
            const svg=[...document.querySelectorAll('svg')].find(s=>s.querySelector('pattern[id="util-day-null-hatch"]'));
            if(!svg) return {error:'no-chart-svg'};
            const M={top:8,left:28,right:4}, ROW_H=24, GAP=4, W=svg.width.baseVal.value;
            const marker=[...svg.querySelectorAll('rect')].find(r=>
              r.getAttribute('stroke-width')==='1.5' && r.getAttribute('width')==='7');
            const text=document.body.innerText;
            const m=text.match(/ô giờ (\d+) · ([\d,]+)% cổng bận/);
            if(!m) return {error:'no-readout', excerpt:text.slice(0,200)};
            const hour=Number(m[1]), pct=Number(m[2].replace(',','.'))/100;
            const dowLabel=text.match(/(Thứ Hai|Thứ Ba|Thứ Tư|Thứ Năm|Thứ Sáu|Thứ Bảy|Chủ Nhật) · ô giờ/);
            const dows=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
            const dow=dows.indexOf(dowLabel?dowLabel[1]:'');
            const rowTop=M.top+dow*(ROW_H+GAP);
            const expectedY=rowTop+ROW_H*(1-pct);
            const colW=(W-M.left-M.right)/24;
            const expectedX=M.left+hour*colW+colW/2;
            const actualY=marker?Number(marker.getAttribute('y'))+3.5:null;
            const actualX=marker?Number(marker.getAttribute('x'))+3.5:null;
            // Mọi path phải nằm TRONG dải hàng của nó — một hàng tràn sang hàng khác nghĩa
            // là trục đã co giãn theo dữ liệu ở đâu đó.
            const paths=[...svg.querySelectorAll('path[stroke-width="2"]')];
            const ys=paths.flatMap(p=>[...p.getAttribute('d').matchAll(/[ML][\d.]+ ([\d.]+)/g)].map(x=>Number(x[1])));
            const outOfBand=ys.filter(y=>{
              const r=Math.floor((y-M.top)/(ROW_H+GAP));
              const top=M.top+r*(ROW_H+GAP);
              return !(r>=0&&r<=6&&y>=top-0.01&&y<=top+ROW_H+0.01);
            }).length;
            return {dow,hour,pct,expectedY:+expectedY.toFixed(2),actualY,
              dyPx:actualY===null?null:+(actualY-expectedY).toFixed(2),
              expectedX:+expectedX.toFixed(2),actualX,
              dxPx:actualX===null?null:+(actualX-expectedX).toFixed(2),
              pathPoints:ys.length,outOfBand};
          })()
        """)
        report["encoding"] = encoding
        if encoding.get("error"):
            report["failures"].append(f"encoding probe: {encoding['error']}")
        else:
            # Ngưỡng 0,6 px: toạ độ SVG in 2 chữ số thập phân và phần trăm ở dòng đọc số
            # làm tròn 1 chữ số — 0,05 điểm % trên một hàng 24 px là 0,012 px, nên phần dư
            # còn lại là làm tròn của chính con số hiển thị, không phải của phép đặt chỗ.
            # `or 99` là SAI ở đây và đã báo động nhầm một lần: lệch đúng `0` px — kết quả
            # TỐT NHẤT có thể — là falsy trong Python, nên nó rơi vào nhánh mặc định 99 và
            # bị chấm là fail. Cổng phải phân biệt "không có số" với "số bằng 0".
            for axis, key in (("giá trị", "dyPx"), ("giờ", "dxPx")):
                delta = encoding.get(key)
                if delta is None:
                    report["failures"].append(f"encoding: không đo được lệch theo trục {axis}")
                elif abs(delta) > 0.6:
                    report["failures"].append(f"encoding: dấu chọn lệch {delta}px theo trục {axis}")
            if encoding.get("outOfBand", 1) != 0:
                report["failures"].append(f"encoding: {encoding['outOfBand']} điểm nằm ngoài dải hàng của nó")
            if encoding.get("pathPoints", 0) < 100:
                report["failures"].append(f"encoding: chỉ {encoding.get('pathPoints')} điểm path — hình gần như trống")

        # Query/performance: dùng slider thật, phát 168 input event sau warm-up; đếm resource
        # request mới và Long Task observer. DuckDB query không phải resource request, nên cổng
        # quyết định vẫn nằm ở query spy unit test; phép này là browser evidence bổ sung.
        perf = cdp.evaluate(r"""
          (async () => {
            const slider=document.querySelector('[role=slider][aria-label="Giờ trong tuần"]');
            if(!slider)return {error:'no-slider'};
            const entries=[]; const obs=new PerformanceObserver((list)=>entries.push(...list.getEntries().map(e=>e.duration)));
            try{obs.observe({entryTypes:['longtask']})}catch{}
            const before=performance.getEntriesByType('resource').length;
            const seen=new Set([slider.getAttribute('aria-valuenow')]);
            const commits=[];   // thời gian ĐỒNG BỘ của dispatch: store update + React commit
            const frames=[];    // cả frame, gồm cả phần chờ rAF
            const start=performance.now();
            // NHƯỜNG một frame giữa hai phím. Vòng lặp đồng bộ trước đây phát đủ 168 sự
            // kiện nhưng React không render lại giữa chúng, nên cả 168 handler đọc CÙNG
            // một `t` đóng gói và tất cả tính ra `t+1` — `aria-valuenow` chỉ nhích đúng
            // một bậc. Nó đo một burst, không đo 168 lần cập nhật; cổng §18.2 nói về cái
            // thứ hai.
            for(let i=0;i<168;i++){
              const t0=performance.now();
              slider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true}));
              const t1=performance.now();
              commits.push(t1-t0);
              await new Promise(r=>requestAnimationFrame(r));
              frames.push(performance.now()-t0);
              // Đếm GIÁ TRỊ RIÊNG BIỆT, không lấy hiệu đầu-cuối: đúng 168 bước quay trọn
              // một vòng tuần và về lại chỗ cũ, nên hiệu bằng 0 ở CẢ hai trường hợp
              // "chạy đủ" lẫn "không chạy lần nào".
              seen.add(slider.getAttribute('aria-valuenow'));
            }
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const elapsed=performance.now()-start; obs.disconnect();
            const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return +s[Math.floor(s.length*p)].toFixed(2)};
            return {elapsedMs:+elapsed.toFixed(2),resourceDelta:performance.getEntriesByType('resource').length-before,
              longTasks:entries.length,maxLongTaskMs:entries.length?+Math.max(...entries).toFixed(2):0,
              distinctValues:seen.size,
              commitP50Ms:q(commits,0.5),commitP95Ms:q(commits,0.95),
              frameP50Ms:q(frames,0.5),frameP95Ms:q(frames,0.95),
              finalValue:slider.getAttribute('aria-valuenow'),hash:location.hash};
          })()
        """, await_promise=True)
        report["performance"] = perf

        for key, state in report["states"].items():
            if state.get("horizontalOverflow"):
                report["failures"].append(f"{key}: horizontal overflow")
            if state.get("badContrast"):
                report["failures"].append(f"{key}: {len(state['badContrast'])} text runs below 4.5:1")
            if key.startswith("peak-"):
                for field in ("hasSharedAxis", "hasMetricDefinition", "hasOverloadDisclaimer", "hasTimezoneDisclosure", "hasRegionMode", "hasCoverage", "hasMissingLegend", "hasExtremaReadout"):
                    if not state.get(field): report["failures"].append(f"{key}: missing {field}")
        if perf.get("error"):
            report["failures"].append(f"scrub probe: {perf['error']}")
        elif perf.get("resourceDelta") != 0:
            report["failures"].append(f"scrub: {perf['resourceDelta']} resource requests")
        if perf.get("longTasks", 0) != 0:
            report["failures"].append(f"scrub: {perf['longTasks']} long tasks")
        # Không có cổng này thì một probe phát đủ 168 sự kiện nhưng chỉ làm `t` nhích MỘT
        # bậc vẫn "pass", và cổng §18.2 trở thành một phép đo về burst chứ không về scrub.
        if perf.get("distinctValues", 0) != 168:
            report["failures"].append(
                f"scrub: chỉ thấy {perf.get('distinctValues')}/168 giá trị `t` riêng biệt — probe không đo được scrub"
            )
        # §18.2 nói p95 từ store update tới layer/chart update ≤ 16,7 ms. Con số ĐO ĐƯỢC ở
        # đây là `commitP95Ms` — phần ĐỒNG BỘ: reducer + React commit + `setProps` của deck.
        #
        # `frameP95Ms` KHÔNG so được với cổng ấy và không được dùng làm cổng: witness chạy
        # headless trên SwiftShader (render phần mềm), nên một frame ở đây tốn ~90 ms vì
        # GPU giả lập, không vì mã của ta. Baseline Phase 10 đo trên GPU thật; so hai con
        # số ấy với nhau là so hai cái máy. Nó được GHI LẠI, không được chấm.
        if (perf.get("commitP95Ms") or 0) > 16.7:
            report["failures"].append(f"scrub: commit p95 {perf['commitP95Ms']}ms > 16.7ms")

        (HERE / "witness-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        proc.terminate()
        try: proc.wait(timeout=5)
        except subprocess.TimeoutExpired: proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
