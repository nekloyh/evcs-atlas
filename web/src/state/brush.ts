/**
 * Ba brush của dock — DESIGN.md §3d-1 (nghĩa) và §9b (cú pháp khoá `b`).
 *
 * File này là **logic thuần trên chuỗi và số**, không đụng `window` và không đụng DOM, đúng
 * để test bằng `node:test` (§12). Ba thứ sống ở đây:
 *
 *   1. hình dạng của ba loại brush,
 *   2. `parseBrush` / `serializeBrush` — hợp đồng §9b, bỏ **từng mệnh đề** hỏng,
 *   3. `keep()` — phép AND, và luật "brush không áp dụng được thì KHÔNG hoạt động".
 *
 * Điều dễ làm sai nhất, nên viết ra: một brush không áp dụng được cho hình học đang tô
 * (scatter trên đơn vị xã chẳng hạn) **không** trả về `false`. Trả `false` sẽ xoá sạch bản
 * đồ và đọc thành "đã lọc rồi, không còn gì" — §13b-1 gọi đúng đó là nói dối về phủ.
 */

import { FIELD_BY_ID } from "../fields";
import type { CellValue } from "../viz/palette";
import { HOURS_IN_WEEK, dowOf, hourOf } from "./types";

/** Khoảng đóng. `-Infinity`/`Infinity` cho đầu mở — chỉ sinh ra khi sửa tay URL. */
export interface Range {
  lo: number;
  hi: number;
}

export interface HistBrush {
  /** id trường (có thể mang tiền tố `commune:`/`road:`/`station:` — §6b) */
  field: string;
  range: Range;
}

export interface ScatterBrush {
  x: string;
  xr: Range;
  y: string;
  yr: Range;
}

/** Cửa sổ 168h — hai khoảng SỐ NGUYÊN, `dow` 0–6 và `hour` 0–23. */
export interface WindowBrush {
  dow: Range;
  hour: Range;
}

/**
 * Ba ô, không phải một mảng.
 *
 * Hai brush histogram cùng lúc là một trạng thái không có nghĩa (một biểu đồ, một vùng
 * kéo), nên hình dạng của state không cho nó tồn tại — cùng lập luận "một khoá thì trạng
 * thái sai không biểu diễn được" của §9a.
 */
export interface BrushState {
  hist?: HistBrush;
  scatter?: ScatterBrush;
  win?: WindowBrush;
}

export const NO_BRUSH: BrushState = {};

/**
 * Hai trục CỐ ĐỊNH của scatter ở M4 — §3d-1.
 *
 * Cú pháp §9b viết tên trường ra để mốc sau thêm bộ chọn trục mà không phải đổi định dạng
 * hash. Nhưng bộ kiểm thì chỉ nhận đúng cặp này, và đó là chủ ý: nhận một cặp khác nghĩa
 * là hash biểu diễn được một trạng thái mà app không vẽ nổi (dock không nạp hai cột đó),
 * tức đúng loại "trạng thái sai biểu diễn được" mà §9a dựng ra để loại bỏ.
 */
export const SCATTER_X = "population";
export const SCATTER_Y = "dist_station_network_m";

// ── Cú pháp — §9b ──────────────────────────────────────────────────────────────

const RANGE_SEP = "..";
const CLAUSE_SEP = ",";
const PART_SEP = ":";

/**
 * Một biên. Rỗng = đầu mở.
 *
 * Vì sao `..` chứ không phải `-`: `screen_margin_m` mang giá trị ÂM ("chưa đủ xa"), nên
 * `-2000-500` không có cách tách nào đúng. §9b quyết định 1.
 */
