/**
 * Atlas icon cho mark POI — §4d-4. Vẽ một lần bằng canvas lúc module nạp, 8 ô:
 * 4 hình dạng × (đặc | rỗng).
 *
 * Màu NƯỚNG THẲNG vào atlas (`mask: false`): mark đặc cần HAI màu cùng lúc — thân
 * `#1c5cab` và vòng viền surface `#f2f3f0` để tách khỏi ô bên dưới (§4d) — mà chế độ
 * mask của IconLayer chỉ nhuộm được một màu.
 */

import { BASEMAP_HEX, COLD_HEX } from "./palette";
import type { PoiShape } from "../data/poi";

/** cạnh một ô atlas (px). Icon trên màn ~5–11 px, vẽ 64 px để phóng không vỡ. */
export const ICON_CELL = 64;

const POI_HEX = COLD_HEX[1]; // #1c5cab — lạnh vừa, một màu cho cả 4 nhóm (§4d-4)

/** Đường bao của một hình, tâm (0,0), "bán kính" r. */
function trace(ctx: CanvasRenderingContext2D, shape: PoiShape, r: number): void {
  ctx.beginPath();
  if (shape === "square") {
    const s = r * 0.9;
    ctx.rect(-s, -s, s * 2, s * 2);
  } else if (shape === "diamond") {
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 1.15, 0);
    ctx.lineTo(0, r * 1.15);
    ctx.lineTo(-r * 1.15, 0);
    ctx.closePath();
  } else if (shape === "triangle") {
    // tam giác đều, trọng tâm tại (0,0)
    const R = r * 1.2;
    ctx.moveTo(0, -R);
    ctx.lineTo(R * Math.sin((2 * Math.PI) / 3), -R * Math.cos((2 * Math.PI) / 3));
    ctx.lineTo(R * Math.sin((4 * Math.PI) / 3), -R * Math.cos((4 * Math.PI) / 3));
    ctx.closePath();
  } else {
    // chữ thập — hai thanh vuông góc
    const w = r * 0.42;
    const L = r * 1.1;
    ctx.moveTo(-w, -L);
    ctx.lineTo(w, -L);
    ctx.lineTo(w, -w);
    ctx.lineTo(L, -w);
    ctx.lineTo(L, w);
    ctx.lineTo(w, w);
    ctx.lineTo(w, L);
    ctx.lineTo(-w, L);
    ctx.lineTo(-w, w);
    ctx.lineTo(-L, w);
    ctx.lineTo(-L, -w);
    ctx.lineTo(-w, -w);
    ctx.closePath();
  }
}

export interface IconEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function iconId(shape: PoiShape, filled: boolean): string {
  return `${shape}-${filled ? "filled" : "hollow"}`;
}

const SHAPES: PoiShape[] = ["square", "diamond", "triangle", "cross"];

/**
 * Vẽ atlas. Trả canvas + mapping cho IconLayer.
 *
 * Tỉ lệ nét theo cỡ ô: icon 64 px hiện trên màn ~8–10 px, nên "2 px màn hình" ≈ 13 px
 * atlas. Nét vẽ ở đây là HẰNG SỐ theo tỉ lệ icon — cùng luật với bán kính (§4d-1): mọi
 * mark co cùng nhau theo zoom, không mark nào nói gì khác mark nào.
 */
export function buildPoiIconAtlas(): {
  /** data-URI của atlas — IconLayer nhận chuỗi URL, và atlas chỉ 256×128 px */
  atlasUrl: string;
  mapping: Record<string, IconEntry>;
} {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_CELL * SHAPES.length;
  canvas.height = ICON_CELL * 2;
  const ctx = canvas.getContext("2d")!;
  const mapping: Record<string, IconEntry> = {};
  const r = ICON_CELL * 0.3;
  const ringPx = ICON_CELL * 0.16; // ~2 px màn hình ở cỡ hiển thị 8 px
  const strokePx = ICON_CELL * 0.18; // nét của mark rỗng — phải sống được ở 6 px màn hình

  SHAPES.forEach((shape, col) => {
    // hàng 0: ĐẶC (thân lạnh + vòng viền surface); hàng 1: RỖNG (chỉ nét lạnh)
    for (const filled of [true, false]) {
      const row = filled ? 0 : 1;
      ctx.save();
      ctx.translate(col * ICON_CELL + ICON_CELL / 2, row * ICON_CELL + ICON_CELL / 2);
      if (filled) {
        trace(ctx, shape, r);
        ctx.lineWidth = ringPx * 2; // stroke đè nửa trong nửa ngoài ⇒ vòng viền ringPx
        ctx.strokeStyle = BASEMAP_HEX;
        ctx.stroke();
        trace(ctx, shape, r);
        ctx.fillStyle = POI_HEX;
        ctx.fill();
      } else {
        trace(ctx, shape, r);
        ctx.lineWidth = strokePx;
        ctx.strokeStyle = POI_HEX;
        ctx.stroke();
      }
      ctx.restore();
      mapping[iconId(shape, filled)] = {
        x: col * ICON_CELL,
        y: row * ICON_CELL,
        width: ICON_CELL,
        height: ICON_CELL,
      };
    }
  });
  return { atlasUrl: canvas.toDataURL(), mapping };
}
