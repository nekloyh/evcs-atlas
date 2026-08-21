/**
 * Lens SỬ DỤNG — bề mặt: biểu đồ thời gian, lớp vùng, wire format, vòng đời truy vấn.
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §21.2, §21.3, §21.4, §22.
 *
 * `utilization-model.test.ts` khoá phép TÍNH. File này khoá phép TRÌNH BÀY và phép NỐI
 * DÂY — chỗ mà một con số đúng vẫn có thể bị vẽ sai, đặt sai tên, hoặc bị một truy vấn
 * DuckDB đi kèm mỗi lần scrub.
 *
 * Ba nhóm ở đây có hình thức khác nhau vì chúng kiểm ba loại điều khác nhau:
 *   · HÀM THUẦN (`stepRuns`, `utilY`, `utilCellName`) — gọi thẳng, so kết quả;
 *   · WIRE FORMAT (hash, selection) — round-trip;
 *   · CẤU TRÚC (`.tsx` không import được vào `node --test` vì JSX) — đọc mã nguồn, và chỉ
 *     bám vào những dấu hiệu KHÔNG mơ hồ.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { HOURS_IN_WEEK, scrubberKeyStep, tOf } from "../src/state/types.ts";
import {
  DEFAULT_UTIL_REPRESENTATION,
  UTIL_REPRESENTATION_WIRE,
  parseUtilRepresentation,
} from "../src/state/types.ts";
import {
  UTIL_CHART_H,
  UTIL_ROWS_H,
  UTIL_ROW_GAP,
  UTIL_ROW_H,
  stepPath,
  stepRuns,
  utilCellName,
  utilRowTop,
  utilY,
  weekExtrema,
} from "../src/viz/utilization-chart.ts";
import { buildUtilizationWeekModel } from "../src/viz/chart-models.ts";
import { OCC_TZ_UNKNOWN } from "../src/viz/occ-time.ts";
import { parseHash, serializeHash } from "../src/state/hash.ts";
import {
  UTIL_REGION_SEL_PREFIX,
  isSameSelection,
  parseEntitySelection,
  serializeEntitySelection,
  selectionKindLabel,
  utilRegionSelection,
} from "../src/state/selection.ts";
import { parseSelection, serializeSelection, utilRegionOf } from "../src/data/h3.ts";
import { HOURS_IN_WEEK as WEEK } from "../src/state/types.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
/** Mã nguồn ĐÃ BÓC chú thích — một cổng bám vào chữ trong comment là một cổng nói dối. */
const code = (rel: string) =>
  readFileSync(`${SRC}${rel}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const raw = (rel: string) => readFileSync(`${SRC}${rel}`, "utf8");

const H3_A = "871eb0800ffffff";

// ══ 1. Biểu đồ thời gian: hình học ═══════════════════════════════════════════

test("đường bậc thang NGẮT qua null, và một ô đơn độc vẫn là một đoạn", () => {
  const hours = [0.1, 0.2, null, 0.3, null, null, 0.4, 0.5];
  const runs = stepRuns(hours);
  assert.equal(runs.length, 3, "ba đoạn liên tục");
  assert.deepEqual(runs[0]!.map((p) => p.hour), [0, 1]);
  assert.deepEqual(runs[1]!.map((p) => p.hour), [3], "ô đơn độc KHÔNG bị nuốt");
  assert.deepEqual(runs[2]!.map((p) => p.hour), [6, 7]);
  // Không đoạn nào bắc qua một ô null — nối liền qua nó là bịa một giá trị chưa từng đo.
  for (const run of runs) {
    for (let i = 1; i < run.length; i++) {
      assert.equal(run[i]!.hour - run[i - 1]!.hour, 1, "trong một đoạn, giờ phải liền nhau");
    }
  }
});

test("24 ô toàn null cho KHÔNG đoạn nào — không phải một đường ở đáy", () => {
  assert.deepEqual(stepRuns(new Array(24).fill(null)), []);
});

test("cực trị tuần bỏ qua null nhưng không bỏ số 0", () => {
  const cells = [
    { t: 0, dow: 0, hour: 0, utilization: null },
    { t: 1, dow: 0, hour: 1, utilization: 0 },
    { t: 2, dow: 0, hour: 2, utilization: 0.4 },
    { t: 3, dow: 0, hour: 3, utilization: 0.2 },
  ] as unknown as Parameters<typeof weekExtrema>[0];
  const extrema = weekExtrema(cells);
  assert.equal(extrema?.high.t, 2);
  assert.equal(extrema?.low.t, 1, "0 quan sát được là trough, không phải dữ liệu thiếu");
  assert.equal(weekExtrema([cells[0]!] as Parameters<typeof weekExtrema>[0]), null);
});

test("`NaN` bị coi là null, không lọt vào path", () => {
  assert.deepEqual(stepRuns([0.5, NaN, 0.5]).length, 2);
});

test("mỗi ô giờ là một bậc PHẲNG phủ `[h, h+1)` — không nội suy giữa hai ô", () => {
  const d = stepPath([{ hour: 5, value: 0.5 }], 0, 296);
  // Một điểm ⇒ đúng hai lệnh: M ở mép trái ô, L ở mép phải, CÙNG y.
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => m[1]);
  assert.equal(ys.length, 2);
  assert.equal(ys[0], ys[1], "hai đầu của một bậc phải cùng cao độ");
  assert.doesNotMatch(d, /[CSQTA]/, "không có lệnh cong nào — step, không spline");
});

test("trục y TUYỆT ĐỐI: 0 ở đáy hàng, 1 ở đỉnh, và giá trị ngoài miền bị KẸP", () => {
  const top = utilRowTop(2);
  assert.equal(utilY(2, 0), top + UTIL_ROW_H, "0 nằm ở đáy hàng");
  assert.equal(utilY(2, 1), top, "100% nằm ở đỉnh hàng");
  assert.equal(utilY(2, 0.5), top + UTIL_ROW_H / 2);
  assert.equal(utilY(2, 1.4), top, "vượt 100% kẹp ở endpoint, không tràn khỏi hàng");
  assert.equal(utilY(2, -0.2), top + UTIL_ROW_H);
  // KHÔNG có tham số miền: không đường nào truyền một `domain` khác vào được.
  assert.equal(utilY.length, 2, "(dow, value) — không có domain để mà autoscale");
});

test("cùng giá trị ⇒ cùng chiều cao ở cả bảy hàng — trục dùng chung, không phải bảy trục", () => {
  const offsets = Array.from({ length: 7 }, (_, d) => utilY(d, 0.3) - utilRowTop(d));
  // So bằng sai số, không bằng `===`: `top + h*(1-v) - top` không khôi phục `h*(1-v)` từng
  // bit khi `top` lớn dần theo hàng. Sai khác cỡ 1e-14 px, và toạ độ SVG chỉ in 2 chữ số
  // thập phân — nó vô hình. Cái test này chặn là một trục co giãn THEO HÀNG, thứ sẽ lệch
  // hàng đơn vị pixel chứ không lệch bit.
  for (const o of offsets) {
    assert.ok(Math.abs(o - offsets[0]!) < 1e-9, `lệch ${o - offsets[0]!} px giữa hai hàng`);
  }
});

test("bố cục khớp §9.1 và nằm dưới trần chiều cao", () => {
  assert.equal(UTIL_ROW_H, 24);
  assert.equal(UTIL_ROW_GAP, 4);
  assert.equal(UTIL_ROWS_H, 7 * 24 + 6 * 4);
  assert.ok(UTIL_CHART_H <= 224, `khung ${UTIL_CHART_H}px phải ≤ 224px`);
});

// ══ 2. Biểu đồ thời gian: bàn phím và AT ════════════════════════════════════

test("←/→ đổi giờ, ↑/↓ và Page đổi ngày, Home/End hai mút — tất cả WRAP trong tuần", () => {
  // Biểu đồ ánh xạ ↑/↓ sang PageUp/PageDown rồi gọi CÙNG `scrubberKeyStep` mà scrubber
  // dùng. Khoá chính cái ánh xạ ấy ở đây: hai điều khiển của một trục phải cùng một luật.
  assert.equal(scrubberKeyStep(tOf(0, 0), "ArrowLeft"), HOURS_IN_WEEK - 1, "wrap về cuối tuần");
  assert.equal(scrubberKeyStep(HOURS_IN_WEEK - 1, "ArrowRight"), 0, "wrap về đầu tuần");
  assert.equal(scrubberKeyStep(tOf(3, 18), "PageUp"), tOf(4, 18), "cùng giờ, ngày sau");
  assert.equal(scrubberKeyStep(tOf(0, 18), "PageDown"), tOf(6, 18), "wrap 7 ngày");
  assert.equal(scrubberKeyStep(tOf(2, 5), "Home"), 0);
  assert.equal(scrubberKeyStep(tOf(2, 5), "End"), HOURS_IN_WEEK - 1);
  assert.equal(scrubberKeyStep(tOf(2, 5), "Tab"), null, "phím lạ ⇒ null ⇒ KHÔNG preventDefault");
  assert.equal(scrubberKeyStep(tOf(2, 5), "a"), null);
});

test("biểu đồ ánh xạ ↑/↓ sang ±24 và KHÔNG chặn phím lạ", () => {
  const src = code("ui/UtilizationDayProfiles.tsx");
  assert.match(src, /ArrowUp["']\s*\?\s*["']PageUp/, "↑ = ngày trước/sau, không phải một giờ");
  assert.match(src, /ArrowDown["']\s*\?\s*["']PageDown/);
  assert.match(src, /scrubberKeyStep/, "dùng chung hàm bước với scrubber, không chép luật");
  // `preventDefault` phải nằm SAU cổng `next === null` — nếu trước, Tab chết trong biểu đồ.
  assert.match(
    src,
    /if \(next === null[\s\S]{0,60}?return;[\s\S]{0,80}?preventDefault\(\)/,
    "phím lạ phải đi tiếp trước khi có bất kỳ preventDefault nào",
  );
});

test("tên đọc được mang GIÁ TRỊ hoặc chữ 'chưa đủ quan sát', kèm coverage — không chỉ vị trí", () => {
  const cells = buildUtilizationWeekModel(profilesWith({ t: tOf(1, 18), occ: 4, obs: 4, ports: 10 })).cells;
  const named = utilCellName(cells[tOf(1, 18)]!, OCC_TZ_UNKNOWN);
  assert.match(named, /Thứ Ba/, "ngày");
  assert.match(named, /ô giờ 18/, "ô giờ, KHÔNG phải nhãn đồng hồ");
  assert.match(named, /40%/, "giá trị");
  assert.match(named, /4 trên 10 cổng/, "tử số và mẫu số");
  assert.match(named, /coverage cổng/, "coverage");

  const empty = utilCellName(cells[tOf(0, 0)]!, OCC_TZ_UNKNOWN);
  assert.match(empty, /chưa đủ quan sát/);
  // Chỉ cấm ở phần GIÁ TRỊ. `coverage cổng 0%` là một phát biểu ĐÚNG và cần thiết — ở ô
  // giờ đó thật sự không cổng nào được quan sát. Cấm cả chuỗi `0%` sẽ là cấm nói ra
  // chính điều làm cho ô ấy null.
  assert.doesNotMatch(empty, /0% cổng bận/, "ô null KHÔNG được đọc thành 0% cổng bận");
  assert.match(empty, /coverage cổng 0%/, "…nhưng coverage 0% thì phải nói ra");

  const known = utilCellName(cells[tOf(1, 18)]!, { kind: "declared", tz: "Asia/Ho_Chi_Minh" });
  assert.match(known, /18:00 · Asia\/Ho_Chi_Minh/, "công bố rồi thì được in giờ");
});

function profilesWith({ t, occ, obs, ports }: { t: number; occ: number; obs: number; ports: number }) {
  const p = {
    occ: new Float32Array(WEEK).fill(NaN),
    observed: new Float32Array(WEEK).fill(NaN),
    nPorts: Float32Array.from([ports]),
    inScope: [true],
    n: 1,
  };
  p.occ[t] = occ;
  p.observed[t] = obs;
  return p;
}

test("ô đang chọn nhận diện bằng HÌNH DẠNG và NÉT, không chỉ bằng màu", () => {
  const src = code("ui/UtilizationDayProfiles.tsx");
  assert.match(src, /strokeDasharray/, "đường dẫn dọc qua bảy hàng");
  assert.match(src, /stroke=\{INK_HEX\}/, "casing mực cho dấu ô đang chọn");
  assert.match(src, /<rect[\s\S]{0,200}?width=\{7\}/, "dấu VUÔNG, không phải một chấm đổi màu");
});

test("ô null vẽ VÂN, và vân phủ trọn hàng — không hạ về đáy", () => {
  const src = code("ui/UtilizationDayProfiles.tsx");
  assert.match(src, /utilization === null \? \([\s\S]{0,300}?url\(#\$\{HATCH_ID\}\)/,
    "null ⇒ vân; hạ về đáy sẽ vẽ ra số 0");
});

test("biểu đồ KHÔNG có transition/animation nào — reduced-motion không cần nhánh riêng", () => {
  const src = code("ui/UtilizationDayProfiles.tsx");
  assert.doesNotMatch(src, /transition|animate|@keyframes|requestAnimationFrame/,
    "không có gì để giảm thì không có gì để quên giảm");
  assert.doesNotMatch(src, /blink|pulse/i, "không nhấp nháy ở bất kỳ chế độ nào");
});

// ══ 3. Bản đồ: LOD, kênh mã hoá, và cấm heat-surface theo tỉ lệ ═════════════

test("KHÔNG code path nào đưa utilization rate vào `HeatmapLayer.getWeight` (§21.1-8)", () => {
  // Đây là ràng buộc quan trọng nhất của cả lens ở tầng bản đồ: một surface chỉ được cộng
  // đại lượng CỘNG ĐƯỢC (`Σocc`). Cộng tỉ lệ là cộng những phân số khác mẫu số.
  for (const rel of ["map/MapView.tsx", "viz/util-regions.ts", "viz/occ.ts"]) {
    const src = code(rel);
    const weights = [...src.matchAll(/getWeight[^,\n]*/g)].map((m) => m[0]);
    for (const w of weights) {
      assert.doesNotMatch(w, /stationOccAt|utilization|\brate\b|portCoverage/,
        `${rel}: ${w} — trọng số của surface phải là đại lượng cộng được`);
    }
  }
});

test("lớp vùng mã hoá ĐÚNG MỘT đại lượng: không radius, không height", () => {
  const src = code("map/MapView.tsx");
  const layer = src.slice(src.indexOf("function utilRegionLayers"), src.indexOf("function closedRing"));
  assert.match(layer, /getFillColor/, "fill là kênh định lượng");
  assert.match(layer, /extruded: false/, "không dựng khối");
  assert.doesNotMatch(layer, /getElevation|elevationScale/, "độ cao không mang measure thứ hai");
  assert.doesNotMatch(layer, /getRadius/, "bán kính không mang measure thứ hai");
  // Opacity KHÔNG được mã hoá coverage: nó sẽ làm vùng dữ liệu mỏng trông như vùng tải thấp.
  assert.doesNotMatch(layer, /portCoverage[^;\n]*(alpha|opacity)/i);
});

test("vùng null dùng VÂN, vùng coverage thấp chỉ thêm NÉT ĐỨT — cả hai không đụng giá trị", () => {
  const src = code("map/MapView.tsx");
  const layer = src.slice(src.indexOf("function utilRegionLayers"), src.indexOf("function closedRing"));
  assert.match(layer, /util-region-r\$\{resolution\}-null[\s\S]{0,200}NULL_HATCH/);
  assert.match(layer, /isLowPortCoverage/, "cảnh báo đọc từ helper, không gõ lại 0.5");
  assert.match(layer, /lowcov[\s\S]{0,400}getDashArray/, "cảnh báo là NÉT, không phải màu");
  // Cảnh báo tách khỏi lớp fill: nó không được lọc `valued` thành một tập vẽ khác.
  assert.match(layer, /data: valued/, "mọi vùng có giá trị đều được tô, kể cả coverage thấp");
});

test("vùng và chấm trạm đều PICKABLE — kể cả vùng null", () => {
  const src = code("map/MapView.tsx");
  const layer = src.slice(src.indexOf("function utilRegionLayers"), src.indexOf("function closedRing"));
  // `common` (có `pickable: true`) được spread vào CẢ hai lớp, gồm lớp null.
  assert.match(layer, /pickable: true/);
  assert.match(layer, /\.\.\.common,\s*id: `util-region-r\$\{resolution\}-null`/);
});

test("chế độ `Trạm` và mức phóng drill-down cùng cho chấm trạm; chỉ mục vắng cũng vậy", () => {
  const src = code("map/MapView.tsx");
  const fn = src.slice(src.indexOf("function utilRegionResolutionFor"), src.indexOf("function utilRegionLayers"));
  assert.match(fn, /!index \|\| representation === "station"/, "hai đường về chấm trạm");
  assert.match(fn, /utilResolutionForZoom\(zoom\)/, "LOD đọc từ helper, không gõ lại ngưỡng");
});

// ══ 4. Wire format: representation và selection ═════════════════════════════

const baseHash = () => ({
  field: "station:occ",
  scaleMode: "binned" as const,
  mode: "2d" as const,
  view: { lng: 105.8, lat: 21, zoom: 10, pitch: 0, bearing: 0 },
  layers: [],
  cell: null,
  scene: null,
  paintOn: true,
  dataMode: false,
  nationalMode: false,
  t: 0,
  filter: null,
});

test("hash CŨ (không có `ur`) mở ra `Vùng tải` và giữ nguyên `f`/`t`/`c`", () => {
  const parsed = parseHash("#f=station:occ&t=51&c=8830805097fffff");
  assert.equal(parsed.utilRepresentation, undefined, "khoá vắng ⇒ hash không nói gì");
  assert.equal(DEFAULT_UTIL_REPRESENTATION, "region", "…và người đọc rơi về Vùng tải");
  assert.equal(parsed.field, "station:occ");
  assert.equal(parsed.t, 51);
  assert.equal(parsed.cell, "8830805097fffff");
});

test("`ur` chỉ được GHI khi khác mặc định — link Vùng tải trông y như trước", () => {
  assert.doesNotMatch(serializeHash({ ...baseHash(), utilRepresentation: "region" }), /ur=/);
  assert.match(serializeHash({ ...baseHash(), utilRepresentation: "station" }), /ur=tram/);
  assert.doesNotMatch(serializeHash(baseHash()), /ur=/, "vắng cũng không ghi");
});

test("`ur` round-trip, và giá trị lạ rơi về mặc định thay vì tạo chế độ thứ ba", () => {
  assert.equal(parseHash("#f=station:occ&ur=tram").utilRepresentation, "station");
  assert.equal(parseHash("#f=station:occ&ur=vung").utilRepresentation, "region");
  assert.equal(parseHash("#f=station:occ&ur=xyz").utilRepresentation, undefined);
  assert.equal(parseUtilRepresentation("tram"), "station");
  assert.equal(parseUtilRepresentation(null), null);
  assert.equal(UTIL_REPRESENTATION_WIRE.region, "vung");
});

test("`ur` KHÔNG được đọc trong một CẢNH — cảnh sở hữu cách đọc của nó (§9a)", () => {
  assert.equal(parseHash("#s=nhip-tuan&ur=tram").utilRepresentation, undefined);
});

test("selection vùng tải: wire format CÓ PHIÊN BẢN và round-trip", () => {
  const sel = utilRegionSelection(H3_A, 7)!;
  const wire = serializeEntitySelection(sel);
  assert.equal(wire, `${UTIL_REGION_SEL_PREFIX}7:${H3_A}`);
  assert.match(wire, /^ur1:/, "tiền tố mang số phiên bản");
  assert.deepEqual(parseEntitySelection(wire), sel, "round-trip");
  // Cùng cổng hình dạng ở `data/h3.ts`, thứ `parseHash` dùng để quyết định giữ khoá `c`.
  assert.deepEqual(parseSelection(wire), { kind: "util-region", id: H3_A, resolution: 7 });
  assert.equal(serializeSelection({ kind: "util-region", id: H3_A, resolution: 7 }), wire);
  assert.deepEqual(utilRegionOf(wire), { id: H3_A, resolution: 7 });
});

test("selection vùng hỏng bị BỎ, không bị đoán", () => {
  for (const bad of ["ur1:9:" + H3_A, "ur1:7:khong-phai-h3", "ur1:7", "ur1:7:" + H3_A + ":thua", "ur1:"]) {
    assert.equal(parseEntitySelection(bad), null, bad);
    assert.equal(parseSelection(bad), null, bad);
  }
});

test("cùng mã H3, khác mức phân giải ⇒ HAI vùng khác nhau", () => {
  const r7 = utilRegionSelection(H3_A, 7)!;
  const r8 = utilRegionSelection(H3_A, 8)!;
  assert.equal(isSameSelection(r7, r7), true);
  assert.equal(isSameSelection(r7, r8), false, "mức phân giải là một phần của danh tính");
});

test("vùng tải KHÔNG bị đọc nhầm thành ô lưới r8", () => {
  // Ngược lại cũng phải đúng: một mã 15-hex trần vẫn là `h3-cell`, không phải vùng tải.
  assert.equal(parseEntitySelection(H3_A)?.kind, "h3-cell");
  assert.equal(parseEntitySelection(`${UTIL_REGION_SEL_PREFIX}8:${H3_A}`)?.kind, "util-region");
  assert.equal(selectionKindLabel(utilRegionSelection(H3_A, 6)), "Vùng tải H3 r6");
});

test("hash mang selection vùng đi qua `parseHash` nguyên vẹn", () => {
  const parsed = parseHash(`#f=station:occ&c=${UTIL_REGION_SEL_PREFIX}7:${H3_A}&t=51`);
  assert.equal(parsed.cell, `${UTIL_REGION_SEL_PREFIX}7:${H3_A}`);
  assert.equal(parsed.selection?.kind, "util-region");
  const out = serializeHash({ ...baseHash(), cell: null, selection: parsed.selection, t: 51 });
  assert.match(out, /c=ur1:7:/, "`:` không bị encode — hash là thứ người ta đọc bằng mắt");
});

