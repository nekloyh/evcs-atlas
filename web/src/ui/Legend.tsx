import { Fragment } from "react";

import {
  constantShort,
  polarityNote,
  STATION_OCC_FIELD,
  unitNoun,
  unitSentence,
  type FieldMeta,
  type RuntimeCoverage,
  hasDemandRepresentations,
  scaleContractOf,
} from "../fields";
import { pct, type Manifest } from "../data/manifest";
import { NULL_STATE_HATCH_DEG, type NullState } from "../data/null-states";
import { SURFACE_CELL_M } from "../data/queries";
import { useStore } from "../state/store";
import { beatHasFilter } from "../story/scenes";
import { HEX_MIN_ZOOM, hexPixelWidth, planFor } from "../viz/render-plan";
import { themeFor } from "../viz/theme";
import {
  HATCH_HEX,
  colorPosition,
  getThemePalette,
  gradientStops,
  rampFor,
  type NumericScale,
  type Scale,
} from "../viz/palette";
import { formatIn, formatSeries, scaleUnit, withDigits, type ScaledUnit } from "../units";
import { clipDisclosure, scaleOf, type ClipDisclosure } from "../viz/scale-readout";
import { DEMAND_SUPPLY_RGB, type BivariateAxes } from "../viz/demand";

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
  bivariate = null,
  selectedValue = null,
  drawnCount = null,
  variant = "inline",
}: {
  field: FieldMeta;
  scale: Scale | null;
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  surfaceBreaks: number[];
  /** Hai trục của ma trận bivariate, dựng từ chính tập ô đang vẽ (§15b). */
  bivariate?: BivariateAxes | null;
  /** Giá trị của đối tượng đang chọn theo measure này — mốc trên thước đo. */
  selectedValue?: number | null;
  /**
   * Số mark ĐANG VẼ, khi trường có một tập vẽ khác tập chia bậc (`station:occ`: thang dựng
   * trên 168 giờ, còn bản đồ vẽ MỘT giờ). Có nó thì swatch "chưa đo được" đếm theo giờ đang
   * xem — bất biến của `viz/occ.ts` — thay vì đếm null của cả tuần.
   */
  drawnCount?: { present: number; missing: number } | null;
  /** Inline is the legacy full-width strip; floating preserves all semantics in a wrapped stack. */
  variant?: "inline" | "floating";
}) {
  const floating = variant === "floating";
  const zoom = useStore((s) => s.view.zoom);
  const setView = useStore((s) => s.setView);
  const paintOn = useStore((s) => s.paintOn);
  const setPaintOn = useStore((s) => s.setPaintOn);
  const scene = useStore((s) => s.scene);
  const beatId = useStore((s) => s.beat);
  const demandRepresentation = useStore((s) => s.demandRepresentation);
  const mode = useStore((s) => s.mode);
  // Legend mô tả CHÍNH mặt tô đang vẽ, nên nó phải đi qua đúng một cửa với `MapView` —
  // xem `planFor`. Trước đây hai bên tự gọi `renderPlan` và bỏ sót `filtered`, cho ra một
  // dải chú giải "không vẽ vì zoom" trên một bản đồ đang vẽ ô H3.
  const plan = planFor({
    readAs: field.readAs,
    hasSurface: Boolean(field.surface),
    zoom,
    filtered: beatHasFilter(scene, beatId),
    inStory: scene !== null,
  });

  // Nút thứ ba cạnh Ô H3 | XÃ vừa tắt — nói ra, không để dải legend mô tả một mặt tô
  // không còn trên bản đồ. Đứng TRƯỚC nhánh "none" vì đây là một lựa chọn khác hẳn: ô nhỏ
  // quá để đọc là một sự thật về ZOOM, còn đây là một sự thật về Ý MUỐN của người xem.
  if (!paintOn) {
    return (
      <div className={floating ? "flex gap-2 text-body text-ink-2" : "flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3 text-body"}>
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

  // Mặt độ cầu chia thang theo NGƯỠNG CỦA CHÍNH NÓ, không theo thang của lớp ô: nó gộp lên
  // ô 3 km nên giá trị lớn hơn hẳn, và mượn thang của lớp ô sẽ in "12.400" ở nơi lẽ ra là
  // "12,4 nghìn người".
  const surfaceUnit = withDigits(
    scaleUnit(field.unit, surfaceBreaks.length ? Math.max(...surfaceBreaks) : 0),
    surfaceBreaks,
  );
  const surfaceLabels = formatSeries(surfaceBreaks, surfaceUnit);

  const demandP1 = scene === null && hasDemandRepresentations(field);
  if (demandP1 && (demandRepresentation === "density" || demandRepresentation === "hybrid")) {
    return (
      <div className={floating ? "flex flex-col gap-2 text-body" : "flex h-10 shrink-0 items-stretch border-b border-hairline text-body"}>
        <div className="flex flex-wrap">
          {surfaceBreaks.map((b, i) => {
            const k = Math.round((i / Math.max(surfaceBreaks.length - 1, 1)) * (themePalette.hex.length - 1));
            return <div key={b} className="flex min-w-20 items-center justify-center px-2 tabular-nums" style={{ background: themePalette.hex[k], color: themePalette.ink[k] }}>{surfaceLabels[i]}</div>;
          })}
        </div>
        <div className="flex items-center px-3 text-ink-2">đồng mức định lượng · {surfaceUnit.label}/ô gộp {(SURFACE_CELL_M / 1000).toLocaleString("vi-VN")} km</div>
        {demandRepresentation === "hybrid" && <div className="flex items-center px-3 text-cold-2">chấm: √ số cổng, 3–15 px · vòng xám: chưa biết cổng</div>}
        <div className={floating ? "text-ink-muted" : "ml-auto flex items-center px-3 text-ink-muted"}>gộp {SURFACE_CELL_M} m · ngưỡng thật</div>
      </div>
    );
  }

  if (demandP1 && demandRepresentation === "intensity") {
    return <div className={floating ? "text-body text-ink-2" : "flex h-10 shrink-0 items-center border-b border-hairline px-3 text-body text-ink-2"}>bản đồ nhiệt · màu phụ thuộc bán kính 42 px và mức phóng · chỉ để tìm vùng nóng, <strong className="ml-1">không so sánh định lượng</strong></div>;
  }

  if (demandP1 && demandRepresentation === "bivariate") {
    return (
      <BivariateKey
        axes={bivariate}
        field={field}
        floating={floating}
      />
    );
  }

  // Không vẽ được thì NÓI RA, không để dải legend đứng đó mô tả một bản đồ không tồn tại.
  if (plan.paint === "none") {
    return (
      <div className={floating ? "flex flex-wrap gap-2 text-body" : "flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3 text-body"}>
        <span className="text-ink-2">
          Ô H3 rộng ~{Math.round(hexPixelWidth(zoom))} px ở mức phóng này — quá nhỏ để đọc,
          nên không vẽ. Đó là texture, không phải bản đồ.
        </span>
        <button
          onClick={() => setView({ ...useStore.getState().view, zoom: HEX_MIN_ZOOM })}
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
      <div className={floating ? "flex flex-col gap-2 text-body" : "flex h-10 shrink-0 items-stretch border-b border-hairline text-body"}>
        <div className="flex flex-wrap">
          {surfaceBreaks.map((b, i) => {
            const k = Math.round((i / Math.max(surfaceBreaks.length - 1, 1)) * (themePalette.hex.length - 1));
            return (
              <div
                key={b}
                className="flex min-w-20 items-center justify-center px-2 tabular-nums"
                style={{ background: themePalette.hex[k], color: themePalette.ink[k] }}
              >
                {surfaceLabels[i]}
              </div>
            );
          })}
        </div>
        <div className="flex items-center px-3 text-ink-2">
          mặt độ cầu · {surfaceUnit.label} trên ô gộp {(SURFACE_CELL_M / 1000).toLocaleString("vi-VN")} km
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
  const labels = scale ? labelsFor(scale, field) : [];
  const noun = unitNoun(field.readAs);
  // Danh từ GIỮ NGUYÊN `"ô"`, kể cả khi trường đọc theo xã/đoạn/trạm — đây là chữ đã QA và
  // bản này không đổi nó. Badge cảnh truyền danh từ thật (`unitNoun`), nên hai bề mặt lệch
  // nhau đúng MỘT từ, có chủ ý và có test gác. Đổi ở đây là đổi một bề mặt đã chốt.
  const clip = scale && scale.kind === "numeric"
    ? clipDisclosure(field, scale, "ô")
    : { over: null, under: null };
  const cov = coverageOf(field, manifest, runtime);
  // Tổng null tách làm hai. `n_not_applicable` đo lúc chạy (§7c: không gõ tay con số nào);
  // thiếu nó thì tất cả về nhóm "không biết" — thà nói ít hơn là nói sai.
  const nNotApplicable = field.nullSplit ? (cov?.n_not_applicable ?? 0) : 0;
  const nFiltered = field.nullSplit ? (cov?.n_filtered ?? 0) : 0;
  // Số ô trống mà legend phải nói tới là số của cái ĐANG VẼ. Với trường theo giờ, thang
  // dựng trên cả tuần và đã lọc null trước khi chia bậc (`allOccValues`) — `scale.nNull` ở
  // đó bằng 0 vĩnh viễn, nên đọc nó là khai "không thiếu gì" trên một bản đồ đang có chấm
  // rỗng. `drawnCount` là cửa duy nhất cho tập vẽ ấy.
  const nNullDrawn = drawnCount ? drawnCount.missing : scale?.nNull ?? 0;
  // Còn lại mới là "không biết". Trừ CẢ HAI nhóm đã giải thích được: gộp nhóm ĐÃ LỌC vào
  // đây là gọi 87 ô sát trạm — nhóm được phục vụ tốt nhất thành phố — là "không đo được".
  const nUnknown = Math.max(nNullDrawn - nNotApplicable - nFiltered, 0);

  if (scale?.kind === "numeric" && scale.mode === "gradient") {
    const contract = scaleContractOf(field);
    const transformName = contract.transform === "sqrt" ? "căn bậc hai" : "tuyến tính";
    const ceilingName = contract.clip.hi === "p99" ? "trần p99" : "không cắt trần";
    return (
      <div className={floating
        ? "flex max-w-full flex-col gap-2 text-body"
        : "flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-3 py-2 text-body"}
      >
        <div className={floating ? "w-full" : "min-w-80 max-w-xl flex-1"}>
          <GradientRuler
            field={field}
            scale={scale}
            theme={theme}
            selectedValue={selectedValue}
            clippedAtP99={contract.clip.hi === "p99"}
          />
        </div>
        <LegendNulls
          field={field}
          noun={noun}
          nUnknown={nUnknown}
          nNotApplicable={nNotApplicable}
          nFiltered={nFiltered}
        />
        {mode === "3d" && field.readAs === "cell" && (
          <div className="text-note text-ink-2">
            chiều cao = cùng trường · thang {transformName} · {ceilingName} · không đo bằng thước
            {scale.diverge && " · cao = xa mốc"}
          </div>
        )}
        <ClipLines clip={clip} className="w-full" />
        {plan.coarse && (
          <button
            onClick={() => setView({ ...useStore.getState().view, zoom: HEX_MIN_ZOOM })}
            className="cursor-pointer border border-hairline px-1 text-note text-ink-muted hover:bg-basemap"
          >
            đọc thô · ô ~{Math.round(hexPixelWidth(zoom))} px
          </button>
        )}
        <details className={floating ? "group" : "group ml-auto"}>
          <summary className="cursor-pointer list-none text-note text-ink-muted hover:text-ink-2">
            <span className="group-open:hidden">Đơn vị và phép biến đổi ▸</span>
            <span className="hidden group-open:inline">Đơn vị và phép biến đổi ▾</span>
          </summary>
          <div className="mt-1.5 flex flex-col gap-1 text-note text-ink-2">
            <span>{unitSentence(field, scaleOf(field, scale))}</span>
            <span className="text-ink-muted">
              thang {transformName} trên miền {contract.clip.hi === "p99" ? "cắt p99" : "không cắt"}
            </span>
            {polarityNote(field) && <span className="self-start border border-hairline px-1 text-ink-muted">{polarityNote(field)}</span>}
            {cov && (
              <span className="tabular-nums text-ink-muted">
                {cov.n_present.toLocaleString("vi-VN")}/{cov.n_total.toLocaleString("vi-VN")} {noun}
                {field.id === STATION_OCC_FIELD && " có nhịp đọc được"}
                {cov.share < 1 && cov.pop_share !== undefined && ` · ${pct(cov.pop_share)} dân`}
              </span>
            )}
          </div>
        </details>
      </div>
    );
  }

  /*
   * Dải nổi ở góc trên-trái là một THANG MÀU, không phải một tờ chú thích.
   *
   * Nó nằm đè lên bản đồ và được liếc chứ không được đọc: mỗi dòng chữ thêm vào đây vừa
   * lấy mất một dòng bản đồ, vừa làm chậm đúng thao tác mà nó phục vụ (nhìn màu → biết số).
   * Nên mặc định chỉ còn ba thứ, và cả ba đều cần để GIẢI MÃ MÀU: dải màu, mốc giá trị, và
   * ký hiệu ô trống nếu bản đồ có ô trống.
   *
   * Câu đơn vị, luật chia bậc và phủ vẫn bắt buộc phải có mặt (§7: giới hạn không được
   * giấu dưới tooltip) — chúng nằm sau nút mở rộng của chính panel này, một cú bấm, luôn ở
   * cùng một chỗ. `details` mở là một hành động của người xem, không phải một tooltip trốn
   * khi rê chuột đi.
   */
  if (floating) {
    return (
      <div className="flex max-w-full flex-col gap-2 text-body">
        <RampRuler
          field={field}
          scale={scale}
          colors={colors}
          labels={labels}
          selectedValue={selectedValue}
        />
        <LegendNulls
          field={field}
          noun={noun}
          nUnknown={nUnknown}
          nNotApplicable={nNotApplicable}
          nFiltered={nFiltered}
        />
        {mode === "3d" && field.readAs === "cell" && scale?.kind === "numeric" && (
          <ElevationDisclosure field={field} scale={scale} />
        )}
        <ClipLines clip={clip} />
        {plan.coarse && (
          <button
            onClick={() => setView({ ...useStore.getState().view, zoom: HEX_MIN_ZOOM })}
            title={`Ô H3 rộng ~${Math.round(hexPixelWidth(zoom))} px ở mức phóng này — thấy được hình dáng chung, không đọc được từng bậc màu. Bấm để phóng tới z${HEX_MIN_ZOOM}.`}
            className="self-start cursor-pointer border border-hairline px-1 text-note text-ink-muted hover:bg-basemap"
          >
            đọc thô · ô ~{Math.round(hexPixelWidth(zoom))} px
          </button>
        )}
        <details className="group">
          <summary className="cursor-pointer list-none text-note text-ink-muted hover:text-ink-2">
            <span className="group-open:hidden">Đơn vị và cách chia bậc ▸</span>
            <span className="hidden group-open:inline">Đơn vị và cách chia bậc ▾</span>
          </summary>
          <div className="mt-1.5 flex flex-col gap-1 text-note text-ink-2">
            <span>{unitSentence(field, scaleOf(field, scale))}</span>
            {polarityNote(field) && (
              <span className="self-start border border-hairline px-1 text-ink-muted">
                {polarityNote(field)}
              </span>
            )}
            {classingNote(scale, field.classingNoun ?? noun) && (
              <span className="tabular-nums text-ink-muted">{classingNote(scale, field.classingNoun ?? noun)}</span>
            )}
            {cov && (
              <span className="tabular-nums text-ink-muted">
                {cov.n_present.toLocaleString("vi-VN")}/{cov.n_total.toLocaleString("vi-VN")} {noun}
                {field.id === STATION_OCC_FIELD && " có nhịp đọc được"}
                {cov.share < 1 && cov.pop_share !== undefined &&
                  ` · ${pct(cov.pop_share)} dân`}
              </span>
            )}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 items-stretch border-b border-hairline text-body ${
      mode === "3d" && field.readAs === "cell" && scale?.kind === "numeric" ? "min-h-10" : "h-10"
    }`}>
      <div className="flex">
        {labels.map((label, i) => (
          <div
            key={label + i}
            className="flex min-w-20 items-center justify-center px-2 tabular-nums"
            style={{ background: rgbCss(colors[i]), color: inks[i], ...seamAt(scale, i) }}
          >
            {label}
          </div>
        ))}
        {/* Bậc cuối là khoảng MỞ. Với phân bố lệch nặng (`ports_per_10k_pop`: bậc cuối bắt
            đầu ở 11, thực tế tới 230,7 — 49× trung vị) thì cả một dải giá trị chung một
            màu, và im lặng ở đây là để người xem tưởng bậc cuối kết thúc ở ngưỡng của nó.
            Chỉ hiện khi thật sự lệch, để nó không thành nhiễu ở 40 trường còn lại. */}
        {scale?.kind === "numeric" && openTopOf(scale) && (
            <div className="flex items-center px-2 text-ink-muted tabular-nums">
              … tới {formatIn(scale.max!, scaleOf(field, scale))}
            </div>
          )}
        {/* Swatch null là VÂN THUẦN — chữ đặt cạnh chứ không đè lên, vì gạch chéo chạy
            qua chữ thì cả hai cùng khó đọc. DESIGN.md §3b.

            Đơn vị ĐƯỜNG đổi swatch thành một NÉT xám, không phải ô vân; đơn vị TRẠM đổi
            thành một CHẤM RỖNG viền xám. Cùng một luật: chú giải phải là đúng cái mark
            trên bản đồ (cùng luật với `ShapeSwatch` của tab LAYER). Một ô vân 45° ở đây sẽ
            hứa một chất liệu mà đường 1px và chấm 6px không mang được — mực thì giữ
            nguyên, vì khái niệm không đổi. */}
        {scale && nNullDrawn > 0 && (
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
        {/* Swatch null THỨ HAI — §7a mở rộng, góc lấy từ TRẠNG THÁI (§6.4). Cùng xám (đều
            là vắng giá trị), khác góc vì khác nguyên nhân. Không có nó thì ô sát trạm và ô
            không tới được đọc y hệt nhau — hai đầu đối lập của thang phục vụ, một vân. */}
        {field.nullSplit &&
          splitGroups(field, nNotApplicable, nFiltered).map((g) => (
            <Fragment key={g.state}>
              <div
                className="w-10 border-l border-hairline"
                style={{
                  backgroundImage: `repeating-linear-gradient(${NULL_STATE_HATCH_DEG[g.state]}deg, ${HATCH_HEX} 0 1px, transparent 1px 6px)`,
                }}
              />
              <div className="flex items-center px-2 text-ink-2">
                {g.label} ({g.n.toLocaleString("vi-VN")} {noun})
              </div>
            </Fragment>
          ))}
      </div>
      {mode === "3d" && field.readAs === "cell" && scale?.kind === "numeric" && (
        <div className="flex items-center px-3"><ElevationDisclosure field={field} scale={scale} /></div>
      )}
      <ClipLines clip={clip} className="justify-center px-3" />
      <div className="flex items-center gap-2 px-3 text-ink-2">
        {/* Ô nhỏ hơn mức đọc được từng bậc màu — §13a-1 vẫn đúng, chỉ hình phạt là đổi
            (M5.1): trước đây không vẽ gì, giờ vẫn vẽ nhưng NÓI RA rằng đang đọc thô. Bấm
            được, vì cách sửa duy nhất là phóng gần. */}
        {plan.coarse && (
          <button
            onClick={() => setView({ ...useStore.getState().view, zoom: HEX_MIN_ZOOM })}
            title={`Ô H3 rộng ~${Math.round(hexPixelWidth(zoom))} px ở mức phóng này — thấy được hình dáng chung, không đọc được từng bậc màu. Bấm để phóng tới z${HEX_MIN_ZOOM}.`}
            className="cursor-pointer border border-hairline px-1 text-note text-ink-muted hover:bg-basemap"
          >
            đọc thô · ô ~{Math.round(hexPixelWidth(zoom))} px
          </button>
        )}
        {unitSentence(field, scaleOf(field, scale))}
        {/* Chỉ dấu cực tính — nói thẳng đầu nào là "chỗ cần can thiệp", vì cùng một dải
            màu cam đang phục vụ cả trường "cao = xấu" lẫn "cao = tốt" (M2.1-B). */}
        {polarityNote(field) && (
          <span className="border border-hairline px-1 text-note text-ink-muted">
            {polarityNote(field)}
          </span>
        )}
      </div>
      {cov && (
        <div className="ml-auto flex items-center px-3 tabular-nums text-ink-muted">
          {cov.n_present.toLocaleString("vi-VN")}/{cov.n_total.toLocaleString("vi-VN")} {noun}
          {/* Đơn vị TRẠM: con số này là của CẢ TUẦN (trạm có ít nhất một giờ đọc được),
              còn swatch chấm rỗng bên trái là của GIỜ ĐANG XEM. Hai câu hỏi khác nhau nên
              cả hai phải tự nói ra mình đang trả lời câu nào — nếu không, hai số cạnh nhau
              trên cùng một dải sẽ đọc thành một số mâu thuẫn. */}
          {field.id === STATION_OCC_FIELD && " có nhịp đọc được"}
          {/* Phủ theo DÂN chỉ có nghĩa khi ô trống nghĩa là "không biết". Với trường mà
              null có nghĩa (§7a), thêm "% dân" vào đây là dựng lại đúng cái báo động giả
              mà badge ⚠ đã bị cấm — nay phép chặn ấy nằm ở `badgesFor` và đọc
              `manifest.null_states` thay vì một chuỗi gõ tay (Phase 8 §1.2). Khối này chỉ
              vẽ khi ĐÃ có `cov`, tức đã qua cùng phép chặn đó. */}
          {cov.share < 1 && cov.pop_share !== undefined &&
            ` · ${pct(cov.pop_share)} dân`}
        </div>
      )}
    </div>
  );
}

/**
 * Hai dòng khai cắt trần/cắt sàn — MỘT chỗ dựng, ba nhánh render cùng gọi.
 *
 * Trước bản này chúng nằm trong nhánh return sớm của chế độ GRADIENT, nên bản đồ BẬC — chế
 * độ mặc định của app — không khai gì, dù nó bị cắt y hệt: `applyScaleMode` chỉ lật `mode`,
 * `domain` giữ nguyên, nên `nClippedHigh` ở hai chế độ là một số. Đó đúng là điều mà CR 2.1
 * §Phase 9 mục 5 (bản sửa của re-QA Phase 7) cấm: khai gắn vào việc TÔ, không gắn vào việc
 * bề mặt ấy dựng loại legend nào.
 */
function ClipLines({ clip, className }: { clip: ClipDisclosure; className?: string }) {
  if (!clip.over && !clip.under) return null;
  return (
    <div className={`flex flex-col gap-0.5 tabular-nums text-note text-ink-2 ${className ?? ""}`}>
      {clip.over && <span>{clip.over}</span>}
      {clip.under && <span>{clip.under}</span>}
    </div>
  );
}

function ElevationDisclosure({ field, scale }: { field: FieldMeta; scale: NumericScale }) {
  const contract = scaleContractOf(field);
  const transformName = contract.transform === "sqrt" ? "căn bậc hai" : "tuyến tính";
  const ceilingName = contract.clip.hi === "p99" ? "trần p99" : "không cắt trần";
  const unit = scaleOf(field, scale);
  return (
    <div className="flex flex-col gap-0.5 text-note text-ink-2">
      <span>
        chiều cao = cùng trường · thang {transformName} · {ceilingName} · không đo bằng thước
        {scale.diverge && " · cao = xa mốc"}
      </span>
      {scale.domain.nClippedHigh > 0 && (
        <span className="tabular-nums">
          ▲ {scale.domain.nClippedHigh.toLocaleString("vi-VN")} ô vượt trần cao độ · lớn nhất {formatIn(scale.domain.max, unit)}
        </span>
      )}
      {scale.domain.nClippedLow > 0 && (
        <span className="tabular-nums">
          ▼ {scale.domain.nClippedLow.toLocaleString("vi-VN")} ô dưới sàn cao độ · nhỏ nhất {formatIn(scale.domain.min, unit)}
        </span>
      )}
    </div>
  );
}

function GradientRuler({
  field,
  scale,
  theme,
  selectedValue,
  clippedAtP99,
}: {
  field: FieldMeta;
  scale: NumericScale;
  theme: ReturnType<typeof themeFor>;
  selectedValue: number | null;
  clippedAtP99: boolean;
}) {
  const stops = gradientStops(scale, theme, 32);
  const gradient = `linear-gradient(to right, ${stops
    .map((stop) => `${rgbCss(stop.color)} ${(stop.position * 100).toFixed(3)}%`)
    .join(", ")})`;
  const unit = scaleOf(field, scale);
  const tickValues = [scale.domain.lo, scale.domain.median, scale.domain.hi];
  const tickLabels = formatSeries(tickValues, unit);
  const tickPositions = tickValues.map((value) => colorPosition(value, scale) * 100);
  const selectedPosition = selectedValue !== null && Number.isFinite(selectedValue)
    ? colorPosition(selectedValue, scale) * 100
    : null;
  const fmt = (value: number) => formatIn(value, unit);
  const aria = `${unitSentence(field, unit)}. Miền từ ${fmt(scale.domain.lo)} đến ${fmt(scale.domain.hi)}; trung vị ${fmt(scale.domain.median)}.${clippedAtP99 ? ` ${scale.domain.nClippedHigh} ô vượt trần.` : ""}${selectedValue === null ? "" : ` Giá trị đang chọn: ${fmt(selectedValue)}.`}`;

  return (
    <div role="img" aria-label={aria}>
      {scale.diverge && field.diverge && (
        <div className="mb-0.5 grid grid-cols-2 text-note leading-none text-ink-2">
          <span>{field.diverge.ends[0]}</span>
          <span className="text-right">{field.diverge.ends[1]}</span>
        </div>
      )}
      {selectedPosition !== null && (
        <div className="relative mb-0.5 h-3.5">
          <span
            className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-note font-semibold leading-none tabular-nums text-ink"
            style={{ left: `${selectedPosition}%` }}
            title="giá trị của đối tượng đang chọn"
          >
            {fmt(selectedValue!)}
            <span className="mx-auto block h-1 w-px bg-ink" />
          </span>
        </div>
      )}
      <div className="relative h-2.5 rounded-xs" style={{ backgroundImage: gradient }}>
        {scale.diverge && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 bottom-[-2px] left-1/2 w-px bg-ink"
          />
        )}
      </div>
      <div className="relative mt-1 h-3.5 text-note leading-none tabular-nums text-ink-muted">
        {tickLabels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className={`absolute whitespace-nowrap ${i === 0 ? "" : i === 2 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: `${tickPositions[i]}%` }}
          >
            {i === 2 && clippedAtP99 ? "≥ " : ""}{label}{i === 2 && unit.label ? ` ${unit.label}` : ""}
          </span>
        ))}
      </div>
      {scale.diverge && field.diverge && (
        <div className="relative h-3 text-note leading-none text-ink-muted">
          <span className="absolute left-1/2 -translate-x-1/2">{fmt(field.diverge.at)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * THƯỚC ĐO — dải chú giải của bản đồ nổi.
 *
 * Đây không phải dải inline thu nhỏ, và khác biệt lớn nhất không phải bề rộng mà là **chỗ
 * đặt con số**. Dải cũ in ngưỡng vào GIỮA ô màu, và điều đó nói sai một câu ngữ pháp cơ bản
 * của choropleth: `breaks[i]` là **cạnh dưới** của bậc i, không phải "giá trị của màu này".
 * In `0,246` giữa một ô cam nhạt đọc thành "cam nhạt = 0,246", trong khi sự thật là "cam
 * nhạt = từ 0,246 tới 1,8". Với bảy bậc cạnh nhau, cái sai ấy dịch cả thang đi nửa bậc.
 *
 * Nên ở đây màu và số tách làm hai tầng: một dải màu liền không chữ, và một hàng mốc nằm
 * dưới, mỗi mốc CĂN TRÁI vào đúng cạnh mà nó đặt tên. Đọc được như một cây thước, và nó
 * cũng gỡ luôn ràng buộc tương phản chữ-trên-nền (§4c) khỏi dải nổi: không còn chữ nào nằm
 * trên màu để phải đọc.
 *
 * Bậc cuối là khoảng MỞ nên nó có mốc riêng ở mép phải (`→ max`) thay vì một câu chú thích
 * trôi nổi phía sau dải — với `ports_per_10k_pop` (bậc cuối bắt đầu ở 11, chạy tới 231) đó
 * là thông tin quan trọng nhất của cả thang, không phải một cước chú.
 */
function RampRuler({
  field,
  scale,
  colors,
  labels,
  selectedValue,
}: {
  field: FieldMeta;
  scale: Scale | null;
  colors: ([number, number, number] | undefined)[];
  labels: string[];
  selectedValue: number | null;
}) {
  // Đang tải thì giữ NGUYÊN hình dạng của thước đo, không thay bằng một dòng chữ.
  //
  // Một dòng chữ cao ~15 px đứng chỗ một thước đo cao ~34 px, nên lúc thang màu về thì cả
  // tấm chú giải giật xuống — và mọi thứ neo dưới nó giật theo. Nhảy layout đọc thành
  // "trang bị lỗi" kể cả khi không có lỗi nào. Khung xám cùng kích thước thì không giật,
  // và nó còn nói đúng hơn: chỗ này SẼ là một thước đo.
  if (!scale || labels.length === 0) {
    return (
      <div aria-busy="true" aria-label={`Đang dựng thang màu cho ${unitNoun(field.readAs)}`}>
        <div className="h-2.5 animate-pulse rounded-xs bg-hairline" />
        <div className="mt-1 text-note leading-none text-ink-muted">
          đang dựng thang màu cho {unitNoun(field.readAs)}…
        </div>
      </div>
    );
  }

  const openTop = openTopOf(scale);
  const unit = scaleOf(field, scale);
  const fmt = (v: number) => formatIn(v, unit);

  // Vị trí mốc, tính theo % bề rộng dải. Mỗi bậc chiếm 1/n bề rộng như nhau, nên mốc nằm ở
  // "bậc thứ mấy" cộng phần nội suy TRONG bậc đó — đủ để nói "gần đầu bậc" hay "sát ngưỡng
  // trên", mà không giả vờ rằng bề rộng trên màn hình tỉ lệ với khoảng giá trị (nó không).
  const markPct = markPosition(selectedValue, scale);
  const aria = (() => {
    if (scale.kind === "categorical") {
      const categories = scale.categories.map((category, i) =>
        `${constantShort(category)}: ${scale.counts[i]?.toLocaleString("vi-VN") ?? 0} ${unitNoun(field.readAs)}`,
      );
      return `${field.label}. Thang hạng mục, không có thứ tự liên tục. ${categories.join("; ")}.`;
    }
    if (scale.kind === "bool") {
      return `${field.label}. Không: ${scale.counts[0].toLocaleString("vi-VN")}; có: ${scale.counts[1].toLocaleString("vi-VN")}.`;
    }
    const selected = selectedValue === null ? "" : ` Giá trị đang chọn: ${fmt(selectedValue)}.`;
    return `${unitSentence(field, unit)}. Các ngưỡng hiển thị: ${labels.join(", ")}.${selected}`;
  })();

  return (
    <div role="img" aria-label={aria}>
      {/* Mốc nằm TRÊN dải, mốc giá trị nằm DƯỚI: hai hàng chữ không bao giờ tranh chỗ nhau,
          và cái đang chọn được đọc trước cái tổng quát — đúng thứ tự người xem cần. */}
      {markPct !== null && (
        <div className="relative mb-0.5 h-3.5">
          <span
            className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-center text-note font-semibold leading-none tabular-nums text-ink"
            style={{ left: `${markPct}%` }}
            title="giá trị của đối tượng đang chọn"
          >
            {fmt(selectedValue!)}
            <span className="mx-auto block h-1 w-px bg-ink" />
          </span>
        </div>
      )}
      <div className="flex h-2.5 overflow-hidden rounded-xs">
        {colors.map((c, i) => (
          <div key={i} className="min-w-0 flex-1" style={{ background: rgbCss(c), ...seamAt(scale, i) }} />
        ))}
      </div>
      <div className="mt-1 flex text-note leading-none tabular-nums text-ink-2">
        {labels.map((label, i) => (
          <div
            key={label + i}
            // Mốc là mốc DUY NHẤT trên thang này mà người xem cần tìm bằng mắt — mọi ngưỡng
            // khác chỉ là phân vị. Đậm hơn một bậc là đủ để nó nổi khỏi năm số còn lại.
            className={`min-w-0 flex-1 truncate ${seamAt(scale, i) ? "font-semibold text-ink" : ""}`}
            title={label}
          >
            {label}
          </div>
        ))}
        {openTop && scale.kind === "numeric" && (
          <div className="shrink-0 pl-1 text-ink-muted" title={`giá trị lớn nhất: ${fmt(scale.max!)}`}>
            → {fmt(scale.max!)}
          </div>
        )}
        {/* Danh từ đơn vị, nói ĐÚNG MỘT LẦN ở cuối hàng mốc.

            Nó phải ở đây chứ không phải sau `<details>`: từ khi thang được chia một lần cho
            cả dải, các mốc là số TRẦN — dải khoảng cách in "1,6" ở chỗ trước kia in "1,6
            ng", nên giấu chữ "km" đi là bỏ người xem lại với một con số không có đơn vị.
            Một token ở mép phải là cách chú giải của CARTO/Kepler làm, và nó không phải là
            câu chữ mà chủ dự án đã bác — câu đầy đủ vẫn nằm trong `<details>`. */}
        {unit.label && (
          <div className="shrink-0 pl-1.5 font-medium text-ink-muted">{unit.label}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Ô trống và lý do — tách khỏi thước đo, không nối đuôi nó.
 *
 * Ở dải inline, swatch null nằm ngay sau bậc cuối cùng và điều đó làm nó đọc thành **bậc
 * thứ tám** của thang. Nó không phải: nó là một trạng thái khác hẳn (không có giá trị), và
 * §7a còn chia nó làm hai nguyên nhân. Xuống dòng riêng là cách rẻ nhất để nói ra điều đó.
 */
function LegendNulls({
  field,
  noun,
  nUnknown,
  nNotApplicable,
  nFiltered,
}: {
  field: FieldMeta;
  noun: string;
  /** Ô trống mà KHÔNG luật nào giải thích. Đã trừ cả hai nhóm đã phân giải được. */
  nUnknown: number;
  nNotApplicable: number;
  nFiltered: number;
}) {
  const groups = field.nullSplit ? splitGroups(field, nNotApplicable, nFiltered) : [];
  const hasUnknown = nUnknown > 0;
  if (!hasUnknown && groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-note text-ink-2">
      {hasUnknown && (
        <span className="flex items-center gap-1.5">
          <NullSwatch readAs={field.readAs} angle={45} />
          {field.nullLabel ?? (field.id === STATION_OCC_FIELD ? "chưa đủ quan sát ở giờ này" : "không đo được")}{" "}
          <span className="tabular-nums text-ink-muted">
            ({nUnknown.toLocaleString("vi-VN")} {noun})
          </span>
        </span>
      )}
      {groups.map((g) => (
        <span key={g.state} className="flex items-center gap-1.5">
          <NullSwatch readAs={field.readAs} angle={NULL_STATE_HATCH_DEG[g.state]} />
          {g.label}{" "}
          <span className="tabular-nums text-ink-muted">
            ({g.n.toLocaleString("vi-VN")} {noun})
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Hai nhánh của `nullSplit` kèm số đếm, bỏ nhánh rỗng. Nhãn và góc vân đều suy từ TRẠNG
 * THÁI mà chính khai báo trường nói ra — chú giải không thể lệch khỏi mẫu số nữa.
 */
function splitGroups(
  field: FieldMeta,
  nNotApplicable: number,
  nFiltered: number,
): Array<{ state: NullState; label: string; n: number }> {
  const sp = field.nullSplit;
  if (!sp) return [];
  const nOf = (st: NullState) =>
    st === "NOT_APPLICABLE" ? nNotApplicable : st === "FILTERED" ? nFiltered : 0;
  return [sp.whenTrue, sp.whenFalse]
    .map((b) => ({ state: b.state, label: b.label, n: nOf(b.state) }))
    .filter((g) => g.n > 0);
}

/** Chú giải phải là đúng cái mark trên bản đồ: đường → nét, trạm → chấm rỗng, còn lại → vân. */
function NullSwatch({ readAs, angle }: { readAs: FieldMeta["readAs"]; angle: 0 | 45 | 90 | 135 }) {
  if (readAs === "road")
    return <span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ background: HATCH_HEX }} />;
  if (readAs === "station")
    return (
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px]"
        style={{ borderColor: HATCH_HEX }}
      />
    );
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-4 border border-hairline"
      style={{
        backgroundImage: `repeating-linear-gradient(${angle}deg, ${HATCH_HEX} 0 1px, transparent 1px 5px)`,
      }}
    />
  );
}

/**
 * Chỗ đứng của một giá trị trên dải, tính theo % bề rộng — `null` nếu không đặt được.
 *
 * Dải vẽ mỗi bậc rộng BẰNG NHAU, nên toạ độ ngang là toạ độ theo BẬC, không theo giá trị:
 * bậc k bắt đầu ở `k/n` và rộng `1/n`. Trong bậc thì nội suy tuyến tính giữa hai ngưỡng để
 * mốc phân biệt được "vừa chớm vào bậc" với "sắp sang bậc sau".
 *
 * Bậc CUỐI là khoảng mở: không có ngưỡng trên để nội suy, nên dùng `max` thật của scale.
 * Thiếu nó thì mọi giá trị của bậc chót dồn về đúng một điểm.
 */
function markPosition(value: number | null, scale: Scale | null): number | null {
  if (value === null || !scale || scale.kind !== "numeric") return null;
  const { breaks, max } = scale;
  const n = breaks.length;
  if (n === 0) return null;

  let k = 0;
  for (let i = 0; i < n; i++) if (value >= breaks[i]!) k = i;
  const lo = breaks[k]!;
  const hi = k + 1 < n ? breaks[k + 1]! : (max ?? lo);
  const within = hi > lo ? Math.min(Math.max((value - lo) / (hi - lo), 0), 1) : 0.5;
  return ((k + within) / n) * 100;
}

/**
 * Luật chia bậc, nói bằng số đo chứ không bằng tên thuật toán.
 *
 * Đây là câu trả lời cho câu hỏi mà một thang phân vị luôn gợi ra và chưa bao giờ được trả
 * lời trên màn hình: "vì sao các bậc rộng hẹp khác nhau đến thế?". Vì chúng chia đều theo
 * SỐ ĐƠN VỊ, không theo giá trị — nên bậc chót có thể rộng gấp 40 lần bậc đầu mà vẫn chứa
 * đúng ngần ấy xã. Không nói ra thì người xem đọc bề rộng của bậc thành độ quan trọng.
 */
function classingNote(scale: Scale | null, noun: string): string {
  if (!scale || scale.kind !== "numeric" || scale.breaks.length < 2) return "";
  const per = Math.round(scale.n / scale.breaks.length);
  // Thang phân kỳ chia đều theo số đơn vị TRONG TỪNG PHÍA, nên hai phía không cùng mật độ
  // (`screen_margin_m`: ≈873 ô/bậc phía dưới, ≈594 phía trên). Nói "≈733 ô/bậc" ở đây là
  // một con số không bậc nào có, và nó mời người xem so bề rộng bậc qua mốc — đúng phép so
  // duy nhất mà thang này không cho phép.
  if (scale.diverge) {
    const nBelow = scale.diverge.index;
    const lo = Math.round(scale.counts.slice(0, nBelow).reduce((a, b) => a + b, 0) / Math.max(nBelow, 1));
    const nAbove = scale.breaks.length - nBelow;
    const hi = Math.round(scale.counts.slice(nBelow).reduce((a, b) => a + b, 0) / Math.max(nAbove, 1));
    return `${scale.breaks.length} bậc quanh mốc · chia đều theo số ${noun} TRONG TỪNG PHÍA · ≈${lo.toLocaleString("vi-VN")} dưới, ≈${hi.toLocaleString("vi-VN")} trên`;
  }
  if (scale.zeroClass && scale.counts.length > 0) {
    return `${scale.breaks.length} bậc · bậc đầu là 0 riêng (${scale.counts[0]!.toLocaleString("vi-VN")} ${noun}) · còn lại chia đều theo số ${noun}`;
  }
  return `${scale.breaks.length} bậc chia đều theo số ${noun} · ≈${per.toLocaleString("vi-VN")} ${noun}/bậc`;
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

/**
 * Chú giải MA TRẬN của bivariate — chỉ vẽ ô màu mà bản đồ thật sự dùng tới.
 *
 * Bản cũ vẽ một lưới 3×3 **cứng**, không biết gì về dữ liệu, kèm câu "tối đa 3 nhóm/trục".
 * Với `n_ports` (90% ô bằng 0) thì phân vị 1/3 và 2/3 đều bằng 0, nhóm giữa của trục cung
 * **không một ô nào rơi vào được**, và chú giải vẫn hứa đủ chín ô — ba trong đó không thể
 * xuất hiện trên bản đồ. Luật chia nhóm đã sửa ở `tertileBreaks`; ở đây là phần chú giải
 * không được phép hứa quá: nhóm nào không có ô thì không có swatch (§6a-3, cùng tinh thần
 * "không độn bậc giả").
 *
 * Và nó in **ngưỡng thật** thay cho câu "tối đa 3 nhóm/trục" — §3b: chú giải in giá trị,
 * không in tên nhóm.
 */
function BivariateKey({
  axes,
  field,
  floating,
}: {
  axes: BivariateAxes | null;
  field: FieldMeta;
  floating: boolean;
}) {
  const wrap = floating
    ? "flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-2"
    : "flex h-10 shrink-0 items-center gap-3 border-b border-hairline px-3 text-body text-ink-2";
  if (!axes) {
    return (
      <div className={wrap} aria-busy="true">
        <span className="text-ink-muted">đang dựng ma trận cầu × cung…</span>
      </div>
    );
  }
  const rows = [0, 1, 2].filter((r) => axes.pop.reachable[r]);
  const cols = [0, 1, 2].filter((c) => axes.ports.reachable[c]);
  // Cùng luật với thước đo của ramp: thang chốt MỘT lần theo ngưỡng lớn, rồi `withDigits`
  // khoá số chữ số. Thiếu bước này thì `formatIn` rơi về `formatBreak` cho số ≥ 1.000 và
  // in "1,5 ng" cạnh nhãn "người" — hai đơn vị trong một câu.
  const popUnit = withDigits(scaleUnit(field.unit, axes.pop.breaks[1]), axes.pop.breaks);
  const portUnit = scaleUnit({ kind: "port" }, axes.ports.breaks[1]);
  const n = (v: number, u: ScaledUnit) => formatIn(v, u);
  // Trục cung có HAI cách chia, và câu chữ phải nói đúng cách đang dùng: nhánh {0} thì
  // nhóm đầu là "chưa có trạm nào" — một khái niệm khác hẳn "ít cổng".
  const portCaption =
    axes.ports.breaks[0] === 0
      ? `cung chưa có · ≤${n(axes.ports.breaks[1], portUnit)} · trên ${n(axes.ports.breaks[1], portUnit)} ${portUnit.label}`
      : `cung cắt ở ${n(axes.ports.breaks[0], portUnit)} · ${n(axes.ports.breaks[1], portUnit)} ${portUnit.label}`;

  return (
    <div className={wrap}>
      <span>
        cầu (hàng) × số cổng (cột) — {rows.length}×{cols.length} nhóm
      </span>
      <span
        className="grid border border-hairline"
        style={{
          height: `${rows.length * 9}px`,
          width: `${cols.length * 9}px`,
          gridTemplateRows: `repeat(${rows.length}, 1fr)`,
          gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
        }}
      >
        {rows.flatMap((r) =>
          cols.map((c) => (
            <i key={`${r}-${c}`} style={{ background: `rgb(${DEMAND_SUPPLY_RGB[r]![c]!.join(",")})` }} />
          )),
        )}
      </span>
      {/* Ngưỡng THẬT, không phải "nhóm 1..3" — §3b. */}
      <span className="tabular-nums text-ink-muted">
        cầu cắt ở {n(axes.pop.breaks[0], popUnit)} · {n(axes.pop.breaks[1], popUnit)}{" "}
        {popUnit.label}
      </span>
      <span className="tabular-nums text-ink-muted">{portCaption}</span>
      <span className="text-ink-muted">so sánh exploratory · không phải opportunity score</span>
    </div>
  );
}

/**
 * Bậc cuối có phải một khoảng mở LỆCH NẶNG không — chỉ khi đó mới in mốc `→ max`.
 *
 * Phép so là `max > ngưỡng_cuối × 3`, và nó chỉ có nghĩa khi ngưỡng cuối DƯƠNG: với một
 * ngưỡng âm thì mọi `max` đều "lớn hơn ba lần nó", nên điều kiện luôn đúng và mốc `→ max`
 * hiện ở cả những thang không hề lệch. Thang phân kỳ là thứ đầu tiên đưa số âm vào `breaks`
 * nên trước đây không ai chạm được vào nhánh này.
 */
function openTopOf(scale: Scale | null): boolean {
  if (!scale || scale.kind !== "numeric" || scale.max === null || scale.breaks.length === 0) return false;
  const last = scale.breaks[scale.breaks.length - 1]!;
  return last > 0 && scale.max > last * 3;
}

/**
 * ĐƯỜNG CHỈ MỐC — một nét mực 1 px đúng ở chỗ hai bậc giáp mốc gặp nhau (§4f).
 *
 * Dải phân kỳ đã đổi sắc ở đó, nhưng đổi sắc chỉ nói "có gì đó khác", không nói "đây là
 * đường ranh". Một nét mực nói ra, và nó dùng đúng ký hiệu VÔ SẮC mà §4b đã dựng cho
 * "đang chọn": mực trên nền màu, đọc được trên cả bậc nhạt nhất lẫn sẫm nhất.
 *
 * `boxShadow: inset` chứ không phải `border`: dải chia bề rộng bằng `flex-1`, và một
 * `border` 1 px sẽ ăn mất 1 px của đúng một bậc — mà hàng mốc phía dưới lại được đặt theo
 * giả định mọi bậc rộng bằng nhau. Nét sẽ lệch khỏi chỗ nó đang chỉ.
 */
function seamAt(scale: Scale | null, i: number): { boxShadow: string } | undefined {
  return scale?.kind === "numeric" && scale.diverge?.index === i
    ? { boxShadow: "inset 1px 0 0 var(--color-ink)" }
    : undefined;
}

/** Legend in GIÁ TRỊ THẬT, không in "bậc 1..7" — §6a. */
function labelsFor(s: Scale, field: FieldMeta): string[] {
  if (s.kind === "bool") return ["không", "có"];
  if (s.kind === "categorical") return s.categories.map(constantShort);
  return formatSeries(s.breaks, scaleOf(field, s));
}

function rgbCss(c: [number, number, number] | undefined): string {
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : "transparent";
}
