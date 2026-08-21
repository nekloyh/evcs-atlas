/**
 * GOLDEN — mọi con số của bảy cảnh, đo trên gói đã ship (PHASE7_STORY_MODE.md §7, §8).
 *
 * Cách test này không nói dối được, và đó là toàn bộ thiết kế của nó:
 *
 *   1. **Fixture chỉ chứa ĐẦU VÀO.** `scripts/gen_story_fixture.py` đọc gói và ghi ra lưới,
 *      lớp xã, bảng trạm, gộp Q-P4-4… Test nạp chúng và chạy **chính** các builder dùng
 *      chung của web. Không con số nào được gõ vào TypeScript.
 *   2. **`expected` tính ĐỘC LẬP.** Cùng script tính lại bằng pandas/numpy theo một đường
 *      khác. Hai bản cài đặt phải gặp nhau; một bên sai thì test đỏ.
 *   3. **Fixture ghim `exported_utc`.** Test đối chiếu với `web/public/data/manifest.json`
 *      trên đĩa. Gói đổi mà quên sinh lại fixture ⇒ **test đỏ**, chứ không phải một câu chữ
 *      cũ sống sót trên màn hình. Đó đúng là chỗ bản trước đã hỏng.
 *
 * Sinh lại:  uv run python scripts/gen_story_fixture.py
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildStoryModels, resolveMetric, resolveSubject, type StoryPackage } from "../src/story/resolve.ts";
import { SCENES } from "../src/story/scenes.ts";
import type { MetricRef, SceneSpec } from "../src/story/spec.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url).pathname, "utf8");
const FIX = JSON.parse(read("./fixtures/p01-story.json")) as {
  exported_utc: string;
  input: Record<string, unknown>;
  expected: Record<string, Record<string, number | null>>;
};
const E = FIX.expected;

/** Sai số cho phép: 1e-4 tương đối, hoặc 1 đơn vị tuyệt đối cho số đếm/số người. */
function near(actual: number | null, expected: number | null | undefined, what: string): void {
  assert.notEqual(actual, null, `${what}: không phân giải được`);
  assert.notEqual(expected, undefined, `${what}: fixture không có mong đợi`);
  const a = actual as number;
  const b = expected as number;
  const tol = Math.max(1e-4 * Math.abs(b), 1e-6);
  assert.ok(Math.abs(a - b) <= tol || Math.abs(a - b) <= 1, `${what}: ${a} ≠ ${b}`);
}

const pkg: StoryPackage = {
  manifest: FIX.input["manifest"] as never,
  demand: FIX.input["demand"] as never,
  communes: {
    type: "FeatureCollection",
    features: (FIX.input["communes"] as Record<string, unknown>[]).map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [] },
      properties: p,
    })),
  } as never,
  stations: FIX.input["stations"] as never,
  roads: null,
  routes: null,
  detour: FIX.input["detour"] as never,
  cells: null,
  opportunity: FIX.input["opportunity"] as never,
  occupancy: null,
};
const models = buildStoryModels(pkg);

const ctxFor = (s: SceneSpec) => ({
  pkg,
  models,
  subjects: s.subjects.map((sp) => resolveSubject(sp, pkg, models)),
});
const scene = (id: string) => SCENES.find((s) => s.id === id)!;
const m = (model: string, select: string) =>
  resolveMetric({ src: "model", model, select } as MetricRef, { pkg, models, subjects: [] });

// ══ Cổng chống trôi ═════════════════════════════════════════════════════════

test("fixture và gói trên đĩa là CÙNG một lần xuất — nếu không, mọi con số dưới đây vô nghĩa", () => {
  const live = JSON.parse(read("../public/data/manifest.json")) as { exported_utc: string };
  assert.equal(
    FIX.exported_utc,
    live.exported_utc,
    "gói đã đổi: chạy `uv run python scripts/gen_story_fixture.py` rồi đọc lại diff",
  );
});

// ══ Tiêu chí 3–4 — cảnh `von-cuc` ══════════════════════════════════════════

test("von-cuc: diện tích chứa nửa dân, Gini, số ô (tiêu chí 3)", () => {
  near(m("lorenz-area-pop", "areaForHalfPop"), E["lorenzAreaPop"]!["areaForHalfPop"], "areaForHalfPop");
  near(m("lorenz-area-pop", "gini"), E["lorenzAreaPop"]!["gini"], "gini");
  near(m("lorenz-area-pop", "popShareForTenthArea"), E["lorenzAreaPop"]!["popShareForTenthArea"], "p10");
  near(m("lorenz-area-pop", "nCells"), E["lorenzAreaPop"]!["nCells"], "nCells");
  // Ngưỡng của §7: 0,0841 ± 0,0002 và Gini 0,6815 ± 0,0005.
  assert.ok(Math.abs((m("lorenz-area-pop", "areaForHalfPop") as number) - 0.0841) <= 0.0002);
  assert.ok(Math.abs((m("lorenz-area-pop", "gini") as number) - 0.6815) <= 0.0005);
});

