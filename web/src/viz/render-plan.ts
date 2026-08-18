/**
 * "Vẽ gì ở mức zoom này" — DESIGN.md §6b và §13b-1.
 *
 * Tách ra thành hàm THUẦN có chủ ý (§12): đây là một **quy tắc**, không phải một phân bố.
 * Ảnh chụp chứng minh được rằng ở zoom 9,3 hex không vẽ; nó không chứng minh được rằng
 * ngưỡng đúng ở mọi zoom, mọi đơn vị đọc, mọi loại trường. Cái đó cần assert.
 */

import type { ReadingUnit } from "../state/types";
import { HEX_MIN_ZOOM } from "../design-tokens";

export { HEX_MIN_ZOOM };

/**
 * Dưới mức này, ô H3 không được vẽ — DESIGN §13b-1.
 *
 * Không phải con số cảm tính: §13a-1 đo được ô r8 rộng ~9 px ở zoom 9,3, và mỗi bậc zoom
 * nhân đôi ⇒ `9 × 2^(z − 9,3)`. Ở z11 ra ~29 px, chỗ ô lục giác thôi là hạt và bắt đầu là
 * vật thể chỉ tay vào được. Dưới đó, 4,4 nghìn mark là texture chứ không phải bản đồ.
 */
/** Bề rộng xấp xỉ của một ô H3 r8 theo pixel ở mức zoom cho trước. Neo: 9 px tại z 9,3. */
export function hexPixelWidth(zoom: number): number {
  return 9 * 2 ** (zoom - 9.3);
}

/**
 * Hình học nào đang mang trường — đúng MỘT, hoặc không cái nào. Ràng buộc 2 (§6b).
 *
 * Tên `Paint` giữ nguyên dù `road` không phải một *mặt*: cái đang được đặt tên là "hình
 * học nào mang trường", và §6b đã nói rõ đó là câu hỏi đúng — không phải "mặt nào được tô".
 */
export type Paint = "hex" | "commune" | "road" | "station" | "surface" | "none";

export interface PlanInput {
  unit: ReadingUnit;
  zoom: number;
  /** Trường này có bản vẽ dạng mặt liên tục không (§1b). Chỉ đại lượng CỘNG ĐƯỢC mới có. */
  hasSurface: boolean;
  /**
   * Tập ô đã được **thu hẹp** bằng một điều kiện — DESIGN §13b-2.
   *
   * §13b cho hex hai giấy phép: (a) zoom sâu, **hoặc (b) đã lọc còn vài trăm ô mang một
   * tính chất**. `HEX_MIN_ZOOM` thực thi (a) và vô tình chặn luôn (b), nên cảnh C — cảnh mà
   * §13b lấy làm ví dụ cho chính (b) — không dựng được. Cờ này mở lại (b).
   *
   * Chỗ khác nhau nằm ở việc mắt phải làm gì: thảm hex bắt phân biệt **giá trị** ở 4.400 vị
   * trí (cần ô rộng 29 px); tập đã lọc chỉ hỏi **có mark hay không** (đọc được ở 9 px, và
   * hình dạng của tập mới là phát biểu). Chỉ cảnh CÂU CHUYỆN được đặt cờ này.
   */
  filtered?: boolean;
  /**
   * Đang ở trong một cảnh CÂU CHUYỆN — quyết định **mặt độ cầu còn được vẽ hay không**.
   *
   * Mặt liên tục sinh ra ở M2 với vai "thứ vẽ khi zoom quá xa để đọc 4.400 hex" (§1b,
   * §13a-1). Trên BẢN ĐỒ, vai đó **đã bị chủ dự án bỏ** (2026-08-07): ở z9,3 mặt gộp 3 km
   * với `opacity 0.85` phủ kín thành phố thành một khối cam — nó nuốt đường, nuốt đường
   * ranh giới, và **lấp luôn những lỗ hổng** (chỗ không có ai) vốn là một nửa nội dung của
   * trường dân số. Vành nhạt nhất còn loang ra ngoài ranh giới, là sản phẩm của phép làm
   * mượt 3 km chứ không phải người thật. Đổi lại: 4.400 ô H3 ở 9 px không đọc được từng
   * bậc màu — đó là cái giá, và §13a-1 vẫn đúng về nó.
   *
   * Trong cảnh A (`von-cuc`) thì mặt Ở LẠI, vì ở đó nó **là luận điểm** chứ không phải một
   * cách tô: cảnh đó nói "cầu vón cục", và mặt liên tục là mark của chính câu đó (§13d-A).
   * Cùng khuôn với `bridges`/`routes`: **cảnh sở hữu mark của nó** (§9a, L1), và một mark
   * chỉ sống trong một cảnh không phải một ngoại lệ ở đây — nó là quy tắc đã có.
   */
  inStory?: boolean;
}

