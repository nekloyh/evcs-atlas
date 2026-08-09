/**
 * Chiều cao khối của chế độ 3D ở bậc TOÀN QUỐC — phần THUẦN, có test (§12).
 *
 * File riêng và **không import gì từ `data/duckdb`**: `national/data.ts` kéo theo
 * `duckdb.ts`, mà file đó `import` các `.wasm?url` của Vite — thứ `node --test` không giải
 * được. Logic nằm trong đó là logic không test được, và đây đúng là loại logic phải có
 * test: một quy tắc trên thang đo, sai mà không nổ.
 *
 * ── VÌ SAO ĐÙN Ô LÀ MỘT NGOẠI LỆ CÓ CHỦ Ý ─────────────────────────────────────────────
 *
 * §4d-1 cấm kích thước chở giá trị, và cả app tuân thủ: bán kính chấm trạm là hằng theo
 * zoom, `POI_BLOCK_HEIGHT_M` là hằng 40 m. Đùn ô r6 phá luật đó — nên nó phải phá theo
 * đúng một cách và nói ra cách ấy.
 *
 * Cách đó là **mã hoá trùng**: chiều cao đọc từ `classOf(value, scale)`, đúng con số sinh
 * ra màu. Hệ quả là 3D **không thêm một thang thứ hai** — nó chỉ dựng cùng bảy bậc mà
 * legend đang in lên khỏi mặt phẳng.
 *
 * Lấy giá trị THÔ thì hỏng theo kiểu im lặng: bậc cuối là một khoảng MỞ (với
 * `ports_per_10k_pop` nó bắt đầu ở 11 và chạy tới 230,7), nên một ô ngoại lai sẽ vọt lên
 * trời trong khi vẫn mang đúng màu bậc cuối như hàng xóm — bản đồ có hai thang mà legend
 * chỉ in một.
 *
 * ── CỰC TÍNH KHÔNG VÀO ĐÂY ────────────────────────────────────────────────────────────
 *
 * `elevationFor` nhận đúng hai thứ: giá trị và thang. `polarity` **không** phải tham số,
 * và đó là cố ý: cực tính chỉ lật ánh xạ bậc→MÀU để giữ bất biến "đậm = chỗ cần can
 * thiệp" (§M2.1-B); nó không đổi bậc. Cho nó vào đây là dựng hai quy tắc cho một câu hỏi,
 * và làm mất bất biến dễ đọc nhất của chế độ này: **cao = giá trị lớn**, ở mọi trường.
 */

import { classCount, classOf, type CellValue, type Scale } from "../viz/palette";
import type { NationalUnit } from "./fields";
import { RES_BASE } from "./lod";

/**
 * Chiều cao của bậc CAO NHẤT, mét.
 *
 * **Hiệu chuẩn bằng ảnh render ở z4,6 (khung nhìn mặc định của cả nước), pitch 50°** —
 * không phải bằng một con số tròn cho đẹp. Mốc: khối cao nhất trông cao khoảng **1–1,5 lần
 * bề ngang một ô r6** ở đúng mức phóng đó. Cao hơn thì thảm ô thành một rừng cột che chính
 * nó; thấp hơn thì chênh lệch bậc không đọc được, và 3D chỉ còn là hiệu ứng.
 *
 * ── Bốn lần chụp, và một chỗ dễ hiểu nhầm cái mốc ─────────────────────────────────────
 *
 * Ở khung nhìn mặc định đo được **~2,3 km/px**, còn một ô r6 (~40,1 km²) rộng ~6,8 km, tức
 * **~3 px trên màn**. Vì thế phải đọc cái mốc theo TỈ LỆ NHÌN THẤY, không theo mét:
 *
 *   ·  4.500 m (≈1 lần *cạnh* ô tính bằng mét) — **thảm phẳng**, không thấy một khối nào
 *   · 12.000 m — mới lấm tấm, chưa đọc ra bậc
 *   · **14.000 m — bậc đọc được: thấy mặt bên, thấy ruộng bậc thang của bảy bậc,
 *      nền và ranh giới tỉnh vẫn nhìn xuyên qua được**  ← chốt ở đây
 *   · 25.000 m — nổi rõ hơn nhưng khối bắt đầu che hàng xóm
 *   · 40.000 m (giá trị khởi điểm) — **rừng cột**: hai đồng bằng thành một mảng đặc,
 *      ranh giới tỉnh bị chôn
 *
 * 14 km là ~3,6 lần cạnh ô tính theo mét, và điều đó phải nói ra: ở một khung nhìn cả nước
 * thì chiều cao **buộc phải phóng đại** so với tỉ lệ mặt đất, nếu không nó không tồn tại
 * trên màn. Đó chính là lý do legend phải in ra rằng chiều cao là bậc — nó không phải một
 * đại lượng đo được bằng thước.
 *
 * Con số này là hằng số THẬT, không giấu sau `elevationScale`: một hằng số có tên thì đọc
 * được ở đây, còn một hệ số nhân trên layer thì phải nhân nhẩm mới biết khối cao bao nhiêu.
 */
