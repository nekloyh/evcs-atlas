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
 * Cách đó là **mã hoá trùng** trên một miền: màu liên tục và chiều cao cùng đọc
 * `scale.domain` + `scale.transform`; ở chế độ bậc, màu giữ các bậc đã QA còn chiều cao
 * vẫn giữ độ lớn bên trong bậc. Giá trị ngoại lai bị chặn ở biên khai trong Registry và
 * plateau được legend công bố, nên 3D không dựng một thang ngầm thứ hai.
 *
 * ── CỰC TÍNH KHÔNG VÀO ĐÂY ────────────────────────────────────────────────────────────
 *
 * `elevationFor` nhận đúng hai thứ: giá trị và thang. `polarity` **không** phải tham số,
 * và đó là cố ý: cực tính chỉ lật ánh xạ bậc→MÀU để giữ bất biến "đậm = chỗ cần can
 * thiệp" (§M2.1-B); nó không đổi bậc. Cho nó vào đây là dựng hai quy tắc cho một câu hỏi,
 * và làm mất bất biến dễ đọc nhất của thang tuần tự: **cao = giá trị lớn**. Với thang
 * phân kỳ, hợp đồng Registry đổi câu đó thành **cao = xa mốc**.
 */

import {
  elevationPosition,
  type CellValue,
  type NumericDomain,
  type Scale,
  type ScaleContract,
} from "../viz/palette";
import type { NationalUnit } from "./fields";
import { RES_BASE } from "./lod";

/**
 * Chiều cao liên tục CAO NHẤT, mét.
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
 * trên màn. Đó chính là lý do legend phải in ra rằng chiều cao là mã hoá — nó không phải một
 * đại lượng đo được bằng thước.
 *
 * Con số này là hằng số THẬT, không giấu sau `elevationScale`: một hằng số có tên thì đọc
 * được ở đây, còn một hệ số nhân trên layer thì phải nhân nhẩm mới biết khối cao bao nhiêu.
 */
export const MAX_ELEV_M = 14_000;
export const MAX_ELEV_R8_M = 1_800;
export const ELEVATION_FLOOR = 0.02;

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
 *  1. **Không đo được ⇒ 0**. Ô đó vẫn vẽ VÂN xám như ở 2D.
 *  2. **Mọi ô CÓ ĐO đều nhô lên**, kể cả giá trị ở sàn miền — vì thế có sàn 2%. Không có
 *     nó thì giá trị đo ở `lo` cao đúng 0 m, tức **trông y hệt ô
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
  if (!scale || scale.kind !== "numeric" || scale.n === 0) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const position = elevationPosition(value, scale);
  return max * Math.max(ELEVATION_FLOOR, position);
}

function transformName(contract: ScaleContract): string {
  return contract.transform === "sqrt" ? "thang căn bậc hai" : "thang tuyến tính";
}

function ceilingName(contract: ScaleContract): string {
  return contract.clip.hi === "p99" ? "trần p99" : "không cắt trần";
}

/**
 * Câu mô tả kênh chiều cao ở legend — THUẦN và có test, vì đây đúng là chỗ đã nói dối một
 * lần (QA 2.1-002): chiều cao đã chuyển sang LIÊN TỤC trên miền {transform, clip} nhưng
 * legend vẫn tuyên bố "N bậc". Câu này đọc từ chính `ScaleContract` của trường và
 * `NumericDomain` của thang đang vẽ, nên nó không thể trôi khỏi công thức của
 * `elevationFor` mà không đổi cùng một khai báo.
 */
export function elevationDisclosure(
  contract: ScaleContract,
  domain: NumericDomain | null,
): string {
  const overflow =
    domain && domain.nClippedHigh > 0
      ? ` · ${domain.nClippedHigh.toLocaleString("vi-VN")} ô vượt trần cao bằng trần`
      : "";
  return (
    `chiều cao = cùng trường đang tô, liên tục theo ${transformName(contract)} · ` +
    `${ceilingName(contract)}${overflow} · không đo bằng thước · ô không đo được giữ phẳng`
  );
}

/** Chú thích của nút 3D — cùng nguồn khai báo với `elevationDisclosure`, chỉ ngắn hơn. */
export function elevationButtonNote(contract: ScaleContract): string {
  return `đùn ô gộp liên tục theo ${transformName(contract)} của trường đang tô, ${ceilingName(contract)}, pitch 50°`;
}