function parseBound(s: string, open: number): number | null {
  if (s === "") return open;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function parseRange(raw: string): Range | null {
  const i = raw.indexOf(RANGE_SEP);
  if (i < 0) return null;
  const a = raw.slice(0, i);
  const b = raw.slice(i + RANGE_SEP.length);
  // Hai đầu cùng rỗng thì mệnh đề không nói gì cả — đó là khoá rác, không phải brush.
  if (a === "" && b === "") return null;
  const lo = parseBound(a, -Infinity);
  const hi = parseBound(b, Infinity);
  if (lo === null || hi === null) return null;
  return lo <= hi ? { lo, hi } : null;
}

/** Biên nguyên, dùng cho cửa sổ 168h. Đầu mở bị kẹp về biên của trục. */
function parseIntRange(raw: string, min: number, max: number): Range | null {
  const r = parseRange(raw);
  if (!r) return null;
  const lo = r.lo === -Infinity ? min : r.lo;
  const hi = r.hi === Infinity ? max : r.hi;
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
  if (lo < min || hi > max || lo > hi) return null;
  return { lo, hi };
}

/** Trường tô được và là SỐ — chỉ thang số mới có "khoảng giá trị" để kéo. */
function numericField(id: string): boolean {
  return FIELD_BY_ID.get(id)?.kind === "numeric";
}

/**
 * Đọc khoá `b`. Mệnh đề hỏng bị bỏ **riêng nó** — cùng luật "bỏ từng ID lạ" mà khoá `l`
 * dùng, chỉ sâu hơn một bậc. Một mệnh đề gõ sai không được phép tắt hai brush còn lại.
 *
 * Trùng loại thì **mệnh đề sau thắng** (§9b) — state chỉ có một ô cho mỗi loại.
 */
export function parseBrush(raw: string | null | undefined): BrushState {
  const out: BrushState = {};
  if (!raw) return out;

  for (const clause of raw.split(CLAUSE_SEP)) {
    const parts = clause.trim().split(PART_SEP);
    const kind = parts[0];

    if (kind === "h") {
      // Tên trường có thể chứa `:` (`commune:population`), nên phân tích theo VỊ TRÍ HAI
      // ĐẦU: đầu là loại, cuối là khoảng, tất cả ở giữa ghép lại là tên trường (§9b-3).
      if (parts.length < 3) continue;
      const field = parts.slice(1, -1).join(PART_SEP);
      const range = parseRange(parts[parts.length - 1]!);
      if (!range || !numericField(field)) continue;
      out.hist = { field, range };
      continue;
    }

    if (kind === "s") {
      // Đúng 5 token: hai trục là trường của Ô (tên trần, không tiền tố), nên không có
      // chỗ nào mơ hồ để phải phân tích theo vị trí hai đầu.
      if (parts.length !== 5) continue;
      const [, x, xrRaw, y, yrRaw] = parts;
      if (x !== SCATTER_X || y !== SCATTER_Y) continue;
      const xr = parseRange(xrRaw!);
      const yr = parseRange(yrRaw!);
      if (!xr || !yr) continue;
      out.scatter = { x, xr, y: y!, yr };
      continue;
    }

    if (kind === "w") {
      if (parts.length !== 3) continue;
      const dow = parseIntRange(parts[1]!, 0, 6);
      const hour = parseIntRange(parts[2]!, 0, 23);
      if (!dow || !hour) continue;
      out.win = { dow, hour };
    }
  }
  return out;
}

/**
 * Biên ghi ra hash — làm tròn 4 chữ số rồi bỏ 0 thừa.
 *
 * Có lý do kỹ thuật: vòng ghi ↔ đọc phải hội tụ ở lần thứ hai, nếu không listener
 * `hashchange` lặp vô hạn (§9a). Ghi số đã làm tròn thì đọc lại ra đúng số đó.
 *
 * ⚠ **ĐỪNG chép hàm này sang chỗ khác.** Bản sinh đôi của nó ở `state/filter.ts` đã bị bỏ
 * đi ngày 19/8/2026: làm tròn 4 chữ số **hạ** 2.140/4.400 giá trị `population` của `p/01`,
 * và với một phép thử đóng hai đầu (`>= lo && <= hi`) thì ô nằm trên biên rơi khỏi tập con
 * sau một vòng ghi↔đọc — im lặng, chỉ theo chiều teo lại. Xem docstring của `fmt` ở
 * `state/filter.ts` và các phép kiểm `P4-SER`.
 *
 * Ở ĐÂY nó còn sống được vì `serializeBrush` **không có chỗ gọi nào trong `src/`** (hợp đồng
 * filter Phase 4 đã thay nó; chỉ `test/brush.test.ts` còn gọi). Ngày nào nửa serialization
 * này được dùng lại, nó phải đổi sang cách ghi không mất mát trước đã.
 */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "";
  return String(Number(v.toFixed(4)));
}

const fmtRange = (r: Range) => `${fmt(r.lo)}${RANGE_SEP}${fmt(r.hi)}`;

/**
 * Chuỗi hoá. Thứ tự CHUẨN HOÁ `h` → `s` → `w`, không theo thứ tự người dùng kéo — cùng lý
 * do đã ghi cho khoá `l`: một trạng thái phải cho đúng một chuỗi, nếu không hai link giống
 * hệt nhau về nội dung sẽ trông khác nhau khi mentor so chúng.
 */
export function serializeBrush(b: BrushState): string {
  const cl: string[] = [];
  if (b.hist) cl.push(["h", b.hist.field, fmtRange(b.hist.range)].join(PART_SEP));
  if (b.scatter) {
    const s = b.scatter;
    cl.push(["s", s.x, fmtRange(s.xr), s.y, fmtRange(s.yr)].join(PART_SEP));
  }
  if (b.win) cl.push(["w", fmtRange(b.win.dow), fmtRange(b.win.hour)].join(PART_SEP));
  return cl.join(CLAUSE_SEP);
}

// ── Phép AND — §3d-1 ───────────────────────────────────────────────────────────

const within = (v: number, r: Range) => v >= r.lo && v <= r.hi;

