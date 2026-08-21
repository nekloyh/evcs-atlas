/**
 * UX redesign vòng 2.1 — Simulation Panel (ui/SimulationPanel.tsx)
 *
 * IA §3 của docs/UX_SIMULATION_DECISION_CONTEXT_SPEC.md: banner sàng lọc (V1) → hero
 * outcome tiles (V2) → phần chưa thể kết luận → biểu đồ Trước/Sau + delta (V3) → thanh
 * bối cảnh mạng trạm 5 km (V4) → năm disclosure đóng. "Khu vực liên quan" và "Cần kiểm
 * tra tiếp" chuyển từ section chính (IA vòng 1 §8.1) xuống disclosure — một ĐẢO NGƯỢC
 * có chủ đích, đổi lấy fold cho V1–V3 (spec §0.3).
 *
 * Mọi câu chữ đến từ `simulation/presenter.ts` — component này KHÔNG viết câu nào, và
 * KHÔNG tính con số nào. Đó là điều kiện để bộ test `node --test` (không dịch JSX) khoá
 * được copy deck bằng giá trị thật thay vì bằng phép so chuỗi trên mã nguồn.
 *
 * Reference: docs/UX_SIMULATION_DECISION_CONTEXT_SPEC.md §3, §5, §6, §9
 *            docs/UX_SIMULATION_REDESIGN_SPEC.md §8–§15 (vòng 1 — phần không bị ghi đè)
 *            docs/PHASE6_LOCAL_SIMULATION.md §1 (thuật toán — KHÔNG đổi)
 */

import * as React from "react";
import { AlertTriangle, CheckCircle, HelpCircle, X, XCircle } from "lucide-react";

import { AtlasSurfaceHeader } from "../components/atlas/AtlasSurface";
import { SIM_TAG_LABEL } from "../simulation/types";
import type { SimulationResult } from "../simulation/types";
import { useSimulationStore, type SimulationErrorKind } from "../simulation/store";
import { useStore } from "../state/store";
import {
  CLAIMS_ABSENT,
  DELETE_CANDIDATE_LABEL,
  DISTRIBUTION_HEADING,
  HERO_EYEBROW,
  LOADING_DETAIL,
  LOADING_TITLE,
  LOCALITY_KEY_NOTE,
  METHOD_SUMMARY,
  NEXT_EVIDENCE_HEADING,
  NEXT_EVIDENCE_ITEMS,
  NO_NEARBY_STATION,
  PANEL_TITLE,
  QUERY_ERROR_DISMISS,
  QUERY_ERROR_RETRY,
  RULE_EYEBROW,
  SCOPE_LINE,
  STATION_CONTEXT_EMPTY,
  STATION_CONTEXT_HEADING,
  STATION_CONTEXT_TAG,
  TECHNICAL_SUMMARY,
  UNRESOLVED_HEADING,
  distributionModel,
  formatCount,
  formatDistance,
  heroTilesModel,
  localityDisclosureSummary,
  localityFocusView,
  localityLine,
  localityRowLabel,
  localityRowValue,
  medianSentences,
  methodBody,
  missingLocalityNotice,
  nearbyStationsSummary,
  outcomeModel,
  ruleBanner,
  stationContextModel,
  technicalRows,
  unresolvedNotices,
  type RuleBannerIcon,
} from "../simulation/presenter";
import { SimulationDistribution } from "./SimulationDistribution";
import { simulationAreaBbox } from "../simulation/geometry";
import { THEME_PALETTES } from "../viz/palette";

export interface SimulationPanelProps {
  result: SimulationResult | null;
  error: string | null;
  errorKind?: SimulationErrorKind | null;
  /** Tên tỉnh của gói đang mở — để header còn gọi được vị trí trong lúc CHƯA có kết quả. */
  provinceName?: string | null;
  onClose: () => void;
  onRetry?: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Nút đóng chỉ dựng trên desktop — mobile dùng cử chỉ đóng của bottom sheet. */
  showCloseButton?: boolean;
}

const HEADING_ID = "sim-panel-title";

/** §9.1 — icon là MỘT trong ba kênh mã hoá trạng thái banner (icon + nhãn + số). */
const BANNER_ICON: Record<RuleBannerIcon, React.ComponentType<{ className?: string }>> = {
  pass: CheckCircle,
  conditional: AlertTriangle,
  fail: XCircle,
  unknown: HelpCircle,
};

