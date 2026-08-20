/**
 * 45 trường bản đồ hoá được, gom đúng 5 nhóm của DESIGN.md §6.
 *
 * Bảng cột đầy đủ ở `docs/COT.md`, SINH TỰ ĐỘNG. Kiểu `GridColumn` ở
 * `data/columns.generated.ts` chặn việc trỏ tới một cột không tồn tại NGAY LÚC COMPILE.
 *
 * Cột ĐỊNH DANH & XUẤT XỨ
 * (`h3_r8` `lat` `lng` `cell_state` `commune_code` `commune_name` `commune_area_frac`
 * `pop_source`). Tám cột đó **cố tình không có mặt** trong danh sách này — tô màu chúng
 * lên bản đồ là vô nghĩa; chúng chỉ xuất hiện trong panel Ô và khối NGUỒN.
 *
 * File này chỉ giữ CÂU CHỮ. Mọi con số (phủ %, tỉ lệ tag) đến từ
 * `manifest.json` — ràng buộc 4, DESIGN.md §7c. Đừng gõ phần trăm vào đây.
 */

import { pct, type Manifest } from "./data/manifest";
import type { NullState } from "./data/null-states";
import { dataPath } from "./data/province";
import type { CompareView, OverlayId, ReadingUnit } from "./state/types";
import { formatIn, scaleUnit, unitPhrase, type ScaledUnit, type UnitSpec } from "./units";
import { OBSERVED_H_MIN } from "./viz/occ";
import type { Diverge, Polarity, ScaleContract } from "./viz/palette";

import type { PrimaryChartId } from "./viz/chart-contracts";
import { BEYOND_2KM_M } from "./domain-thresholds";

/** Lens là metadata của field registry, không phải một state độc lập. */
export const LENS_IDS = ["demand", "supply", "access", "utilization", "opportunity"] as const;
export type LensId = (typeof LENS_IDS)[number];

/**
 * Khai báo phân kỳ ở tầng registry = mốc + phía cần can thiệp (`Diverge`, dùng cho MÀU và
 * cho phép chia bậc) cộng hai chữ mà legend in ra.
 *
 * `ends` phải mô tả CHÍNH đại lượng đang tô, không mô tả kết luận mà nó gợi ra. Với
 * `screen_margin_m` là "chưa đủ xa / đủ xa" chứ không phải "TỪ CHỐI / ĐỀ XUẤT": bộ rule của
 * `screen_decision` còn một ngoại lệ (hạ ngưỡng Xã khi trạm gần nhất bận ≥ 40%) và một hạng
 * mục thứ ba, nên dấu của biên KHÔNG bằng quyết định.
 */
export interface DivergeContract extends Diverge {
  /** Đọc hai bên mốc là gì — `[dưới mốc, trên mốc]`. */
  ends: readonly [string, string];
}

export type FieldKind = "numeric" | "bool" | "categorical";
export type GroupId = "cau" | "dat" | "duong" | "cung" | "tiepcan" | "sosanh";

export interface LensMeta {
  id: LensId;
  label: string;
  hint: string;
  businessQuestion: string;
  defaultField: string;
  /** Primary chart ID uniquely owned by this lens (PHASE4_VISUALIZATION.md §1). */
  primaryChart: PrimaryChartId;
  /** Khoá registry-qualified; field ô dùng `cell:` để không đụng tên cùng cột ở xã. */
  fieldKeys: readonly string[];
  defaultOverlays: readonly OverlayId[];
  cellEvidence: readonly [string, string, string];
  communeEvidence: readonly [string, string, string];
  stationEvidence: readonly [string, string, string];
}

export const GROUPS: { id: GroupId; label: string; hint: string }[] = [
  { id: "cau", label: "CẦU", hint: "ai cần sạc" },
  { id: "dat", label: "ĐẤT", hint: "đặt được không" },
  { id: "duong", label: "ĐƯỜNG", hint: "xe tới được không" },
  { id: "cung", label: "CUNG", hint: "đã có gì" },
  { id: "tiepcan", label: "TIẾP CẬN & SỬ DỤNG", hint: "hiện trạng tốt tới đâu" },
  // Nhóm thứ 6 — DESIGN §13c. Nó gom theo CÁCH ĐỌC, không theo bảng: một trường ở đây có
  // thể là cột thật (`detour_ratio`) hoặc đại lượng tính ra (§13c-1). Điểm chung là cả
  // bốn đều vẽ ĐỘ LỆCH khỏi một kỳ vọng, chứ không vẽ MỨC.
  { id: "sosanh", label: "SO SÁNH", hint: "so với kỳ vọng" },
];

/** Tiền tố của trường thuộc bảng xã — §6b. Tên trần vẫn là trường của ô. */
export const COMMUNE_PREFIX = "commune:";

/** Tiền tố của trường thuộc mạng đường — §6b, thêm ở M3.1. Cùng quy tắc với `commune:`. */
export const ROAD_PREFIX = "road:";

/** Tiền tố của trường thuộc TRẠM — §6b, thêm ở M4 cho scrubber (§3e). */
export const STATION_PREFIX = "station:";

/** Trường nhịp trạm — id đầy đủ. Scrubber và dock đều cần trỏ tới nó bằng một hằng. */
export const STATION_OCC_FIELD = `${STATION_PREFIX}occ`;
export const STATION_PORTS_FIELD = `${STATION_PREFIX}ports`;

/**
 * **Hợp đồng thị giác** của một trường — thứ mà DESIGN.md §5 lâu nay chỉ nói bằng văn xuôi.
 *
 * Bốn thành viên này đã tồn tại và đã được khai đủ ở mọi trường; cái thiếu là một cái TÊN
 * cho nhóm, và một chỗ để TypeScript đứng. Vì sao đó không phải chuyện hình thức: ngày
 * thêm một loại bản đồ mới, hoặc lồng hai bản đồ lên nhau, chỉ cần thêm một thành viên vào
 * interface này là trình biên dịch **liệt kê ra đúng những trường còn thiếu khai báo**.
 *
 * Cố ý KHÔNG dùng một hàm suy diễn (`visualContract(f)`) dù nó rẻ hơn hôm nay: nguồn sự
 * thật phải là **bảng khai bám theo dữ liệu**, không phải một luật nằm trong code. Luật suy
 * diễn không nói hộ được câu "trường này chịu được cách vẽ nào", và tới lúc cần thì phải
 * bóc ngược cả lớp suy diễn ra mới khai lại được.
 */
interface VisualContractBase {
  /**
   * Đơn vị đo + vế bổ nghĩa — xem `units.ts`. `null` với bool và hạng mục.
   *
   * Vế sau dấu · của câu đơn vị ở legend (§3b) nay do `unitPhrase()` dựng, không còn là
   * chuỗi gõ tay: chuỗi gõ tay đã đẻ ra bốn cách viết cho cùng đơn vị mét.
   */
  unit: UnitSpec | null;
  /**
   * Cực tính chỉ phục vụ câu giải thích. Thang tuần tự luôn giữ nhạt = ít,
   * đậm = nhiều của chính đại lượng; không đảo màu theo phán đoán tốt/xấu.
   *
   * Khai từng trường một, không suy ra: "nhiều đường trong ô" không tốt cũng không xấu,
   * và đoán hộ người đọc là bịa thêm một phát biểu mà dữ liệu không nói.
   */
  polarity?: Polarity;
  /**
   * Trường có MỐC — hai bên mốc là hai phát biểu khác nhau, không phải "hơn" và "kém".
   * Khai nó là đổi hẳn bảng màu sang PHÂN KỲ (§4f) và đổi cách chia bậc sang hai phía
   * (§6a-6). Loại trừ lẫn nhau với `polarity`; `test/diverging.test.ts` giữ luật đó.
   *
   * Khai chứ không suy: một số 0 trong dữ liệu không tự nói nó là ranh giới quyết định hay
   * chỉ là điểm thấp nhất của thang. `dist_station_asym_m` cũng có rất nhiều số 0 và nó
   * KHÔNG phân kỳ — 0 ở đó nghĩa là "đi và về bằng nhau", không phải một ngưỡng.
   */
  diverge?: DivergeContract;
  /** Màu hạng mục ổn định theo nghĩa, không theo tần suất của dataset. */
  categorical?: {
    order: readonly string[];
    colors: readonly string[];
    inks: readonly string[];
  };
  /**
   * Trường này vẽ được thành **mặt liên tục** (`ContourLayer`, §1b) — chỉ đúng với đại
   * lượng **cộng được**: cộng dân số của mấy ô lại thì ra dân số của vùng, còn cộng
   * `built_frac` hay `detour_ratio` lại thì ra một con số vô nghĩa. Đây là lý do cờ này
   * phải khai từng trường một chứ không suy ra từ `kind: "numeric"`.
   */
  surface?: boolean;
}

/**
 * Nhánh `map`/`scaleContract` là một UNION PHÂN BIỆT chứ không phải hai member optional —
 * và đó chính là điều QA 2.1-003 đòi: trường lên được bản đồ (`map` vắng mặt = `true`)
 * PHẢI khai `scaleContract` ngay ở literal, để trình biên dịch liệt kê trường còn thiếu
 * thay vì đợi `scaleContractOf()` nổ lúc chạy. Chỉ trường tự khai `map: false` (bối
 * cảnh/bằng chứng — POI, phủ đất, cột inspect) mới được phép không có hợp đồng thang.
 * `scaleContractOf()` vẫn giữ assertion lúc chạy làm phòng tuyến thứ hai.
 */
export type VisualContract = VisualContractBase &
  (
    | {
        /** Vắng mặt (hoặc `true`) = analytical field trên bản đồ ⇒ bắt buộc có hợp đồng thang. */
        map?: true;
        /** Domain/transform/color-mode declaration shared by gradient color and elevation. */
        scaleContract: ScaleContract;
      }
    | {
        /**
         * `false` = có giá trị để inspect hoặc làm input mô hình, nhưng không đủ hợp đồng
         * thị giác để trở thành analytical field trên bản đồ.
         */
        map: false;
        scaleContract?: ScaleContract;
      }
  );

