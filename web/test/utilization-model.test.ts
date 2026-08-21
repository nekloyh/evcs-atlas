/**
 * Lens SỬ DỤNG — mô hình thuần của bản redesign.
 * `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §21.1, §21.3.
 *
 * Vì sao file này tồn tại tách khỏi `occ.test.ts`: `occ.test.ts` khoá **tầng TRẠM** (một
 * trạm, một giờ, ba đường null). File này khoá **tầng GỘP** — chỗ mà một luật sai không
 * làm hỏng một chấm mà làm hỏng một con số được đọc thành kết luận. Ba luật đắt nhất ở đây
 * đều là luật mà một ảnh chụp không chứng minh được:
 *
 *   · ratio-of-sums KHÁC average-of-rates, và khác tới mức đổi cả dấu;
 *   · thang màu KHÔNG được đổi theo `t`, theo tỉnh hay theo mức phân giải;
 *   · gộp lên r7/r6 phải BẢO TOÀN tử số, mẫu số và số trạm.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { HOURS_IN_WEEK, tOf } from "../src/state/types.ts";
import {
  OBSERVED_H_MIN,
  eligibleStationHour,
  inScopeIndices,
  occGroupTotals,
  occStatsAt,
  utilizationOf,
  type OccProfiles,
} from "../src/viz/occ.ts";
import { buildUtilizationWeekModel } from "../src/viz/chart-models.ts";
import {
  UTIL_LOD_R7_MIN_ZOOM,
  UTIL_LOD_R8_MIN_ZOOM,
  UTIL_RESOLUTIONS,
  UTIL_STATION_MIN_ZOOM,
  buildUtilRegions,
  isLowPortCoverage,
  regionMembersAt,
  regionReadoutOf,
  regionsAt,
  stationCellR8,
  utilResolutionForZoom,
} from "../src/viz/util-regions.ts";
import {
  FIELD_BY_ID,
  STATION_OCC_FIELD,
  fieldMapAvailable,
  layerUsable,
  mapFieldsOfLens,
  setUnusableLayers,
} from "../src/fields.ts";
import {
  UTILIZATION_BREAKS,
  UTILIZATION_TICKS,
  applyScaleMode,
  classOf,
  colorFor,
  utilizationScale,
} from "../src/viz/palette.ts";
import {
  OCC_TZ_DISCLOSURE,
  hourBucketLabel,
  occTimezoneDisclosure,
  occTimezoneOf,
} from "../src/viz/occ-time.ts";
import type { StationOccupancy, StationRow } from "../src/data/occupancy.ts";

// ── Fixture ──────────────────────────────────────────────────────────────────
//
// Toạ độ THẬT của Hà Nội, không phải `(0,0)`: `latLngToCell` ở xích đạo vẫn chạy, nhưng
// phép kiểm bảo toàn r8→r7→r6 chỉ có nghĩa khi các trạm rơi vào nhiều cell khác nhau —
// và điều đó phụ thuộc khoảng cách thật giữa chúng.

function makeProfiles(ports: (number | null)[], inScope?: boolean[]): OccProfiles {
  const n = ports.length;
  return {
    occ: new Float32Array(n * HOURS_IN_WEEK).fill(NaN),
    observed: new Float32Array(n * HOURS_IN_WEEK).fill(NaN),
    nPorts: Float32Array.from(ports.map((p) => (p === null ? NaN : p))),
    inScope: inScope ?? ports.map(() => true),
    n,
  };
}

function put(p: OccProfiles, s: number, t: number, occ: number, observed: number) {
  p.occ[s * HOURS_IN_WEEK + t] = occ;
  p.observed[s * HOURS_IN_WEEK + t] = observed;
}

/** Rải trạm quanh Hà Nội đủ xa để chúng rơi vào các cell r8 khác nhau. */
function makeOccupancy(
  ports: (number | null)[],
  inScope?: boolean[],
  spreadDeg = 0.02,
): StationOccupancy {
  const profiles = makeProfiles(ports, inScope);
  const stations: StationRow[] = ports.map((_, i) => ({
    code: `S${i}`,
    id: `s-${i}`,
    lat: 21.02 + i * spreadDeg,
    lng: 105.84 + i * spreadDeg,
    inScope: profiles.inScope[i]!,
    opStatus: "OPERATIONAL",
    h3: null,
  }));
  return { stations, profiles };
}

