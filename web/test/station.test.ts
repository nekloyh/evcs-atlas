/**
 * Panel TRẠM · khoá `c=station:` · chế độ DỮ LIỆU — M4.1 và M4.2.
 *
 * Vì sao có file này: cả ba thứ dưới đây là **quy tắc**, không phải phân bố (§12). Ảnh chụp
 * chứng minh được rằng một trạm cụ thể mở đúng panel; nó không chứng minh được rằng mọi mã
 * hỏng đều bị bỏ RIÊNG khoá đó, rằng `s` luôn thắng `d`, hay rằng hồ sơ theo dạng nhịp gộp
 * bằng trọng số cổng chứ không bằng trung bình các tỉ lệ.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSelection, serializeSelection, stationIdOf } from "../src/data/h3.ts";
import { isInScope } from "../src/data/scope.ts";
import { parseHash, serializeHash } from "../src/state/hash.ts";
import { HOURS_IN_WEEK, tOf } from "../src/state/types.ts";
import type { HashState } from "../src/state/types.ts";
import {
  hourProfile,
  shapeDayProfiles,
  stationSeries,
  type CityHour,
  type OccProfiles,
} from "../src/viz/occ.ts";
import { isAbnormal, statusIconSize, statusRingRadius } from "../src/viz/station-status.ts";

// ── Khoá `c=station:<station_id>` — §9, §8a ────────────────────────────────────

test("`station:` đọc ra một lựa chọn TRẠM, và vòng chuỗi hoá là nghịch đảo đúng", () => {
  const raw = "station:vn-c-ac000091";
  const sel = parseSelection(raw);
  assert.deepEqual(sel, { kind: "station", id: "vn-c-ac000091" });
  assert.equal(serializeSelection(sel!), raw);
  assert.equal(stationIdOf(raw), "vn-c-ac000091");
});

test("mã trạm sai hình dạng bị bỏ — hash là dữ liệu lạ, không phải dữ liệu tin được", () => {
  // Chữ HOA, dấu cách, dấu phẩy, tiếng Việt có dấu: đúng những thứ có trong `station_code`
  // và là lý do khoá `c` mang `station_id` chứ không mang `station_code`.
  for (const bad of [
    "station:VN-C-AC000091",
    "station:CONGDONG-Anh Chiến, Thường Tín",
    "station:",
    "station:a b",
    "station:trạm",
  ]) {
    assert.equal(parseSelection(bad), null, bad);
    assert.equal(stationIdOf(bad), null, bad);
  }
});

test("mã trạm hỏng chỉ làm rụng khoá `c`, không kéo theo khoá nào khác", () => {
  const h = parseHash("#f=population&c=station:KHONG HOP LE&t=46");
  assert.equal(h.cell, undefined);
  assert.equal(h.field, "population");
  assert.equal(h.t, 46);
});

test("`station:` KHÔNG bị nhầm thành mã H3 hay mã xã", () => {
  assert.equal(parseSelection("station:vn-c-ac000091")?.kind, "station");
  assert.equal(parseSelection("commune:00004")?.kind, "commune");
  assert.equal(parseSelection("8b65b1c1b1c1fff")?.kind, "cell");
});

// ── Khoá `d` — chế độ DỮ LIỆU (§3f, M4.2) ──────────────────────────────────────

const VIEW = { lng: 105.84, lat: 21, zoom: 9.3, pitch: 0, bearing: 0 };
const BASE: HashState = {
  field: "population",
  mode: "2d",
  view: VIEW,
  layers: [],
  cell: null,
  scene: null,
  paintOn: true,
  dataMode: false,
  t: 0,
  brush: {},
};

test("`d=1` bật chế độ DỮ LIỆU; giá trị khác bị bỏ như mọi khoá hỏng", () => {
  assert.equal(parseHash("#d=1").dataMode, true);
  for (const bad of ["#d=0", "#d=", "#d=true", "#d=2"]) {
    assert.equal(parseHash(bad).dataMode, undefined, bad);
  }
});

test("`s` THẮNG `d` — hai chế độ cùng lúc không tồn tại được trong state", () => {
  const h = parseHash("#s=von-cuc&d=1");
  assert.equal(h.scene, "von-cuc");
  assert.equal(h.dataMode, undefined);
});

test("chiều RA không bao giờ ghi cả `s` lẫn `d`", () => {
  const withScene = serializeHash({ ...BASE, scene: "von-cuc", dataMode: true });
  assert.match(withScene, /(^|&)s=von-cuc(&|$)/);
  assert.doesNotMatch(withScene, /(^|&)d=/);

  const withData = serializeHash({ ...BASE, dataMode: true });
  assert.match(withData, /(^|&)d=1(&|$)/);
  assert.doesNotMatch(withData, /(^|&)s=/);
});

test("chế độ DỮ LIỆU vẫn GHI trạng thái bản đồ — bấm về BẢN ĐỒ phải trả đúng chỗ đã rời", () => {
  // Khác hẳn chế độ CÂU CHUYỆN, nơi cảnh SỞ HỮU `f`/`v`/`l` nên chúng không được ghi (§9a).
  const s = serializeHash({ ...BASE, dataMode: true, field: "detour_ratio", t: 46 });
  assert.match(s, /f=detour_ratio/);
  assert.match(s, /(^|&)v=/);
  assert.match(s, /(^|&)t=46(&|$)/);
  const back = parseHash(`#${s}`);
  assert.equal(back.dataMode, true);
  assert.equal(back.field, "detour_ratio");
  assert.equal(back.t, 46);
});

test("vòng đọc↔ghi của `d` hội tụ", () => {
  const once = serializeHash({ ...BASE, dataMode: true });
  const twice = serializeHash({ ...BASE, ...parseHash(`#${once}`), dataMode: true });
  assert.equal(once, twice);
});

// ── Tư cách trạm: neo vào BUFFER, không neo vào tên phạm vi ────────────────────

test("`isInScope` đúng ở CẢ HAI bộ dữ liệu — `HANOI` và `IN` đều là trong phạm vi", () => {
  // Bẫy đã sập: điều kiện cũ `=== "HANOI"` cho FALSE ở mọi trạm của mọi tỉnh (store toàn
  // quốc ghi `scope = 'IN'`), nên cả 30 chấm của Cao Bằng vẽ thành chấm rỗng "vành đệm" và
  // panel TRẠM ghi sai tư cách từng cái. Không lỗi nào — chỉ một bản đồ nói dối.
  assert.equal(isInScope("HANOI"), true);
  assert.equal(isInScope("IN"), true);
  assert.equal(isInScope("BUFFER"), false);
});

test("tên phạm vi LẠ vẫn đọc thành “trong phạm vi”, không thành vành đệm", () => {
  // Lệch về phía nào cũng phải là một quyết định. Chọn phía này vì `BUFFER` là khái niệm
  // HẸP và có định nghĩa (vành đệm 5 km ngoài ranh giới); mọi thứ khác là phạm vi chính.
  // Một bộ thứ ba đặt tên `PROVINCE` sẽ chạy đúng mà không phải sửa dòng nào.
  assert.equal(isInScope("PROVINCE"), true);
  assert.equal(isInScope(""), true);
});

// ── Vòng nét đứt — §4d-3a ──────────────────────────────────────────────────────

test("`UNKNOWN` KHÔNG mang vòng nét đứt — “không biết” ≠ “biết là hỏng”", () => {
  assert.equal(isAbnormal("MAINTENANCE"), true);
  assert.equal(isAbnormal("OUT_OF_SERVICE"), true);
  assert.equal(isAbnormal("OPERATIONAL"), false);
  // Đây là dòng đáng giá nhất của test này: vòng đứt là một KHẲNG ĐỊNH, còn `UNKNOWN` là
  // nguồn không nói gì. Ai "sửa" hàm này thành `!== "OPERATIONAL"` sẽ bị bắt ở đây.
  assert.equal(isAbnormal("UNKNOWN"), false);
  assert.equal(isAbnormal(""), false);
});

test("vòng trạng thái luôn RỘNG HƠN chấm, và cỡ icon là hàm đơn điệu của bán kính chấm", () => {
  let prev = -Infinity;
  for (const r of [2, 3, 4.5, 6]) {
    assert.ok(statusRingRadius(r) > r, `vòng phải bao ngoài chấm ở r=${r}`);
    const size = statusIconSize(r);
    assert.ok(size > prev, "cỡ icon không được giảm khi chấm to lên");
    // Icon phải chứa trọn đường tròn, nếu không nét bị xén ở bốn mép.
    assert.ok(size >= 2 * statusRingRadius(r), `icon r=${r} xén mất nét`);
    prev = size;
  }
});

// ── Hồ sơ 168h của MỘT trạm — §8a-3 ────────────────────────────────────────────

function make(nStations: number, ports: number[]): OccProfiles {
  const size = nStations * HOURS_IN_WEEK;
  return {
    occ: new Float32Array(size).fill(NaN),
    observed: new Float32Array(size).fill(NaN),
    nPorts: Float32Array.from(ports),
    n: nStations,
  };
}

function put(p: OccProfiles, s: number, t: number, occ: number, observed: number) {
  p.occ[s * HOURS_IN_WEEK + t] = occ;
  p.observed[s * HOURS_IN_WEEK + t] = observed;
}

test("`stationSeries` trả đúng 168 ô và giữ nguyên ba đường `null` của `stationOccAt`", () => {
  const p = make(1, [4]);
  put(p, 0, tOf(1, 22), 2, 4); // đủ quan sát ⇒ 0,5
  put(p, 0, tOf(2, 3), 2, 0.5); // dưới ngưỡng ⇒ null, KHÔNG phải một bậc nhạt
  const s = stationSeries(p, 0);
  assert.equal(s.length, HOURS_IN_WEEK);
  assert.equal(s[tOf(1, 22)], 0.5);
  assert.equal(s[tOf(2, 3)], null);
  assert.equal(s[0], null); // chưa từng có dòng nào
});

test("trạm khuyết `n_ports` cho 168 ô null — không có mẫu số thì không có tỉ số", () => {
  const p = make(1, [NaN]);
  put(p, 0, 0, 2, 4);
  assert.ok(stationSeries(p, 0).every((v) => v === null));
});

// ── Hồ sơ biên 24 giờ — mục 10 ─────────────────────────────────────────────────

const city = (t: number, value: number | null): CityHour => ({
  t,
  value,
  observedH: 3,
  nStations: 10,
});

test("`hourProfile` gộp 7 thứ thành 24 cột, và `null` KHÔNG kéo trung bình xuống", () => {
  const cells: CityHour[] = [];
  for (let d = 0; d < 7; d++) cells.push(city(tOf(d, 9), d === 0 ? null : 0.4));
  const bands = hourProfile(cells);
  assert.equal(bands.length, 24);
  const at9 = bands[9]!;
  // 6 thứ có giá trị 0,4; thứ thiếu KHÔNG được tính là 0 (nếu tính thì trung bình ra 0,343).
  assert.equal(at9.n, 6);
  // So bằng sai số: trung bình là một phép chia dấu phẩy động, và con số SAI mà test này
  // chặn (0,343 — nếu thứ thiếu bị tính là 0) cách 0,4 xa hơn sai số nhiều bậc.
  assert.ok(Math.abs(at9.mid! - 0.4) < 1e-9, `mid = ${at9.mid}`);
  assert.equal(at9.lo, 0.4);
  assert.equal(at9.hi, 0.4);
});

test("dải lo–hi là thấp nhất và cao nhất THẬT trong tuần tại giờ đó", () => {
  const cells = [city(tOf(0, 22), 0.1), city(tOf(3, 22), 0.5), city(tOf(6, 22), 0.3)];
  const b = hourProfile(cells)[22]!;
  assert.equal(b.lo, 0.1);
  assert.equal(b.hi, 0.5);
  assert.equal(b.n, 3);
  assert.ok(Math.abs(b.mid! - 0.3) < 1e-9);
});

test("giờ không có giá trị nào giữ `mid`/`lo`/`hi` là null — không thành 0", () => {
  const b = hourProfile([city(tOf(0, 5), null)])[5]!;
  assert.equal(b.mid, null);
  assert.equal(b.lo, null);
  assert.equal(b.hi, null);
  assert.equal(b.n, 0);
});

// ── Hồ sơ ngày theo `shape_class` — §3f-5 ──────────────────────────────────────

test("`shapeDayProfiles` gộp bằng TRỌNG SỐ CỔNG, không bằng trung bình các tỉ lệ", () => {
  // Trạm A: 30 cổng, 30% bận. Trạm B: 2 cổng, 100% bận. Cùng một dạng.
  //   trọng số cổng : (9 + 2) / 32   = 0,34375
  //   trung bình tỉ lệ: (0,3 + 1)/2  = 0,65      ← con số SAI mà test này chặn
  const p = make(2, [30, 2]);
  put(p, 0, tOf(0, 8), 9, 4);
  put(p, 1, tOf(0, 8), 2, 4);
  const out = shapeDayProfiles(p, () => "HAI_DINH");
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0]!.hours[8]! - 11 / 32) < 1e-9);
  assert.equal(out[0]!.nStations, 2);
});

test("giờ không trạm nào đủ quan sát là `null`, không phải 0", () => {
  const p = make(1, [4]);
  put(p, 0, tOf(0, 8), 2, 4);
  put(p, 0, tOf(0, 3), 2, 0.5); // dưới ngưỡng
  const h = shapeDayProfiles(p, () => "DEM_TROI")[0]!.hours;
  assert.equal(h[8], 0.5);
  assert.equal(h[3], null);
  assert.equal(h[17], null);
});

test("trạm không có nhãn dạng bị BỎ HẲN, không gộp vào một dạng nào", () => {
  const p = make(2, [4, 4]);
  put(p, 0, tOf(0, 8), 4, 4);
  put(p, 1, tOf(0, 8), 0, 4);
  const out = shapeDayProfiles(p, (s) => (s === 0 ? "HAI_DINH" : null));
  assert.equal(out.length, 1);
  assert.equal(out[0]!.nStations, 1);
  // Nếu trạm không nhãn lọt vào thì giá trị sẽ là 0,5 chứ không phải 1.
  assert.equal(out[0]!.hours[8], 1);
});

test("thứ tự trả về theo SỐ TRẠM giảm dần — vị trí dọc mang thông tin, không mang chữ cái", () => {
  const p = make(3, [4, 4, 4]);
  for (let s = 0; s < 3; s++) put(p, s, tOf(0, 8), 1, 4);
  const out = shapeDayProfiles(p, (s) => (s === 0 ? "DEM_TROI" : "HAI_DINH"));
  assert.deepEqual(
    out.map((o) => o.cls),
    ["HAI_DINH", "DEM_TROI"],
  );
});
