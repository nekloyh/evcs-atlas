/**
 * Kiểu dùng chung cho store và hash. Tách ra để `hash.ts` không phải import `store.ts` —
 * store đọc hash lúc khởi tạo, nên chiều import phải một chiều store → hash.
 */

/**
 * `3d` thành giá trị hợp lệ từ M3.5 (§9): nó bật fill-extrusion nhà basemap + khối POI +
 * pitch 50, nên nó là một trạng thái THẬT. Trước đó `m=3d` bị bỏ qua như khoá hỏng vì bật
 * nó không vẽ gì khác đi — nói dối bằng UI (§3a).
 */
import type { BrushState } from "./brush";

export type Mode = "2d" | "3d";
export const MODES: readonly string[] = ["2d", "3d"];

export type BasemapStyle = "voyager" | "positron" | "dark";
export const BASEMAP_STYLES: readonly BasemapStyle[] = ["voyager", "positron", "dark"];

/** Sáu representation thử nghiệm của P1 Demand (§15 DESIGN.md). Session UI, chưa vào hash. */
export const DEMAND_REPRESENTATIONS = [
  "hex",
  "density",
  "intensity",
  "bivariate",
  "hybrid",
] as const;
export type DemandRepresentation = (typeof DEMAND_REPRESENTATIONS)[number];

/**
 * **Điểm nhìn sở hữu representation, không phải ngược lại.**
 *
 * Trước đây quan hệ này bị lật: nút `3D` trong bộ chọn representation tự gọi `setMode("3d")`,
 * và lớp `extrusion` ép cứng `is3d = true` bất kể `mode`. Hệ quả là **chọn `extrusion` khi
 * đang ở 2D cho ra khối hex dựng đứng trên một camera pitch 0** — người xem thấy 3D ở nơi
 * giao diện nói là 2D, và không có nút nào giải thích được vì sao.
 *
 * Luật thay thế, một chiều:
 *
 * 1. `mode` là trạng thái NGOÀI. Đổi nó **chỉ** bằng nút 2D/3D.
 * 2. Mỗi representation khai mình thuộc điểm nhìn nào. Bộ chọn chỉ hiện đúng nhóm đang mở.
 * 3. Đổi điểm nhìn thì representation **tự chốt về mặc định của nhóm mới** nếu nó không
 *    thuộc nhóm ấy.
 *
 * Tiêu chí phân nhóm là ĐỘ CAO có phải một kênh mã hoá đang chạy không — không phải "trông
 * có vẻ 3D". `hex` nằm ở cả hai vì nó tự đi theo `mode`: phẳng ở 2D, dựng khối ở 3D, cùng
 * một thang màu.
 *
 * **`extrusion` đã bị XOÁ khi áp luật này**, không phải bị chuyển nhóm. Áp xong thì nó dựng
 * đúng cùng bộ lớp với `hex` ở 3D — hai nút cho một kết quả. Nó còn khác `hex` ở một chỗ
 * duy nhất, và chỗ đó là lỗi: nó đi vòng qua cổng `plan.paint`, nên nó vẫn vẽ hex ở dưới
 * `HEX_MIN_ZOOM`, nơi §13a-1 nói ô nhỏ hơn mức đọc được từng bậc màu.
 *
 * Hệ quả phải nói ra: điểm nhìn 3D hiện chỉ còn **một** cách đọc.
 */
export const REPRESENTATION_VIEWPOINT: Record<DemandRepresentation, readonly Mode[]> = {
  hex: ["2d", "3d"],
  density: ["2d"],
  intensity: ["2d"],
  bivariate: ["2d"],
  hybrid: ["2d"],
};

export function representationsFor(mode: Mode): DemandRepresentation[] {
  return DEMAND_REPRESENTATIONS.filter((r) => REPRESENTATION_VIEWPOINT[r].includes(mode));
}