export type FieldMeta = VisualContract & {
  /**
   * Định danh dùng ở state và ở khoá `f` của hash. Trường của xã mang tiền tố
   * `commune:` (§6b); trường của ô là tên trần.
   */
  id: string;
  /** Tên cột/thuộc tính thật trong dữ liệu. Khác `id` ở trường của xã. */
  column: string;
  /** Đơn vị đọc — quyết định hình học nào được tô. Ràng buộc 2 mở rộng, §6b.
   *  Tên là `readAs` chứ không phải `unit` vì `unit` đã là câu đơn vị của legend. */
  readAs: ReadingUnit;
  /**
   * Biểu thức SELECT khi trường KHÔNG phải một cột thô (§13c-1). Bảng ô có bí danh `g`.
   * Đặt ngay cạnh `desc` là có chủ ý: công thức và câu mô tả nó phải sửa cùng một chỗ,
   * nếu không chúng sẽ trôi khỏi nhau và UI sẽ mô tả một phép tính khác phép tính đang chạy.
   */
  expr?: string;
  /** File parquet mà `expr` cần đăng ký thêm ngoài lưới. */
  deps?: string[];
  /** Lens là CÂU HỎI; `readAs` là geometry mang câu trả lời. */
  /** `null` = bối cảnh/bằng chứng, không phải một lens thứ sáu. */
  lens: LensId | null;
  group: GroupId;
  label: string;
  /** mô tả một câu — ô tìm kiếm lọc trên cả trường này, không chỉ trên tên cột */
  desc: string;
  kind: FieldKind;
  /** nhãn của swatch ô-trống ở legend; mặc định “không đo được” */
  nullLabel?: string;
  /**
   * Đơn vị của TẬP CHIA BẬC khi nó khác đơn vị đọc — mặc định vắng, tức hai tập trùng nhau.
   *
   * Chỉ `station:occ` cần: nó đọc theo TRẠM nhưng chia bậc trên 168 giờ × trạm, nên câu
   * "≈16.120 trạm/bậc" của legend đếm đúng số mà gọi sai tên. Khai ở đây thay vì để legend
   * đoán theo `readAs`: legend không có cách nào biết `allOccValues` đã trải phẳng trục giờ.
   */
  classingNoun?: string;
  /**
   * Null của trường này có **HAI nguyên nhân** — §7a mở rộng, và từ Phase 8 là **hình chiếu
   * LÚC CHẠY của `NullContract`** ở `data/null-states.ts`.
   *
   * Vì sao còn tồn tại bên cạnh `NullContract`: hai thứ trả lời hai câu hỏi khác nhau.
   * `NullContract` + `manifest.null_states` cho **số đếm tổng** của một cột; bản đồ thì cần
   * phân loại **từng ô đang nạp** để chọn vân, và nó chỉ có trong tay những cột `fetchCells`
   * mang về. `by` là cột bool rẻ tiền làm được việc đó.
   *
   * Điều bắt buộc là hai bên KHÔNG ĐƯỢC nói khác nhau, và trước Phase 8 chúng nói khác nhau
   * theo đúng nghĩa đen: khai báo cũ TRỪ nhóm `by = true` khỏi mẫu số và gắn ⚠ cho nhóm
   * `by = false`, tức **đảo ngược cả hai** so với §0.2. Với `detour_ratio` điều đó cho rail
   * đọc 99,9 % trong khi khối KHOẢNG TRỐNG đọc 98,0 % — cùng một cột, hai màn hình, hai số.
   *
   * Nên bây giờ mỗi nhánh tự KHAI TRẠNG THÁI của nó, và ba hệ quả suy ra từ trạng thái chứ
   * không ai chọn tay: có bị trừ khỏi mẫu số không (chỉ NOT_APPLICABLE), có đeo ⚠ không
   * (chỉ MISSING và NOT_MEASURED), và vẽ vân góc nào (§6.4).
   * `test/null-states.test.ts` chốt hai bên khớp nhau trên dữ liệu thật.
   */
  nullSplit?: {
    /** Cột bool CÓ SẴN trong hàng đã nạp — phép phân loại phải chạy được không cần truy vấn. */
    by: "network_reachable";
    /** Trạng thái §0.2 khi `by` là `true`, và nhãn của nhóm ấy ở legend. */
    whenTrue: { state: NullState; label: string };
    /** Trạng thái khi `by` là `false`. */
    whenFalse: { state: NullState; label: string };
    /** Hợp đồng mà khai báo này chiếu xuống — `"<bảng>.<cột>"`, test đối chiếu theo khoá này. */
    projects: string;
  };
  /**
   * Câu giải thích đi kèm badge ⚠ phủ ô, khi số thô chưa nói hết.
   *
   * Nhận **hàm của manifest** khi câu đó cần một con số — §7c cấm gõ phần trăm vào file
   * này. `util_cell` là ví dụ đúng của trường hợp đó: câu "9,9% ô" một mình đọc thành
   * "đo kém", mà sự thật là "chỉ tồn tại ở nơi có trạm"; nói được điều đó cần hai số nữa,
   * và chúng phải đến từ dữ liệu chứ không từ trí nhớ của người viết câu.
   */
  coverageNote?: string | ((m: Manifest) => string);
  /** badge ⚠ NGUỒN — khuyết ở thượng nguồn, cột vẫn 100% không-null */
  sourceBadge?: (m: Manifest) => { text: string; explain: string } | null;
  /** cảnh báo riêng, không phải chuyện phủ */
  caveat?: (m: Manifest) => string | null;
};

const FRAC: UnitSpec = { kind: "ratio", note: "diện tích ô" };

const TOGGLE_SQRT_ZERO_P99: ScaleContract = {
  color: "toggle", transform: "sqrt", clip: { lo: 0, hi: "p99" },
};
const TOGGLE_SQRT_MIN_P99: ScaleContract = {
  color: "toggle", transform: "sqrt", clip: { lo: "min", hi: "p99" },
};
const TOGGLE_LINEAR_ZERO_NONE: ScaleContract = {
  color: "toggle", transform: "linear", clip: { lo: 0, hi: "none" },
};
const TOGGLE_LINEAR_MIN_P99: ScaleContract = {
  color: "toggle", transform: "linear", clip: { lo: "min", hi: "p99" },
};
const SUPPLY_FIXED: ScaleContract = {
  color: "fixed-binned", transform: "sqrt", clip: { lo: 0, hi: "p99" },
  reason: "Cung có quá nhiều giá trị 0; gradient sẽ dồn gần toàn bộ dải vào một khối không phân biệt được.",
};
const POP_BEYOND_FIXED: ScaleContract = {
  color: "fixed-binned", transform: "sqrt", clip: { lo: 0, hi: "p99" },
  reason: "Trường này có nhiều số 0 và đuôi lệch mạnh; giữ lớp 0 riêng cùng các bậc phân vị.",
};
const CATEGORICAL_FIXED: ScaleContract = {
  color: "fixed-binned", transform: "linear", clip: { lo: "min", hi: "none" },
  reason: "Trường hạng mục không có trật tự liên tục để nội suy gradient.",
};
const BOOL_FIXED: ScaleContract = {
  color: "fixed-binned", transform: "linear", clip: { lo: "min", hi: "none" },
  reason: "Trường đúng/sai chỉ có hai trạng thái, không có miền liên tục.",
};