export interface Plan {
  paint: Paint;
  /**
   * Vì sao không vẽ gì — để UI **nói ra** thay vì để bản đồ trống. Bản đồ trống đọc thành
   * "không có dữ liệu ở đây", đúng loại nói dối mà ràng buộc 1 cấm, chỉ khác là nói dối về
   * phủ thay vì về giá trị.
   */
  reason?: "zoom";
  /**
   * Đang vẽ hex DƯỚI `HEX_MIN_ZOOM` — ô nhỏ hơn mức đọc được từng bậc màu.
   *
   * §13a-1 vẫn đúng: ở 9 px thảm hex là texture. Cái đổi ở M5.1 là **hình phạt**: trước đây
   * hình phạt là không vẽ gì, và bản đồ trống nói sai nhiều hơn một bản đồ thô. Cờ này để
   * legend nói ra "đang đọc thô", tức giữ lời cảnh báo mà bỏ cái giá.
   */
  coarse?: boolean;
}

/**
 * Đúng một mặt được tô tại mọi thời điểm.
 *
 * - Trường của **xã**: luôn tô đa giác xã. 126 mảng ở z9,3 rộng hàng trăm px nên không có
 *   ngưỡng zoom nào ở đây — đó chính là lý do xã là từ vựng của zoom thấp.
 * - Trường của **ô** từ `HEX_MIN_ZOOM` trở lên: tô hex.
 * - Trường của **ô** dưới ngưỡng: tô **mặt liên tục** nếu trường cộng được (§13b: "ở zoom
 *   thấp, cầu vẽ bằng mặt liên tục, không bằng hex"), còn không thì **không vẽ gì** và
 *   nói vì sao.
 *
 * `filtered` đứng TRƯỚC ngưỡng zoom và SAU đơn vị đọc (§13b-2). Trước ngưỡng vì đó là cả
 * mục đích của nó; sau đơn vị đọc vì một trường của xã tô đa giác xã dù có lọc hay không —
 * bộ lọc thu hẹp tập ô, nó không đổi hình học nào đang mang trường.
 */
