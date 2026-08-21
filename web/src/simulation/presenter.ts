/**
 * UX redesign — Simulation view-model (simulation/presenter.ts)
 *
 * MỌI câu chữ và mọi con số của panel mô phỏng được dựng ở đây, bằng hàm THUẦN. Component
 * chỉ còn việc đặt chúng vào chỗ. Lý do không viết thẳng trong JSX: bộ test của repo chạy
 * ở `node --test` và **không dịch JSX** (xem `phase10-release.test.ts`), nên một câu nằm
 * trong TSX chỉ khoá được bằng phép so chuỗi trên mã nguồn — thứ vẫn xanh khi câu ấy đúng
 * mà biến bị nối sai. Ở đây thì khoá được bằng chính giá trị trả về.
 *
 * Không có phép tính mô phỏng nào trong file này: nó ĐỌC `SimulationResult` và dịch sang
 * tiếng Việt. Ngưỡng, phân lớp, trung vị, dải — tất cả đã do `engine.ts`/`estimator.ts`
 * quyết định.
 *
 * Reference: docs/UX_SIMULATION_REDESIGN_SPEC.md §7, §10, §11, §12, §13, §14.4
 */

import type {
  CandidateContext,
  CommuneKind,
  ScreeningEvidence,
  SimulationAreaSummary,
  SimulationResult,
} from "./types";

// ── Định dạng số — vi-VN, và một luật đơn vị cho mỗi vai trò ────────────────────

/** Số nguyên đọc được (dân số, số ô). Dấu phân nhóm vi-VN, không bao giờ dấu chấm thập phân. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

/**
 * Cự ly dùng để SO SÁNH với nhau — luôn km, luôn một chữ số thập phân.
 *
 * Ba số của thẻ sàng lọc (khoảng cách · ngưỡng · chênh lệch) phải đọc được như một phép
 * trừ trước mắt người đọc; đổi đơn vị giữa chúng ("3,1 km" cạnh "500 m") buộc người đọc
 * tự quy đổi trước khi so, và đó chính là việc mà thẻ này tồn tại để làm hộ.
 */
export function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

/**
 * Cự ly đứng MỘT MÌNH (trung vị, cự ly một ô) — km từ 1 000 m trở lên, mét ở dưới.
 *
 * Khác `formatKm` vì ở đây không có phép so nào để giữ đơn vị chung, còn "0,3 km" thì vứt
 * đi đúng phần thông tin mà một trung vị 264 m mang.
 */
export function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  if (Math.abs(m) >= 1000) {
    return `${(m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(m).toLocaleString("vi-VN")} m`;
}

/** Ngày của gói dữ liệu — phần ngày của ISO, không dựng lại bằng `Date` (múi giờ sẽ trôi). */
export function formatDatasetDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso.slice(0, 10);
}