// ══ 1. Cửa hợp lệ DUY NHẤT ═══════════════════════════════════════════════════

test("`eligibleStationHour` trả null cho BUFFER, khuyết n_ports, observed_h dưới ngưỡng, occ không hữu hạn", () => {
  const p = makeProfiles([10, 10, null, 10], [true, false, true, true]);
  put(p, 0, 5, 3, 4); // hợp lệ
  put(p, 1, 5, 3, 4); // BUFFER
  put(p, 2, 5, 3, 4); // khuyết n_ports
  put(p, 3, 5, 3, OBSERVED_H_MIN - 0.01); // chưa đủ quan sát

  assert.deepEqual(eligibleStationHour(p, 0, 5), { rate: 0.3, occ: 3, ports: 10, observedH: 4 });
  assert.equal(eligibleStationHour(p, 1, 5), null, "BUFFER không bao giờ vào aggregate");
  assert.equal(eligibleStationHour(p, 2, 5), null, "không mẫu số thì không tỉ số");
  assert.equal(eligibleStationHour(p, 3, 5), null, "chưa quan sát đủ ≠ vắng khách");
});

test("`occ = 0` với quan sát đủ là ZERO BIẾT ĐƯỢC, không phải missing", () => {
  const p = makeProfiles([10]);
  put(p, 0, 5, 0, 4);
  const e = eligibleStationHour(p, 0, 5);
  assert.ok(e !== null, "zero phải qua được cửa");
  assert.equal(e.occ, 0);
  assert.equal(utilizationOf(occStatsAt(p, [0], 5)), 0, "aggregate của zero là 0, không phải null");
});

test("`observed_h` ĐÚNG BẰNG ngưỡng thì qua — biên ĐÓNG dưới", () => {
  const p = makeProfiles([10]);
  put(p, 0, 5, 4, OBSERVED_H_MIN);
  assert.ok(eligibleStationHour(p, 0, 5) !== null);
});

// ══ 2. Ratio-of-sums, KHÔNG BAO GIỜ average-of-rates ═════════════════════════

test("100 cổng @50% + 2 cổng @100% cho 52/102, KHÔNG phải 75%", () => {
  // Đây là fixture của spec §21.1 mục 2. Trung bình các tỉ lệ cho (0,5 + 1,0)/2 = 75% —
  // một con số cao hơn 23 điểm % chỉ vì một trạm 2 cổng được cân bằng một trạm 100 cổng.
  const p = makeProfiles([100, 2]);
  put(p, 0, 40, 50, 4);
  put(p, 1, 40, 2, 4);
  const stats = occStatsAt(p, [0, 1], 40);
  assert.equal(stats.busyPortsAvg, 52);
  assert.equal(stats.observedPorts, 102);
  assert.equal(utilizationOf(stats), 52 / 102);
  assert.notEqual(utilizationOf(stats), 0.75);
});

test("model 168 giờ dùng cùng phép ấy, và mẫu số chỉ gồm trạm ĐÃ GÓP", () => {
  const p = makeProfiles([100, 2, 40]);
  put(p, 0, 40, 50, 4);
  put(p, 1, 40, 2, 4);
  put(p, 2, 40, 40, 0.5); // chưa đủ quan sát ⇒ 40 cổng KHÔNG vào mẫu số
  const cell = buildUtilizationWeekModel(p).cells[40]!;
  assert.equal(cell.busyPortsAvg, 52);
  assert.equal(cell.observedPorts, 102, "cổng của trạm chưa đủ quan sát không vào mẫu số");
  assert.equal(cell.contributingStations, 2);
  assert.equal(cell.utilization, 52 / 102);
});

// ══ 3. IN-only, coverage, và mẫu số ổn định ═════════════════════════════════

test("BUFFER không vào tử số, mẫu số, coverage hay số trạm", () => {
  const p = makeProfiles([10, 90], [true, false]);
  put(p, 0, 3, 5, 4);
  put(p, 1, 3, 90, 4);
  const m = buildUtilizationWeekModel(p);
  assert.equal(m.allInstalledPorts, 10, "cổng BUFFER không vào mẫu số coverage");
  assert.equal(m.allStations, 1);
  assert.equal(m.cells[3]!.utilization, 0.5, "trạm BUFFER bận kín không kéo tỉ lệ lên");
  assert.equal(m.cells[3]!.portCoverage, 1);
});

