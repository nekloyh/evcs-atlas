/**
 * Mark trạng thái vận hành của trạm — **VÒNG NÉT ĐỨT**, DESIGN.md §4d-3a, M4.1.
 *
 * ── Vì sao NÉT, không phải màu ────────────────────────────────────────────────────────
 *
 * `MAINTENANCE`/`OUT_OF_SERVICE` là một *state* của một mark đã có, không phải một series
 * mới. Hai đường đi bằng màu đều là anti-pattern đã ghi: cấp cho nó một hue riêng phá "một
 * họ màu lạnh duy nhất" (§4d), còn mượn `#fab219` là dùng **màu cảnh báo cho một series**.
 * Nét đứt là kênh còn trống, đọc được ở mọi cỡ chấm, và nó không đụng hệ màu nào — nên nó
 * chồng lên được cả chấm lạnh của overlay lẫn chấm ramp cam của trường `station:occ`.
 *
 * ── Một kiểu nét, một nghĩa ───────────────────────────────────────────────────────────
 *
 * KHÔNG có hai kiểu nét cho hai trạng thái. §4d-3a chốt rõ: vòng nét đứt nói đúng một câu
 * — *"trạm này không vận hành bình thường"* — còn *bảo trì hay ngừng hẳn* là việc của
 * panel TRẠM (§8a). Nhồi hai bậc vào hai kiểu nét sẽ bắt người xem phân biệt 4 px gạch với
 * 6 px gạch ở cỡ hiển thị thật, tức dựng một kênh mà chính nó không đọc được.
 *
 * ── Mực, không phải màu dữ liệu ───────────────────────────────────────────────────────
 *
 * Vòng lấy mực chính `#0b0b0b` của §4e, cùng vai với đường ranh giới BỐI CẢNH và với nét
 * cầu ở cảnh C: nó là **chú thích trên một mark**, không phải một giá trị. Vòng ngoài màu
 * surface 1 px là để nó không dính vào chấm bên dưới ở nội đô — cùng thủ pháp §4d dùng cho
 * mọi overlay điểm.
 */

import { BASEMAP_HEX } from "./palette";

/**
 * Trạm này có đang vận hành bình thường không — quy tắc của cả §4d-3a, ở một chỗ.
 *
 * Sống ở đây chứ không ở `queries.ts` vì hai lý do cùng chiều: đây là **module về trạng
 * thái vận hành** (nó vẽ chính cái mark này), và `queries.ts` kéo theo `duckdb.ts` nên logic
 * thuần nằm ở đó thì `node --test` không import được (§12 — cùng lý do đã tách `h3.ts`).
 *
 * **`UNKNOWN` (5/939) đứng về phía BÌNH THƯỜNG**, và đó là một quyết định chứ không phải
 * một chỗ quên: vòng nét đứt là một *khẳng định* ("trạm này không chạy bình thường"), còn
 * `UNKNOWN` nghĩa là nguồn **không nói gì**. Vẽ nét đứt cho nó là biến "không biết" thành
 * "biết là hỏng" — cùng lỗi mà ràng buộc 1 cấm, chỉ khác kênh. Panel TRẠM nói ra `UNKNOWN`
 * bằng chữ, chỗ đúng của một sự thật không có ký hiệu riêng.
 */
export function isAbnormal(opStatus: string): boolean {
  return opStatus === "MAINTENANCE" || opStatus === "OUT_OF_SERVICE";
}

/** Cạnh ô atlas (px). Vẽ 128 px cho một mark hiển thị 10–20 px: nét đứt phóng không vỡ. */
export const STATUS_ICON_CELL = 128;
export const STATUS_ICON_ID = "abnormal";

/** Mực chính §4e. Vòng này là chú thích, không phải dữ liệu — nó không lấy màu của thang. */
const INK_HEX = "#0b0b0b";

/**
 * Vòng nét đứt vẽ **rộng hơn chấm** bấy nhiêu pixel màn hình.
 *
 * 3 px là khe hở nhỏ nhất còn thấy được ở chấm 4,5 px của overlay (§4d-1) — nhỏ hơn thì
 * vòng dính vào viền surface của chấm và đọc thành "chấm này viền dày hơn", tức thành một
 * bậc của một kênh khác.
 */
export const STATUS_RING_GAP_PX = 3;

/** Bán kính vòng (px màn hình) cho một chấm bán kính `r`. */
export const statusRingRadius = (r: number): number => r + STATUS_RING_GAP_PX;

/** Cỡ icon (px màn hình) — đường kính vòng cộng chỗ cho nét. */
export const statusIconSize = (r: number): number => 2 * statusRingRadius(r) + 4;

export interface StatusIconEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Atlas một ô: vòng tròn nét đứt, giữa RỖNG.
 *
 * Giữa phải rỗng thật (không tô, không nền): chấm bên dưới mang **giá trị** — bậc ramp của
 * `station:occ`, hay tư cách HANOI/BUFFER của overlay — và một mảng đục ở đây sẽ xoá đúng
 * cái nó đang chú thích.
 */
export function buildStatusIconAtlas(): {
  atlasUrl: string;
  mapping: Record<string, StatusIconEntry>;
} {
  const canvas = document.createElement("canvas");
  canvas.width = STATUS_ICON_CELL;
  canvas.height = STATUS_ICON_CELL;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(STATUS_ICON_CELL / 2, STATUS_ICON_CELL / 2);

  // Icon vẽ ở 128 px rồi thu về ~16 px màn hình ⇒ hệ số ~8. Mọi bề rộng dưới đây khai theo
  // px MÀN HÌNH rồi nhân lên, để sửa một con số là sửa thứ mắt thật sự thấy.
  const scale = STATUS_ICON_CELL / statusIconSize(4.5);
  const r = statusRingRadius(4.5) * scale;
  const stroke = 1.4 * scale;

  // Số gạch cố định, độ dài gạch SUY RA từ chu vi — không đặt độ dài rồi để chu vi tự chia.
  // Lý do đến từ ảnh render: một độ dài cố định gần như không bao giờ chia hết chu vi, nên
  // gạch cuối bị cắt cụt và vòng có một chỗ dày bất thường mà mắt đọc thành "có gì đó ở
  // hướng đó". 6 gạch là con số nhỏ nhất còn đọc ra "đứt nét" ở cỡ hiển thị 15–20 px; nhiều
  // hơn thì ở cỡ đó chúng dính lại thành một vòng liền.
  const N_DASHES = 6;
  const period = (2 * Math.PI * r) / N_DASHES;
  const dash = period * 0.58;

  // Nét surface vẽ TRƯỚC và dày hơn: nó là lớp tách vòng khỏi chấm bên dưới, cùng vai với
  // vòng viền surface của mọi overlay điểm (§4d).
  ctx.setLineDash([dash, period - dash]);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = stroke * 2.4;
  ctx.strokeStyle = BASEMAP_HEX;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = INK_HEX;
  ctx.stroke();

  return {
    atlasUrl: canvas.toDataURL(),
    mapping: {
      [STATUS_ICON_ID]: { x: 0, y: 0, width: STATUS_ICON_CELL, height: STATUS_ICON_CELL },
    },
  };
}
