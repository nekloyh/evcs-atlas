import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FIELD_BY_ID,
  LENSES,
  STATION_OCC_FIELD,
  defaultFieldOfLens,
  scaleContractOf,
  type LensId,
} from "../src/fields.ts";
import {
  applyScaleMode,
  buildScale,
  classOf,
  colorFor,
  gradientAvailability,
  scaleColors,
  seriesColorForTheme,
  type NumericScale,
} from "../src/viz/palette.ts";
import { themeFor, themeOfLens } from "../src/viz/theme.ts";
import {
  buildDemandPopulationHistogram,
  buildSupplyPowerTierBreakdown,
  buildAccessPopulationCurve,
  buildOpportunityCommuneRank,
  type OpportunityCommuneRow,
} from "../src/viz/chart-models.ts";

function code(relPath: string): string {
  return readFileSync(join(process.cwd(), "src", relPath), "utf-8");
}

// ── Test 1: Single Color Path ────────────────────────────────────────────────

test("Acceptance 1: Single color path — cell fill equals colorFor(v, scale, 'utilization') in both modes", () => {
  const occField = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  const contract = scaleContractOf(occField);
  const sampleValues = [0, 0.1, 0.2, 0.25, 0.35, 0.5, 0.8, 1.0];
  const binnedScale = buildScale("numeric", sampleValues, null, undefined, {
    contract,
    requestedMode: "binned",
  }) as NumericScale;
  const gradientScale = applyScaleMode(binnedScale, contract, "gradient", true) as NumericScale;

  for (const modeScale of [binnedScale, gradientScale]) {
    const testCases = [null, undefined, 0, 0.25, 1.0];
    for (const v of testCases) {
      const expectedColor = colorFor(v, modeScale, "utilization");
      if (v === null || v === undefined) {
        assert.equal(expectedColor, null, `colorFor(${v}) must return null for missing data`);
      } else {
        assert.ok(expectedColor !== null, `colorFor(${v}) must return a valid RGB color`);
        assert.equal(expectedColor.length, 3);
      }
    }
  }

  // Source inspection: Heatmap168 and MiniHeatmap must route through colorFor and never use rampFor
  const heatmapSrc = code("ui/Heatmap168.tsx");
  assert.match(heatmapSrc, /colorFor\(/, "Heatmap168 must call colorFor");
  assert.doesNotMatch(heatmapSrc, /rampFor\(/, "Heatmap168 must not call rampFor");
  assert.doesNotMatch(heatmapSrc, /classOf\(/, "Heatmap168 must not call classOf");

  const miniHeatmapSrc = code("ui/MiniHeatmap.tsx");
  assert.match(miniHeatmapSrc, /colorFor\(/, "MiniHeatmap must call colorFor");
  assert.doesNotMatch(miniHeatmapSrc, /rampFor\(/, "MiniHeatmap must not call rampFor");
  assert.doesNotMatch(miniHeatmapSrc, /classOf\(/, "MiniHeatmap must not call classOf");
});

// ── Test 2: Binned Parity ────────────────────────────────────────────────────

test("Acceptance 2: Binned parity — in binned mode, colorFor equals scaleColors[classOf(v)]", () => {
  const occField = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  const contract = scaleContractOf(occField);
  const sampleValues = [0, 0.05, 0.12, 0.25, 0.38, 0.55, 0.85];
  const scale = buildScale("numeric", sampleValues, null, undefined, {
    contract,
    requestedMode: "binned",
  }) as NumericScale;

  const colors = scaleColors(scale, "utilization");
  for (const v of [0, 0.05, 0.2, 0.4, 0.9]) {
    const k = classOf(v, scale);
    assert.ok(k !== null);
    const expected = colors[k];
    const actual = colorFor(v, scale, "utilization");
    assert.deepEqual(actual, expected, `Mismatch for value ${v} in binned mode`);
  }
});

// ── Test 3: Mode Propagation Without New State ───────────────────────────────

test("Acceptance 3: Mode propagation without new state — gate and n=0 rules govern scale mode", () => {
  const occField = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  const contract = scaleContractOf(occField);
  const gate = gradientAvailability("utilization", false);
  assert.equal(gate.allowed, true, "utilization sequential gradient must be allowed");

  const baseScale = buildScale("numeric", [0.1, 0.2, 0.3], null, undefined, {
    contract,
    requestedMode: "binned",
  }) as NumericScale;

  // sc=g with allowed gate -> gradient
  const gradScale = applyScaleMode(baseScale, contract, "gradient", gate.allowed) as NumericScale;
  assert.equal(gradScale.mode, "gradient");

  // sc=g with blocked gate -> binned
  const blockedScale = applyScaleMode(baseScale, contract, "gradient", false) as NumericScale;
  assert.equal(blockedScale.mode, "binned");

  // sc=binned -> binned
  const binnedScale = applyScaleMode(baseScale, contract, "binned", gate.allowed) as NumericScale;
  assert.equal(binnedScale.mode, "binned");

  // Empty / n=0 dataset -> binned (QA 2.1-004 contract)
  const emptyBase = buildScale("numeric", [], null, undefined, {
    contract,
    requestedMode: "gradient",
  }) as NumericScale;
  assert.equal(emptyBase.mode, "binned");
  const emptyApplied = applyScaleMode(emptyBase, contract, "gradient", true) as NumericScale;
  assert.equal(emptyApplied.mode, "binned");

  // Component APIs: Heatmap168 and MiniHeatmap must accept scale: Scale | null and NO mode prop
  const heatmapSrc = code("ui/Heatmap168.tsx");
  assert.doesNotMatch(heatmapSrc, /scaleMode|mode\s*:\s*ScaleMode/, "Heatmap168 must not accept a separate mode prop");

  const miniHeatmapSrc = code("ui/MiniHeatmap.tsx");
  assert.doesNotMatch(miniHeatmapSrc, /scaleMode|mode\s*:\s*ScaleMode/, "MiniHeatmap must not accept a separate mode prop");
});

// ── Test 4: Shared Object Identity ───────────────────────────────────────────

/**
 * Tiêu chí 4 đòi identity `===` giữa thang mà lớp Trạm vẽ và thang mà heatmap vẽ.
 *
 * Phần ĐO ĐƯỢC ở tầng thuần: chứng minh mối nguy là THẬT — `applyScaleMode` trả object MỚI
 * khi chế độ đổi, nên hai chỗ gọi trên cùng đầu vào KHÔNG BAO GIỜ cho identity ở gradient.
 * Đó là lý do App chỉ được có đúng một chỗ gọi cho trường này.
 *
 * Phần CẤU TRÚC: App có đúng một `applyScaleMode(occClassing…)`, và nhánh `station:occ` của
 * `scale` trả thẳng chính biến ấy — nên ba người đọc (bản đồ, dock, panel) nhận một object.
 * Đây là chỗ bộ test này KHÔNG chạm được tới hành vi: không có harness DOM để render App và
 * so hai prop bằng `===`. Khai ra, không giả vờ đã đo.
 */
test("Acceptance 4: Shared object identity — one applyScaleMode call site for station:occ", () => {
  const occField = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  const contract = scaleContractOf(occField);
  const base = buildScale("numeric", [0.1, 0.2, 0.3], null, undefined, {
    contract,
    requestedMode: "binned",
  }) as NumericScale;

  // Mối nguy có thật: đổi chế độ là sinh object mới.
  const g1 = applyScaleMode(base, contract, "gradient", true);
  const g2 = applyScaleMode(base, contract, "gradient", true);
  assert.notEqual(g1, g2, "hai chỗ gọi trên cùng đầu vào cho hai object khác nhau ở gradient");
  assert.deepEqual(g1, g2, "…dù chúng bằng nhau về cấu trúc — nên `===` là thứ phải giữ bằng kiến trúc");
  // Giữ nguyên chế độ thì KHÔNG sinh object mới — điều kiện để một chỗ gọi là đủ.
  assert.equal(applyScaleMode(base, contract, "binned", true), base);

  const appSrc = code("App.tsx");
  const callSites = appSrc.match(/applyScaleMode\(\s*occClassing/g) ?? [];
  assert.equal(callSites.length, 1, "chỉ được MỘT chỗ gọi applyScaleMode cho occClassing");

  // Nhánh `station:occ` của `scale` trả thẳng `utilizationScale` — không dựng thang thứ hai.
  assert.match(
    appSrc,
    /meta\.id === STATION_OCC_FIELD\s*\?\s*utilizationScale/,
    "thang của bản đồ ở trường station:occ phải LÀ utilizationScale, không phải một bản dựng lại",
  );
  assert.match(appSrc, /utilizationScale=\{utilizationScale\}/, "dock nhận cùng biến");
  assert.match(appSrc, /occScale=\{utilizationScale\}/, "panel bằng chứng nhận cùng biến");

  // Và không còn snapshot nào chen vào giữa: `setScaleSnapshot` không được chạm station:occ.
  assert.doesNotMatch(
    appSrc,
    /STATION_OCC_FIELD[\s\S]{0,200}setScaleSnapshot/,
    "station:occ không đi qua scaleSnapshot nữa — snapshot là bản sao thứ hai của cùng một thang",
  );
});

// ── Test 4b: số đếm theo GIỜ không được trộn vào Scale (QA 4.1-001) ──────────

test("Acceptance 4b: hai số đếm của giờ đang xem đi riêng, không ghi đè n/nNull của thang", () => {
  const occField = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  const contract = scaleContractOf(occField);

  // `allOccValues` lọc null TRƯỚC khi chia bậc, nên thang không mang được số ô trống nào:
  // đọc `scale.nNull` để vẽ swatch "chưa đo được" là khai "không thiếu gì" trên một bản đồ
  // đang có chấm rỗng. Đây là số đo, không phải suy luận.
  const scale = buildScale("numeric", [0.1, 0.2, 0.3, 0.4], null, undefined, {
    contract,
    requestedMode: "binned",
  }) as NumericScale;
  assert.equal(scale.nNull, 0, "thang dựng từ allOccValues không có null nào để đếm");

  const appSrc = code("App.tsx");
  // Số của giờ đến từ `occCountAt` và đi bằng một prop RIÊNG.
  assert.match(appSrc, /occCountAt\(occupancy\.profiles, t\)/, "App phải đếm theo giờ đang xem");
  assert.match(appSrc, /drawnCount=\{meta\.id === STATION_OCC_FIELD \? occDrawnCount : null\}/,
    "số theo giờ đi thành prop riêng, chỉ cho trường theo giờ");
  // …và KHÔNG được spread đè lên thang nữa.
  assert.doesNotMatch(appSrc, /\.\.\.occClassing/, "không được spread occClassing để nhét số đếm vào");

  const legendSrc = code("ui/Legend.tsx");
  assert.match(legendSrc, /const nNullDrawn = drawnCount \? drawnCount\.missing : scale\?\.nNull \?\? 0/,
    "Legend ưu tiên số ĐANG VẼ khi trường có tập vẽ khác tập chia bậc");
  assert.match(legendSrc, /scale && nNullDrawn > 0/, "swatch ô trống mở theo số đang vẽ");

  // Đơn vị của tập chia bậc phải được KHAI, không để legend đoán theo readAs.
  assert.equal(occField.classingNoun, "trạm-giờ", "station:occ chia bậc theo trạm-giờ");
  assert.match(legendSrc, /classingNote\(scale, field\.classingNoun \?\? noun\)/,
    "câu chia bậc gọi đúng tên tập của nó");

  // Câu KHUYẾT ở khối GIỚI HẠN phải đếm cùng tập với swatch của legend — hai dòng đứng cách
  // nhau ba centimet trong cùng một cột, nói ngược nhau là lỗi nặng hơn cả hai cùng sai.
  const colSrc = code("components/atlas/AtlasReadColumn.tsx");
  assert.match(colSrc, /const nNull = drawnCount \? drawnCount\.missing : scale\?\.nNull \?\? 0/,
    "câu khuyết đọc số ĐANG VẼ khi có");
  assert.match(colSrc, /const nTotal = drawnCount \? drawnCount\.present \+ drawnCount\.missing/,
    "mẫu số của câu khuyết cũng là tập đang vẽ");
});

// ── Test 5: Toggle Isolation ─────────────────────────────────────────────────

/**
 * Tiêu chí 5 có HAI nửa và bản cũ chỉ chạm nửa thứ nhất bằng một phép so tautology (dựng
 * cùng một model hai lần với cùng đầu vào rồi so JSON — `sc` không hề tham gia).
 *
 * Nửa "zero byte của model": model builder không có tham số chế độ nào để mà truyền — chốt
 * bằng CHỮ KÝ HÀM, thứ sẽ gãy nếu ai đó thêm.
 * Nửa "zero prop của component": bốn module ấy không được có đường nào chạm tới thang màu.
 */
test("Acceptance 5a: Toggle isolation — bốn chart độc lập không có đường nào chạm thang màu", () => {
  // Model builder không có tham số chế độ nào: mỗi hàm chỉ có MỘT đối số bắt buộc (dữ liệu),
  // phần còn lại là bộ lọc/lựa chọn có mặc định.
  assert.equal(buildDemandPopulationHistogram.length, 1);
  assert.equal(buildSupplyPowerTierBreakdown.length, 1);
  assert.equal(buildAccessPopulationCurve.length, 1);
  assert.equal(buildOpportunityCommuneRank.length, 1);

  // …và cả module model không hề biết tới thang màu: thêm `sc` vào đây sẽ gãy ngay.
  const models = code("viz/chart-models.ts");
  assert.doesNotMatch(models, /\bScaleMode\b|\bapplyScaleMode\b|\bcolorFor\b/,
    "chart-models không được chạm tới hệ thang màu");

  for (const file of [
    "ui/PopulationHistogram.tsx",
    "ui/PowerTierBreakdown.tsx",
    "ui/AccessCurve.tsx",
    "ui/OpportunityCommuneRankBars.tsx",
  ]) {
    const src = code(file);
    assert.doesNotMatch(src, /\bscaleMode\b/, `${file}: không được đọc chế độ thang`);
    assert.doesNotMatch(src, /\bapplyScaleMode\b|\bcolorFor\b|\bclassOf\b|\bscaleColors\b/,
      `${file}: không có kênh màu theo giá trị nên không được gọi hàm thang nào`);
    assert.doesNotMatch(src, /scale\s*[?:]\s*Scale/, `${file}: không được nhận prop scale`);
  }

  // Router chỉ đưa `scale` vào đúng nhánh heatmap — bốn nhánh kia không thấy thang.
  const router = code("components/atlas/PrimaryLensChart.tsx");
  for (const tag of ["PopulationHistogram", "PowerTierBreakdown", "AccessCurve", "OpportunityCommuneRankBars"]) {
    assert.doesNotMatch(router, new RegExp(`<${tag}\\b[^>]*\\bscale=`), `${tag} không được nhận scale`);
  }
  assert.match(router, /<Heatmap168[\s\S]{0,160}scale=\{scale\}/, "chỉ heatmap nhận thang");
});

test("Acceptance 5b: model của bốn chart độc lập là hàm thuần trên dữ liệu", () => {
  const cells = [
    { h3: "881", value: 10, pop: 10, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 500, reachable: true },
    { h3: "882", value: 50, pop: 50, ports: 0, lat: 21, lng: 105, beyond2km: false, dist: 1200, reachable: true },
  ];
  const stations = [
    {
      id: "st1",
      stationCode: "ST01",
      lat: 21,
      lng: 105,
      inScope: true,
      opStatus: "OPERATIONAL",
      access: null,
      nPorts: 4,
      powerKwMaxPort: 60,
      powerKwSite: 120,
      powerTier: "61-120" as const,
    },
  ];

  const mockCommunes: OpportunityCommuneRow[] = [
    {
      commune_code: "00001",
      commune_name: "A",
      n_cells: 10,
      n_population_missing: 0,
      n_distance_unknown: 0,
      population_total: 1000,
      population_measured: 1000,
      population_within_2km: 800,
      population_beyond_2km: 200,
      population_distance_unknown: 0,
    },
  ];

  const demand1 = buildDemandPopulationHistogram(cells, null);
  const supply1 = buildSupplyPowerTierBreakdown(stations, null);
  const access1 = buildAccessPopulationCurve(cells);
  const opp1 = buildOpportunityCommuneRank(mockCommunes);

  // Serialized snapshots of model structures
  const jsonDemand1 = JSON.stringify(demand1);
  const jsonSupply1 = JSON.stringify(supply1);
  const jsonAccess1 = JSON.stringify(access1);
  const jsonOpp1 = JSON.stringify(opp1);

  // Models do not accept scaleMode and their outputs are independent of any scale mode toggle
  const demand2 = buildDemandPopulationHistogram(cells, null);
  const supply2 = buildSupplyPowerTierBreakdown(stations, null);
  const access2 = buildAccessPopulationCurve(cells);
  const opp2 = buildOpportunityCommuneRank(mockCommunes);

  assert.equal(JSON.stringify(demand2), jsonDemand1);
  assert.equal(JSON.stringify(supply2), jsonSupply1);
  assert.equal(JSON.stringify(access2), jsonAccess1);
  assert.equal(JSON.stringify(opp2), jsonOpp1);
});

// ── Test 6: Zero vs Null ─────────────────────────────────────────────────────

test("Acceptance 6: Zero vs null — value 0 maps to valid zero color, null maps to null (hatch), they are never equal", () => {
  const occField = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
  const contract = scaleContractOf(occField);
  const scaleBinned = buildScale("numeric", [0, 0.1, 0.2, 0.5], null, undefined, {
    contract,
    requestedMode: "binned",
  }) as NumericScale;
  const scaleGrad = applyScaleMode(scaleBinned, contract, "gradient", true) as NumericScale;

  for (const scale of [scaleBinned, scaleGrad]) {
    const colorZero = colorFor(0, scale, "utilization");
    const colorNull = colorFor(null, scale, "utilization");

    assert.notEqual(colorZero, null, `colorFor(0) must not be null in ${scale.mode} mode`);
    assert.equal(colorNull, null, `colorFor(null) must be null in ${scale.mode} mode`);
    assert.notDeepEqual(colorZero, colorNull);
  }
});

// ── Test 7: Identity Token Registry ──────────────────────────────────────────

/**
 * Bản cũ của tiêu chí 7 chặn `RAMP_HEX` nhưng cho phép mỗi module gõ TÊN THEME của mình
 * (`seriesColorForTheme("supply")`). Đó vẫn là nhân bản ánh xạ lens → theme ra năm chỗ, và
 * gõ nhầm tên vào nhầm biểu đồ thì bộ test cũ vẫn xanh. Nay: không module biểu đồ nào được
 * gọi hàm bảng màu với một CHUỖI HẰNG — theme phải tới từ ngoài.
 */
test("Acceptance 7: Identity token registry — không module biểu đồ nào tự gõ tên bảng màu", () => {
  const chartFiles = [
    "ui/PopulationHistogram.tsx",
    "ui/PowerTierBreakdown.tsx",
    "ui/AccessCurve.tsx",
    "ui/OpportunityCommuneRankBars.tsx",
    // CR 4.2: scatter bằng chứng nhận `theme` qua prop từ `LensChartController` — cùng luật
    // §C2 với năm biểu đồ chính, dù nó không phải một biểu đồ chính.
    "ui/Scatter.tsx",
    "ui/HourProfile.tsx",
    "ui/SupplyLorenz.tsx",
    "ui/Heatmap168.tsx",
    "ui/MiniHeatmap.tsx",
    "story/LorenzChart.tsx",
  ];

  for (const file of chartFiles) {
    const src = code(file);
    assert.doesNotMatch(src, /const\s+(SERIES|CALLOUT|SELECTED_COLOR)\s*=\s*RAMP_HEX/,
      `${file}: mực chuỗi không được lấy từ ramp mặc định`);
    // Không được gọi hàm bảng màu với chuỗi hằng — kể cả chuỗi ĐÚNG của hôm nay.
    assert.doesNotMatch(src, /(seriesColorForTheme|getThemePalette|colorFor|scaleColors)\([^)]*["'][a-z-]+["']/,
      `${file}: theme phải đến từ prop, không phải một tên gõ tay`);
    // …và không được có mặc định gõ tay ở chữ ký.
    assert.doesNotMatch(src, /theme\s*=\s*["'][a-z-]+["']/,
      `${file}: không được có theme mặc định gõ tay`);
  }

  // Registry: `themeOfLens` là bên NÓI, và nó khớp với `themeFor(trường mặc định của lens)`.
  const expectedLensTheme: Record<LensId, string> = {
    demand: "exploration",
    supply: "supply",
    access: "accessibility",
    utilization: "utilization",
    opportunity: "screening",
  };

  for (const lens of LENSES) {
    const id = lens.id as LensId;
    const def = defaultFieldOfLens(id)!;
    assert.equal(themeOfLens(id, "hex"), themeFor(def, "hex"), `Lens ${id}: hai cửa phải cùng câu trả lời`);
    assert.equal(themeOfLens(id, "hex"), expectedLensTheme[id], `Lens ${id} theme mismatch`);
    assert.ok(seriesColorForTheme(themeOfLens(id, "hex")).startsWith("#"), `Lens ${id} phải có mực chuỗi`);
  }

  // Representation SỐNG, không ghim: ở lens Cầu, đổi cách đọc là đổi theme (QA 4.1-006).
  assert.equal(themeOfLens("demand", "hex"), "exploration");
  assert.equal(themeOfLens("demand", "density"), "demand");
  assert.notEqual(seriesColorForTheme("demand"), seriesColorForTheme("exploration"));

  // Controller truyền representation đang bật xuống, đúng cửa mà `ThemeReadout` dùng.
  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /themeOfLens\(lensId, demandRepresentation\)/,
    "controller phải dùng representation đang bật");
  assert.doesNotMatch(controller, /themeFor\([^)]*["']hex["']/, "không được ghim representation");
});

// ── Test 8: Raw Readout Pin ──────────────────────────────────────────────────

test("Acceptance 8: Raw readout pin — heatmap readout & aria format raw percentages, no transformed/LUT indices surface", () => {
  const heatmapSrc = code("ui/Heatmap168.tsx");

  // Readout formats cell.value * 100
  assert.match(heatmapSrc, /hoverCell\.value\s*\*\s*100/, "Hover tooltip must compute percent directly from raw value * 100");
  assert.match(heatmapSrc, /cell\.value\s*\*\s*100/, "Aria label must compute percent directly from raw value * 100");

  // Must not expose internal LUT index or transformation
  assert.doesNotMatch(heatmapSrc, /sequentialPosition|colorPosition|LUT/, "Heatmap168 must not expose LUT or position in user-facing readout");
});
