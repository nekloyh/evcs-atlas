/**
 * Test cho thang PHÂN KỲ — `computeDivergingClassing` + cánh màu ở `THEME_PALETTES`.
 *
 * Lỗi mà nó vá không phải chuyện thẩm mỹ. `screen_margin_m` là khoảng cách tới trạm gần
 * nhất TRỪ ngưỡng phê duyệt, nên dấu của nó là ranh giới quyết định. Chia bậc phân vị một
 * chiều đặt ranh giới ấy vào GIỮA một bậc — trên dữ liệu thật, bậc thứ 5 chạy từ −74 m tới
 * +372 m — nên một ô chưa đủ xa ngưỡng và một ô đã đủ được tô **cùng một màu**, ở đúng chỗ
 * mà cả trường này sinh ra để chỉ.
 *
 * Phần lớn test dưới đây kiểm **luật có tồn tại không**, không kiểm "hàm chạy đúng không":
 * không trường nào được khai cả cực tính lẫn phân kỳ, không trường phân kỳ nào được trỏ vào
 * một cảnh không có cánh màu, và thứ sẫm nhất trên bản đồ vẫn phải là phía cần can thiệp.
 *
 * Số đo màu (CVD ΔE, tương phản với nền/vân null/overlay) KHÔNG chạy lại ở đây — chúng là
 * cổng lúc thiết kế, chạy bằng `validate_palette.js` của skill dataviz và ghi số ở
 * DECISIONS §22. Ở đây chỉ giữ bất biến rẻ mà một lần sửa ẩu sẽ phá.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FIELDS } from "../src/fields.ts";
import { themeFor } from "../src/viz/theme.ts";
import type { AnalysisTheme } from "../src/viz/theme.ts";
import { DEMAND_REPRESENTATIONS, type DemandRepresentation } from "../src/state/types.ts";
import {
  DIVERGE_NEUTRAL_HEX,
  DIVERGE_NEUTRAL_INK,
  THEME_PALETTES,
  buildScale,
  classOf,
  computeDivergingClassing,
  rampFor,
  scaleColors,
  type NumericScale,
} from "../src/viz/palette.ts";

/** Hình dạng thật của `screen_margin_m`: 2.618 ô âm tới −1.999 m, 1.782 ô dương tới +4.331 m. */
const MARGIN = [
  ...Array.from({ length: 2618 }, (_, i) => -1999 + (1998.5 * i) / 2617),
  ...Array.from({ length: 1782 }, (_, i) => 0.9 + (4330 * i) / 1781),
];
const AT_ZERO = { at: 0, hue: "above" } as const;

const div = (values: number[] = MARGIN): NumericScale =>
  computeDivergingClassing(values, AT_ZERO);

// ── Lỗi mà thang này sinh ra để vá ─────────────────────────────────────────────

test("thang phân vị một chiều tô cùng màu cho hai bên ranh giới quyết định", () => {
  const seq = buildScale("numeric", MARGIN);
  assert.equal(
    classOf(-50, seq),
    classOf(50, seq),
    "tiền đề của cả tính năng: một ô CHƯA đủ xa ngưỡng và một ô ĐÃ đủ rơi cùng một bậc",
  );
  const d = div();
  assert.notEqual(classOf(-50, d), classOf(50, d));
  assert.equal(classOf(-0.001, d), d.diverge!.index - 1, "sát dưới mốc là bậc cuối phía dưới");
  assert.equal(classOf(0, d), d.diverge!.index, "đúng mốc thuộc phía TRÊN — mốc là cạnh dưới");
});

test("mốc là một NGƯỠNG thật, ghim đúng giá trị khai chứ không phải phân vị gần đó", () => {
  const d = div();
  assert.equal(d.breaks[d.diverge!.index], 0);
  assert.equal(d.breaks.filter((b) => b === 0).length, 1, "mốc chỉ được xuất hiện một lần");
  assert.deepEqual([...d.breaks].sort((a, b) => a - b), d.breaks, "ngưỡng phải tăng dần");
  assert.equal(d.breaks.length, 6);
});

test("chỉ số mốc đọc SAU khi gộp ngưỡng trùng, không giả định 3 bậc mỗi phía", () => {
  // Nửa dưới dồn hết vào một giá trị ⇒ hai ngưỡng dưới trùng nhau và bị gộp (§6a-3).
  const d = computeDivergingClassing([...Array(300).fill(-500), 10, 20, 30, 40, 50, 60], AT_ZERO);
  assert.equal(d.breaks[d.diverge!.index], 0);
  assert.ok(d.diverge!.index < 3, `phía dưới còn ${d.diverge!.index} bậc, không phải 3`);
  assert.equal(d.counts.reduce((a, b) => a + b, 0), d.n, "mọi giá trị phải rơi vào đúng một bậc");
});

test("không có bậc {0} riêng, kể cả khi 0 chiếm quá 5% — §6a-2 nói về VẮNG MẶT", () => {
  const d = computeDivergingClassing([...Array(200).fill(0), ...Array(200).fill(-5), 1, 2, 3], AT_ZERO);
  assert.equal(d.zeroClass, false, "0 ở đây là ranh giới, và nó đã là một NGƯỠNG rồi");
});