/** Khai báo một trường trước khi gắn đơn vị đọc — `unit`/`column` do bảng dưới suy ra. */
/** `Omit` thường GỘP union về các khoá chung — nó sẽ xoá mất union phân biệt map/scaleContract
 *  vừa dựng ở trên. Bản phân phối giữ từng nhánh riêng, nên spec thiếu hợp đồng vẫn bị bắt. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Spec = DistributiveOmit<FieldMeta, "readAs" | "column" | "lens"> & { column?: string };

// ── Trường của Ô (bảng grid_h3_r8.parquet) ─────────────────────────────────────

const CELL_SPECS: Spec[] = [
  // ── 1. CẦU — ai cần sạc (12) ──────────────────────────────────────────────
  {
    id: "population",
    group: "cau",
    label: "Dân số",
    desc: "Phân bổ dasymetric: bề mặt WorldPop 2025 neo theo số dân công bố của từng xã VNSDI.",
    unit: { kind: "person", note: "trên ô ~0,74 km²" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
    // Trường DUY NHẤT có mặt liên tục ở M2 (§13d-A: "cầu vón cục, không đều" là luận điểm
    // A, và mặt độ là mark của nó). Dân số cộng được, và nó không có ô null nào — nên phép
    // cộng không âm thầm bỏ sót ô. Trường có null mà đem cộng thì mặt sẽ trũng xuống ở
    // đúng chỗ ta không biết, tức vẽ "ít người" ở nơi thật ra là "không đo được".
    surface: true,
  },
  {
    id: "pop_density_ppkm2",
    group: "cau",
    label: "Mật độ dân số",
    desc: "Dân số chia cho diện tích ô.",
    unit: { kind: "ppkm2" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
  },
  {
    id: "n_apartment",
    group: "cau",
    label: "Chung cư",
    desc: "Số toà chung cư OSM nằm trong ô.",
    unit: { kind: "building" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
  },
  {
    id: "apartment_levels_sum",
    group: "cau",
    label: "Tổng tầng chung cư",
    desc: "Cộng số tầng của các toà chung cư trong ô — chặn dưới, vì phần lớn toà không có tag số tầng trong OSM.",
    unit: { kind: "floor" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
    sourceBadge: (m) => {
      const a = m.source_metrics?.apartment_levels_tagged;
      if (!a) return null;
      return {
        text: `nguồn ${pct(a.share)}`,
        explain:
          `Chỉ ${a.n_tagged.toLocaleString("vi-VN")}/${a.n_total.toLocaleString("vi-VN")} toà chung cư ` +
          `trong OSM có tag số tầng. Cột không có ô null, nhưng con số là CHẶN DƯỚI chứ không phải số đo.`,
      };
    },
  },
  {
    id: "n_poi_1km",
    // Bối cảnh/bằng chứng — không phải analytical field, nên không có hợp đồng thang.
    map: false,
    group: "cau",
    label: "Điểm quan tâm trong 1 km",
    desc: "Số POI trong bán kính 1 km quanh tâm ô — PHƠI NHIỄM, khác với “có gì trong ô”.",
    unit: { kind: "poi", note: "trong bán kính 1 km" },
    kind: "numeric",
    // Khác `n_poi_total` ở KHÁI NIỆM, không phải ở thang đo. `n_poi_total` là KIỂM KÊ
    // (ô này chứa gì); trường này là PHƠI NHIỄM (quanh điểm này có gì). Đo được là phơi
    // nhiễm mới dự báo nhu cầu: trên 632 trạm có `util` tin cậy, thêm nó vào mô hình đưa
    // R² từ 0,266 lên 0,313 — hơn cả khối 18 lớp cơ cấu POI.
    // §7c: con số phải là HÀM của manifest, không được gõ tay — nếu không nó sẽ âm thầm
    // sai khi dữ liệu đổi. Chỉ ngưỡng ĐỊNH NGHĨA mới được viết cứng, và ở đây không có.
    coverageNote: (m) => {
      const z = m.source_metrics?.poi_empty_1km;
      const head = z
        ? `${pct(z.share_cells)} số ô có ĐÚNG 0 POI trong 1 km, và ${pct(z.share_pop)} dân Hà Nội sống ở những ô đó. `
        : "";
      return (
        head +
        "Số 0 ở đây phần lớn KHÔNG có nghĩa “không có hoạt động” mà có nghĩa “OpenStreetMap chưa vẽ tới”: gần một nửa số xã/phường không có một cái chợ nào trong OSM, dù ở Việt Nam điều đó không thể đúng. Đừng đọc trường này như mật độ kinh tế — xem notebook `poi_chat_luong`."
      );
    },
  },
  {
    id: "n_poi_total",
    map: false,
    group: "cau",
    label: "Tổng điểm quan tâm",
    desc: "Cộng 8 loại POI: chung cư, bãi đỗ, đỗ lòng đường, cây xăng, siêu thị, chợ, trung tâm thương mại, bách hoá.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_mall",
    map: false,
    group: "cau",
    label: "Trung tâm thương mại",
    desc: "Số trung tâm thương mại OSM trong ô.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_dept_store",
    map: false,
    group: "cau",
    label: "Cửa hàng bách hoá",
    desc: "Số cửa hàng bách hoá OSM trong ô.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_supermarket",
    map: false,
    group: "cau",
    label: "Siêu thị",
    desc: "Số siêu thị OSM trong ô.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_market",
    map: false,
    group: "cau",
    label: "Chợ",
    desc: "Số chợ OSM trong ô.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_parking_off",
    map: false,
    group: "cau",
    label: "Bãi đỗ xe",
    desc: "Số bãi đỗ xe tách khỏi lòng đường.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_parking_street",
    map: false,
    group: "cau",
    label: "Chỗ đỗ lòng đường",
    desc: "Số chỗ đỗ xe dọc lòng đường.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "n_fuel",
    map: false,
    group: "cau",
    label: "Cây xăng",
    desc: "Số cây xăng OSM trong ô.",
    unit: { kind: "poi" },
    kind: "numeric",
  },
  {
    id: "poi_anchor_index",
    group: "cau",
    label: "Chỉ số nêm điểm đến",
    desc: "Tổng hợp có trọng số các POI thu hút xe dừng (Chung cư, Siêu thị, TTM, Cây xăng, Bãi đỗ).",
    unit: { kind: "index" },
    kind: "numeric",
    // Proxy composite từ OSM: chưa có coverage/sensitivity contract để làm analytical map.
    map: false,
    expr:
      'COALESCE(g."n_apartment", 0) * 3.0 + COALESCE(g."n_mall", 0) * 4.0 + COALESCE(g."n_supermarket", 0) * 2.0 + COALESCE(g."n_fuel", 0) * 3.0 + COALESCE(g."n_parking_off", 0) * 2.0',
  },

  // ── 2. ĐẤT — đặt được không (12) ──────────────────────────────────────────
  {
    id: "built_frac",
    map: false,
    group: "dat",
    label: "Đã xây dựng",
    desc: "Phần diện tích ô là mặt bằng đã xây dựng, lớp phủ ESA WorldCover.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "water_frac",
    map: false,
    group: "dat",
    label: "Mặt nước",
    desc: "Phần diện tích ô là mặt nước.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "crop_frac",
    map: false,
    group: "dat",
    label: "Đất trồng trọt",
    desc: "Phần diện tích ô là đất canh tác.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "tree_frac",
    map: false,
    group: "dat",
    label: "Cây gỗ",
    desc: "Phần diện tích ô có tán cây gỗ.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "grass_frac",
    map: false,
    group: "dat",
    label: "Cỏ",
    desc: "Phần diện tích ô là thảm cỏ.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "shrub_frac",
    map: false,
    group: "dat",
    label: "Cây bụi",
    desc: "Phần diện tích ô là cây bụi.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "bare_frac",
    map: false,
    group: "dat",
    label: "Đất trống",
    desc: "Phần diện tích ô là đất trống hoặc thưa thực vật.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "wetland_frac",
    map: false,
    group: "dat",
    label: "Đất ngập nước",
    desc: "Phần diện tích ô là đất ngập nước.",
    unit: FRAC,
    kind: "numeric",
  },
  {
    id: "area_km2",
    group: "dat",
    label: "Diện tích ô",
    desc: "Diện tích hình học của ô H3 độ phân giải 8.",
    unit: { kind: "km2" },
    kind: "numeric",
    map: false,
  },
  {
    id: "area_frac",
    group: "dat",
    label: "Phần ô trong tỉnh",
    // Câu chữ trung tính theo tỉnh, không phải vì "tổng quát hoá cho đẹp": nhãn này hiện
    // ở MỌI tỉnh của store toàn quốc, và "Phần ô trong Hà Nội" ở bản đồ Cà Mau là một câu
    // sai đang hiển thị. Hà Nội cũng là một tỉnh, nên câu mới đúng ở cả hai bộ.
    desc: "Phần diện tích ô nằm trong ranh giới cấp tỉnh — ô ven biên chỉ thuộc một phần.",
    unit: { kind: "ratio" },
    kind: "numeric",
    map: false,
  },

  // ── 3. ĐƯỜNG — xe tới được không (9) ──────────────────────────────────────
  {
    id: "road_len_m",
    group: "duong",
    label: "Tổng chiều dài đường",
    desc: "Tổng chiều dài đường ô tô đi được trong ô. Không tính lối bộ, đường mòn, làn xe đạp.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    // Cùng khái niệm với `road_len_in_hanoi_m`, khác TÊN CỘT — và hai dòng cùng tồn tại là
    // cố ý, không phải trùng lặp. Bộ Hà Nội đặt tên cột mang tên tỉnh (`..._in_hanoi_m`);
    // store toàn quốc không thể làm vậy nên nó là `..._in_province_m`. Đổi tên cột của bộ
    // cũ sẽ dựng lại mọi con số đã công bố của Hà Nội, nên hai tên sống cạnh nhau và
    // `fieldAvailable` cho đúng MỘT trong hai hiện lên tuỳ bộ dữ liệu đang mở.
    id: "road_len_in_province_m",
    group: "duong",
    label: "Đường trong ranh giới",
    desc: "Phần chiều dài đường nằm TRONG ranh giới tỉnh. Bằng tổng chiều dài ở ô nằm trọn trong tỉnh; nhỏ hơn ở ô biên.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_arterial_m",
    group: "duong",
    label: "Đường trục chính",
    desc: "Cộng 4 cấp cao nhất: cao tốc, quốc lộ, đường chính, đường thứ cấp.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_motorway_m",
    group: "duong",
    label: "Cao tốc",
    desc: "Chiều dài đường cấp cao tốc trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_trunk_m",
    group: "duong",
    label: "Quốc lộ",
    desc: "Chiều dài đường cấp quốc lộ trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_primary_m",
    group: "duong",
    label: "Đường chính",
    desc: "Chiều dài đường cấp chính trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_secondary_m",
    group: "duong",
    label: "Đường thứ cấp",
    desc: "Chiều dài đường cấp thứ cấp trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_tertiary_m",
    group: "duong",
    label: "Đường cấp ba",
    desc: "Chiều dài đường cấp ba trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_local_m",
    group: "duong",
    label: "Đường nội bộ",
    desc: "Chiều dài đường khu dân cư, ngõ phố trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },
  {
    id: "road_len_service_m",
    group: "duong",
    label: "Đường phục vụ",
    desc: "Chiều dài đường dẫn nội khu — lối vào bãi xe, sân, kho — trong ô.",
    unit: { kind: "m" },
    kind: "numeric",
    map: false,
  },

  // ── 4. CUNG — đã có gì (5) ────────────────────────────────────────────────
  {
    id: "n_stations",
    group: "cung",
    label: "Số trạm sạc",
    desc: "Số trạm sạc trong ô theo ảnh chụp canonical evcs.vn.",
    unit: { kind: "station" },
    kind: "numeric",
    scaleContract: SUPPLY_FIXED,
  },
  {
    id: "n_stations_operational",
    group: "cung",
    label: "Trạm đang vận hành",
    desc: "Trong số đó, những trạm có trạng thái vận hành là OPERATIONAL.",
    unit: { kind: "station" },
    kind: "numeric",
    scaleContract: SUPPLY_FIXED,
  },
  {
    id: "n_ports",
    group: "cung",
    label: "Số súng sạc",
    desc: "Số súng LẮP ĐẶT (tầng tài sản), không phải số súng đang báo cáo — hai con số này khác nhau và không nên bằng nhau.",
    unit: { kind: "port" },
    kind: "numeric",
    scaleContract: SUPPLY_FIXED,
  },
  {
    id: "power_kw_site",
    group: "cung",
    label: "Công suất điểm",
    desc: "Tổng công suất các tủ sạc trong ô, cộng theo tủ chứ không cộng nameplate từng súng.",
    unit: { kind: "kw" },
    kind: "numeric",
    scaleContract: SUPPLY_FIXED,
  },
  {
    id: "dist_station_network_m",
    group: "tiepcan",
    label: "Cách trạm gần nhất, theo đường",
    desc: "Khoảng cách theo mạng đường từ tâm ô tới trạm gần nhất, Dijkstra đa nguồn, tôn trọng đường một chiều.",
    unit: { kind: "m", note: "theo mạng đường" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_MIN_P99,
    polarity: "high-bad",
    coverageNote:
      "Ô không tới được để trống, không điền một giá trị lớn tuỳ tiện. Trường này KHÔNG phụ thuộc bảng tốc độ giả định — cần số cứng thì dùng nó chứ không dùng phút.",
  },
  {
    id: "dist_station_euclid_m",
    group: "tiepcan",
    label: "Cách trạm gần nhất, chim bay",
    desc: "Khoảng cách đường thẳng từ tâm ô tới trạm gần nhất. Đây KHÔNG phải bản dự phòng của trường theo đường — nó là một khái niệm riêng, dùng cho câu hỏi về BỐ TRÍ không gian (hai trạm có gần nhau quá không), không dùng để trả lời “ô này đã được phủ chưa”.",
    unit: { kind: "m", note: "đường chim bay" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_MIN_P99,
    caveat: () =>
      "Đừng dùng bán kính chim bay để kết luận độ phủ: ở bán kính 3 km nó báo phủ nhầm khoảng một phần tư số ô nó nói là đã phủ, và sai LUÔN VỀ MỘT PHÍA (đường đi thật không bao giờ ngắn hơn chim bay). Xem trường Hệ số đi vòng.",
  },
  {
    // Trường SO SÁNH đầu tiên (DESIGN §13c): không vẽ MỨC mà vẽ ĐỘ LỆCH — ở đây là sai số
    // của phép đo đã bị loại. Đây là trường duy nhất hiện có mà bản đồ của nó là một phát
    // biểu ("chim bay nói dối ở đâu, và sông là lý do") chứ không phải một bảng màu.
    //
    // Cột thuộc bảng ô và vẫn được đếm trong 8 cột của nhóm TIẾP CẬN ở §6; nhóm ở đây là
    // `sosanh` vì rail gom theo CÁCH ĐỌC (§6, đoạn "Nhóm thứ 6").
    id: "detour_ratio",
    group: "sosanh",
    label: "Hệ số đi vòng",
    desc: "Đường thật dài gấp mấy lần đường chim bay: khoảng cách theo mạng đường chia cho khoảng cách thẳng tới trạm gần nhất.",
    unit: { kind: "times", note: "mạng ÷ chim bay" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_MIN_P99,
    polarity: "high-bad",
    // Hai loại null, không một — xem `nullSplit`. `s08` từ chối tính tỉ số khi khoảng cách
    // chim bay < 200 m (`DETOUR_MIN_EUCLID_M`), vì ở cỡ đó `dist_station_network_m` bị
    // `road_access_offset_m` chi phối: tỉ số đo ĐỘ LỆCH CỦA TÂM Ô so với mặt đường, không
    // đo hình học sông/cầu mà trường này nói về. Câu hỏi không áp dụng — khác hẳn "chưa biết".
    // Ô tới được mà vẫn trống ⇒ chim bay < 200 m ⇒ LUẬT CỦA TA gỡ giá trị đi: đó là FILTERED,
    // và FILTERED Ở LẠI mẫu số (§0.2) — giá trị vốn tồn tại, ta chọn không công bố nó.
    // Ô không tới được ⇒ không có đường nào tới ⇒ câu hỏi không tồn tại: NOT_APPLICABLE, và
    // đó là nhóm DUY NHẤT rời khỏi mẫu số. Không nhóm nào đeo ⚠.
    nullSplit: {
      by: "network_reachable",
      whenTrue: { state: "FILTERED", label: "sát trạm dưới 200 m, luật của ta không tính tỉ số" },
      whenFalse: { state: "NOT_APPLICABLE", label: "không tới được bằng đường bộ" },
      projects: "grid.detour_ratio",
    },
    coverageNote:
      "Ô để trống có HAI nguyên nhân khác hẳn nhau, và chúng vẽ bằng hai vân khác nhau: ô không tới được bằng đường bộ (vân chéo — thật sự không biết), và ô sát trạm dưới 200 m (vân dọc — câu hỏi không áp dụng). Về phần có giá trị: 1 nghĩa là đi thẳng được, 2 nghĩa là chim bay nói ô này gần gấp đôi thực tế; sông Hồng và số cầu ít là nguyên nhân hình học của phần lớn ô cao.",
  },
  {
    id: "dist_station_asym_m",
    group: "sosanh",
    label: "Chênh lệch đi ↔ về",
    desc: "Quãng đường tới trạm khác quãng đường từ trạm về bao nhiêu mét, do đường một chiều.",
    unit: { kind: "m", note: "|đi − về|" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
    polarity: "high-bad",
    // Trường này KHÔNG phải cột khoảng cách thứ hai — nó là phần thông tin duy nhất mà chiều
    // về có mà chiều đi không có. Phát cả `dist_from` sẽ cho hai cột trùng nhau 95,7%, và
    // hai cột gần giống nhau chỉ mời người đọc chia chúng cho nhau (A5).
    //
    // 0 trên hơn nửa số ô là GIÁ TRỊ THẬT, không phải thiếu dữ liệu: phần lớn Hà Nội là đường
    // hai chiều nên đi và về bằng nhau đúng bằng 0 m. Đừng gắn ⚠ cho nhóm này.
    coverageNote:
      "Trung vị đúng bằng 0 m — phần lớn đường Hà Nội hai chiều nên đi và về bằng nhau. Chỉ 182 ô lệch quá 500 m, và chúng bám vào các cặp đường một chiều; đó mới là chỗ trường này có ý nghĩa. Ô để trống là ô không tới được bằng đường bộ.",
  },
  {
    id: "road_access_offset_m",
    group: "tiepcan",
    label: "Quãng ra tới mạng đường",
    desc: "Khoảng cách đường thẳng từ tâm ô ra điểm vào mạng đường; đã cộng vào hai trường trên.",
    unit: { kind: "m" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
  },
  {
    id: "util_cell",
    group: "tiepcan",
    label: "Mức sử dụng của ô",
    desc: "Trung bình có trọng số số cổng, trên các trạm đủ điều kiện công bố trong ô. Ô không có trạm đo được để TRỐNG, không phải 0.",
    unit: { kind: "ratio", note: "cổng-giờ bận" },
    kind: "numeric",
    // Aggregate chỉ để inspect: lens Sử dụng đọc trạng thái ở chính điểm trạm theo giờ.
    map: false,
    coverageNote: (m) => {
      const c = m.coverage["util_cell"];
      const ok = m.source_metrics?.occ_status_ok;
      const n = c?.cells_with_station;
      const share = c?.share_measured_among_cells_with_station;
      // Thiếu số thì nói câu không có số, KHÔNG bịa — §12.
      const denom =
        n !== undefined && share !== undefined
          ? `Chỉ ${n.toLocaleString("vi-VN")} ô có trạm công cộng, và ${pct(share)} trong số đó đo được`
          : "Trường này chỉ tồn tại ở ô có trạm công cộng";
      const tier = ok ? ` Ở tầng TRẠM con số lại khác nữa: ${pct(ok.share)} trạm báo cáo đủ chuẩn.` : "";
      return (
        `Mẫu số toàn lưới dễ đọc nhầm thành “đo kém”. ${denom} — trường này không đo kém, ` +
        `nó chỉ TỒN TẠI ở nơi có trạm.${tier} Ba tầng, ba mẫu số, đừng trộn.`
      );
    },
  },
  {
    id: "n_stations_measured",
    group: "tiepcan",
    label: "Số trạm đo được",
    desc: "Số trạm trong ô đóng góp vào mức sử dụng của ô.",
    unit: { kind: "station" },
    kind: "numeric",
    map: false,
  },
  {
    id: "network_reachable",
    group: "tiepcan",
    label: "Tới được bằng đường bộ",
    desc: "Có đường đi hợp lệ từ tâm ô tới một trạm sạc không.",
    unit: null,
    kind: "bool",
    scaleContract: BOOL_FIXED,
  },
  {
    id: "evidence_grade_distance",
    group: "tiepcan",
    label: "Hạng bằng chứng khoảng cách",
    desc: "Con số khoảng cách được tạo ra bằng cách nào, hoặc vì sao không có.",
    unit: null,
    kind: "categorical",
    scaleContract: CATEGORICAL_FIXED,
    categorical: {
      order: ["OSM_NETWORK", "UNREACHABLE_NO_ROAD_ACCESS", "UNREACHABLE_NO_PATH"],
      colors: ["#2f7d68", "#8d4e49", "#6b5b95"],
      inks: ["#ffffff", "#ffffff", "#ffffff"],
    },
  },

  // ── 6. SO SÁNH — trường phái sinh (§13c-1) ────────────────────────────────
  // Không có cột nào của riêng chúng. `expr` ngay dưới `desc` là hợp đồng của §13c-1:
  // mọi con số hiện ra truy được về một cột thật, không có hằng số nào bịa ra.
  {
    id: "screen_decision",
    group: "sosanh",
    label: "Engine sàng lọc: quyết định",
    desc: "Nếu có đơn xin đặt trạm ở ô này, engine quy hoạch trả về gì — ĐỀ XUẤT, ĐỀ XUẤT NẾU CÓ DC, hay TỪ CHỐI.",
    unit: null,
    kind: "categorical",
    scaleContract: CATEGORICAL_FIXED,
    categorical: {
      order: ["TU_CHOI", "DE_XUAT_NEU_CO_DC", "DE_XUAT"],
      colors: ["#8d4e49", "#b7791f", "#2f7d68"],
      inks: ["#ffffff", "#0b0b0b", "#ffffff"],
    },
    nullLabel: "không đủ dữ liệu chạy rule",
    // Đây là ĐẦU RA CỦA RULE, không phải một số đo về thành phố. Nó đổi khi rule đổi.
    // Ngưỡng: Phường > 500 m, Xã > 2.000 m, đo bằng CHIM BAY (khách hàng chốt); ngoại lệ
    // hạ Xã xuống 500 m khi trạm gần nhất có util ≥ 40%.
    coverageNote:
      "Trường này là ĐẦU RA CỦA MỘT BỘ RULE, không phải một số đo về thành phố — nó đổi khi rule đổi. Chạy ngược bộ rule trên các trạm ĐANG VẬN HÀNH thì nó từ chối phần lớn trong số đó, tuỳ cách giải nghĩa ba chỗ mơ hồ. Và nguồn không có trạm “sắp vận hành”, nên engine sẽ ĐỀ XUẤT ở cả những chỗ sắp có trạm.",
  },
  {
    id: "screen_margin_m",
    group: "sosanh",
    label: "Cách ngưỡng phê duyệt",
    desc: "Khoảng cách chim bay tới trạm gần nhất TRỪ đi ngưỡng của loại đơn vị (Phường 500 m, Xã 2.000 m). Dương = đủ xa.",
    unit: { kind: "m", note: "âm = chưa đủ xa" },
    kind: "numeric",
    scaleContract: TOGGLE_LINEAR_MIN_P99,
    nullLabel: "không đủ dữ liệu tính biên rule",
    // Trường PHÂN KỲ duy nhất của atlas, và nó là trường duy nhất CÓ giá trị âm: quét cả
    // `grid_h3_r8` / `commune` / `stations` / `provinces` thì chỉ cột này có `min < 0`.
    //
    // Trước khai `polarity: "high-good"`, và cách khai đó vừa thiếu vừa tự mâu thuẫn. Thiếu:
    // một thang tuần tự đặt ranh giới quyết định vào GIỮA bậc thứ 5 (−74 m → +372 m), tức
    // tô cùng màu cho hai bên của đúng cái ranh giới mà trường này dựng ra để chỉ. Mâu
    // thuẫn: câu cực tính in ra là "đậm = thiếu", trong khi đậm ở đây là ô SÁT trạm — chỗ
    // không thiếu gì cả.
    diverge: { at: 0, hue: "above", ends: ["chưa đủ xa", "đủ xa"] },
    coverageNote:
      "Số 0 chỉ là ranh giới của ĐIỀU KIỆN KHOẢNG CÁCH CƠ SỞ: trên 0 là đủ xa, dưới 0 là chưa đủ. Nó không đồng nhất với quyết định cuối vì screen_decision còn ngoại lệ DC/tải cao. Ngưỡng là quy định, không phải phép đo.",
  },
  {
    id: "pop_beyond_2km",
    group: "sosanh",
    label: "Dân ngoài 2 km đường",
    desc: "Số người trong ô mà trạm gần nhất ở xa hơn 2 km TÍNH THEO ĐƯỜNG ĐI. Đây là CẦU CHƯA ĐƯỢC PHỤC VỤ — chính là đối tượng của bài toán đặt trạm.",
    unit: { kind: "person", note: "ngưỡng 2 km theo mạng đường" },
    kind: "numeric",
    scaleContract: POP_BEYOND_FIXED,
    // Ngưỡng bằng MÉT chứ không bằng PHÚT là có chủ đích: bộ dữ liệu không còn phát trường
    // thời gian nào, vì con số phút hoàn toàn do một bảng tốc độ giả định quyết định.
    // Mét thì đo trên chính hình học đường — ngưỡng vẫn là lựa chọn, nhưng ĐẠI LƯỢNG thì không.
    //
    // `NULL` khi không tới được: không biết xa bao nhiêu thì không được nói là 0 (ràng buộc 1).
    // `0` khi tới được trong ≤2 km: đó là "biết là không", một phát biểu đúng (§7a).
    expr:
      'CASE WHEN g."dist_station_network_m" IS NULL THEN NULL ' +
      `WHEN g."dist_station_network_m" > ${BEYOND_2KM_M} THEN g."population" ELSE 0 END`,
    coverageNote:
      "Ô để trống là ô KHÔNG TỚI ĐƯỢC bằng đường bộ — không biết xa bao nhiêu nên không được ghi 0. Ô ghi 0 thì khác hẳn: nó nằm trong 2 km đường, tức thật sự không có ai ngoài ngưỡng. Hai trạng thái đó vẽ khác nhau: 0 là một bậc màu, trống là gạch chéo.",
  },
  {
    id: "util_pctl_cell",
    group: "sosanh",
    label: "Bận so với trạm cùng loại",
    desc: "Các trạm trong ô đứng ở phân vị nào so với những trạm CÙNG LOẠI dòng điện trong Hà Nội. 0,5 là đúng mức trung vị của nhóm; cao hơn nghĩa là bận bất thường.",
    unit: { kind: "pctl", note: "trong nhóm cùng loại, 0,5 = trung vị" },
    kind: "numeric",
    map: false,
    deps: [dataPath("stations.parquet"), dataPath("station_occupancy.parquet")],
    // Trung bình có trọng số SỐ CỔNG, cùng khuôn với `util_cell` ở B10 — một trạm 30 cổng
    // nói nhiều hơn một trạm 2 cổng về mức bận của cả ô.
    //
    // Dùng `util_pctl` có sẵn chứ KHÔNG tự chia cho trung vị: `util_pctl` đã là "vị trí
    // trong nhóm cùng loại", tính lại trong phạm vi Hà Nội ở B6, và 0,5 CHÍNH LÀ trung vị.
    // Tự dựng một phép chia nữa là tạo khái niệm thứ hai cho cùng một thứ (§13c-1).
    expr:
      "(SELECT sum(o.util_pctl / 100.0 * greatest(o.util_denominator_ports, 1))" +
      " / sum(greatest(o.util_denominator_ports, 1))" +
      ` FROM read_parquet('${dataPath("stations.parquet")}') s` +
      ` JOIN read_parquet('${dataPath("station_occupancy.parquet")}') o ON o.station_code = s.station_code` +
      ' WHERE s.h3_r8 = g."h3_r8" AND o.util_pctl IS NOT NULL)',
    coverageNote:
      "Thưa hơn cả mức sử dụng: phân vị chỉ tính cho trạm hạng GOOD, nên ô có trạm nhưng chưa đủ quan sát vẫn để trống. Trống ở đây là “chưa xếp hạng được”, không phải “bận bằng 0”.",
  },
  {
    id: "demand_supply_gap",
    group: "sosanh",
    label: "Chênh lệch Cung - Cầu",
    desc: "Chỉ số thiếu hụt trạm sạc: Dân số và POI cao nhưng thưa súng sạc. Giá trị càng cao càng thể hiện vùng lõm phục vụ.",
    unit: { kind: "index", note: "chênh lệch, > 0 = thiếu hụt" },
    kind: "numeric",
    polarity: "high-bad",
    // Chỉ số có trọng số policy-like; linked/bivariate view là fallback trước khi ship score.
    map: false,
    expr:
      'CASE WHEN g."population" IS NULL THEN NULL ' +
      'ELSE (g."population" / 1000.0 + COALESCE(g."n_apartment", 0) * 10.0 + COALESCE(g."n_mall", 0) * 5.0) ' +
      '- (COALESCE(g."n_ports", 0) * 50.0 + COALESCE(g."power_kw_site", 0) * 0.5) END',
    coverageNote:
      "Chỉ số chênh lệch dương thể hiện khu vực dân cư và điểm thương mại tập trung cao nhưng hạ tầng sạc công cộng còn thưa thớt.",
  },
];

// ── Trường của XÃ (bảng commune.parquet → commune.geojson) ─────────────────────
//
// Đơn vị đọc thứ hai — §6b. Đây là từ vựng của zoom thấp: 126 mảng gọi được tên, thay cho
// 4.4 nghìn hạt 9 px. Ràng buộc 2 không đổi, vì vẫn chỉ MỘT trường được tô mỗi lúc và đơn vị
// của trường đó quyết định hình học nào được tô.
//
// Mọi trường ở đây là CỘT THẬT của `commune.parquet` (dựng ở B11) — không có đại lượng nào
// tính lại ở phía web.

const COMMUNE_SPECS: Spec[] = [
  {
    id: "population",
    group: "cau",
    label: "Dân số xã",
    desc: "Số dân của xã/phường: số công bố VNSDI, trừ 2 xã có số hỏng đã thay bằng WorldPop có khai báo.",
    unit: { kind: "person", note: "trên toàn xã" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
  },
  {
    id: "pop_density_ppkm2",
    group: "cau",
    label: "Mật độ dân số xã",
    desc: "Dân số xã chia cho diện tích xã. So sánh được giữa các xã, khác với mật độ theo ô.",
    unit: { kind: "ppkm2" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_ZERO_P99,
  },
  {
    id: "n_stations",
    group: "cung",
    label: "Số trạm trong xã",
    desc: "Số trạm sạc công cộng nằm trong ranh giới xã. Điểm sạc cá nhân 1 súng AC không được tính.",
    unit: { kind: "station" },
    kind: "numeric",
    // Tổng theo xã bị chi phối bởi quy mô đơn vị; xem point trạm hoặc cổng/10k dân.
    map: false,
  },
  {
    id: "n_ports",
    group: "cung",
    label: "Số súng trong xã",
    desc: "Tổng số súng lắp đặt của các trạm trong xã — tầng tài sản, không phải số súng đang báo cáo.",
    unit: { kind: "port" },
    kind: "numeric",
    map: false,
  },
  {
    id: "power_kw_site",
    group: "cung",
    label: "Công suất của xã",
    desc: "Tổng công suất tủ sạc trong xã.",
    unit: { kind: "kw" },
    kind: "numeric",
    map: false,
  },
  {
    id: "dist_station_m_pop_weighted",
    group: "tiepcan",
    label: "Khoảng cách trung bình theo dân",
    desc: "Trung bình khoảng cách theo đường tới trạm gần nhất, có trọng số DÂN SỐ — nên nó nói về người dân của xã chứ không về diện tích xã.",
    unit: { kind: "m", note: "theo mạng đường, trọng số dân" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_MIN_P99,
    polarity: "high-bad",
  },
  {
    id: "util_mean_port_weighted",
    group: "tiepcan",
    label: "Mức sử dụng của xã",
    desc: "Trung bình mức sử dụng các trạm trong xã, trọng số số cổng. Xã không có trạm đo được để TRỐNG, không phải 0.",
    unit: { kind: "ratio", note: "cổng-giờ bận" },
    kind: "numeric",
    map: false,
    coverageNote:
      "Xã trống là xã không có trạm công cộng nào báo cáo đủ chuẩn — không phải xã có trạm rảnh.",
  },
  {
    // Trường SO SÁNH ở đơn vị xã (§13c-1). Ở tầng ô nó vô nghĩa: phần lớn ô có 0 cổng và
    // vài trăm dân, nên tỉ số ra 0 hoặc ra một số khổng lồ tuỳ mẫu số. Xã là đơn vị nhỏ
    // nhất mà "cổng trên 10k dân" còn đọc được.
    id: "ports_per_10k_pop",
    group: "sosanh",
    label: "Cổng trên 10k dân",
    desc: "Số súng sạc trên mỗi 10.000 dân của xã — cung và cầu gộp vào MỘT con số, nên đọc được ngay là xã nào đang lệch.",
    unit: { kind: "port", note: "trên 10.000 dân" },
    kind: "numeric",
    scaleContract: SUPPLY_FIXED,
    coverageNote:
      "Đây là tỉ số, không phải số đếm: một xã ít dân có vài trạm lớn sẽ vọt lên rất cao mà không có nghĩa là nó được phục vụ tốt hơn. Đọc kèm dân số xã.",
  },
];

// ── Trường của MẠNG ĐƯỜNG (roads.parquet, ship ở M3-R) ─────────────────────────
//
// Đơn vị đọc thứ ba — §6b. Đi qua đúng cánh cửa mà `commune` đã mở: khi trường này được
// chọn, **đường LÀ trường** (tô ramp), còn hex và xã không vẽ. Một ramp, một legend.
//
// Chỉ MỘT trường, và §6b đã chốt hệ quả của điều đó: công tắc đơn vị trong rail không mở
// rộng thành 4 vị trí — trường này nằm trong nhóm ĐƯỜNG như một dòng radio thường, mang
// ghi chú đơn vị ngay trong nhãn.

const ROAD_SPECS: Spec[] = [
  {
    id: "dist_station_m",
    group: "duong",
    label: "Đoạn đường — cách trạm gần nhất",
    desc: "Khoảng cách theo mạng đường từ ĐOẠN ĐƯỜNG này tới trạm gần nhất, lấy từ chính phép Dijkstra đa nguồn đã tính khoảng cách cho ô (s08). Đơn vị đọc là đoạn đường, không phải ô — nó cho thấy khoảng cách CHẢY thế nào dọc phố và khựng lại ở đâu.",
    unit: { kind: "m", note: "theo mạng đường · đo trên đoạn đường" },
    kind: "numeric",
    scaleContract: TOGGLE_SQRT_MIN_P99,
    polarity: "high-bad",
    // 396/160.823 đoạn không tới được mang null. Ràng buộc 1 áp cho cả đường: chúng không
    // được rơi vào bậc ramp nào, và cũng không được vẽ thành "gần trạm".
    coverageNote:
      "Đoạn không tới được vẽ bằng MỰC XÁM của vân null (§4b), không phải một bậc ramp — đường 1px không mang được vân 45°, nên chất liệu chuyển thành mực, giữ nguyên khái niệm. Đây là cùng một câu “không đo được” mà ô null nói, chỉ khác hình học.",
  },
];

// ── Trường của TRẠM (station_occupancy_profile_168h.parquet, M4) ───────────────
//
// Đơn vị đọc thứ tư — §6b. Cùng cánh cửa mà `commune` mở và `road` đã đi qua: khi trường
// này được chọn, **939 chấm trạm LÀ trường** (tô ramp theo giờ `t` của scrubber), còn
// hex/xã/đường không vẽ. Một ramp, một legend — ràng buộc 2 nguyên vẹn.
//
// Đây cũng là câu trả lời cho câu hỏi mà §3e để ngỏ suốt M0–M3: scrubber tác động lên lớp
// trạm BẰNG KÊNH NÀO. Mọi kênh khác đều vướng luật (overlay không mang thang giá trị §4d;
// ramp cam chỉ dành cho trường đang tô, ràng buộc 2). Biến trạm thành TRƯỜNG thì không
// luật nào bị phá.

const STATION_SPECS: Spec[] = [
  {
    id: "ports",
    group: "cung",
    label: "Số cổng đã lắp tại trạm",
    desc: "Số cổng sạc công cộng đã lắp tại từng trạm. Màu mã hoá quy mô tài sản; bán kính chấm cố định để không thêm encoding thứ hai.",
    unit: { kind: "port", note: "đã lắp tại trạm" },
    kind: "numeric",
    scaleContract: SUPPLY_FIXED,
  },
  {
    id: "occ",
    group: "sosanh",
    label: "Nhịp trạm tại giờ đang xem",
    desc: "Tỉ lệ cổng đang bận của từng trạm tại một ô giờ của tuần (7 thứ × 24 giờ). Kéo scrubber ở đáy để đổi giờ. Trạm chưa quan sát đủ ở giờ đó vẽ CHẤM RỖNG, không tô bậc nhạt — “chưa biết” không được đọc thành “vắng khách”.",
    unit: { kind: "ratio", note: `cổng bận ÷ cổng lắp đặt tại giờ đang xem · dưới ${OBSERVED_H_MIN} h quan sát thì không tô` },
    kind: "numeric",
    scaleContract: TOGGLE_LINEAR_ZERO_NONE,
    // Thang chia bậc trên MỌI ô giờ đọc được của mọi trạm IN, không trên danh sách trạm —
    // xem `allOccValues`. Hai tập khác nhau nên legend phải gọi đúng tên tập của mình.
    classingNoun: "trạm-giờ",
    // Không phải một cột — §13c-1. Công thức KHÔNG chạy trong SQL như các trường phái sinh
    // khác: nó phụ thuộc `t`, thứ đổi 4 lần mỗi giây khi play. Một truy vấn DuckDB mỗi
    // khung hình là sai kiến trúc, nên hồ sơ 168h nạp một lần vào `Float32Array` và công
    // thức sống ở `viz/occ.ts` (`stationOccAt`) — vẫn MỘT chỗ, vẫn truy được về cột thật.
    deps: [dataPath("stations.parquet"), dataPath("station_occupancy_profile_168h.parquet")],
    coverageNote:
      "Ba đường vào cùng một chấm rỗng, và cả ba là “không biết” nên chúng đúng là MỘT ký hiệu: 236/939 trạm không có hồ sơ 168h nào · ô giờ có dưới 1 h quan sát · 26/939 trạm khuyết n_ports (không có mẫu số thì không có tỉ số). Mẫu số là số cổng LẮP ĐẶT (tầng tài sản), không phải số cổng đang báo cáo — nên trạm báo cáo thiếu hiện THẤP, và đó là sự thật về báo cáo chứ không phải về khách.",
  },
  {
    id: "power_kw",
    column: "power_kw_site",
    group: "cung",
    label: "Công suất trạm",
    desc: "Tổng công suất các cổng sạc đã lắp tại trạm.",
    unit: { kind: "kw", note: "lắp đặt tại trạm" },
    kind: "numeric",
    map: false,
  },
  {
    id: "op_status",
    column: "op_status",
    group: "cung",
    label: "Trạng thái vận hành",
    desc: "Trạng thái vận hành của trạm theo dữ liệu nguồn.",
    unit: null,
    kind: "categorical",
    map: false,
  },
];

// ── Ghép bốn họ ────────────────────────────────────────────────────────────────

/** Tiền tố của một đơn vị đọc trong khoá `f` — §6b. Ô là tên trần, nên nó không có tiền tố. */
const PREFIX: Record<ReadingUnit, string> = {
  cell: "",
  commune: COMMUNE_PREFIX,
  road: ROAD_PREFIX,
  station: STATION_PREFIX,
};

