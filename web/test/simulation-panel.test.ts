/**
 * UX redesign — presenter, copy deck và bất biến cấu trúc của panel mô phỏng.
 *
 * Hai lớp, đúng khuôn `phase10-release.test.ts`:
 *  · **Giá trị thật** cho mọi thứ đã tách thành hàm thuần (`simulation/presenter.ts`,
 *    `engine.ts`, `geometry.ts`) — câu chữ được so NGUYÊN VĂN với copy deck §10.
 *  · **Bất biến trên mã nguồn** cho những thứ chỉ tồn tại trong cây React. Đây KHÔNG phải
 *    bản thay thế cho witness trình duyệt; nó là cổng rẻ chặn tái phát trong `make kiem`.
 *
 * KHÔNG import `state/hash` ở file này: bộ test hash đã có chỗ riêng, và giữ ở đây một đồ
 * thị import hẹp nghĩa là bộ này còn chạy được khi phần khác của web đang dở dang.
 *
 * Reference: docs/UX_SIMULATION_REDESIGN_SPEC.md §20.1, §20.2, §21
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latLngToCell, cellToLatLng, gridDisk } from "h3-js";

import { runSimulation } from "../src/simulation/engine";
import { checkAdmission, resolveCommune } from "../src/simulation/admissions";
import { simulationAreaBbox } from "../src/simulation/geometry";
import { candidateKeyOf } from "../src/simulation/store";
import {
  SCREENING_EXCEPTION_FLOOR_M,
  SCREENING_THRESHOLDS,
  replayScreening,
} from "../src/simulation/screening";
import {
  BAND_ORDER,
  NAV_IDLE_LABEL,
  NAV_PLACING_LABEL,
  NAV_PLACING_TOOLTIP,
  NAV_REPLACE_LABEL,
  NAV_REPLACE_TOOLTIP,
  NEXT_EVIDENCE_ITEMS,
  NO_MEDIAN_COPY,
  RULE_FOOTER,
  distributionModel,
  formatCount,
  formatDistance,
  formatKm,
  localityFocusView,
  localityRowValue,
  localityLine,
  localityRowLabel,
  medianSentences,
  methodBody,
  missingLocalityNotice,
  navTriggerCopy,
  outcomeModel,
  ruleState,
  rulePresentation,
  technicalRows,
  unresolvedNotices,
} from "../src/simulation/presenter";
import type { ScreeningEvidence, SimCalibration } from "../src/simulation/types";

const CAL: SimCalibration = {
  version: 1,
  province_code: "01",
  bands: {
    "200-500": { n: 356, med: 1.716, p90: 3.413 },
    "500-1000": { n: 882, med: 1.572, p90: 2.655 },
    "1000-2000": { n: 1637, med: 1.47, p90: 2.177 },
    "2000-3000": { n: 900, med: 1.408, p90: 1.967 },
    "3000-5000": { n: 504, med: 1.369, p90: 1.899 },
    "5000-inf": { n: 31, med: 1.594, p90: 2.053 },
  },
  near: { n: 87, net_p50: 264, net_p90: 728 },
  validation: { n: 4310, within_20pct: 0.659, upper_miss: 0.097 },
  valid: true,
};

const P = { lat: 21.0285, lng: 105.8542 };
const CENTER = latLngToCell(P.lat, P.lng, 8);

const SRC = new URL("../src/", import.meta.url).pathname;
/** Bóc chú thích trước khi khớp: một bất biến không được "đúng" chỉ vì nó nằm trong comment. */
const code = (rel: string) =>
  readFileSync(`${SRC}${rel}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Vùng tổng hợp: ba xã có tên, một ô thiếu tên, một ô không có nền so sánh. */
function zoneFixture(
  opts: { withNames?: boolean; population?: number } = {},
) {
  const { withNames = true, population = 1000 } = opts;
  const ring = gridDisk(CENTER, 3);
  return ring.map((h, i) => {
    const [lat, lng] = cellToLatLng(h);
    const communeIdx = i % 3;
    return {
      h3_r8: h,
      lat,
      lng,
      population,
      // Ô thứ 5 mất tên trong khi VẪN có mã — đúng ca §7.5 điều kiện 1.
      commune_code: `0000${communeIdx}`,
      commune_name: withNames && i !== 5 ? `Xã Số ${communeIdx}` : null,
      dist_station_network_m: i === 2 ? null : 4200,
      detour_ratio: 1.4,
      evidence_grade_distance: i === 2 ? "UNREACHABLE_NO_PATH" : "GOOD",
    };
  });
}

function run(overrides: Partial<Parameters<typeof runSimulation>[0]> = {}) {
  return runSimulation({
    candidate: P,
    candidateCell: CENTER,
    communeKind: "XA",
    communeCode: "00000",
    communeName: "Xã Số 0",
    provinceName: "Thành phố Hà Nội",
    gridCells: zoneFixture(),
    stations: [],
    occupancyMap: new Map(),
    calibration: CAL,
    manifestExported: "2026-08-21T03:27:52+00:00",
    ...overrides,
  });
}

// ── 1. Định dạng số — vi-VN, và một đơn vị cho mỗi vai trò ────────────────────

test("format: mọi số đọc được dùng vi-VN; dấu chấm chỉ còn ở toạ độ (UX-SIM-15)", () => {
  assert.equal(formatCount(31746), "31.746");
  assert.equal(formatCount(0), "0");
  assert.equal(formatKm(3105), "3,1 km");
  assert.equal(formatKm(2000), "2,0 km");
  assert.equal(formatKm(500), "0,5 km");
  // Cự ly đứng một mình: mét ở dưới 1 km để không vứt đi phần thông tin của 264 m.
  assert.equal(formatDistance(264), "264 m");
  assert.equal(formatDistance(1712), "1,7 km");
  assert.equal(formatDistance(null), "—");
  // Dấu chấm trong "31.746" là dấu PHÂN NHÓM của vi-VN và nó đúng; thứ bị cấm là dấu chấm
  // THẬP PHÂN — phần lẻ luôn phải đứng sau dấu phẩy.
  for (const s of [formatCount(31746), formatKm(3105), formatDistance(1712), formatDistance(264)]) {
    assert.doesNotMatch(s, /\.\d{1,2}(\s|$)/, `${s} in dấu chấm thập phân`);
  }
  assert.match(formatKm(3105), /,\d/, "phần lẻ phải đứng sau dấu phẩy");
});

test("format: toạ độ kỹ thuật GIỮ dấu chấm và chỉ nằm ở khối cuối", () => {
  const rows = technicalRows(run());
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Toạ độ", "Ô H3 r8", "Hiệu chuẩn mô phỏng", "Ngày xuất gói dữ liệu"],
  );
  assert.equal(rows[0]!.value, "21.02850, 105.85420");
  // Chỉ hai dòng ĐỊNH DANH MÁY được dùng mono (§15).
  assert.deepEqual(rows.map((r) => r.mono), [true, true, false, false]);
  assert.equal(rows[3]!.value, "21/08/2026");
});

// ── 2. Outcome — bốn trạng thái đóng, improved và uncertain KHÔNG gộp ─────────

test("outcome §10.4: cả bốn tổ hợp improved × uncertain khớp NGUYÊN VĂN copy deck", () => {
  const mk = (improved: number, uncertain: number) =>
    outcomeModel({
      after: {
        improved: { cells: improved, population: improved * 100 },
        uncertain: { cells: uncertain, population: uncertain * 10 },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  assert.equal(
    mk(12, 6).text,
    "Ước tính ~1.200 người trong 12 ô được rút ngắn cự ly rõ rệt. ~60 người trong 6 ô khác có thể cải thiện, nhưng còn trong biên sai số.",
  );
  assert.equal(
    mk(12, 0).text,
    "Ước tính ~1.200 người trong 12 ô được rút ngắn cự ly rõ rệt. Không có ô nào nằm trong nhóm có thể cải thiện nhưng còn trong biên sai số.",
  );
  assert.equal(
    mk(0, 6).text,
    "Chưa có ô nào được xếp vào nhóm cải thiện rõ rệt. ~60 người trong 6 ô có thể cải thiện, nhưng kết quả còn trong biên sai số.",
  );
  assert.equal(
    mk(0, 0).text,
    "Không có ô nào trong phạm vi 5 km được ước tính rút ngắn cự ly ở vị trí này.",
  );
  assert.equal(mk(0, 0).secondary, null);
  // `text` LUÔN là hai câu nối bằng đúng một dấu cách — dùng cho `aria-live`.
  assert.equal(mk(12, 6).text, `${mk(12, 6).primary} ${mk(12, 6).secondary}`);
});

test("outcome: không câu nào gộp improved với uncertain thành một con số (UX-SIM-05)", () => {
  const m = outcomeModel({
    after: {
      improved: { cells: 12, population: 31746 },
      uncertain: { cells: 6, population: 2947 },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  assert.match(m.primary, /31\.746/);
  assert.match(m.secondary!, /2\.947/);
  // 34.693 = tổng hai lớp. Nó KHÔNG được xuất hiện ở bất kỳ đâu.
  assert.doesNotMatch(m.text, /34\.693/);
  // "cận trên p90" là tiêu chí kỹ thuật — §4 loại nó khỏi câu chính.
  assert.doesNotMatch(m.text, /p90|cận trên/i);
});

// ── 3. Phần chưa thể kết luận — bốn loại KHÁC NGHĨA, không gộp ────────────────

test("§10.5: NO_BASELINE, EXCLUDED, zone cắt và pop-source là bốn câu riêng", () => {
  const r = run();
  const base = unresolvedNotices(r);
  assert.equal(base.length, 1, "fixture có đúng một ô NO_BASELINE");
  assert.match(base[0]!, /không tới được trạm nào trong đồ thị đường đã phát hành/);

  const withAll = unresolvedNotices({
    ...r,
    before: {
      ...r.before,
      noBaseline: { cells: 3, population: 300 },
      excluded: { cells: 2, population: 200 },
    },
    meta: { ...r.meta, zoneTruncated: true, flaggedPopSourceCells: 7 },
  });
  assert.equal(withAll.length, 4);
  assert.match(withAll[1]!, /không có đường được neo trong phạm vi 2 km/);
  assert.equal(
    withAll[2],
    "Phạm vi 5 km chạm ranh giới gói dữ liệu; các ô phía tỉnh bên cạnh không được tính.",
  );
  assert.match(withAll[3]!, /^7 ô trong phạm vi dùng bề mặt dân số chưa neo được/);

  // Không dòng nào khi mọi thứ sạch — cảnh báo luôn hiện là cảnh báo không ai đọc.
  assert.deepEqual(
    unresolvedNotices({
      ...r,
      before: {
        ...r.before,
        noBaseline: { cells: 0, population: 0 },
        excluded: { cells: 0, population: 0 },
      },
      meta: { ...r.meta, zoneTruncated: false, flaggedPopSourceCells: 0 },
    }),
    [],
  );
});

// ── 4. §12 Bảng trạng thái rule — đóng, và test được một mình ─────────────────

function ev(over: Partial<ScreeningEvidence> = {}): ScreeningEvidence {
  return {
    distanceM: 3105,
    thresholdM: 2000,
    marginM: 1105,
    kind: "XA",
    nearestStationCode: "S1",
    nearestStationName: "Trạm S1",
    nearestUtil: null,
    nearestUtilReportable: false,
    nearestGrade: null,
    nearestHighLoad: false,
    highLoadEvaluable: true,
    exceptionFloorM: 500,
    highLoadThreshold: 0.4,
    ...over,
  };
}

test("§12.1: bảng trạng thái trình bày phủ đủ năm nhánh", () => {
  assert.equal(ruleState(ev()), "BASE_PASS");
  assert.equal(ruleState(ev({ distanceM: null, marginM: null })), "NOT_COMPUTABLE");
  assert.equal(
    ruleState(ev({ kind: null, thresholdM: null, marginM: null })),
    "NOT_COMPUTABLE",
  );
  // Xã, trong dải ngoại lệ (500 < d ≤ 2000), trạm gần nhất đo được cao tải.
  assert.equal(
    ruleState(ev({ distanceM: 1500, marginM: -500, nearestHighLoad: true })),
    "CONDITIONAL_DC",
  );
  // Cùng ca, nhưng CẢ LỚP mức sử dụng của tỉnh không dùng được (F6).
  assert.equal(
    ruleState(ev({ distanceM: 1500, marginM: -500, highLoadEvaluable: false })),
    "BASE_FAIL_EXCEPTION_UNAVAILABLE",
  );
  // Dưới sàn ngoại lệ 500 m: không có nhánh nào để xét.
  assert.equal(
    ruleState(ev({ distanceM: 480, marginM: -1520, nearestHighLoad: true })),
    "BASE_FAIL",
  );
  // Bằng ngưỡng: `>` là CHẶT, nên đây là không qua.
  assert.equal(ruleState(ev({ distanceM: 2000, marginM: 0 })), "BASE_FAIL");
});

test("§12.1: trạng thái trình bày LUÔN khớp phán quyết của engine (property)", () => {
  const kinds = ["PHUONG", "XA", "DAC_KHU"] as const;
  for (const kind of kinds) {
    for (const d of [0, 100, 499, 500, 501, 1500, 1999, 2000, 2001, 5000]) {
      for (const highLoad of [false, true]) {
        for (const evaluable of [false, true]) {
          const replay = replayScreening(d, kind, evaluable && highLoad);
          const state = ruleState(
            ev({
              distanceM: d,
              thresholdM: SCREENING_THRESHOLDS[kind],
              marginM: replay.marginM,
              kind,
              nearestHighLoad: highLoad,
              highLoadEvaluable: evaluable,
            }),
          );
          const expected =
            replay.decision === "DE_XUAT"
              ? ["BASE_PASS"]
              : replay.decision === "DE_XUAT_NEU_CO_DC"
                ? ["CONDITIONAL_DC"]
                : ["BASE_FAIL", "BASE_FAIL_EXCEPTION_UNAVAILABLE"];
          assert.ok(
            expected.includes(state),
            `${kind} d=${d} highLoad=${highLoad} evaluable=${evaluable}: ${state} không khớp ${replay.decision}`,
          );
        }
      }
    }
  }
});

test("§12.2: rule in ĐỦ khoảng cách, ngưỡng và biên — không chỉ mỗi biên (UX-SIM-06)", () => {
  const p = rulePresentation(ev());
  assert.equal(p.headline, "Qua bước sàng lọc khoảng cách theo quy tắc L6.");
  assert.deepEqual(p.facts, [
    {
      label: "Khoảng cách tới trạm đủ điều kiện gần nhất",
      value: "3,1 km đường chim bay",
    },
    { label: "Ngưỡng của Xã", value: "lớn hơn 2,0 km" },
    { label: "Cao hơn ngưỡng", value: "1,1 km" },
  ]);
  assert.equal(p.footer, RULE_FOOTER);
  // Enum nội bộ KHÔNG BAO GIỜ ra màn hình (§2.3).
  const all = [p.headline, ...p.notes, ...p.facts.map((f) => f.value), p.footer].join(" ");
  for (const banned of ["ĐỀ XUẤT", "TỪ CHỐI", "DE_XUAT", "TU_CHOI", "XA", "PHUONG"]) {
    assert.ok(!all.includes(banned), `rule in ra enum "${banned}"`);
  }
});

test("§12.2: kind hiển thị bằng tiếng Việt, mỗi loại một ngưỡng", () => {
  assert.equal(
    rulePresentation(ev({ kind: "PHUONG", thresholdM: 500, distanceM: 600, marginM: 100 }))
      .facts[1]!.label,
    "Ngưỡng của Phường",
  );
  assert.equal(
    rulePresentation(ev({ kind: "DAC_KHU", thresholdM: 500, distanceM: 600, marginM: 100 }))
      .facts[1]!.label,
    "Ngưỡng của Đặc khu",
  );
});

test("§10.6: bằng ngưỡng thì nói ra `>` là chặt", () => {
  const p = rulePresentation(ev({ distanceM: 2000, marginM: 0 }));
  assert.equal(p.state, "BASE_FAIL");
  assert.ok(
    p.notes.includes(
      "Khoảng cách bằng ngưỡng, nhưng quy tắc yêu cầu phải lớn hơn ngưỡng.",
    ),
  );
  assert.equal(p.facts[2]!.label, "Bằng ngưỡng");
});

test("§10.6: nhánh DC có điều kiện in đủ ba dòng điều kiện", () => {
  const p = rulePresentation(
    ev({ distanceM: 1500, marginM: -500, nearestHighLoad: true, nearestUtilReportable: true, nearestUtil: 0.55 }),
  );
  assert.equal(p.state, "CONDITIONAL_DC");
  assert.equal(p.headline, "Qua bước sàng lọc có điều kiện: vị trí mới phải có sạc DC.");
  assert.deepEqual(p.notes, [
    "Vị trí nằm trên sàn ngoại lệ 0,5 km nhưng chưa vượt ngưỡng 2,0 km của Xã.",
    "Trạm gần nhất có mức sử dụng đo đủ điều kiện từ 40% trở lên.",
    "Quy tắc chỉ cho qua nhánh này khi vị trí mới có sạc DC.",
  ]);
});

test("§10.6 + §13.1: thiếu phép đo KHÔNG được đọc thành tải thấp", () => {
  const unusable = rulePresentation(
    ev({ distanceM: 1500, marginM: -500, highLoadEvaluable: false }),
  );
  assert.equal(unusable.state, "BASE_FAIL_EXCEPTION_UNAVAILABLE");
  assert.equal(
    unusable.headline,
    "Không qua bước sàng lọc khoảng cách theo dữ liệu hiện có.",
  );
  assert.ok(unusable.notes.some((n) => /lớp mức sử dụng của tỉnh này không dùng được/.test(n)));
  assert.ok(
    unusable.notes.some((n) => /không được hiểu là trạm đang có mức sử dụng thấp/.test(n)),
  );

  // Lớp DÙNG ĐƯỢC nhưng trạm gần nhất không có phép đo đủ điều kiện — câu khác hẳn.
  const noMeasure = rulePresentation(ev({ distanceM: 1500, marginM: -500 }));
  assert.equal(noMeasure.state, "BASE_FAIL");
  assert.ok(
    noMeasure.notes.some((n) =>
      /không có phép đo đủ điều kiện\. Điều này không chứng minh trạm đang có mức sử dụng thấp/.test(n),
    ),
  );
  // Không ở đâu in "0%" cho một phép đo vắng.
  assert.ok(!noMeasure.notes.join(" ").includes("0%"));
});

test("§12.1: không có ngưỡng hoặc không có trạm ⇒ chưa tính được, KHÔNG phải từ chối", () => {
  const noKind = rulePresentation(ev({ kind: null, thresholdM: null, marginM: null }));
  assert.equal(noKind.state, "NOT_COMPUTABLE");
  assert.equal(noKind.headline, "Chưa tính được kết quả sàng lọc khoảng cách.");
  assert.ok(noKind.notes.includes("Không xác định được loại đơn vị hành chính tại điểm này."));

  const noStation = rulePresentation(ev({ distanceM: null, marginM: null }));
  assert.equal(noStation.state, "NOT_COMPUTABLE");
  assert.ok(noStation.notes.includes("Chưa có trạm đủ điều kiện nào trong gói dữ liệu."));
  assert.equal(noStation.facts[0]!.value, "chưa xác định");
});

// ── 5. Bằng chứng sàng lọc do engine phát ra ──────────────────────────────────

test("engine: ScreeningEvidence khớp phán quyết hiện hành, không phải một phép tính mới", () => {
  const near = {
    station_code: "S_HOT",
    name: "Trạm nóng",
    lat: P.lat + 0.008, // ~890 m
    lng: P.lng,
    op_status: "OPERATIONAL",
    access: null,
  };
  const r = run({
    stations: [near],
    occupancyMap: new Map([
      ["S_HOT", { util: 0.55, grade: "GOOD", util_reportable: true }],
    ]),
  });
  const e = r.screening.evidence;
  assert.equal(e.kind, r.screening.kind);
  assert.equal(e.marginM, r.screening.marginM);
  assert.equal(e.thresholdM, SCREENING_THRESHOLDS.XA);
  assert.equal(e.exceptionFloorM, SCREENING_EXCEPTION_FLOOR_M);
  assert.ok(e.distanceM !== null && Math.abs(e.distanceM - 890) < 15);
  assert.equal(e.marginM, e.distanceM! - e.thresholdM!);
  assert.equal(e.nearestStationCode, "S_HOT");
  assert.equal(e.nearestStationName, "Trạm nóng");
  assert.equal(e.nearestUtil, 0.55);
  assert.equal(e.nearestHighLoad, true);
  assert.equal(r.screening.decision, "DE_XUAT_NEU_CO_DC");
  assert.equal(ruleState(e), "CONDITIONAL_DC");
});

test("engine: trạm gần nhất không đủ điều kiện đo ⇒ util GIỮ null, không phải 0", () => {
  const r = run({
    stations: [
      {
        station_code: "S_DIM",
        name: "Trạm mờ",
        lat: P.lat + 0.008,
        lng: P.lng,
        op_status: "OPERATIONAL",
        access: null,
      },
    ],
    occupancyMap: new Map([
      ["S_DIM", { util: 0.9, grade: "POOR", util_reportable: false }],
    ]),
  });
  assert.equal(r.screening.evidence.nearestUtil, null);
  assert.equal(r.screening.evidence.nearestUtilReportable, false);
  assert.equal(r.screening.evidence.nearestHighLoad, false);
});

// ── 6. Địa danh — §7.5 và §10.8 ───────────────────────────────────────────────

test("§7.5: nhóm địa danh cộng đúng bằng tổng toàn vùng của các ô CÓ TÊN", () => {
  const r = run();
  const named = r.areas.named;
  assert.ok(named.length > 0);
  const sumImproved = named.reduce((s, a) => s + a.improved.cells, 0);
  const sumUncertain = named.reduce((s, a) => s + a.uncertain.cells, 0);
  assert.equal(
    sumImproved + sumUncertain + r.areas.missingName.cells,
    r.after.improved.cells + r.after.uncertain.cells,
    "ô có tên + ô thiếu tên phải bằng tổng hai lớp của toàn vùng",
  );
  // Ô thiếu tên vẫn ở TỔNG toàn vùng — nó chỉ không được liệt kê.
  assert.equal(r.areas.missingName.cells, 1);
  assert.ok(r.areas.missingName.population > 0);
  // Không một nhãn tự đặt nào, và H3 không bao giờ thay tên.
  for (const a of named) {
    assert.match(a.communeName, /^Xã Số \d$/);
    assert.doesNotMatch(a.communeName, /^8[0-9a-f]{14}$/);
  }
});

test("§7.5: tên MÂU THUẪN với feature cùng mã bị coi là không đáng tin", () => {
  const r = run({
    communeNamesByCode: new Map([
      ["00000", "Xã Số 0"],
      ["00001", "Một tên khác hẳn"], // mâu thuẫn ⇒ cả nhóm rơi sang missingName
    ]),
  });
  const codes = r.areas.named.map((a) => a.communeCode);
  assert.ok(!codes.includes("00001"), "nhóm mâu thuẫn không được liệt kê");
  assert.ok(codes.includes("00000"));
  assert.ok(r.areas.missingName.cells > 1);
});

test("§7.5: mọi ô thiếu tên ⇒ KHÔNG có danh sách địa danh nào", () => {
  const r = run({ gridCells: zoneFixture({ withNames: false }) });
  assert.deepEqual(r.areas.named, []);
  assert.ok(r.areas.missingName.cells > 0);
  assert.match(missingLocalityNotice(r)!, /chưa có địa danh đủ tin cậy để liệt kê/);
});

test("§10.8: nhãn hàng địa danh nói CẢ hai lớp bất định", () => {
  const label = localityRowLabel({
    communeCode: "00001",
    communeName: "Xã Tây Phương",
    improved: { cells: 4, population: 12345 },
    uncertain: { cells: 2, population: 678 },
    h3s: [],
  });
  assert.equal(
    label,
    "Xem Xã Tây Phương trên bản đồ: ước tính ~12.345 người cải thiện rõ rệt, ~678 người còn trong biên sai số.",
  );
});

test("§10.8: hàng chỉ có ô trong sai số KHÔNG in `~0 người`", () => {
  const base = { communeCode: "1", communeName: "Xã A", h3s: [] };
  assert.equal(
    localityRowValue({
      ...base,
      improved: { cells: 4, population: 12345 },
      uncertain: { cells: 2, population: 678 },
    }),
    "~12.345 người",
  );
  // Đo được ở witness 1280×800: hai xã chỉ có ô UNCERTAIN từng in ra `~0 người` — đúng
  // con số, sai câu chuyện. Số hiện phải là số nói lý do hàng ấy có mặt.
  const onlyUncertain = localityRowValue({
    ...base,
    improved: { cells: 0, population: 0 },
    uncertain: { cells: 3, population: 2947 },
  });
  assert.equal(onlyUncertain, "~2.947 trong sai số");
  assert.doesNotMatch(onlyUncertain, /~0\b/);
});

test("§10.2: dòng địa danh không ghép thêm tiền tố loại đơn vị", () => {
  assert.equal(
    localityLine({
      communeCode: "1",
      communeName: "Xã Tây Phương",
      communeKind: "XA",
      provinceName: "Thành phố Hà Nội",
    }),
    "Xã Tây Phương · Thành phố Hà Nội",
  );
  // `commune_name` ĐÃ mang tiền tố — ghép thêm sẽ ra "Xã Xã Tây Phương".
  assert.doesNotMatch(
    localityLine({
      communeCode: "1",
      communeName: "Xã Tây Phương",
      communeKind: "XA",
      provinceName: "Hà Nội",
    })!,
    /Xã Xã/,
  );
  assert.equal(
    localityLine({
      communeCode: null,
      communeName: null,
      communeKind: null,
      provinceName: "Thành phố Hà Nội",
    }),
    "Vị trí trong Thành phố Hà Nội",
  );
  assert.equal(
    localityLine({ communeCode: null, communeName: null, communeKind: null, provinceName: null }),
    null,
  );
});

test("§10.2: tên rất dài vẫn là MỘT chuỗi, không bị cắt trong model", () => {
  const long = "Phường Nguyễn Thị Minh Khai – Trần Hưng Đạo – Lê Thánh Tông mở rộng";
  const line = localityLine({
    communeCode: "1",
    communeName: long,
    communeKind: "PHUONG",
    provinceName: "Thành phố Hồ Chí Minh",
  })!;
  assert.ok(line.startsWith(long), "presenter không được tự cắt tên — cắt là việc của CSS");
  assert.ok(line.includes(" · "));
});

test("admissions: phân giải xã trả code/name/kind trong MỘT lượt", () => {
  // Feature KHÔNG khai `type` — đúng hình dạng mà kiểu `CommuneFeature` công bố. PIP phải
  // ăn được nó; trước bản vá, nhánh này trượt LẶNG rồi rơi xuống fallback theo mã ô.
  const communes = {
    features: [
      {
        properties: {
          commune_code: "00070",
          commune_kind: "PHUONG",
          commune_name: "Phường Ba Đình",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [105.85, 21.02],
              [105.86, 21.02],
              [105.86, 21.04],
              [105.85, 21.04],
              [105.85, 21.02],
            ],
          ],
        },
      },
    ],
  };
  assert.deepEqual(resolveCommune(P, undefined, communes), {
    kind: "PHUONG",
    code: "00070",
    name: "Phường Ba Đình",
  });
  // PIP trượt ⇒ fallback theo mã ô; tên lấy từ feature cùng mã.
  const far = { lat: 10, lng: 100 };
  assert.deepEqual(
    resolveCommune(far, { h3: "x", communeCode: "00070", communeName: "Tên của ô" }, communes),
    { kind: "PHUONG", code: "00070", name: "Phường Ba Đình" },
  );
  // Cả hai trượt ⇒ kind null (không ngưỡng), nhưng tên/mã của ô vẫn dùng để GỌI vị trí.
  assert.deepEqual(
    resolveCommune(far, { h3: "x", communeCode: "99999", communeName: "Xã Không Rõ" }, communes),
    { kind: null, code: "99999", name: "Xã Không Rõ" },
  );

  const gridMap = new Map([["x", { h3: "x" }]]);
  gridMap.set(CENTER, { h3: CENTER, communeCode: "00070", communeName: "Xã của ô" } as never);
  const adm = checkAdmission(P, null, gridMap as never, CAL, communes);
  assert.equal(adm.ok, true);
  if (adm.ok) {
    assert.equal(adm.communeKind, "PHUONG");
    assert.equal(adm.communeCode, "00070");
    assert.equal(adm.communeName, "Phường Ba Đình");
  }
});

// ── 7. §11 Trước/Sau — một mẫu số, bốn dải ────────────────────────────────────

test("§11.2: hai hàng dùng CÙNG mẫu số và cùng bốn dải (UX-SIM-08)", () => {
  const r = run();
  const m = distributionModel(r);
  const sumBefore = m.before.segments.reduce((s, x) => s + x.population, 0);
  const sumAfter = m.after.segments.reduce((s, x) => s + x.population, 0);
  assert.equal(sumBefore, m.total);
  assert.equal(sumAfter, m.total, "Sau phải cùng mẫu số với Trước");
  assert.deepEqual(m.before.segments.map((s) => s.key), [...BAND_ORDER]);
  assert.deepEqual(m.after.segments.map((s) => s.key), [...BAND_ORDER]);
  // Tỉ lệ cộng lại đúng 1 (sai số dấu phẩy động).
  assert.ok(Math.abs(m.after.segments.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
  // Bảng số có ĐỦ bốn hàng kể cả dải rỗng (§11.2).
  assert.equal(m.table.length, 4);
  assert.equal(m.before.estimated, false);
  assert.equal(m.after.estimated, true);
});

test("§11.2: NO_BASELINE/EXCLUDED nằm NGOÀI thanh, không thành một dải cự ly", () => {
  const r = run();
  const m = distributionModel(r);
  const excludedPop = r.before.noBaseline.population + r.before.excluded.population;
  assert.ok(excludedPop > 0, "fixture phải có ô không nền để phép kiểm có nghĩa");
  const zoneCells = r.cells.filter((c) => c.cls !== "EXCLUDED").length;
  assert.ok(m.total < zoneCells * 1000, "dân của ô không nền không được vào mẫu số");
  assert.equal(m.total, BAND_ORDER.reduce((s, k) => s + r.before.popByBand[k], 0));
});

test("§11.2: hàng Sau GIỮ cự ly Trước ở mọi ô còn trong biên sai số", () => {
  // Ô cách candidate ~1,55 km: d̂ = 1,47·e, d̂⁺ = 2,177·e. Chọn d_old nằm giữa hai cận ⇒
  // UNCERTAIN. Nếu hàng Sau thay bằng d̂ thì dân ô này sẽ nhảy sang dải gần hơn.
  const ring = gridDisk(CENTER, 2);
  const uncertainCell = ring.find((h) => {
    const [lat, lng] = cellToLatLng(h);
    const e = Math.hypot((lat - P.lat) * 111000, (lng - P.lng) * 104000);
    return e > 1200 && e < 1800;
  })!;
  const [ulat, ulng] = cellToLatLng(uncertainCell);
  const r = run({
    gridCells: [
      {
        h3_r8: uncertainCell,
        lat: ulat,
        lng: ulng,
        population: 500,
        commune_code: "00009",
        commune_name: "Xã Biên Sai Số",
        dist_station_network_m: 2600,
        detour_ratio: 1.4,
        evidence_grade_distance: "GOOD",
      },
    ],
  });
  assert.equal(r.cells[0]!.cls, "UNCERTAIN", "fixture phải rơi đúng vào lớp UNCERTAIN");
  const m = distributionModel(r);
  // 2 600 m ⇒ dải 2–5 km ở CẢ hai hàng; không một người nào được dịch sang dải gần hơn.
  assert.equal(m.table.find((t) => t.key === "b2_5km")!.before, 500);
  assert.equal(m.table.find((t) => t.key === "b2_5km")!.after, 500);
  for (const row of m.table) assert.equal(row.delta, 0);
  // …nhưng ô ấy VẪN được đếm là "có thể cải thiện" ở câu outcome thứ hai.
  assert.equal(r.after.uncertain.cells, 1);
  assert.equal(r.after.improved.cells, 0);
});

test("§11.4: tóm tắt figure đọc CẢ tám con số, và mọi số Sau mang `~`", () => {
  const m = distributionModel(run());
  for (const row of m.table) {
    assert.ok(m.summary.includes(`trước ${formatCount(row.before)} người`));
    assert.ok(m.summary.includes(`sau ước lượng ~${formatCount(row.after)} người`));
  }
});

test("§10.7: trung vị luôn có câu `50% dân số…`, và null KHÔNG thành 0 (UX-SIM-07)", () => {
  const r = run();
  const s = medianSentences(r);
  assert.equal(s.length, 2);
  assert.match(s[0]!, /^Trước: 50% dân số trong vùng cách trạm gần nhất không quá /);
  assert.match(s[1]!, /^Sau: ước lượng 50% dân số trong vùng cách trạm gần nhất không quá ~/);

  // Vùng toàn ô 0 dân ⇒ trung vị không tồn tại ⇒ MỘT câu nói ra điều đó.
  const zero = run({ gridCells: zoneFixture({ population: 0 }) });
  assert.equal(zero.before.popWeightedMedianM, null);
  assert.deepEqual(medianSentences(zero), [NO_MEDIAN_COPY]);
  assert.doesNotMatch(NO_MEDIAN_COPY, /\b0 m\b|\b0 km\b/);
});

test("dân số 0: mô hình phân bố không chia cho 0 và không bịa một dải", () => {
  const zero = run({ gridCells: zoneFixture({ population: 0 }) });
  const m = distributionModel(zero);
  assert.equal(m.total, 0);
  for (const seg of [...m.before.segments, ...m.after.segments]) {
    assert.equal(seg.share, 0);
    assert.ok(Number.isFinite(seg.share));
  }
});

// ── 8. Khối phương pháp, checklist, nav copy ──────────────────────────────────

test("§10.10: khối phương pháp nội suy số kiểm chứng của CHÍNH tỉnh đang mở", () => {
  const body = methodBody(run());
  assert.equal(body.length, 2);
  assert.match(body[0]!, /Trên 4\.310 ô kiểm chứng của tỉnh, 65,9% ước lượng nằm trong ±20%/);
  assert.match(body[0]!, /cận trên còn bị vượt ở khoảng 9,7%/);
  assert.match(body[1]!, /Dữ liệu trạm chốt ngày 21\/08\/2026/);
});

test("§6.2: không claim bị cấm nào nằm trong copy deck của outcome/rule/checklist", () => {
  const r = run();
  const surfaced = [
    outcomeModel(r).text,
    ...unresolvedNotices(r),
    rulePresentation(r.screening.evidence).headline,
    ...rulePresentation(r.screening.evidence).facts.map((f) => `${f.label} ${f.value}`),
    ...medianSentences(r),
    ...r.areas.named.map(localityRowLabel),
  ].join(" ");
  for (const banned of [
    "doanh thu",
    "giảm tải",
    "tối ưu",
    "khuyến nghị",
    "dự báo",
    "sẽ phục vụ",
    "đề xuất đầu tư",
    "phút",
  ]) {
    assert.ok(!surfaced.includes(banned), `copy chính chứa claim bị cấm: ${banned}`);
  }
  // Checklist ĐƯỢC nói tới những thứ ấy — đó là chỗ duy nhất chúng hợp lệ (§6.2).
  assert.ok(NEXT_EVIDENCE_ITEMS.some((i) => i.includes("cấp phép")));
  assert.equal(NEXT_EVIDENCE_ITEMS.length, 4);
});

test("§10.1: nút vào tính năng có ba trạng thái, và không trạng thái nào nói `xoá`", () => {
  assert.deepEqual(navTriggerCopy(false, false), {
    label: NAV_IDLE_LABEL,
    tooltip: "Bấm rồi chọn một vị trí trên bản đồ để ước lượng thay đổi cự ly.",
  });
  assert.deepEqual(navTriggerCopy(true, false), {
    label: NAV_PLACING_LABEL,
    tooltip: NAV_PLACING_TOOLTIP,
  });
  // Đang ĐỔI: Esc giữ vị trí hiện tại, không huỷ nó.
  assert.deepEqual(navTriggerCopy(true, true), {
    label: NAV_PLACING_LABEL,
    tooltip: NAV_REPLACE_TOOLTIP,
  });
  assert.deepEqual(navTriggerCopy(false, true), {
    label: NAV_REPLACE_LABEL,
    tooltip: NAV_REPLACE_LABEL,
  });
  for (const [p, c] of [[false, false], [true, false], [true, true], [false, true]] as const) {
    assert.doesNotMatch(navTriggerCopy(p, c).tooltip, /xoá|xóa/i);
  }
});

// ── 9. §14 Vòng đời, khoá kết quả và tiêu điểm bản đồ ─────────────────────────

test("§14.2: khoá ứng viên làm tròn đúng như wire format của hash", () => {
  assert.equal(candidateKeyOf({ lat: 21.028512345, lng: 105.854226789 }), "21.02851,105.85423");
  assert.equal(candidateKeyOf(null), null);
  // Hai toạ độ cùng làm tròn về một hash là CÙNG một ứng viên.
  assert.equal(
    candidateKeyOf({ lat: 21.0285101, lng: 105.8542201 }),
    candidateKeyOf({ lat: 21.0285102, lng: 105.8542202 }),
  );
});

test("§14.4: fit nhóm địa danh có TRỪ bề rộng thẻ bằng chứng", () => {
  const bbox = simulationAreaBbox(gridDisk(CENTER, 1))!;
  assert.ok(bbox[0] < bbox[2] && bbox[1] < bbox[3], "hộp bao phải có bề rộng thật");
  const vp = { width: 1440, height: 900, evidenceWidth: 364, chromeLeft: 56, chromeBottom: 32 };
  const withCard = localityFocusView(bbox, vp);
  const withoutCard = localityFocusView(bbox, { ...vp, evidenceWidth: 0 });
  // Có thẻ ⇒ phần bản đồ còn nhìn thấy hẹp hơn ⇒ phóng THẤP hơn (hoặc bằng, do kẹp).
  assert.ok(withCard.zoom <= withoutCard.zoom);
  // …và tâm dịch sang TÂY để nhóm không nằm dưới thẻ.
  assert.ok(withCard.lng < withoutCard.lng);
  assert.ok(withCard.zoom >= 10 && withCard.zoom <= 15);
  assert.ok(Math.abs(withCard.lat - (bbox[1] + bbox[3]) / 2) < 1e-12);
  assert.equal(simulationAreaBbox([]), null);
  assert.equal(simulationAreaBbox(["không-phải-h3"]), null);
});

// ── 10. Bất biến cấu trúc trên mã nguồn (§20.2) ───────────────────────────────

const PANEL_FILES = [
  "ui/SimulationPanel.tsx",
  "ui/SimulationDistribution.tsx",
  "simulation/presenter.ts",
];

test("UX-SIM-03: không lớp màu ngoài token nào trong UI mô phỏng", () => {
  for (const rel of PANEL_FILES) {
    const src = code(rel);
    for (const family of ["slate", "emerald", "amber", "rose", "cyan", "blue", "sky"]) {
      assert.doesNotMatch(
        src,
        new RegExp(`(bg|text|border|ring|divide)-${family}-\\d`),
        `${rel} còn dùng ${family}-*`,
      );
    }
  }
});

test("UX-SIM-03: không cỡ chữ tuỳ tiện — chỉ sáu token vai trò", () => {
  for (const rel of PANEL_FILES) {
    const src = code(rel);
    assert.doesNotMatch(src, /text-\[\d+px\]/, `${rel} còn cỡ chữ gõ tay`);
    assert.doesNotMatch(
      src,
      /\btext-(xs|sm|base|lg|xl)\b/,
      `${rel} còn dùng thang cỡ của Tailwind thay vì thang vai trò`,
    );
  }
});

test("§13.3 + §15: mono CHỈ dùng cho định danh máy", () => {
  const panel = code("ui/SimulationPanel.tsx");
  const monoUses = panel.match(/font-mono/g) ?? [];
  assert.equal(monoUses.length, 1, "đúng một chỗ dùng mono, và nó ở khối Chi tiết vị trí");
  assert.match(panel, /row\.mono \? "font-mono" : ""/);
});

test("§2.3 + UX-SIM-06: enum sàng lọc không sống trong JSX", () => {
  const panel = code("ui/SimulationPanel.tsx");
  for (const banned of ["ĐỀ XUẤT", "TỪ CHỐI", "KHÔNG TÍNH ĐƯỢC", "Sàng lọc L6"]) {
    assert.ok(!panel.includes(banned), `panel còn render chuỗi "${banned}"`);
  }
  assert.doesNotMatch(panel, /DE_XUAT|TU_CHOI/, "panel không được đọc enum quyết định");
});

test("UX-SIM-09: H3 và toạ độ chỉ xuất hiện SAU `Chi tiết vị trí`", () => {
  const panel = code("ui/SimulationPanel.tsx");
  assert.doesNotMatch(panel, /candidate\.lat|candidate\.lng|\.h3\b/, "toạ độ/H3 không được ở JSX");
  const src = code("simulation/presenter.ts");
  const idx = src.indexOf("technicalRows");
  assert.ok(idx > 0);
  assert.ok(
    src.indexOf("toFixed(5)") > idx,
    "toạ độ chỉ được định dạng bên trong khối kỹ thuật",
  );
});

// CẬP NHẬT CÓ KHAI BÁO (vòng 2.1 §0.3, §3): IA vòng 1 đặt "Khu vực liên quan" và "Cần
// kiểm tra tiếp" là section chính; vòng 2.1 ĐẢO NGƯỢC có chủ đích — cả hai xuống
// disclosure, banner V1 lên đầu, để V1+V2+V3 nằm trọn trong fold (AC-01).
test("§3 (vòng 2.1): thứ tự tiết trong JSX đúng IA mới V1→V2→V3→V4→5 disclosure", () => {
  const panel = code("ui/SimulationPanel.tsx");
  const order = [
    'block="v1"', // banner sàng lọc
    "ruleBanner", // (đã gọi ở trên, nhưng banner render trong v1)
    'block="v2"', // hero tiles
    "UNRESOLVED_HEADING",
    "DISTRIBUTION_HEADING", // v3
    "STATION_CONTEXT_HEADING", // v4
    "localityDisclosureSummary",
    "NEXT_EVIDENCE_HEADING",
    "nearbyStationsSummary",
    "METHOD_SUMMARY",
    "TECHNICAL_SUMMARY",
  ];
  // `ruleBanner` xuất hiện lần đầu ở import — tìm từ phần thân return.
  const body = panel.slice(panel.indexOf("return ("));
  let cursor = -1;
  for (const token of order.filter((t) => t !== "ruleBanner")) {
    const at = body.indexOf(token, cursor + 1);
    assert.ok(at > cursor, `tiết "${token}" nằm sai thứ tự trong IA vòng 2.1`);
    cursor = at;
  }
});

// CẬP NHẬT CÓ KHAI BÁO (vòng 2.1 §0.3): 3 disclosure vòng 1 + 2 tiết chuyển xuống = 5.
test("UX-SIM-11 (vòng 2.1): NĂM disclosure đều đóng mặc định", () => {
  const panel = code("ui/SimulationPanel.tsx");
  const details = panel.match(/<details/g) ?? [];
  assert.equal(
    details.length,
    5,
    "khu vực liên quan · cần kiểm tra tiếp · trạm lân cận · phương pháp · chi tiết vị trí",
  );
  assert.match(panel, /React\.useState\(false\)/);
  assert.doesNotMatch(panel, /<details\s+open(\s|>)/, "không disclosure nào mở sẵn");
});

test("§14.3: panel KHÔNG gọi selectEntity — selection thật sẽ xoá ứng viên", () => {
  const panel = code("ui/SimulationPanel.tsx");
  assert.doesNotMatch(panel, /selectEntity|selectCell/);
  // `flyTo` phải được gọi với ĐÚNG một tham số: tham số thứ hai ghi selection.
  assert.match(panel, /flyTo\(\{ \.\.\.view, lng: next\.lng, lat: next\.lat, zoom: next\.zoom \}\)/);
});

test("UX-SIM-01 (QA vòng 2.1): thẻ mô phỏng giữ bề rộng, nới trần dọc có khai báo", () => {
  const card = code("components/atlas/EvidenceCard.tsx");
  const simSurface = card.slice(card.indexOf("if ((candidate || simError) && !selection)"));
  assert.match(simSurface, /w-\[320px\] max-h-\[72%\]/);
  assert.match(simSurface, /min-\[1440px\]:w-\[340px\]/);
  assert.doesNotMatch(simSurface, /w-\[380px\]|max-h-\[75%\]/, "không khôi phục biến thể rộng cũ");
});

test("§14.2: EvidenceCard chỉ in số khi kết quả khớp ứng viên hiện tại", () => {
  const card = code("components/atlas/EvidenceCard.tsx");
  assert.match(card, /simResultKey === candidateKeyOf\(candidate\)/);
  assert.match(card, /result=\{coherentResult\}/);
  // Store cũng phải xoá kết quả ngay lúc ứng viên đổi — hai lớp gác, không một.
  const store = code("simulation/store.ts");
  // Cắt từ phần THÂN, không phải từ khai báo interface: `indexOf` trần sẽ dừng ở dòng
  // interface và test vẫn "xanh" trong khi thân hàm không có gì.
  const body = store.slice(store.indexOf("useSimulationStore = create"));
  const setCandidate = body.slice(
    body.indexOf("setCandidate: (candidate"),
    body.indexOf("clearCandidate: () =>"),
  );
  assert.match(setCandidate, /result: null/);
  assert.match(setCandidate, /resultKey: null/);
});

test("§14.6: đóng mô phỏng trả focus về đúng nav trigger", () => {
  const nav = code("components/atlas/NavRail.tsx");
  const card = code("components/atlas/EvidenceCard.tsx");
  assert.match(nav, /id="simulation-placement-trigger"/);
  assert.match(card, /getElementById\("simulation-placement-trigger"\)/);
  assert.match(card, /simulationTrigger\.focus\(\)/);
});

test("F1/F3 không dựng CTA retry vô hiệu; chỉ F10 có Thử lại/Xóa vị trí", () => {
  const panel = code("ui/SimulationPanel.tsx");
  const card = code("components/atlas/EvidenceCard.tsx");
  assert.match(panel, /errorKind === "query"/);
  assert.match(card, /errorKind=\{simErrorKind\}/);
  const store = code("simulation/store.ts");
  assert.match(store, /errorKind: "admission"/);
  assert.match(store, /errorKind: "query"/);
});

test("§16.1: truy vấn vùng chỉ thêm ĐÚNG một cột, không `SELECT *`", () => {
  const q = code("simulation/zone-query.ts");
  assert.match(q, /commune_code, commune_name/);
  assert.doesNotMatch(q, /SELECT \*/);
  // `toStr` giữ null; không có giá trị thay thế nào cho tên vắng.
  assert.match(q, /commune_name: toStr\(communeName\.get\(r\)\)/);
  assert.doesNotMatch(q, /\?\? "Ô H3"/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Vòng 2.1 — docs/UX_SIMULATION_DECISION_CONTEXT_SPEC.md §12.1
// Banner sàng lọc, hero tiles, stationContextModel, dòng delta, bất biến phân hoạch.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  HERO_IMPROVED_ZERO_NOTE,
  HERO_UNCERTAIN_ZERO_NOTE,
  RULE_BANNER_FOOTER,
  RULE_EQUALITY_NOTE,
  RULE_EXCEPTION_UNAVAILABLE_NOTE,
  RULE_NEAREST_UNMEASURED_NOTE,
  RULE_NOT_COMPUTABLE_DETAIL,
  STATION_CONTEXT_EMPTY,
  bandDeltaText,
  formatUtilPercent,
  heroTilesModel,
  localityDisclosureSummary,
  ruleBanner,
  stationContextModel,
} from "../src/simulation/presenter";
import type { ContextStation, SimulationResult } from "../src/simulation/types";

// ── §6.1 Banner — copy deck nguyên văn cho 5 RuleState + bằng ngưỡng + AC-11 ──

test("vòng 2.1 §6.1: BASE_PASS — badge phép kiểm + dòng cự ly ba số một đơn vị", () => {
  const b = ruleBanner(ev()); // Xã, d=3105, t=2000, m=1105 — số THẬT Tây Phương
  assert.equal(b.state, "BASE_PASS");
  assert.equal(b.icon, "pass");
  assert.equal(b.badge, "ĐẠT SÀNG LỌC KHOẢNG CÁCH");
  assert.equal(b.distanceLine, "3,1 km chim bay · ngưỡng Xã 2,0 km · cao hơn ngưỡng 1,1 km");
  assert.deepEqual(b.notes, []);
  assert.equal(b.footer, RULE_BANNER_FOOTER);
});

test("vòng 2.1 §6.1: CONDITIONAL_DC — badge có điều kiện + dòng ngoại lệ kích hoạt", () => {
  const b = ruleBanner(
    ev({
      distanceM: 1200,
      marginM: -800,
      nearestHighLoad: true,
      nearestUtilReportable: true,
      nearestUtil: 0.55,
    }),
  );
  assert.equal(b.state, "CONDITIONAL_DC");
  assert.equal(b.icon, "conditional");
  assert.equal(b.badge, "ĐẠT CÓ ĐIỀU KIỆN: CẦN SẠC DC");
  assert.equal(b.distanceLine, "1,2 km chim bay · ngưỡng Xã 2,0 km · thấp hơn ngưỡng 0,8 km");
  assert.deepEqual(b.notes, [
    "Ngoại lệ kích hoạt: trạm gần nhất đang cao tải 55% (≥40%), trên sàn 0,5 km.",
  ]);
});

test("vòng 2.1 §6.1 + AC-06: BASE_FAIL Phường — thấp hơn ngưỡng, KHÔNG dòng ngoại lệ", () => {
  const b = ruleBanner(
    ev({ kind: "PHUONG", thresholdM: 500, distanceM: 360, marginM: -140, nearestHighLoad: true }),
  );
  assert.equal(b.state, "BASE_FAIL");
  assert.equal(b.icon, "fail");
  assert.equal(b.badge, "KHÔNG ĐẠT SÀNG LỌC");
  assert.equal(b.distanceLine, "0,4 km chim bay · ngưỡng Phường 0,5 km · thấp hơn ngưỡng 0,1 km");
  // Phường không có nhánh ngoại lệ — không một dòng phụ nào (AC-06).
  assert.deepEqual(b.notes, []);
  // Ba số cùng đơn vị km — KHÔNG in ngoặc mét.
  assert.doesNotMatch(b.distanceLine!, /\d m\b|\(/);
});

test("vòng 2.1 §6.1 + AC-07: bằng ngưỡng ⇒ KHÔNG ĐẠT + câu equality", () => {
  const b = ruleBanner(ev({ distanceM: 2000, marginM: 0 }));
  assert.equal(b.state, "BASE_FAIL");
  assert.equal(b.badge, "KHÔNG ĐẠT SÀNG LỌC");
  assert.equal(b.distanceLine, "2,0 km chim bay · ngưỡng Xã 2,0 km · bằng ngưỡng");
  assert.ok(b.notes.includes(RULE_EQUALITY_NOTE));
});

test("vòng 2.1 §6.1: BASE_FAIL_EXCEPTION_UNAVAILABLE — cùng badge KHÔNG ĐẠT + dòng phụ F6", () => {
  const b = ruleBanner(ev({ distanceM: 1500, marginM: -500, highLoadEvaluable: false }));
  assert.equal(b.state, "BASE_FAIL_EXCEPTION_UNAVAILABLE");
  assert.equal(b.icon, "fail");
  assert.equal(b.badge, "KHÔNG ĐẠT SÀNG LỌC");
  assert.deepEqual(b.notes, [RULE_EXCEPTION_UNAVAILABLE_NOTE]);
});

test("vòng 2.1 §6.1: NOT_COMPUTABLE — không phải \"không đạt\", không dòng cự ly", () => {
  const noKind = ruleBanner(ev({ kind: null, thresholdM: null, marginM: null }));
  assert.equal(noKind.state, "NOT_COMPUTABLE");
  assert.equal(noKind.icon, "unknown");
  assert.equal(noKind.badge, "KHÔNG KẾT LUẬN ĐƯỢC: THIẾU DỮ LIỆU");
  assert.equal(noKind.distanceLine, null);
  assert.deepEqual(noKind.notes, [RULE_NOT_COMPUTABLE_DETAIL]);
  assert.doesNotMatch(noKind.badge, /KHÔNG ĐẠT/);

  const noStation = ruleBanner(ev({ distanceM: null, marginM: null }));
  assert.equal(noStation.badge, "KHÔNG KẾT LUẬN ĐƯỢC: THIẾU DỮ LIỆU");
  assert.equal(noStation.distanceLine, null);
});

test("vòng 2.1 AC-11: Xã trong dải ngoại lệ + trạm gần nhất chưa đo ⇒ dòng phụ, phán quyết GIỮ KHÔNG ĐẠT", () => {
  const e = ev({ distanceM: 1500, marginM: -500, highLoadEvaluable: true, nearestUtilReportable: false });
  const b = ruleBanner(e);
  assert.equal(b.state, "BASE_FAIL");
  assert.ok(b.notes.includes(RULE_NEAREST_UNMEASURED_NOTE));
  // Parity: replayScreening vẫn TU_CHOI — dòng phụ KHÔNG đổi phán quyết.
  assert.equal(replayScreening(1500, "XA", false).decision, "TU_CHOI");

  // Chiều âm: trạm gần nhất CÓ phép đo (nhưng không cao tải) ⇒ không dòng phụ này.
  const measured = ruleBanner(
    ev({ distanceM: 1500, marginM: -500, nearestUtilReportable: true, nearestUtil: 0.2 }),
  );
  assert.ok(!measured.notes.includes(RULE_NEAREST_UNMEASURED_NOTE));
  // Dưới sàn 500 m: ngoài dải ngoại lệ ⇒ cũng không.
  const below = ruleBanner(ev({ distanceM: 480, marginM: -1520 }));
  assert.ok(!below.notes.includes(RULE_NEAREST_UNMEASURED_NOTE));
});

test("vòng 2.1 §6.1 (property): badge banner LUÔN khớp phán quyết replayScreening", () => {
  for (const kind of ["PHUONG", "XA", "DAC_KHU"] as const) {
    for (const d of [0, 100, 499, 500, 501, 1500, 1999, 2000, 2001, 5000]) {
      for (const highLoad of [false, true]) {
        for (const evaluable of [false, true]) {
          const replay = replayScreening(d, kind, evaluable && highLoad);
          const b = ruleBanner(
            ev({
              distanceM: d,
              thresholdM: SCREENING_THRESHOLDS[kind],
              marginM: replay.marginM,
              kind,
              nearestHighLoad: highLoad,
              highLoadEvaluable: evaluable,
            }),
          );
          const want =
            replay.decision === "DE_XUAT"
              ? "ĐẠT SÀNG LỌC KHOẢNG CÁCH"
              : replay.decision === "DE_XUAT_NEU_CO_DC"
                ? "ĐẠT CÓ ĐIỀU KIỆN: CẦN SẠC DC"
                : "KHÔNG ĐẠT SÀNG LỌC";
          assert.equal(b.badge, want, `${kind} d=${d} hl=${highLoad} ev=${evaluable}`);
        }
      }
    }
  }
});

test("vòng 2.1 AC-04: không ngôn ngữ phê duyệt/đề xuất/khuyến nghị ở bất kỳ badge/nốt nào", () => {
  const states = [
    ev(),
    ev({ distanceM: 1200, marginM: -800, nearestHighLoad: true, nearestUtilReportable: true, nearestUtil: 0.55 }),
    ev({ kind: "PHUONG" as const, thresholdM: 500, distanceM: 360, marginM: -140 }),
    ev({ distanceM: 2000, marginM: 0 }),
    ev({ distanceM: 1500, marginM: -500, highLoadEvaluable: false }),
    ev({ kind: null, thresholdM: null, marginM: null }),
  ];
  for (const e of states) {
    const b = ruleBanner(e);
    const all = [b.badge, b.distanceLine ?? "", ...b.notes, b.footer].join(" ");
    for (const banned of ["phê duyệt", "đề xuất", "khuyến nghị", "nên đầu tư", "ĐỀ XUẤT", "TỪ CHỐI"]) {
      assert.ok(!all.includes(banned), `banner chứa từ cấm "${banned}": ${all}`);
    }
  }
});

// ── §6.2 Hero tiles — hai lớp không cộng gộp, zero-state không dấu ~ ──────────

test("vòng 2.1 §6.2: hero tiles đúng copy, phân cấp readout/display, không cộng gộp", () => {
  const mk = (imp: [number, number], unc: [number, number]) =>
    heroTilesModel({
      after: {
        improved: { cells: imp[0], population: imp[1] },
        uncertain: { cells: unc[0], population: unc[1] },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  const [a, b] = mk([12, 31746], [6, 2947]);
  assert.deepEqual(a, {
    label: "Cải thiện rõ rệt",
    value: "~31.746",
    unit: "người",
    note: "trong 12 ô",
    emphasis: "readout",
  });
  assert.deepEqual(b, {
    label: "Trong biên sai số",
    value: "~2.947",
    unit: "người",
    note: "trong 6 ô",
    emphasis: "display",
  });
  // 34.693 = tổng hai lớp — không được xuất hiện ở đâu.
  assert.ok(!`${a.value}${b.value}`.includes("34.693"));

  // Zero-state: `0` KHÔNG dấu ~ (0 ô là chính xác, không phải ước lượng).
  const [za, zb] = mk([0, 0], [0, 0]);
  assert.equal(za.value, "0");
  assert.equal(za.note, HERO_IMPROVED_ZERO_NOTE);
  assert.equal(zb.value, "0");
  assert.equal(zb.note, HERO_UNCERTAIN_ZERO_NOTE);
});

// ── §6.4 + §4 stationContextModel — phân hoạch 3 nhóm, AC-08 hai chiều ────────

function ctxOf(stations: ContextStation[], kind: "XA" | "PHUONG" | "DAC_KHU" | null = "XA") {
  return stationContextModel({
    context: { stationsWithin5km: stations },
    screening: { evidence: { kind } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as SimulationResult);
}

function mkSt(code: string, euclidM: number, util: number | null): ContextStation {
  return {
    code,
    name: `Trạm ${code}`,
    euclidM,
    nPorts: null,
    powerKw: null,
    util,
    grade: util === null ? null : "GOOD",
    window: null,
  };
}

test("vòng 2.1 §4 golden Tây Phương: 13 trạm, 13/13 đo, 6 cao tải, gần nhất 3,1 km · 0%", () => {
  const stations = [
    mkSt("C.HNO1687", 3125, 0), // util 0,0% LÀ PHÉP ĐO HỢP LỆ
    ...Array.from({ length: 6 }, (_, i) => mkSt(`H${i}`, 3500 + i * 100, 0.45 + i * 0.05)),
    ...Array.from({ length: 6 }, (_, i) => mkSt(`L${i}`, 4200 + i * 100, 0.1 + i * 0.04)),
  ];
  const m = ctxOf(stations);
  assert.deepEqual(m.counts, {
    total: 13,
    within500: 0,
    within2km: 0,
    high: 6,
    low: 7,
    unassessed: 0,
    measured: 13,
  });
  assert.equal(m.radiusLine, "Trong 2 km (ngưỡng Xã): 0 trạm · Trong 5 km: 13 trạm");
  // Phân đoạn 0 trạm KHÔNG có mặt (AC-03) — Tây Phương chỉ có hai phân đoạn.
  assert.deepEqual(
    m.segments.map((s) => [s.key, s.count, s.label]),
    [
      ["high", 6, "6 cao tải ≥40%"],
      ["low", 7, "7 dưới 40%"],
    ],
  );
  assert.equal(m.measuredLine, "Có phép đo hợp lệ: 13/13 trạm");
  // AC-08 chiều BẮT BUỘC: util 0 đo được in "0%".
  assert.equal(m.nearestLine, "Trạm gần nhất: Trạm C.HNO1687 (3,1 km · mức tải 0%)");
  assert.match(m.ariaLabel, /13 trạm đủ điều kiện; 13 có phép đo hợp lệ, gồm 6 cao tải từ 40% trở lên và 7 dưới 40%; 0 chưa đánh giá được\./);
});

test("vòng 2.1 AC-08 chiều cấm: trạm chưa đo KHÔNG in 0%, vào phân đoạn chưa đánh giá", () => {
  const m = ctxOf([mkSt("U1", 900, null), mkSt("U2", 2500, null)]);
  assert.deepEqual(
    m.segments.map((s) => [s.key, s.count]),
    [["unassessed", 2]],
  );
  assert.equal(m.segments[0]!.share, 1);
  assert.equal(m.measuredLine, "Có phép đo hợp lệ: 0/2 trạm");
  assert.equal(m.nearestLine, "Trạm gần nhất: Trạm U1 (0,9 km · chưa có phép đo hợp lệ)");
  assert.ok(!m.nearestLine!.includes("0%"), "phép đo vắng không được in 0%");
});

test("vòng 2.1 §6.4: 0 trạm trong 5 km — không segment, không nearest", () => {
  const m = ctxOf([]);
  assert.equal(m.counts.total, 0);
  assert.deepEqual(m.segments, []);
  assert.equal(m.nearestLine, null);
  assert.equal(m.measuredLine, "Có phép đo hợp lệ: 0/0 trạm");
  // Copy của trạng thái rỗng tồn tại cho component.
  assert.equal(STATION_CONTEXT_EMPTY, "Không có trạm đủ điều kiện nào trong phạm vi 5 km.");
});

test("vòng 2.1 AC-06 (§7): dòng bán kính thích ứng theo kind", () => {
  const st = [mkSt("A", 300, 0.5), mkSt("B", 1500, null), mkSt("C", 4000, 0.1)];
  assert.equal(
    ctxOf(st, "XA").radiusLine,
    "Trong 2 km (ngưỡng Xã): 2 trạm · Trong 5 km: 3 trạm",
  );
  assert.equal(
    ctxOf(st, "PHUONG").radiusLine,
    "Trong 0,5 km (ngưỡng Phường): 1 trạm · Trong 2 km (bối cảnh, không phải ngưỡng): 2 trạm · Trong 5 km: 3 trạm",
  );
  assert.equal(
    ctxOf(st, "DAC_KHU").radiusLine,
    "Trong 0,5 km (ngưỡng Đặc khu): 1 trạm · Trong 2 km (bối cảnh, không phải ngưỡng): 2 trạm · Trong 5 km: 3 trạm",
  );
  // Kind không xác định: không gọi mốc nào là "ngưỡng".
  assert.equal(ctxOf(st, null).radiusLine, "Trong 2 km: 2 trạm · Trong 5 km: 3 trạm");
});

test("vòng 2.1 AC-05 (property, LCG có seed): bất biến phân hoạch trên 200 điểm thử", () => {
  // LCG thuần — KHÔNG Math.random (spec §12.1): tái lập được từng ca hỏng theo seed.
  let seed = 20260821;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let trial = 0; trial < 200; trial++) {
    const n = Math.floor(rnd() * 20);
    const stations = Array.from({ length: n }, (_, i) => {
      const euclid = Math.round(rnd() * 5000);
      const util = rnd() < 0.3 ? null : Math.round(rnd() * 100) / 100;
      return mkSt(`S${trial}_${i}`, euclid, util);
    });
    const m = ctxOf(stations);
    const c = m.counts;
    // §4.2 — N₅ₖₘ == cao tải + dưới 40% + chưa đánh giá, 100% điểm thử.
    assert.equal(c.high + c.low + c.unassessed, c.total, `trial ${trial}: phân hoạch vỡ`);
    assert.equal(c.measured, c.high + c.low);
    // §4.3 — bán kính lồng nhau.
    assert.ok(c.within500 <= c.within2km && c.within2km <= c.total, `trial ${trial}: bán kính`);
    // AC-03 — không phân đoạn 0; tổng share = 1 khi có trạm.
    for (const s of m.segments) assert.ok(s.count > 0, `trial ${trial}: segment 0 render`);
    if (c.total > 0) {
      const share = m.segments.reduce((s, x) => s + x.share, 0);
      assert.ok(Math.abs(share - 1) < 1e-9, `trial ${trial}: share ${share}`);
    } else {
      assert.deepEqual(m.segments, []);
    }
    // Util 0 đo được LUÔN thuộc "dưới 40%" — không nhóm nào nuốt nó sang chưa đánh giá.
    const zeros = stations.filter((s) => s.util === 0).length;
    assert.ok(c.low >= zeros, `trial ${trial}: util 0 đo được rơi khỏi nhóm dưới 40%`);
  }
});

// ── §6.3 + AC-10 dòng delta ───────────────────────────────────────────────────

test("vòng 2.1 AC-10: Σdelta bốn dải = 0, chữ không dấu `+`, deltaText khớp bảng", () => {
  const m = distributionModel(run());
  assert.equal(m.table.reduce((s, r) => s + r.delta, 0), 0);
  for (const r of m.table) {
    assert.equal(r.deltaText, bandDeltaText(r.delta));
    assert.ok(!r.deltaText.includes("+"), "delta không dùng dấu +");
  }
  assert.equal(bandDeltaText(0), "0");
  assert.equal(bandDeltaText(1234), "~thêm 1.234");
  assert.equal(bandDeltaText(-987), "~bớt 987");
  // Figcaption mang cả 4 delta (§6.3).
  for (const r of m.table) assert.ok(m.summary.includes(`(thay đổi ${r.deltaText})`));
});

test("vòng 2.1: formatUtilPercent — 0 đo được in \"0\", làm tròn nguyên vi-VN", () => {
  assert.equal(formatUtilPercent(0), "0");
  assert.equal(formatUtilPercent(0.55), "55");
  assert.equal(formatUtilPercent(0.999), "100");
});

// ── Bất biến nguồn — IA mới, không hex mới, chuỗi cấm ─────────────────────────

test("vòng 2.1 §0.4: không hex mới trong ba file UI mô phỏng", () => {
  for (const rel of ["ui/SimulationPanel.tsx", "simulation/presenter.ts"]) {
    assert.doesNotMatch(code(rel), /#[0-9a-fA-F]{3,8}\b/, `${rel} chứa hex trần`);
  }
  // SimulationDistribution chỉ được lấy hex từ THEME_PALETTES (ramp đã đăng ký).
  const distSrc = code("ui/SimulationDistribution.tsx");
  assert.doesNotMatch(distSrc, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(distSrc, /THEME_PALETTES\.accessibility/);
  const panel = code("ui/SimulationPanel.tsx");
  assert.match(panel, /THEME_PALETTES\.utilization/);
  assert.match(panel, /data-sim-seglegend/);
  assert.doesNotMatch(panel, /flexBasis: "auto"/, "V4 không để độ dài nhãn làm sai tỷ lệ bar");
});

test("vòng 2.1 §3: summary disclosure khu vực liên quan mang số đếm", () => {
  assert.equal(localityDisclosureSummary(4), "Khu vực liên quan (4 xã/phường)");
  assert.equal(localityDisclosureSummary(0), "Khu vực liên quan (0 xã/phường)");
});

test("vòng 2.1 AC-04 (nguồn): panel không chứa chuỗi phê duyệt/đề xuất/khuyến nghị", () => {
  const panel = code("ui/SimulationPanel.tsx");
  for (const banned of ["phê duyệt", "đề xuất", "khuyến nghị", "nên đầu tư", "ĐỀ XUẤT"]) {
    assert.ok(!panel.includes(banned), `panel chứa "${banned}"`);
  }
  // V4 dùng segmented bar có role img + aria-label tổng hợp (§9.2).
  assert.match(panel, /data-sim-segbar/);
  assert.match(panel, /aria-label=\{stationContext\.ariaLabel\}/);
});

// ── QA typography/màu vòng 2.1b (21/8/2026) ───────────────────────────────────
// Ba quyết định hệ thống, mỗi cái khoá bằng một bất biến nguồn đọc được:
//   1. tiêu đề tiết ≠ tag xuất xứ (trước đây CẢ HAI là `.eyebrow`: 10px/600/0,8px/muted);
//   2. sắc trạng thái chỉ sống ở V1, và mỗi trạng thái lấy BA bậc của MỘT ramp;
//   3. số và đơn vị là một khối không chẻ được.

test("vòng 2.1b: tiêu đề tiết và tag xuất xứ là HAI vai trò chữ, không phải một", () => {
  const panel = code("ui/SimulationPanel.tsx");
  assert.match(panel, /const HEADING_CLASS = "[^"]*font-semibold[^"]*text-ink-2"/);
  assert.match(panel, /const TAG_CLASS = "[^"]*font-medium[^"]*text-ink-muted"/);
  // Hai lớp phải KHÁC nhau ở cả ba kênh: cân nặng, giãn chữ, mực.
  const heading = panel.match(/const HEADING_CLASS = "([^"]*)"/)![1]!;
  const tag = panel.match(/const TAG_CLASS = "([^"]*)"/)![1]!;
  for (const [a, b] of [
    ["font-semibold", "font-medium"],
    ["tracking-[0.08em]", "tracking-[0.06em]"],
    ["text-ink-2", "text-ink-muted"],
  ]) {
    assert.ok(heading.includes(a!), `HEADING_CLASS thiếu ${a}`);
    assert.ok(tag.includes(b!), `TAG_CLASS thiếu ${b}`);
  }
  // Không còn chỗ nào trong panel dùng `.eyebrow` cho tag xuất xứ (nhãn ô hero thì còn).
  assert.doesNotMatch(panel, /className="eyebrow shrink-0"/);
});

test("vòng 2.1b: sắc trạng thái chỉ ở V1 — BA bậc của MỘT ramp, hero tiles vô sắc", () => {
  const panel = code("ui/SimulationPanel.tsx");
  // accent = bậc 4, wash = CÙNG bậc 4 ở alpha thấp, chữ/icon = bậc 6.
  const tone = panel.slice(panel.indexOf("function bannerTone"));
  assert.match(tone.slice(0, 400).replace(/\s+/g, " "), /accent: ramp\.hex\[4\]!/);
  assert.match(tone.slice(0, 400).replace(/\s+/g, " "), /wash: withAlpha\(ramp\.hex\[4\]!, 0\.09\)/);
  assert.match(tone.slice(0, 400).replace(/\s+/g, " "), /ink: ramp\.hex\[6\]!/);
  // "Không kết luận được" KHÔNG có sắc nào: nó không phải một phán quyết.
  const at = panel.indexOf("unknown: {");
  const unknown = panel.slice(at, panel.indexOf("};", at));
  assert.doesNotMatch(unknown, /THEME_PALETTES/);
  assert.match(unknown, /var\(--color-ink-muted\)/);
  // Hero tiles không còn bảng màu riêng: phân cấp đi bằng cỡ số + nét + nền.
  assert.doesNotMatch(panel, /HERO_TONE/, "ô hero không được mang sắc của phán quyết");
  assert.match(panel, /border-ink bg-basemap/);
  assert.match(panel, /border-dashed border-ink-muted/);
});

test("vòng 2.1b: số và đơn vị không bị ngắt dòng tách nhau", () => {
  const panel = code("ui/SimulationPanel.tsx");
  assert.match(panel, /const UNIT_TOKEN = \/\(/);
  assert.match(panel, /function keepUnits/);
  for (const line of [
    "keepUnits(banner.distanceLine)",
    "keepUnits(stationContext.radiusLine)",
    "keepUnits(stationContext.nearestLine)",
  ]) {
    assert.ok(panel.includes(line), `dòng dữ kiện chưa qua keepUnits: ${line}`);
  }
  // Hàm chỉ BỌC token, không viết chữ: không một chuỗi tiếng Việt nào trong thân hàm.
  const at = panel.indexOf("function keepUnits");
  const body = panel.slice(at, panel.indexOf("\n}", at));
  assert.doesNotMatch(body, /"[^"]*[àáảãạăâđêôơư][^"]*"/i);
});

test("vòng 2.1b: chú giải dải và dòng Δ dùng chung một lưới bốn cột neo vào bar", () => {
  const dist = code("ui/SimulationDistribution.tsx");
  const grids = dist.match(/grid-cols-4/g) ?? [];
  assert.equal(grids.length, 2, "chú giải và Δ phải cùng lưới bốn cột");
  // Rail 32 px (`w-8`) + gap 8 px = đúng mép trái bar của `Bar()`; không còn `pl-10`
  // cho chú giải và `justify-between` cho Δ — hai nhịp khác nhau trên cùng một trục.
  assert.doesNotMatch(dist, /pl-10/);
  assert.doesNotMatch(dist, /justify-between/);
  assert.equal((dist.match(/w-8 shrink-0/g) ?? []).length, 3, "Trước · Sau · Δ/km cùng một rail");
});
