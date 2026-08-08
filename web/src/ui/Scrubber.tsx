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
import { inWindow } from "../state/brush";
import { useStore } from "../state/store";
import { DOW_LABELS, HOURS_IN_WEEK, dowOf, hourOf } from "../state/types";
import { HAIRLINE_HEX, RAMP_HEX } from "../viz/palette";

/** Tốc độ mặc định — §3e. */
const HOURS_PER_SEC = 4;

const MARK = RAMP_HEX[4];

export function Scrubber({ field }: { field: string }) {
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const stepT = useStore((s) => s.stepT);
  const setField = useStore((s) => s.setField);
  const win = useStore((s) => s.brush.win);
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
    <div className="flex h-14 shrink-0 items-stretch border-t border-hairline bg-panel text-[11px]">
      <button
        onClick={() => setPlaying(!playing)}
        title={playing ? "dừng" : `chạy — ${HOURS_PER_SEC} giờ/giây, lặp vô hạn`}
        className="w-14 shrink-0 cursor-pointer border-r border-hairline text-[13px] hover:bg-basemap"
      >
        {playing ? "▮▮" : "▶"}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-3">
        <div className="flex items-baseline gap-2 pb-1">
          <span className="tabular-nums font-semibold">
            {DOW_LABELS[dowOf(t)]} {String(hourOf(t)).padStart(2, "0")}:00
          </span>
          {win && (
            <span className="text-ink-muted">
              lặp trong cửa sổ {DOW_LABELS[win.dow.lo]}–{DOW_LABELS[win.dow.hi]} · {win.hour.lo}h–{win.hour.hi}h
            </span>
          )}
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

        <Track t={t} onT={setT} dimOutsideWindow={(tt) => !inWindow(win, tt)} />
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
  dimOutsideWindow,
}: {
  t: number;
  onT: (t: number) => void;
  dimOutsideWindow: (t: number) => boolean;
}) {
  const el = useRef<HTMLDivElement>(null);

  const pick = (clientX: number) => {
    const r = el.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onT(Math.floor(((clientX - r.left) / r.width) * HOURS_IN_WEEK));
  };

  return (
    <div
      ref={el}
      className="relative flex h-5 cursor-pointer touch-none select-none items-stretch"
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
          <span className="pointer-events-none absolute left-1 top-0 text-[9px] leading-none text-ink-muted">
            {label}
          </span>
          {/* 24 vạch giờ. Giờ ngoài cửa sổ brush MỜ đi — cùng ký hiệu "bị loại" của bản đồ. */}
          <div className="flex h-full items-end">
            {Array.from({ length: 24 }, (_, h) => {
              const tt = d * 24 + h;
              return (
                <span
                  key={h}
                  className="min-w-0 flex-1"
                  style={{
                    height: h % 6 === 0 ? "60%" : "35%",
                    borderLeft: `1px solid ${HAIRLINE_HEX}`,
                    opacity: dimOutsideWindow(tt) ? 0.25 : 1,
                  }}
                />
              );
            })}
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
