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
 * Manifest hỏng **không** được thành trang lỗi. Bộ Hà Nội mặc định vẫn phải chạy y như
 * trước, nên "không nạp được manifest" thoái lui về **không lọc gì**.
 * "Chưa biết bộ dữ liệu thiếu gì" khác hẳn "biết là thiếu" — đây là cùng một luật với ràng
 * buộc 1 của giao diện, chỉ khác là áp cho tầng khởi tạo.
 */

import { hasManifestFile, type Manifest } from "./manifest";
import { setUnavailableOverlays, unavailableOverlayPairs } from "./overlays";
import { setAvailableColumns, setUnusableLayers, type AvailableByUnit } from "../fields";
import { setInitialViewFromBbox } from "../state/view-config";
import { setStoryEnabled } from "../story/scenes";

const ROUTES_MANIFEST_FILE = ["routes_showcase", "geojson"].join(".");

/** Những gì một bộ dữ liệu nói về chính nó. Tách khỏi `Manifest` để test không cần dựng cả. */
export interface DatasetFacts {
  /** Cột có thật, theo TỪNG đơn vị đọc. Khoá vắng = không lọc đơn vị đó. */
  columns: AvailableByUnit;
  unusableLayers?: string[];
  storyEnabled: boolean;
  overlayPairs: [string, string][];
  title: string | null;
  bbox?: [number, number, number, number];
}

/** Trạng thái khi CHƯA BIẾT gì — không lọc, không tắt, không đổi khung nhìn. */
export const UNKNOWN: DatasetFacts = {
  columns: {},
  unusableLayers: undefined,
  storyEnabled: true,
  overlayPairs: [],
  title: null,
};

/**
 * Dữ liệu có ĐỠ NỔI chế độ CÂU CHUYỆN không — cổng thứ hai, hỏi một câu khác.
 *
 * Cổng thứ nhất nằm ở `n11_web_export` (`code == "01"`) và hỏi: **văn cảnh có được viết cho
 * tỉnh này không?** Cảnh C gọi tên sông Hồng và sáu cây cầu; `scenes.ts` khoá cứng hai mã xã
 * chỉ tồn tại ở Hà Nội. Cổng ấy KHÔNG được bỏ — bỏ nó là in văn cảnh Hà Nội đè lên bản đồ
 * Cà Mau, và thứ đó **không trông như lỗi**.
 *
 * Cổng này hỏi: **dữ liệu có đỡ nổi không?** Cần thiết vì hai cổng có thể lệch nhau, và
 * hôm nay chúng ĐANG lệch: `story_enabled` bật ở `#tinh=01`, nhưng bộ `p/01` thiếu
 * `dist_station_m` (cảnh C tô mạng đường theo cột đó) và thiếu hai khoá `manifest.roads`
 * mà cột cảnh đọc. Kết quả là một cảnh mở ra được nhưng nửa trống.
 *
 * Hệ quả CỐ Ý: sau bản sửa này cảnh CÂU CHUYỆN **tắt** ở `#tinh=01`, và **tự bật lại**
 * khi lớp cặp tuyến + `dist_station_m` được dựng cho store toàn quốc.
 */
export function storyDataReady(m: Manifest): boolean {
  // Bộ Hà Nội cũ không khai `available_road_columns` ⇒ vắng khoá = KHÔNG BIẾT = không
  // chặn. Hành vi cũ giữ nguyên tuyệt đối.
  const road = m.available_road_columns;
  if (road && !road.includes("dist_station_m")) return false;
  if (m.files && !hasManifestFile(m.files, ROUTES_MANIFEST_FILE)) return false;
  return true;
}

/** Đọc manifest thành các sự thật. Hàm THUẦN — không đụng biến toàn cục nào. */
export function factsFrom(m: Manifest): DatasetFacts {
  return {
    columns: {
      cell: m.available_columns,
      commune: m.available_commune_columns,
      // Hai đơn vị này chỉ có ở manifest của store toàn quốc. Bộ Hà Nội gốc không khai
      // chúng, và vắng khoá = KHÔNG LỌC — đúng luật "chưa biết ≠ biết là thiếu".
      road: m.available_road_columns,
      station: m.available_station_columns,
    },
    unusableLayers: m.unusable_layers?.map((l) => l.layer),
    // HAI cổng, hỏi hai câu KHÁC NHAU. Cảnh chỉ bật khi cả hai đúng.
    storyEnabled: m.story_enabled !== false && storyDataReady(m),
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
  setAvailableColumns(f.columns);
  setUnusableLayers(f.unusableLayers);
  setStoryEnabled(f.storyEnabled);
  setUnavailableOverlays(f.overlayPairs);
  if (f.bbox) setInitialViewFromBbox(f.bbox);
}