/**
 * Lens là nghĩa của measure, nên khai TƯỜNG MINH ở registry này thay vì suy từ `group`,
 * `readAs` hay vị trí trong mảng. Prefix làm các trường trùng tên ở ô/xã không thể vô tình
 * dùng chung quyết định. Danh sách được kiểm đủ ở `declaredLens` lúc module khởi tạo.
 */
const DEMAND_FIELDS = [
    "cell:population", "cell:pop_density_ppkm2", "cell:n_apartment", "cell:apartment_levels_sum",
    "cell:poi_anchor_index", "commune:population", "commune:pop_density_ppkm2",
] as const;
const SUPPLY_FIELDS = [
    "cell:n_stations", "cell:n_stations_operational", "cell:n_ports", "cell:power_kw_site",
    "commune:n_stations", "commune:n_ports", "commune:power_kw_site", "commune:ports_per_10k_pop", "station:ports",
    "station:power_kw", "station:op_status",
] as const;
const ACCESS_FIELDS = [
    "cell:road_len_m", "cell:road_len_in_province_m", "cell:road_len_arterial_m", "cell:road_len_motorway_m",
    "cell:road_len_trunk_m", "cell:road_len_primary_m", "cell:road_len_secondary_m", "cell:road_len_tertiary_m",
    "cell:road_len_local_m", "cell:road_len_service_m", "cell:dist_station_network_m", "cell:dist_station_euclid_m",
    "cell:detour_ratio", "cell:dist_station_asym_m", "cell:road_access_offset_m", "cell:network_reachable",
    "cell:evidence_grade_distance", "commune:dist_station_m_pop_weighted", "road:dist_station_m",
] as const;
const UTILIZATION_FIELDS = ["cell:util_cell", "cell:n_stations_measured", "cell:util_pctl_cell", "commune:util_mean_port_weighted", "station:occ"] as const;
const OPPORTUNITY_FIELDS = ["cell:screen_decision", "cell:screen_margin_m", "cell:pop_beyond_2km", "cell:demand_supply_gap"] as const;

