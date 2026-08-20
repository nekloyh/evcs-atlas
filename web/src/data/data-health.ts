/**
 * Quyết định của chế độ DỮ LIỆU, tách khỏi JSX — Phase 8 §6.
 *
 * Vì sao tách: AC-19 buộc mỗi khối **vắng mặt KÈM MỘT LÝ DO** khi manifest không mang dữ
 * liệu của nó, và §8.8 buộc quét toàn bộ khối trên cả 34 manifest thật *cộng*
 * `vn/manifest.json`. Repo này không có bộ render React trong test (không jsdom, không
 * testing-library), nên một quyết định sống trong JSX là một quyết định không quét được.
 *
 * Mọi thứ ở đây là hàm THUẦN trên `Manifest`. `test/data-health.test.ts` chạy chúng qua cả
 * 35 manifest và chốt hai điều: không khối nào ném, và không khối nào rơi vào trạng thái
 * "hiện ra nhưng rỗng". Cái thứ hai mới là cái đã hỏng — khối KHOẢNG TRỐNG trên một manifest
 * không có `null_states` in ra *"Bảng grid có 100 % độ phủ trên toàn bộ các cột"*, một tuyên
 * bố SAI dựng trên dữ liệu vắng mặt.
 */

import type { Manifest } from "./manifest";

export const DATA_BLOCKS = [
  "provenance",
  "kpi",
  "filters",
  "connectors",
  "coverage",
  "nullStates",
  "suspect",
  "provinces",
  "shapes",
  "table",
] as const;

export type DataBlockId = (typeof DATA_BLOCKS)[number];

/**
 * Một khối hoặc VẼ ĐƯỢC, hoặc vắng mặt kèm lý do. Không có trạng thái thứ ba — và "trạng
 * thái thứ ba" chính là chỗ bản trước nói dối: rơi về một câu mặc định nghe như một phép đo.
 */
export type BlockGate =
  | { render: true }
  | { render: false; reason: string; missing: readonly string[] };

const absent = (reason: string, missing: readonly string[]): BlockGate => ({
  render: false,
  reason,
  missing,
});

const OK: BlockGate = { render: true };

/** Manifest gộp TOÀN QUỐC (`vn/manifest.json`) — không có `province`, không có khối theo cột. */
export function isNationalManifest(m: Manifest): boolean {
  return !m.province;
}

const NATIONAL_NOTE =
  "Bộ gộp toàn quốc (`vn/manifest.json`) không mang khối này — nó gộp 34 tỉnh ở độ phân giải r6/r7 và không chở số đo theo cột. Chọn một tỉnh để đọc.";

export function gateFor(block: DataBlockId, m: Manifest): BlockGate {
  const national = isNationalManifest(m);
  switch (block) {
    case "provenance":
      // `vintage` là thứ tối thiểu. Vắng nó thì mọi ô ngày trong khối là một hằng gõ tay —
      // và một ngày gõ tay hiện ra như một ngày ĐO ĐƯỢC.
      return m.vintage
        ? OK
        : absent("Manifest không khai niên bản hành chính, nên không có ngày nào để hiển thị.", [
            "vintage",
          ]);
    case "kpi":
      return m.totals?.in_scope
        ? OK
        : absent(
            national
              ? "Bộ toàn quốc chỉ mang tổng gộp, không mang lát cắt IN / BUFFER nên KPI theo phạm vi ranh giới không dựng được."
              : "Manifest không khai khối `totals.in_scope`.",
            ["totals.in_scope"],
          );
    case "filters":
      return m.filters && Object.keys(m.filters).length > 0
        ? OK
        : absent(
            national ? NATIONAL_NOTE : "Manifest không khai khối `filters`.",
            ["filters"],
          );
    case "connectors":
      return m.totals?.connectors && m.totals.all
        ? OK
        : absent(
            national ? NATIONAL_NOTE : "Manifest không khai `totals.connectors`.",
            ["totals.connectors", "totals.all"],
          );
    case "coverage":
      return m.coverage && Object.keys(m.coverage).length > 0
        ? OK
        : absent(
            national ? NATIONAL_NOTE : "Manifest không khai khối `coverage`.",
            ["coverage"],
          );
    case "nullStates":
      return m.null_states && Object.keys(m.null_states).length > 0
        ? OK
        : absent(
            national ? NATIONAL_NOTE : "Manifest không khai khối `null_states`.",
            ["null_states"],
          );
    case "suspect": {
      const has =
        (m.invalid_values && Object.keys(m.invalid_values).length > 0) ||
        (m.degenerate_columns && Object.keys(m.degenerate_columns).length > 0) ||
        (m.not_measured && Object.keys(m.not_measured).length > 0) ||
        Boolean(m.freshness?.row_level);
      return has
        ? OK
        : absent(
            national ? NATIONAL_NOTE : "Manifest không khai khối giá trị đáng ngờ nào.",
            ["invalid_values", "degenerate_columns", "not_measured", "freshness"],
          );
    }
    case "provinces":
      // Bảng 34 tỉnh nạp riêng (`province_health.json`) nên nó dựng được ở CẢ chế độ toàn quốc.
      return OK;
    case "shapes":
      return m.totals?.occ_status_ok
        ? OK
        : absent(
            national ? NATIONAL_NOTE : "Manifest không khai chất lượng quan sát telemetry.",
            ["totals.occ_status_ok"],
          );
    case "table":
      // Bảng phẳng đọc thẳng file đã ship chứ không đọc manifest; nó dựng được ở đâu có file.
      return m.province ? OK : absent(NATIONAL_NOTE, ["province"]);
  }
}

