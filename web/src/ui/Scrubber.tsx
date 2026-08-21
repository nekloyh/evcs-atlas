/**
 * Scrubber đáy, 56px — DESIGN.md §3e.
 *
 * 168 giờ chia **7 khối thứ**, nhãn `T2 … CN` (`dow = 0` là **Thứ Hai** — `docs/COT.md`
 * §6, và đó là chỗ dễ sai nhất của cả mốc này: mọi thư viện ngày tháng mặc định `0` là Chủ
 * Nhật, nên nhãn sẽ lệch một ngày mà không có lỗi nào).
 *
 * **Play bằng `requestAnimationFrame`, không thêm dependency animation nào** (§1).
 * `rAF` chứ không phải `setInterval` vì hai lý do đo được: trình duyệt tạm dừng nó khi tab
 * ẩn (một scrubber chạy trong tab không ai nhìn là đốt pin cho không), và nó mang sẵn dấu
 * thời gian thật — nên tốc độ 4 giờ/giây là **4 giờ mỗi giây đồng hồ**, không phải "4 lần
 * mỗi 250 ms nếu máy kịp".
 */

import { useEffect, useRef } from "react";

import { STATION_OCC_FIELD } from "../fields";
import { useStore } from "../state/store";
import { DOW_LABELS, HOURS_IN_WEEK, dowOf, hourOf, scrubberKeyStep } from "../state/types";
import { HAIRLINE_HEX, RAMP_HEX } from "../viz/palette";

/** Tốc độ mặc định — §3e. */
const HOURS_PER_SEC = 4;

const MARK = RAMP_HEX[4];

/** Snapshot presets complement playback; each is a real `(dow, hour)` in the 168h source. */
const PRESETS = [
  { label: "đêm", t: 1 },
  { label: "sáng", t: 8 },
  { label: "trưa", t: 12 },
  { label: "tối", t: 18 },
  { label: "T2", t: 8 },
  { label: "T7", t: 5 * 24 + 8 },
] as const;

export function Scrubber({ field }: { field: string }) {
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const stepT = useStore((s) => s.stepT);
  const setField = useStore((s) => s.setField);
  const isOcc = field === STATION_OCC_FIELD;

  // Vòng play. `acc` cộng dồn thời gian THẬT giữa hai khung hình rồi rút ra từng giờ một,
  // nên một khung hình bị bỏ lỡ không làm scrubber chậm lại — nó nhảy đúng số giờ đã trôi.
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let prev = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += (now - prev) / 1000;
      prev = now;
      while (acc >= 1 / HOURS_PER_SEC) {
        acc -= 1 / HOURS_PER_SEC;
        // Lặp VÔ HẠN (§3e), và lặp TRONG cửa sổ brush nếu có — `stepT` giữ luật đó, ở đây
        // không lặp lại nó lần thứ hai.
        stepT();
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, stepT]);

  return (
    /* Chiều cao theo NỘI DUNG, không phải `h-14` cố định.
       Bên trong là ba hàng xếp dọc (nhãn giờ · snapshot · 168 vạch); `h-14` = 56 px chỉ đủ
       hai hàng đầu, nên hàng vạch — thứ duy nhất ở đây thật sự là một điều khiển — bị xén
       mất một nửa ở mép dưới màn hình và không bấm trúng được. */
    <div className="flex shrink-0 items-stretch border-t border-hairline bg-panel text-body">
      <button
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? "dừng" : `chạy — ${HOURS_PER_SEC} giờ/giây, lặp vô hạn`}
        title={playing ? "dừng" : `chạy — ${HOURS_PER_SEC} giờ/giây, lặp vô hạn`}
        className="w-14 shrink-0 cursor-pointer border-r border-hairline text-heading hover:bg-basemap"
      >
        {playing ? "▮▮" : "▶"}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
        <div className="flex items-baseline gap-2 pb-1">
          <span className="tabular-nums font-semibold">
            {DOW_LABELS[dowOf(t)]} {String(hourOf(t)).padStart(2, "0")}:00
          </span>
          {/* Chế độ chưa tác động phải TRÔNG như chưa tác động — cùng luật §3a. Kèm nút đi
              thẳng tới trường đó: một bước, không bắt người xem tự tìm trong 46 dòng radio. */}
          {!isOcc && (
            <span className="ml-auto flex items-center gap-2 text-ink-muted">
              chỉ tác động khi chọn trường nhịp trạm
              <button
                onClick={() => setField(STATION_OCC_FIELD)}
                className="cursor-pointer border border-hairline px-1 text-ink-2 hover:bg-basemap"
              >
                chọn trường đó
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 pb-1 text-note text-ink-muted">
          <span>snapshot:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setPlaying(false);
                setT(p.t);
              }}
              className="cursor-pointer border border-hairline px-1 hover:bg-basemap"
              title={`đặt ${p.label} — snapshot tĩnh, không phải trung bình`}
            >
              {p.label}
            </button>
          ))}
          <span className="pl-1">heatmap/hồ sơ 24h trong dock là comparison tĩnh.</span>
        </div>

        <Track t={t} onT={setT} />
      </div>
    </div>
  );
}