test("coverage MỘT PHẦN: mẫu số là cổng LẮP ĐẶT, tử số là cổng QUAN SÁT", () => {
  const p = makeProfiles([10, 30]);
  put(p, 0, 7, 5, 4);
  put(p, 1, 7, 15, 0.2); // dưới ngưỡng — 30 cổng vẫn ở mẫu số coverage
  const cell = buildUtilizationWeekModel(p).cells[7]!;
  assert.equal(cell.observedPorts, 10);
  assert.equal(cell.portCoverage, 10 / 40, "coverage cổng đo trên CỔNG ĐÃ LẮP");
  assert.equal(cell.stationCoverage, 0.5, "coverage trạm là câu hỏi khác coverage cổng");
  assert.equal(cell.utilization, 0.5, "coverage thấp KHÔNG đổi giá trị");
});

test("trạm khuyết `n_ports` ở mẫu số TRẠM nhưng không ở mẫu số CỔNG", () => {
  const p = makeProfiles([10, null]);
  put(p, 0, 7, 5, 4);
  put(p, 1, 7, 5, 4);
  const m = buildUtilizationWeekModel(p);
  assert.equal(m.allInstalledPorts, 10);
  assert.equal(m.allStations, 2);
  assert.equal(m.stationsWithoutPorts, 1);
  assert.equal(m.cells[7]!.stationCoverage, 0.5);
});

test("`observed_h` của trạm chưa đủ quan sát VẪN vào giờ-quan-sát/cổng", () => {
  // Nếu nó bị loại khỏi cả hai vế thì con số ấy luôn ≥ ngưỡng và không bao giờ nói được
  // "dữ liệu ở đây mỏng" — đúng thứ duy nhất nó tồn tại để nói (spec §7.3).
  const p = makeProfiles([10, 10]);
  put(p, 0, 9, 5, 4);
  put(p, 1, 9, 5, 0.5);
  assert.equal(buildUtilizationWeekModel(p).cells[9]!.observedHoursPerPort, (4 * 10 + 0.5 * 10) / 20);
});

// ══ 4. Ô rỗng, missing ≠ zero ═══════════════════════════════════════════════

test("không contributor nào ⇒ utilization null, KHÔNG phải 0", () => {
  const p = makeProfiles([10]);
  put(p, 0, 5, 5, 0.2);
  const cell = buildUtilizationWeekModel(p).cells[5]!;
  assert.equal(cell.utilization, null);
  assert.equal(cell.contributingStations, 0);
  assert.equal(cell.observedPorts, 0);
});

test("gói bị vô hiệu hoá KHÔNG dựng model dù hồ sơ raw có dòng", () => {
  const p = makeProfiles([10]);
  for (let t = 0; t < HOURS_IN_WEEK; t++) put(p, 0, t, 5, 4);
  const m = buildUtilizationWeekModel(p, "0,0% số trạm đo được (ngưỡng 50%)");
  assert.equal(m.cells.length, 0, "package gate thắng raw cell");
  assert.equal(m.days.length, 0);
  assert.match(m.disabledReason ?? "", /50%/);
});

test("package gate giữ lối vào lens Sử dụng nhưng tắt lớp dữ liệu", () => {
  setUnusableLayers(["occupancy"]);
  try {
    const field = FIELD_BY_ID.get(STATION_OCC_FIELD)!;
    assert.equal(fieldMapAvailable(field), true, "field shell phải mở được để nói lý do disabled");
    assert.ok(mapFieldsOfLens("utilization").some((f) => f.id === STATION_OCC_FIELD));
    assert.equal(layerUsable("occupancy"), false, "map/scrubber/profile raw vẫn bị gate");
  } finally {
    setUnusableLayers([]);
  }
});

// ══ 5. Bố cục 7 × 24 ════════════════════════════════════════════════════════

