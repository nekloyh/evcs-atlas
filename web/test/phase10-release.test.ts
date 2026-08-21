/**
 * Phase 10 — acceptance tests (`docs/PHASE10_PERFORMANCE_RELEASE.md`).
 *
 * Phase 10 không thêm một trường, một phép tổng hợp hay một luật mã hoá nào: nó vá
 * **hiệu năng, khả năng phục hồi và đường vào bàn phím**. Nên hình dạng của bộ test này
 * khác các phase trước — nó khoá lại hai lớp thứ:
 *
 *  · **Hành vi thật**, chạy được ở `node --test`, cho những mảnh đã được tách thành hàm
 *    thuần đúng để test được: `request-cache.ts` (AT10-5, có file riêng),
 *    `scrubberKeyStep` (AT10-6), `formatFixed` (AT10-7).
 *  · **Bất biến cấu trúc trên mã nguồn** cho những thứ chỉ tồn tại trong cây React hoặc
 *    trong trình duyệt. Đây KHÔNG phải bản thay thế cho witness — `docs/qa/phase10/
 *    run_witness.py` mới là nơi các tiêu chí ấy được đo trên Chrome thật. Test ở đây là
 *    cổng RẺ chặn tái phát: witness cần server + GPU, cổng này chạy trong `make kiem`.
 *
 * Quy ước đọc mã nguồn (bóc chú thích trước khi khớp) giống `query-lifecycle.test.ts`:
 * một bất biến không được phép "đúng" chỉ vì nó được nhắc trong một comment.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { scrubberKeyStep, HOURS_IN_WEEK } from "../src/state/types";
import { formatFixed } from "../src/ui/format";

const SRC = new URL("../src/", import.meta.url).pathname;
const code = (rel: string) =>
  readFileSync(`${SRC}${rel}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const raw = (rel: string) => readFileSync(`${SRC}${rel}`, "utf8");

// ── AT10-1 — lưới an toàn lỗi ───────────────────────────────────────────────────

test("AT10-1a: cả BA điểm vào app đều nằm trong error boundary", () => {
  const main = code("main.tsx");
  const roots = main.match(/createRoot\(/g) ?? [];
  assert.equal(roots.length, 3, "ba shell: tỉnh, toàn quốc, proxy");
  const wrapped = main.match(/<AppErrorBoundary>/g) ?? [];
  assert.equal(
    wrapped.length,
    3,
    "mỗi createRoot phải bọc AppErrorBoundary — một shell hở là một màn hình trắng",
  );
  assert.match(main, /import \{ AppErrorBoundary \}/);
});

test("AT10-1b: boot() có nhánh catch, và nhánh đó KHÔNG phụ thuộc React hay CSS", () => {
  const main = code("main.tsx");
  assert.match(main, /boot\(\)\.catch\(/, "lỗi trước khi React tồn tại phải có người hứng");
  const fallback = main.slice(main.indexOf("boot().catch("));
  assert.match(fallback, /role=["']alert["']/, "thông điệp fallback phải là một alert");
  assert.match(fallback, /style=/, "inline style: fallback phải sống được khi CSS chết");
  assert.doesNotMatch(
    fallback,
    /className|createRoot|<App/,
    "fallback của boot không được đi qua React hay lớp token",
  );
});

test("AT10-1c: boundary chuyển lỗi thành trạng thái, không nuốt lỗi", () => {
  // KHÔNG import module: `node --test` bóc kiểu cho `.ts` nhưng không dịch JSX của `.tsx`.
  // Phép tiêm lỗi THẬT (ném từ một component con, đọc lại thông điệp trên màn hình) nằm ở
  // `docs/qa/phase10/run_witness.py` AT10-1 — trình duyệt là nơi duy nhất kiểm được nó.
  const src = code("AppErrorBoundary.tsx");
  assert.match(src, /static getDerivedStateFromError\(error: Error\)/);
  assert.match(src, /return \{ error \}/, "lỗi phải đi vào state, nguyên vẹn");
  assert.match(src, /componentDidCatch/, "dấu vết cho DevTools là bắt buộc");
  assert.match(src, /console\.error/);
  assert.match(src, /role="alert"/);
  assert.doesNotMatch(src, /className=/, "boundary không được phụ thuộc lớp token");
  assert.match(
    src,
    /this\.state\.error\.message/,
    "thông điệp thật phải hiện ra, không phải một câu chung chung",
  );
});

// ── AT10-2 — MỘT bộ lọc cam kết cho bảng, số đếm và bản xuất ────────────────────

test("AT10-2: bảng · số đếm · export đọc CÙNG một chuỗi lọc đã cam kết", () => {
  const dm = code("ui/DataMode.tsx");

  assert.match(dm, /const \[committedFilter, setCommittedFilter\] = useState\(""\)/);
  assert.match(dm, /setTimeout\(\(\) => setCommittedFilter\(filter\), 250\)/, "debounce 250 ms");

  // Ba đường ra, một nguồn.
  assert.match(dm, /filter: committedFilter,/g, "query bảng đọc chuỗi cam kết");
  assert.match(dm, /const isFiltered = committedFilter\.trim\(\)\.length > 0/,
    "nhãn đếm đọc chuỗi cam kết, KHÔNG đọc ô gõ");
  const exportStart = dm.indexOf("exportDataset({");
  const exportCall = dm.slice(exportStart, dm.indexOf("});", exportStart));
  assert.match(exportCall, /filter: committedFilter/, "export đọc chuỗi cam kết");
  assert.doesNotMatch(exportCall, /^\s*filter,\s*$/m, "export KHÔNG được đọc ô gõ tức thời");

  // Và trạng thái chờ phải tồn tại, phải khoá nút Xuất.
  // Phép so phải là "chuỗi đang GÕ vs chuỗi mà `data` MÔ TẢ". Dùng `loading` thay cho
  // `dataFilter` là quá rộng: đổi trang cũng bật `loading` mà `total` vẫn đúng nguyên.
  assert.match(
    dm,
    /const filterPending = data === null \|\| dataFilter !== filter/,
    "chờ = chưa có dữ liệu, HOẶC dữ liệu đang mô tả một bộ lọc khác",
  );
  assert.match(dm, /setDataFilter\(committedFilter\)/,
    "`dataFilter` phải được ghi CÙNG lúc với `data`, nếu không phép so trên vô nghĩa");
  assert.match(dm, /disabled=\{Boolean\(exporting\) \|\| filterPending\}/,
    "không cho xuất khi số trên màn hình chưa tả đúng bộ lọc");

  // `debouncedFilter` là tên của bản vá CŨ — nó không được sống lại.
  assert.doesNotMatch(dm, /debouncedFilter/);
});

test("AT10-2b: trong lúc chờ, KHÔNG con số nào được in cạnh ô lọc", () => {
  const dm = raw("ui/DataMode.tsx");
  const block = dm.slice(dm.indexOf('aria-live="polite"'), dm.indexOf('aria-live="polite"') + 700);
  const pending = block.indexOf("filterPending ?");
  const filtered = block.indexOf("dòng khớp bộ lọc");
  assert.ok(pending >= 0 && filtered > pending,
    "nhánh chờ phải đứng TRƯỚC nhánh in số — nếu không số cũ vẫn ra màn hình");
  assert.match(block, /đang lọc…/);
  assert.match(block, /đang tải…/, "chưa có dữ liệu ≠ đang lọc — hai câu khác nhau");
});

// ── AT10-3 — bảng DỮ LIỆU sắp xếp được bằng bàn phím ───────────────────────────

test("AT10-3: header sắp xếp là <button> trong <th aria-sort>", () => {
  const dm = code("ui/DataMode.tsx");
  const headStart = dm.indexOf("data.columns.map((c) => (");
  assert.ok(headStart > 0, "không tìm thấy vòng dựng header bảng");
  const head = dm.slice(headStart, dm.indexOf("</thead>", headStart));
  assert.match(head, /aria-sort=\{sort === c \? \(desc \? "descending" : "ascending"\) : undefined\}/);
  assert.match(head, /<button/, "ô tiêu đề phải chứa một nút thật");
  assert.doesNotMatch(head, /<th[^>]*onClick/, "onClick trần trên <th> không có đường bàn phím");
});

// ── AT10-4 — reduced-motion gate ở CẢ HAI bản đồ ───────────────────────────────

test("AT10-4: mọi animation camera đều hỏi prefers-reduced-motion", () => {
  for (const rel of ["map/MapView.tsx", "national/NationalMap.tsx"]) {
    const src = code(rel);
    if (!/easeTo|flyTo/.test(src)) continue;
    assert.match(
      src,
      /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/,
      `${rel}: kill-switch CSS toàn cục không với tới camera maplibre`,
    );
    assert.match(src, /jumpTo\(/, `${rel}: phải có nhánh nhảy thẳng khi người dùng xin ít chuyển động`);
  }
});

// ── AT10-5 — cache trường: xem `request-cache.test.ts` (hành vi thật) ──────────

test("AT10-5: fetchField đi qua sổ kép, không tự dựng Map thứ hai", () => {
  const q = code("data/queries.ts");
  assert.match(q, /makeRequestCache<GridCell\[\]>\(FIELD_CACHE_MAX\)/);
  assert.equal((q.match(/export const FIELD_CACHE_MAX = 4/g) ?? []).length, 1);
  assert.doesNotMatch(q, /fieldRequests/, "Map gộp cũ đã bị bác ở QA Phase 10");
  const rc = code("data/request-cache.ts");
  assert.doesNotMatch(rc, /import .* from/, "seam này phải không phụ thuộc gì — đó là điều kiện test được");
});

// ── AT10-6 — thanh trượt tuần dùng được bằng bàn phím ─────────────────────────

test("AT10-6a: bước phím đúng chuẩn slider và quay vòng ở cả hai mút", () => {
  assert.equal(scrubberKeyStep(11, "ArrowRight"), 12);
  assert.equal(scrubberKeyStep(11, "ArrowLeft"), 10);
  assert.equal(scrubberKeyStep(11, "PageUp"), 35);
  assert.equal(scrubberKeyStep(11, "PageDown"), 155); // 11 - 24 quay vòng
  assert.equal(scrubberKeyStep(11, "Home"), 0);
  assert.equal(scrubberKeyStep(11, "End"), HOURS_IN_WEEK - 1);

  // Hai mút — chỗ off-by-one duy nhất.
  assert.equal(scrubberKeyStep(HOURS_IN_WEEK - 1, "ArrowRight"), 0);
  assert.equal(scrubberKeyStep(0, "ArrowLeft"), HOURS_IN_WEEK - 1);
  assert.equal(scrubberKeyStep(0, "End"), 167, "End là 167, KHÔNG phải 168");

  // Mọi giờ hợp lệ, mọi phím → vẫn là một giờ hợp lệ.
  for (let t = 0; t < HOURS_IN_WEEK; t++) {
    for (const key of ["ArrowRight", "ArrowLeft", "PageUp", "PageDown", "Home", "End"]) {
      const next = scrubberKeyStep(t, key)!;
      assert.ok(Number.isInteger(next) && next >= 0 && next < HOURS_IN_WEEK, `${key}@${t} → ${next}`);
    }
  }
});

test("AT10-6b: phím lạ trả null — Tab phải thoát được khỏi track", () => {
  for (const key of ["Tab", "Enter", " ", "a", "Escape", "ArrowUp"]) {
    assert.equal(scrubberKeyStep(50, key), null, `${key} không thuộc thanh trượt`);
  }
  const src = code("ui/Scrubber.tsx");
  assert.match(src, /if \(next === null\) return;/, "null phải return TRƯỚC preventDefault");
  const handler = src.slice(src.indexOf("onKeyDown={(e) => {"));
  assert.ok(
    handler.indexOf("return;") < handler.indexOf("preventDefault"),
    "preventDefault trước khi biết phím có thuộc slider không sẽ giết Tab",
  );
});

test("AT10-6c: track khai đủ vai trò slider, nút play có tên đọc được", () => {
  const src = code("ui/Scrubber.tsx");
  for (const attr of [
    'role="slider"',
    "tabIndex={0}",
    'aria-label="Giờ trong tuần"',
    "aria-valuemin={0}",
    "aria-valuemax={HOURS_IN_WEEK - 1}",
    "aria-valuenow={t}",
    "aria-valuetext=",
  ]) {
    assert.ok(src.includes(attr), `track thiếu ${attr}`);
  }
  // "▶"/"▮▮" không phải một cái tên.
  assert.match(src, /aria-label=\{playing \? "dừng" :/);
});

// ── AT10-7 — số thập phân vi-VN ───────────────────────────────────────────────

test("AT10-7a: formatFixed giữ đúng số chữ số và dùng dấu phẩy", () => {
  assert.equal(formatFixed(1.85, 2), "1,85");
  assert.equal(formatFixed(12.34, 1), "12,3");
  assert.equal(formatFixed(0, 3), "0,000");
  assert.equal(formatFixed(0.0004, 4), "0,0004");
  // Chữ số cố định là điểm khác biệt với formatValue: 2 chữ số thì phải LUÔN có 2.
  assert.equal(formatFixed(5, 2), "5,00");
  assert.equal(formatFixed(-1.5, 1), "-1,5");
  // Không được có dấu chấm thập phân ở bất kỳ đâu.
  for (const [v, d] of [[1.85, 2], [12.3, 1], [0.0004, 4], [1234.5, 1]] as const) {
    assert.doesNotMatch(formatFixed(v, d).replace(/\./g, "|SEP|"), /\|SEP\|\d+$/,
      `${v} tới ${d} chữ số vẫn in dấu chấm thập phân`);
  }
});

test("AT10-7b: không panel vi-VN nào còn gọi toFixed trên số đọc được", () => {
  // Hai chỗ được PHÉP giữ dấu chấm, và cả hai đều không phải "số để đọc":
  //  · `toFixed(5)` — toạ độ lat/lng in bằng mono, quy ước kỹ thuật (`docs/COT.md`).
  //  · `d +=` — dữ liệu đường SVG; dấu phẩy ở đó là dấu phân tách toán tử của chính cú
  //    pháp path, nên bản địa hoá nó sẽ vẽ ra hình sai chứ không phải đọc sai.
  const allowed = (line: string) => /toFixed\(5\)/.test(line) || /^\s*d \+=/.test(line);
  for (const rel of [
    "ui/CellPanel.tsx",
    "ui/CommunePanel.tsx",
    "ui/DataMode.tsx",
    "national/NationalApp.tsx",
  ]) {
    const bad = code(rel)
      .split("\n")
      .filter((line) => /\.toFixed\(\d\)/.test(line) && !allowed(line))
      .map((line) => line.trim());
    assert.deepEqual(bad, [], `${rel} còn ${bad.length} chỗ toFixed đọc thành dấu chấm`);
  }
});

// ── AT10-8 — chi phí render mỗi tick không được quay lại ──────────────────────

test("AT10-8a: App KHÔNG subscribe `t` trần ở gốc", () => {
  const app = code("App.tsx");
  assert.doesNotMatch(
    app,
    /useStore\(\(s\) => s\.t\)/,
    "subscribe `t` ở gốc = render cả cây 4 Hz khi play",
  );
  assert.match(app, /occCountAt\(occupancy\.profiles, s\.t\)/, "số theo giờ đi qua selector");
});

test("AT10-8b: effect dựng lớp của MapView không có `props` trong deps", () => {
  const mv = code("map/MapView.tsx");
  const deps = mv.slice(mv.indexOf("raiseLabels(map.current);"));
  const arr = deps.slice(deps.indexOf("}, ["), deps.indexOf("]);") + 3);
  assert.doesNotMatch(arr, /(^|[,[\s])props(\s*[,\]])/,
    "identity của object props đổi mỗi render App — để trong deps là dựng lại toàn stack deck");
  for (const needed of ["analyticalCells", "analyticalStations", "cells", "stations", "scale"]) {
    assert.ok(arr.includes(needed), `deps thiếu input thật: ${needed}`);
  }
  // …và effect phải liệt kê rời, không spread lại `props` vào buildLayers.
  const build = mv.slice(mv.indexOf("const built = buildLayers({"), mv.indexOf("raiseLabels(map.current);"));
  assert.doesNotMatch(build, /\.\.\.props/, "spread props đưa identity không ổn định trở lại");
});

test("AT10-8c: raiseLabels no-op khi thứ tự đã đúng", () => {
  const mv = code("map/MapView.tsx");
  const fn = mv.slice(mv.indexOf("function raiseLabels("), mv.indexOf("function raiseLabels(") + 900);
  assert.match(fn, /every\(/, "phải so thứ tự đuôi trước khi moveLayer");
  assert.ok(
    fn.indexOf("return;") < fn.lastIndexOf("moveLayer"),
    "guard phải đứng TRƯỚC vòng moveLayer",
  );
});

test("AT10-8d: Legend đọc `view` trong handler, không subscribe nó", () => {
  const lg = code("ui/Legend.tsx");
  assert.doesNotMatch(lg, /const view = useStore\(\(s\) => s\.view\)/,
    "subscribe `view` = re-render legend ở mọi khung pan/zoom");
  assert.ok(
    (lg.match(/useStore\.getState\(\)\.view/g) ?? []).length >= 4,
    "cả 4 nút 'phóng tới' phải đọc trạng thái tại thời điểm bấm",
  );
});

// ── AT10-9 — focus quay về sau khi đóng thẻ bằng chứng ────────────────────────

test("AT10-9: selector focus-restore khớp ĐÚNG phần tử Workspace dựng", () => {
  const card = code("components/atlas/EvidenceCard.tsx");
  const m = card.match(/document\.querySelector\('([^']+)'\)/);
  assert.ok(m, "EvidenceCard phải có một selector dự phòng");
  const selector = m![1]!;

  const ws = code("components/atlas/Workspace.tsx");
  const main = ws.slice(ws.indexOf("<main"), ws.indexOf(">", ws.indexOf("<main")) + 1);

  // Bẫy đã xảy ra thật: selector hỏi `[role="region"]`, còn Workspace dựng `<main>` —
  // không khớp, focus rơi về <body>. Nên kiểm tra là một phép ĐỐI CHIẾU hai file.
  const tag = selector.match(/^[a-z]+/)?.[0];
  assert.ok(tag && main.startsWith(`<${tag}`), `selector nhắm <${tag ?? "?"}> mà Workspace dựng ${main.slice(0, 6)}`);
  const label = selector.match(/\[aria-label="([^"]+)"\]/)?.[1];
  assert.ok(label && main.includes(`aria-label="${label}"`), "aria-label của selector và của Workspace phải trùng");
  assert.match(main, /tabIndex=\{-1\}/, "phần tử nhận lại focus phải focus được bằng mã");
});
