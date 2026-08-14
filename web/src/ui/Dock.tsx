/**
 * Compare dock chỉ dựng linked view người dùng đã yêu cầu. Nó không phải dashboard ba
 * biểu đồ: distribution, demand × access và utilization pattern là ba câu hỏi khác nhau.
 */

import type { FieldMeta } from "../fields";
import { STATION_OCC_FIELD } from "../fields";
import type { BrushState, Range, ScatterBrush, WindowBrush } from "../state/brush";
import { DOW_LABELS, type CompareView } from "../state/types";
import { useStore } from "../state/store";
import type { CityHour } from "../viz/occ";
import { heatmapUnitSentence, hourProfile, hourProfileSentence } from "../viz/occ";
import { formatBreak, type Scale } from "../viz/palette";
import { unitNoun } from "../fields";
import { Heatmap168 } from "./Heatmap168";
import { Histogram } from "./Histogram";
import { HourProfile } from "./HourProfile";
import { Scatter, type Point } from "./Scatter";

export const DOCK_W = 360;

export interface DockData {
  /** giá trị KHÔNG null của trường đang tô, trên chính hình học đang tô */
  histValues: number[];
  /** ô có ĐỦ hai trục; ô thiếu một trục không có chỗ trên mặt phẳng (xem `Scatter`) */
  points: Point[];
  /** ô bị bỏ khỏi scatter vì thiếu một trục — đếm ở đây thay vì để hình im lặng về chúng */
  nScatterMissing: number;
  city: CityHour[];
  /** thang của `station:occ`, dùng chung giữa heatmap và chấm trạm */
  occScale: Scale | null;
  /** số mark còn lại / tổng, sau phép AND — đo trên chính dữ liệu đang vẽ */
  kept: { n: number; total: number } | null;
}

function Section({
  title,
  note,
  children,
  onClear,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
  onClear?: () => void;
}) {
  return (
    <section className="border-b border-hairline">
      <h3 className="flex items-baseline gap-2 border-b border-hairline bg-basemap px-2 py-1 text-body tracking-[0.1em] text-ink-2">
        {title}
        {onClear && (
          <button
            onClick={onClear}
            className="ml-auto cursor-pointer border border-hairline px-1 tracking-normal text-note text-ink-2 hover:bg-panel"
          >
            bỏ chọn
          </button>
        )}
      </h3>
      <div className="px-2 pt-1">{children}</div>
      <p className="px-2 pb-2 text-note leading-snug text-ink-muted">{note}</p>
    </section>
  );
}

