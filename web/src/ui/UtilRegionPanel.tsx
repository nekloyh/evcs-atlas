/**
 * Inspector VÙNG TẢI — `docs/UX_UTILIZATION_VISUALIZATION_SPEC.md` §14.2.
 *
 * ── Vì sao một vùng cần một panel, không chỉ một tooltip ──────────────────────────────
 *
 * Tooltip trả lời *"vùng này bao nhiêu"*. Panel trả lời câu đắt hơn: **"con số ấy từ đâu
 * ra"**. Một cell r6 của Hà Nội gộp trung vị 4 trạm, tối đa 51 — và một tỉ lệ gộp từ 51
 * trạm đọc khác hẳn cùng tỉ lệ ấy gộp từ 1 trạm. Chỉ có danh sách contributor mới nói ra
 * điều đó, và nói bằng thứ kiểm được: từng trạm, từng `occ`, từng `n_ports`.
 *
 * ── Ba luật ───────────────────────────────────────────────────────────────────────────
 *
 *   1. **Scrub KHÔNG bỏ chọn.** Đổi `t` chỉ tính lại các con số trong RAM. Nếu vùng thành
 *      null ở giờ mới, panel NÓI RA điều đó và giữ nguyên vùng đang chọn — tự bỏ chọn sẽ
 *      biến "giờ này chưa đủ quan sát" thành "vùng này biến mất", hai câu khác nhau.
 *   2. **Trạm không đóng góp KHÔNG biến mất.** Chúng vào một nhóm riêng có tên. Giấu đi
 *      sẽ khiến `n/N` ở trên không đối chiếu được với danh sách bên dưới.
 *   3. **Xếp theo `Σocc`, không theo tỉ lệ.** `Σocc` là đại lượng đã TẠO RA tử số, nên đọc
 *      từ trên xuống là đọc đúng thứ tự đóng góp. Xếp theo tỉ lệ sẽ đẩy một trạm 1 cổng
 *      bận 100% lên trên một trạm 30 cổng bận 60% — trạm thứ hai mới là thứ làm nên con số.
 */

import type { UtilRegionViewModel } from "../components/atlas/inspector-types";
import { stationSelection, type EntitySelection } from "../state/selection";
import { DOW_FULL, dowOf, hourOf } from "../state/types";
import { UTIL_LOW_COVERAGE } from "../viz/util-regions";
import { hourBucketLabel, occTimezoneDisclosure } from "../viz/occ-time";
import { SourceBlock } from "./Source";

const pct1 = (v: number | null) =>
  v === null || !Number.isFinite(v)
    ? "—"
    : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const num1 = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const int = (v: number) => Math.round(v).toLocaleString("vi-VN");

export interface UtilRegionPanelProps {
  model: UtilRegionViewModel;
  onSelectEntity?: (selection: EntitySelection | null) => void;
  /** Zoom tới mức drill-down và ghim chế độ chấm trạm — §14.2 "Xem trạm". */
  onDrillToStations?: (v: { lng: number; lat: number }) => void;
}