// ── Đối soát súng / cổng — §2.1 & §6.1-4 ─────────────────────────────────────────────

export interface ConnectorGap {
  /** Súng BÁO CÁO (LIVE), trên `n_stations_with_connectors` trạm. */
  nGuns: number;
  /** Cổng LẮP ĐẶT (ASSET) trên CÙNG phạm vi — `totals.all`, tức IN+BUFFER. */
  nPorts: number;
  /** `nPorts − nGuns`. Dương = thiếu súng so với cổng. */
  gap: number;
  scope: "IN+BUFFER";
  nStationsWithConnectors: number;
  nStationsTotal: number;
  /** Trạm không có dòng connector nào. 28 trên 939 ở Hà Nội — §2.1 buộc nói ra. */
  nStationsWithoutConnectors: number;
}

/**
 * Đối soát súng-vs-cổng trên MỘT phạm vi.
 *
 * `connectors.n_guns` trải trên MỌI trạm có dòng connector, tức IN+BUFFER. Đem nó so với
 * `in_scope.n_ports` (chỉ IN) là dựng lại đúng cái lỗi §2.1 tồn tại để chặn — "hai mẫu số,
 * một màn hình, không nhãn" — và ở Hà Nội nó lật DẤU của khoảng chênh: 8.823 vs 7.785 đọc
 * thành thừa 1.038 súng, trong khi số thật là THIẾU 1.055.
 */
export function connectorGap(m: Manifest): ConnectorGap | null {
  const c = m.totals?.connectors;
  const all = m.totals?.all;
  if (!c || !all) return null;
  return {
    nGuns: c.n_guns,
    nPorts: all.n_ports,
    gap: all.n_ports - c.n_guns,
    scope: "IN+BUFFER",
    nStationsWithConnectors: c.n_stations_with_connectors,
    nStationsTotal: all.n_stations,
    nStationsWithoutConnectors: all.n_stations - c.n_stations_with_connectors,
  };
}

// ── Xếp hạng cột trong khối KHOẢNG TRỐNG — §2.3 ──────────────────────────────────────

export interface ColumnRow {
  table: string;
  column: string;
  nRows: number;
  nPresent: number;
  /** `n_present / n_rows` — mẫu số THÔ. 9,93 % của `util_cell`. */
  shareRows: number;
  nApplicable: number;
  /** `n_present / n_applicable` — mẫu số THẬT. 97,33 % của `util_cell`. */
  shareApplicable: number;
  popShare?: number;
  /** Tổng MISSING + NOT_MEASURED: hai trạng thái nghĩa là *ta không biết*. Khoá xếp hạng. */
  nUnknown: number;
  /** Ô trống không luật nào giải thích — khuyết tật §9. */
  nResidual: number;
  /** Cột này có đeo ⚠ không. Chỉ MISSING và NOT_MEASURED mới đeo. */
  warns: boolean;
  buckets: Array<{
    key: string;
    n: number;
    state: string;
    rule: string;
    basis: string;
    verifiedBy?: string;
  }>;
}

/**
 * Cột của một bảng, xếp theo `MISSING + NOT_MEASURED` giảm dần (§2.3).
 *
 * Xếp theo số ô trống THÔ thì đưa `n_guns_imputed` (97,2 % trống, hoàn toàn khoẻ mạnh) lên
 * đầu một danh sách tiêu đề "vấn đề". Khoá xếp hạng phải là hai trạng thái nghĩa là *ta
 * không biết*, không phải là *có bao nhiêu ô trống*.
 */
export function columnRows(m: Manifest, table: string): ColumnRow[] {
  const block = m.null_states?.[table];
  if (!block) return [];
  const rows: ColumnRow[] = Object.entries(block).map(([column, d]) => {
    const buckets = Object.entries(d.states).map(([key, b]) => ({
      key,
      n: b.n,
      state: b.state,
      rule: b.rule,
      basis: b.basis,
      ...(b.verified_by ? { verifiedBy: b.verified_by } : {}),
    }));
    const sum = (s: string) =>
      buckets.filter((b) => b.state === s).reduce((t, b) => t + b.n, 0);
    const nUnknown = sum("MISSING") + sum("NOT_MEASURED");
    return {
      table,
      column,
      nRows: d.n_rows,
      nPresent: d.n_present,
      shareRows: d.share_rows,
      nApplicable: d.n_applicable,
      shareApplicable: d.share_of_applicable,
      ...(d.pop_share !== undefined ? { popShare: d.pop_share } : {}),
      nUnknown,
      nResidual: buckets.filter((b) => b.basis === "residual").reduce((t, b) => t + b.n, 0),
      warns: nUnknown > 0,
      buckets,
    };
  });
  return rows.sort((a, b) => b.nUnknown - a.nUnknown || a.column.localeCompare(b.column));
}

/** Cột phủ 100 % — chúng KHÔNG có mặt trong `null_states`, và im lặng cũng là một số đo (§2.2). */
export function fullyCoveredColumns(m: Manifest): string[] {
  const withBlanks = new Set(Object.keys(m.null_states?.grid ?? {}));
  return Object.entries(m.coverage ?? {})
    .filter(([c, cov]) => cov.cell_share >= 1 && !withBlanks.has(c))
    .map(([c]) => c)
    .sort();
}