/**
 * Thứ một mark mang tới phép thử.
 *
 * `scatter` để `undefined` nghĩa là **hình học này không có hai cột đó** (xã, đường, trạm),
 * nên brush scatter KHÔNG HOẠT ĐỘNG ở đây. Đó là một trạng thái khác hẳn với "có cột nhưng
 * giá trị null" — cái sau là `{ x: null, y: null }` và nó **bị loại**, vì không biết thì
 * không khẳng định được là "trong hộp".
 */
export interface MarkValues {
  /** giá trị của trường ĐANG TÔ tại mark này */
  value: CellValue;
  scatter?: { x: number | null; y: number | null };
}

/** Giá trị số dùng được, hay không có gì. Không có nhánh nào biến null thành 0 (ràng buộc 1). */
function num(v: CellValue | null | undefined): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/**
 * Mark này có được giữ không — AND của các brush **áp dụng được**.
 *
 * Cửa sổ 168h không có mặt ở đây một cách CÓ CHỦ Ý: nó là vị từ trên trục thời gian, không
 * phải trên mark (§3d-1). Bản đồ chỉ hiện đúng một giờ, nên "giờ này thuộc cửa sổ không"
 * là một câu trả lời chung cho mọi mark — làm xám theo nó thì hoặc xám hết, hoặc không xám
 * cái nào. Nó tác động qua `t`, xem `clampToWindow`.
 */
export function keep(b: BrushState, m: MarkValues): boolean {
  if (b.hist) {
    const v = num(m.value);
    if (v === null || !within(v, b.hist.range)) return false;
  }
  if (b.scatter && m.scatter) {
    const x = num(m.scatter.x);
    const y = num(m.scatter.y);
    if (x === null || y === null) return false;
    if (!within(x, b.scatter.xr) || !within(y, b.scatter.yr)) return false;
  }
  return true;
}

/**
 * Bỏ brush histogram khi nó nói về một trường KHÁC trường đang tô.
 *
 * Bất biến được giữ ở đây: `brush.hist.field` luôn bằng `field`. Không có nó thì một hash
 * như `#f=n_mall&b=h:population:120..4400` sẽ đem khoảng dân số đi so với số trung tâm
 * thương mại — một phép so hai đại lượng khác nhau, im lặng, và ra kết quả trông hợp lý.
 * Đó chính là loại "trạng thái sai biểu diễn được" mà §9a dựng ra để loại bỏ, nên nó bị
 * xử như một mệnh đề hỏng: **bỏ riêng nó**, hai brush còn lại vẫn sống.
 *
 * Gọi ở hai chỗ và chỉ hai chỗ: lúc đổi trường, và lúc nạp state từ hash.
 */
export function reconcileBrush(b: BrushState, field: string): BrushState {
  if (!b.hist || b.hist.field === field) return b;
  const { hist: _drop, ...rest } = b;
  return rest;
}

/** Có brush nào làm xám mark trên hình học này không — dock dùng để nói ra khi KHÔNG có. */
export function hasMarkBrush(b: BrushState, unit: string): boolean {
  return Boolean(b.hist) || Boolean(b.scatter && unit === "cell");
}

/** Brush nào đang đặt, kể cả cửa sổ. `0` = dock không lọc gì. */
export function brushCount(b: BrushState): number {
  return (b.hist ? 1 : 0) + (b.scatter ? 1 : 0) + (b.win ? 1 : 0);
}

// ── Cửa sổ 168h ↔ scrubber (§3e) ───────────────────────────────────────────────

/** Giờ `t` có nằm trong cửa sổ không. Không có cửa sổ ⇒ mọi giờ đều thuộc. */
export function inWindow(w: WindowBrush | undefined, t: number): boolean {
  if (!w) return true;
  return within(dowOf(t), w.dow) && within(hourOf(t), w.hour);
}

/**
 * Giờ kế tiếp khi play — lặp **trong cửa sổ** nếu có, trên cả 168 giờ nếu không (§3e).
 *
 * Quét tuần tự thay vì tính chỉ số: cửa sổ là một hình CHỮ NHẬT trong lưới 7×24, nên tập
 * giờ của nó không liên tục trên trục 0–167 (T2–T6 × 7h–19h là 5 đoạn rời). Quét tối đa
 * 168 bước, và bước đó chạy 4 lần mỗi giây — không đáng để tối ưu, nhưng rất đáng để không
 * viết sai.
 */
export function nextT(w: WindowBrush | undefined, t: number): number {
  for (let i = 1; i <= HOURS_IN_WEEK; i++) {
    const cand = (t + i) % HOURS_IN_WEEK;
    if (inWindow(w, cand)) return cand;
  }
  return t;
}

/**
 * Kéo `t` vào cửa sổ khi cửa sổ vừa đổi. Đang ở trong thì đứng yên — người xem không bị
 * giật khỏi giờ họ đang nhìn chỉ vì vừa mở rộng vùng kéo.
 */
export function clampToWindow(w: WindowBrush | undefined, t: number): number {
  return inWindow(w, t) ? t : nextT(w, t);
}
