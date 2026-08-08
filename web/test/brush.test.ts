/**
 * Ba brush của dock — DESIGN.md §3d-1 (nghĩa) và §9b (cú pháp).
 *
 * Vì sao có file này: cả hai đều là **hợp đồng**, không phải một trạng thái. Ảnh chụp
 * chứng minh được rằng MỘT lần kéo làm xám đúng những ô cần xám; nó không chứng minh được
 * rằng mọi mệnh đề hỏng đều bị bỏ riêng nó, rằng brush không áp dụng được thì KHÔNG loại
 * mark nào, hay rằng ô null bị loại đúng lúc và không bị loại sai lúc. §12.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCATTER_X,
  SCATTER_Y,
  brushCount,
  clampToWindow,
  inWindow,
  keep,
  nextT,
  parseBrush,
  reconcileBrush,
  serializeBrush,
  type BrushState,
} from "../src/state/brush.ts";
import { tOf } from "../src/state/types.ts";

// ══ Cú pháp §9b ═══════════════════════════════════════════════════════════════

test("histogram: tên trường có `:` vẫn đọc đúng — phân tích theo VỊ TRÍ HAI ĐẦU", () => {
  // `commune:population` chứa chính ký tự dùng làm phân cách phần. §9b quyết định 3.
  const b = parseBrush("h:commune:population:0..90000");
  assert.deepEqual(b.hist, { field: "commune:population", range: { lo: 0, hi: 90000 } });
});

test("histogram: khoảng dùng `..` nên số ÂM đọc được", () => {
  // `screen_margin_m` âm là "chưa đủ xa" — hơn nửa số ô. `-2000-500` không tách đúng được.
  const b = parseBrush("h:screen_margin_m:-2000..500");
  assert.deepEqual(b.hist?.range, { lo: -2000, hi: 500 });
});

test("histogram: đầu mở đọc được; hai đầu cùng rỗng thì KHÔNG", () => {
  assert.equal(parseBrush("h:population:..4400").hist?.range.lo, -Infinity);
  assert.equal(parseBrush("h:population:120..").hist?.range.hi, Infinity);
  assert.equal(parseBrush("h:population:..").hist, undefined, "mệnh đề không nói gì cả");
});

test("scatter: đúng 5 phần, và hai trục phải đúng cặp đã chốt", () => {
  const ok = parseBrush(`s:${SCATTER_X}:120..4400:${SCATTER_Y}:0..2500`);
  assert.deepEqual(ok.scatter?.xr, { lo: 120, hi: 4400 });
  // Trục khác cặp đã chốt bị bỏ: hash không được biểu diễn một trạng thái mà dock không
  // có dữ liệu để vẽ (§3d-1).
  assert.equal(parseBrush(`s:n_mall:0..3:${SCATTER_Y}:0..2500`).scatter, undefined);
  assert.equal(parseBrush(`s:${SCATTER_X}:0..3`).scatter, undefined, "thiếu phần");
});

test("cửa sổ: `dow` 0–6 và `hour` 0–23, ngoài biên thì bỏ", () => {
  assert.deepEqual(parseBrush("w:0..4:7..19").win, {
    dow: { lo: 0, hi: 4 },
    hour: { lo: 7, hi: 19 },
  });
  for (const bad of ["w:0..9:7..19", "w:-1..4:7..19", "w:0..4:7..24", "w:0..4:1.5..19"]) {
    assert.equal(parseBrush(bad).win, undefined, bad);
  }
});

test("`lo > hi` bị bỏ — một khoảng ngược không phải một khoảng rỗng", () => {
  assert.equal(parseBrush("h:population:5..1").hist, undefined);
});

test("biên không phải số hữu hạn thì bỏ mệnh đề", () => {
  for (const bad of ["h:population:abc..2", "h:population:1..NaN", "h:population:1..Infinity"]) {
    assert.equal(parseBrush(bad).hist, undefined, bad);
  }
});

test("mệnh đề hỏng bị bỏ riêng nó — các brush còn lại vẫn sống", () => {
  const b = parseBrush(`x:1:2,h:population:1..2,s:khong:1..2:cothat:1..2,w:0..1:0..1`);
  assert.ok(b.hist, "brush lành vẫn còn");
  assert.equal(b.scatter, undefined);
  assert.ok(b.win);
  assert.equal(brushCount(b), 2);
});

test("trùng loại thì mệnh đề SAU thắng — state chỉ có một ô mỗi loại", () => {
  const b = parseBrush("h:population:1..2,h:population:10..20");
  assert.deepEqual(b.hist?.range, { lo: 10, hi: 20 });
});

test("thứ tự ghi CHUẨN HOÁ h → s → w, không theo thứ tự người dùng kéo", () => {
  // Một trạng thái phải cho đúng một chuỗi — cùng lý do đã ghi cho khoá `l`.
  const a = parseBrush(`w:0..1:0..1,h:population:1..2,s:${SCATTER_X}:1..2:${SCATTER_Y}:1..2`);
  assert.equal(
    serializeBrush(a),
    `h:population:1..2,s:${SCATTER_X}:1..2:${SCATTER_Y}:1..2,w:0..1:0..1`,
  );
});

test("ghi rồi đọc lại ra đúng brush cũ, cả ba loại", () => {
  const src = `h:population:120..4400,s:${SCATTER_X}:0..9000:${SCATTER_Y}:1500..20000,w:1..5:6..22`;
  assert.equal(serializeBrush(parseBrush(src)), src);
});

test("brush rỗng ghi ra chuỗi rỗng — không có khoá `b=` trống", () => {
  assert.equal(serializeBrush({}), "");
  assert.equal(brushCount({}), 0);
});

// ══ Bất biến: histogram luôn nói về TRƯỜNG ĐANG TÔ ════════════════════════════

test("brush histogram của trường khác bị bỏ riêng nó khi đổi trường", () => {
  const b: BrushState = {
    hist: { field: "population", range: { lo: 1, hi: 2 } },
    win: { dow: { lo: 0, hi: 1 }, hour: { lo: 0, hi: 1 } },
  };
  const r = reconcileBrush(b, "n_mall");
  assert.equal(r.hist, undefined, "khoảng dân số không được đem so với số TTTM");
  assert.ok(r.win, "cửa sổ độc lập với trường, nên nó ở lại");
  assert.deepEqual(reconcileBrush(b, "population"), b, "khớp trường thì không đụng gì");
});

// ══ Phép AND — §3d-1 ══════════════════════════════════════════════════════════

const HIST: BrushState = { hist: { field: "population", range: { lo: 100, hi: 200 } } };
const SCAT: BrushState = {
  scatter: { x: SCATTER_X, xr: { lo: 100, hi: 200 }, y: SCATTER_Y, yr: { lo: 0, hi: 500 } },
};

test("histogram: trong khoảng thì giữ, ngoài thì loại, hai biên là ĐÓNG", () => {
  assert.equal(keep(HIST, { value: 150 }), true);
  assert.equal(keep(HIST, { value: 100 }), true);
  assert.equal(keep(HIST, { value: 200 }), true);
  assert.equal(keep(HIST, { value: 99 }), false);
  assert.equal(keep(HIST, { value: 201 }), false);
});

test("mark KHÔNG CÓ GIÁ TRỊ bị loại khi brush giá trị bật — không biết ≠ trong khoảng", () => {
  assert.equal(keep(HIST, { value: null }), false);
  assert.equal(keep(HIST, { value: undefined }), false);
  assert.equal(keep(HIST, { value: NaN }), false);
  // Không có brush nào thì nó KHÔNG bị loại — vắng giá trị không phải một lý do để mờ đi.
  assert.equal(keep({}, { value: null }), true);
});

test("giá trị không phải SỐ không lọt qua brush số", () => {
  assert.equal(keep(HIST, { value: "OSM_NETWORK" }), false);
  assert.equal(keep(HIST, { value: true }), false);
});

test("scatter KHÔNG HOẠT ĐỘNG khi hình học không mang hai cột đó", () => {
  // Đây là luật quan trọng nhất của §3d-1: brush không áp dụng được thì bỏ qua, KHÔNG trả
  // về false. Trả false sẽ xoá sạch bản đồ xã/đường/trạm và đọc thành "đã lọc rồi, không
  // còn gì" — §13b-1 gọi đúng đó là nói dối về phủ.
  assert.equal(keep(SCAT, { value: 1 }), true, "không có `scatter` ⇒ brush im lặng");
  assert.equal(keep(SCAT, { value: 1, scatter: { x: 150, y: 100 } }), true);
  assert.equal(keep(SCAT, { value: 1, scatter: { x: 999, y: 100 } }), false);
});

test("ô CÓ hai cột nhưng một cột null thì BỊ LOẠI — khác hẳn 'không có cột'", () => {
  // 51 ô không tới được mang `dist = null`. "Không biết xa bao nhiêu" không khẳng định
  // được là "trong khoảng", nên chúng bị loại — nhưng chúng không biến mất khỏi bản đồ.
  assert.equal(keep(SCAT, { value: 1, scatter: { x: 150, y: null } }), false);
  assert.equal(keep(SCAT, { value: 1, scatter: { x: null, y: 100 } }), false);
});

test("ba brush giao nhau bằng AND — chỉ cần một cái loại là mark bị loại", () => {
  const all: BrushState = {
    ...HIST,
    ...SCAT,
    win: { dow: { lo: 0, hi: 4 }, hour: { lo: 7, hi: 19 } },
  };
  assert.equal(keep(all, { value: 150, scatter: { x: 150, y: 100 } }), true);
  assert.equal(keep(all, { value: 150, scatter: { x: 999, y: 100 } }), false, "scatter loại");
  assert.equal(keep(all, { value: 999, scatter: { x: 150, y: 100 } }), false, "histogram loại");
});

test("CỬA SỔ 168h không phải vị từ trên mark — nó không loại mark nào", () => {
  // §3d-1: bản đồ chỉ hiện MỘT giờ, nên "giờ này thuộc cửa sổ không" là một câu trả lời
  // chung cho mọi mark. Làm xám theo nó thì hoặc xám hết, hoặc không xám cái nào.
  const win: BrushState = { win: { dow: { lo: 0, hi: 0 }, hour: { lo: 0, hi: 0 } } };
  assert.equal(keep(win, { value: 999 }), true);
  assert.equal(keep(win, { value: null }), true);
});

// ══ Cửa sổ ↔ scrubber (§3e) ═══════════════════════════════════════════════════

const WIN = { dow: { lo: 0, hi: 4 }, hour: { lo: 7, hi: 19 } };

test("`inWindow` đọc `t` thành (dow, hour) đúng — dow = 0 là Thứ Hai", () => {
  assert.equal(inWindow(WIN, tOf(0, 7)), true);
  assert.equal(inWindow(WIN, tOf(4, 19)), true);
  assert.equal(inWindow(WIN, tOf(5, 12)), false, "Thứ Bảy ngoài cửa sổ T2–T6");
  assert.equal(inWindow(WIN, tOf(2, 3)), false, "3h ngoài cửa sổ 7h–19h");
  assert.equal(inWindow(undefined, tOf(6, 23)), true, "không cửa sổ ⇒ mọi giờ đều thuộc");
});

test("play lặp TRONG cửa sổ, và cửa sổ không liên tục trên trục 0–167", () => {
  // T2–T6 × 7h–19h là 5 đoạn RỜI trên trục 168 giờ, nên bước kế tiếp không phải `t + 1`.
  assert.equal(nextT(WIN, tOf(0, 19)), tOf(1, 7), "hết giờ trong ngày ⇒ nhảy sang thứ sau");
  assert.equal(nextT(WIN, tOf(4, 19)), tOf(0, 7), "hết cửa sổ ⇒ quay về đầu, lặp VÔ HẠN");
  assert.equal(nextT(WIN, tOf(0, 7)), tOf(0, 8));
});

test("không cửa sổ thì lặp trên cả 168 giờ", () => {
  assert.equal(nextT(undefined, 0), 1);
  assert.equal(nextT(undefined, 167), 0, "lặp vô hạn");
});

test("đổi cửa sổ thì kéo `t` vào trong; đang ở trong thì ĐỨNG YÊN", () => {
  assert.equal(clampToWindow(WIN, tOf(2, 12)), tOf(2, 12), "không giật khỏi giờ đang nhìn");
  assert.ok(inWindow(WIN, clampToWindow(WIN, tOf(6, 3))));
});

test("bất biến: `t` mặc định 0 phải bị kéo vào cửa sổ — lỗi thật ở đường BOOT", () => {
  // Bắt được bằng ảnh render: `#b=…w:0..4:7..19` không kèm `t` mở ra ở T2 00:00 — một giờ
  // mà chính cửa sổ đó loại — nên nhãn scrubber tự mâu thuẫn với câu ngay cạnh nó. Ba
  // đường vào `t` (boot · applyHash · setBrush) phải giữ CÙNG bất biến này.
  assert.equal(clampToWindow(WIN, 0), tOf(0, 7));
  assert.ok(inWindow(WIN, clampToWindow(WIN, 0)));
});

test("không có cửa sổ thì `clampToWindow` không đụng gì", () => {
  assert.equal(clampToWindow(undefined, 0), 0);
  assert.equal(clampToWindow(undefined, 167), 167);
});