test("168 ô map đúng 7 hàng × 24 cột, và hàng giữ đúng thứ tự giờ", () => {
  const p = makeProfiles([10]);
  put(p, 0, tOf(3, 18), 6, 4);
  const m = buildUtilizationWeekModel(p);
  assert.equal(m.cells.length, HOURS_IN_WEEK);
  assert.equal(m.days.length, 7);
  for (const row of m.days) {
    assert.equal(row.hours.length, 24);
    row.hours.forEach((c, h) => {
      assert.equal(c.dow, row.dow);
      assert.equal(c.hour, h);
      assert.equal(c.t, tOf(row.dow, h));
    });
  }
  assert.equal(m.days[3]!.hours[18]!.utilization, 0.6);
});

test("model KHÔNG nhận `t` — nó không có ý kiến nào về giờ đang xem", () => {
  assert.equal(buildUtilizationWeekModel.length, 2, "(occupancy, disabledReason) — không có `t`");
});

// ══ 6. Thang TUYỆT ĐỐI ══════════════════════════════════════════════════════

test("thang cố định `[0,1]`, bảy khoảng, và KHÔNG có bậc 40%", () => {
  const s = utilizationScale([0.1, 0.9]);
  assert.deepEqual(s.breaks, [...UTILIZATION_BREAKS]);
  assert.equal(s.domain.lo, 0);
  assert.equal(s.domain.hi, 1);
  assert.equal(s.transform, "sqrt");
  assert.equal(s.zeroClass, false, "zero là một giá trị đo được, không phải một bậc riêng");
  assert.ok(!s.breaks.includes(0.4), "40% là ngưỡng SÀNG LỌC, không phải ngưỡng tải");
  assert.ok(!UTILIZATION_TICKS.includes(0.4));
  assert.equal(s.diverge, null, "không có mốc phân kỳ ⇒ không có 'tốt/xấu'");
});

test("cùng giá trị ⇒ cùng màu ở mọi gói, mọi giờ, mọi mức phân giải", () => {
  // Hai "gói" có phân phối khác hẳn nhau. Bản phân vị cũ cho chúng hai bộ ngưỡng khác
  // nhau; bản tuyệt đối phải cho cùng một màu.
  const hanoi = utilizationScale([0.11, 0.2, 0.36, 1]);
  const lamdong = utilizationScale([0.02, 0.05, 0.14]);
  for (const v of [0, 0.049, 0.05, 0.2, 0.36, 0.75, 1]) {
    assert.deepEqual(classOf(v, hanoi), classOf(v, lamdong), `bậc của ${v}`);
    assert.deepEqual(
      colorFor(v, hanoi, "utilization"),
      colorFor(v, lamdong, "utilization"),
      `màu của ${v}`,
    );
  }
});

test("thang không đổi khi `t` đổi — nó không nhận `t` để mà đổi", () => {
  const p = makeProfiles([10, 10]);
  put(p, 0, 0, 1, 4);
  put(p, 1, 50, 9, 4);
  const a = utilizationScale([0.1]);
  const b = utilizationScale([0.9]);
  assert.deepEqual(a.breaks, b.breaks);
  assert.deepEqual(a.domain.lo, b.domain.lo);
  assert.deepEqual(a.domain.hi, b.domain.hi);
});

test("gradient dùng CÙNG miền tuyệt đối; giá trị vượt 100% bị kẹp và ĐƯỢC ĐẾM", () => {
  const s = utilizationScale([0.5, 1.4]);
  const g = applyScaleMode(s, { color: "toggle", transform: "sqrt", clip: { lo: 0, hi: "none" } }, "gradient", true);
  assert.equal(g.kind === "numeric" && g.mode, "gradient");
  assert.equal(g.kind === "numeric" && g.domain.hi, 1, "miền gradient vẫn là [0,1]");
  assert.deepEqual(colorFor(1.4, g, "utilization"), colorFor(1, g, "utilization"), "kẹp ở endpoint");
  assert.equal(s.domain.nClippedHigh, 1, "cờ `vượt mẫu số` phải đếm được, không im lặng");
});

test("bậc là khoảng NỬA MỞ đúng như nhãn legend", () => {
  const s = utilizationScale();
  assert.equal(classOf(0, s), 0);
  assert.equal(classOf(0.0499, s), 0);
  assert.equal(classOf(0.05, s), 1);
  assert.equal(classOf(0.1999, s), 2);
  assert.equal(classOf(0.2, s), 3);
  assert.equal(classOf(0.75, s), 6);
  assert.equal(classOf(1, s), 6, "bậc cuối là khoảng MỞ");
});