export function renderPlan({ unit, zoom, hasSurface, filtered, inStory }: PlanInput): Plan {
  if (unit === "commune") return { paint: "commune" };
  // Mạng đường cũng không có ngưỡng zoom, và vì cùng lý do với xã: một đoạn đường là một
  // đường, không phải một ô — nó đọc được ở mọi mức phóng vì cái mắt đọc là HÌNH DẠNG của
  // mạng lưới, không phải diện tích của từng mark. Ở z9,3 mạng đường Hà Nội vẫn là một
  // hình nhận ra được, còn 4.400 hex thì không (§13a-1).
  if (unit === "road") return { paint: "road" };
  // Chấm trạm cũng không có ngưỡng zoom (§6b, M4), và vì cùng lý do với đường: ngưỡng
  // `HEX_MIN_ZOOM` tồn tại vì một MẶT LÁT KÍN 4.400 ô bắt mắt phân biệt bậc màu ở từng vị
  // trí, mà ở 9 px thì không phân biệt nổi. 939 chấm là mark RỜI: bề rộng do ta đặt, và
  // cái mắt đọc là "chỗ nào có chấm, chấm đó đậm cỡ nào" — hình dáng của tập chấm mới là
  // phát biểu, và ở zoom thấp mới nhìn thấy được nó (cùng lập luận §13b-2 dùng cho hex đã
  // lọc). Ép ngưỡng vào đây sẽ giấu mất chính cái mà scrubber dựng ra để cho xem.
  if (unit === "station") return { paint: "station" };
  if (filtered) return { paint: "hex" };
  if (zoom >= HEX_MIN_ZOOM) return { paint: "hex" };
  // Dưới ngưỡng zoom, TRONG CẢNH: trường có mặt liên tục vẽ mặt (mặt là luận điểm của cảnh
  // A), trường không có thì không vẽ. Cảnh chốt khung nhìn của chính nó, nên "quá xa để đọc"
  // ở đó là một lựa chọn của người viết cảnh chứ không phải chỗ người xem tình cờ dừng lại.
  if (inStory) return hasSurface ? { paint: "surface" } : { paint: "none", reason: "zoom" };
  // Dưới ngưỡng zoom, trên BẢN ĐỒ: **luôn vẽ ô H3**.
  //
  // Sửa ở M5.1. Trước đó chỉ trường có `surface: true` mới được vẽ dưới ngưỡng, mà đúng MỘT
  // trường trong 45 trường có cờ đó (`population`). Hậu quả người dùng thấy: mở bản đồ ở
  // khung nhìn mặc định (z9,3 — dưới ngưỡng) thì dân số hiện, còn chung cư / POI / trạm /
  // đường trong ô đều là bản đồ TRẮNG, và phải phóng gần mới có gì. Cờ `surface` trả lời câu
  // "trường này có gộp mượt được không"; nó đã bị đọc thành "trường này có được vẽ ở zoom
  // thấp không" — hai câu hỏi khác nhau, và câu thứ hai không có lý do gì để phân biệt trường.
  //
  // Quyết định 2026-08-07 đã chọn hex-thay-vì-mặt ở zoom thấp cho `population` vì "thà đọc
  // khó từng bậc màu còn hơn không thấy đường, ranh giới và các lỗ hổng". Lý lẽ đó không có
  // chỗ nào phụ thuộc vào `hasSurface` — nó áp cho mọi trường của ô. `coarse` giữ lại phần
  // đúng của §13a-1: nói ra rằng đang đọc thô.
  return { paint: "hex", coarse: true };
}

/**
 * Đầu vào tối thiểu của một plan, lấy thẳng từ state ứng dụng.
 *
 * Có kiểu riêng vì đó là cả điểm: hai chỗ gọi `renderPlan` PHẢI đi qua đây, nên chúng
 * không thể truyền hai bộ tham số khác nhau.
 */
export interface PlanSource {
  readAs: ReadingUnit;
  hasSurface: boolean;
  zoom: number;
  filtered: boolean;
  inStory: boolean;
}

/**
 * Plan mà BẢN ĐỒ và LEGEND cùng dùng — một hàm, một bộ đầu vào.
 *
 * Trước đây hai bên tự gọi `renderPlan` với hai bộ tham số khác nhau: `MapView` truyền
 * `filtered: Boolean(filter)`, `Legend` bỏ hẳn khoá đó. Trong một nhịp CÂU CHUYỆN có lọc ô
 * ở zoom < 11, bản đồ nhận `{paint:"hex"}` còn legend nhận `{paint:"none", reason:"zoom"}` —
 * legend nói "không vẽ" trong khi bản đồ đang vẽ. Đúng cái desync mà chú thích ở `Legend`
 * nói nó tồn tại để chặn.
 *
 * Nguyên nhân là HÌNH DẠNG: hai call site cùng *tính lại* một plan thay vì *chia nhau* một
 * plan. Hàm này biến việc truyền lệch nhau thành không thể — thêm một đầu vào là thêm vào
 * `PlanSource`, và cả hai bên nhận nó cùng lúc.
 */
export function planFor(src: PlanSource): Plan {
  return renderPlan({
    unit: src.readAs,
    zoom: src.zoom,
    hasSurface: src.hasSurface,
    filtered: src.filtered,
    inStory: src.inStory,
  });
}
