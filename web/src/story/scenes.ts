/**
 * Bốn cảnh của chế độ CÂU CHUYỆN — DESIGN.md §14, khoá hash §9a.
 *
 * File này giữ **luật "cảnh nào chốt state gì"** và không giữ gì khác: không JSX, không
 * truy vấn, không `window`. Đó là có chủ ý (§12) — luật này là thứ có thể sai một cách
 * âm thầm (một cảnh quên đặt `field` thì nó thừa hưởng trường của cảnh trước và vẫn *trông*
 * bình thường), nên nó phải assert được chứ không phải chụp ảnh được.
 *
 * Cùng lý do khiến nó KHÔNG import `queries.ts`: file đó kéo theo `duckdb.ts`, và
 * `duckdb.ts` import `.wasm?url` của Vite — thứ `node --test` không giải được. Bộ lọc ô vì
 * thế nhận `CellValue` chứ không nhận `GridCell`.
 */

import { INITIAL_VIEW } from "../state/view-config";
import type { OverlayId, View } from "../state/types";
import type { CellValue } from "../viz/palette";

export const SCENE_IDS = ["von-cuc", "cung-lech", "di-vong", "chua-biet"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/**
 * Bộ lọc ô của một cảnh — §13b-2.
 *
 * `label` KHÔNG phải trang trí: §13b-2 ràng buộc 2 nói cảnh phải in ra số ô còn lại, vì
 * một tập không đếm được thì người xem không biết mình đang nhìn một phần hay toàn bộ.
 * Đặt câu chữ ngay cạnh vị từ để hai thứ không trôi khỏi nhau.
 */
export interface CellFilter {
  label: string;
  keep: (value: CellValue) => boolean;
}

/**
 * State mà một cảnh GHI ĐÈ lên store dùng chung — luật L1 của §14a.
 *
 * Mọi khoá đều **bắt buộc**. Khoá tuỳ chọn ở đây nghĩa là "cảnh này thừa hưởng của cảnh
 * trước", tức thứ mentor nhìn thấy phụ thuộc vào việc họ tới từ đâu — và một link tới
 * giữa câu chuyện thì không tới từ đâu cả. Cảnh không cần overlay khai mảng rỗng.
 */
export interface SceneState {
  field: string;
  view: View;
  layers: OverlayId[];
  /** đối tượng mở sẵn (`c` của §9) — `null` là "bỏ chọn", không phải "giữ nguyên" */
  select: string | null;
}

/** Lớp riêng của một NHỊP, ngoài mặt tô. Không phải overlay: không có trong tab LAYER. */
export type SceneMark = "bridges" | "routes";

/**
 * Một **nhịp** trong cảnh — M3.1.
 *
 * Phần lớn cảnh chỉ có một nhịp. Cảnh C có hai, vì §11 tách vai rõ ràng: mạng đường là
 * **mark chủ lực** (nó cho thấy *vì sao* chim bay sai), còn 672 ô `detour_ratio > 2` là
 * **con số** — *hậu quả đo được* của cái nguyên nhân vừa xem. Hai vai khác nhau thì không
 * chen vào một khung hình; chúng nối tiếp nhau.
 *
 * Nhịp đổi `field` (và do đó đổi mặt tô), nhưng **vẫn đúng một trường mỗi lúc** — ràng
 * buộc 2 nguyên vẹn. Đây là cùng cơ chế mà cảnh B dùng để bay giữa hai xã, chỉ khác là ở
 * đó thứ đổi là khung nhìn còn ở đây là trường.
 */
export interface SceneBeat {
  id: string;
  /** nhãn của nút chuyển sang nhịp này */
  label: string;
  field: string;
  /** ô nào được vẽ, khi nhịp thu hẹp tập ô (§13b-2) */
  filter?: CellFilter;
  marks: SceneMark[];
}

export interface Scene {
  id: SceneId;
  /** nhãn nhỏ phía trên tiêu đề — nối cảnh với luận điểm của §13d */
  kicker: string;
  title: string;
  /** MỘT câu — §3a. Không phải đoạn tóm tắt; câu này là luận điểm. */
  claim: string;
  /** ≥ 1 nhịp; nhịp ĐẦU là mặc định khi vào cảnh. */
  beats: SceneBeat[];
  view: View;
  layers: OverlayId[];
  /** đối tượng mở sẵn (`c` của §9) — `null` là "bỏ chọn", không phải "giữ nguyên" */
  select: string | null;
  /** lớp riêng của cảnh trên basemap, gắn/gỡ theo vòng đời cảnh (§2a) */
  basemapLayer?: "river";
}

const CITY: View = {
  lng: INITIAL_VIEW.center[0],
  lat: INITIAL_VIEW.center[1],
  zoom: INITIAL_VIEW.zoom,
  pitch: INITIAL_VIEW.pitch,
  bearing: INITIAL_VIEW.bearing,
};

/**
 * Hai xã được GỌI TÊN ở cảnh B — §11 (M3) và §13d-B.
 *
 * Chỉ toạ độ và mã ở đây. **Không con số nào** — dân số, số cổng, bội số trung vị đều đo
 * lúc chạy từ `commune.geojson` (§14b). Gõ "65.023" vào đây là dựng một con số sống lâu
 * hơn dữ liệu sinh ra nó.
 *
 * Mức phóng đến từ hình học của chính hai xã: Ba Đình rộng ~2,4 km nên ở z13 (17,8 m/px ở
 * vĩ độ 21°) nó chiếm ~137 px — đủ to để là một hình, đủ nhỏ để còn thấy nó nằm giữa vùng
 * dày đặc. Tây Mỗ rộng ~3,4 km nên lùi nửa bậc để cùng chiếm chừng ấy màn hình.
 */
export interface NamedCommune {
  code: string;
  view: View;
  /** vì sao xã này được gọi tên — vế trái của câu, phần số do dữ liệu điền */
  why: string;
}

export const NAMED_COMMUNES: NamedCommune[] = [
  {
    code: "00004",
    view: { lng: 105.838, lat: 21.0385, zoom: 13, pitch: 0, bearing: 0 },
    why: "Phường trung tâm, dân số sáu chữ số, và không có một cổng sạc công cộng nào.",
  },
  {
    code: "00634",
    view: { lng: 105.7473, lat: 21.001, zoom: 12.5, pitch: 0, bearing: 0 },
    why: "Đầu kia của cùng một thang: một xã ít dân hơn mang số cổng lớn nhất thành phố.",
  },
];

/**
 * Ngưỡng của cảnh C. `> 2` = "chim bay nói ô này gần hơn thực tế hơn hai lần".
 *
 * Cùng ngưỡng mà `s08` dùng cho `cells_where_euclid_understates_gt_2x`, nên con số hiện
 * trên màn hình khớp với con số trong `data/qa/s08_traveltime.json` — hai chỗ nói về cùng
 * một tập ô thì phải cùng một định nghĩa.
 */
export const DETOUR_THRESHOLD = 2;

/** Bán kính dùng để đo sai số phủ của chim bay ở cảnh C — §13e. */
export const EUCLID_COVERAGE_RADIUS_M = 3000;

export const SCENES: Scene[] = [
  {
    id: "von-cuc",
    kicker: "LUẬN ĐIỂM A",
    title: "Cầu vón cục",
    claim:
      "Nếu người ở Hà Nội trải đều thì mô hình hỗn hợp là công cụ sai — chia đều lưới là xong. " +
      "Nên đây là tiền đề phải chứng minh, không phải giả định để mượn.",
    // `population` có `surface: true` và khung nhìn ở z9,3 < HEX_MIN_ZOOM, nên `renderPlan`
    // trả về `surface` mà không cần luật mới nào (§14b). Cảnh chỉ đặt state.
    beats: [{ id: "mat-do", label: "mặt độ cầu", field: "population", marks: [] }],
    view: CITY,
    layers: [],
    select: null,
  },
  {
    id: "cung-lech",
    kicker: "LUẬN ĐIỂM B",
    title: "Cung lệch khỏi cầu",
    claim:
      "Nếu cung đã đi theo cầu thì không có bài toán nào để giải. " +
      "Hai phường dưới đây ở cùng một thành phố, cùng một cấp hành chính, và cách nhau cả một bậc độ lớn.",
    // Trường mở app (M2.1-C) — nên tới cảnh này thì bản đồ ĐÃ ở đúng đó. Việc của cảnh là
    // gọi tên, không phải tô lại (§11: "cảnh B không lặp lại choropleth").
    beats: [
      { id: "goi-ten", label: "cổng trên 10k dân", field: "commune:ports_per_10k_pop", marks: [] },
    ],
    view: NAMED_COMMUNES[0]!.view,
    layers: ["stations"],
    select: `commune:${NAMED_COMMUNES[0]!.code}`,
  },
  {
    id: "di-vong",
    kicker: "LUẬN ĐIỂM C",
    title: "Thước đo phải theo mạng đường",
    claim:
      "Đây là chỗ trả lời “vì sao không dùng k-means Euclid cho xong”. " +
      "Đường chim bay không sai ngẫu nhiên — nó sai VỀ MỘT PHÍA, và sông Hồng là nguyên nhân hình học.",
    // HAI NHỊP — §11 (quyết định 2026-08-07) tách vai dứt khoát:
    //   1. mạng đường tô theo khoảng cách = MARK CHỦ LỰC. Nó nói *vì sao* chim bay sai:
    //      khoảng cách chảy dọc phố, khựng lại ở sông, dồn qua vài cây cầu. Hex chỉ nói
    //      *ở đâu* sai — mà "ở đâu" là câu hỏi yếu hơn hẳn khi ta đang biện minh một
    //      phương pháp.
    //   2. 672 ô `> 2` = CON SỐ, tức *hậu quả đo được* của nguyên nhân vừa xem. Không vứt
    //      hex-lọc đi; đổi vai của nó.
    beats: [
      {
        id: "mang-duong",
        label: "khoảng cách theo mạng đường",
        field: "road:dist_station_m",
        marks: ["bridges", "routes"],
      },
      {
        id: "hau-qua",
        label: "hậu quả đo được",
        field: "detour_ratio",
        marks: [],
        filter: {
          label: `hệ số đi vòng > ${DETOUR_THRESHOLD}`,
          keep: (v) => typeof v === "number" && v > DETOUR_THRESHOLD,
        },
      },
    ],
    view: CITY,
    layers: [],
    select: null,
    basemapLayer: "river",
  },
  {
    id: "chua-biet",
    kicker: "CẢNH KẾT",
    title: "Ba điều ta không biết",
    claim:
      "Ba luận điểm trên nói bộ dữ liệu này đỡ được gì. Cảnh này nói nó KHÔNG đỡ được gì — " +
      "trước khi thuật toán chạy, chứ không phải sau khi kết quả bị chất vấn.",
    // Quay về đúng màn hình mở app: đóng vòng, và để lại cho L2 một state quen thuộc.
    beats: [
      { id: "gioi-han", label: "cổng trên 10k dân", field: "commune:ports_per_10k_pop", marks: [] },
    ],
    view: CITY,
    layers: [],
    select: null,
  },
];

export const SCENE_BY_ID = new Map(SCENES.map((s) => [s.id, s]));

/**
 * Nhịp đang hoạt động. `beatId` không khớp thì rơi về nhịp ĐẦU — cùng luật "khoá hỏng thì
 * về mặc định của khoá đó" (§9), và nhịp đầu luôn tồn tại vì mọi cảnh có ≥ 1 nhịp.
 */
export function beatOf(id: SceneId, beatId?: string | null): SceneBeat {
  const s = SCENE_BY_ID.get(id)!;
  return s.beats.find((b) => b.id === beatId) ?? s.beats[0]!;
}

/**
 * Tên cầu qua sông Hồng — **chữ biên tập, KHÔNG đến từ dữ liệu**.
 *
 * §11 (M3-R) ghi rõ chỗ hở này: bản trích OSM không mang cột `name`, nên muốn gọi tên từ
 * dữ liệu thì `s03` phải trích thêm. Phải chọn một trong hai một cách có ý thức, và đây là
 * lựa chọn — cùng lý do đã cho phép: tên riêng không phải con số, nên §12 ("không bịa số")
 * không bị đụng.
 *
 * Nhưng **chọn cách này thì phải trả giá của nó**, và giá là: tên chỉ được đặt ở chỗ nó
 * không thể sai. Nên chúng nằm trong PANEL dưới dạng câu, **không** dán nhãn lên bản đồ:
 * dán nhãn là khẳng định một toạ độ, mà toạ độ đó ta không có gì để neo vào. Bản đồ kẻ đậm
 * cả 4.154 đoạn `bridge` — điều đó thì dữ liệu nói được.
 */
export const RED_RIVER_BRIDGES = [
  "Thăng Long",
  "Nhật Tân",
  "Long Biên",
  "Chương Dương",
  "Vĩnh Tuy",
  "Thanh Trì",
];

/** Câu ghép của cả app — §13d. Cảnh kết in nguyên văn nó. */
export const GMM_CLAIM = [
  "cầu vón cục ⇒ mô hình hỗn hợp;",
  "cục có biên mềm và chồng lấn ⇒ Gaussian chứ không phải cụm cứng;",
  "khoảng cách phải theo mạng ⇒ không dùng Euclid được.",
].join(" ");

/**
 * Bốn cảnh có dựng được trên bộ dữ liệu đang mở không — `manifest.story_enabled`.
 *
 * Cảnh CÂU CHUYỆN được **VIẾT** cho Hà Nội: nó gọi tên hai xã cụ thể, in "Nếu người ở Hà
 * Nội trải đều…", bay tới toạ độ cầu Nhật Tân, và đo bằng những cột (`detour_ratio`,
 * `population`) mà lớp TÍNH TOÁN của store toàn quốc chưa có. Nav đã khoá nút CÂU CHUYỆN
 * từ `story_enabled`, nhưng **khoá một cái nút không khoá một khoá hash** — `#tinh=04&s=…`
 * vẫn mở được cảnh, và mở ra văn Hà Nội in đè lên bản đồ Cao Bằng kèm hai Binder Error.
 * Đó là lỗi tệ hơn cả một dải đỏ, vì nó KHÔNG trông như lỗi.
 *
 * Chặn ở `parseScene` chứ không ở `App`: đây là chỗ duy nhất mà khoá `s` biến thành một
 * cảnh, nên chặn ở đây thì cả boot lẫn `hashchange` sau này đều đi qua. Và cách nó biến
 * mất đúng bằng cách một slug lạ biến mất — luật 1 của §9 ("bỏ từng khoá một"), không
 * phải một nhánh lỗi mới.
 *
 * Đặt được TRƯỚC lần `parseHash` đầu tiên là nhờ thứ tự có sẵn ở `main.tsx`: manifest nạp
 * xong mới `import("./App")`, mà `store.ts` (chỗ gọi `readHash()` lúc nạp module) nằm sau
 * cái import động đó. Cùng cổng mà `setAvailableColumns` đang dùng.
 */
let STORY_ON = true;

export function setStoryEnabled(on: boolean): void {
  STORY_ON = on;
}

/** Chế độ CÂU CHUYỆN có dựng được trên bộ dữ liệu đang mở không. Đọc, không suy. */
export function storyEnabled(): boolean {
  return STORY_ON;
}

/** `s` của hash → cảnh, hoặc `null`. Slug lạ bị bỏ, và bỏ nó CHÍNH LÀ về BẢN ĐỒ (§9a). */
export function parseScene(raw: string | null | undefined): SceneId | null {
  if (!STORY_ON) return null;
  return raw && (SCENE_IDS as readonly string[]).includes(raw) ? (raw as SceneId) : null;
}

/**
 * State mà một cảnh ghi đè — luật L1, và là thứ test gọi thẳng.
 *
 * Trả về một object mới mỗi lần: `SceneState` đi vào store, và trả về chính object hằng
 * của `SCENES` thì một lần `set` bất cẩn sẽ sửa vào định nghĩa cảnh.
 *
 * Trường lấy từ nhịp ĐẦU: vào cảnh là vào từ đầu cảnh, kể cả khi tới bằng link.
 */
export function sceneState(id: SceneId): SceneState {
  const s = SCENE_BY_ID.get(id)!;
  return {
    field: s.beats[0]!.field,
    view: { ...s.view },
    layers: [...s.layers],
    select: s.select,
  };
}

/**
 * Bộ lọc ô của nhịp đang mở — nguồn DUY NHẤT của khoá `filtered` trong render plan.
 *
 * `MapView` và `Legend` đều cần biết "tập ô có đang bị thu hẹp không". Để mỗi bên tự suy
 * là mở cửa cho chúng suy khác nhau, và chúng ĐÃ suy khác nhau: `MapView` truyền
 * `Boolean(beat?.filter)`, `Legend` không truyền gì cả.
 */
export function activeCellFilter(
  scene: SceneId | null,
  beatId: string | null,
): CellFilter | undefined {
  return scene ? beatOf(scene, beatId).filter : undefined;
}