test("null không bao giờ nhận một màu", () => {
  const s = utilizationScale([0.3]);
  assert.equal(colorFor(null, s, "utilization"), null);
  assert.equal(colorFor(undefined, s, "utilization"), null);
  assert.notEqual(colorFor(0, s, "utilization"), null, "zero thì có màu — nó là một giá trị");
});

// ══ 7. Vùng H3: bảo toàn, LOD, coverage ═════════════════════════════════════

test("`stationCellR8` ưu tiên cột, dựng lại từ toạ độ, và trả null khi không có gì", () => {
  const declared = "8818308281fffff";
  assert.equal(stationCellR8({ h3: declared, lat: 0, lng: 0 }), declared);
  const computed = stationCellR8({ h3: null, lat: 21.02, lng: 105.84 });
  assert.match(String(computed), /^[0-9a-f]{15}$/);
  assert.equal(stationCellR8({ h3: "khong-phai-h3", lat: NaN, lng: NaN }), null);
});

test("gộp r8 → r7 → r6 BẢO TOÀN tử số, mẫu số, số trạm và cổng lắp đặt, ở MỌI giờ", () => {
  const occupancy = makeOccupancy([10, 4, 6, 20, 8], undefined, 0.03);
  const p = occupancy.profiles;
  for (let s = 0; s < p.n; s++) {
    for (let t = 0; t < HOURS_IN_WEEK; t++) {
      // Một phần ba số ô cố ý dưới ngưỡng, để phép bảo toàn được kiểm trên tập KHÔNG đầy.
      put(p, s, t, (s + 1) * 0.5, t % 3 === 0 ? 0.2 : 4);
    }
  }
  const index = buildUtilRegions(occupancy);
  const members = inScopeIndices(p);
  const provinceTotals = occGroupTotals(p, members);

  for (const res of UTIL_RESOLUTIONS) {
    const level = index.levels[res];
    const sumInstalled = level.cells.reduce((a, c) => a + c.installedPorts, 0);
    const sumStations = level.cells.reduce((a, c) => a + c.stations, 0);
    assert.equal(sumInstalled, provinceTotals.installedPorts, `r${res} cổng lắp đặt`);
    assert.equal(sumStations, provinceTotals.stations, `r${res} số trạm`);

    for (let t = 0; t < HOURS_IN_WEEK; t += 17) {
      const province = occStatsAt(p, members, t);
      const rows = regionsAt(index, res, t);
      const busy = rows.reduce((a, r) => a + r.busyPortsAvg, 0);
      const ports = rows.reduce((a, r) => a + r.observedPorts, 0);
      const contrib = rows.reduce((a, r) => a + r.contributingStations, 0);
      assert.ok(Math.abs(busy - province.busyPortsAvg) <= 1e-6 * Math.max(1, province.busyPortsAvg), `r${res} t${t} Σocc`);
      assert.ok(Math.abs(ports - province.observedPorts) <= 1e-6 * Math.max(1, province.observedPorts), `r${res} t${t} Σports`);
      assert.equal(contrib, province.contributingStations, `r${res} t${t} số trạm góp`);
    }
  }
});

test("cell không contributor là null; cell có contributor `occ=0` là 0", () => {
  const occupancy = makeOccupancy([10, 10], undefined, 0.05);
  const p = occupancy.profiles;
  put(p, 0, 12, 0, 4); // biết là không ai sạc
  put(p, 1, 12, 5, 0.1); // chưa đủ quan sát
  const index = buildUtilRegions(occupancy);
  const rows = regionsAt(index, 8, 12);
  const zero = rows.find((r) => r.contributingStations === 1);
  const empty = rows.find((r) => r.contributingStations === 0);
  assert.equal(zero?.utilization, 0, "zero biết được là một giá trị");
  assert.equal(empty?.utilization, null, "không quan sát được là null, không phải 0");
  assert.equal(empty?.installedPorts, 10, "vùng vẫn biết mình có bao nhiêu cổng lắp đặt");
});

test("trạm BUFFER không tạo cell và không vào tổng vùng nào", () => {
  const occupancy = makeOccupancy([10, 10], [true, false], 0.05);
  const p = occupancy.profiles;
  put(p, 0, 4, 5, 4);
  put(p, 1, 4, 10, 4);
  const index = buildUtilRegions(occupancy);
  assert.equal(index.levels[8].cells.length, 1);
  assert.equal(index.locatedTotals.stations, 1);
  assert.equal(regionsAt(index, 8, 4)[0]!.utilization, 0.5);
});