const DEFAULT_COMMUNE_EVIDENCE = ["commune:population", "commune:pop_density_ppkm2", "commune:ports_per_10k_pop"] as const;

/** Một registry duy nhất sở hữu danh tính, membership, default và evidence của lens. */
export const LENSES: readonly LensMeta[] = [
  {
    id: "demand",
    label: "CẦU",
    hint: "ai cần sạc",
    businessQuestion: "Nhu cầu sạc tập trung ở đâu và mật độ dân cư khu vực nào cao nhất?",
    defaultField: "population",
    primaryChart: "demand-population-histogram",
    fieldKeys: DEMAND_FIELDS,
    defaultOverlays: ["stations"],
    cellEvidence: ["population", "pop_density_ppkm2", "n_apartment"],
    communeEvidence: DEFAULT_COMMUNE_EVIDENCE,
    stationEvidence: ["station:ports", "station:power_kw", "station:op_status"],
  },
  {
    id: "supply",
    label: "CUNG",
    hint: "đã có gì",
    businessQuestion: "Hạ tầng trạm sạc hiện hữu phân bổ ra sao và cơ cấu công suất thế nào?",
    defaultField: "station:ports",
    primaryChart: "supply-power-tier-breakdown",
    fieldKeys: SUPPLY_FIELDS,
    defaultOverlays: ["stations", "station_status"],
    cellEvidence: ["n_stations", "n_ports", "power_kw_site"],
    communeEvidence: ["commune:n_stations", "commune:n_ports", "commune:ports_per_10k_pop"],
    stationEvidence: ["station:ports", "station:power_kw", "station:op_status"],
  },
  {
    id: "access",
    label: "TIẾP CẬN",
    hint: "đi xa ở đâu",
    businessQuestion: "Khu vực nào người dân phải di chuyển quá xa trên mạng đường thật để sạc xe?",
    defaultField: "road:dist_station_m",
    primaryChart: "access-population-curve",
    fieldKeys: ACCESS_FIELDS,
    defaultOverlays: ["stations", "beyond2km"],
    cellEvidence: ["dist_station_network_m", "population", "detour_ratio"],
    communeEvidence: ["commune:population", "commune:dist_station_m_pop_weighted", "commune:ports_per_10k_pop"],
    stationEvidence: ["station:ports", "station:power_kw", "station:op_status"],
  },
  {
    id: "utilization",
    label: "SỬ DỤNG",
    hint: "bận lúc nào",
    businessQuestion: "Trạm sạc nào đang bị quá tải hoặc thiếu tải trong từng khung giờ tuần?",
    defaultField: "station:occ",
    primaryChart: "utilization-week-heatmap",
    fieldKeys: UTILIZATION_FIELDS,
    defaultOverlays: ["stations", "station_status"],
    cellEvidence: ["util_cell", "n_stations_measured", "util_pctl_cell"],
    communeEvidence: DEFAULT_COMMUNE_EVIDENCE,
    stationEvidence: ["station:occ", "station:ports", "station:op_status"],
  },
  {
    id: "opportunity",
    label: "CƠ HỘI",
    hint: "khoảng trống ưu tiên",
    businessQuestion: "Nơi nào có khoảng trống phục vụ hoặc vượt ngưỡng sàng lọc để xem xét đầu tư?",
    defaultField: "screen_margin_m",
    primaryChart: "opportunity-commune-rank",
    fieldKeys: OPPORTUNITY_FIELDS,
    defaultOverlays: ["stations", "beyond2km"],
    cellEvidence: ["screen_margin_m", "pop_beyond_2km", "population"],
    communeEvidence: ["commune:ports_per_10k_pop", "commune:n_ports", "commune:population"],
    stationEvidence: ["station:ports", "station:power_kw", "station:op_status"],
  },
] as const;