test("dữ liệu một phía thì rơi về thang tuần tự — không hứa một ranh giới không tồn tại", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8];
  const d = computeDivergingClassing(values, AT_ZERO);
  assert.equal(d.diverge, null);
  assert.deepEqual(d, buildScale("numeric", values));
});

// ── Màu ────────────────────────────────────────────────────────────────────────

test("sắc của cảnh nằm ở phía KHAI, phía kia là cánh xám-lam", () => {
  const d = div();
  const hex = scaleColors(d, "screening").map(rgbHex);
  const k = d.diverge!.index;
  assert.deepEqual(hex.slice(k), [...THEME_PALETTES.screening.diverge!.hex]);
  assert.deepEqual(hex.slice(0, k), [...DIVERGE_NEUTRAL_HEX].reverse());
});

test("khai `hue: below` thì hai cánh đổi chỗ, không đổi thứ tự đậm nhạt", () => {
  const d = computeDivergingClassing(MARGIN, { at: 0, hue: "below" });
  const hex = scaleColors(d, "screening").map(rgbHex);
  const k = d.diverge!.index;
  assert.deepEqual(hex.slice(0, k), [...THEME_PALETTES.screening.diverge!.hex].reverse());
  assert.deepEqual(hex.slice(k), [...DIVERGE_NEUTRAL_HEX]);
});

test("càng xa mốc càng sẫm, và thứ SẪM NHẤT là phía cần can thiệp — §4b", () => {
  for (const [name, p] of Object.entries(THEME_PALETTES)) {
    if (!p.diverge) continue;
    const d = div();
    const lum = scaleColors(d, name as AnalysisTheme).map(([r, g, b]) => relLum(r, g, b));
    const k = d.diverge!.index;
    for (let i = 1; i < k; i++) assert.ok(lum[i]! > lum[i - 1]!, `${name}: phía dưới phải nhạt dần về mốc`);
    for (let i = k + 1; i < lum.length; i++) assert.ok(lum[i]! < lum[i - 1]!, `${name}: phía trên phải sẫm dần`);
    assert.ok(
      Math.min(...lum.slice(k)) < Math.min(...lum.slice(0, k)),
      `${name}: cánh can thiệp phải sẫm hơn cánh trung tính — nếu không, "đậm = chỗ cần làm gì" gãy`,
    );
  }
});

test("mực chữ trên mọi ô màu phân kỳ đạt 4,5:1 — §4c", () => {
  const arms = [
    ["(trung tính)", DIVERGE_NEUTRAL_HEX, DIVERGE_NEUTRAL_INK] as const,
    ...Object.entries(THEME_PALETTES)
      .filter(([, p]) => p.diverge)
      .map(([n, p]) => [n, p.diverge!.hex, p.diverge!.ink] as const),
  ];
  for (const [name, hex, ink] of arms) {
    assert.equal(hex.length, 3, `${name}: cánh phải đúng 3 bậc`);
    assert.equal(ink.length, 3);
    for (let i = 0; i < 3; i++) {
      const c = contrast(hex[i]!, ink[i]!);
      assert.ok(c >= 4.5, `${name} bậc ${i + 1}: ${hex[i]} trên ${ink[i]} chỉ ${c.toFixed(2)}:1`);
    }
  }
});

test("cực tính KHÔNG áp lên thang phân kỳ — hai luật đảo màu không được chồng nhau", () => {
  const d = div();
  assert.deepEqual(rampFor(d, "high-good", "screening"), rampFor(d, undefined, "screening"));
});

// ── Luật ở registry ────────────────────────────────────────────────────────────

const REPRESENTATIONS: DemandRepresentation[] = [...DEMAND_REPRESENTATIONS];

test("không trường nào khai cả cực tính lẫn phân kỳ", () => {
  for (const f of FIELDS) {
    assert.ok(!(f.polarity && f.diverge), `${f.id} khai cả hai — bảng màu sẽ bị đảo hai lần`);
  }
});

test("mọi trường phân kỳ đều tô được, và cảnh của nó phải CÓ cánh màu", () => {
  const declared = FIELDS.filter((f) => f.diverge);
  assert.ok(declared.length > 0, "không còn trường phân kỳ nào thì xoá cả cơ chế này đi");
  for (const f of declared) {
    assert.equal(f.kind, "numeric", `${f.id}: chỉ thang số mới có mốc`);
    assert.notEqual(f.map, false, `${f.id}: khai phân kỳ mà không tô được thì khai để làm gì`);
    assert.equal(f.diverge!.ends.length, 2);
    for (const rep of REPRESENTATIONS) {
      const theme = themeFor(f, rep);
      assert.ok(
        THEME_PALETTES[theme].diverge,
        `${f.id} rơi vào cảnh "${theme}" không có cánh phân kỳ ⇒ bản đồ lặng lẽ về thang tuần tự`,
      );
    }
  }
});

// ── phụ ────────────────────────────────────────────────────────────────────────

function rgbHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function relLum(r: number, g: number, b: number): number {
  const f = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number {
  const lum = (h: string) =>
    relLum(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