// ══ 5. Vòng đời truy vấn ════════════════════════════════════════════════════

test("tầng vùng và tầng thời gian KHÔNG chạm DuckDB — đổi `t` không thể phát SQL", () => {
  for (const rel of ["viz/util-regions.ts", "viz/occ.ts", "viz/occ-time.ts", "viz/utilization-chart.ts"]) {
    const src = code(rel);
    assert.doesNotMatch(src, /from ["']\.\.\/data\/duckdb["']/, `${rel} nạp DuckDB`);
    assert.doesNotMatch(src, /\bquery\(|registerParquet|read_parquet/, `${rel} phát SQL`);
    assert.doesNotMatch(src, /useStore/, `${rel} đọc store`);
  }
});

test("chỉ mục vùng dựng MỘT LẦN cho mỗi gói, và KHÔNG dựng lại khi `t` đổi", () => {
  const app = code("App.tsx");
  assert.match(app, /memoizeByReference\(buildUtilRegions\)/,
    "nhớ theo tham chiếu gói — đổi lens rồi quay lại không dựng lại");
  // `buildUtilRegions` không nhận `t`: nó KHÔNG THỂ phụ thuộc giờ.
  const regions = code("viz/util-regions.ts");
  assert.match(regions, /export function buildUtilRegions\(occupancy: StationOccupancy\)/,
    "chỉ nhận gói — không có `t` để mà dựng lại theo");
});

test("model 168 giờ memo KHÔNG có `t` trong deps", () => {
  const controller = code("components/atlas/LensChartController.tsx");
  const memo = controller.slice(
    controller.indexOf("const utilizationModel = useMemo"),
    controller.indexOf("const occTimezone"),
  );
  assert.match(memo, /\[primaryChartId, occupancy, utilizationUnavailableReason\]/,
    "thêm `t` vào đây là dựng lại 168 ô gộp bốn lần mỗi giây");
});

test("Inspector vùng đọc từ RAM — không `useEffect`, không truy vấn", () => {
  const loader = code("components/atlas/use-inspector-loader.ts");
  const branch = loader.slice(
    loader.indexOf('if (selection.kind === "util-region")'),
    loader.indexOf('if (selection.kind === "commune")'),
  );
  assert.ok(branch.length > 200, "nhánh vùng tải phải tồn tại");
  assert.doesNotMatch(branch, /useEffect|fetch|query/, "scrub không được phát truy vấn nào");
  assert.match(branch, /regionReadoutOf|regionMembersAt/, "đọc từ chỉ mục đã precompute");
});

test("App KHÔNG subscribe `t` trần ở root, và cột đọc cũng không", () => {
  const app = code("App.tsx");
  assert.doesNotMatch(app, /useStore\(\(s\) => s\.t\)/, "root subscribe `t` = render cả cây mỗi tick");
  const column = code("components/atlas/AtlasReadColumn.tsx");
  assert.doesNotMatch(column, /useStore\(\(s\) => s\.t\)/, "cột đọc cũng vậy");
  // Khối chú giải mới là LÁ, và nó mới được phép đăng ký `t`.
  assert.match(code("ui/UtilizationLegendNote.tsx"), /useStore\(\(s\) => s\.t\)/);
});

// ══ 6. Ngôn ngữ: không claim quá tải, không ngưỡng 40% ══════════════════════

test("không file nào của lens KHẲNG ĐỊNH quá tải/thiếu tải/thiếu năng lực", () => {
  const files = [
    "ui/UtilizationDayProfiles.tsx",
    "ui/UtilizationLegendNote.tsx",
    "ui/UtilRegionPanel.tsx",
    "ui/UtilModes.tsx",
    "map/tooltip.ts",
    "viz/util-regions.ts",
    "viz/utilization-chart.ts",
    "fields.ts",
  ];
  for (const rel of files) {
    const src = raw(rel);
    assert.doesNotMatch(src, /(đang|bị)\s+quá tải|thiếu tải|thiếu năng lực/i, rel);
  }
  // …và ba mặt người dùng đọc PHẢI bác bỏ cách đọc ấy một cách tường minh.
  //
  // Kiểm bằng "mọi lần nhắc `quá tải` đều nằm trong tầm phủ của một phủ định", không bằng
  // một khuôn câu cố định: ba chỗ này viết ba câu khác nhau (một cái chèn cả thẻ `<strong>`
  // vào giữa), và chốt nguyên văn sẽ biến mọi lần sửa câu chữ hợp lệ thành một FAIL giả.
  for (const rel of ["ui/UtilizationLegendNote.tsx", "ui/UtilRegionPanel.tsx", "map/tooltip.ts"]) {
    const src = raw(rel);
    const hits = [...src.matchAll(/quá tải/gi)];
    assert.ok(hits.length > 0, `${rel} phải NHẮC tới cách đọc 'quá tải' để mà bác bỏ nó`);
    for (const hit of hits) {
      const before = src.slice(Math.max(0, hit.index - 80), hit.index);
      assert.match(before, /\bkhông\b/i, `${rel}: "quá tải" ở vị trí ${hit.index} không có phủ định`);
    }
  }
});

test("ngưỡng sàng lọc 40% KHÔNG xuất hiện như một ngưỡng của lens này", () => {
  for (const rel of ["viz/palette.ts", "viz/util-regions.ts", "viz/occ.ts"]) {
    const src = code(rel);
    assert.doesNotMatch(src, /0\.4\b[^0-9]{0,40}(overload|quá tải|threshold|util)/i, rel);
  }
  const legend = code("ui/UtilizationLegendNote.tsx");
  assert.doesNotMatch(legend, /\b40\s*%/, "40% không có vị trí đặc biệt trên thang này");
});

test("chú giải công bố CẢ HAI coverage, và nói ra nét đứt lẫn vân xám (§12.3)", () => {
  const src = raw("ui/UtilizationLegendNote.tsx");
  assert.match(src, /Σ cổng bận trung bình ÷ Σ cổng lắp đặt/, "công thức, không chỉ tên");
  assert.match(src, /Coverage toàn tỉnh ở giờ này/, "coverage theo GIỜ, không phải cả tuần");
  assert.match(src, /cổng \(/, "coverage theo cổng");
  assert.match(src, /trạm \(/, "coverage theo trạm");
  assert.match(src, /Nét đứt/);
  assert.match(src, /vân xám/);
  assert.match(src, /khác 0/, "null phải được nói rõ là KHÁC 0");
});
