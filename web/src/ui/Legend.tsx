import {
  constantShort,
  polarityNote,
  STATION_OCC_FIELD,
  unitNoun,
  unitSentence,
  type FieldMeta,
  type RuntimeCoverage,
} from "../fields";
import { pct, type Manifest } from "../data/manifest";
import { SURFACE_CELL_M } from "../data/queries";
import { useStore } from "../state/store";
import { activeCellFilter } from "../story/scenes";
import { HEX_MIN_ZOOM, hexPixelWidth, planFor } from "../viz/render-plan";
import { themeFor } from "../viz/theme";
import {
  HATCH_HEX,
  formatBreak,
  getThemePalette,
  rampFor,
  type Scale,
} from "../viz/palette";
import { DEMAND_SUPPLY_RGB } from "../viz/demand";

/**
 * Dải legend ngang — DESIGN.md §3b: swatch dán sát nhau không gap, giá trị in ĐÈ LÊN
 * swatch, mực đổi theo §4c. Số swatch = số bậc THẬT, không độn cho đủ 7 (§6a quy tắc 3).
 *
 * Nhãn bậc lấy từ cùng một `Scale` mà bản đồ dùng, nên legend không thể lệch với màu ô.
 */
export function Legend({
  field,
  scale,
  manifest,
  runtime,
  surfaceBreaks,
  variant = "inline",
}: {
  field: FieldMeta;
  scale: Scale | null;
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  surfaceBreaks: number[];
  /** Inline is the legacy full-width strip; floating preserves all semantics in a wrapped stack. */
  variant?: "inline" | "floating";
}) {
  const floating = variant === "floating";
  const zoom = useStore((s) => s.view.zoom);
  const setView = useStore((s) => s.setView);
  const view = useStore((s) => s.view);
  const paintOn = useStore((s) => s.paintOn);
  const setPaintOn = useStore((s) => s.setPaintOn);
  const scene = useStore((s) => s.scene);
  const beatId = useStore((s) => s.beat);
  const demandRepresentation = useStore((s) => s.demandRepresentation);
  // Legend mô tả CHÍNH mặt tô đang vẽ, nên nó phải đi qua đúng một cửa với `MapView` —
  // xem `planFor`. Trước đây hai bên tự gọi `renderPlan` và bỏ sót `filtered`, cho ra một
  // dải chú giải "không vẽ vì zoom" trên một bản đồ đang vẽ ô H3.
  const plan = planFor({
    readAs: field.readAs,
    hasSurface: Boolean(field.surface),
    zoom,
    filtered: Boolean(activeCellFilter(scene, beatId)),
    inStory: scene !== null,
  });

  // Nút thứ ba cạnh Ô H3 | XÃ vừa tắt — nói ra, không để dải legend mô tả một mặt tô
  // không còn trên bản đồ. Đứng TRƯỚC nhánh "none" vì đây là một lựa chọn khác hẳn: ô nhỏ
  // quá để đọc là một sự thật về ZOOM, còn đây là một sự thật về Ý MUỐN của người xem.
  if (!paintOn) {
    return (
      <div className={floating ? "flex gap-2 text-[11px] text-ink-2" : "flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3 text-[11px]"}>
        <span className="text-ink-2">Mặt tô đang TẮT — chỉ còn nền và overlay.</span>
        <button
          onClick={() => setPaintOn(true)}
          className="cursor-pointer border border-hairline px-2 py-0.5 hover:bg-basemap"
        >
          bật lại
        </button>
        <span className="ml-auto text-ink-muted">{unitSentence(field)}</span>
      </div>
    );
  }

  const theme = themeFor(field, demandRepresentation);
  const themePalette = getThemePalette(theme);

  const demandP1 = scene === null && field.id === "population" && field.readAs === "cell";
  if (demandP1 && (demandRepresentation === "density" || demandRepresentation === "hybrid")) {
    return (
      <div className={floating ? "flex flex-col gap-2 text-[11px]" : "flex h-10 shrink-0 items-stretch border-b border-hairline text-[11px]"}>
        <div className="flex flex-wrap">
          {surfaceBreaks.map((b, i) => {
            const k = Math.round((i / Math.max(surfaceBreaks.length - 1, 1)) * (themePalette.hex.length - 1));
            return <div key={b} className="flex min-w-20 items-center justify-center px-2 tabular-nums" style={{ background: themePalette.hex[k], color: themePalette.ink[k] }}>{formatBreak(b)}</div>;
          })}
        </div>
        <div className="flex items-center px-3 text-ink-2">density định lượng · người/ô gộp {(SURFACE_CELL_M / 1000).toLocaleString("vi-VN")} km</div>
        {demandRepresentation === "hybrid" && <div className="flex items-center px-3 text-cold-2">chấm: √ số cổng, 3–15 px · vòng xám: chưa biết cổng</div>}
        <div className={floating ? "text-ink-muted" : "ml-auto flex items-center px-3 text-ink-muted"}>gộp {SURFACE_CELL_M} m · ngưỡng thật</div>
      </div>
    );
  }

  if (demandP1 && demandRepresentation === "intensity") {
    return <div className={floating ? "text-[11px] text-ink-2" : "flex h-10 shrink-0 items-center border-b border-hairline px-3 text-[11px] text-ink-2"}>intensity hotspot · màu phụ thuộc bán kính 42 px và zoom · chỉ để khám phá pattern, <strong className="ml-1">không so sánh định lượng</strong></div>;
  }

  if (demandP1 && demandRepresentation === "bivariate") {
    return (
      <div className={floating ? "flex flex-wrap items-center gap-2 text-[11px] text-ink-2" : "flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3 text-[11px] text-ink-2"}>
        <span>cầu (hàng) × số cổng (cột), tối đa 3 nhóm/trục</span>
        <span className="grid h-7 w-7 grid-cols-3 grid-rows-3 border border-hairline">
          {DEMAND_SUPPLY_RGB.flatMap((row, r) => row.map((c, col) => <i key={`${r}-${col}`} style={{ background: `rgb(${c.join(",")})` }} />))}
        </span>
        <span className="text-ink-muted">so sánh exploratory · không phải opportunity score</span>
      </div>
    );
  }

  if (demandP1 && demandRepresentation === "extrusion") {
    return <div className={floating ? "text-[11px] text-ink-2" : "flex h-10 shrink-0 items-center border-b border-hairline px-3 text-[11px] text-ink-2"}>focused 3D · màu và độ cao cùng mã hoá dân số · độ cao dùng √(dân số), cắt ở 2.500 m để đọc được</div>;
  }

  // Không vẽ được thì NÓI RA, không để dải legend đứng đó mô tả một bản đồ không tồn tại.
  if (plan.paint === "none") {
    return (
      <div className={floating ? "flex flex-wrap gap-2 text-[11px]" : "flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3 text-[11px]"}>
        <span className="text-ink-2">
          Ô H3 rộng ~{Math.round(hexPixelWidth(zoom))} px ở mức phóng này — quá nhỏ để đọc,
          nên không vẽ. Đó là texture, không phải bản đồ.
        </span>
        <button
          onClick={() => setView({ ...view, zoom: HEX_MIN_ZOOM })}
          className="cursor-pointer border border-hairline px-2 py-0.5 hover:bg-basemap"
        >
          phóng tới z{HEX_MIN_ZOOM}
        </button>
        <span className="ml-auto text-ink-muted">{unitSentence(field)}</span>
      </div>
    );
  }

  // Mặt liên tục có bộ ngưỡng RIÊNG — nó là đại lượng khác (người trên ô gộp 1,5 km), nên
  // in ngưỡng của choropleth ở đây sẽ là in số của một bản đồ khác.
  if (plan.paint === "surface") {
    return (
      <div className={floating ? "flex flex-col gap-2 text-[11px]" : "flex h-10 shrink-0 items-stretch border-b border-hairline text-[11px]"}>
        <div className="flex flex-wrap">
          {surfaceBreaks.map((b, i) => {
            const k = Math.round((i / Math.max(surfaceBreaks.length - 1, 1)) * (themePalette.hex.length - 1));
            return (
              <div
                key={b}
                className="flex min-w-20 items-center justify-center px-2 tabular-nums"
                style={{ background: themePalette.hex[k], color: themePalette.ink[k] }}
              >
                {formatBreak(b)}
              </div>
            );
          })}
        </div>
        <div className="flex items-center px-3 text-ink-2">
          mặt độ cầu · người trên ô gộp {(SURFACE_CELL_M / 1000).toLocaleString("vi-VN")} km
        </div>
        {/* Cạnh ô gộp là GIẢ ĐỊNH KHAI BÁO, không phải số đo — §1b ràng buộc 1. Giấu nó đi
            thì mặt độ trông như một số đo khách quan, mà nó không phải. */}
        <div className={floating ? "text-ink-muted" : "ml-auto flex items-center px-3 text-ink-muted"}>
          gộp {SURFACE_CELL_M} m · giả định khai báo, không phải số đo
        </div>
      </div>
    );
  }

  // Màu ĐÃ áp cực tính (M2.1-B) — cùng một hàm mà bản đồ gọi, nên legend không thể lệch.
  const { colors, inks } = scale ? rampFor(scale, field.polarity, theme) : { colors: [], inks: [] };
  const labels = scale ? labelsFor(scale) : [];
  const noun = unitNoun(field.readAs);
  const cov = coverageOf(field, manifest, runtime);
  // Tổng null tách làm hai. `n_not_applicable` đo lúc chạy (§7c: không gõ tay con số nào);
  // thiếu nó thì tất cả về nhóm "không biết" — thà nói ít hơn là nói sai.
  const nNotApplicable = field.nullSplit ? (cov?.n_not_applicable ?? 0) : 0;
  const nUnknown = Math.max((scale?.nNull ?? 0) - nNotApplicable, 0);

  return (
    <div className={floating ? "flex max-w-full flex-col gap-2 text-[11px]" : "flex h-10 shrink-0 items-stretch border-b border-hairline text-[11px]"}>
      <div className={floating ? "flex flex-wrap" : "flex"}>
        {labels.map((label, i) => (
          <div
            key={label + i}
            className="flex min-w-20 items-center justify-center px-2 tabular-nums"
            style={{ background: rgbCss(colors[i]), color: inks[i] }}
          >
            {label}
          </div>
        ))}
        {/* Bậc cuối là khoảng MỞ. Với phân bố lệch nặng (`ports_per_10k_pop`: bậc cuối bắt
            đầu ở 11, thực tế tới 230,7 — 49× trung vị) thì cả một dải giá trị chung một
            màu, và im lặng ở đây là để người xem tưởng bậc cuối kết thúc ở ngưỡng của nó.
            Chỉ hiện khi thật sự lệch, để nó không thành nhiễu ở 40 trường còn lại. */}
        {scale?.kind === "numeric" && scale.max !== null && scale.breaks.length > 0 &&
          scale.max > scale.breaks[scale.breaks.length - 1]! * 3 && (
            <div className="flex items-center px-2 text-ink-muted tabular-nums">
              … tới {formatBreak(scale.max)}
            </div>
          )}
        {/* Swatch null là VÂN THUẦN — chữ đặt cạnh chứ không đè lên, vì gạch chéo chạy
            qua chữ thì cả hai cùng khó đọc. DESIGN.md §3b.

            Đơn vị ĐƯỜNG đổi swatch thành một NÉT xám, không phải ô vân; đơn vị TRẠM đổi
            thành một CHẤM RỖNG viền xám. Cùng một luật: chú giải phải là đúng cái mark
            trên bản đồ (cùng luật với `ShapeSwatch` của tab LAYER). Một ô vân 45° ở đây sẽ
            hứa một chất liệu mà đường 1px và chấm 6px không mang được — mực thì giữ
            nguyên, vì khái niệm không đổi. */}
        {scale && scale.nNull > 0 && (
          <>
            {field.readAs === "road" ? (
              <div className="flex w-10 items-center justify-center border-l border-hairline">
                <span className="h-0.5 w-7" style={{ background: HATCH_HEX }} />
              </div>
            ) : field.readAs === "station" ? (
              <div className="flex w-10 items-center justify-center border-l border-hairline">
                <span
                  className="block h-3 w-3 rounded-full border-[1.5px]"
                  style={{ borderColor: HATCH_HEX }}
                />
              </div>
            ) : (
              <div
                className="w-10 border-l border-hairline"
                style={{
                  backgroundImage: `repeating-linear-gradient(45deg, ${HATCH_HEX} 0 1px, transparent 1px 6px)`,
                }}
              />
            )}
            <div className="flex items-center px-2 text-ink-2">
              {/* Đơn vị TRẠM nói rõ "ở giờ này": số này là số của GIỜ ĐANG XEM, không phải
                  của cả tuần — nó đổi khi scrubber chạy, và câu chữ phải nói ra điều đó,
                  nếu không nó đọc thành một con số cố định về chất lượng dữ liệu. */}
              {field.nullLabel ?? (field.id === STATION_OCC_FIELD ? "chưa đủ quan sát ở giờ này" : "không đo được")}{" "}
              ({nUnknown.toLocaleString("vi-VN")} {noun})
            </div>
          </>
        )}
        {/* Swatch null THỨ HAI — §7a mở rộng. Cùng xám (đều là vắng giá trị), khác góc
            (khác nguyên nhân): vân DỌC = "câu hỏi không áp dụng", vân CHÉO = "không biết".
            Không có nó thì 86 ô sát trạm và 50 ô không tới được đọc y hệt nhau. */}
        {field.nullSplit && nNotApplicable > 0 && (
          <>
            <div
              className="w-10 border-l border-hairline"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${HATCH_HEX} 0 1px, transparent 1px 6px)`,
              }}
            />
            <div className="flex items-center px-2 text-ink-2">
              {field.nullSplit.label} ({nNotApplicable.toLocaleString("vi-VN")} {noun})
            </div>
          </>
        )}
      </div>
      <div className={floating ? "flex flex-wrap items-center gap-2 text-ink-2" : "flex items-center gap-2 px-3 text-ink-2"}>
        {/* Ô nhỏ hơn mức đọc được từng bậc màu — §13a-1 vẫn đúng, chỉ hình phạt là đổi
            (M5.1): trước đây không vẽ gì, giờ vẫn vẽ nhưng NÓI RA rằng đang đọc thô. Bấm
            được, vì cách sửa duy nhất là phóng gần. */}
        {plan.coarse && (
          <button
            onClick={() => setView({ ...view, zoom: HEX_MIN_ZOOM })}
            title={`Ô H3 rộng ~${Math.round(hexPixelWidth(zoom))} px ở mức phóng này — thấy được hình dáng chung, không đọc được từng bậc màu. Bấm để phóng tới z${HEX_MIN_ZOOM}.`}
            className="cursor-pointer border border-hairline px-1 text-[10px] text-ink-muted hover:bg-basemap"
          >
            đọc thô · ô ~{Math.round(hexPixelWidth(zoom))} px
          </button>
        )}
        {unitSentence(field)}
        {/* Chỉ dấu cực tính — nói thẳng đầu nào là "chỗ cần can thiệp", vì cùng một dải
            màu cam đang phục vụ cả trường "cao = xấu" lẫn "cao = tốt" (M2.1-B). */}
        {polarityNote(field) && (
          <span className="border border-hairline px-1 text-[10px] text-ink-muted">
            {polarityNote(field)}
          </span>
        )}
      </div>
      {cov && (
        <div className={floating ? "flex items-center tabular-nums text-ink-muted" : "ml-auto flex items-center px-3 tabular-nums text-ink-muted"}>
          {cov.n_present.toLocaleString("vi-VN")}/{cov.n_total.toLocaleString("vi-VN")} {noun}
          {/* Đơn vị TRẠM: con số này là của CẢ TUẦN (trạm có ít nhất một giờ đọc được),
              còn swatch chấm rỗng bên trái là của GIỜ ĐANG XEM. Hai câu hỏi khác nhau nên
              cả hai phải tự nói ra mình đang trả lời câu nào — nếu không, hai số cạnh nhau
              trên cùng một dải sẽ đọc thành một số mâu thuẫn. */}
          {field.id === STATION_OCC_FIELD && " có nhịp đọc được"}
          {/* Phủ theo DÂN chỉ có nghĩa khi ô trống nghĩa là "không biết". Với trường mà
              null có nghĩa (§7a), thêm "% dân" vào đây là dựng lại đúng cái báo động giả
              mà badge ⚠ đã bị cấm. */}
          {cov.share < 1 && !field.nullMeans && cov.pop_share !== undefined &&
            ` · ${pct(cov.pop_share)} dân`}
        </div>
      )}
    </div>
  );
}

/** Phủ từ manifest với cột thô, từ số đo lúc chạy với trường phái sinh và trường xã (§13c-1). */
function coverageOf(
  field: FieldMeta,
  manifest: Manifest | null,
  runtime: Map<string, RuntimeCoverage>,
): RuntimeCoverage | undefined {
  // ĐIỀU KIỆN PHẢI GIỐNG HỆT `badgesFor` — nếu lệch thì legend và badge nói hai con số
  // khác nhau về cùng một trường. `nullSplit` buộc dùng số đo lúc chạy vì manifest chỉ
  // biết tổng null, không biết bao nhiêu trong đó là "câu hỏi không áp dụng".
  const useRuntime = Boolean(field.expr) || Boolean(field.nullSplit);
  if (field.readAs === "cell" && !useRuntime) {
    const c = manifest?.coverage[field.column];
    if (!c || !manifest) return undefined;
    return {
      n_present: c.n_present,
      n_total: manifest.n_cells,
      share: c.cell_share,
      pop_share: c.pop_share,
    };
  }
  return runtime.get(field.id);
}

/** Legend in GIÁ TRỊ THẬT, không in "bậc 1..7" — §6a. */
function labelsFor(s: Scale): string[] {
  if (s.kind === "bool") return ["không", "có"];
  if (s.kind === "categorical") return s.categories.map(constantShort);
  return s.breaks.map(formatBreak);
}

function rgbCss(c: [number, number, number] | undefined): string {
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : "transparent";
}
