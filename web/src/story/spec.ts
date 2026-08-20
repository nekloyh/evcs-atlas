/**
 * Hợp đồng kiểu của chế độ CÂU CHUYỆN — PHASE7_STORY_MODE.md §1.2.
 *
 * **Dữ liệu thuần: không React, không DuckDB, không `window`, không số.** Một cảnh là một
 * cấu hình khai báo; thứ duy nhất biến nó thành pixel là `StorySurface`, và thứ duy nhất
 * biến một khe số thành chữ là `resolve.ts`. Ba vai tách ra vì mỗi vai hỏng theo một kiểu
 * khác nhau, và gộp chúng thì chỉ có một chỗ để nhìn khi một câu nói sai.
 *
 * Luật khung của cả pha (§0):
 *
 * > **Một cảnh là một LUẬN ĐIỂM cộng BẰNG CHỨNG của nó, hoặc nó không ship.** Mọi con số
 * > trên màn hình phân giải lúc render qua một builder mà Map Workspace cũng gọi. Luận
 * > điểm nào không có số dựng được theo cách đó thì bị **BỎ**, hoặc bị **GIỮ LẠI** cho tới
 * > khi dữ liệu về.
 *
 * Hệ quả cụ thể, và là thứ test gác: **không literal số nào trong `web/src/story/` được
 * chạm tới màn hình.** Ngoại lệ duy nhất là hằng số chính sách đã đăng ký (§4.3), và mỗi
 * cái đó render kèm chữ *giả định*.
 */

import type { OverlayId, View } from "../state/types";
import type { LensId } from "../fields";
import type { PrimaryChartId } from "../viz/chart-contracts";

// ── Danh tính ────────────────────────────────────────────────────────────────

/**
 * Bảy cảnh, theo thứ tự của lập luận: *cầu trông thế nào → cung ở đâu → được phép đo
 * khoảng cách bằng gì → ai bị bỏ ngoài → mạng bận lúc nào → ta đã chọn loại bỏ cái gì →
 * ta vẫn chưa nói được gì.*
 *
 * Union đóng, và `parseScene()` vẫn loại slug lạ đúng như cũ (§9 luật 1: bỏ một khoá,
 * không bao giờ reset cả app).
 */