/** Mặc định của một điểm nhìn — `hex` ở cả hai, vì nó là cách đọc GIÁ TRỊ TỪNG Ô ở cả hai. */
export function defaultRepresentationFor(mode: Mode): DemandRepresentation {
  return representationsFor(mode)[0] ?? "hex";
}

/** Representation này có hợp lệ ở điểm nhìn đang mở không. */
export function representationFits(r: DemandRepresentation, mode: Mode): boolean {
  return REPRESENTATION_VIEWPOINT[r].includes(mode);
}

export type RailTab = "field" | "layer" | "cell";

/** Một compare view trả lời một câu hỏi; không có dock đa-biểu-đồ mặc định. */
export type CompareView = "distribution" | "demand-access" | "utilization-pattern";

/**
 * Đơn vị đọc của một trường — DESIGN.md §6b.
 *
 * Đây KHÔNG phải "lớp thứ hai": ràng buộc 2 vẫn là đúng một trường mỗi lúc, và đơn vị của
 * trường đó quyết định hình học nào được tô. Hình học kia không vẽ.
 *
 * `road` thêm ở M3.1 và `station` ở M4, cả hai đi qua **đúng cánh cửa** mà `commune` đã
 * mở — không có ngoại lệ mới nào, chỉ thêm một dòng vào bảng §6b. Riêng `station` không
 * chịu ngưỡng zoom, cùng lý do với `road`: 939 chấm là mark RỜI, không phải một mặt lát
 * kín, nên cái mắt đọc là hình dáng của tập chấm chứ không phải bậc màu ở từng vị trí.
 */
export type ReadingUnit = "cell" | "commune" | "road" | "station";

/**
 * Overlay bật/tắt được — §4d. Danh tính từ hình học + chất liệu, không từ hue.
 *
 * 4 ID `poi_*` là 4 nhóm POI của M3.5 — chúng dùng lại khoá `l` chứ không đẻ khoá mới,
 * vì POI **là** overlay (§6b): một khái niệm một khoá, và bộ kiểm sẵn có (bỏ từng ID lạ,
 * thứ tự chuẩn hoá) áp luôn. Danh tính giữa 4 nhóm đến từ HÌNH DẠNG mark (§4d-4).
 *
 */
export const OVERLAY_IDS = [
  "stations",
  /**
   * Trạng thái vận hành của trạm — M4.1, §4d-3a. **VIỀN ĐỨT**, không phải hue mới.
   *
   * Nó là overlay chứ không phải một trường vì trạng thái là *state* của một mark đã có,
   * không phải một đại lượng để tô: nó không có thứ tự, không có thang, và nó phải xem
   * được **cùng lúc** với bất kỳ trường nào đang tô. Cấp cho nó một hue là phá "một họ
   * màu lạnh duy nhất" (§4d); mượn `#fab219` là dùng màu cảnh báo cho một series.
   *
   * Nó bám vào chấm trạm ở CẢ HAI tư cách của chấm đó — overlay `stations` và mặt tô
   * `station:occ` (§6b) — vì viền là một thuộc tính của mark, không phải một lớp riêng
   * vô tình nằm cùng chỗ.
   */
  "station_status",
  "communes",
  "beyond2km",
  "poi_apartment",
  "poi_mall",
  "poi_public",
  "poi_edu_health",
] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