export function UtilRegionPanel({ model, onSelectEntity, onDrillToStations }: UtilRegionPanelProps) {
  const { readout, t, timezone } = model;
  const hourPhrase = hourBucketLabel(hourOf(t), timezone);
  const disclosure = occTimezoneDisclosure(timezone);

  if (model.status === "loading") {
    return (
      <div className="p-3 text-body text-ink-muted" role="status">
        Đang dựng chỉ mục vùng tải…
      </div>
    );
  }

  if (model.status === "not-found" || !readout) {
    return (
      <div className="p-3 text-body text-ink-muted" role="status">
        <p className="font-semibold text-ink-2">Không tìm thấy vùng này</p>
        <p className="mt-1 text-note">
          Mã <span className="font-mono">{model.id}</span> không có trong chỉ mục vùng tải của
          bộ dữ liệu đang mở. Link có thể trỏ tới một tỉnh khác.
        </p>
      </div>
    );
  }

  const lowCoverage =
    readout.portCoverage !== null && readout.portCoverage < UTIL_LOW_COVERAGE;

  return (
    <div className="space-y-3 p-3">
      <header className="space-y-0.5">
        <p className="eyebrow text-ink-muted">VÙNG TẢI · H3 r{readout.resolution}</p>
        <h3 className="truncate font-mono text-body font-semibold text-ink">{readout.h3}</h3>
        <p className="text-note text-ink-muted">
          {DOW_FULL[dowOf(t)]} · {hourPhrase}
        </p>
      </header>

      {/* HERO — tỉ lệ, và NGAY dưới nó là tử số/mẫu số. Một số phần trăm đứng một mình
          không kiểm được, nên nó không bao giờ được đứng một mình (§14.1). */}
      <section className="space-y-1">
        {readout.utilization === null ? (
          <>
            <p className="text-heading font-semibold text-ink-2">Chưa đủ quan sát</p>
            <p className="text-note leading-snug text-ink-muted">
              Không có trạm nào trong vùng đủ quan sát ở ô giờ này. Vùng vẫn đang được chọn —
              kéo scrubber sang giờ khác để đọc lại.
            </p>
          </>
        ) : (
          <>
            <p className="tabular-nums text-heading font-semibold text-ink">
              {pct1(readout.utilization)}{" "}
              <span className="text-body font-normal text-ink-2">cổng bận</span>
              {readout.utilization > 1 && (
                <span className="ml-1 text-note font-normal text-ink-muted">⚠ vượt mẫu số</span>
              )}
            </p>
            <p className="tabular-nums text-body text-ink-2">
              {num1(readout.busyPortsAvg)} / {int(readout.observedPorts)} cổng bận trung bình ·{" "}
              {readout.contributingStations}/{readout.stations} trạm đóng góp
            </p>
          </>
        )}
      </section>

      {/* COVERAGE — số CHÍNH XÁC, không phải một nhãn "đủ/thiếu". Chưa có nghiên cứu sai số
          nào nói bao nhiêu là đủ cho một quyết định vùng (§24-3), nên panel công bố số. */}
      <section className="space-y-0.5 border-t border-hairline pt-2 text-note text-ink-2">
        <p className="tabular-nums">
          Coverage cổng: {int(readout.observedPorts)}/{int(readout.installedPorts)} (
          {pct1(readout.portCoverage)})
        </p>
        <p className="tabular-nums">
          Coverage trạm: {readout.contributingStations}/{readout.stations} ({pct1(readout.stationCoverage)})
        </p>
        <p className="tabular-nums">
          Quan sát: {num1(readout.observedHoursPerPort)} giờ/cổng lắp đặt
        </p>
        {lowCoverage && (
          <p className="text-ink-muted">
            ⚠ Dưới {Math.round(UTIL_LOW_COVERAGE * 100)}% cổng của vùng được quan sát ở ô giờ này —
            vùng vẽ nét đứt trên bản đồ. Đây là cảnh báo dữ liệu mỏng, không phải phán quyết
            về vùng.
          </p>
        )}
        {disclosure && <p className="text-ink-muted">{disclosure}</p>}
        <p className="text-ink-muted">
          Màu đậm = tỉ lệ cổng bận cao hơn. Bộ dữ liệu không có hàng đợi, thời gian chờ hay
          SLA, nên nó <strong className="font-semibold">không</strong> nói được vùng nào quá tải.
        </p>
      </section>

      {/* CONTRIBUTORS — bằng chứng của con số ở trên. */}
      <section className="border-t border-hairline pt-2">
        <p className="eyebrow pb-1 text-ink-muted">
          ĐÓNG GÓP TẠI Ô GIỜ NÀY ({model.contributing.length})
        </p>
        {model.contributing.length === 0 ? (
          <p className="text-note text-ink-muted">Không trạm nào.</p>
        ) : (
          <ul className="space-y-0.5">
            {model.contributing.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectEntity?.(stationSelection(c.id))}
                  className="flex w-full cursor-pointer items-baseline justify-between gap-2 rounded-xs px-1 py-0.5 text-left text-note hover:bg-basemap focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-2">{c.code || c.id}</span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {num1(c.occ)}/{int(c.ports)} cổng · {pct1(c.rate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {model.silent.length > 0 && (
        <section className="border-t border-hairline pt-2">
          <p className="eyebrow pb-1 text-ink-muted">
            KHÔNG ĐÓNG GÓP TẠI Ô GIỜ NÀY ({model.silent.length})
          </p>
          {/* Nhóm này TỒN TẠI, và nó phải tồn tại: `n/N` ở trên chỉ đối chiếu được khi cả
              hai vế đều liệt kê được. "Không đóng góp" ở đây nghĩa là chưa đủ quan sát hoặc
              khuyết `n_ports` — KHÔNG phải "trạm rảnh". */}
          <ul className="space-y-0.5">
            {model.silent.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectEntity?.(stationSelection(s.id))}
                  className="flex w-full cursor-pointer items-baseline justify-between gap-2 rounded-xs px-1 py-0.5 text-left text-note hover:bg-basemap focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{s.code || s.id}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    {s.ports === null ? "chưa rõ số cổng" : `${int(s.ports)} cổng`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onDrillToStations && (
        <button
          type="button"
          onClick={() => onDrillToStations({ lng: readout.lng, lat: readout.lat })}
          className="w-full cursor-pointer rounded-xs border border-hairline px-2 py-1 text-note font-semibold text-ink hover:bg-basemap focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Xem từng trạm trong vùng
        </button>
      )}

      <SourceBlock manifest={model.manifest} cell={null} occ={null} bare />
    </div>
  );
}
