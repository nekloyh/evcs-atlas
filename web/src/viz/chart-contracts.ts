/**
 * Phase 4 — Primary Chart Registry & Invariants (PHASE4_VISUALIZATION.md §1, §5.1).
 *
 * Exactly one primary chart per Lens.
 */

import type { LensId } from "../fields";

export const PRIMARY_CHART_IDS = [
  "demand-population-histogram",
  "supply-power-tier-breakdown",
  "access-population-curve",
  "utilization-week-heatmap",
  "opportunity-commune-rank",
] as const;

export type PrimaryChartId = (typeof PRIMARY_CHART_IDS)[number];

export const LENS_PRIMARY_CHARTS: Record<LensId, PrimaryChartId> = {
  demand: "demand-population-histogram",
  supply: "supply-power-tier-breakdown",
  access: "access-population-curve",
  utilization: "utilization-week-heatmap",
  opportunity: "opportunity-commune-rank",
} as const;

export interface PrimaryChartMeta {
  id: PrimaryChartId;
  lens: LensId;
  title: string;
  unitNoun: string;
  emitsFilter: boolean;
  emitsTime: boolean;
  emitsEntity: boolean;
}

export const PRIMARY_CHART_REGISTRY: Record<PrimaryChartId, PrimaryChartMeta> = {
  "demand-population-histogram": {
    id: "demand-population-histogram",
    lens: "demand",
    title: "Phân bố dân số ô H3",
    unitNoun: "ô",
    emitsFilter: true,
    emitsTime: false,
    emitsEntity: false,
  },
  "supply-power-tier-breakdown": {
    id: "supply-power-tier-breakdown",
    lens: "supply",
    title: "Cơ cấu công suất trạm công cộng",
    unitNoun: "trạm",
    emitsFilter: true,
    emitsTime: false,
    emitsEntity: false,
  },
  "access-population-curve": {
    id: "access-population-curve",
    lens: "access",
    title: "Đường cong tiếp cận tích luỹ theo cự ly",
    unitNoun: "người",
    emitsFilter: false,
    emitsTime: false,
    emitsEntity: false,
  },
  "utilization-week-heatmap": {
    id: "utilization-week-heatmap",
    lens: "utilization",
    title: "Nhịp tải 168 giờ trong tuần",
    unitNoun: "khung giờ",
    emitsFilter: false,
    emitsTime: true,
    emitsEntity: false,
  },
  "opportunity-commune-rank": {
    id: "opportunity-commune-rank",
    lens: "opportunity",
    title: "Xếp hạng dân số ngoài 2 km theo xã",
    unitNoun: "xã/phường",
    emitsFilter: false,
    emitsTime: false,
    emitsEntity: true,
  },
};

// ── Biểu đồ BẰNG CHỨNG — CR 4.2, khe thứ hai của cột ĐỌC ────────────────────
//
// Tập ID này RỜI HẲN `PRIMARY_CHART_IDS`, và sự rời nhau ấy là bất biến chứ không phải một
// thói quen đặt tên: `PrimaryLensChart` giữ nguyên `switch` vét cạn năm nhánh, còn biểu đồ
// bằng chứng dựng ở `LensChartController`. Bất biến 1 của §5.1 ("đúng năm lens và năm ID
// biểu đồ chính") không bị chạm tới, và §5.1 có thêm một bất biến đối xứng: **một ID bằng
// chứng không được đăng ký làm `PrimaryChartId`**.
//
// Vì sao bằng chứng chứ không phải biểu đồ chính thứ sáu, ba lý do độc lập (CR §A):
//   1. Khác ĐƠN VỊ ĐỌC và khác luận điểm — bảng xếp hạng nói "xã nào", scatter nói "phân bố
//      ô ra sao". Một tên xã nói được trong cuộc họp; một mã ô H3 thì không.
//   2. Khác LỚP SỰ KIỆN — biểu đồ chính là nơi phát duy nhất của `EntitySelectionSet` trong
//      lens này. Đưa scatter lên khe chính là cắt đứt đường từ biểu đồ tới bản đồ.
//   3. Nó KHÔNG mang nổi lựa chọn — `GridCell` không có `commune_code`, nên scatter không
//      thể tô đậm xã đang chọn mà không đổi phép chiếu Q-P4-1.

export const EVIDENCE_CHART_IDS = ["opportunity-demand-access-scatter"] as const;

export type EvidenceChartId = (typeof EVIDENCE_CHART_IDS)[number];

export interface EvidenceChartMeta {
  id: EvidenceChartId;
  lens: LensId;
  /** Nhãn nhóm ở `summary` của khối `<details>`. */
  eyebrow: string;
  title: string;
  unitNoun: string;
  /** Cả ba đều `false` cho mọi biểu đồ bằng chứng — đó là định nghĩa của "bằng chứng". */
  emitsFilter: boolean;
  emitsTime: boolean;
  emitsEntity: boolean;
  /** Mặc định ĐÓNG (§1.7): biểu đồ phụ không chia khe chính và không được nạp sẵn. */
  collapsedByDefault: boolean;
}

export const EVIDENCE_CHART_REGISTRY: Record<EvidenceChartId, EvidenceChartMeta> = {
  "opportunity-demand-access-scatter": {
    id: "opportunity-demand-access-scatter",
    lens: "opportunity",
    eyebrow: "BẰNG CHỨNG",
    title: "Cầu × Tiếp cận theo ô H3",
    unitNoun: "ô",
    emitsFilter: false,
    emitsTime: false,
    emitsEntity: false,
    collapsedByDefault: true,
  },
};

/** Biểu đồ bằng chứng của một lens, nếu lens ấy có. */
export function evidenceChartsOfLens(lensId: LensId): EvidenceChartMeta[] {
  return EVIDENCE_CHART_IDS.map((id) => EVIDENCE_CHART_REGISTRY[id]).filter((m) => m.lens === lensId);
}