/** Compatibility export for callers that validate full registry coverage. */
export const LENS_DECLARATIONS: Record<LensId, readonly string[]> = Object.fromEntries(
  LENSES.map((lens) => [lens.id, lens.fieldKeys]),
) as Record<LensId, readonly string[]>;

const DECLARED_LENS = new Map<string, LensId>(
  Object.entries(LENS_DECLARATIONS).flatMap(([lens, ids]) => ids.map((id) => [id, lens as LensId] as const)),
);

function declaredLens(id: string, readAs: ReadingUnit): LensId | null {
  const key = `${readAs}:${id}`;
  return DECLARED_LENS.get(key) ?? null;
}

const withUnit = (specs: Spec[], readAs: ReadingUnit): FieldMeta[] =>
  specs.map((s) => {
    const lens = declaredLens(s.id, readAs);
    const shared = { readAs, column: s.column ?? s.id, id: PREFIX[readAs] + s.id, lens };
    // Context/evidence không được lách thành analytical ramp thứ sáu. Hai nhánh return để
    // union phân biệt map/scaleContract sống sót qua spread — gộp một object literal là
    // TypeScript mất dấu "map-enabled thì đã có hợp đồng".
    if (s.map === false || lens === null) return { ...s, ...shared, map: false as const };
    return { ...s, ...shared };
  });

export const FIELDS: FieldMeta[] = [
  ...withUnit(CELL_SPECS, "cell"),
  ...withUnit(COMMUNE_SPECS, "commune"),
  ...withUnit(ROAD_SPECS, "road"),
  ...withUnit(STATION_SPECS, "station"),
];

export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

/** Map fields must never reach a scale builder without an explicit registry declaration. */
export function scaleContractOf(field: FieldMeta): ScaleContract {
  if (!field.scaleContract) {
    throw new Error(`Map field ${field.id} is missing scaleContract`);
  }
  return field.scaleContract;
}

export interface ScaleControlModel {
  gradientDisabled: boolean;
  reason: string | null;
}

export function scaleControlFor(
  field: FieldMeta,
  paletteGate: { allowed: boolean; reason?: string } = { allowed: true },
): ScaleControlModel {
  const contract = scaleContractOf(field);
  if (contract.color === "fixed-binned") {
    return { gradientDisabled: true, reason: contract.reason };
  }
  return paletteGate.allowed
    ? { gradientDisabled: false, reason: null }
    : { gradientDisabled: true, reason: paletteGate.reason ?? "Bảng màu chưa qua cổng gradient." };
}

/**
 * Cột của LƯỚI mà danh mục này mô tả — đầu vào của cổng ETL→viz (`columns.test.ts`).
 *
 * Chỉ lấy trường của ô: trường của xã/đường/trạm đọc từ bảng khác nên chúng không nói gì
 * về `grid_h3_r8.parquet`. Trường DẪN XUẤT (`expr` thay cho một cột thật) cũng bị loại —
 * `pop_beyond_2km` và `util_pctl_cell` là công thức, không phải cột.
 */
export const CELL_SPECS_COLUMNS: string[] = withUnit(CELL_SPECS, "cell")
  .filter((f) => !f.expr)
  .map((f) => f.column);

/**
 * Cột THẬT SỰ có trong lưới của bộ dữ liệu đang mở — đặt một lần từ `manifest`.
 *
 * `null` = **không lọc gì**, và đó là mặc định có chủ ý: bộ Hà Nội gốc có đủ 45 trường và
 * không có manifest nào cần khai báo điều đó. Chỉ store toàn quốc mới thiếu lớp TÍNH TOÁN,
 * và chỉ khi ấy danh sách này mới khác `null`.
 *
 * Vì sao phải lọc chứ không để `SELECT` tự hỏng: DuckDB ném lỗi ở cột không tồn tại, và lỗi
 * đó nổ ở tầng truy vấn — người dùng thấy màn hình trắng chứ không thấy "trường này chưa
 * tính". Đây là cùng một luật với §7a: thiếu phải NHÌN THẤY được, không được thành sự cố.
 */
/**
 * Cột THẬT SỰ có, theo TỪNG đơn vị đọc. `undefined` = **không lọc gì**.
 *
 * Bốn đơn vị, bốn nguồn dữ liệu khác nhau, nên bốn danh sách — cột của lưới không nói gì
 * về cột của đường. Trước đây chỉ hai đơn vị đầu được khai, và nhánh mặc định là
 * `f.readAs !== "cell" → true`. Đó là một lỗi ĐANG SỐNG, không phải một khoảng trống lý
 * thuyết: trường `road:dist_station_m` luôn hiện trong rail, kể cả ở 34 tỉnh mà
 * `roads.parquet` KHÔNG có cột đó — chọn nó là `SELECT "dist_station_m"` trên bảng không
 * có cột ấy, DuckDB ném Binder Error, màn hình trắng.
 *
 * `undefined` là mặc định có chủ ý: bộ Hà Nội gốc không phát manifest nào khai điều này, và
 * "chưa biết thiếu gì" KHÔNG được biến thành "biết là thiếu".
 */
const AVAILABLE: Partial<Record<ReadingUnit, Set<string>>> = {};

/** Danh sách cột theo đơn vị đọc, lấy từ `manifest`. Khoá vắng = không lọc đơn vị đó. */
export type AvailableByUnit = Partial<Record<ReadingUnit, string[] | undefined>>;

export function setAvailableColumns(by: AvailableByUnit): void {
  for (const u of ["cell", "commune", "road", "station"] as const) {
    const v = by[u];
    // Mảng RỖNG đọc như "không biết", không phải "không có cột nào" — một manifest thiếu
    // khoá không được biến thành màn hình trống hoàn toàn.
    if (v && v.length) AVAILABLE[u] = new Set(v);
    else delete AVAILABLE[u];
  }
}

/**
 * LỚP không đọc được ở bộ dữ liệu đang mở — khác "cột không tồn tại".
 *
 * Cột vắng thì `SELECT` nổ; lớp không đọc được thì cột CÓ, truy vấn chạy, và trả về gần như
 * toàn null. Đó là dạng hỏng nguy hiểm hơn: một bản đồ mức sử dụng gần trống trông giống
 * "mức sử dụng thấp" chứ không giống "không đo được", và không có gì trên màn hình sửa lại
 * cách đọc đó.
 *
 * Đo được ở 4 tỉnh: Điện Biên **0,0%** số trạm có `util` đọc được, Sơn La 4,7%, Cao Bằng
 * 10,0%, Lai Châu 16,7%. Ngưỡng 50% ở `vn/n05_quality.py`; quyết định giữ tỉnh và TẮT lớp
 * (thay vì loại tỉnh) là của chủ dự án — lớp cung/POI/đường của 4 tỉnh đó vẫn đúng.
 */
let UNUSABLE_LAYERS: Set<string> = new Set();

/** Lớp → trường thuộc lớp đó. Ánh xạ này là chuyện của GIAO DIỆN, nên nó sống ở đây chứ
 *  không ở tầng xuất dữ liệu: `n06_web_export` chỉ nói tên LỚP, không biết id trường nào. */
const LAYER_FIELDS: Record<string, string[]> = {
  occupancy: [
    STATION_OCC_FIELD,
    "util_cell",
    "util_pctl_cell",
    `${COMMUNE_PREFIX}util_mean_port_weighted`,
  ],
};

export function setUnusableLayers(layers: string[] | undefined): void {
  UNUSABLE_LAYERS = new Set(layers ?? []);
}

/** Lớp này có đọc được ở bộ dữ liệu đang mở không — dùng để tắt cả scrubber, không chỉ trường. */
export function layerUsable(layer: string): boolean {
  return !UNUSABLE_LAYERS.has(layer);
}

function inUnusableLayer(id: string): boolean {
  for (const l of UNUSABLE_LAYERS) if (LAYER_FIELDS[l]?.includes(id)) return true;
  return false;
}

