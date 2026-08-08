/**
 * Icon mark trạm biến áp — **SAO 5 CÁNH**, §4d-4. Một ô atlas, vẽ một lần lúc module nạp.
 *
 * Vì sao một atlas RIÊNG chứ không thêm cột vào `poi-icons.ts`: atlas kia là atlas của
 * **4 nhóm POI** — nó nướng sẵn cặp đặc/rỗng mang nghĩa "có polygon ↔ chỉ biết vị trí".
 * Trạm biến áp không có cặp đó (xem dưới), nên nhét nó vào sẽ tạo một ô rỗng vô nghĩa
 * trong một bảng mà mọi ô khác đều có nghĩa.
 *
 * **Chỉ MỘT biến thể, đặc.** Đặc/rỗng ở hai lớp kia đều mã hoá một tư cách thứ hai
 * (HANOI ↔ BUFFER ở trạm sạc; có-polygon ↔ chỉ-điểm ở POI). Lớp này cố ý không có tư
 * cách thứ hai nào — nó nói đúng một điều — nên nó không được mượn một kênh đang mang
 * nghĩa ở chỗ khác. Đặc + vòng viền 2 px màu surface là đúng công thức §4d cho overlay
 * dạng ĐIỂM.
 *
 * Màu: `#0d366b` (lạnh đậm, 8,90:1 so với surface) — hex đã có trong §4d, không màu mới
 * nào phải đo lại. Trùng màu thân với chấm trạm sạc là chấp nhận được **theo đúng §4d**:
 * danh tính đến từ hình dạng, không từ hue, và kênh hue đã được đo là ĐẦY (§4d-4).
 */

import { BASEMAP_HEX, COLD_HEX } from "./palette";

/** cạnh ô atlas (px). Icon trên màn 6–12 px, vẽ 64 px để phóng không vỡ. */
export const SUBSTATION_ICON_CELL = 64;
export const SUBSTATION_ICON_ID = "substation";

const SUBSTATION_HEX = COLD_HEX[2]!; // #0d366b — lạnh đậm

/**
 * Sao 5 cánh, tâm (0,0).
 *
 * `inner = 0,42 × outer` là độ lõm cần để 5 cánh sống sót sau vòng viền 2 px: nông hơn
 * thì vòng viền lấp đầy khe và bóng ngoài trở về gần một ngũ giác — mà ngũ giác ở 8 px
 * đọc thành hình TRÒN, tức thành chấm trạm sạc.
 */
function traceStar(ctx: CanvasRenderingContext2D, r: number): void {
  const inner = r * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = rad * Math.cos(a);
    const y = rad * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export interface IconEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildSubstationIconAtlas(): {
  atlasUrl: string;
  mapping: Record<string, IconEntry>;
} {
  const canvas = document.createElement("canvas");
  canvas.width = SUBSTATION_ICON_CELL;
  canvas.height = SUBSTATION_ICON_CELL;
  const ctx = canvas.getContext("2d")!;
  const r = SUBSTATION_ICON_CELL * 0.42;
  const ringPx = SUBSTATION_ICON_CELL * 0.13; // ~2 px màn hình ở cỡ hiển thị ~10 px

  ctx.translate(SUBSTATION_ICON_CELL / 2, SUBSTATION_ICON_CELL / 2);
  // stroke trước rồi fill đè: nét đè nửa trong nửa ngoài, nên phần còn thấy được là một
  // vòng viền dày `ringPx` bao ngoài đúng đường bao — cùng thủ pháp `poi-icons.ts`.
  traceStar(ctx, r);
  ctx.lineJoin = "round";
  ctx.lineWidth = ringPx * 2;
  ctx.strokeStyle = BASEMAP_HEX;
  ctx.stroke();
  traceStar(ctx, r);
  ctx.fillStyle = SUBSTATION_HEX;
  ctx.fill();

  return {
    atlasUrl: canvas.toDataURL(),
    mapping: {
      [SUBSTATION_ICON_ID]: {
        x: 0,
        y: 0,
        width: SUBSTATION_ICON_CELL,
        height: SUBSTATION_ICON_CELL,
      },
    },
  };
}