test("trạm không định vị được đi vào `unlocated`, KHÔNG bị gán vào cell gần nhất", () => {
  const occupancy = makeOccupancy([10, 7], undefined, 0.05);
  occupancy.stations[1]!.lat = NaN;
  occupancy.stations[1]!.lng = NaN;
  const p = occupancy.profiles;
  put(p, 0, 4, 5, 4);
  put(p, 1, 4, 7, 4);
  const index = buildUtilRegions(occupancy);
  assert.equal(index.unlocated.stations, 1);
  assert.equal(index.unlocated.installedPorts, 7);
  assert.equal(index.levels[8].cells.length, 1);
  assert.equal(index.locatedTotals.installedPorts, 10, "tổng đối chiếu đã trừ trạm chưa định vị");
});

test("thứ tự cell TẤT ĐỊNH — hai lần dựng cho cùng một mảng", () => {
  const a = buildUtilRegions(makeOccupancy([1, 2, 3, 4], undefined, 0.04));
  const b = buildUtilRegions(makeOccupancy([1, 2, 3, 4], undefined, 0.04));
  for (const res of UTIL_RESOLUTIONS) {
    assert.deepEqual(
      a.levels[res].cells.map((c) => c.h3),
      b.levels[res].cells.map((c) => c.h3),
    );
  }
});

test("biên LOD: 9,49→r6 · 9,5→r7 · 11,49→r7 · 11,5→r8 · 12,99→r8 · 13→chấm trạm", () => {
  assert.equal(utilResolutionForZoom(9.49), 6);
  assert.equal(utilResolutionForZoom(UTIL_LOD_R7_MIN_ZOOM), 7);
  assert.equal(utilResolutionForZoom(11.49), 7);
  assert.equal(utilResolutionForZoom(UTIL_LOD_R8_MIN_ZOOM), 8);
  assert.equal(utilResolutionForZoom(12.99), 8);
  assert.equal(utilResolutionForZoom(UTIL_STATION_MIN_ZOOM), null);
  assert.equal(utilResolutionForZoom(20), null);
});

test("đổi LOD KHÔNG đổi tỉ lệ của cùng một tập trạm — chỉ đổi đơn vị đọc", () => {
  const occupancy = makeOccupancy([10, 10, 10], undefined, 0.0005); // sát nhau ⇒ cùng cell r8
  const p = occupancy.profiles;
  for (let s = 0; s < 3; s++) put(p, s, 30, 4, 4);
  const index = buildUtilRegions(occupancy);
  for (const res of UTIL_RESOLUTIONS) {
    const rows = regionsAt(index, res, 30);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.utilization, 0.4);
  }
});

test("coverage cổng dưới 50% chỉ là CẢNH BÁO — giá trị và mẫu số không đổi", () => {
  const occupancy = makeOccupancy([10, 30], undefined, 0.0005);
  const p = occupancy.profiles;
  put(p, 0, 6, 5, 4);
  put(p, 1, 6, 15, 0.1);
  const row = regionsAt(buildUtilRegions(occupancy), 8, 6)[0]!;
  assert.equal(row.portCoverage, 0.25);
  assert.ok(isLowPortCoverage(row.portCoverage));
  assert.equal(row.utilization, 0.5, "cảnh báo coverage không được đụng vào giá trị");
  assert.equal(row.installedPorts, 40);
  assert.equal(row.stations, 2);
  assert.equal(row.contributingStations, 1);
  assert.equal(isLowPortCoverage(null), false, "null không phải 'coverage thấp'");
});

