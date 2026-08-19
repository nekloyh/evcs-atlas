/**
 * Phase 4 — phiên dữ liệu của biểu đồ (PHASE4_VISUALIZATION.md §4.1, §5.2).
 *
 * Sở hữu vòng đời nạp dữ liệu RIÊNG của biểu đồ: cache theo phiên bộ dữ liệu, và Q-P4-4.
 * `LensChartController` gọi vào đây thay vì gọi thẳng `queries.ts` — §5.2 nói controller
 * chỉ được "chọn model/state đang hoạt động và nối callback", còn SQL cùng cache thuộc
 * tầng dữ liệu.
 *
 * **Vì sao cache là singleton của module chứ không phải một `Map` khoá theo `datasetId`:**
 * đổi tỉnh trong app này là `location.reload()` (xem `data/province.ts`), nên vòng đời
 * module ĐÚNG BẰNG vòng đời một phiên bộ dữ liệu. Một kết quả của bộ cũ không thể tồn tại
 * để công bố nhầm vào bộ mới (§3.4 mục 42) — không phải nhờ gắn thẻ, mà nhờ kiến trúc.
 * `assertDatasetSession()` khoá giả định đó lại: ngày nào chuyển bộ dữ liệu KHÔNG còn tải
 * lại trang, nó sẽ ném ngay tại đây thay vì trả dữ liệu tỉnh cũ dưới nhãn tỉnh mới.
 */

import { fetchOpportunityCommunes, resetOpportunityCommuneCache } from "./queries";
import { PROVINCE } from "./province";
import type { OpportunityCommuneRow } from "../viz/chart-models";

let sessionDatasetId: string | null = null;

/**
 * Bộ dữ liệu của phiên. Lần gọi đầu ghi nhận, các lần sau đối chiếu.
 *
 * Ném khi lệch: một cache không khoá theo bộ dữ liệu mà bộ dữ liệu lại đổi được trong
 * cùng một phiên là đúng cái bẫy "kết quả cũ công bố vào phiên mới".
 */
function assertDatasetSession(): void {
  const current = PROVINCE ?? "";
  sessionDatasetId ??= current;
  if (sessionDatasetId !== current) {
    throw new Error(
      `Phiên biểu đồ mở cho bộ dữ liệu ${sessionDatasetId} nhưng nay đang là ${current}. ` +
        "Cache của phiên phải bị huỷ trước khi đổi bộ dữ liệu (§3.4).",
    );
  }
}

/**
 * Q-P4-4 — gộp lưới theo xã cho lens Cơ hội.
 *
 * Nạp LƯỜI: chỉ chạy lần đầu mở lens Cơ hội, và dùng lại kết quả cho mọi lần quay lại lens
 * hay đổi lựa chọn (§6.5 mục 39). Lần hỏng bị xoá khỏi cache để nút "Thử lại" gọi thật.
 */
export function loadOpportunityCommunes(): Promise<readonly OpportunityCommuneRow[]> {
  assertDatasetSession();
  return fetchOpportunityCommunes();
}

/** Huỷ cache của phiên — dành cho test và cho một lần đổi bộ dữ liệu không tải lại trang. */
export function resetChartSession(): void {
  sessionDatasetId = null;
  resetOpportunityCommuneCache();
}