export const MAX_ELEV_M = 14_000;

/**
 * Trần chiều cao ở MỘT bậc lưới — hằng trên là giá trị ở bậc gốc r6.
 *
 * Cái mốc hiệu chuẩn là một **tỉ lệ** ("khối cao ≈ 1–1,5 lần bề ngang ô"), không phải một
 * số mét. Mỗi bậc H3 chia ô thành 7 phần, tức bề ngang co lại **√7 ≈ 2,65 lần**. Giữ
 * nguyên 14 km khi LOD nhảy lên r7 là giữ chiều cao mà bỏ mẫu số: cùng cảnh ấy thành một
 * **rừng cột** — đúng thứ đã bị loại ở 40 km trên r6, chỉ khác là đến bằng đường khác.
 *
 * Chia theo √7 giữ tỉ lệ nhìn thấy không đổi qua cú nhảy bậc, nên phóng vào không làm bản
 * đồ đổi tính cách. r7 ⇒ ~5.290 m.
 */
export function maxElevFor(res: number): number {
  return MAX_ELEV_M / Math.sqrt(7) ** (res - RES_BASE);
}

/**
 * Bậc này có đùn được không — quyết định 1 của chế độ 3D.
 *
 * Chỉ Ô GỘP r6. 34 khối tỉnh là một **biểu đồ cột méo theo phối cảnh**, không phải một bản
 * đồ: khối của tỉnh ở gần camera cao hơn khối cùng giá trị ở xa, và không có trục nào để
 * đọc lại. Nút 3D vì thế phải MỜ khi đang xem một trường tỉnh, chứ không phải bấm được rồi
 * không thấy gì đổi (§3a).
 */
export function can3D(unit: NationalUnit): boolean {
  return unit === "cell";
}

/**
 * Chiều cao (mét) của một ô, từ giá trị + thang đang dùng. Hàm THUẦN.
 *
 * Hai luật, và luật thứ hai mới là luật khó:
 *
 *  1. **Không đo được ⇒ 0** (`classOf` trả `null`). Ô đó vẫn vẽ VÂN xám như ở 2D.
 *  2. **Mọi ô CÓ ĐO đều nhô lên**, kể cả bậc thấp nhất — vì thế là `(k + 1) / n` chứ không
 *     phải `k / (n - 1)`. Không có sàn này thì bậc 1 cao đúng 0 m, tức **trông y hệt ô
 *     không đo được**, và "chưa ai đo" đọc thành "đo ra bằng 0" — cùng họ với bẫy "meter
 *     rỗng đọc thành 0%".
 *
 * `scale` là `null` khi dữ liệu chưa về: trả 0, không đoán.
 *
 * `max` là TRẦN, không phải một tham số thứ ba quyết định chiều cao: nó chỉ đổi đơn vị của
 * cả thang (xem `maxElevFor`), không đổi ô nào cao hơn ô nào. Nó có giá trị mặc định nên
 * `elevationFor.length` vẫn là 2 — bất biến "chỉ giá trị và thang quyết định thứ tự" còn
 * nguyên và test vẫn ghim được nó.
 */
export function elevationFor(
  value: CellValue,
  scale: Scale | null,
  max: number = MAX_ELEV_M,
): number {
  if (!scale) return 0;
  const k = classOf(value, scale);
  if (k === null) return 0;
  const n = classCount(scale);
  if (n <= 0) return 0;
  return (max * (k + 1)) / n;
}
