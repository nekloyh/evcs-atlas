/**
 * Kéo chọn trên một biểu đồ Observable Plot — hạ tầng chung của ba brush ở dock (§3d).
 *
 * **Vì sao tự viết thay vì thêm thư viện.** §1 chốt Observable Plot làm thư viện biểu đồ
 * duy nhất, và Plot cố tình **không có** brush (nó là ngữ pháp vẽ, không phải bộ widget).
 * Đường thường thấy là thêm `d3-brush`; bỏ, vì nó là một dependency mới cho một việc mà
 * Plot đã cho sẵn thứ khó nhất: `plot.scale("x")` trả về **thang thật đã dựng**, kèm
 * `domain`/`range`, nên đổi pixel ↔ dữ liệu là số học, không phải phỏng đoán.
 *
 * Phần còn lại là ba sự kiện chuột trên một lớp phủ trong suốt. Đó là 60 dòng, và 60 dòng
 * đọc được thì rẻ hơn một gói phải ghim phiên bản (§1b).
 */

import { useEffect, useRef, useState } from "react";

/**
 * Một trục, khai TƯỜNG MINH: miền dữ liệu, miền pixel, dạng biến đổi.
 *
 * **Vì sao không đọc `plot.scale("x").invert`** dù Plot có expose nó. Cái ta cần là một
 * phép đổi pixel ↔ dữ liệu **thuần và test được** (§12): `invert` chỉ tồn tại sau khi biểu
 * đồ đã dựng trong DOM, nên một quy tắc sai ở đó chỉ lộ ra bằng mắt. Khai trục ở đây rồi
 * truyền CÙNG một `domain` và `range` sang Plot thì hai bên không thể lệch nhau, và phép
 * đổi có test riêng.
 *
 * `sqrt` có mặt vì dân số lệch nặng: trên thang tuyến tính, 90% số ô dồn vào góc trái dưới
 * của scatter và không kéo chọn được gì. Căn bậc hai trải phần thấp ra mà vẫn nhận giá trị
 * 0 (log thì không) — và trục vẫn in NGƯỠNG THẬT, nên nó không giấu con số nào (§3b).
 */
export type AxisKind = "linear" | "sqrt";

export interface Axis {
  d0: number;
  d1: number;
  r0: number;
  r1: number;
  kind: AxisKind;
}

const fwd = (k: AxisKind, v: number) => (k === "sqrt" ? Math.sqrt(Math.max(v, 0)) : v);
const inv = (k: AxisKind, v: number) => (k === "sqrt" ? v * v : v);

/** Pixel của một giá trị. */
export function toPx(a: Axis, v: number): number {
  const s = fwd(a.kind, a.d0);
  const e = fwd(a.kind, a.d1);
  if (e === s) return a.r0;
  return a.r0 + ((fwd(a.kind, v) - s) / (e - s)) * (a.r1 - a.r0);
}

/** Giá trị tại một pixel. Kẹp về miền: kéo quá mép là có ý chọn tới hết, không phải huỷ. */
export function toData(a: Axis, px: number): number {
  const s = fwd(a.kind, a.d0);
  const e = fwd(a.kind, a.d1);
  if (a.r1 === a.r0) return a.d0;
  const f = s + ((px - a.r0) / (a.r1 - a.r0)) * (e - s);
  const v = inv(a.kind, Math.min(Math.max(f, Math.min(s, e)), Math.max(s, e)));
  return Math.min(Math.max(v, a.d0), a.d1);
}

/** Vị trí con trỏ trong hệ toạ độ của chính `<svg>` mà Plot dựng. */
function localPoint(el: HTMLElement, e: PointerEvent): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/**
 * Chỉ số ô của một trục RỜI RẠC (`n` ô xếp đều trong `[r0, r1]`) — heatmap 7×24.
 *
 * Kẹp về hai đầu thay vì trả `null` khi con trỏ ra ngoài: người kéo chuột vượt mép biểu đồ
 * là có ý chọn tới hết, không phải có ý huỷ.
 */
export function bandIndex(n: number, r0: number, r1: number, px: number): number {
  if (n === 0 || r1 === r0) return 0;
  const i = Math.floor(((px - r0) / (r1 - r0)) * n);
  return Math.max(0, Math.min(n - 1, i));
}

export interface DragRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Chuẩn hoá một hình chữ nhật kéo: kéo ngược chiều nào cũng ra cùng một hộp. */
export const normalize = (d: DragRect): DragRect => ({
  x0: Math.min(d.x0, d.x1),
  x1: Math.max(d.x0, d.x1),
  y0: Math.min(d.y0, d.y1),
  y1: Math.max(d.y0, d.y1),
});

/**
 * Nối một `<div>` phủ lên biểu đồ với ba sự kiện chuột.
 *
 * `onCommit` nhận hình chữ nhật **theo pixel** — người gọi tự đổi sang dữ liệu bằng thang
 * của chính nó, vì chỉ nó biết brush của mình cần một trục hay hai.
 *
 * Một cú **bấm không kéo** (dưới `CLICK_SLOP` px) là **XOÁ brush**, không phải một brush
 * rộng 0 px: một khoảng rỗng sẽ loại sạch mọi mark và đọc thành "không còn dữ liệu" —
 * §13b-1 gọi đúng đó là nói dối về phủ.
 */
const CLICK_SLOP = 3;

export function useDragRect(
  onCommit: (r: DragRect | null, host: HTMLElement) => void,
): {
  ref: React.RefObject<HTMLDivElement | null>;
  live: DragRect | null;
  /**
   * Vị trí con trỏ khi KHÔNG kéo — nguồn của dòng readout dưới mỗi biểu đồ.
   *
   * Ba biểu đồ của dock brush được nhưng cho tới trước lượt này **không đọc được**: không
   * có cách nào biết cột kia cao bao nhiêu, ô kia bằng mấy phần trăm. Một biểu đồ chỉ chọn
   * được mà không đọc được thì mọi con số trong nó là trang trí — chính là điều nghiệm thu
   * M2 nêu và hoãn lại.
   *
   * Trả về **pixel**, y như `onCommit`: chỉ chỗ gọi mới biết trục của nó là gì. Và readout
   * dùng LẠI đúng `Axis` mà brush dùng, nên con số đọc ra không thể lệch khỏi khoảng chọn
   * được.
   */
  hover: { x: number; y: number } | null;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<DragRect | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Giữ `onCommit` trong ref: hàm này được viết inline ở chỗ gọi nên nó đổi mỗi lần render,
  // và gắn lại listener mỗi lần render sẽ huỷ đúng cú kéo đang diễn ra.
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const down = (e: PointerEvent) => {
      const p = localPoint(el, e);
      start.current = p;
      setLive({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const p = localPoint(el, e);
      setHover(p);
      const s = start.current;
      if (!s) return;
      setLive({ x0: s.x, y0: s.y, x1: p.x, y1: p.y });
    };
    const leave = () => setHover(null);
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      setLive(null);
      if (!s) return;
      const p = localPoint(el, e);
      const moved = Math.abs(p.x - s.x) > CLICK_SLOP || Math.abs(p.y - s.y) > CLICK_SLOP;
      commit.current(moved ? normalize({ x0: s.x, y0: s.y, x1: p.x, y1: p.y }) : null, el);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return { ref, live, hover };
}