export function Dock({ field, data, view }: { field: FieldMeta; data: DockData; view: CompareView }) {
  const brush = useStore((s) => s.brush);
  const setBrush = useStore((s) => s.setBrush);
  const setField = useStore((s) => s.setField);
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);

  const patch = (p: Partial<BrushState>) => {
    const next: BrushState = { ...brush, ...p };
    // Xoá thật sự, không để lại khoá `undefined`: `serializeBrush` đọc theo sự có mặt của
    // khoá, và một khoá `undefined` sót lại sẽ làm hai state giống nhau cho hai chuỗi khác.
    for (const k of ["hist", "scatter", "win"] as const) if (next[k] === undefined) delete next[k];
    setBrush(next);
  };

  const onRange = (r: Range | null) =>
    patch({ hist: r ? { field: field.id, range: r } : undefined });
  const onScatter = (s: ScatterBrush | null) => patch({ scatter: s ?? undefined });
  const onWindow = (w: WindowBrush | null) => patch({ win: w ?? undefined });

  const isOcc = field.id === STATION_OCC_FIELD;
  return (
    <div className="min-w-0">

      {/* Kết quả của phép AND, ngay dưới tiêu đề: đây là con số duy nhất nói được "bộ lọc
          đang làm gì", và §13b-2 đòi một tập đã thu hẹp phải ĐẾM ĐƯỢC. */}
      {view === "distribution" && data.kept && (
        <p className="shrink-0 border-b border-hairline px-2 py-1 text-body text-ink-2">
          <span className="tabular-nums">
            {data.kept.n.toLocaleString("vi-VN")}/{data.kept.total.toLocaleString("vi-VN")}
          </span>{" "}
          {field.readAs === "commune" ? "xã" : field.readAs === "road" ? "đoạn" : field.readAs === "station" ? "trạm" : "ô"}{" "}
          còn lại sau brush — phần bị loại chuyển xám nhạt trên bản đồ,{" "}
          <span className="text-ink-muted">không biến mất.</span>
        </p>
      )}

      {view === "distribution" && <Section
        title="HISTOGRAM"
        onClear={brush.hist ? () => onRange(null) : undefined}
        note={
          brush.hist
            ? `đang chọn ${formatBreak(brush.hist.range.lo)} – ${formatBreak(brush.hist.range.hi)} · ${field.label.toLowerCase()}`
            : `${field.label.toLowerCase()} — kéo ngang để chọn một khoảng giá trị. Ô không có giá trị bị loại khi brush này bật: không biết thì không khẳng định được là “trong khoảng”.`
        }
      >
        {data.histValues.length > 0 ? (
          <Histogram
            values={data.histValues}
            range={brush.hist?.range}
            onRange={onRange}
            // Số mark KHÔNG có giá trị = tổng trên hình học đang tô, trừ số vào được trục.
            // Nó phải hiện ra: một histogram im lặng trông như nói về toàn bộ dữ liệu.
            nMissing={Math.max(0, (data.kept?.total ?? 0) - data.histValues.length)}
            unitNoun={unitNoun(field.readAs)}
          />
        ) : (
          <p className="py-3 text-body text-ink-muted">
            Trường này không phải thang số, nên nó không có “khoảng giá trị” để kéo.
          </p>
        )}
      </Section>}

      {view === "demand-access" && <Section
        title="SCATTER"
        onClear={brush.scatter ? () => onScatter(null) : undefined}
        note={
          brush.scatter
              ? `đang chọn dân ${formatBreak(brush.scatter.xr.lo)}–${formatBreak(brush.scatter.xr.hi)} · ${formatBreak(brush.scatter.yr.lo)}–${formatBreak(brush.scatter.yr.hi)} m tới trạm`
              : "kéo một hộp để chọn theo CẢ HAI trục. Góc phải-trên là “đông người mà xa trạm” — chính là tập ô mà bài toán đặt trạm nói về."
        }
      >
        <Scatter
          points={data.points}
          brush={brush.scatter}
          onBrush={onScatter}
          nMissing={data.nScatterMissing}
        />
      </Section>}

      {view === "utilization-pattern" && <Section
        title="NHỊP 168 GIỜ"
        onClear={brush.win ? () => onWindow(null) : undefined}
        note={
          brush.win
            ? `cửa sổ ${DOW_LABELS[brush.win.dow.lo]}–${DOW_LABELS[brush.win.dow.hi]} · ${brush.win.hour.lo}h–${brush.win.hour.hi}h — scrubber lặp trong đó. Cửa sổ KHÔNG làm xám mark: bản đồ chỉ hiện một giờ, nên nó tác động qua giờ đang xem.`
            : heatmapUnitSentence(data.city)
        }
      >
        {data.city.length > 0 ? (
          <>
            <Heatmap168
              cells={data.city}
              scale={data.occScale}
              t={t}
              win={brush.win}
              onT={setT}
              onWindow={onWindow}
            />
            {/*
              Hồ sơ biên 24 giờ — dán NGAY DƯỚI heatmap, chung trục giờ. Nó không phải một
              biểu đồ thứ tư: nó là **cùng dữ liệu, kênh khác** (xem `HourProfile`). Heatmap
              trả lời "thứ nào × giờ nào", hồ sơ trả lời "nhịp ngày sâu cỡ nào" — câu thứ
              hai màu không nói được vì thang màu đã bị khoá chung với chấm trạm.
            */}
            <HourProfile cells={data.city} t={t} onT={setT} />
            <p className="pb-1 text-note leading-snug text-ink-muted">
              {hourProfileSentence(hourProfile(data.city))}
            </p>
            {!isOcc && (
              <p className="pb-1 text-note leading-snug text-ink-muted">
                Bản đồ đang tô một trường khác, nên giờ đang xem chưa đổi gì trên đó.{" "}
                <button
                  onClick={() => setField(STATION_OCC_FIELD)}
                  className="cursor-pointer border border-hairline px-1 text-ink-2 hover:bg-basemap"
                >
                  tô nhịp trạm
                </button>
              </p>
            )}
          </>
        ) : (
          <p className="py-3 text-body text-ink-muted">Đang nạp hồ sơ 168 giờ…</p>
        )}
      </Section>}
    </div>
  );
}