/**
 * SỐ và ĐƠN VỊ của nó là MỘT khối, không phải hai từ.
 *
 * Ở 320–340 px các dòng dữ kiện của panel ngắt đúng vào giữa chúng — đo được ở hai chỗ:
 * dòng cự ly của banner ngắt thành "… cao hơn ngưỡng 1,1" / "km", và dòng trạm gần nhất
 * thành "… Hoàng Quốc Việt (0,4" / "km · mức tải 53%)". Một con số bị chẻ khỏi đơn vị thì
 * ba số của phép kiểm không còn đọc được như một phép trừ nữa.
 *
 * Hàm này KHÔNG viết chữ: nó chỉ bọc các token đã có trong `whitespace-nowrap`, nên câu
 * chữ vẫn thuộc về `presenter.ts` và phần còn lại của dòng vẫn ngắt tự nhiên (bọc cả mệnh
 * đề thì dòng bán kính của V4 nở từ 2 lên 3 dòng — đã thử và bỏ).
 */
const UNIT_TOKEN = /(\(?\d[\d.,/]*\s?(?:km|m|kW|%|người|trạm|ô|cổng)(?![\p{L}\d]))/gu;

function keepUnits(text: string): React.ReactNode[] {
  return text.split(UNIT_TOKEN).map((chunk, i) =>
    i % 2 === 1 ? (
      <span key={`${i}-${chunk}`} className="whitespace-nowrap">
        {chunk}
      </span>
    ) : (
      chunk
    ),
  );
}

/** Chuyển màu đã đăng ký thành lớp phủ nhẹ; không tạo thêm hex/ramp trong UI. */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * QA vòng 2.1b — MỘT ramp đã đăng ký cho mỗi phán quyết, và BA vai trò lấy từ BA bậc của
 * chính ramp ấy: chữ + icon = bậc 6 (đủ sẫm để làm CHỮ), nét nhấn = bậc 4, nền wash =
 * CÙNG bậc 4 ở 9%.
 *
 * Bản trước lấy nét từ bậc 4 nhưng wash từ bậc 2 — ở ramp `demand` hai bậc ấy cách nhau
 * 21° hue (đo trên trình duyệt: nét `rgb(194,40,25)` trên nền `rgba(249,136,39,.1)`), nên
 * banner KHÔNG ĐẠT là một nét ĐỎ trên một nền CAM: hai màu, một trạng thái.
 *
 * Màu vẫn chỉ là kênh phụ: icon + nhãn chữ + ba số cùng đơn vị vẫn mã hoá đủ trạng thái
 * (§9.1). Nhãn dùng bậc 6 chứ không dùng bậc 4 vì bậc 4 là màu ĐỒ HOẠ (cổng 3:1) còn đây
 * là CHỮ (cổng 4,5:1) — và vì một nhãn đỏ tươi đọc thành "lỗi hệ thống", thứ mà một kết
 * quả phép kiểm không phải.
 */
function bannerTone(ramp: { hex: readonly string[] }): {
  accent: string;
  wash: string;
  ink: string;
} {
  return {
    accent: ramp.hex[4]!,
    wash: withAlpha(ramp.hex[4]!, 0.09),
    ink: ramp.hex[6]!,
  };
}

const BANNER_TONE: Record<RuleBannerIcon, { accent: string; wash: string; ink: string }> = {
  pass: bannerTone(THEME_PALETTES["urban-context"]),
  conditional: bannerTone(THEME_PALETTES.screening),
  fail: bannerTone(THEME_PALETTES.demand),
  // KHÔNG KẾT LUẬN ĐƯỢC không phải một phán quyết ⇒ KHÔNG một sắc nào: nét mực mờ trên
  // nền basemap. Đồng thời trả ramp `accessibility` lại cho V3, chỗ duy nhất trong panel
  // mà màu ấy có nghĩa — CỰ LY.
  unknown: {
    accent: "var(--color-ink-muted)",
    wash: "var(--color-basemap)",
    ink: "var(--color-ink-2)",
  },
};

/** V4 dùng đúng ramp `utilization`: đậm = cao tải, nhạt = dưới 40%; null vẫn vô sắc. */
const SEGMENT_STYLE: Record<string, React.CSSProperties> = {
  high: { backgroundColor: THEME_PALETTES.utilization.hex[4] },
  low: { backgroundColor: THEME_PALETTES.utilization.hex[0] },
  unassessed: {
    backgroundColor: "var(--color-basemap)",
    border: "1px dashed var(--color-ink-muted)",
  },
};

/**
 * Vai trò chữ của panel. Ba vai trò khác nhau từng dùng CHUNG đúng một `.eyebrow` —
 * tiêu đề tiết, nhãn ô hero và tag xuất xứ đều đo được 10px/600/0,8px/`#6f6d68`, tức là
 * KHÔNG có phân cấp nào giữa "đây là tiết gì" và "số này ở đâu ra".
 *
 * Tách bằng CÂN NẶNG + GIÃN + MỰC chứ không bằng cỡ chữ (thang sáu vai trò không đổi):
 *   · tiêu đề tiết  600 · 0,08em · `ink-2`     — đậm nhất trong ba, và tối nhất
 *   · nhãn ô hero   600 · 0,08em · `ink-muted` — `.eyebrow` nguyên trạng
 *   · tag xuất xứ   500 · 0,06em · `ink-muted` — nhẹ nhất, và luôn nằm bên phải
 */
const HEADING_CLASS = "m-0 text-note font-semibold uppercase tracking-[0.08em] text-ink-2";
const TAG_CLASS = "text-note font-medium uppercase tracking-[0.06em] text-ink-muted";

/** Tiết — lề và cách kẻ theo §17 vòng 1: hairline, không một nền riêng cho mỗi tiết. */
function Section({
  heading,
  tag,
  block,
  children,
  last = false,
}: {
  heading?: string;
  tag?: string;
  /** Mốc đo của witness (AC-01): `data-sim-block="v1|v2|v3|v4"`. */
  block?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  // Bốn khối V1–V4 dùng py-1: ngân sách fold ở 1280×800 là 522 px scroller, và hàng
  // eyebrow mới của V1 (QA vòng 2.1b) tiêu 16 px trong đó. Phần nén nằm ở khoảng thở —
  // hairline giữa hai tiết mới là thứ tách chúng, không phải 4 px đệm thêm — chứ không
  // nằm ở nội dung.
  return (
    <section
      data-sim-block={block}
      className={`px-3 ${block ? "py-1" : "py-3"} ${last ? "" : "border-b border-hairline"}`}
    >
      {heading !== undefined && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className={HEADING_CLASS}>{heading}</h2>
          {tag && <span className={`${TAG_CLASS} shrink-0`}>{tag}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function Shell({
  provinceName,
  locality,
  onClose,
  showCloseButton,
  headingRef,
  scrollRef,
  children,
}: {
  provinceName: string | null;
  locality: string | null;
  onClose: () => void;
  showCloseButton: boolean;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <>
      <AtlasSurfaceHeader className="items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <h1
            id={HEADING_ID}
            ref={headingRef}
            tabIndex={-1}
            className="m-0 truncate text-title font-semibold text-ink outline-none"
          >
            {PANEL_TITLE}
          </h1>
          {/* Địa danh, KHÔNG toạ độ: §10.2 cấm toạ độ trong heading. `commune_name` đã mang
              sẵn tiền tố loại đơn vị nên ở đây không ghép thêm gì. */}
          <p className="m-0 mt-0.5 text-body text-ink-2">
            {locality ??
              (provinceName ? `Vị trí trong ${provinceName}` : "Đang xác định vị trí…")}
          </p>
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            title={`${DELETE_CANDIDATE_LABEL} (Esc)`}
            aria-label={DELETE_CANDIDATE_LABEL}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-xs border border-transparent text-ink-2 transition-colors hover:border-hairline hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </AtlasSurfaceHeader>

      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* Dòng phạm vi là chú thích CỦA CẢ THẺ, không phải dòng đầu của V1: cách nó
            nửa dòng để tag `QUY TẮC L6` ngay dưới không dính vào thành một khối 10 px. */}
        <p className="px-3 pt-1.5 pb-1 text-note text-ink-muted">{SCOPE_LINE}</p>
        {children}
      </div>
    </>
  );
}

export function SimulationPanel({
  result,
  error,
  errorKind = null,
  provinceName = null,
  onClose,
  onRetry,
  headingRef,
  scrollRef,
  showCloseButton = true,
}: SimulationPanelProps): React.JSX.Element {
  const focusedCommune = useSimulationStore((s) => s.focusedCommune);
  const setFocusedCommune = useSimulationStore((s) => s.setFocusedCommune);
  const [showAllAreas, setShowAllAreas] = React.useState(false);
  const localityRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const lastFocusedRow = React.useRef<string | null>(null);

  // §14.4 vòng 1 — Esc SAU khi đưa bản đồ tới một nhóm phải gỡ đúng trạng thái trong
  // cùng, không đóng cả thẻ. Nghe ở pha CAPTURE và `preventDefault` là đủ: cổng Esc của
  // EvidenceCard là `shouldHandleInspectorEscape`, thứ đã từ chối sự kiện bị preventDefault.
  React.useEffect(() => {
    if (!focusedCommune) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      const code = lastFocusedRow.current;
      setFocusedCommune(null);
      if (code) localityRefs.current.get(code)?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focusedCommune, setFocusedCommune]);

  /** Rời con trỏ/tiêu điểm khỏi một hàng: chỉ tắt viền nếu hàng đó chưa được KHOÁ bằng bấm. */
  const releasePreview = React.useCallback(
    (code: string) => {
      if (lastFocusedRow.current !== code) setFocusedCommune(null);
    },
    [setFocusedCommune],
  );

  const focusArea = React.useCallback(
    (h3s: string[], code: string) => {
      const bbox = simulationAreaBbox(h3s);
      if (!bbox) return;
      lastFocusedRow.current = code;
      setFocusedCommune(code);
      const view = useStore.getState().view;
      const card = document.getElementById(HEADING_ID)?.closest("aside");
      const next = localityFocusView(bbox, {
        width: window.innerWidth,
        height: window.innerHeight,
        evidenceWidth: card ? Math.round(card.getBoundingClientRect().width) + 24 : 0,
        chromeLeft: 56,
        chromeBottom: 32,
      });
      // `flyTo(view)` KHÔNG truyền tham số thứ hai: truyền nó sẽ ghi `selection`, và một
      // selection thật xoá ứng viên theo luật một-tiêu-điểm (§14.3). Ngoài chế độ CÂU
      // CHUYỆN, MapView đặt camera bằng `jumpTo`, nên `prefers-reduced-motion` đã được tôn
      // trọng sẵn ở đúng đường này.
      useStore.getState().flyTo({ ...view, lng: next.lng, lat: next.lat, zoom: next.zoom });
    },
    [setFocusedCommune],
  );

  const locality = result ? localityLine(result.candidateContext) : null;
  const shellProps = {
    provinceName,
    locality,
    onClose,
    showCloseButton,
    headingRef,
    scrollRef,
  };

  // F1/F3 chỉ nói vị trí bị từ chối và giữ placement mode; F10 mới có candidate để thử lại.
  if (error) {
    return (
      <Shell {...shellProps}>
        <Section last>
          <div role="alert" className="space-y-2">
            <p className="m-0 text-body font-medium text-ink">{error}</p>
            {errorKind === "query" && (
              <div className="flex gap-2">
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="cursor-pointer rounded-xs border border-hairline bg-basemap px-2 py-1 text-note text-ink transition-colors hover:border-ink"
                  >
                    {QUERY_ERROR_RETRY}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-xs border border-transparent px-2 py-1 text-note text-ink-2 transition-colors hover:border-hairline hover:text-ink"
                >
                  {QUERY_ERROR_DISMISS}
                </button>
              </div>
            )}
          </div>
        </Section>
      </Shell>
    );
  }

  // ── Đang tính. Shell và header giữ kích thước; KHÔNG một con số nào của lượt trước. ──
  if (!result) {
    return (
      <Shell {...shellProps}>
        <Section last>
          <div role="status" aria-live="polite" className="space-y-2">
            <p className="m-0 text-body text-ink">{LOADING_TITLE}</p>
            <p className="m-0 text-note text-ink-muted">{LOADING_DETAIL}</p>
            <div aria-hidden="true" className="space-y-1.5 pt-1">
              {[100, 88, 64].map((w) => (
                <div
                  key={w}
                  className="h-3 rounded-xs bg-basemap motion-safe:animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </Section>
      </Shell>
    );
  }

  const outcome = outcomeModel(result);
  const banner = ruleBanner(result.screening.evidence);
  const tiles = heroTilesModel(result);
  const notices = unresolvedNotices(result);
  const dist = distributionModel(result);
  const medians = medianSentences(result);
  const stationContext = stationContextModel(result);
  const areas = result.areas.named;
  const missingNames = missingLocalityNotice(result);
  const visibleAreas = showAllAreas ? areas : areas.slice(0, 3);
  const stations = result.context.stationsWithin5km;
  const BannerIcon = BANNER_ICON[banner.icon];
  const bannerTone = BANNER_TONE[banner.icon];

  return (
    <Shell {...shellProps}>
      {/* V1 §6.1 — BANNER SÀNG LỌC: kết quả PHÉP KIỂM, đọc trong 1 giây. Trạng thái mã
          hoá ba kênh: icon + nhãn chữ + ba số cùng đơn vị (§9.1), không dựa màu. */}
      {/* Không box lồng: box + padding đẩy badge và dòng cự ly thành hai dòng ở 320 px
          (đo ở witness) — banner được giới hạn bằng chính border của Section. */}
      <Section block="v1">
        {/* Tag xuất xứ đứng TRÊN phán quyết chứ không cạnh nó, và NGOÀI vùng wash. Cùng
            hàng với phán quyết, hai vai trò tranh nhau chỗ: ở 320 px nhãn dài nhất (`ĐẠT
            CÓ ĐIỀU KIỆN: CẦN SẠC DC`, đo 192 px ở 12 px) cộng tag 61 px cộng icon chỉ còn
            9 px dư — và hai chuỗi HOA cùng hàng lệch baseline 2 px vì `items-start` xếp
            theo MÉP TRÊN của hai hộp dòng cao 17 px và 14 px.
            Ngoài wash vì mực mờ trên nền đã nhuộm 9% chỉ còn 4,26:1 (đo trên nền
            composite ở trạng thái KHÔNG ĐẠT) — dưới cổng 4,5:1 của §4e. */}
        <div className={`${TAG_CLASS} mb-0.5`}>
          {SIM_TAG_LABEL[result.screening.tag]} {RULE_EYEBROW}
        </div>
        <div
          data-sim-banner
          className="-mx-1.5 border-l-2 px-1.5 py-0.5"
          style={{
            borderLeftColor: bannerTone.accent,
            backgroundColor: bannerTone.wash,
          }}
        >
          <div
            className="flex items-center gap-1.5 text-title font-semibold tracking-[0.02em]"
            style={{ color: bannerTone.ink }}
            data-sim-badge
          >
            {/* Icon mang ĐÚNG một sắc với nhãn: cùng bậc 6 của cùng ramp. */}
            <BannerIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {banner.badge}
          </div>
          {banner.distanceLine && (
            <p className="m-0 mt-1 text-body tabular-nums text-ink">
              {keepUnits(banner.distanceLine)}
            </p>
          )}
          {banner.notes.map((n) => (
            <p key={n} className="m-0 mt-1 text-note text-ink-2">
              {n}
            </p>
          ))}
        </div>
        {/* Câu miễn trách NGOÀI vùng wash: nó đúng như nhau ở cả bốn trạng thái, nên nó
            không được nhuộm màu của trạng thái nào. Wash dừng đúng ở phạm vi phán quyết. */}
        <p className="m-0 mt-1.5 text-note text-ink-2">{banner.footer}</p>
      </Section>

      {/* V2 §6.2 — HERO OUTCOME TILES. Hai lớp KHÔNG BAO GIỜ cộng gộp; provenance dính
          theo số vì hero là chỗ bị chụp màn hình đem đi họp. Câu outcome vòng 1 giữ ở
          `aria-live` (sr-only) để trình đọc nhận một câu, không một chuỗi mảnh tile. */}
      <Section heading={HERO_EYEBROW} tag={SIM_TAG_LABEL[result.after.tag]} block="v2">
        <p className="sr-only m-0" role="status" aria-live="polite" aria-atomic="true">
          {outcome.text}
        </p>
        <div className="grid grid-cols-2 gap-2" aria-hidden="true">
          {tiles.map((t) => (
            <div
              key={t.label}
              data-sim-hero={t.emphasis}
              // Hai ô KHÔNG mang sắc. Trước đây ô "cải thiện" mượn ramp `urban-context`
              // (sắc của phán quyết ĐẠT) và ô "sai số" mượn `accessibility` (sắc của CỰ
              // LY ở V3) — nên ở một vị trí KHÔNG ĐẠT, panel dựng một ô XANH LÁ "0 người"
              // ngay dưới một banner ĐỎ (đo được ở 21,04400/105,80100). Phân cấp nay đi
              // bằng cỡ số + nét + nền: đặc/mực = đã đo, đứt/mực mờ = còn trong biên.
              className={`rounded-xs border-l-2 px-2 py-1 ${
                t.emphasis === "readout"
                  ? "border-ink bg-basemap"
                  : "border-dashed border-ink-muted bg-transparent"
              }`}
            >
              <div className="eyebrow">{t.label}</div>
              {/* Dòng số dựng bằng INLINE, không bằng flex: `items-baseline` để chiều cao
                  dòng chạy theo cỡ chữ của chính ô đó (đo 28 px ở ô 24 px và 23 px ở ô
                  18 px), nên dòng ghi chú của hai ô lệch nhau 4 px. Strut chung `text-
                  readout` cho cả hai ô đặt MỘT baseline, số nhỏ vẫn ngồi đúng trên đó. */}
              <div className="text-readout">
                <span
                  className={`${
                    t.emphasis === "readout" ? "text-readout" : "text-display"
                  } font-semibold tabular-nums text-ink`}
                >
                  {t.value}
                </span>{" "}
                <span className="text-body tracking-normal text-ink-2">{t.unit}</span>
              </div>
              <div className="text-note tracking-normal text-ink-muted">
                {keepUnits(t.note)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* §3 — notices giữ NGAY SAU khối outcome: hai tile "0 người" mà không notice sẽ
          đọc thành "mô phỏng vô dụng" khi đa số ô không có nền so sánh. */}
      {notices.length > 0 && (
        <Section heading={UNRESOLVED_HEADING}>
          {/* Mỗi notice dài 2–3 dòng ở 320 px; cách đoạn 6 px trên dòng cao 16 px làm hai
              câu dính thành một khối. 8 px = đúng nửa dòng, đủ để tách. */}
          <ul className="m-0 list-none space-y-2 p-0">
            {notices.map((n) => (
              <li key={n} className="text-body text-ink-2">
                {keepUnits(n)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* V3 §6.3 — chart Trước/Sau LUÔN trực diện (AC-02), delta theo dải, trung vị ở
          dạng câu — CẤM vạch trung vị trên bar (trục dân số ≠ trục cự ly). */}
      <Section heading={DISTRIBUTION_HEADING} block="v3">
        {/* V3 có HAI xuất xứ nên nó không nhét vừa ô tag bên phải tiêu đề; nó ở lại dưới
            tiêu đề nhưng mang ĐÚNG vai trò tag (500 · 0,06em · `ink-muted` · HOA) thay vì
            trộn chữ thường với chữ hoa trong một dòng như trước. */}
        <p className={`${TAG_CLASS} m-0 -mt-1 mb-1 block`}>
          Trước: {SIM_TAG_LABEL[result.before.tag]} · Sau: {SIM_TAG_LABEL[result.after.tag]}
        </p>
        <SimulationDistribution model={dist} />
        {/* Hai câu trung vị là HAI phép đọc (một TÍNH TOÁN, một ƯỚC LƯỢNG): gộp chúng vào
            một đoạn ba dòng buộc mắt tự tách. Mỗi câu một đoạn, cách nhau nửa dòng. */}
        <div className="mt-1 space-y-0.5 text-body text-ink-2" data-sim-medians>
          {medians.map((m) => (
            <p key={m} className="m-0">
              {keepUnits(m)}
            </p>
          ))}
        </div>
      </Section>

      {/* V4 §6.4 — THANH BỐI CẢNH MẠNG TRẠM 5 KM. Phân đoạn = 0 không render (AC-03);
          util 0% ĐO ĐƯỢC in "0%" (AC-08). Được phép bắt đầu dưới mép fold ở 1280×800. */}
      <Section heading={STATION_CONTEXT_HEADING} tag={SIM_TAG_LABEL.CALCULATED} block="v4">
        {stationContext.counts.total === 0 ? (
          <p className="m-0 text-note text-ink-muted">{STATION_CONTEXT_EMPTY}</p>
        ) : (
          <div className="space-y-1.5">
            <p className="m-0 text-note tabular-nums text-ink-2">
              {keepUnits(stationContext.radiusLine)}
            </p>
            <div
              role="img"
              aria-label={stationContext.ariaLabel}
              data-sim-segbar
              className="flex h-3.5 overflow-hidden rounded-xs border border-hairline bg-basemap"
            >
              {stationContext.segments.map((seg, i) => (
                <div
                  key={seg.key}
                  data-sim-seg={seg.key}
                  className={i > 0 ? "border-l border-panel" : ""}
                  // Nhãn đã tách xuống chú giải: bar trở lại đúng tỷ lệ count/total, và
                  // phân đoạn hẹp không còn cắt chữ. Segment 0 vẫn vắng khỏi DOM (AC-03).
                  style={{
                    ...SEGMENT_STYLE[seg.key],
                    flexGrow: seg.count,
                    flexBasis: 0,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5" data-sim-seglegend>
              {stationContext.segments.map((seg) => (
                <span
                  key={seg.key}
                  className="flex items-center gap-1 text-note tabular-nums text-ink-2"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-[1px]"
                    style={SEGMENT_STYLE[seg.key]}
                  />
                  {seg.label}
                </span>
              ))}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="m-0 text-note tabular-nums text-ink-2">
                {keepUnits(stationContext.measuredLine)}
              </p>
              {stationContext.counts.measured > 0 && (
                <span className={`${TAG_CLASS} shrink-0`}>{STATION_CONTEXT_TAG}</span>
              )}
            </div>
            {stationContext.nearestLine && (
              // Nét trái + mực chính là đủ để dòng này nổi lên khỏi dải chú thích 10 px
              // quanh nó; thêm `font-medium` nữa thì nó đọc thành một TIÊU ĐỀ mới ở giữa
              // tiết — trong khi nó là một dữ kiện, không phải một đề mục.
              <p
                className="m-0 border-l-2 border-hairline pl-2 text-body text-ink"
                data-sim-nearest
              >
                {keepUnits(stationContext.nearestLine)}
              </p>
            )}
          </div>
        )}
      </Section>

      {/* §3 — NĂM disclosure, đóng mặc định. "Khu vực liên quan" và "Cần kiểm tra tiếp"
          chuyển xuống đây từ section chính vòng 1 (đảo ngược có khai báo, §0.3). */}
      <Section last>
        <div className="space-y-2">
          <details>
            <summary className="cursor-pointer text-body text-ink-2 hover:text-ink">
              {localityDisclosureSummary(areas.length)}
            </summary>
            <div className="mt-1.5">
              <p className="m-0 mb-2 text-note text-ink-muted">{LOCALITY_KEY_NOTE}</p>
              {areas.length === 0 ? (
                missingNames && <p className="m-0 text-note text-ink-muted">{missingNames}</p>
              ) : (
                <>
                  <ul className="m-0 list-none space-y-1 p-0">
                    {visibleAreas.map((a) => (
                      <li key={a.communeCode}>
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) localityRefs.current.set(a.communeCode, el);
                            else localityRefs.current.delete(a.communeCode);
                          }}
                          aria-label={localityRowLabel(a)}
                          // Rê/tiêu điểm là XEM TRƯỚC (rời con trỏ thì tắt); bấm là KHOÁ
                          // (giữ tới khi Esc hoặc tới lượt khoá khác).
                          onPointerEnter={() => setFocusedCommune(a.communeCode)}
                          onPointerLeave={() => releasePreview(a.communeCode)}
                          onFocus={() => setFocusedCommune(a.communeCode)}
                          onBlur={() => releasePreview(a.communeCode)}
                          onClick={() => focusArea(a.h3s, a.communeCode)}
                          className={`flex w-full min-w-0 cursor-pointer items-baseline justify-between gap-2 rounded-xs border px-1.5 py-1 text-left transition-colors ${
                            focusedCommune === a.communeCode
                              ? "border-ink bg-basemap"
                              : "border-hairline bg-transparent hover:bg-basemap/60"
                          }`}
                        >
                          <span className="min-w-0 truncate text-body text-ink">
                            {a.communeName}
                          </span>
                          <span className="shrink-0 text-note tabular-nums text-ink-2">
                            {localityRowValue(a)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {areas.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllAreas(!showAllAreas)}
                      aria-expanded={showAllAreas}
                      className="mt-1.5 cursor-pointer text-note text-ink-2 underline underline-offset-2 hover:text-ink"
                    >
                      {showAllAreas
                        ? "Thu gọn danh sách"
                        : `Xem tất cả ${formatCount(areas.length)} khu vực`}
                    </button>
                  )}
                  {missingNames && (
                    <p className="m-0 mt-2 text-note text-ink-muted">{missingNames}</p>
                  )}
                </>
              )}
            </div>
          </details>

          <details>
            <summary className="cursor-pointer text-body text-ink-2 hover:text-ink">
              {NEXT_EVIDENCE_HEADING}
            </summary>
            <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0">
              {NEXT_EVIDENCE_ITEMS.map((item) => (
                <li key={item} className="text-body text-ink-2">
                  {item}
                </li>
              ))}
            </ul>
          </details>

          <details>
            {/* `flex` phải nằm ở SPAN bên trong, không ở `<summary>`: `display:flex` xoá
                `list-item` nên mũi ▸ biến mất — đo được ở witness vòng 1. */}
            <summary className="cursor-pointer text-body text-ink-2 hover:text-ink">
              <span className="inline-flex w-[calc(100%-1rem)] items-baseline justify-between gap-2 align-top">
                <span>{nearbyStationsSummary(stations.length)}</span>
                {stations.some((station) => station.util !== null) && (
                  <span className={`${TAG_CLASS} shrink-0`}>{STATION_CONTEXT_TAG}</span>
                )}
              </span>
            </summary>
            {stations.length === 0 ? (
              <p className="m-0 mt-1.5 text-note text-ink-muted">{NO_NEARBY_STATION}</p>
            ) : (
              // Danh sách trạm cuộn TRONG chính nó: ở nội đô một vị trí có 40–59 trạm
              // trong 5 km, mở disclosure ra là đẩy mọi thứ khác ra khỏi tầm cuộn của
              // thẻ. `tabIndex` + `role="group"` vì một vùng cuộn phải tới được bằng bàn
              // phím (WCAG 2.1.1); nhãn lấy đúng câu của summary, không viết câu mới.
              <div
                className="custom-scrollbar mt-1.5 max-h-56 overflow-y-auto"
                tabIndex={0}
                role="group"
                aria-label={nearbyStationsSummary(stations.length)}
              >
                <ul className="m-0 list-none space-y-1 p-0">
                  {stations.map((st) => (
                    <li
                      key={st.code}
                      id={`sim-station-${st.code}`}
                      tabIndex={-1}
                      className="rounded-xs border border-hairline px-1.5 py-1 outline-none focus-visible:border-ink"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-body text-ink" title={st.name}>
                          {st.name}
                        </span>
                        <span className="shrink-0 text-note tabular-nums text-ink-2">
                          {formatDistance(st.euclidM)}
                        </span>
                      </div>
                      <p className="m-0 text-note text-ink-muted">
                        {st.nPorts !== null
                          ? `${formatCount(st.nPorts)} cổng`
                          : "chưa rõ số cổng"}{" "}
                        ·{" "}
                        {st.powerKw !== null
                          ? `${st.powerKw.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kW`
                          : "chưa rõ công suất"}{" "}
                        · {/* util `null` KHÔNG in thành 0% — §8; util 0 ĐO ĐƯỢC in "0%". */}
                        {st.util !== null
                          ? `mức sử dụng ${(st.util * 100).toLocaleString("vi-VN", {
                              maximumFractionDigits: 0,
                            })}%`
                          : "chưa có phép đo đủ điều kiện"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>

          <details>
            <summary className="cursor-pointer text-body text-ink-2 hover:text-ink">
              {METHOD_SUMMARY}
            </summary>
            <div className="mt-1.5 space-y-1.5">
              {methodBody(result).map((p) => (
                <p key={p.slice(0, 24)} className="m-0 text-note text-ink-2">
                  {p}
                </p>
              ))}
              <p className="m-0 text-note text-ink-muted">{CLAIMS_ABSENT}</p>
              <p className="m-0 text-note text-ink-muted">
                {SIM_TAG_LABEL.CALCULATED}: gộp từ cột đã công bố. {SIM_TAG_LABEL.ESTIMATED}:
                heuristic hình học của phiên này. {SIM_TAG_LABEL.RULE}: đầu ra của quy tắc sàng
                lọc, không phải số đo.
              </p>
            </div>
          </details>

          <details>
            <summary className="cursor-pointer text-body text-ink-2 hover:text-ink">
              {TECHNICAL_SUMMARY}
            </summary>
            <dl className="m-0 mt-1.5 space-y-1">
              {technicalRows(result).map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-note text-ink-2">{row.label}</dt>
                  <dd
                    className={`m-0 min-w-0 truncate text-note text-ink ${
                      row.mono ? "font-mono" : ""
                    }`}
                    title={row.value}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </Section>
    </Shell>
  );
}