export const SCENE_IDS = [
  "von-cuc",
  "cung-lech",
  "di-vong",
  "ngoai-2km",
  "nhip-tuan",
  "mot-quyet-dinh",
  "chua-biet",
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** Lớp riêng của một NHỊP, ngoài mặt tô. Không phải overlay: không có trong tab LAYER. */
export type SceneMark = "bridges" | "routes";

// ── Số: mọi con số đi qua đúng một cửa ───────────────────────────────────────

/**
 * Mô hình dùng chung mà một cảnh được phép trỏ vào — §1.4 luật R1/R2.
 *
 * Mỗi id ở đây ứng với một builder trong `viz/` hoặc một truy vấn trong `data/queries.ts`
 * mà Map Workspace **cũng** gọi tới được. Cảnh không sở hữu cái nào. Thêm một id là thêm
 * một builder dùng chung, không phải thêm một phép tính của câu chuyện.
 */
export type SharedModelId =
  | "lorenz-area-pop"
  | "spatial-structure"
  | "supply-equity"
  | "commune-supply"
  | "detour"
  | "roads"
  | "access-curve"
  | "opportunity-rank"
  | "utilization-week"
  | "power-tier"
  | "poi-coverage"
  | "province-range";

/**
 * Nguồn của một con số. Bốn nguồn, và không có nguồn thứ năm tên là "gõ tay".
 *
 * `subject` trỏ vào ĐỐI TƯỢNG mà cảnh vừa phân giải được (§1.2 `SubjectSpec`) — nó tồn tại
 * vì thẻ của cảnh 2 và cảnh 4 nói về *một xã cụ thể mà dữ liệu chỉ ra*, và mã xã ấy không
 * được viết vào mã nguồn.
 */
export type MetricRef =
  | { src: "manifest"; path: string }
  | { src: "model"; model: SharedModelId; select: string }
  | { src: "subject"; which: number; select: string }
  | { src: "assumption"; id: AssumptionId };

/**
 * Hằng số chính sách — thứ DUY NHẤT trong `story/` được phép là một literal số.
 *
 * Mỗi cái render kèm giá trị **và** chữ *giả định* (§4.3 luật R4). Không cái nào là số đo:
 * chúng là những chỗ ta đã chọn, và người xem phải phân biệt được "dữ liệu nói thế" với
 * "chúng tôi quyết thế".
 */
export type AssumptionId =
  | "beyond-2km"
  | "detour-threshold"
  | "major-bridge-min"
  | "euclid-coverage-radius"
  | "scene-context-zoom-out"
  | "density-quantiles"
  | "observed-h-min";

// ── Câu: một khe không phân giải được thì câu biến mất ───────────────────────

/** Cách một số biến thành chữ. Tất cả đi qua `ui/format.ts` + `units.ts` — §1.5. */
export type FormatId =
  | "count"
  | "number"
  | "percent"
  | "percent1"
  | "multiple"
  | "meters"
  | "km"
  /** phân vị: 0,9 → "90" — nhãn lát cắt, không phải một tỉ lệ để đọc */
  | "quantile";

export type ClaimPart =
  | string
  | { em: string }
  | { slot: MetricRef; fmt: FormatId; unit?: string };

/**
 * Một câu, ghép từ chữ literal và khe số.
 *
 * `required` là chỉ số của những phần **bắt buộc**: khe nào trong đó không phân giải được
 * thì **cả câu không render** (§1.4 luật R5). Không `?? 0`, không dấu "—" đứng chỗ một
 * luận điểm. Mặc định (`required` vắng) = mọi khe đều bắt buộc, vì một câu có số mà mất số
 * thì phần còn lại thường là một khẳng định trần.
 */
export interface ClaimTemplate {
  parts: readonly ClaimPart[];
  required?: readonly number[];
}

// ── Đối tượng: cảnh nói VỀ cái gì, và cái đó do dữ liệu chỉ ra ───────────────

export type CommunePredicate = "zero-ports" | "any" | "majority-beyond-2km";

/**
 * Cảnh này nói về cái gì. **Không mã xã nào viết vào mã nguồn** — §1.1.
 *
 * `explicit` còn tồn tại nhưng đòi một câu giải thích viết ra: nếu một ngày phải ghim một
 * mã, lý do phải nằm cạnh nó chứ không nằm trong đầu người ghim.
 */
export type SubjectSpec =
  | { kind: "province" }
  | {
      kind: "commune-extreme";
      measure: "population" | "n_ports" | "ports_per_10k_pop" | "population_beyond_2km";
      at: "max" | "min";
      where?: CommunePredicate;
    }
  | { kind: "commune-set"; rank: "population_beyond_2km"; take: number }
  | { kind: "explicit"; code: string; why: string };

// ── Khung hình: mức phóng đến từ hình học, không từ ngón tay ─────────────────

/**
 * Khung hình của cảnh — §1.6. Không cảnh nào chứa literal mức phóng.
 *
 * `fit-subject` lùi `SCENE_CONTEXT_ZOOM_OUT` bậc so với `zoomForFeatureBounds`, và đó là
 * một **giả định khai báo** chứ không phải số đo: điều hướng (Phase 5) muốn đối tượng
 * **lấp đầy** khung ("cho tôi xem cái này"); một cảnh muốn đối tượng **đọc được giữa vùng
 * xung quanh nó" ("nhìn xem cái này khác chỗ quanh nó thế nào").
 */
export type CameraSpec =
  | { kind: "fit-province" }
  | { kind: "fit-subject"; which: number }
  | { kind: "fit-marks"; mark: SceneMark };

// ── Nhịp ─────────────────────────────────────────────────────────────────────

/**
 * Ngưỡng của bộ lọc nhịp — cơ chế `ThresholdSpec` của Phase 5, dùng lại nguyên văn.
 *
 * `literal` chỉ nhận hằng số chính sách đã đăng ký (`AssumptionId`); mọi lát cắt khác phải
 * phân giải trên chính dữ liệu đang mở, để "ngưỡng" và "số ô còn lại" không trôi khỏi nhau.
 */
export type SceneThreshold =
  | { kind: "assumption"; id: AssumptionId }
  | { kind: "quantile"; q: number };

export interface BeatFilterSpec {
  field: string;
  op: "gt" | "ge";
  value: SceneThreshold;
  /** câu in cạnh SỐ Ô CÒN LẠI — §13b-2 ràng buộc 2; nhận giá trị đã phân giải */
  label: ClaimTemplate;
}

export interface BeatSpec {
  id: string;
  /** nhãn của nút chuyển sang nhịp này */
  label: string;
  /** ĐÚNG MỘT trường được tô mỗi nhịp — ràng buộc 2 của Phase 2 */
  field: string;
  filter?: BeatFilterSpec;
  marks: readonly SceneMark[];
  /** vị trí scrubber do CẢNH sở hữu (§2.6); vắng = không đụng vào `t` */
  t?: { kind: "model-argmax"; model: SharedModelId };
  /** nhịp có thể đổi khung; vắng = thừa hưởng khung của cảnh */
  camera?: CameraSpec;
  /** thân của nhịp: số dẫn, dòng số phụ, thẻ đối tượng, hình */
  blocks: readonly BlockSpec[];
}

// ── Thân cảnh: khai báo, không phải JSX ─────────────────────────────────────

/** Hình dùng chung mà một cảnh mượn — §3. Cảnh KHÔNG tự vẽ biểu đồ nào. */
export type SharedFigureId =
  | "lorenz-area-pop"
  | "structure-sweep"
  | "supply-lorenz"
  | "route-pairs"
  | "access-curve"
  | "opportunity-rank"
  | "utilization-week"
  | "power-tier";

export type BlockSpec =
  /** con số dẫn dắt của nhịp */
  | { kind: "figure"; value: MetricRef; fmt: FormatId; unit?: string; caption: ClaimTemplate }
  /** dòng số phụ */
  | { kind: "stat"; label: ClaimTemplate; value: MetricRef; fmt: FormatId; unit?: string }
  /** đoạn văn; số trong đó vẫn là khe */
  | { kind: "para"; text: ClaimTemplate }
  /** khối "vì sao điều này quyết định", đóng mỗi cảnh */
  | { kind: "so-what"; text: ClaimTemplate }
  /** giả định khai báo: giá trị **và** chữ *giả định* — §4.3 luật R4 */
  | { kind: "assumption"; id: AssumptionId; note: ClaimTemplate }
  /** đầu ra của một LUẬT, gắn nhãn như vậy — không bao giờ mô tả là số đo */
  | { kind: "rule-output"; label: ClaimTemplate; value: MetricRef; fmt: FormatId; unit?: string }
  /** thẻ của một đối tượng đã phân giải, bấm được để bay tới */
  | { kind: "subject-card"; which: number; why: ClaimTemplate; rows: readonly SubjectRow[] }
  /** hình dùng chung */
  | { kind: "figure-slot"; id: SharedFigureId }
  /** tiêu đề nhỏ trong thân */
  | { kind: "heading"; text: string };

export interface SubjectRow {
  select: string;
  fmt: FormatId;
  unit: string;
  /** dòng này biến mất khi khe không phân giải — thẻ "0 cổng" không được in bội số trung vị */
  optional?: boolean;
}

// ── Điều kiện dựng ──────────────────────────────────────────────────────────

/**
 * Cảnh này dựng được trên gói đang mở không — §1.8.
 *
 * Cảnh không thoả điều kiện thì **vắng mặt**, không bị làm mờ: câu chuyện là một chuỗi, và
 * một bước chết trong một chuỗi là một ngõ cụt. Nó cũng biến mất khỏi `parseScene`, nên
 * `#s=<slug>` của nó rơi về chế độ BẢN ĐỒ đúng như một slug lạ.
 */
export interface SceneRequirement {
  gridColumns?: readonly string[];
  communeColumns?: readonly string[];
  roadColumns?: readonly string[];
  files?: readonly string[];
  manifestKeys?: readonly string[];
  /** đúng cho cảnh có VĂN gọi tên một nơi (sông Hồng và cầu của nó) */
  editorialProvince?: string;
  /** lớp phải dùng được — `unusable_layers` của manifest (nhịp tuần ở tỉnh không đo được) */
  usableLayers?: readonly string[];
}

// ── Cảnh ────────────────────────────────────────────────────────────────────

export type SceneChartBinding =
  | { kind: "primary"; id: PrimaryChartId }
  | { kind: "none"; why: string };

export interface SceneSpec {
  id: SceneId;
  /**
   * Approved scenes pin the QA-verified binned encoding.
   *
   * Ghim này là một KHAI BÁO, không phải một state được ghi vào store: nó được ĐỌC ở
   * `effectiveScaleModeOf()` mỗi lượt render, nên nó không chạm tới `store.scaleMode` —
   * ô nhớ giữ lựa chọn của người xem. Đấy là ranh giới RF-1: cảnh ghim cách VẼ của chính
   * nó, cảnh không được sửa sở thích của người xem để đạt điều đó.
   */
  scaleMode: "binned";
  /** nhãn nhỏ phía trên tiêu đề — nối cảnh với luận điểm của §13d */
  kicker: string;
  title: string;
  /** MỘT câu. Đây là luận điểm, không phải đoạn tóm tắt. */
  claim: ClaimTemplate;
  /** cảnh MƯỢN lens của workspace, nó không phát minh lens mới */
  lens: LensId;
  beats: readonly BeatSpec[];
  camera: CameraSpec;
  layers: readonly OverlayId[];
  /** cảnh nói VỀ cái gì; mảng rỗng = cả tỉnh */
  subjects: readonly SubjectSpec[];
  /** đối tượng mở sẵn khi vào cảnh (`c` của §9); `null` là "bỏ chọn" */
  select: { kind: "none" } | { kind: "subject"; which: number };
  chart: SceneChartBinding;
  requires: SceneRequirement;
  /** lớp riêng của cảnh trên basemap, gắn/gỡ theo vòng đời cảnh (§2a) */
  basemapLayer?: "river";
}

/**
 * State mà một cảnh GHI ĐÈ lên store dùng chung — luật L1 của §14a. Mọi khoá bắt buộc.
 *
 * `scaleMode` KHÔNG có mặt ở đây, dù cảnh có ghim nó. Cái gì nằm trong hình dạng này thì bị
 * `set()` vào store, và ghi ghim của cảnh vào `store.scaleMode` đúng là RF-1: sở thích của
 * người xem bị nuốt và không có đường trả lại. Ghim sống ở `SceneSpec.scaleMode` và được áp
 * lúc ĐỌC qua `effectiveScaleModeOf()`.
 */
export interface SceneState {
  field: string;
  view: View;
  layers: OverlayId[];
  select: string | null;
  /** giờ do cảnh sở hữu (§2.6); `null` = không đụng vào `t` của người xem */
  t: number | null;
}