/** Trường này dựng được trên dữ liệu đang mở chưa? */
export function fieldAvailable(f: FieldMeta): boolean {
  if (inUnusableLayer(f.id)) return false;
  const co = AVAILABLE[f.readAs];
  if (!co) return true;
  // Một số field là đại lượng tính ở client nên `column` là tên hiển thị, không phải cột
  // raw trong parquet. `station:ports` đọc `n_ports`; `station:occ` đọc profile occupancy
  // và được chặn riêng bởi `inUnusableLayer`. Nếu kiểm tra mù `co.has(f.column)`, hai nút
  // này luôn bị tắt dù bộ Hà Nội có đủ dữ liệu.
  if (f.id === STATION_PORTS_FIELD) return co.has("n_ports");
  if (f.id === STATION_OCC_FIELD) return true;
  // Trường phái sinh (`expr`) có thể chạm nhiều cột; nó chỉ dựng được khi CÓ ĐỦ. Không có
  // cách nào biết chắc từ đây, nên luật là: cột trần phải có mặt, biểu thức thì bỏ qua nếu
  // cột cùng tên không có. Thà giấu một trường dựng được còn hơn hiện một trường sẽ nổ.
  return co.has(f.column);
}

/** Field đủ dữ liệu VÀ có visual contract để làm analytical map. */
export function fieldMapAvailable(f: FieldMeta): boolean {
  return f.map !== false && fieldAvailable(f);
}

/**
 * Trường này có bộ đọc DEMAND·P1 (hex · density · intensity · bivariate · hybrid) không.
 *
 * Một hàm chứ không phải một điều kiện chép ba lần. `MapView`, `Legend` và `FloatingLegend`
 * đều phải trả lời cùng câu hỏi này; hồi nó là ba biểu thức `field.id === "population" &&
 * field.readAs === "cell"` viết tay thì không có gì bắt chúng đồng ý, và bất đồng ở đây cho
 * ra đúng loại lỗi tệ nhất — một chú giải mô tả một mặt tô không có trên bản đồ.
 *
 * `population` của Ô là trường DUY NHẤT khai `surface: true`, và ba trong năm cách đọc
 * (density, hybrid, contour) đứng được là nhờ đúng khai báo đó — xem `FieldMeta.surface`.
 * Điều kiện `readAs === "cell"` là cần: `commune:population` cùng tên nhưng cộng lên đơn vị
 * khác, gộp nó thành mặt liên tục là gộp một con số đã gộp rồi.
 *
 * Điều kiện "đang ở CÂU CHUYỆN hay không" **không** thuộc về đây — mỗi nơi gọi tự AND thêm.
 */
export function hasDemandRepresentations(f: FieldMeta): boolean {
  return f.id === "population" && f.readAs === "cell" && Boolean(f.surface);
}

/**
 * Câu hỏi SO SÁNH mà measure đang tô trả lời được — DESIGN.md §3d.
 *
 * Danh sách này từng nằm ở HAI chỗ phải đồng ý với nhau mà không có gì bắt chúng đồng ý:
 * ba nút "mở compare" trong tab CÂU HỎI, và một effect trong `App` **đóng** compare khi
 * trường đổi sang thứ không khớp. Kết quả là một tấm tự đóng ngay sau khi mở, không có lời
 * giải thích nào trên màn hình. Nay chỉ còn một hàm; bảng SO SÁNH đọc nó để dựng bộ chuyển,
 * và trường không có câu nào thì **nói ra** thay vì biến mất.
 *
 * Thứ tự trả về là thứ tự ưu tiên: phần tử đầu là câu chốt lại khi câu đang mở hết nghĩa.
 */
export function compareViewsFor(f: FieldMeta): CompareView[] {
  const out: CompareView[] = [];
  if (f.kind === "numeric") out.push("distribution");
  // Xếp hạng có tên chỉ dựng được ở đơn vị đọc XÃ: nó đọc thẳng `commune.geojson` đã nạp,
  // và một cái tên là thứ chỉ xã mới có (ô H3 có mã, đoạn đường có id OSM — không ai gọi
  // tên chúng trong một cuộc họp).
  if (f.readAs === "commune" && f.kind === "numeric") out.push("rank-communes");
  // Hai trục của scatter là `population` × `dist_station_network_m` của ô H3 — một cặp cố
  // định, không phải "trường đang tô × một trường khác". Nên nó chỉ có nghĩa ở đúng `population`.
  if (f.id === "population") out.push("demand-access");
  // Gắn với LENS, không với từng id: cả sáu measure của lens Tiếp cận đều hỏi cùng một câu
  // ("đi xa ở đâu"), và đường tích luỹ theo dân là câu trả lời chung của chúng. Điều kiện dữ
  // liệu là cột khoảng cách của LƯỚI — đường này luôn đọc ô H3, kể cả khi đang tô trường xã.
  if (f.lens === "access" && gridColumnAvailable("dist_station_network_m")) out.push("access-curve");
  if (f.lens === "supply" && gridColumnAvailable("n_ports"))
    out.push("supply-equity");
  if (f.id === STATION_OCC_FIELD && layerUsable("occupancy")) out.push("utilization-pattern");
  return out;
}

/** Trường của một đơn vị đọc, giữ nguyên thứ tự khai báo, ĐÃ lọc theo cột có mặt. */
export function fieldsOfUnit(unit: ReadingUnit): FieldMeta[] {
  return FIELDS.filter((f) => f.readAs === unit && fieldAvailable(f));
}

/** Danh sách field được phép chọn trong rail bản đồ của một đơn vị đọc. */
export function mapFieldsOfUnit(unit: ReadingUnit): FieldMeta[] {
  return FIELDS.filter((f) => f.readAs === unit && fieldMapAvailable(f));
}

/** Field map-hoá của một lens, bất kể nó dùng H3, xã, line hay point. */
export function mapFieldsOfLens(lens: LensId): FieldMeta[] {
  return FIELDS.filter((f) => f.lens === lens && fieldMapAvailable(f));
}

/** Default lens khai báo; fallback chỉ dùng khi dataset thiếu default. */
export function defaultFieldOfLens(lens: LensId): FieldMeta | undefined {
  const id = lensMeta(lens)?.defaultField;
  const preferred = id ? FIELD_BY_ID.get(id) : undefined;
  return preferred && fieldMapAvailable(preferred) ? preferred : mapFieldsOfLens(lens)[0];
}

/** Lens là hệ quả của field; không có state/hash lens thứ hai để lệch khỏi `f`. */
export function lensOfField(id: string): LensId | null {
  return FIELD_BY_ID.get(id)?.lens ?? null;
}

/** Kiểm tra một giá trị có phải là LensId hợp lệ hay không. */
export function isLensId(id: unknown): id is LensId {
  return typeof id === "string" && (LENS_IDS as readonly string[]).includes(id);
}

/** Lấy metadata đầy đủ của một Lens. */
export function lensMeta(lens: LensId): LensMeta | undefined {
  return LENSES.find((l) => l.id === lens);
}

/** Danh sách ID thuộc tính/trường bằng chứng chính cho ô H3 theo Lens. */
export function evidenceIdsForLens(lens: LensId | string | null | undefined): string[] {
  return [...(isLensId(lens) ? lensMeta(lens)!.cellEvidence : lensMeta("demand")!.cellEvidence)];
}

/** Danh sách ID thuộc tính/trường bằng chứng chính cho Xã/phường theo Lens. */
export function communeEvidenceForLens(lens: LensId | string | null | undefined): string[] {
  return [...(isLensId(lens) ? lensMeta(lens)!.communeEvidence : lensMeta("demand")!.communeEvidence)];
}

/** Danh sách ID thuộc tính/trường bằng chứng chính cho Trạm sạc theo Lens. */
export function stationEvidenceForLens(lens: LensId | string | null | undefined): string[] {
  return [...(isLensId(lens) ? lensMeta(lens)!.stationEvidence : lensMeta("supply")!.stationEvidence)];
}

/** Danh sách overlay IDs mặc định được kích hoạt khi chuyển sang một Lens. */
export function defaultOverlaysOfLens(lens: LensId | string | null | undefined): OverlayId[] {
  return [...(isLensId(lens) ? lensMeta(lens)!.defaultOverlays : lensMeta("demand")!.defaultOverlays)];
}


/**
 * Một CỘT của lưới có mặt không — dùng ở tầng SQL, khác `fieldAvailable` ở tầng TRƯỜNG.
 *
 * `fetchField` kèm mấy cột cố định (`population`, `dist_station_network_m`,
 * `network_reachable`) bất kể trường nào đang tô, nên nó phải hỏi theo TÊN CỘT chứ không
 * theo trường. Hai câu hỏi khác nhau, hai hàm khác nhau.
 */
export function gridColumnAvailable(column: string): boolean {
  return !AVAILABLE.cell || AVAILABLE.cell.has(column);
}

/** Một CỘT của một đơn vị đọc bất kỳ có mặt không — dùng ở tầng SQL của đường và trạm. */
export function columnAvailable(unit: ReadingUnit, column: string): boolean {
  const co = AVAILABLE[unit];
  return !co || co.has(column);
}

/** Trường bị ẩn vì lớp sinh ra nó chưa chạy — rail in danh sách này để "vắng" nhìn thấy được. */
export function unavailableFields(): FieldMeta[] {
  return Object.keys(AVAILABLE).length === 0 ? [] : FIELDS.filter((f) => !fieldAvailable(f));
}

/**
 * Màn hình đầu tiên — DESIGN §13b-1 và M2.1-(C).
 *
 * Hai điều kiện, và `commune:population` chỉ thoả điều kiện đầu:
 *   1. **không phải thảm hex** (§13b) — đơn vị XÃ, 126 mảng rộng hàng trăm px ở zoom 9,3;
 *   2. **không phải một MỨC** (§13a-4) — "người ở giữa" là thứ mentor đã biết trước khi
 *      mở app. Thứ đáng vẽ là ĐỘ LỆCH khỏi kỳ vọng.
 *
 * `ports_per_10k_pop` thoả cả hai: nó gộp cung và cầu vào một con số ở
 * hình học xã luôn có trong mọi dataset. Thang vẫn giữ nhạt = ít, đậm = nhiều.
 */
export const DEFAULT_FIELD = `${COMMUNE_PREFIX}ports_per_10k_pop`;

/**
 * Trường mà một phiên MỚI mở ra — khác `DEFAULT_FIELD`, và hai cái tên là hai việc.
 *
 * `DEFAULT_FIELD` là **lưới an toàn**: nó là thứ app rơi về khi trường được yêu cầu không
 * dựng được trên bộ dữ liệu đang mở, nên nó phải tồn tại ở **mọi** tỉnh — và nó tồn tại,
 * vì nó đọc từ `commune.geojson` mà bộ nào cũng ship. Đừng đổi nó thành một cột của lưới.
 *
 * `FIRST_FIELD` là **màn hình đầu tiên**. Từ đợt 17/8/2026 bố cục A′ được dựng quanh đúng
 * một measure (§3h): cột đọc có tiết CÁCH ĐỌC, và tiết ấy chỉ tồn tại cho `population`
 * (`hasDemandRepresentations`). Mở app ra ở một trường khác thì cột đọc hiện ra **thiếu
 * một tiết** và không có gì trên màn hình nói làm sao tới được nó — danh sách measure đã
 * bị xoá cùng workspace.
 *
 * Không dựng được (tỉnh chưa có cột `population`) thì `App` kéo về `DEFAULT_FIELD` bằng
 * đúng con đường đã có cho mọi trường vắng mặt. Nên hằng này là một **ưu tiên**, không
 * phải một lời hứa.
 */
export const FIRST_FIELD = "population";

/**
 * Câu đơn vị bên phải dải legend — DESIGN.md §3b.
 *
 * `scaled` là thang đã chọn cho ramp đang hiện (xem `scaleUnit`). Truyền vào thì câu nói
 * đúng thang mà các ngưỡng đang in — "khoảng cách tới trạm · km, theo mạng đường" khi dải
 * chạy tới hàng km. Không truyền thì rơi về thang gốc, dùng cho chỗ nhắc tên trường ngoài
 * ngữ cảnh một ramp cụ thể.
 *
 * Đây là chỗ `isRatioField()` từng đứng. Hàm đó dò chuỗi `"0–1"` để ĐOÁN xem một trường có
 * phải tỉ lệ không; phép đoán trượt `util_pctl_cell`, nhưng trường ấy khai `map: false`
 * nên chưa lần nào tô được — lỗi tiềm ẩn, không phải lỗi đang chạy. Cái đang chạy là
 * chuyện khác và nặng hơn: `formatBreak` rút gọn theo từng số một, nên một dải trộn hai
 * đơn vị (`600` cạnh `1 ng`). Xem `units.ts`.
 */
