/**
 * Đặt MỌI trạng thái phụ thuộc bộ dữ liệu, một chỗ, trước khi `App` được nạp.
 *
 * ── Vấn đề mà file này giải ───────────────────────────────────────────────────────────
 *
 * Có **năm** biến module-level phải được ghi trước khi `import("./App")` chạy, vì
 * `store.ts` đọc `INITIAL_VIEW` và `hash.ts` đọc `fields`/`overlays`/`scenes` **ngay lúc
 * nạp module**:
 *
 *     fields.AVAILABLE · fields.UNUSABLE_LAYERS · overlays.UNAVAILABLE_NOW
 *     scenes.STORY_ON  · positron.INITIAL_VIEW
 *
 * Hợp đồng thứ tự ấy chỉ được giữ bằng một comment trong `main.tsx`. Một comment không
 * chạy: thêm setter thứ sáu và quên nó, hoặc dời `import("./App")` lên trên, thì lỗi hiện
 * ra dưới dạng "một link `#tinh=96&f=population` chạy đúng một truy vấn trên cột không tồn
 * tại rồi trắng màn hình" — cách xa nguyên nhân vài file.
 *
 * Ở đây nó là MỘT hàm, và có test. Thêm một thứ phụ thuộc bộ dữ liệu thì thêm vào `apply`,
 * và `apply` chỉ có một chỗ gọi.
 *
 * ── Hai nhánh, một luật ──────────────────────────────────────────────────────────────
 *
 * Manifest hỏng **không** được thành trang lỗi. Bộ Hà Nội gốc không có `available_columns`
 * và vẫn phải chạy y như trước, nên "không nạp được manifest" thoái lui về **không lọc gì**.
 * "Chưa biết bộ dữ liệu thiếu gì" khác hẳn "biết là thiếu" — đây là cùng một luật với ràng
 * buộc 1 của giao diện, chỉ khác là áp cho tầng khởi tạo.
 */

import type { Manifest } from "./manifest";
import { setUnavailableOverlays, unavailableOverlayPairs } from "./overlays";
import { setAvailableColumns, setUnusableLayers } from "../fields";
import { setInitialViewFromBbox } from "../map/positron";
import { setStoryEnabled } from "../story/scenes";

/** Những gì một bộ dữ liệu nói về chính nó. Tách khỏi `Manifest` để test không cần dựng cả. */
export interface DatasetFacts {
  columns?: string[];
  communeColumns?: string[];
  unusableLayers?: string[];
  storyEnabled: boolean;
  overlayPairs: [string, string][];
  title: string | null;
  bbox?: [number, number, number, number];
}

/** Trạng thái khi CHƯA BIẾT gì — không lọc, không tắt, không đổi khung nhìn. */
export const UNKNOWN: DatasetFacts = {
  columns: undefined,
  communeColumns: undefined,
  unusableLayers: undefined,
  storyEnabled: true,
  overlayPairs: [],
  title: null,
};

/** Đọc manifest thành các sự thật. Hàm THUẦN — không đụng biến toàn cục nào. */
export function factsFrom(m: Manifest): DatasetFacts {
  return {
    columns: m.available_columns,
    communeColumns: m.available_commune_columns,
    unusableLayers: m.unusable_layers?.map((l) => l.layer),
    // `!== false` chứ không phải `=== true`: manifest cũ không có khoá này, và vắng khoá
    // nghĩa là "chưa ai tắt", không phải "đã tắt".
    storyEnabled: m.story_enabled !== false,
    overlayPairs: unavailableOverlayPairs(m) as [string, string][],
    title: m.province ? `EVCS · ${m.province.province_name}` : null,
    bbox: m.province?.bbox,
  };
}

/**
 * Ghi các sự thật vào những biến mà `store.ts`/`hash.ts` đọc lúc nạp module.
 *
 * PHẢI chạy xong trước `import("./App")`. Đó là toàn bộ lý do hàm này tồn tại.
 */
export function apply(f: DatasetFacts): void {
  setAvailableColumns(f.columns, f.communeColumns);
  setUnusableLayers(f.unusableLayers);
  setStoryEnabled(f.storyEnabled);
  setUnavailableOverlays(f.overlayPairs);
  if (f.bbox) setInitialViewFromBbox(f.bbox);
}
