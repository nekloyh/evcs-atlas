/**
 * CR Phase 4.2 — Demand × Access Scatter kích hoạt làm BẰNG CHỨNG của lens Cơ hội.
 *
 * File này chạy các tiêu chí 1–20 của CR (phần THUẦN). Tiêu chí 21–28 là tiêu chí RENDER
 * (CDP, cùng harness `docs/qa/phase41/`) và KHÔNG chạy ở đây — không con số ΔE nào trong bộ
 * này được đo, chúng chỉ được trích lại từ CR ở phần chú thích.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIELD_BY_ID, LENSES, defaultFieldOfLens } from "../src/fields.ts";
import { DEFAULT_DATASET_ID } from "../src/state/selection.ts";
import { isFilterCompatible, type AnalysisFilter } from "../src/state/filter.ts";
import { BEYOND_2KM_M } from "../src/domain-thresholds.ts";
import type { GridCell } from "../src/data/queries.ts";
import {
  EVIDENCE_CHART_IDS,
  EVIDENCE_CHART_REGISTRY,
  LENS_PRIMARY_CHARTS,
  PRIMARY_CHART_IDS,
  PRIMARY_CHART_REGISTRY,
  evidenceChartsOfLens,
} from "../src/viz/chart-contracts.ts";
import {
  SCATTER_BASE_ALPHA,
  SCATTER_COLS,
  SCATTER_MAX_LEVEL,
  SCATTER_PLOT_W,
  SCATTER_ROWS,
  buildDemandAccessScatter,
  buildDemandPopulationHistogram,
  isKnownDistance,
  memoizeByReference,
  overplotAlpha,
  populationAtFrac,
  populationDisplayDomain,
  populationPlotFrac,
  scatterStackAt,
} from "../src/viz/chart-models.ts";
import {
  SCATTER_STATE_COPY,
  scatterCountsLines,
  scatterXDecadeTicks,
  scatterYTicks,
} from "../src/ui/scatter-copy.ts";

/** Mã nguồn đã BỎ chú thích — một luật nêu trong docstring không được tính là đã thực thi. */
function code(relPath: string): string {
  return readFileSync(join(process.cwd(), "src", relPath), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const cell = (over: Partial<GridCell>): GridCell => ({
  h3: "88",
  value: 0,
  pop: 100,
  ports: 0,
  lat: 21,
  lng: 105,
  beyond2km: false,
  dist: 500,
  reachable: true,
  ...over,
});

// ── AT-1: tách bạch registry ────────────────────────────────────────────────

test("AT-1 ID bằng chứng RỜI HẲN ID biểu đồ chính, và năm lens vẫn năm biểu đồ chính", () => {
  const primary = new Set<string>(PRIMARY_CHART_IDS);
  for (const id of EVIDENCE_CHART_IDS) {
    assert.equal(primary.has(id), false, `${id} không được là một PrimaryChartId`);
  }
  assert.equal(PRIMARY_CHART_IDS.length, 5, "bất biến 1 của §5.1 không bị chạm tới");
  assert.equal(new Set(Object.values(LENS_PRIMARY_CHARTS)).size, 5);
  assert.equal(new Set(LENSES.map((l) => l.primaryChart)).size, 5);
  for (const lens of LENSES) {
    assert.ok(PRIMARY_CHART_REGISTRY[lens.primaryChart!], `lens ${lens.id} vẫn giải ra một biểu đồ chính`);
  }

  const meta = EVIDENCE_CHART_REGISTRY["opportunity-demand-access-scatter"];
  assert.equal(meta.lens, "opportunity");
  assert.equal(meta.emitsFilter, false);
  assert.equal(meta.emitsTime, false);
  assert.equal(meta.emitsEntity, false);
  assert.equal(meta.collapsedByDefault, true, "mặc định ĐÓNG (§1.7)");
  assert.deepEqual(
    evidenceChartsOfLens("opportunity").map((m) => m.id),
    ["opportunity-demand-access-scatter"],
  );
  assert.deepEqual(evidenceChartsOfLens("demand"), [], "chưa lens nào khác có khe bằng chứng");

  // Router giữ nguyên `never` năm nhánh — thêm ID thứ sáu là lỗi biên dịch, không phải một
  // khe trống không ai giải thích được.
  const router = code("components/atlas/PrimaryLensChart.tsx");
  assert.match(router, /const exhaustive: never = chartId/);
  assert.doesNotMatch(router, /opportunity-demand-access-scatter/, "router KHÔNG định tuyến biểu đồ bằng chứng");
  assert.doesNotMatch(router, /\bScatter\b/, "presenter bằng chứng không đi qua router chính");
});

// ── AT-2: không phát gì, ở tầng CẤU TRÚC ────────────────────────────────────

test("AT-2 Scatter không phát gì — intent VẮNG MẶT khỏi kiểu, brush cũ không sống lại", () => {
  const src = code("ui/Scatter.tsx");

  for (const token of ["ScatterBrush", "SCATTER_X", "SCATTER_Y", "useDragRect", "onBrush"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${token}\\b`), `Scatter còn dùng ${token} — đường brush cũ`);
  }
  assert.doesNotMatch(src, /from "\.\.\/state\/brush"/, "kích hoạt module brush là dựng lại hình dạng bộ lọc thứ hai");
  assert.doesNotMatch(src, /from "\.\.\/state\/store"/, "biểu đồ bằng chứng không đọc store");
  assert.doesNotMatch(src, /from "\.\.\/state\/analysis-events"/, "không nhận ChartIntentSink");
  assert.doesNotMatch(src, /useStore/, "không ghi và không đọc state toàn cục");
  assert.doesNotMatch(src, /onFilterIntent|onTimeIntent|onEntityIntent|ChartIntentSink|AnalysisFilter/,
    "ba intent phải VẮNG MẶT khỏi kiểu props, không phải có mà không dùng");

  // Controller dựng nó KHÔNG kèm callback nào — chốt theo Ý ĐỊNH như test của Access Curve.
  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /<Scatter\b[^>]*\bmodel=\{scatterModel\}/, "controller truyền model");
  assert.doesNotMatch(controller, /<Scatter\b[^>]*\bon[A-Z]\w*=/, "không callback nào tới được biểu đồ bằng chứng");
  assert.doesNotMatch(controller, /<Scatter\b[^>]*\bsink=/, "và cũng không nhận cả sink");
});

// ── AT-3: dưới lens Cơ hội KHÔNG có filter nào tồn tại được (F1) ─────────────

test("AT-3 ba cửa filter đều loại filter Cầu khi lens Cơ hội đang mở", () => {
  const oppField = defaultFieldOfLens("opportunity")!;
  const demandFilter: AnalysisFilter = {
    version: 1,
    mode: "subset",
    datasetId: DEFAULT_DATASET_ID,
    entity: "h3-cell",
    field: "population",
    op: "between",
    lo: 100,
    hi: 5000,
    missing: "exclude",
    source: "demand-population-histogram",
  };

  assert.equal(isFilterCompatible(demandFilter, "demand", "cell"), true, "…hợp lệ ở lens Cầu");
  assert.equal(
    isFilterCompatible(demandFilter, "opportunity", oppField.readAs),
    false,
    "một filter Cầu hợp lệ + trường Cơ hội ⇒ filter.active về null",
  );
  assert.equal(isFilterCompatible(null, "opportunity", oppField.readAs), true);

  // Ba CỬA đều chạy phép thử ấy: boot, hashchange, switchLens/setField.
  const store = code("state/store.ts");
  const gates = store.match(/isFilterCompatible\(/g) ?? [];
  assert.ok(gates.length >= 3, `chỉ thấy ${gates.length} cửa gọi isFilterCompatible, cần đủ ba`);
  assert.match(store, /const bootFilter = isFilterCompatible\(/, "cửa BOOT");
  assert.match(store, /switchLens: \(lensId\) =>[\s\S]{0,400}isFilterCompatible\(/, "cửa switchLens");
});

// ── AT-4/AT-5: một miền hiển thị, không có bản thứ ba ───────────────────────

test("AT-4 vị trí X của scatter khớp mép cột histogram trên cùng một tập", () => {
  const cells: GridCell[] = [
    cell({ h3: "z", pop: 0 }),
    cell({ h3: "a", pop: 1 }),
    cell({ h3: "b", pop: 37 }),
    cell({ h3: "c", pop: 2140 }),
    cell({ h3: "d", pop: 46232 }),
  ];
  const model = buildDemandPopulationHistogram(cells, null);
  const domain = populationDisplayDomain(cells);
  assert.equal(domain.minPositivePop, model.minPositivePop);
  assert.equal(domain.maxPop, model.maxPop);

  // Khe `=0` nằm trọn trong `[0, 1/24]`.
  const zeroFrac = populationPlotFrac(0, domain);
  assert.ok(zeroFrac >= 0 && zeroFrac <= 1 / 24, `khe =0 ở ${zeroFrac}`);

  /*
   * CR viết `===` (chính xác từng bit). ĐO ĐƯỢC thì không: `plotX1` là mép khe đều
   * `(i+1)/24`, còn `populationPlotFrac(bin.x1)` đi qua `expm1` rồi `log1p` ngược lại, nên
   * hai bên lệch nhau ở mức ULP. Sai số lớn nhất đo được trên bảy miền thử: 6,66e-16.
   * Khai ra và chốt bằng dung sai, chứ không nới thành `deepEqual` mơ hồ.
   */
  let worst = 0;
  for (const bin of model.positiveBins) {
    worst = Math.max(worst, Math.abs(populationPlotFrac(bin.x1, domain) - bin.plotX1));
  }
  assert.ok(worst < 1e-15, `lệch lớn nhất ${worst} vượt dung sai ULP`);

  // Và nghịch đảo đưa về đúng giá trị dân số THẬT.
  for (const bin of model.positiveBins) {
    const back = populationAtFrac(populationPlotFrac(bin.x1, domain), domain);
    assert.ok(Math.abs(back - bin.x1) <= 1e-9 * Math.max(1, bin.x1), `${back} ≠ ${bin.x1}`);
  }
  assert.equal(populationAtFrac(populationPlotFrac(0, domain), domain), 0, "khe =0 nghịch đảo về đúng 0");
});

test("AT-5 phép tách miền hiển thị KHÔNG đổi hành vi histogram", () => {
  // Tập rỗng và tập toàn 0 là hai đường mà bản cũ xử lý bằng hai câu lệnh riêng.
  assert.deepEqual(populationDisplayDomain([]), { minPositivePop: 0, maxPop: 0, hasPositive: false });
  assert.deepEqual(
    populationDisplayDomain([{ pop: 0 }, { pop: 0 }]),
    { minPositivePop: 0, maxPop: 0, hasPositive: false },
  );
  // Bẫy `pop = -1`: dân số âm là dữ liệu HỎNG, không phải một giá trị nhỏ.
  assert.deepEqual(
    populationDisplayDomain([{ pop: -1 }, { pop: null }, { pop: NaN }, { pop: 7 }]),
    { minPositivePop: 7, maxPop: 7, hasPositive: true },
  );

  const allZero = buildDemandPopulationHistogram([cell({ pop: 0 }), cell({ pop: 0 })]);
  assert.equal(allZero.bins.length, 1, "tập toàn 0 chỉ còn khe =0");
  assert.equal(allZero.zeroBin.plotX2, 1, "…và khe ấy chiếm trọn bề ngang");

  // `formatPop` rời sang `ui/format.ts`, histogram import chứ không giữ bản riêng.
  const hist = code("ui/PopulationHistogram.tsx");
  assert.doesNotMatch(hist, /function formatPop/, "bản chép của formatPop phải đi");
  assert.match(hist, /import \{ formatPop \} from "\.\/format"/);
  assert.match(hist, /populationPlotFrac\(/, "vạch thập phân và trung vị dùng helper chung");
  assert.doesNotMatch(hist, /Math\.log1p\(value\)/, "không còn bản chép của phép đặt chỗ");
});

// ── AT-6..AT-10: hợp đồng null / zero / bảo toàn ────────────────────────────

test("AT-6 miền X độc lập với mẫu khuyết cự ly", () => {
  const cells: GridCell[] = [
    cell({ h3: "a", pop: 5, dist: 100 }),
    cell({ h3: "b", pop: 900, dist: 3000 }),
    cell({ h3: "c", pop: 46232, dist: 12000 }),
  ];
  const full = buildDemandAccessScatter(cells);
  const nulled = buildDemandAccessScatter(cells.map((c) => ({ ...c, dist: null })));

  assert.deepEqual(nulled.domain, full.domain, "nulling toàn bộ cự ly không đổi miền X");
  assert.equal(nulled.nPlotted, 0);
  assert.equal(full.domain.maxPop, 46232);

  // Ô đông người nhất mất cự ly ⇒ mép phải trục KHÔNG có mark. Đó là hợp đồng, không phải lỗi.
  const partial = buildDemandAccessScatter([
    cells[0]!,
    cells[1]!,
    { ...cells[2]!, dist: null },
  ]);
  assert.deepEqual(partial.domain, full.domain);
  const cols = partial.levels.flatMap((l) => l.marks.map((m) => m.col));
  assert.ok(Math.max(...cols) < SCATTER_COLS - 1, "cột cuối trống vì ô lớn nhất khuyết cự ly");
});

test("AT-7 cự ly khuyết: LOẠI, ĐẾM cả ô lẫn người, và không rơi xuống 0 hay lên max", () => {
  const model = buildDemandAccessScatter([
    cell({ h3: "a", pop: 10, dist: 800 }),
    cell({ h3: "b", pop: 46232, dist: 9000 }),
    cell({ h3: "x", pop: 9571, dist: null }),
  ]);

  assert.equal(model.nExcludedDistance, 1);
  assert.equal(model.popExcludedDistance, 9571);
  assert.equal(model.nPlotted, 2);
  assert.equal(model.populationKnownTotal, 10 + 46232 + 9571);

  // Không mark nào ở đáy khung (y = 0 m) và không mark nào ở đỉnh ngoài ô xa nhất THẬT.
  const marks = model.levels.flatMap((l) => l.marks);
  assert.equal(marks.length, 2);
  const bottom = marks.filter((m) => m.row === SCATTER_ROWS - 1);
  assert.equal(bottom.length, 0, "800 m và 9.000 m đều không nằm ở đáy — không ô nào bị đặt ở 0");
  assert.equal(marks.filter((m) => m.row === 0).length, 1, "chỉ ô xa nhất THẬT chạm mép trên");

  const lines = scatterCountsLines(model);
  assert.equal(lines.length, 2);
  assert.match(lines[1]!, /9\.571 người/, "dòng đếm in SỐ NGƯỜI, không chỉ số ô");
  assert.match(lines[1]!, /KHÔNG được vẽ/);
  assert.match(lines[1]!, /vân xám/, "…và nói ô ấy vẫn ở trên bản đồ");
});

test("AT-8 ô 0 người ĐƯỢC VẼ, ở khe `=0`, tại cự ly thật của nó", () => {
  const model = buildDemandAccessScatter([
    cell({ h3: "zero", pop: 0, dist: 1500 }),
    // Hai giá trị dương KHÁC nhau: một giá trị dương duy nhất làm dải log rộng 0, và khi ấy
    // mọi ô dương đều nằm ở mép trái dải — một trường hợp suy biến, không phải luật khe `=0`.
    cell({ h3: "pos", pop: 40, dist: 4000 }),
    cell({ h3: "pos2", pop: 4000, dist: 3000 }),
  ]);

  assert.equal(model.nPlotted, 3);
  assert.equal(model.nZeroPopulationPlotted, 1);

  const marks = model.levels.flatMap((l) => l.marks);
  assert.equal(marks.length, 3, "ba ô riêng biệt, không ô nào bị gộp");

  // Ô 0 người đứng ở TÂM khe `=0`, tức bên TRÁI vách ngăn 1/24 — không bao giờ trong dải dương.
  const zeroCol = Math.floor(populationPlotFrac(0, model.domain) * SCATTER_COLS);
  const inZeroSlot = marks.filter((m) => m.col === zeroCol);
  assert.equal(inZeroSlot.length, 1, "đúng MỘT mark trong khe =0");
  assert.equal(inZeroSlot[0]!.n, 1);
  assert.ok(
    ((zeroCol + 1) * 2) / SCATTER_PLOT_W <= 1 / 24,
    `mark khe =0 ở cột ${zeroCol} phải nằm trọn bên trái vách ngăn`,
  );
  // …và mọi ô dương đứng bên PHẢI nó. `minPositivePop` rơi đúng lên vách ngăn (frac = 1/24),
  // nên ô dương nhỏ nhất chia chung ô lưới với vách — nhưng không bao giờ lùi vào khe.
  for (const m of marks.filter((x) => x !== inZeroSlot[0])) {
    assert.ok(m.col > zeroCol, `ô dương ở cột ${m.col} phải ở phải cột ${zeroCol}`);
  }

  // Cự ly của nó là cự ly THẬT: 1.500 m trên miền [0, 4.000] ⇒ không ở đáy, không ở đỉnh.
  assert.ok(inZeroSlot[0]!.row < SCATTER_ROWS - 1 && inZeroSlot[0]!.row > 0);

  // `sqrt(0) = 0` là chính xác, không cần nhánh riêng.
  const atZeroDist = buildDemandAccessScatter([cell({ pop: 5, dist: 0 }), cell({ pop: 9, dist: 100 })]);
  assert.equal(atZeroDist.nPlotted, 2);
  assert.ok(atZeroDist.levels.flatMap((l) => l.marks).some((m) => m.row === SCATTER_ROWS - 1));
});

test("AT-9 giá trị hỏng bị loại và ĐẾM, không mark nào mang toạ độ NaN", () => {
  assert.equal(isKnownDistance(0), true);
  assert.equal(isKnownDistance(-1), false);
  assert.equal(isKnownDistance(NaN), false);
  assert.equal(isKnownDistance(Infinity), false);
  assert.equal(isKnownDistance(null), false);
  assert.equal(isKnownDistance(undefined), false);

  const model = buildDemandAccessScatter([
    cell({ h3: "ok", pop: 100, dist: 500 }),
    cell({ h3: "negpop", pop: -1, dist: 500 }),
    cell({ h3: "negdist", pop: 100, dist: -1 }),
    cell({ h3: "nandist", pop: 100, dist: NaN }),
    cell({ h3: "infdist", pop: 100, dist: Infinity }),
    cell({ h3: "nullpop", pop: null, dist: 500 }),
    cell({ h3: "bothnull", pop: null, dist: null }),
  ]);

  assert.equal(model.nInvalid, 4, "pop âm + ba cự ly hỏng");
  assert.equal(model.nNullPopulation, 2, "khuyết cả hai đếm MỘT lần, ở rổ dân số");
  assert.equal(model.nExcludedDistance, 0);
  assert.equal(model.nPlotted, 1);

  for (const m of model.levels.flatMap((l) => l.marks)) {
    assert.ok(Number.isInteger(m.col) && Number.isInteger(m.row), "toạ độ lưới không bao giờ NaN");
    assert.ok(m.col >= 0 && m.col < SCATTER_COLS && m.row >= 0 && m.row < SCATTER_ROWS);
  }
});

test("AT-10 bất biến BẢO TOÀN đúng trên cả fixture tay lẫn 29.763 hàng sinh máy", () => {
  const conserved = (m: ReturnType<typeof buildDemandAccessScatter>) =>
    m.levels.reduce((s, l) => s + l.marks.reduce((a, k) => a + k.n, 0), 0) +
    m.nExcludedDistance +
    m.nNullPopulation +
    m.nInvalid;

  const hand = buildDemandAccessScatter([
    cell({ pop: 0, dist: 10 }),
    cell({ pop: 12, dist: null }),
    cell({ pop: null, dist: 40 }),
    cell({ pop: -1, dist: 40 }),
    cell({ pop: 900, dist: NaN }),
    cell({ pop: 46232, dist: 21161 }),
  ]);
  assert.equal(conserved(hand), hand.totalCells);
  assert.equal(hand.totalCells, 6);

  // 29.763 hàng — cỡ gói `p/68`, gói lớn nhất đang xuất.
  let seed = 20260820;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const big: GridCell[] = [];
  for (let i = 0; i < 29763; i++) {
    const r = rnd();
    big.push(
      cell({
        h3: `c${i}`,
        pop: r < 0.07 ? 0 : Math.round(rnd() ** 3 * 46232),
        dist: r < 0.296 ? null : Math.round(rnd() ** 2 * 38278),
      }),
    );
  }
  const model = buildDemandAccessScatter(big);
  assert.equal(conserved(model), 29763);
  assert.equal(model.totalCells, 29763);
  assert.ok(model.nExcludedDistance > 0 && model.nPlotted > 0);
});

// ── AT-11/AT-12: mực chồng và trần DOM ──────────────────────────────────────

test("AT-11 overplotAlpha là công thức tổng hợp, tăng ngặt tới 6 rồi phẳng", () => {
  for (let n = 0; n <= 9; n++) {
    assert.equal(overplotAlpha(n), n <= 0 ? 0 : 1 - 0.55 ** Math.min(n, 6), `n=${n}`);
  }
  // CR viết `overplotAlpha(1) === 0.45`. `1 − 0.55` trong dấu phẩy động là 0,44999999999999996,
  // nên phép so bằng bit là sai; chốt bằng dung sai và khai ra con số.
  assert.ok(Math.abs(overplotAlpha(1) - SCATTER_BASE_ALPHA) < 1e-15);
  for (let n = 1; n < SCATTER_MAX_LEVEL; n++) {
    assert.ok(overplotAlpha(n + 1) > overplotAlpha(n), `tăng ngặt ở ${n}`);
  }
  assert.equal(overplotAlpha(6), overplotAlpha(60), "từ bậc 6 trở đi là phẳng");
  assert.equal(overplotAlpha(0), 0);
});

test("AT-12 DOM có trần: 200.000 hàng vẫn ≤ 8.308 ô lưới và ≤ 6 node mark", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rows: GridCell[] = [];
  for (let i = 0; i < 200000; i++) {
    rows.push(cell({ h3: `c${i}`, pop: Math.round(rnd() * 46232), dist: Math.round(rnd() * 38278) }));
  }
  const model = buildDemandAccessScatter(rows);

  assert.equal(SCATTER_COLS * SCATTER_ROWS, 8308, "124 × 67 — khung 248×134 chia hết cho lưới 2 px");
  assert.ok(model.nOccupiedLattice <= 8308, `ô lưới có mark: ${model.nOccupiedLattice}`);
  assert.ok(model.levels.length <= SCATTER_MAX_LEVEL, `bậc: ${model.levels.length}`);
  assert.equal(model.nPlotted, 200000, "không hàng nào bị rút mẫu");
  assert.ok(model.maxStack > SCATTER_MAX_LEVEL, "…và có chồng vượt bậc cắt, nên phép cắt được thử thật");

  // Presenter phát ĐÚNG một `<path>` cho mỗi bậc — không một node cho mỗi ô.
  const src = code("ui/Scatter.tsx");
  assert.match(src, /model\.levels\.map\(\(lv\) => \(\s*<path/, "một path cho mỗi bậc chồng");
  assert.doesNotMatch(src, /marks\.map\([\s\S]{0,80}<(circle|rect)\b/, "không được một node cho mỗi ô lưới");

  // Tra chồng là O(1), và nó trả đúng số đã gộp.
  const first = model.levels[0]!.marks[0]!;
  assert.equal(scatterStackAt(model, first.col, first.row), first.n);
  assert.equal(scatterStackAt(model, SCATTER_COLS - 1, SCATTER_ROWS - 1) >= 0, true);
});

// ── AT-14..AT-16: hằng, đơn vị, nhãn ────────────────────────────────────────

test("AT-14 ngưỡng 2 km đến từ MỘT hằng — không literal nào trong module", () => {
  const src = code("ui/Scatter.tsx");
  assert.match(src, /import \{ BEYOND_2KM_M \} from "\.\.\/domain-thresholds"/);
  const bare = src.match(/(?<![\w.])2_?000(?![\w])/g) ?? [];
  assert.equal(bare.length, 0, `còn ${bare.length} chỗ gõ thẳng 2000`);
  assert.equal(BEYOND_2KM_M, 2000);

  // Nhãn nói *ngưỡng quy định*, không nói *break* (§1.4).
  const copy = code("ui/scatter-copy.ts");
  assert.match(copy, /ngưỡng quy định/);
  assert.doesNotMatch(copy, /\bbreak\b/i);
});

test("AT-15 đơn vị trục Y đến từ registry trường, in qua scaleUnit một thang chung", () => {
  const unit = FIELD_BY_ID.get("dist_station_network_m")!.unit!;
  const ticks = scatterYTicks(21161, unit);

  assert.equal(ticks.scaled.label, "km", "yMax = 21.161 m ⇒ km");
  assert.equal(typeof ticks.scaled.digits, "number", "một số chữ số chốt cho CẢ dãy");
  assert.equal(ticks.labels.length, 5);
  assert.equal(ticks.labels[0], "0");
  assert.equal(new Set(ticks.labels).size, 5, "không hai vạch nào đọc thành cùng một chữ");
  assert.equal(ticks.axisTitle, "↑ cự ly tới trạm · km, theo mạng đường");
  // Vạch là mét THẬT đã nghịch biến đổi: vị trí đều trên thang `sqrt`.
  assert.equal(ticks.values[4], 21161);
  assert.ok(Math.abs(ticks.values[2]! - 0.25 * 21161) < 1e-9);

  // Gói nhỏ vẫn đọc đúng đơn vị gốc.
  assert.equal(scatterYTicks(800, unit).scaled.label, "m");

  // Controller giải đơn vị từ registry và truyền xuống; presenter không gõ `UnitSpec` nào.
  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /FIELD_BY_ID\.get\(SCATTER_DIST_FIELD\)\?\.unit/);
  assert.match(controller, /distUnit=\{scatterDistUnit\}/);
  const presenter = code("ui/Scatter.tsx");
  assert.doesNotMatch(presenter, /kind:\s*["']m["']/, "presenter không được dựng UnitSpec tại chỗ");
});

test("AT-16 vạch X là dân số THẬT — không giá trị log1p nào tới màn hình", () => {
  const domain = populationDisplayDomain([{ pop: 1 }, { pop: 46232 }]);
  const ticks = scatterXDecadeTicks(domain, SCATTER_PLOT_W);

  assert.deepEqual(ticks.map((t) => t.label), ["1", "10", "100", "1k", "10k"]);
  assert.deepEqual(ticks.map((t) => t.value), [1, 10, 100, 1000, 10000]);
  for (const t of ticks) {
    assert.ok(t.frac >= 1 / 24 && t.frac <= 1, `vạch ${t.value} phải nằm trong dải dương`);
    assert.notEqual(t.label, String(Math.log1p(t.value)));
  }
  // Tăng đơn điệu theo giá trị — điều kiện để nhãn và vị trí không nói ngược nhau.
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i]!.frac > ticks[i - 1]!.frac);

  // Ngoài miền thì không in: 1 nằm dưới minPositive ⇒ bỏ.
  const narrow = scatterXDecadeTicks(populationDisplayDomain([{ pop: 30 }, { pop: 900 }]), SCATTER_PLOT_W);
  assert.deepEqual(narrow.map((t) => t.value), [100]);
  // Tập không có số dương ⇒ không vạch nào.
  assert.deepEqual(scatterXDecadeTicks(populationDisplayDomain([{ pop: 0 }]), SCATTER_PLOT_W), []);
});

// ── AT-17..AT-19: không SQL, dựng lười, chỉ đọc ─────────────────────────────

test("AT-17 không một câu SQL nào trong đường bằng chứng", () => {
  for (const rel of ["ui/Scatter.tsx", "ui/scatter-copy.ts"]) {
    const src = code(rel);
    assert.doesNotMatch(src, /\bSELECT\b[\s\S]{0,400}?\bFROM\b/i, `${rel} chứa SQL`);
    assert.doesNotMatch(src, /read_parquet|registerParquet|from "\.\.\/data\/duckdb"/, `${rel} chạm tầng nạp`);
    assert.doesNotMatch(src, /\bfetch\(/, `${rel} tự đi nạp dữ liệu`);
  }
  // Model đọc snapshot Q-P4-1 đã có trong RAM: chữ ký chỉ nhận `cells`, không nhận datasetId.
  assert.equal(buildDemandAccessScatter.length, 1);
});

test("AT-18 dựng LƯỜI: không dựng khi đóng, dựng một lần khi mở, đóng-mở lại không dựng lại", () => {
  let calls = 0;
  const memo = memoizeByReference((rows: readonly GridCell[]) => {
    calls++;
    return buildDemandAccessScatter(rows);
  });

  const snapshot = [cell({ pop: 100, dist: 300 })];
  assert.equal(calls, 0, "chưa mở thì chưa gọi");

  const first = memo(snapshot);
  assert.equal(calls, 1);
  // Đóng rồi mở lại với CÙNG tham chiếu ⇒ trả nguyên object cũ, không dựng lại.
  assert.equal(memo(snapshot), first);
  assert.equal(calls, 1);

  // Snapshot MỚI (bằng giá trị nhưng khác tham chiếu) thì phải dựng lại — nếu không, đổi bộ
  // dữ liệu sẽ vẽ bằng chứng của bộ cũ.
  memo([cell({ pop: 100, dist: 300 })]);
  assert.equal(calls, 2);

  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /memoizeByReference\(buildDemandAccessScatter\)/);
  assert.match(controller, /evidenceOpen && scatterColumnAvailable && cells\.length > 0/,
    "chỉ dựng khi khối ĐANG MỞ");
  assert.match(controller, /useState\(false\)/, "mặc định đóng");
});

test("AT-19 chỉ đọc: không đường nào ghi state toàn cục từ bàn phím", () => {
  const src = code("ui/Scatter.tsx");
  assert.doesNotMatch(src, /useStore|setFilter|clearFilter|selectEntity|\bsetT\(/,
    "không một lệnh ghi store nào");
  assert.doesNotMatch(src, /location\.hash|history\.(push|replace)State/, "không ghi hash");
  // Bàn phím tương đương con trỏ: bốn mũi tên + Home/End/Esc, và chỉ đổi state CỤC BỘ.
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"]) {
    assert.match(src, new RegExp(`"${key}"`), `thiếu phím ${key}`);
  }
  assert.match(src, /shiftKey \? 10 : 1/, "Shift + mũi tên đi mười bước");
  assert.match(src, /tabIndex=\{0\}/);
  assert.match(src, /role="group"/, 'role="img" là sai ở đây — nội dung đọc được bằng phím');
  assert.match(src, /aria-live="polite"/);

  // Trạng thái đóng/mở là state CỤC BỘ của controller, không phải store/hash/preset/cảnh.
  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /const \[evidenceOpen, setEvidenceOpen\] = useState\(false\)/);
  assert.doesNotMatch(controller, /setHash|evidenceOpen[^\n]*useStore/);
});

// ── AT-20: bốn trạng thái, bốn câu khác nhau ────────────────────────────────

test("AT-20 bốn trạng thái phân biệt được, và không cái nào là khung trục rỗng", () => {
  const values = Object.values(SCATTER_STATE_COPY);
  assert.equal(values.length, 4);
  assert.equal(new Set(values).size, 4, "bốn câu phải KHÁC nhau");
  for (const s of values) assert.ok(s.trim().length > 0, `trạng thái không được là chuỗi rỗng`);

  // `unavailable` nói về CỘT, `empty` nói về HÀNG — hai sự thật khác nhau.
  assert.match(SCATTER_STATE_COPY.unavailable, /không có cột cự ly mạng đường/);
  assert.match(SCATTER_STATE_COPY.empty, /Không ô nào có đủ/);

  // Trạng thái RỖNG in dòng đếm chứ không in một khung trục.
  const empty = buildDemandAccessScatter([cell({ pop: 100, dist: null })]);
  assert.equal(empty.nPlotted, 0);
  const lines = scatterCountsLines(empty);
  assert.equal(lines[0], "0 ô đang vẽ · 0 ô không người (khe =0)");
  assert.equal(lines.length, 2, "…kèm dòng nói ô nào bị loại và vì sao");

  const src = code("ui/Scatter.tsx");
  assert.match(src, /SCATTER_STATE_COPY\.loading/);
  assert.match(src, /SCATTER_STATE_COPY\.empty/);
  assert.match(src, /model\.nPlotted === 0/, "nhánh RỖNG không vẽ trục");
  assert.doesNotMatch(src, /Thử lại/, "khối này không sở hữu request nên không được sở hữu nút thử lại");

  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /SCATTER_STATE_COPY\.unavailable/);
  assert.match(controller, /gridColumnAvailable\(SCATTER_DIST_FIELD\)/, "vô hiệu theo CỘT, không theo số hàng");
});

// ── Dòng đếm §C: hai bản in kỳ vọng ─────────────────────────────────────────

test("§C dòng đếm in đủ ba con số và tỉ lệ theo DÂN ĐÃ BIẾT", () => {
  const model = buildDemandAccessScatter([
    ...Array.from({ length: 3 }, (_, i) => cell({ h3: `z${i}`, pop: 0, dist: 900 })),
    cell({ h3: "p", pop: 990429, dist: 1200 }),
    cell({ h3: "x", pop: 9571, dist: null }),
  ]);

  const lines = scatterCountsLines(model);
  assert.equal(lines[0], "4 ô đang vẽ · 3 ô không người (khe =0)");
  assert.match(lines[1]!, /^1 ô chưa rõ cự ly mạng đường — nơi 9\.571 người \(0,96% dân đã biết\)/);

  // `pop` là số THỰC (dân số phân bổ theo diện tích): số người phải LÀM TRÒN trước khi in.
  // Ảnh render bắt được đúng lỗi này trên `p/01` — "9.571,231 người".
  const fractional = buildDemandAccessScatter([
    cell({ h3: "k", pop: 1000, dist: 100 }),
    cell({ h3: "x", pop: 9571.231, dist: null }),
  ]);
  assert.match(scatterCountsLines(fractional)[1]!, /nơi 9\.571 người/);

  // Dòng 3 chỉ hiện khi có gì để nói — nhưng nhánh ấy ĐƯỢC viết và ĐƯỢC kiểm.
  assert.equal(lines.length, 2);
  const withBroken = buildDemandAccessScatter([
    cell({ pop: 10, dist: 10 }),
    cell({ pop: null, dist: 10 }),
    cell({ pop: -1, dist: 10 }),
  ]);
  const brokenLines = scatterCountsLines(withBroken);
  assert.equal(brokenLines.length, 2);
  assert.match(brokenLines[1]!, /1 ô khuyết dân số · 1 ô có giá trị hỏng/);
});
