/**
 * Cổng đo cho BẢY ramp tuần tự — thứ mà `index.css` lâu nay khai là "đã qua
 * `validate_palette.js`" nhưng chỉ đúng với ramp cam gốc.
 *
 * Sáu ramp CARTO thêm sau chưa từng chạy qua bộ đo nào. Đo trên **màu THẬT ĐƯỢC VẼ** (ô hex
 * tô ở alpha 217/255 trên nền `#f2f3f0`), kết quả trước khi sửa:
 *
 * | ramp | ΔE bậc 1 với nền | ΔE với mực bị-loại |
 * |---|---|---|
 * | `urban-context` | **1,5** | 8,4 |
 * | `supply` | **2,4** | **6,7** |
 * | `screening` | **3,2** | 9,7 |
 * | `utilization` | **4,5** | **6,4** |
 * | `accessibility` | **5,1** | **4,0** |
 * | `demand` | **6,8** | 10,7 |
 * | `exploration` | 19,9 ✓ | 12,9 ✓ |
 *
 * Hai hệ quả, và cả hai phá đúng luật mà DESIGN đã bỏ công dựng: bậc thấp nhất **không tách
 * khỏi nền**, nên "giá trị thấp" đọc y như "không có ô" (§4b bỏ hẳn một cơ chế để tránh
 * đúng chuyện đó); và bốn ramp có bậc nhạt **đụng mực bị-loại**, nên ô ĐƯỢC GIỮ và ô BỊ LOẠI
 * cùng màu — §3d-1 nói "bị loại thì mờ đi, không biến mất".
 *
 * Cách sửa: giữ nguyên đường cong sắc của từng ramp, chỉ **dời dải L** rồi lấy mẫu lại 7 bậc
 * trên chính đường cong ấy. Không sắc mới nào được đẻ ra. `exploration` bị KẸP để không bị
 * làm sáng lên — nó vốn đã đạt, và "L cao nhất còn qua cổng" sẽ kéo nó lên 0,838.
 *
 * Test này chạy lại phép đo, nên một lần sửa hex bằng mắt sẽ đỏ ngay.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { THEME_PALETTES, HATCH_HEX, BASEMAP_HEX } from "../src/viz/palette.ts";
import type { AnalysisTheme } from "../src/viz/theme.ts";

/** Alpha mà `hexLayers` tô ô — màu đọc được là HỢP THÀNH, không phải hex trần. */
const FILL_ALPHA = 217 / 255;
/** Mực mark bị brush loại — `#898781` @ 0,25 (§3d-1). */
const MUTED_ALPHA = 0.25;
const FLOOR_DE = 8.0;
const FLOOR_DL = 0.06;
const FLOOR_INK = 4.5;

// ── OKLab + WCAG, đủ dùng, không thêm dependency ───────────────────────────────
const srgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255);
const s2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (h: string) => srgb(h).map(s2lin);
function oklab([r, g, b]: number[]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const L = (h: string) => oklab(lin(h))[0];
function dE(a: string, b: string): number {
  const x = oklab(lin(a)), y = oklab(lin(b));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
function over(hex: string, alpha: number, bg = BASEMAP_HEX): string {
  const f = srgb(hex), b = srgb(bg);
  return "#" + f.map((v, i) => Math.round((v * alpha + b[i]! * (1 - alpha)) * 255).toString(16).padStart(2, "0")).join("");
}
const relLum = (h: string) => { const [r, g, b] = lin(h); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const THEMES = Object.keys(THEME_PALETTES) as AnalysisTheme[];
const MUTED = over(HATCH_HEX, MUTED_ALPHA);

test("mọi ramp có đúng 7 bậc hex, 7 mực, 7 rgb", () => {
  for (const t of THEMES) {
    const p = THEME_PALETTES[t];
    assert.equal(p.hex.length, 7, t);
    assert.equal(p.ink.length, 7, t);
    assert.equal(p.rgb.length, 7, t);
  }
});

test("mọi bậc tách khỏi NỀN bản đồ — 'giá trị thấp' không được đọc thành 'không có ô'", () => {
  for (const t of THEMES) {
    THEME_PALETTES[t].hex.forEach((h, i) => {
      const d = dE(over(h, FILL_ALPHA), BASEMAP_HEX);
      assert.ok(d >= FLOOR_DE, `${t} bậc ${i + 1} (${h}) chỉ ΔE ${d.toFixed(1)} với nền`);
    });
  }
});

test("mọi bậc tách khỏi MỰC BỊ-LOẠI — nếu không thì brush hỏng (§3d-1)", () => {
  for (const t of THEMES) {
    THEME_PALETTES[t].hex.forEach((h, i) => {
      const d = dE(over(h, FILL_ALPHA), MUTED);
      assert.ok(d >= FLOOR_DE, `${t} bậc ${i + 1} (${h}) chỉ ΔE ${d.toFixed(1)} với mực bị-loại`);
    });
  }
});

test("L đơn điệu giảm và ΔL kề đủ rộng để phân biệt hai bậc", () => {
  for (const t of THEMES) {
    const Ls = THEME_PALETTES[t].hex.map(L);
    Ls.slice(1).forEach((l, i) => {
      const gap = Ls[i]! - l;
      assert.ok(gap > 0, `${t}: bậc ${i + 2} không sẫm hơn bậc ${i + 1}`);
      assert.ok(gap >= FLOOR_DL, `${t}: ΔL bậc ${i + 1}→${i + 2} chỉ ${gap.toFixed(3)}`);
    });
  }
});

test("mực chữ trên mọi swatch đạt 4,5:1 — §4c", () => {
  for (const t of THEMES) {
    const p = THEME_PALETTES[t];
    p.hex.forEach((h, i) => {
      const c = contrast(h, p.ink[i]!);
      assert.ok(c >= FLOOR_INK, `${t} bậc ${i + 1}: ${h} trên ${p.ink[i]} chỉ ${c.toFixed(2)}:1`);
    });
  }
});

test("`rgb` phải khớp `hex` — hai mảng cho một sự thật thì chúng sẽ trôi khỏi nhau", () => {
  for (const t of THEMES) {
    const p = THEME_PALETTES[t];
    p.hex.forEach((h, i) => {
      const want = [0, 2, 4].map((k) => parseInt(h.slice(1 + k, 3 + k), 16));
      assert.deepEqual(p.rgb[i], want, `${t} bậc ${i + 1}`);
    });
  }
});

test("`series` là bậc 4 của chính ramp, không phải một hex rời", () => {
  for (const t of THEMES) {
    assert.equal(THEME_PALETTES[t].series, THEME_PALETTES[t].hex[3], t);
  }
});
