/**
 * Test cho token đơn vị — `src/units.ts`.
 *
 * Vì sao có file này: trước đó `unit` là chuỗi tự do, nên `formatBreak` chỉ rút gọn được
 * theo độ lớn của TỪNG số, và một dải chú giải trộn hai đơn vị (`600` cạnh `1 ng`). Cách
 * duy nhất để biết một trường có phải tỉ lệ không là **dò chuỗi** `"0–1"` — phép dò ấy im
 * lặng khi trượt, và nó trượt `util_pctl_cell`. Trường đó khai `map: false` nên lỗi chưa
 * bao giờ lên màn hình; đó là lý do nó sống sót lâu, không phải lý do nó vô hại.
 *
 * Nên phần lớn test dưới đây không kiểm "hàm chạy đúng không", mà kiểm **luật có tồn tại
 * không**: mọi `UnitKind` phải có thang, mọi trường phải khai đơn vị hợp lệ, và dãy ngưỡng
 * của một ramp phải nói cùng MỘT đơn vị.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FIELDS, FIELD_BY_ID, unitSentence } from "../src/fields.ts";
import {
  baseUnitPhrase,
  formatIn,
  scaleUnit,
  formatSeries,
  unitPhrase,
  withDigits,
  type UnitKind,
} from "../src/units.ts";

const KINDS: UnitKind[] = [
  "m", "km2", "person", "ppkm2", "poi", "station", "port",
  "building", "floor", "kw", "ratio", "pctl", "times", "index",
];

// ── Lỗi mà token này sinh ra để vá ─────────────────────────────────────────────

test("phân vị in theo phần trăm — quả mìn mà `isRatioField` dò chuỗi đã cài sẵn", () => {
  const f = FIELD_BY_ID.get("util_pctl_cell")!;
  assert.equal(f.unit!.kind, "pctl");
  const s = scaleUnit(f.unit, 1);
  // Trước: `formatBreak(0.5)` → "0,5". Sau: "50" kèm đơn vị "%". Trường này chưa tô được
  // (`map: false`), nên test này giữ cho lỗi không sống dậy vào ngày nó được tô.
  assert.equal(formatIn(0.5, s), "50");
  assert.equal(s.label, "%");
});

test("câu đơn vị của phân vị KHÁC câu của tỉ lệ — hai `kind` không được gộp", () => {
  const pctl = FIELD_BY_ID.get("util_pctl_cell")!;
  const ratio = FIELD_BY_ID.get("util_cell")!;
  assert.equal(ratio.unit!.kind, "ratio");
  assert.notEqual(baseUnitPhrase(pctl.unit), baseUnitPhrase(ratio.unit));
});

// ── Luật làm tròn theo đơn vị ──────────────────────────────────────────────────

test("mét đổi sang km khi dải chạy quá 1 km, và ĐỔI CẢ DÃY", () => {
  const breaks = [0, 320, 850, 1_400, 3_100];
  const s = withDigits(scaleUnit({ kind: "m" }, 3_100), breaks);
  assert.equal(s.label, "km");
  // Điều quan trọng không phải "1,4" mà là 320 cũng thành "0,3": một dải không được
  // mang hai đơn vị, và cũng không được mang bốn kiểu số lẻ.
  assert.deepEqual(breaks.map((b) => formatIn(b, s)), ["0", "0,3", "0,9", "1,4", "3,1"]);
});

test("một ngưỡng sát 0 KHÔNG được kéo cả dải theo — chỉ nó mang số lẻ", () => {
  // Đúng dải của `station:occ`. Luật cũ (chọn số chữ số nhỏ nhất giữ mọi nhãn phân biệt)
  // cho `0 · 0,01 · 8,33 · 16,67 · 25,83 · 36,81 · 52,43`: một ngoại lệ bắt sáu ngưỡng
  // còn lại trả giá.
  const breaks = [0, 0.000149, 0.0833, 0.1667, 0.2583, 0.3681, 0.5243];
  const s = withDigits(scaleUnit({ kind: "ratio" }, 0.5243), breaks);
  const labels = formatSeries(breaks, s);
  assert.deepEqual(labels, ["0", "0,01", "8", "17", "26", "37", "52"]);
});

test("nhãn trùng nhau thì được nâng chữ số, không bao giờ để hai ngưỡng đọc như một", () => {
  const breaks = [0, 1_000, 1_020, 3_000];
  const s = withDigits(scaleUnit({ kind: "m" }, 3_000), breaks);
  const labels = formatSeries(breaks, s);
  assert.equal(new Set(labels).size, labels.length, `trùng nhãn: ${labels.join(" · ")}`);
});

test("dải ngắn hơn 1 km ở nguyên mét, không bị ép sang km", () => {
  const s = scaleUnit({ kind: "m" }, 850);
  assert.equal(s.label, "m");
  assert.equal(formatIn(850, s), "850");
});

test("người đổi thang ở 10.000, không ở 1.000", () => {
  assert.equal(scaleUnit({ kind: "person" }, 8_400).label, "người");
  assert.equal(scaleUnit({ kind: "person" }, 42_000).label, "nghìn người");
  assert.equal(scaleUnit({ kind: "person" }, 2_100_000).label, "triệu người");
});

test("ngưỡng nhỏ giữ đủ chữ số — không được có hai bậc cùng đọc là 0", () => {
  const values = [0, 0.000149, 0.0833, 0.524];
  const s = withDigits(scaleUnit({ kind: "ratio" }, 0.52), values);
  const labels = formatSeries(values, s);
  assert.equal(new Set(labels).size, labels.length, `trùng nhãn: ${labels.join(" · ")}`);
  assert.equal(labels[0], "0");
});

test("0 luôn là \"0\" ở mọi đơn vị — nó là số đo, không phải chỗ trống", () => {
  for (const kind of KINDS) assert.equal(formatIn(0, scaleUnit({ kind }, 1_000)), "0", kind);
});

test("giá trị âm giữ dấu — `screen_margin_m` mất dấu là mất cả nghĩa", () => {
  const f = FIELD_BY_ID.get("screen_margin_m")!;
  const s = scaleUnit(f.unit, 2_000);
  assert.ok(formatIn(-1_500, s).startsWith("-"), "âm phải còn dấu");
});

// ── Luật phải TỒN TẠI, không chỉ chạy đúng ────────────────────────────────────

test("mọi UnitKind đều có thang — thêm kind mà quên luật là fail ở đây", () => {
  for (const kind of KINDS) {
    const s = scaleUnit({ kind }, 1);
    assert.ok(s.divisor > 0, kind);
    assert.equal(typeof s.label, "string", kind);
  }
});

test("mọi trường số đều khai đơn vị; bool và hạng mục thì không", () => {
  for (const f of FIELDS) {
    if (f.kind === "numeric") assert.ok(f.unit, `${f.id} thiếu đơn vị`);
    else assert.equal(f.unit, null, `${f.id} là ${f.kind} mà vẫn khai đơn vị`);
  }
});

test("mọi `kind` khai trong registry đều nằm trong danh sách đóng", () => {
  for (const f of FIELDS) {
    if (f.unit) assert.ok(KINDS.includes(f.unit.kind), `${f.id}: ${f.unit.kind}`);
  }
});

test("`note` không bao giờ lặp lại danh từ đơn vị — nó là vế BỔ NGHĨA", () => {
  // "mét, theo mạng đường" đúng; "mét, mét theo mạng đường" là lỗi migrate.
  for (const f of FIELDS) {
    const note = f.unit?.note;
    if (!note) continue;
    const label = scaleUnit(f.unit, 0).label;
    if (label) assert.ok(!note.startsWith(label), `${f.id}: "${note}" lặp "${label}"`);
  }
});

// ── Câu ở legend ───────────────────────────────────────────────────────────────

test("câu đơn vị đổi theo thang đang hiện, không cứng ở mét", () => {
  const f = FIELD_BY_ID.get("dist_station_network_m")!;
  const near = unitSentence(f, scaleUnit(f.unit, 800));
  const far = unitSentence(f, scaleUnit(f.unit, 12_000));
  assert.match(near, /· m,/);
  assert.match(far, /· km,/);
});

test("trường không có đơn vị chỉ in tên, không in dấu · lơ lửng", () => {
  const f = FIELD_BY_ID.get("screen_decision")!;
  assert.equal(f.unit, null);
  assert.ok(!unitSentence(f).includes("·"));
});

test("chỉ số thuần không có danh từ thì câu rơi về `note`, không rỗng", () => {
  const u = { kind: "index" as const, note: "chênh lệch, > 0 = thiếu hụt" };
  assert.equal(scaleUnit(u, 5).label, "");
  assert.equal(unitPhrase(u, scaleUnit(u, 5)), "chênh lệch, > 0 = thiếu hụt");
});