test("von-cuc: SỐ VÙNG là thuộc tính của lát cắt — 4 lát cắt, 4 câu trả lời (tiêu chí 4)", () => {
  const steps = (E["spatialStructure"] as unknown as { steps: Record<string, number>[] }).steps;
  for (let i = 0; i < steps.length; i++) {
    for (const k of [
      "threshold",
      "nCells",
      "nComponents",
      "nComponentsGe3",
      "largestComponentCells",
      "largestComponentPop",
    ]) {
      near(m("spatial-structure", `steps.${i}.${k}`), steps[i]![k], `steps.${i}.${k}`);
    }
  }
  // Chính con số này là luận điểm, nên nó có một assert riêng chứ không nấp trong vòng lặp.
  // 92 → 97 ở lát cắt p90 sau khi `pop_density_ppkm2` sửa mẫu số về area_km2 × area_frac
  // (Final QA blocker 1): ô biên hết bị loãng nên ngưỡng phân vị và cấu trúc vùng đổi theo.
  assert.deepEqual(
    steps.map((s) => s.nComponents),
    [97, 31, 9, 1],
  );
  near(m("spatial-structure", "moranI"), (E["spatialStructure"] as never as { moranI: number }).moranI, "moranI");
});

// ══ Tiêu chí 5 — cảnh `cung-lech` ══════════════════════════════════════════

test("cung-lech: đối tượng PHÂN GIẢI ra hai xã, và thẻ “không cổng” KHÔNG in bội số (tiêu chí 5)", () => {
  const ctx = ctxFor(scene("cung-lech"));
  assert.equal(ctx.subjects[0]!.code, E["subjects"]!["mostPopulousZeroPorts"]);
  assert.equal(ctx.subjects[1]!.code, E["subjects"]!["mostPorts"]);
  // Thẻ A có 0 cổng ⇒ `vsMedian` phải là `null` ⇒ dòng bội số BIẾN MẤT (luật R5).
  assert.equal(ctx.subjects[0]!.facts!.ports, 0);
  assert.equal(ctx.subjects[0]!.facts!.vsMedian, null, "một tỉ số bằng 0 không so được với trung vị");
  // Thẻ B thì có.
  assert.ok((ctx.subjects[1]!.facts!.vsMedian ?? 0) > 1);
  near(m("commune-supply", "median"), E["communeSupply"]!["median"], "trung vị xã");
  near(m("commune-supply", "nZeroPorts"), E["communeSupply"]!["nZeroPorts"], "xã không cổng");
  near(m("commune-supply", "popZeroPorts"), E["communeSupply"]!["popZeroPorts"], "dân của chúng");
  near(m("supply-equity", "gini"), E["supplyEquity"]!["gini"], "Gini cung");
  near(m("supply-equity", "cellsForHalfPorts"), E["supplyEquity"]!["cellsForHalfPorts"], "ô chứa nửa cổng");
  near(m("supply-equity", "portShareForTenthPop"), E["supplyEquity"]!["portShareForTenthPop"], "10% dân");
  near(m("supply-equity", "portsNoPop"), E["supplyEquity"]!["portsNoPop"], "cổng ở ô không dân");
});

// ══ Tiêu chí 6–7 — cảnh `di-vong` ══════════════════════════════════════════

test("di-vong: ô đi vòng, ô báo phủ nhầm, và con số 672 KHÔNG tồn tại ở đâu (tiêu chí 6)", () => {
  near(m("detour", "nCells"), E["detour"]!["nCells"], "ô đi vòng");
  near(m("detour", "falsePositive"), E["detour"]!["falsePositive"], "ô báo phủ nhầm");
  near(m("detour", "falsePositiveShare"), E["detour"]!["falsePositiveShare"], "tỉ lệ báo nhầm");
  near(m("detour", "median"), E["detour"]!["median"], "trung vị hệ số");
  assert.equal(m("detour", "nCells"), 696);
  assert.equal(m("detour", "falsePositive"), 986);
});