/**
 * 168 vạch giờ, 7 khối thứ.
 *
 * Vạch vẽ bằng `<div>` chứ không bằng Observable Plot: đây không phải một biểu đồ (không
 * trục giá trị, không mark dữ liệu) mà là một **điều khiển**, và §1 chốt Plot cho biểu đồ.
 * Dựng một thanh trượt bằng thư viện vẽ sẽ vừa nặng hơn vừa khó bấm trúng hơn.
 */
function Track({
  t,
  onT,
}: {
  t: number;
  onT: (t: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);

  const pick = (clientX: number) => {
    const r = el.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onT(Math.floor(((clientX - r.left) / r.width) * HOURS_IN_WEEK));
  };

  return (
    /* `role="slider"` + phím mũi tên (Phase 10): trước đó track chỉ nghe pointer — bàn
       phím và AT không có đường vào 168 giờ ngoài heatmap dock (thứ không phải lúc nào
       cũng mở). Bước phím theo chuẩn slider: ←/→ một giờ, PageUp/Down một ngày, Home/End
       hai mút tuần. */
    <div
      ref={el}
      role="slider"
      tabIndex={0}
      aria-label="Giờ trong tuần"
      aria-valuemin={0}
      aria-valuemax={HOURS_IN_WEEK - 1}
      aria-valuenow={t}
      aria-valuetext={`${DOW_LABELS[dowOf(t)]} ${String(hourOf(t)).padStart(2, "0")}:00`}
      className="relative flex h-5 cursor-pointer touch-none select-none items-stretch"
      onKeyDown={(e) => {
        const next = scrubberKeyStep(t, e.key);
        if (next === null) return; // phím lạ đi tiếp — Tab phải thoát được khỏi track
        e.preventDefault();
        onT(next);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) pick(e.clientX);
      }}
    >
      {DOW_LABELS.map((label, d) => (
        <div
          key={label}
          className="relative min-w-0 flex-1 border-r border-hairline last:border-r-0"
          style={{ background: d % 2 === 0 ? "transparent" : `${HAIRLINE_HEX}55` }}
        >
          <span className="pointer-events-none absolute left-1 top-0 text-note leading-none text-ink-muted">
            {label}
          </span>
          {/* 24 vạch giờ. Cả 168 giờ đều xem được: Phase 4 bỏ cửa sổ playback của dock. */}
          <div className="flex h-full items-end">
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="min-w-0 flex-1"
                style={{
                  height: h % 6 === 0 ? "60%" : "35%",
                  borderLeft: `1px solid ${HAIRLINE_HEX}`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
      {/* Đầu đọc — mực của chuỗi dữ liệu (§4d-2 c5), vì nó chỉ vào chính thứ bản đồ đang vẽ. */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{ left: `${(t / HOURS_IN_WEEK) * 100}%`, width: `${(1 / HOURS_IN_WEEK) * 100}%`, background: MARK }}
      />
    </div>
  );
}