export interface View {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Vị trí scrubber — chỉ số 0–167 của ô giờ trong tuần, §3e.
 *
 * MỘT số chứ không phải cặp `(dow, hour)`: cặp thì `dow = 9` biểu diễn được và ta sẽ phải
 * viết luật cấm nó, còn một số trong khoảng thì trạng thái sai không tồn tại. Cùng lập
 * luận đã dùng cho khoá `s` ở §9a.
 */
export const HOURS_IN_WEEK = 168;
export const dowOf = (t: number) => Math.floor(t / 24);
export const hourOf = (t: number) => t % 24;
export const tOf = (dow: number, hour: number) => dow * 24 + hour;

/** Nhãn thứ — dữ liệu gốc `dow = 0` là Thứ Hai (`docs/COT.md`), không phải Chủ Nhật. */
export const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/**
 * Tên thứ đầy đủ — dùng trong CÂU, không dùng trên trục.
 *
 * Hai bảng cho một khái niệm là có chủ ý, không phải trùng lặp: trục heatmap có 7 hàng cao
 * 10 px nên nó cần "T6"; còn câu "đỉnh 21h Thứ Sáu" của panel TRẠM (§8a-4) là **văn xuôi**,
 * và viết tắt trong văn xuôi bắt người đọc giải mã một thứ vốn có sẵn tên.
 */
export const DOW_FULL = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
] as const;

/** Phần state được serialize ra hash — §9 khoá f · m · v · l · c · s · p · t · b. */
export interface HashState {
  field: string;
  mode: Mode;
  view: View;
  layers: OverlayId[];
  cell: string | null;
  /**
   * Cảnh CÂU CHUYỆN đang mở — khoá `s`, §9a.
   *
   * `null` = chế độ BẢN ĐỒ. MỘT khoá mang cả hai sự thật ("đang ở chế độ nào" và "cảnh
   * nào") có chủ ý: hai khoá thì "story mà không có cảnh" và "map mà vẫn có cảnh" biểu
   * diễn được, và ta sẽ phải viết luật cấm chúng. Kiểu ở đây là `string | null` chứ không
   * phải `SceneId | null` để `types.ts` không phải import ngược lên `story/` — `hash.ts`
   * kiểm slug bằng `parseScene`.
   */
  scene: string | null;
  /**
   * Chế độ DỮ LIỆU đang mở hay không — khoá `d`, M4.2 (§3f).
   *
   * **Vì sao một khoá thứ hai chứ không phải một giá trị của `s`.** §9a chọn một-khoá cho
   * `s` để trạng thái "story mà không có cảnh" không biểu diễn được — luật đó nói về *cảnh
   * nào bên trong câu chuyện*, và chế độ DỮ LIỆU không có cảnh nào để mang. Nhét nó vào
   * `s` sẽ bắt `parseScene` trả về một thứ không phải cảnh, tức làm hỏng đúng cái kiểu đã
   * dựng lên để giữ luật đó.
   *
   * Bất biến vẫn được giữ, chỉ ở chỗ khác: **`serializeHash` không bao giờ ghi cả `s` lẫn
   * `d`**, và `parseHash` đọc `s` trước rồi bỏ `d` nếu đã có cảnh. Nên state luôn ở đúng
   * MỘT trong ba chế độ, và một hash gõ tay mang cả hai vẫn cho một trạng thái xác định.
   */
  dataMode: boolean;
  /**
   * Mặt tô (hex/xã/đường/mặt liên tục) có đang VẼ hay không — khoá `p`, thêm sau M3.5.
   *
   * Đây KHÔNG phải trường thứ hai: `field` vẫn là MỘT chuỗi (ràng buộc 2 nguyên vẹn) —
   * `p=0` chỉ ẩn phần TÔ của trường đang chọn, để lại nền + overlay (POI, trạm, ranh
   * giới) cho mentor xem sạch. Mặc định `true`; chỉ ghi ra khi tắt, cùng khuôn với `l`
   * rỗng không ghi. Trong chế độ CÂU CHUYỆN nó luôn `true` và không đọc/ghi khoá `p` —
   * cùng luật §9a đã áp cho `f`/`v`/`l`: một cảnh luôn tô đúng một trường của nó (L3).
   */
  paintOn: boolean;
  /** Vị trí scrubber — khoá `t`, 0–167. §3e. */
  t: number;
  /** Ba ô brush của dock — khoá `b`, §9b. Ô rỗng = brush loại đó chưa đặt. */
  brush: BrushState;
}