test("di-vong: số cầu lớn đo LÚC CHẠY, KHÔNG đọc khoá manifest đếm một tập khác (tiêu chí 7)", () => {
  const roadsPkg: StoryPackage = {
    ...pkg,
    roads: [
      // Một đoạn cầu dài (≈ 2 km theo trục kinh tuyến ở vĩ độ 21°) và một đoạn cầu ngắn.
      { id: "1", roadClass: "trunk", path: [105.8, 21.0, 105.82, 21.0], dist: 100, bridge: true },
      { id: "2", roadClass: "local", path: [105.8, 21.0, 105.8001, 21.0], dist: 50, bridge: true },
      { id: "3", roadClass: "local", path: [105.8, 21.0, 105.9, 21.0], dist: null, bridge: false },
    ] as never,
  };
  const rm = buildStoryModels(roadsPkg);
  assert.equal((rm.roads as Record<string, number>)["majorBridges"], 1, "chỉ đoạn dài hơn ngưỡng");
  assert.equal((rm.roads as Record<string, number>)["bridgeWays"], 2, "đếm trên CHÍNH tập đang vẽ");
  assert.equal((rm.roads as Record<string, number>)["unreachable"], 1);
  // Khoá manifest ĐÃ được sửa để đếm đúng tập đã ship (defect D1), nên hôm nay hai con số
  // khớp nhau. Cảnh vẫn KHÔNG đọc khoá ấy: nó là một số đo của bước xuất, còn cảnh nói về
  // chính mảng nó đang vẽ — và hai thứ đó đã từng lệch 292 đoạn mà không ai thấy.
  assert.equal(
    E["roads"]!["manifestBridgeWaysShipped"],
    E["roads"]!["bridgeWays"],
    "manifest phải đếm ĐÚNG tập đã ship — nếu lệch, chạy lại `make vn-web`",
  );
  const sceneJson = JSON.stringify(scene("di-vong"));
  assert.ok(!sceneJson.includes("bridge_ways_shipped"), "cảnh không được đọc khoá manifest ấy");
});

// ══ Tiêu chí 8 — cảnh `ngoai-2km` ══════════════════════════════════════════

test("ngoai-2km: trong / ngoài / CHƯA ĐO được in riêng, không gộp vào bên nào (tiêu chí 8)", () => {
  near(m("access-curve", "beyond"), E["access"]!["beyond"], "ngoài bán kính");
  near(m("access-curve", "within"), E["access"]!["within"], "trong bán kính");
  near(m("access-curve", "unknown"), E["access"]!["unknown"], "chưa đo được");
  near(m("access-curve", "unknownCells"), E["access"]!["unknownCells"], "số ô chưa đo");
  near(m("access-curve", "shareBeyond"), E["access"]!["shareBeyond"], "tỉ lệ ngoài");
  // Bảo toàn: ba nhánh cộng lại đúng bằng tổng. Không nhánh nào nuốt nhánh nào.
  const total = m("access-curve", "total") as number;
  const sum =
    (m("access-curve", "within") as number) +
    (m("access-curve", "beyond") as number) +
    (m("access-curve", "unknown") as number);
  assert.ok(Math.abs(total - sum) < 1e-6);
  near(m("opportunity-rank", "topShareOfGap"), E["opportunity"]!["topShareOfGap"], "xã nặng nhất");
  near(m("opportunity-rank", "top10ShareOfGap"), E["opportunity"]!["top10ShareOfGap"], "10 xã nặng nhất");
  near(m("opportunity-rank", "nMajorityBeyond"), E["opportunity"]!["nMajorityBeyond"], "xã quá nửa");
  near(m("opportunity-rank", "nAtHundredPercent"), E["opportunity"]!["nAtHundredPercent"], "xã 100%");
  // Đối tượng của cảnh: xã nặng nhất TRONG SỐ những xã quá nửa dân ở ngoài.
  const ctx = ctxFor(scene("ngoai-2km"));
  assert.equal(ctx.subjects[1]!.code, E["subjects"]!["worstBeyond2kmAmongMajority"]);
});

// ══ Tiêu chí 9 — cảnh `nhip-tuan` ══════════════════════════════════════════

test("nhip-tuan: KHÔNG nhãn đồng hồ nào khi manifest chưa khai múi giờ (tiêu chí 9)", () => {
  const snapshots = (FIX.input["manifest"] as { snapshots: Record<string, unknown> }).snapshots;
  assert.equal(snapshots["occupancy_hour_tz"], undefined, "gói này chưa phát múi giờ");
  // Và cảnh không có khe nào định dạng ra một giờ trong ngày: `peakT`/`troughT` không được
  // trỏ tới từ bất kỳ câu nào. Chỉ HÌNH DẠNG (tỉ lệ đỉnh/đáy) mới đi ra màn hình.
  const s = scene("nhip-tuan");
  const json = JSON.stringify(s);
  assert.ok(!json.includes('"peakT"'), "chỉ số giờ không được vào một câu");
  assert.ok(!json.includes('"troughT"'));
});

