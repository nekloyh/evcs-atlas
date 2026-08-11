/**
 * Overlay nào **dựng được** trên bộ dữ liệu đang mở — DESIGN.md §3a và §4d.
 *
 * ── Vì sao có file này ────────────────────────────────────────────────────────────────
 *
 * Tab LAYER liệt 9 overlay vô điều kiện. Ở chế độ TỈNH, hai trong số đó bật lên và **bản
 * đồ không đổi gì**: `beyond2km` đọc một cột không tồn tại (mọi ô về `null`, không ô nào
 * lọt ngưỡng), `substations` đọc một file tỉnh không ship (404 → `EMPTY_FC`). Không câu
 * nào nói vì sao. Đó đúng là thứ §3a cấm: **giao diện hứa một thứ nó không có**, và ở đây
 * nó còn tệ hơn một lỗi vì công tắc vẫn bật lên được — người xem đọc "không có ô nào ngoài
 * 2 km" thay vì "bộ này chưa đo khoảng cách".
 *
 * ── Vì sao HIỆN mà khoá, không ẩn ─────────────────────────────────────────────────────
 *
 * Cùng lựa chọn đã chốt cho `unavailableFields()` ở tab TRƯỜNG: **vắng phải nhìn thấy
 * được**. Ẩn hàng đi thì tỉnh và Hà Nội trông như hai app khác nhau, và người xem không
 * có cách nào biết bộ gốc có lớp mà bộ này thiếu. Hàng khoá kèm một câu lý do nói được cả
 * hai điều đó cùng lúc.
 *
 * ── Vì sao ĐỌC MANIFEST chứ không đọc cờ module ───────────────────────────────────────
 *
 * Vị từ nhận thẳng `Manifest` nên nó **thuần và không phụ thuộc thứ tự gọi** — chạy được
 * trong `node --test` trên đúng hai manifest thật đang có trong repo. Cờ module
 * (`setUnavailableOverlays`) chỉ là chỗ CẤT kết quả cho `parseHash` và tab LAYER đọc, đặt
 * một lần ở `main.tsx` cùng cổng với `setAvailableColumns` (§12).
 *
 * `null` = dựng được. Chuỗi = LÝ DO vắng, in nguyên văn ra tab LAYER.
 */

import type { OverlayId } from "../state/types";
import { hasManifestFile, type Manifest } from "./manifest";

const SUBSTATIONS_MANIFEST_FILE = ["substations", "geojson"].join(".");

/**
 * Vị từ vắng của từng overlay. Overlay không có tên ở đây thì luôn dựng được.
 *
 * Hai câu hỏi khác nhau, hai nguồn khác nhau, và đó không phải trùng lặp:
 *   · `beyond2km` là một **cột** của lưới ⇒ hỏi `available_columns`;
 *   · `substations` là một **file** ⇒ hỏi `files`.
 * Gộp chúng vào một cơ chế sẽ phải bịa ra một cái tên chung cho hai thứ không cùng loại.
 *
 * Bộ Hà Nội gốc không phát `available_columns` (nó có đủ 45 trường), nên nhánh đó tự tắt —
 * cùng luật thoái lui "không biết thì không lọc" mà `fieldAvailable` đang dùng.
 */
const UNAVAILABLE: Partial<Record<OverlayId, (m: Manifest) => string | null>> = {
  beyond2km: (m) =>
    m.available_columns && !m.available_columns.includes("dist_station_network_m")
      ? "Bộ dữ liệu này chưa có khoảng cách theo mạng đường, nên không ô nào nói được là trong hay ngoài 2 km."
      : null,
  substations: (m) =>
    hasManifestFile(m.files, SUBSTATIONS_MANIFEST_FILE)
      ? null
      : "Bộ dữ liệu này không ship lớp trạm biến áp OSM.",
};

/** Lý do overlay này vắng trên một manifest cụ thể, hoặc `null` nếu nó dựng được. */
export function overlayUnavailableIn(id: OverlayId, m: Manifest): string | null {
  return UNAVAILABLE[id]?.(m) ?? null;
}

let UNAVAILABLE_NOW: Map<string, string> = new Map();

/**
 * Cất kết quả cho cả phiên — gọi MỘT lần ở `main.tsx`, trước khi `App` được nạp.
 *
 * Đặt sớm như vậy để `parseHash` bỏ được id vắng ngay ở lần đọc đầu tiên, thay vì để
 * store mang một overlay bật rồi dọn lại sau khi manifest về. Trạng thái sai không nên
 * tồn tại một nhịp rồi được sửa; nó nên không tồn tại.
 */
export function setUnavailableOverlays(pairs: Iterable<[string, string]>): void {
  UNAVAILABLE_NOW = new Map(pairs);
}

/** Lý do overlay này vắng trên bộ ĐANG mở, hoặc `null`. */
export function overlayUnavailable(id: OverlayId): string | null {
  return UNAVAILABLE_NOW.get(id) ?? null;
}

/** Cặp `[id, lý do]` của mọi overlay vắng trên một manifest — đầu vào của hàm trên. */
export function unavailableOverlayPairs(m: Manifest): [string, string][] {
  const out: [string, string][] = [];
  for (const id of Object.keys(UNAVAILABLE) as OverlayId[]) {
    const why = overlayUnavailableIn(id, m);
    if (why) out.push([id, why]);
  }
  return out;
}
