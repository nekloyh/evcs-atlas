/**
 * Phase 6 — Simulation Panel (ui/SimulationPanel.tsx)
 *
 * Panel Before/After của trạm giả định. Cấu trúc theo §3.2, ngôn ngữ theo §3.3, banner và
 * popover phương pháp NGUYÊN VĂN theo §3.4 (số kiểm chứng nội suy từ hiệu chuẩn tỉnh).
 * Luật hiển thị §1.5: dưới 1 km KHÔNG có số điểm — chỉ khoảng; dưới 200 m chỉ "≤ p90".
 * Reference: docs/PHASE6_LOCAL_SIMULATION.md §1.5, §1.8, §3
 */

import React, { useState } from "react";
import type { SimCellResult, SimulationResult } from "../simulation/types";

export interface SimulationPanelProps {
  result: SimulationResult | null;
  error: string | null;
  onClose: () => void;
}

function fmtDist(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "—";
  if (m >= 1000) {
    return `${(m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(m)} m`;
}

function fmtPop(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("vi-VN");
}

function fmtPct(frac: number): string {
  return (frac * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

/**
 * §1.5 — giá trị "Sau" của MỘT ô theo `display`: số điểm chỉ khi e ≥ 1 km; 200 m–1 km là
 * khoảng [e, d̂⁺] (cận dưới CHÍNH XÁC vì mạng ≥ chim bay); dưới 200 m là "≤ p90 dải đo".
 */
function afterDisplayOf(c: SimCellResult): string {
  if (c.display === "point") return `~${fmtDist(c.dAfter)}`;
  if (c.display === "interval") return `${fmtDist(c.e)} – ~${fmtDist(c.dHatUpper)}`;
  if (c.display === "near-band") return `≤ ~${fmtDist(c.dHatUpper)}`;
  return "—";
}

function fmtDelta(n: number): string {
  if (n === 0) return "0";
  const s = fmtPop(Math.abs(n));
  return n > 0 ? `+${s}` : `−${s}`;
}

export function SimulationPanel({
  result,
  error,
  onClose,
}: SimulationPanelProps): React.JSX.Element {
  const [showMethodPopover, setShowMethodPopover] = useState(false);

  if (error) {
    return (
      <div className="p-4 space-y-4 text-sm">
        <div className="flex items-center justify-between border-b pb-2 border-slate-700">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-xs">
              Mô phỏng trạm giả định
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded bg-slate-800"
          >
            Đóng
          </button>
        </div>
        <div className="p-3 rounded bg-amber-950/40 border border-amber-800 text-amber-200">
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-4 text-sm text-slate-400">
        <div className="animate-pulse">Đang tính toán mô phỏng cục bộ...</div>
      </div>
    );
  }

  const { candidate, screening, before, after, cells, context, meta } = result;

  const deltaMedM = after.popWeightedMedianM - before.popWeightedMedianM;

  // §3.2.4 — mini-list Ô ẢNH HƯỞNG: 5 ô TỆ NHẤT theo cự ly TRƯỚC (không phải "giảm nhiều
  // nhất" — câu chuyện của tính năng là vùng đang thiếu, không phải con số đẹp).
  const worstImproved = cells
    .filter((c) => c.cls === "IMPROVES" && c.dOld !== null)
    .sort((a, b) => (b.dOld ?? 0) - (a.dOld ?? 0))
    .slice(0, 5);

  return (
    <div className="p-4 space-y-5 text-sm select-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2 border-slate-700">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-xs">
            Mô phỏng trạm giả định ({candidate.lat.toFixed(4)}, {candidate.lng.toFixed(4)})
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
        >
          Xoá trạm
        </button>
      </div>

      {/* §3.4 — banner NGUYÊN VĂN, luôn hiển thị, không đóng được */}
      <div className="p-3 rounded bg-blue-950/40 border border-blue-800/80 text-blue-200 text-xs leading-relaxed">
        <p>
          <strong>MÔ PHỎNG HÌNH HỌC — không phải định tuyến.</strong> Khoảng cách
          &quot;sau&quot; là ước lượng từ đường chim bay nhân hệ số đi vòng đo tại chỗ,
          trong bán kính 5 km. Không dự báo nhu cầu, mức sử dụng hay doanh thu.
        </p>
      </div>

      {/* §3.2.2 — SÀNG LỌC: chip + biên, kèm dòng định danh RULE cố định */}
      <div className="p-3 bg-slate-800/60 rounded border border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Sàng lọc L6
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
            RULE
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {screening.decision === "DE_XUAT" && (
            <span className="px-2.5 py-1 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-700 font-semibold text-xs">
              ĐỀ XUẤT
            </span>
          )}
          {screening.decision === "DE_XUAT_NEU_CO_DC" && (
            <span className="px-2.5 py-1 rounded bg-amber-900/80 text-amber-300 border border-amber-700 font-semibold text-xs">
              ĐỀ XUẤT NẾU CÓ DC
            </span>
          )}
          {screening.decision === "TU_CHOI" && (
            <span className="px-2.5 py-1 rounded bg-rose-900/80 text-rose-300 border border-rose-700 font-semibold text-xs">
              TỪ CHỐI
            </span>
          )}
          {screening.decision === null && (
            <span className="px-2.5 py-1 rounded bg-slate-700 text-slate-300 text-xs">
              KHÔNG TÍNH ĐƯỢC
            </span>
          )}

          <div className="text-xs text-slate-300">
            {screening.marginM !== null && screening.kind !== null ? (
              <span>
                Biên khoảng cách:{" "}
                <strong
                  className={screening.marginM >= 0 ? "text-emerald-400" : "text-rose-400"}
                >
                  {screening.marginM >= 0
                    ? `+${Math.round(screening.marginM)} m`
                    : `−${Math.round(Math.abs(screening.marginM))} m`}
                </strong>{" "}
                so với ngưỡng ({screening.kind})
              </span>
            ) : screening.kind === null ? (
              <span>Không xác định được loại đơn vị hành chính tại điểm này.</span>
            ) : (
              <span>Chưa có trạm đủ điều kiện nào trong gói dữ liệu.</span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Đầu ra của một RULE, không phải số đo — cơ sở khoảng cách: đường chim bay.
        </p>
        {!screening.highLoadEvaluable && (
          <p className="text-[11px] text-amber-400/90">
            Ngoại lệ cao tải không đánh giá được — lớp mức sử dụng của tỉnh này không đo
            được.
          </p>
        )}
      </div>

      {/* §3.2.3 — TRƯỚC/SAU (§1.8): TRƯỚC là số đo, SAU là ước lượng có ~ và badge */}
      <div className="p-3 bg-slate-800/60 rounded border border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Trung vị cự ly theo dân số (bán kính 5 km)
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-slate-900/80 rounded border border-slate-700/50">
            <div className="text-[10px] text-slate-400 uppercase font-mono">
              TRƯỚC <span className="text-cyan-400">[ĐO ĐẠC]</span>
            </div>
            <div className="text-base font-semibold text-slate-200 mt-1">
              {fmtDist(before.popWeightedMedianM)}
            </div>
          </div>

          <div className="p-2 bg-slate-900/80 rounded border border-slate-700/50">
            <div className="text-[10px] text-slate-400 uppercase font-mono">
              SAU <span className="text-amber-400">[ƯỚC LƯỢNG]</span>
            </div>
            <div className="text-base font-semibold text-amber-300 mt-1">
              ~{fmtDist(after.popWeightedMedianM)}
            </div>
          </div>

          <div className="p-2 bg-slate-900/80 rounded border border-slate-700/50">
            <div className="text-[10px] text-slate-400 uppercase font-mono">THAY ĐỔI</div>
            <div
              className={`text-base font-semibold mt-1 ${
                deltaMedM < 0 ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              {deltaMedM < 0 ? `~ −${fmtDist(Math.abs(deltaMedM))}` : "Không đổi"}
            </div>
          </div>
        </div>

        {/* Dân số theo dải cự ly mạng (§1.8) */}
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-1">Khoảng cách</th>
              <th className="py-1 text-right">Trước [Đo]</th>
              <th className="py-1 text-right">Sau [Ước]</th>
              <th className="py-1 text-right">Δ dân số</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {(
              [
                ["≤ 1 km", "le1km"],
                ["1 – 2 km", "b1_2km"],
                ["2 – 5 km", "b2_5km"],
                ["> 5 km", "gt5km"],
              ] as const
            ).map(([label, key]) => {
              const d = after.popByBand[key] - before.popByBand[key];
              return (
                <tr key={key}>
                  <td className="py-1 font-mono">{label}</td>
                  <td className="py-1 text-right">{fmtPop(before.popByBand[key])}</td>
                  <td className="py-1 text-right text-amber-300">
                    ~{fmtPop(after.popByBand[key])}
                  </td>
                  <td
                    className={`py-1 text-right font-mono ${
                      key === "le1km" && d > 0 ? "text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    {fmtDelta(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Các dòng đếm riêng: UNCERTAIN (§1.8) · NO_BASELINE (§1.6) · EXCLUDED (§1.6) */}
        <div className="text-xs space-y-1 text-slate-400 border-t border-slate-700/60 pt-2">
          <div className="flex justify-between">
            <span>Ô cải thiện rõ rệt (cận trên p90 &lt; cự ly cũ):</span>
            <span className="text-emerald-300 font-medium">
              {after.improved.cells} ô · ~{fmtPop(after.improved.population)} người
            </span>
          </div>
          {after.uncertain.cells > 0 && (
            <div className="flex justify-between text-amber-400/90">
              <span>Thêm {after.uncertain.cells} ô · ~{fmtPop(after.uncertain.population)}{" "}
                người có thể cải thiện, trong biên sai số</span>
              <span>(giữ cự ly cũ)</span>
            </div>
          )}
          {before.noBaseline.cells > 0 && (
            <div className="flex justify-between">
              <span>
                Hiện không tới được trạm nào theo mạng đường — không ước lượng được:
              </span>
              <span>
                {before.noBaseline.cells} ô · {fmtPop(before.noBaseline.population)} người
              </span>
            </div>
          )}
          {before.excluded.cells > 0 && (
            <div className="flex justify-between">
              <span>Không có đường trong 2 km quanh ô — không mô phỏng được:</span>
              <span>
                {before.excluded.cells} ô · {fmtPop(before.excluded.population)} người
              </span>
            </div>
          )}
        </div>

        {meta.zoneTruncated && (
          <p className="text-[11px] text-amber-400/90">
            Vùng ảnh hưởng bị cắt ở ranh giới gói dữ liệu — ô phía tỉnh bên không được
            tính.
          </p>
        )}
      </div>

      {/* §3.2.4 — 5 ô ảnh hưởng TỆ NHẤT theo cự ly Trước, hiển thị theo luật §1.5 */}
      {worstImproved.length > 0 && (
        <div className="p-3 bg-slate-800/60 rounded border border-slate-700 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              5 ô xa trạm nhất có cải thiện
            </span>
            <span className="text-[10px] text-amber-400 font-mono">ƯỚC LƯỢNG</span>
          </div>
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="py-1">Ô H3</th>
                <th className="py-1 text-right">Trước [Đo]</th>
                <th className="py-1 text-right">Sau [Ước]</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {worstImproved.map((c) => (
                <tr key={c.h3}>
                  <td className="py-1 font-mono text-[11px] text-slate-400 truncate max-w-[90px]">
                    {c.h3}
                  </td>
                  <td className="py-1 text-right font-mono">{fmtDist(c.dOld)}</td>
                  <td className="py-1 text-right font-mono text-amber-300">
                    {afterDisplayOf(c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* §3.2.5 — trạm hiện hữu lân cận, mức sử dụng ĐO ĐƯỢC kèm cửa sổ có ngày */}
      <div className="p-3 bg-slate-800/60 rounded border border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Trạm hiện hữu lân cận (≤ 5 km)
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {context.stationsWithin5km.length} trạm
          </span>
        </div>

        {context.stationsWithin5km.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Không có trạm hiện hữu nào trong bán kính 5 km.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {context.stationsWithin5km.map((st) => (
              <div
                key={st.code}
                className="p-2 bg-slate-900/60 rounded border border-slate-800 text-xs flex justify-between items-center"
              >
                <div className="truncate max-w-[170px]">
                  <div className="font-medium text-slate-200 truncate">{st.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {st.nPorts} cổng · {st.powerKw} kW
                    {st.util !== null && (
                      <span className="ml-1.5 text-cyan-300">
                        · mức sử dụng {(st.util * 100).toFixed(0)}%
                        {st.window && (
                          <span className="text-slate-500">
                            {" "}
                            ({fmtDate(st.window[0])} → {fmtDate(st.window[1])})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-mono text-slate-300 text-right shrink-0">
                  {fmtDist(st.euclidM)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* §3.2.6 — popover phương pháp, nội dung NGUYÊN VĂN §3.4 + đếm pop_source (§1.8) */}
      <div className="text-[11px] text-slate-500 space-y-2 pt-1 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <span>
            Bán kính mô phỏng: 5.000 m · Hiệu chuẩn v{meta.calibrationVersion}
          </span>
          <button
            type="button"
            onClick={() => setShowMethodPopover(!showMethodPopover)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            Cách tính &amp; giới hạn
          </button>
        </div>

        {showMethodPopover && (
          <div className="p-3 bg-slate-900 border border-slate-700 rounded text-slate-300 text-xs space-y-2 shadow-xl leading-relaxed">
            <p>
              Cách tính: với mỗi ô trong bán kính 5 km, khoảng cách tới trạm giả định
              được ước lượng bằng đường chim bay × hệ số đi vòng (chọn theo dải khoảng
              cách và láng giềng của ô, hiệu chuẩn riêng cho tỉnh này). Kiểm chứng trên{" "}
              {meta.validation.n.toLocaleString("vi-VN")} ô của tỉnh:{" "}
              {fmtPct(meta.validation.within20pct)} % nằm trong ±20 %; cận trên giữ mức
              vượt ≈ {fmtPct(meta.validation.upperMiss)} %. Dưới 1 km sai số lớn hơn nên
              chỉ hiển thị khoảng, không hiển thị một con số. Ô hiện không tới được theo
              mạng đường thì không ước lượng được và được đếm riêng.
            </p>
            <p>
              Dữ liệu trạm chốt ngày {fmtDate(meta.manifestExported)}; mạng trạm đổi thì
              kết quả đổi. Mức sử dụng đo trong cửa sổ 30 ngày, gần như toàn bộ thuộc một
              nhà vận hành. Bộ dữ liệu <strong>không chứa cơ sở</strong> để ước lượng:
              giảm tải trạm hiện có · mức sử dụng tương lai · doanh thu · nhu cầu xe điện
              tương lai — bảng này cố ý không hiển thị chúng. Kết quả SÀNG LỌC là đầu ra
              của một quy tắc chính sách, không phải một số đo.
            </p>
            {meta.flaggedPopSourceCells > 0 && (
              <p className="text-slate-400">
                Trong vùng có {meta.flaggedPopSourceCells} ô dùng nguồn dân số chưa neo
                được vào địa giới VNSDI — tổng dân của các dòng trên mang sai số của phép
                neo.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