test("`regionReadoutOf` khớp tooltip: tử số, mẫu số, n/N trạm và giờ quan sát/cổng", () => {
  const occupancy = makeOccupancy([12, 35], undefined, 0.0005);
  const p = occupancy.profiles;
  put(p, 0, 18, 4.4, 3.6);
  put(p, 1, 18, 8, 3.6);
  const index = buildUtilRegions(occupancy);
  const h3 = index.levels[7].cells[0]!.h3;
  const r = regionReadoutOf(index, 7, h3, 18)!;
  // Tolerance, không `equal`: `OccProfiles.occ` là `Float32Array` — 4,4 lưu vào rồi đọc ra
  // là 4,400000095. Đó là thuộc tính THẬT của tầng nạp (typed array là lý do scrub 4 Hz
  // chạy được), nên chỗ đọc số phải làm tròn khi HIỂN THỊ chứ không đòi bằng nhau tuyệt
  // đối. Ngưỡng `1e-6` tương đối cũng chính là ngưỡng bảo toàn của spec §11.2 mục 5.
  const near = (a: number, b: number, what: string) =>
    assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${what}: ${a} ≉ ${b}`);
  near(r.busyPortsAvg, 12.4, "Σocc");
  assert.equal(r.observedPorts, 47);
  near(r.utilization!, 12.4 / 47, "tỉ lệ");
  assert.equal(r.contributingStations, 2);
  assert.equal(r.stations, 2);
  near(r.observedHoursPerPort, 3.6, "giờ quan sát/cổng");
  assert.equal(regionReadoutOf(index, 7, "8818308281fffff", 18), null, "cell lạ ⇒ null, không nổ");
});

test("Inspector vùng tách trạm ĐÃ GÓP khỏi trạm im lặng, xếp theo cổng bận", () => {
  const occupancy = makeOccupancy([30, 10, 5], undefined, 0.0005);
  const p = occupancy.profiles;
  put(p, 0, 20, 6, 4);
  put(p, 1, 20, 9, 4); // tỉ lệ cao hơn nhưng ít cổng bận hơn
  put(p, 2, 20, 5, 0.1);
  const index = buildUtilRegions(occupancy);
  const h3 = index.levels[8].cells[0]!.h3;
  const m = regionMembersAt(index, 8, h3, 20, p);
  assert.deepEqual(m.contributing.map((c) => c.station), [1, 0], "xếp theo Σocc, không theo tỉ lệ");
  assert.deepEqual(m.silent, [2], "trạm không đủ quan sát vào nhóm riêng, không biến mất");
});

// ══ 8. Múi giờ ══════════════════════════════════════════════════════════════

test("thiếu/hỏng `occupancy_hour_tz` ⇒ 'ô giờ' + công bố; hợp lệ ⇒ nhãn đồng hồ", () => {
  assert.deepEqual(occTimezoneOf(undefined), { kind: "unknown" });
  assert.deepEqual(occTimezoneOf({}), { kind: "unknown" });
  assert.deepEqual(occTimezoneOf({ occupancy_hour_tz: "" }), { kind: "unknown" });
  assert.deepEqual(occTimezoneOf({ occupancy_hour_tz: "Hanoi" }), { kind: "unknown" });
  assert.deepEqual(occTimezoneOf({ occupancy_hour_tz: "+07:00" }), { kind: "unknown" });
  assert.deepEqual(occTimezoneOf({ occupancy_hour_tz: "UTC" }), { kind: "declared", tz: "UTC" });
  assert.deepEqual(occTimezoneOf({ occupancy_hour_tz: "Asia/Ho_Chi_Minh" }), {
    kind: "declared",
    tz: "Asia/Ho_Chi_Minh",
  });

  const unknown = occTimezoneOf(undefined);
  assert.equal(hourBucketLabel(18, unknown), "ô giờ 18");
  assert.equal(occTimezoneDisclosure(unknown), OCC_TZ_DISCLOSURE);

  const known = occTimezoneOf({ occupancy_hour_tz: "Asia/Ho_Chi_Minh" });
  assert.equal(hourBucketLabel(18, known), "18:00 · Asia/Ho_Chi_Minh");
  assert.equal(occTimezoneDisclosure(known), null);
});

test("manifest ba gói đang ship đều CHƯA khai múi giờ — nên UI phải ở nhánh 'ô giờ'", async () => {
  const { readFileSync } = await import("node:fs");
  for (const code of ["01", "68", "11"]) {
    const m = JSON.parse(
      readFileSync(new URL(`../public/data/p/${code}/manifest.json`, import.meta.url), "utf8"),
    ) as { snapshots?: { occupancy_hour_tz?: string } };
    assert.equal(
      occTimezoneOf(m.snapshots).kind,
      "unknown",
      `p/${code} chưa phát occupancy_hour_tz — copy đồng hồ vẫn bị cấm`,
    );
  }
});