export function unitSentence(f: FieldMeta, scaled?: ScaledUnit): string {
  const label = f.label.charAt(0).toLowerCase() + f.label.slice(1);
  const phrase = unitPhrase(f.unit, scaled ?? scaleUnit(f.unit, 0));
  return phrase ? `${label} · ${phrase}` : label;
}

/**
 * Chỉ dấu cực tính cho legend — M2.1-(B).
 *
 * Cực tính chỉ giải thích hướng đọc; nó không đảo thang màu tuần tự.
 *
 * Trường PHÂN KỲ trả về câu HAI VẾ thay cho câu một vế: ở đó không có "đầu nào cần can
 * thiệp" mà có hai bên của một mốc, và cùng một ô chú giải phải nói ra cả hai.
 */
export function polarityNote(f: FieldMeta): string | null {
  if (f.diverge) {
    const at = formatIn(f.diverge.at, scaleUnit(f.unit, f.diverge.at));
    return `${f.diverge.ends[0]} ◂ ${at} ▸ ${f.diverge.ends[1]}`;
  }
  if (f.polarity === "high-bad") return "đậm = giá trị cao hơn · thường bất lợi hơn";
  if (f.polarity === "high-good") return "đậm = giá trị cao hơn · thường thuận lợi hơn";
  return null;
}

// ── Badge ⚠ ────────────────────────────────────────────────────────────────────

export interface Badge {
  /** `cell` = phủ ô · `source` = khuyết ở nguồn. Hai nghĩa khác nhau (§7). */
  kind: "cell" | "source";
  text: string;
  explain: string;
}

/**
 * Phủ đo **lúc chạy**, cho trường mà `manifest.coverage` không có: trường phái sinh
 * (không phải cột) và trường của xã (bảng khác) — DESIGN §13c-1.
 *
 * Đây KHÔNG phải lách §7c. §7c cấm *gõ tay* con số vào TS; số đo lúc chạy bám dữ liệu còn
 * sát hơn số đo lúc export. Cái §7c bảo vệ là "dữ liệu đổi thì badge đổi theo", và đo lúc
 * chạy thoả điều đó một cách chặt hơn.
 */
export interface RuntimeCoverage {
  n_present: number;
  n_total: number;
  share: number;
  /**
   * Phần DÂN nằm trong các đơn vị có giá trị.
   *
   * `undefined` khi đơn vị đọc không mang dân số — một **đoạn đường** không có dân, nên
   * "x% dân" ở đó không phải một con số sai mà là một câu không có nghĩa. Ghi 0 sẽ in ra
   * "0% dân" và đọc thành "những đoạn này không phục vụ ai".
   */
  pop_share: number | undefined;
  /** số ô null vì CÂU HỎI KHÔNG ÁP DỤNG — nhóm DUY NHẤT bị trừ khỏi mẫu số (§0.2). */
  n_not_applicable?: number;
  /** số ô null vì LUẬT CỦA TA gỡ giá trị đi. Ở LẠI mẫu số, nhưng không đeo ⚠ và có vân riêng. */
  n_filtered?: number;
}

/** Danh từ đơn vị đọc, dùng trong câu badge. Xã không phải "ô", và đoạn đường cũng vậy. */
export function unitNoun(u: ReadingUnit): string {
  if (u === "commune") return "xã";
  if (u === "road") return "đoạn";
  if (u === "station") return "trạm";
  return "ô";
}

/**
 * Ô trống của cột này CÓ nghĩa là "không biết" không? Đọc từ `manifest.null_states`.
 *
 * Đây là thứ thay cho `nullMeans` (Phase 8 §1.2, AC-3). `nullMeans` là một câu tiếng Việt gõ
 * tay tắt badge ⚠ cho cả trường; nó đúng về tinh thần và sai về cơ chế, vì không gì kiểm được
 * nó. Bây giờ câu trả lời đến từ số đếm mà exporter phát ra: cột nào không có ô trống nào
 * mang trạng thái MISSING hay NOT_MEASURED thì mọi ô trống của nó là "biết là không", và
 * §7a cấm ⚠ ở đó.
 *
 * Trả `undefined` khi manifest không nói gì — chỗ gọi giữ nguyên hành vi cũ thay vì đoán.
 */
export function nullStateWarns(m: Manifest, table: string, column: string): boolean | undefined {
  const d = m.null_states?.[table]?.[column];
  if (!d) return undefined;
  return Object.values(d.states).some(
    (b) => b.state === "MISSING" || b.state === "NOT_MEASURED",
  );
}

/**
 * Badge ⚠ của một trường. Con số lấy từ manifest **hoặc từ số đo lúc chạy**, câu chữ lấy
 * từ `FieldMeta` — §7c.
 *
 * Badge phủ là một QUY TẮC chạy trên số đo (`share < 1`), không phải danh sách gõ tay. Nó bị
 * chặn khi `null_states` cho thấy mọi ô trống của cột là "biết là không" — §7a: ⚠ chỉ dành
 * cho "không biết". Trước Phase 8 phép chặn ấy đọc một chuỗi `nullMeans` gõ tay cạnh trường;
 * bây giờ nó đọc số đếm đã ship, nên nó kiểm được và nó không thể lệch khỏi dữ liệu.
 */
export function badgesFor(
  f: FieldMeta,
  m: Manifest,
  runtime?: Map<string, RuntimeCoverage>,
): Badge[] {
  const out: Badge[] = [];

  // Cột thô của bảng ô có sẵn số trong manifest; mọi thứ khác đo lúc chạy.
  // Trường có `nullSplit` phải dùng số đo LÚC CHẠY dù nó là cột thô: `manifest.coverage`
  // chỉ biết tổng số null, không biết bao nhiêu trong đó là "câu hỏi không áp dụng".
  const useRuntime = Boolean(f.expr) || Boolean(f.nullSplit);
  const fromManifest = f.readAs === "cell" && !useRuntime ? m.coverage[f.column] : undefined;
  const cov: RuntimeCoverage | undefined = fromManifest
    ? {
        n_present: fromManifest.n_present,
        n_total: m.n_cells,
        share: fromManifest.cell_share,
        pop_share: fromManifest.pop_share,
      }
    : runtime?.get(f.id);

  // §7a qua `null_states`: cột mà mọi ô trống đều KHÔNG ÁP DỤNG hoặc ĐÃ LỌC thì không đeo ⚠.
  // Ở đơn vị đọc TRẠM đó là `n_ports`/`power_kw_site` (nguồn không khai ⇒ vẫn là "không
  // biết", vẫn ⚠) và `n_guns_imputed` (không cần gán ⇒ KHÔNG ⚠, và nó 97,2 % trống).
  const nullTable = f.readAs === "cell" ? "grid" : f.readAs === "station" ? "stations" : null;
  const warns = nullTable ? nullStateWarns(m, nullTable, f.column) : undefined;

  if (cov && cov.share < 1 && warns !== false) {
    const note = typeof f.coverageNote === "function" ? f.coverageNote(m) : f.coverageNote;
    const noun = unitNoun(f.readAs);
    // Vế "% dân" chỉ có mặt khi đơn vị đọc CÓ dân. Đoạn đường thì không — xem `pop_share`.
    const popPart = cov.pop_share === undefined ? "" : ` · ${pct(cov.pop_share)} dân`;
    out.push({
      kind: "cell",
      text: `${pct(cov.share)} ${noun}${popPart}`,
      explain:
        `${cov.n_present.toLocaleString("vi-VN")}/${cov.n_total.toLocaleString("vi-VN")} ${noun} ` +
        (cov.pop_share === undefined
          ? "có giá trị."
          : `có giá trị, và chúng chứa ${pct(cov.pop_share)} dân số Hà Nội.`) +
        // Mẫu số đã trừ nhóm "không áp dụng" — phải NÓI RA, nếu không con số trông như
        // mâu thuẫn với tổng số ô hiện ở khối NGUỒN.
        (cov.n_not_applicable
          ? ` Mẫu số đã trừ ${cov.n_not_applicable.toLocaleString("vi-VN")} ${noun} mà câu hỏi không áp dụng.`
          : "") +
        (note ? ` ${note}` : ""),
    });
  }
  const src = f.sourceBadge?.(m);
  if (src) out.push({ kind: "source", ...src });
  return out;
}

// ── Hằng số của dữ liệu → câu người đọc được ───────────────────────────────────

/**
 * `short` dùng ở legend và panel Ô (chỗ hẹp). `note` là câu dịch đầy đủ cho khối NGUỒN
 * — DESIGN.md §8 liệt kê đúng ba hằng cần dịch, cộng hai hằng `THIEU_*` chốt ở M1.
 * `withCount` = §8 muốn kèm số ô mang giá trị đó.
 */
export const CONSTANTS: Record<string, { short: string; note?: string; withCount?: boolean }> = {
  // pop_source
  WORLDPOP2025_ANCHORED_VNSDI: { short: "neo theo VNSDI" },
  WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE: {
    short: "không neo được",
    note: "WorldPop không neo — số công bố của xã này không hợp lý",
    withCount: true,
  },
  ZERO_NO_WEIGHT: {
    short: "không dân",
    note: "không dân — bề mặt WorldPop bằng 0",
    withCount: true,
  },
  // evidence_grade_distance
  OSM_NETWORK: { short: "đo trên mạng đường OSM" },
  UNREACHABLE_NO_PATH: {
    short: "không có đường đi",
    note: "không tới được bằng đường bộ trong bán kính neo 2 km",
  },
  UNREACHABLE_NO_ROAD_ACCESS: {
    short: "không vào được mạng đường",
    note: "không tới được bằng đường bộ trong bán kính neo 2 km",
  },
  // cell_state
  INSIDE: { short: "trọn trong ranh giới" },
  BORDER: { short: "nằm trên biên" },
  // occ_status (bảng station_occupancy, gộp lên ô ở §8)
  OK: { short: "OK" },
  THIEU_COVERAGE: { short: "thiếu quan sát" },
  THIEU_PEER: { short: "thiếu lớp tham chiếu" },

  // ── M4.1/M4.2 — hằng của bảng TRẠM ────────────────────────────────────────
  //
  // Nhãn tiếng Việt của `shape_class` chốt ở §3f-5 và dùng ở HAI chỗ: dòng dịch của panel
  // TRẠM (§8a-4) và small multiples của chế độ DỮ LIỆU. Một bảng dịch, hai chỗ đọc — chép
  // ra hai chỗ là cách hai chỗ trôi khỏi nhau (cùng lý do `selectExpr` chỉ có một bản).
  DEM_TROI: { short: "đêm trội" },
  HAI_DINH: { short: "hai đỉnh" },
  BAN_NGAY_PHANG: { short: "ban ngày phẳng" },
  THAT_THUONG: { short: "thất thường" },
  KHONG_XEP_LOAI: { short: "không xếp loại" },

  // op_status — §4d-3a. `UNKNOWN` dịch thành một câu chứ không thành một nhãn trống: nguồn
  // KHÔNG nói gì là một sự thật, và nó khác hẳn "biết là hỏng".
  OPERATIONAL: { short: "đang vận hành" },
  MAINTENANCE: { short: "đang bảo trì" },
  OUT_OF_SERVICE: { short: "ngừng phục vụ" },
  UNKNOWN: { short: "nguồn không nói" },

  // access
  PUBLIC: { short: "công cộng" },
  RESTRICTED: { short: "hạn chế" },
};

export function constantShort(v: string): string {
  return CONSTANTS[v]?.short ?? v;
}