/** Phần trăm kiểm chứng trong khối phương pháp — một chữ số, vi-VN. */
export function formatPercentOne(fraction: number): string {
  return (fraction * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

export const COMMUNE_KIND_LABEL: Record<CommuneKind, string> = {
  PHUONG: "Phường",
  XA: "Xã",
  DAC_KHU: "Đặc khu",
};

// ── §10.1 Nút vào tính năng và chế độ đặt ──────────────────────────────────────

export const NAV_IDLE_LABEL = "Đặt vị trí trạm giả định";
export const NAV_IDLE_TOOLTIP =
  "Bấm rồi chọn một vị trí trên bản đồ để ước lượng thay đổi cự ly.";
export const NAV_PLACING_LABEL = "Đang chọn vị trí trạm giả định";
export const NAV_PLACING_TOOLTIP = "Bấm một điểm trong tỉnh để mô phỏng. Nhấn Esc để hủy.";
/** Đã có vị trí ⇒ nút vào chế độ ĐỔI. Nó không xoá — xoá chỉ qua nút trong panel (§10.1). */
export const NAV_REPLACE_LABEL = "Chọn lại vị trí trạm giả định";
export const NAV_REPLACE_TOOLTIP =
  "Bấm vị trí mới trên bản đồ. Nhấn Esc để giữ vị trí hiện tại.";

export interface NavTriggerCopy {
  label: string;
  tooltip: string;
}

export function navTriggerCopy(
  placementMode: boolean,
  candidateActive: boolean,
): NavTriggerCopy {
  if (placementMode) {
    return {
      label: NAV_PLACING_LABEL,
      tooltip: candidateActive ? NAV_REPLACE_TOOLTIP : NAV_PLACING_TOOLTIP,
    };
  }
  if (candidateActive) {
    return { label: NAV_REPLACE_LABEL, tooltip: NAV_REPLACE_LABEL };
  }
  return { label: NAV_IDLE_LABEL, tooltip: NAV_IDLE_TOOLTIP };
}

// ── §10.2 Header ───────────────────────────────────────────────────────────────

export const PANEL_TITLE = "Mô phỏng trạm giả định";
export const SCOPE_LINE =
  "Ước lượng hình học trong phạm vi 5 km; không phải định tuyến.";

/**
 * Dòng địa danh dưới tiêu đề.
 *
 * `commune_name` của `docs/COT.md` ĐÃ mang tiền tố loại đơn vị ("Xã Tây Phương"), nên ở
 * đây tuyệt đối không ghép thêm `kind` vào nữa — "Xã Xã Tây Phương" là lỗi đã thấy ở các
 * panel khác của repo. `kind` chỉ dùng cho thẻ sàng lọc, nơi nó nói NGƯỠNG chứ không nói tên.
 */
export function localityLine(ctx: CandidateContext): string | null {
  const name = ctx.communeName?.trim();
  const province = ctx.provinceName?.trim();
  if (name) return province ? `${name} · ${province}` : name;
  if (province) return `Vị trí trong ${province}`;
  return null;
}

// ── §10.3 Loading / lỗi truy vấn ───────────────────────────────────────────────

export const LOADING_TITLE = "Đang tính kết quả cho vị trí này…";
export const LOADING_DETAIL =
  "Đang đọc các ô trong phạm vi 5 km và đối chiếu trạm hiện hữu.";
export const QUERY_ERROR_MESSAGE = "Không đọc được dữ liệu quanh vị trí này.";
export const QUERY_ERROR_RETRY = "Thử lại";
export const QUERY_ERROR_DISMISS = "Xóa vị trí";
export const DELETE_CANDIDATE_LABEL = "Xóa vị trí giả định";

// ── §10.4 Outcome ──────────────────────────────────────────────────────────────

export interface OutcomeModel {
  /** Câu CHÍNH — quy mô cải thiện rõ rệt. Luôn có. */
  primary: string;
  /** Câu thứ hai — phần còn trong biên sai số. `null` chỉ ở trạng thái không ô nào đổi. */
  secondary: string | null;
  /** Nguyên văn deck: `primary` + `secondary` nối bằng một dấu cách. Dùng cho `aria-live`. */
  text: string;
  improvedCells: number;
  uncertainCells: number;
}

/**
 * §10.4 — bốn trạng thái đóng. `IMPROVES` và `UNCERTAIN` KHÔNG BAO GIỜ gộp làm một số:
 * lớp thứ nhất dùng cận TRÊN (`d̂⁺ < d_old`, bảo thủ), lớp thứ hai chỉ nói "chưa loại trừ
 * được" — cộng chúng lại là biến một câu có điều kiện thành một khẳng định.
 */
export function outcomeModel(result: SimulationResult): OutcomeModel {
  const imp = result.after.improved;
  const unc = result.after.uncertain;
  const impPop = formatCount(imp.population);
  const uncPop = formatCount(unc.population);

  let primary: string;
  let secondary: string | null;

  if (imp.cells > 0) {
    primary = `Ước tính ~${impPop} người trong ${formatCount(imp.cells)} ô được rút ngắn cự ly rõ rệt.`;
    secondary =
      unc.cells > 0
        ? `~${uncPop} người trong ${formatCount(unc.cells)} ô khác có thể cải thiện, nhưng còn trong biên sai số.`
        : "Không có ô nào nằm trong nhóm có thể cải thiện nhưng còn trong biên sai số.";
  } else if (unc.cells > 0) {
    primary = "Chưa có ô nào được xếp vào nhóm cải thiện rõ rệt.";
    secondary = `~${uncPop} người trong ${formatCount(unc.cells)} ô có thể cải thiện, nhưng kết quả còn trong biên sai số.`;
  } else {
    primary =
      "Không có ô nào trong phạm vi 5 km được ước tính rút ngắn cự ly ở vị trí này.";
    secondary = null;
  }

  return {
    primary,
    secondary,
    text: secondary === null ? primary : `${primary} ${secondary}`,
    improvedCells: imp.cells,
    uncertainCells: unc.cells,
  };
}

// ── §10.5 Phần chưa thể kết luận ───────────────────────────────────────────────

export const UNRESOLVED_HEADING = "Phần chưa thể kết luận";

/**
 * §10.5 + §13.2 — bốn loại bất định KHÁC NGHĨA, nên chúng là bốn câu chứ không phải một
 * badge "độ tin cậy". Dòng nào không active thì không dựng: một cảnh báo luôn hiện là một
 * cảnh báo không ai đọc.
 */
export function unresolvedNotices(result: SimulationResult): string[] {
  const out: string[] = [];
  const { noBaseline, excluded } = result.before;
  if (noBaseline.cells > 0) {
    out.push(
      `${formatCount(noBaseline.cells)} ô, tương ứng ${formatCount(noBaseline.population)} người, hiện không tới được trạm nào trong đồ thị đường đã phát hành; không có nền để ước lượng thay đổi.`,
    );
  }
  if (excluded.cells > 0) {
    out.push(
      `${formatCount(excluded.cells)} ô, tương ứng ${formatCount(excluded.population)} người, không có đường được neo trong phạm vi 2 km; các ô này bị loại khỏi mô phỏng.`,
    );
  }
  if (result.meta.zoneTruncated) {
    out.push(
      "Phạm vi 5 km chạm ranh giới gói dữ liệu; các ô phía tỉnh bên cạnh không được tính.",
    );
  }
  if (result.meta.flaggedPopSourceCells > 0) {
    out.push(
      `${formatCount(result.meta.flaggedPopSourceCells)} ô trong phạm vi dùng bề mặt dân số chưa neo được vào số công bố VNSDI; tổng dân số mang thêm bất định của nguồn này.`,
    );
  }
  return out;
}

// ── §12 Thẻ sàng lọc khoảng cách ───────────────────────────────────────────────

export type RuleState =
  | "NOT_COMPUTABLE"
  | "BASE_PASS"
  | "CONDITIONAL_DC"
  | "BASE_FAIL_EXCEPTION_UNAVAILABLE"
  | "BASE_FAIL";

export interface RuleFact {
  label: string;
  value: string;
}

export interface RulePresentation {
  state: RuleState;
  headline: string;
  facts: RuleFact[];
  notes: string[];
  footer: string;
  nearestStationCode: string | null;
  nearestStationName: string | null;
}

export const RULE_HEADING = "Sàng lọc khoảng cách";
/** §2.3 — `L6` là nhãn PHỤ; tên của rule trên màn hình là "Sàng lọc khoảng cách". */
export const RULE_EYEBROW = "L6";
export const RULE_FOOTER =
  "Đây là kết quả của một quy tắc khoảng cách, không phải số đo và không phải quyết định đầu tư.";

const RULE_HEADLINE: Record<RuleState, string> = {
  NOT_COMPUTABLE: "Chưa tính được kết quả sàng lọc khoảng cách.",
  BASE_PASS: "Qua bước sàng lọc khoảng cách theo quy tắc L6.",
  CONDITIONAL_DC: "Qua bước sàng lọc có điều kiện: vị trí mới phải có sạc DC.",
  BASE_FAIL_EXCEPTION_UNAVAILABLE:
    "Không qua bước sàng lọc khoảng cách theo dữ liệu hiện có.",
  BASE_FAIL: "Không qua bước sàng lọc khoảng cách theo quy tắc L6.",
};

/**
 * §12.1 — bảng trạng thái ĐÓNG, tách riêng khỏi component để test được một mình.
 *
 * `BASE_FAIL_EXCEPTION_UNAVAILABLE` KHÔNG phải một phán quyết thứ tư: engine vẫn trả
 * `TU_CHOI`. Nó tồn tại chỉ để bắt buộc caveat F6 xuất hiện — thiếu caveat ấy, một lớp
 * mức sử dụng KHÔNG DÙNG ĐƯỢC bị đọc thành "đã đo và trạm đang rảnh".
 */
export function ruleState(ev: ScreeningEvidence): RuleState {
  const { distanceM, thresholdM, kind } = ev;
  if (distanceM === null || !Number.isFinite(distanceM) || kind === null || thresholdM === null) {
    return "NOT_COMPUTABLE";
  }
  if (distanceM > thresholdM) return "BASE_PASS";

  const inExceptionRange = kind === "XA" && distanceM > ev.exceptionFloorM;
  if (inExceptionRange) {
    if (!ev.highLoadEvaluable) return "BASE_FAIL_EXCEPTION_UNAVAILABLE";
    if (ev.nearestHighLoad) return "CONDITIONAL_DC";
  }
  return "BASE_FAIL";
}

export function rulePresentation(ev: ScreeningEvidence): RulePresentation {
  const state = ruleState(ev);
  const kindLabel = ev.kind === null ? null : COMMUNE_KIND_LABEL[ev.kind];
  const facts: RuleFact[] = [];
  const notes: string[] = [];

  facts.push({
    label: "Khoảng cách tới trạm đủ điều kiện gần nhất",
    value:
      ev.distanceM === null || !Number.isFinite(ev.distanceM)
        ? "chưa xác định"
        : `${formatKm(ev.distanceM)} đường chim bay`,
  });
  facts.push({
    label: kindLabel === null ? "Ngưỡng theo loại đơn vị hành chính" : `Ngưỡng của ${kindLabel}`,
    value: ev.thresholdM === null ? "chưa xác định" : `lớn hơn ${formatKm(ev.thresholdM)}`,
  });

  if (ev.marginM !== null && Number.isFinite(ev.marginM)) {
    // Biên bằng 0 không có "hướng" nào để nói — spec chỉ khoá hai nhánh cao/thấp, nên
    // nhánh thứ ba dùng một nhãn trung tính và được nói rõ bằng câu equality bên dưới.
    const label =
      ev.marginM > 0 ? "Cao hơn ngưỡng" : ev.marginM < 0 ? "Thấp hơn ngưỡng" : "Bằng ngưỡng";
    facts.push({ label, value: formatKm(Math.abs(ev.marginM)) });
  }

  if (state === "NOT_COMPUTABLE") {
    if (ev.kind === null) {
      notes.push("Không xác định được loại đơn vị hành chính tại điểm này.");
    }
    if (ev.distanceM === null || !Number.isFinite(ev.distanceM)) {
      notes.push("Chưa có trạm đủ điều kiện nào trong gói dữ liệu.");
    }
  }

  if (ev.marginM === 0) {
    notes.push("Khoảng cách bằng ngưỡng, nhưng quy tắc yêu cầu phải lớn hơn ngưỡng.");
  }

  if (state === "CONDITIONAL_DC") {
    notes.push(
      `Vị trí nằm trên sàn ngoại lệ ${formatKm(ev.exceptionFloorM)} nhưng chưa vượt ngưỡng ${formatKm(
        ev.thresholdM ?? 2000,
      )} của Xã.`,
      `Trạm gần nhất có mức sử dụng đo đủ điều kiện từ ${Math.round(
        ev.highLoadThreshold * 100,
      )}% trở lên.`,
      "Quy tắc chỉ cho qua nhánh này khi vị trí mới có sạc DC.",
    );
  }

  if (state === "BASE_FAIL_EXCEPTION_UNAVAILABLE") {
    notes.push(
      "Nhánh ngoại lệ cao tải chưa đánh giá được vì lớp mức sử dụng của tỉnh này không dùng được.",
      "Kết quả trên giữ theo quy ước của rule hiện hành; không được hiểu là trạm đang có mức sử dụng thấp.",
    );
  }

  // §12.3 — thiếu phép đo thì nói ĐÚNG quy ước của rule, và nói rõ nó KHÔNG chứng minh
  // điều ngược lại. Đây là chỗ dễ nhất để một giao diện tự bịa ra "trạm đang rảnh".
  if (
    state === "BASE_FAIL" &&
    ev.kind === "XA" &&
    ev.distanceM !== null &&
    ev.distanceM > ev.exceptionFloorM &&
    ev.highLoadEvaluable &&
    !ev.nearestUtilReportable
  ) {
    notes.push(
      "Ngoại lệ không được kích hoạt vì trạm gần nhất không có phép đo đủ điều kiện. Điều này không chứng minh trạm đang có mức sử dụng thấp.",
    );
  }

  return {
    state,
    headline: RULE_HEADLINE[state],
    facts,
    notes,
    footer: RULE_FOOTER,
    nearestStationCode: ev.nearestStationCode,
    nearestStationName: ev.nearestStationName,
  };
}

// ── §10.7, §11 Trước/Sau ───────────────────────────────────────────────────────

export const DISTRIBUTION_HEADING = "Cự ly tới trạm gần nhất: Trước và Sau";
export const DISTRIBUTION_QUALIFIER =
  "“Sau” chỉ thay các ô cải thiện rõ rệt; ô còn trong biên sai số giữ cự ly Trước.";
export const DISTRIBUTION_DISCLOSURE = "Xem số người theo từng dải cự ly";
export const NO_MEDIAN_COPY =
  "Không có dân số dương trong các ô đủ điều kiện so sánh; không tính được trung vị theo dân số.";

export type BandKey = "le1km" | "b1_2km" | "b2_5km" | "gt5km";

/** §11.2 — bốn ngưỡng RÀNG BUỘC, cùng thứ tự ở cả hai hàng và ở bảng số. */
export const BAND_ORDER: readonly BandKey[] = ["le1km", "b1_2km", "b2_5km", "gt5km"];
export const BAND_LABEL: Record<BandKey, string> = {
  le1km: "≤ 1 km",
  b1_2km: "1 – 2 km",
  b2_5km: "2 – 5 km",
  gt5km: "> 5 km",
};
/** Nhãn ngắn dưới thanh — đơn vị `km` chỉ in MỘT lần ở cuối chú giải (§11.3). */
export const BAND_TICK: Record<BandKey, string> = {
  le1km: "≤1",
  b1_2km: "1–2",
  b2_5km: "2–5",
  gt5km: ">5",
};

export interface BandSegment {
  key: BandKey;
  label: string;
  population: number;
  /** Tỉ lệ trên CÙNG mẫu số của cả hai hàng. 0 khi mẫu số bằng 0. */
  share: number;
}

export interface BandRow {
  /** "Trước" | "Sau" */
  label: string;
  estimated: boolean;
  segments: BandSegment[];
}

export interface DistributionModel {
  /** Mẫu số CHUNG: tổng dân của tập ô có nền so sánh. */
  total: number;
  before: BandRow;
  after: BandRow;
  table: Array<{
    key: BandKey;
    label: string;
    before: number;
    after: number;
    delta: number;
    /** Vòng 2.1 §6.3 — chữ của dòng delta: `~thêm N` / `~bớt N` / `0`, không dấu `+`. */
    deltaText: string;
  }>;
  /** Câu tóm tắt của figure cho trình đọc màn hình (§11.4). */
  summary: string;
}

/**
 * Vòng 2.1 §6.3 — hướng thay đổi bằng CHỮ, không mượn dấu `+` như một quy ước "tốt".
 * Dùng chung cho dòng delta dưới trục và cột "Thay đổi" của bảng số.
 */
export function bandDeltaText(delta: number): string {
  if (delta === 0) return "0";
  return `~${delta > 0 ? "thêm" : "bớt"} ${formatCount(Math.abs(delta))}`;
}

function segmentsOf(
  bands: Record<BandKey, number>,
  total: number,
): BandSegment[] {
  return BAND_ORDER.map((key) => ({
    key,
    label: BAND_LABEL[key],
    population: bands[key],
    share: total > 0 ? bands[key] / total : 0,
  }));
}

/**
 * §11.2 — hai hàng, MỘT mẫu số. Mẫu số là tổng dân của tập ô có nền so sánh, và đúng tập
 * ấy sinh ra cả hai hàng trong `engine.ts` (`baselineBeforeCells`), nên hai tổng bằng nhau
 * theo cấu trúc chứ không theo may mắn. NO_BASELINE/EXCLUDED nằm NGOÀI thanh và được nói
 * riêng ở §10.5 — kéo chúng vào đây là biến "không biết" thành một dải cự ly.
 */
export function distributionModel(result: SimulationResult): DistributionModel {
  const beforeBands = result.before.popByBand;
  const afterBands = result.after.popByBand;
  const total = BAND_ORDER.reduce((s, k) => s + beforeBands[k], 0);

  const table = BAND_ORDER.map((key) => {
    const delta = afterBands[key] - beforeBands[key];
    return {
      key,
      label: BAND_LABEL[key],
      before: beforeBands[key],
      after: afterBands[key],
      delta,
      deltaText: bandDeltaText(delta),
    };
  });

  // Vòng 2.1 §6.3 — figcaption mang đủ 8 con số VÀ 4 delta: dòng delta trên hình được
  // phép aria-hidden vì toàn bộ nội dung của nó đã nằm ở đây.
  const summary = `Phân bố dân số theo cự ly tới trạm gần nhất trên ${formatCount(
    total,
  )} người có nền so sánh. ${table
    .map(
      (r) =>
        `${r.label}: trước ${formatCount(r.before)} người, sau ước lượng ~${formatCount(
          r.after,
        )} người (thay đổi ${r.deltaText})`,
    )
    .join("; ")}.`;

  return {
    total,
    before: { label: "Trước", estimated: false, segments: segmentsOf(beforeBands, total) },
    after: { label: "Sau", estimated: true, segments: segmentsOf(afterBands, total) },
    table,
    summary,
  };
}

/**
 * §10.7 — "trung vị theo dân số" là một thuật ngữ; câu này là NGHĨA của nó. Khi không có
 * trọng số dân dương thì trung vị KHÔNG TỒN TẠI (`null` từ `calculateWeightedMedian`), và
 * câu trả lời là nói ra điều đó, không phải in một con số thay thế.
 */
export function medianSentences(result: SimulationResult): string[] {
  const b = result.before.popWeightedMedianM;
  const a = result.after.popWeightedMedianM;
  if (b === null || a === null) return [NO_MEDIAN_COPY];
  return [
    `Trước: 50% dân số trong vùng cách trạm gần nhất không quá ${formatDistance(b)}.`,
    `Sau: ước lượng 50% dân số trong vùng cách trạm gần nhất không quá ~${formatDistance(a)}.`,
  ];
}

// ── §10.8 Khu vực liên quan ────────────────────────────────────────────────────

export const LOCALITY_HEADING = "Khu vực liên quan";
export const LOCALITY_KEY_NOTE =
  "Trên bản đồ: nét liền là ô cải thiện rõ rệt, nét đứt là ô còn trong biên sai số.";

/**
 * Con số hiện trên hàng địa danh — 320 px chỉ đủ chỗ cho MỘT số, nên nó phải là số nói
 * đúng lý do hàng ấy có mặt.
 *
 * Đo được ở witness 1280×800: hai xã chỉ có ô UNCERTAIN in ra `~0 người`. Đó là một sự
 * thật (0 người cải thiện rõ rệt) nhưng nó đọc thành "vùng này chẳng được gì" trong khi
 * hàng lại đang tồn tại vì có dân trong biên sai số. Một số đúng đặt sai chỗ vẫn là một
 * câu sai. Nhãn `aria-label` của hàng vẫn nói CẢ HAI lớp (§10.8).
 */
export function localityRowValue(area: SimulationAreaSummary): string {
  if (area.improved.population > 0) {
    return `~${formatCount(area.improved.population)} người`;
  }
  return `~${formatCount(area.uncertain.population)} trong sai số`;
}

export function localityRowLabel(area: SimulationAreaSummary): string {
  return `Xem ${area.communeName} trên bản đồ: ước tính ~${formatCount(
    area.improved.population,
  )} người cải thiện rõ rệt, ~${formatCount(
    area.uncertain.population,
  )} người còn trong biên sai số.`;
}

export function missingLocalityNotice(result: SimulationResult): string | null {
  const m = result.areas.missingName;
  if (m.cells <= 0) return null;
  return `${formatCount(
    m.cells,
  )} ô chưa có địa danh đủ tin cậy để liệt kê; các ô vẫn được tính trong tổng toàn vùng.`;
}

// ── §10.9 Cần kiểm tra tiếp ────────────────────────────────────────────────────

export const NEXT_EVIDENCE_HEADING = "Cần kiểm tra tiếp";

/** §10.9 — checklist ĐỌC, không phải checkbox được lưu. Đây là phần dữ liệu KHÔNG có. */
export const NEXT_EVIDENCE_ITEMS: readonly string[] = [
  "Kiểm tra tuyến đường lái thực tế, cầu/sông/đường một chiều và lối xe vào vị trí.",
  "Đối chiếu trạm đang xây hoặc đã được cấp phép; bộ dữ liệu hiện không có danh sách này.",
  "Khảo sát khả năng đấu nối điện, pháp lý đất, chỗ đỗ, PCCC và điều kiện tiếp cận.",
  "Xác nhận lại trạng thái và ngày dữ liệu của các trạm hiện hữu lân cận.",
];

// ── §10.10 Disclosure phụ ──────────────────────────────────────────────────────

export const METHOD_SUMMARY = "Phương pháp và giới hạn";
export const TECHNICAL_SUMMARY = "Chi tiết vị trí";
export const NO_NEARBY_STATION =
  "Không có trạm đủ điều kiện nào trong phạm vi 5 km.";
export const CLAIMS_ABSENT =
  "Kết quả không cho biết tuyến lái thật, nhu cầu hay mức sử dụng tương lai của vị trí mới, hiệu quả tài chính, khả năng đấu nối điện hoặc điều kiện xây dựng tại chỗ.";

export function nearbyStationsSummary(count: number): string {
  return `Trạm hiện hữu trong 5 km (${formatCount(count)})`;
}

/** §10.10 — hai đoạn phương pháp, số kiểm chứng lấy từ chính hiệu chuẩn của tỉnh đang mở. */
export function methodBody(result: SimulationResult): string[] {
  const v = result.meta.validation;
  return [
    `Với mỗi ô trong phạm vi 5 km, cự ly tới vị trí giả định được ước lượng bằng khoảng cách chim bay nhân hệ số đi vòng theo dải cự ly và các ô lân cận. Hệ số được hiệu chuẩn riêng cho tỉnh. Trên ${formatCount(
      v.n,
    )} ô kiểm chứng của tỉnh, ${formatPercentOne(
      v.within20pct,
    )}% ước lượng nằm trong ±20%; cận trên còn bị vượt ở khoảng ${formatPercentOne(
      v.upperMiss,
    )}%. Dưới 1 km, sai số lớn hơn nên cự ly từng ô chỉ hiện dưới dạng khoảng. Ô không có cự ly nền không được điền giá trị thay thế.`,
    `Dân số là bề mặt WorldPop 2025 đã neo theo số công bố VNSDI khi nguồn cho phép. Dữ liệu trạm chốt ngày ${formatDatasetDate(
      result.meta.manifestExported,
    )}; mạng trạm hoặc nguồn dân số đổi thì kết quả đổi.`,
  ];
}

export interface TechnicalRow {
  label: string;
  value: string;
  /** Định danh MÁY — chỉ những dòng này được dùng JetBrains Mono (§15). */
  mono: boolean;
}

export function technicalRows(result: SimulationResult): TechnicalRow[] {
  return [
    {
      label: "Toạ độ",
      // Dấu chấm ở đây là quy ước KỸ THUẬT của toạ độ (`docs/COT.md`), không phải một số
      // để đọc — nên nó nằm ngoài luật vi-VN, và nó chỉ xuất hiện ở đúng khối cuối này.
      value: `${result.candidate.lat.toFixed(5)}, ${result.candidate.lng.toFixed(5)}`,
      mono: true,
    },
    { label: "Ô H3 r8", value: result.candidate.cell, mono: true },
    {
      label: "Hiệu chuẩn mô phỏng",
      value: `v${result.meta.calibrationVersion}`,
      mono: false,
    },
    {
      label: "Ngày xuất gói dữ liệu",
      value: formatDatasetDate(result.meta.manifestExported),
      mono: false,
    },
  ];
}

// ── §14.4 Đưa bản đồ tới một nhóm địa danh ─────────────────────────────────────

export interface FocusViewport {
  width: number;
  height: number;
  /** Bề rộng thẻ bằng chứng đang che mép phải vùng bản đồ (0 khi thẻ không nổi). */
  evidenceWidth: number;
  /** Bề rộng nav rail + cột đọc đang chiếm mép trái. */
  chromeLeft: number;
  /** Chiều cao chrome dưới đáy vùng bản đồ. */
  chromeBottom: number;
}

export interface FocusView {
  lng: number;
  lat: number;
  zoom: number;
}

const FOCUS_PADDING = 1.25;
const FOCUS_ZOOM_MIN = 10;
const FOCUS_ZOOM_MAX = 15;

/**
 * §14.4 — khớp khung nhìn vào hộp bao của một nhóm ô, CÓ TRỪ bề rộng thẻ bằng chứng.
 *
 * `zoomForFeatureBounds` của `state/view-config.ts` không trừ thẻ nổi (nó ra đời cho lối
 * đi tới một xã khi thẻ chưa mở), nên dùng lại nguyên vẹn sẽ đặt nhóm vào giữa vùng bản đồ
 * — tức nằm một nửa dưới chính tấm panel vừa được bấm. Hàm này khớp vào phần bản đồ CÒN
 * NHÌN THẤY rồi dịch tâm sang trái đúng nửa bề rộng thẻ.
 */
export function localityFocusView(
  bbox: readonly [number, number, number, number],
  viewport: FocusViewport,
): FocusView {
  const [w, s, e, n] = bbox;
  const centerLat = (s + n) / 2;
  const usableW = Math.max(
    240,
    viewport.width - viewport.chromeLeft - viewport.evidenceWidth,
  );
  const usableH = Math.max(240, viewport.height - viewport.chromeBottom);
  const latRad = centerLat * (Math.PI / 180);
  const zx = Math.log2(((usableW / 512) * 360) / Math.max(e - w, 1e-9));
  const zy = Math.log2(
    ((usableH / 512) * 360) / Math.max((n - s) / Math.max(Math.cos(latRad), 0.1), 1e-9),
  );
  const zoom = Math.max(
    FOCUS_ZOOM_MIN,
    Math.min(FOCUS_ZOOM_MAX, Math.round((Math.min(zx, zy) - Math.log2(FOCUS_PADDING)) * 10) / 10),
  );

  // Dịch tâm sang TÂY nửa bề rộng thẻ: ở mức phóng z, một pixel là 360 / (512 · 2^z) độ
  // kinh tuyến. Nhóm ô vì thế nằm giữa phần bản đồ còn nhìn thấy, không nằm dưới thẻ.
  const degPerPx = 360 / (512 * Math.pow(2, zoom));
  const shift = ((viewport.evidenceWidth - viewport.chromeLeft) / 2) * degPerPx;

  return { lng: (w + e) / 2 - shift, lat: centerLat, zoom };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Vòng 2.1 — docs/UX_SIMULATION_DECISION_CONTEXT_SPEC.md
// Banner sàng lọc (V1), hero tiles (V2), dòng delta (V3) và bối cảnh mạng trạm (V4).
// KHÔNG một phép tính mô phỏng nào: tất cả đọc từ `SimulationResult` đã có.
// ═══════════════════════════════════════════════════════════════════════════════

// ── §6.1 Banner Sàng lọc — map 1–1 vào RuleState hiện có, phán quyết KHÔNG đổi ──

/** Icon là KHOÁ, không phải component: presenter không import React (spec §9.1). */
export type RuleBannerIcon = "pass" | "conditional" | "fail" | "unknown";

export interface RuleBanner {
  state: RuleState;
  icon: RuleBannerIcon;
  /** Nhãn lớn của banner — ngôn ngữ PHÉP KIỂM, không phải phê duyệt/đề xuất. */
  badge: string;
  /** Dòng cự ly ba-số-một-đơn-vị (km, 1 chữ số lẻ) đọc như một phép trừ; `null` khi
   *  NOT_COMPUTABLE — không có ba số nào để so. */
  distanceLine: string | null;
  /** Các dòng phụ theo trạng thái (ngoại lệ, bằng ngưỡng, AC-11…). */
  notes: string[];
  /** Cố định mọi trạng thái — §6.1. */
  footer: string;
}

export const RULE_BADGE: Record<RuleState, string> = {
  BASE_PASS: "ĐẠT SÀNG LỌC KHOẢNG CÁCH",
  CONDITIONAL_DC: "ĐẠT CÓ ĐIỀU KIỆN: CẦN SẠC DC",
  BASE_FAIL: "KHÔNG ĐẠT SÀNG LỌC",
  BASE_FAIL_EXCEPTION_UNAVAILABLE: "KHÔNG ĐẠT SÀNG LỌC",
  NOT_COMPUTABLE: "KHÔNG KẾT LUẬN ĐƯỢC: THIẾU DỮ LIỆU",
};

const RULE_BANNER_ICON: Record<RuleState, RuleBannerIcon> = {
  BASE_PASS: "pass",
  CONDITIONAL_DC: "conditional",
  BASE_FAIL: "fail",
  BASE_FAIL_EXCEPTION_UNAVAILABLE: "fail",
  NOT_COMPUTABLE: "unknown",
};

export const RULE_BANNER_FOOTER =
  "Kết quả phép kiểm khoảng cách để cấp thẩm quyền xem xét; không phải quyết định đầu tư.";
export const RULE_NOT_COMPUTABLE_DETAIL =
  "Không xác định được loại địa bàn hoặc khoảng cách tới trạm đủ điều kiện.";
export const RULE_EQUALITY_NOTE =
  "Khoảng cách bằng đúng ngưỡng; quy tắc yêu cầu lớn hơn ngưỡng.";
export const RULE_EXCEPTION_UNAVAILABLE_NOTE =
  "Nhánh ngoại lệ chưa đánh giá được: tỉnh khuyết dữ liệu đo tải.";
/** §6.1 dòng phụ AC-11 — phủ 316 ô/~309.000 dân ở p/01; phán quyết vẫn KHÔNG ĐẠT. */
export const RULE_NEAREST_UNMEASURED_NOTE =
  "Trạm gần nhất chưa có phép đo hợp lệ — nhánh ngoại lệ không đánh giá được.";

/** Phần trăm mức sử dụng — số nguyên vi-VN; 0 đo được in "0" (AC-08). */
export function formatUtilPercent(util: number): string {
  return (util * 100).toLocaleString("vi-VN", { maximumFractionDigits: 0 });
}

/**
 * §6.1 — banner dựng TRÊN `ruleState`, không dựng lại phán quyết. Parity với
 * `replayScreening` vì thế được thừa kế nguyên vẹn từ vòng 1.
 */
export function ruleBanner(ev: ScreeningEvidence): RuleBanner {
  const state = ruleState(ev);
  const notes: string[] = [];

  let distanceLine: string | null = null;
  if (
    state !== "NOT_COMPUTABLE" &&
    ev.distanceM !== null &&
    ev.thresholdM !== null &&
    ev.kind !== null
  ) {
    const clause =
      ev.marginM === null
        ? null
        : ev.marginM > 0
          ? `cao hơn ngưỡng ${formatKm(ev.marginM)}`
          : ev.marginM < 0
            ? `thấp hơn ngưỡng ${formatKm(Math.abs(ev.marginM))}`
            : "bằng ngưỡng";
    distanceLine = [
      `${formatKm(ev.distanceM)} chim bay`,
      `ngưỡng ${COMMUNE_KIND_LABEL[ev.kind]} ${formatKm(ev.thresholdM)}`,
      ...(clause ? [clause] : []),
    ].join(" · ");
  }

  if (state === "NOT_COMPUTABLE") {
    notes.push(RULE_NOT_COMPUTABLE_DETAIL);
  }
  if (state === "CONDITIONAL_DC") {
    const u =
      ev.nearestUtil !== null && Number.isFinite(ev.nearestUtil)
        ? ` ${formatUtilPercent(ev.nearestUtil)}%`
        : "";
    notes.push(
      `Ngoại lệ kích hoạt: trạm gần nhất đang cao tải${u} (≥40%), trên sàn 0,5 km.`,
    );
  }
  if (state === "BASE_FAIL_EXCEPTION_UNAVAILABLE") {
    notes.push(RULE_EXCEPTION_UNAVAILABLE_NOTE);
  }
  if (ev.marginM === 0 && state !== "NOT_COMPUTABLE") {
    notes.push(RULE_EQUALITY_NOTE);
  }
  // AC-11 — Xã trong dải ngoại lệ, lớp đo của tỉnh DÙNG ĐƯỢC nhưng trạm gần nhất
  // không có phép đo hợp lệ: nói ra vì sao nhánh ngoại lệ im lặng. Phán quyết KHÔNG đổi.
  if (
    state === "BASE_FAIL" &&
    ev.kind === "XA" &&
    ev.distanceM !== null &&
    ev.thresholdM !== null &&
    ev.distanceM > ev.exceptionFloorM &&
    ev.distanceM <= ev.thresholdM &&
    ev.highLoadEvaluable &&
    !ev.nearestUtilReportable
  ) {
    notes.push(RULE_NEAREST_UNMEASURED_NOTE);
  }

  return {
    state,
    icon: RULE_BANNER_ICON[state],
    badge: RULE_BADGE[state],
    distanceLine,
    notes,
    footer: RULE_BANNER_FOOTER,
  };
}

// ── §6.2 Hero Outcome Tiles — hai lớp KHÔNG BAO GIỜ cộng gộp ───────────────────

export const HERO_EYEBROW = "Kết quả ước lượng";
export const HERO_IMPROVED_LABEL = "Cải thiện rõ rệt";
export const HERO_UNCERTAIN_LABEL = "Trong biên sai số";
export const HERO_IMPROVED_ZERO_NOTE = "không ô nào được rút ngắn cự ly rõ rệt";
export const HERO_UNCERTAIN_ZERO_NOTE = "không ô nào nằm trong biên sai số";

export interface HeroTile {
  label: string;
  /** Phần SỐ: `~{pop}` khi có ô; `0` (không dấu ~) ở zero-state — 0 ô là chính xác. */
  value: string;
  /** Đơn vị đứng cạnh số, cỡ body — 24 px cho "người" là kéo cả tile thành hai dòng
   *  (đo ở witness 1280×800); số mang cấp bậc, đơn vị không cần. */
  unit: string;
  note: string;
  /** Phân cấp cỡ chữ §6.2: chỉ tile cải thiện dùng `text-readout`. */
  emphasis: "readout" | "display";
}

export function heroTilesModel(result: SimulationResult): [HeroTile, HeroTile] {
  const imp = result.after.improved;
  const unc = result.after.uncertain;
  return [
    {
      label: HERO_IMPROVED_LABEL,
      value: imp.cells > 0 ? `~${formatCount(imp.population)}` : "0",
      unit: "người",
      note: imp.cells > 0 ? `trong ${formatCount(imp.cells)} ô` : HERO_IMPROVED_ZERO_NOTE,
      emphasis: "readout",
    },
    {
      label: HERO_UNCERTAIN_LABEL,
      value: unc.cells > 0 ? `~${formatCount(unc.population)}` : "0",
      unit: "người",
      note: unc.cells > 0 ? `trong ${formatCount(unc.cells)} ô` : HERO_UNCERTAIN_ZERO_NOTE,
      emphasis: "display",
    },
  ];
}

// ── §3 Disclosure — hai tiết vòng 1 chuyển xuống disclosure (đảo ngược có khai báo) ──

/** §3 — "Khu vực liên quan" nay là disclosure; số đếm nằm ngay trên summary. */
export function localityDisclosureSummary(count: number): string {
  return `Khu vực liên quan (${formatCount(count)} xã/phường)`;
}

// ── §6.4 + §7 + §8 Thanh Bối cảnh Mạng trạm 5 km (V4) ─────────────────────────

export const STATION_CONTEXT_HEADING = "Bối cảnh mạng trạm trong 5 km";
export const STATION_CONTEXT_TAG = "ĐO TRONG 30 NGÀY";
export const STATION_CONTEXT_EMPTY =
  "Không có trạm đủ điều kiện nào trong phạm vi 5 km.";

export type StationContextSegmentKey = "high" | "low" | "unassessed";

export interface StationContextSegment {
  key: StationContextSegmentKey;
  count: number;
  /** Tỉ lệ trên tổng trạm 5 km — bề rộng phân đoạn. Chỉ phân đoạn count>0 có mặt. */
  share: number;
  label: string;
}

export interface StationContextModel {
  counts: {
    total: number;
    within500: number;
    within2km: number;
    high: number;
    low: number;
    unassessed: number;
    measured: number;
  };
  /** Dòng đếm bán kính THÍCH ỨNG theo kind (§7). */
  radiusLine: string;
  /** Phân đoạn = 0 KHÔNG có mặt (AC-03) — component không render dải 0 px. */
  segments: StationContextSegment[];
  measuredLine: string;
  /** `null` khi không có trạm nào trong 5 km. */
  nearestLine: string | null;
  ariaLabel: string;
}

/**
 * §6.4 — thuần view-model trên `context.stationsWithin5km`. `util !== null` NGHĨA LÀ có
 * phép đo hợp lệ (engine đã gác `util_reportable && grade === 'GOOD'`); util 0 đo được
 * là một phép đo THẬT: vào nhóm "dưới 40%" và in "0%" — AC-08 hai chiều.
 */
export function stationContextModel(result: SimulationResult): StationContextModel {
  const stations = result.context.stationsWithin5km;
  const kind = result.screening.evidence.kind;
  const total = stations.length;
  const within500 = stations.filter((s) => s.euclidM <= 500).length;
  const within2km = stations.filter((s) => s.euclidM <= 2000).length;
  const high = stations.filter((s) => s.util !== null && s.util >= 0.4).length;
  const low = stations.filter((s) => s.util !== null && s.util < 0.4).length;
  const unassessed = total - high - low;
  const measured = high + low;

  // §7 — Xã nhấn mốc 2 km (ngưỡng chính sách); Phường/Đặc khu nhấn 500 m, mốc 2 km chỉ là
  // bối cảnh. Kind không xác định thì không gọi mốc nào là "ngưỡng".
  let radiusLine: string;
  if (kind === "XA") {
    radiusLine = `Trong 2 km (ngưỡng Xã): ${formatCount(within2km)} trạm · Trong 5 km: ${formatCount(total)} trạm`;
  } else if (kind === "PHUONG" || kind === "DAC_KHU") {
    radiusLine = `Trong 0,5 km (ngưỡng ${COMMUNE_KIND_LABEL[kind]}): ${formatCount(
      within500,
    )} trạm · Trong 2 km (bối cảnh, không phải ngưỡng): ${formatCount(
      within2km,
    )} trạm · Trong 5 km: ${formatCount(total)} trạm`;
  } else {
    radiusLine = `Trong 2 km: ${formatCount(within2km)} trạm · Trong 5 km: ${formatCount(total)} trạm`;
  }

  const segments: StationContextSegment[] = (
    [
      { key: "high" as const, count: high, label: `${formatCount(high)} cao tải ≥40%` },
      { key: "low" as const, count: low, label: `${formatCount(low)} dưới 40%` },
      {
        key: "unassessed" as const,
        count: unassessed,
        label: `${formatCount(unassessed)} chưa đánh giá`,
      },
    ]
  )
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, share: total > 0 ? s.count / total : 0 }));

  const measuredLine = `Có phép đo hợp lệ: ${formatCount(measured)}/${formatCount(total)} trạm`;

  // Engine đã sort theo euclidM tăng dần, nhưng không dựa vào điều đó ở đây.
  let nearestLine: string | null = null;
  if (total > 0) {
    const nearest = stations.reduce((a, b) => (b.euclidM < a.euclidM ? b : a));
    const measure =
      nearest.util !== null
        ? `mức tải ${formatUtilPercent(nearest.util)}%`
        : "chưa có phép đo hợp lệ";
    nearestLine = `Trạm gần nhất: ${nearest.name} (${formatKm(nearest.euclidM)} · ${measure})`;
  }

  const ariaLabel = `Bối cảnh mạng trạm 5 km: ${formatCount(total)} trạm đủ điều kiện; ${formatCount(
    measured,
  )} có phép đo hợp lệ, gồm ${formatCount(high)} cao tải từ 40% trở lên và ${formatCount(
    low,
  )} dưới 40%; ${formatCount(unassessed)} chưa đánh giá được.`;

  return {
    counts: { total, within500, within2km, high, low, unassessed, measured },
    radiusLine,
    segments,
    measuredLine,
    nearestLine,
    ariaLabel,
  };
}