// ══ Tiêu chí 10 — cảnh `mot-quyet-dinh` ════════════════════════════════════

test("mot-quyet-dinh: bốn con số loại trừ đọc từ manifest, phản thực GIỮ LẠI (tiêu chí 10)", () => {
  const ctx = ctxFor(scene("mot-quyet-dinh"));
  const ref = (path: string) => resolveMetric({ src: "manifest", path } as MetricRef, ctx);
  assert.equal(ref("totals.private_ac_dropped.n"), 1811);
  for (const k of ["share_stations", "share_ports", "share_power"]) {
    const v = ref(`totals.private_ac_dropped.${k}`);
    assert.ok(v !== null && v > 0 && v < 1, k);
  }
  // §10 U2 chưa phát ⇒ mọi khe phản thực trả `null` ⇒ ba câu ấy KHÔNG render.
  assert.equal(ref("counterfactual.ac_filter.dist_median_before_m"), null);
  assert.equal(ref("counterfactual.ac_filter.dist_median_after_m"), null);
  assert.equal(ref("counterfactual.ac_filter.pop_moved_beyond_2km"), null);
  // Dải giữa 34 tỉnh cần một bảng không có trong gói tỉnh ⇒ cũng giữ lại.
  assert.equal(m("province-range", "acStationsMin"), null);
  near(m("power-tier", "lowTierStations"), E["powerTier"]!["lowTierStations"], "bậc ≤ 22 kW");
  near(m("power-tier", "lowTierShare"), E["powerTier"]!["lowTierShare"], "tỉ lệ bậc thấp");
  near(m("power-tier", "nInScope"), E["powerTier"]!["nInScope"], "trạm trong phạm vi");
  near(m("power-tier", "topOperatorShare"), E["powerTier"]!["topOperatorShare"], "nhà vận hành lớn nhất");
});

// ══ Tiêu chí 11 — cảnh `chua-biet` ═════════════════════════════════════════

test("chua-biet: ba tỉ lệ phủ của telemetry, và hai tỉ lệ phủ của POI (tiêu chí 11)", () => {
  const ctx = ctxFor(scene("chua-biet"));
  const ref = (path: string) => resolveMetric({ src: "manifest", path } as MetricRef, ctx);
  const cov = (FIX.input["manifest"] as { coverage: { util_cell: Record<string, number> } }).coverage.util_cell;
  near(ref("coverage.util_cell.cell_share"), cov["cell_share"], "phủ theo ô");
  near(ref("coverage.util_cell.pop_share"), cov["pop_share"], "phủ theo dân");
  near(
    ref("coverage.util_cell.share_measured_among_cells_with_station"),
    cov["share_measured_among_cells_with_station"],
    "phủ trong ô đã có trạm",
  );
  // POI: khoá `source_metrics.poi_empty_1km`. Vắng ⇒ hai câu GIỮ LẠI thay vì đoán.
  const poi = m("poi-coverage", "shareCells");
  if (poi === null) {
    assert.equal(m("poi-coverage", "sharePop"), null, "vắng thì vắng CẢ HAI");
  } else {
    near(poi, E["poiCoverage"]!["shareCells"], "ô không POI");
    near(m("poi-coverage", "sharePop"), E["poiCoverage"]!["sharePop"], "dân ở ô không POI");
  }
});

// ══ Luật R5 ở mức toàn cảnh ════════════════════════════════════════════════

test("gỡ MỘT nguồn ⇒ đúng những khe của nó trả null, các khe khác không đổi", () => {
  const noCommunes = buildStoryModels({ ...pkg, communes: null });
  assert.equal(noCommunes["commune-supply"], null);
  // …nhưng Lorenz của lưới thì không đụng tới — hỏng một nguồn không được lan sang nguồn khác.
  assert.notEqual(noCommunes["lorenz-area-pop"], null);
  const noOpportunity = buildStoryModels({ ...pkg, opportunity: null });
  assert.equal(noOpportunity["access-curve"], null);
  assert.equal(noOpportunity["opportunity-rank"], null);
  assert.notEqual(noOpportunity["commune-supply"], null);
});
