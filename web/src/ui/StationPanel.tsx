/**
 * Phase 3 — Station Inspector Presenter
 *
 * Implements the 9-section reading order specified in §5 PHASE3_INSPECTOR.md:
 * Summary (Header -> Hero -> Supporting) -> Evidence (Heatmap, Shape, Quality, Connectors -> Comparison)
 * -> Technical details (<details> allowlist) -> CTA & States.
 */

import * as React from "react";
import type { StationViewModel } from "../components/atlas/inspector-types";
import { cellSelection, communeSelection, type EntitySelection } from "../state/selection";
import { isInScope } from "../data/scope";
import { CONSTANTS, FIELD_BY_ID, STATION_OCC_FIELD, constantShort } from "../fields";
import { DOW_FULL } from "../state/types";
import type { Scale } from "../viz/palette";
import { themeFor } from "../viz/theme";
import { MiniHeatmap } from "./MiniHeatmap";
import { formatValue } from "./format";
import { SourceBlock } from "./Source";
import { Copy, Check } from "lucide-react";
import { formatPercentile, formatTriState } from "./inspector-format";

/**
 * Mini-heatmap luôn vẽ `station:occ` — bằng chứng của TRẠM, không đổi theo lens đang mở —
 * nên theme của nó đọc thẳng từ chính trường ấy trong registry thay vì gõ tên bảng màu.
 * Đối số representation là trơ ở đây: `themeFor` chỉ dùng nó cho `population` đọc theo ô.
 */
const OCC_THEME = themeFor(FIELD_BY_ID.get(STATION_OCC_FIELD)!, "hex");

export interface StationPanelProps {
  model?: StationViewModel;
  onSelectEntity?: (selection: EntitySelection | null) => void;
  onT?: (t: number) => void;

  // Legacy fallback props
  id?: string;
  detail?: any;
  loading?: boolean;
  error?: string | null;
  series?: (number | null)[] | null;
  scale?: Scale | null;
  t?: number;
}

export function StationPanel(props: StationPanelProps) {
  // Normalize props from model or legacy props
  const model = props.model;
  const id = model ? model.id : (props.id ?? "");
  const status = model ? model.status : props.loading ? "loading" : props.error ? "error" : props.detail ? "ready" : "not-found";
  const error = model ? model.error : props.error;
  const detail = model ? model.detail : props.detail;
  const series = model ? model.series : props.series;
  const scale = model ? model.occScale : props.scale;
  const t = model ? model.t : (props.t ?? 0);
  const onT = props.onT ?? (() => {});
  const onSelectEntity = props.onSelectEntity ?? (() => {});
  const datasetName = model ? model.datasetName : "Hà Nội";
  const activeField = model ? model.activeField : null;

  const [copied, setCopied] = React.useState(false);

  const handleCopyId = () => {
    if (!id) return;
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── 8. Empty State / Loading / Error ───────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="p-3 text-body text-ink-muted">
        Đang nạp dữ liệu trạm <span className="font-mono">{id}</span>…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="p-3 text-body leading-snug text-ink-2">
        <p className="font-medium text-warn">Lỗi đọc dữ liệu trạm:</p>
        <p className="mt-1 font-mono text-note text-ink-muted">{error}</p>
      </div>
    );
  }

  if (status === "not-found" || !detail) {
    return (
      <div className="p-3 text-body leading-snug text-ink-2">
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <span className="font-mono text-note text-ink-muted">{id}</span>
        </div>
        <p className="pt-3 text-body text-ink">
          Không tìm thấy trạm trong bộ dữ liệu đang mở ({datasetName}).
        </p>
        <p className="pt-1 text-note text-ink-muted">
          Mã trạm đúng quy chuẩn nhưng không tồn tại trong snapshot hiện tại.
        </p>
      </div>
    );
  }

  const s = detail.station;
  const o = detail.occ;
  const opStatus = String(s["op_status"] ?? "UNKNOWN");
  const isMaintenance = opStatus === "MAINTENANCE" || opStatus === "OUT_OF_SERVICE";
  const inScope = isInScope(String(s["scope"] ?? ""));

  // Active field identification
  const isOccActive = activeField?.id === "station:occ";
  const isPortsActive = activeField?.id === "station:ports";

  // 168h series value at hour t
  const occAtT = series && t >= 0 && t < series.length ? series[t] : null;
  const util30d = num(o?.["util"]);
  const p95 = num(o?.["util_p95"]);
  const satFrac = num(o?.["saturation_frac"]);
  const nPorts = num(s["n_ports"]);
  const powerKw = num(s["power_kw_site"]);
  const powerMaxPort = num(s["power_kw_max_port"]);
  const freshness = num(s["freshness"]);

  return (
    <div className="text-title">
      {/* ── 1. HEADER ──────────────────────────────────────────────────────── */}
      <header className="border-b border-hairline px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-heading font-semibold leading-tight text-ink">
            {str(s["name"]) ?? "Trạm không tên"}
          </h2>
          <button
            onClick={handleCopyId}
            title="Sao chép mã trạm"
            className="flex shrink-0 items-center gap-1 rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-note text-ink-muted hover:border-ink-2 hover:text-ink cursor-pointer"
          >
            <span>{id}</span>
            {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>

        <div className="pt-1 text-body text-ink-muted">
          {[
            str(s["operator"]),
            constantShort(String(s["access"] ?? "")),
            inScope ? "trong phạm vi" : "vành đệm 5 km",
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>

        {str(s["address"]) && (
          <div className="pt-0.5 text-body leading-snug text-ink-2">{str(s["address"])}</div>
        )}

        {/* Operating status banner */}
        {isMaintenance && (
          <div className="mt-2 flex items-start gap-1.5 rounded-xs border border-amber-500/20 bg-amber-500/10 p-2 text-body leading-snug text-ink">
            <span className="shrink-0 text-amber-500 font-bold">⚠</span>
            <span>
              <strong>{constantShort(opStatus)}</strong> — Trạm đang bảo trì hoặc tạm ngưng phục vụ.
              Các chỉ số cổng và công suất là <em>tài sản đã lắp</em>, không nhất thiết đang hoạt động.
            </span>
          </div>
        )}
        {opStatus === "UNKNOWN" && (
          <div className="mt-2 rounded-xs border border-hairline bg-basemap/30 p-1.5 text-note leading-snug text-ink-muted">
            Nguồn dữ liệu không ghi nhận trạng thái vận hành của trạm này.
          </div>
        )}
      </header>

      {/* ── 2. HERO METRIC ─────────────────────────────────────────────────── */}
      <div className="border-b border-hairline px-3 py-3">
        {isOccActive ? (
          <div>
            <div className="text-body font-medium text-ink-2">Nhịp sử dụng tại giờ {t % 24}h ({DOW_FULL[Math.floor(t / 24)]})</div>
            <div className="text-readout font-semibold leading-none pt-1">
              {occAtT === null || occAtT === undefined ? (
                <span className="text-heading italic text-ink-muted">không đủ quan sát</span>
              ) : (
                pct1(occAtT)
              )}
            </div>
            <div className="pt-1 text-body text-ink-muted">
              Tỉ lệ cổng bận ÷ cổng lắp đặt tại thời điểm được chọn.
            </div>
          </div>
        ) : isPortsActive ? (
          <div>
            <div className="text-body font-medium text-ink-2">Số cổng lắp đặt</div>
            <div className="text-readout font-semibold leading-none pt-1">
              {nPorts === null ? (
                <span className="text-heading italic text-ink-muted">chưa khai báo</span>
              ) : (
                `${nPorts.toLocaleString("vi-VN")} cổng`
              )}
            </div>
            <div className="pt-1 text-body text-ink-muted">
              Tổng số cổng sạc công cộng đã lắp đặt tại trạm.
            </div>
          </div>
        ) : (
          <div>
            <div className="text-body text-ink-muted italic">
              Lens hiện tại không có giá trị trực tiếp ở cấp trạm.
            </div>
            <div className="pt-1 text-note text-ink-muted">
              Trường phân tích đang chọn ({activeField?.label ?? "khác"}) áp dụng ở cấp độ không gian khác.
            </div>
          </div>
        )}
      </div>

      {/* ── 3. SUPPORTING METRICS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-b border-hairline">
        {isOccActive ? (
          <>
            <Tile
              label="TB 30 ngày"
              value={util30d !== null ? pct1(util30d) : null}
              missingText="không đo được"
              hint="Tỉ lệ cổng-giờ bận trung bình trong 30 ngày qua"
            />
            <Tile
              label="Đỉnh (p95)"
              value={p95 !== null ? pct1(p95) : null}
              missingText="không đo được"
              hint="Phân vị 95 của tỉ lệ cổng bận theo giờ"
            />
            <Tile
              label="Kín toàn bộ"
              value={satFrac !== null ? pct1(satFrac) : null}
              missingText="không đo được"
              hint="Phần trăm thời gian tất cả các cổng đều có xe đang sạc"
            />
          </>
        ) : isPortsActive ? (
          <>
            <Tile
              label="Công suất trạm"
              value={powerKw !== null ? `${formatValue(powerKw)} kW` : null}
              missingText="chưa khai"
              hint="Tổng công suất danh định của trạm sạc"
            />
            <Tile
              label="CS max/cổng"
              value={powerMaxPort !== null ? `${formatValue(powerMaxPort)} kW` : null}
              missingText="chưa khai"
              hint="Công suất tối đa của một cổng tại trạm"
            />
            <Tile
              label="Sử dụng 30 ngày"
              value={util30d !== null ? pct1(util30d) : null}
              missingText="không đo được"
              hint="Tỉ lệ sử dụng trung bình 30 ngày"
            />
          </>
        ) : (
          <>
            <Tile
              label="Cổng lắp đặt"
              value={nPorts !== null ? `${nPorts}` : null}
              missingText="chưa khai"
              hint="Số cổng lắp đặt (thông tin bối cảnh)"
            />
            <Tile
              label="Công suất"
              value={powerKw !== null ? `${formatValue(powerKw)} kW` : null}
              missingText="chưa khai"
              hint="Công suất trạm (thông tin bối cảnh)"
            />
            <Tile
              label="Sử dụng 30 ngày"
              value={util30d !== null ? pct1(util30d) : null}
              missingText="không đo được"
              hint="Tỉ lệ sử dụng 30 ngày (thông tin bối cảnh)"
            />
          </>
        )}
      </div>

      {/* ── 4. EVIDENCE ────────────────────────────────────────────────────── */}
      <section className="border-b border-hairline">
        <h3 className="border-b border-hairline bg-basemap/50 px-3 py-1.5 text-body font-semibold tracking-[0.05em] text-ink-2">
          BẰNG CHỨNG
        </h3>

        {/* Mini-Heatmap 7x24 */}
        <div className="px-3 pt-2">
          {series && scale ? (
            <MiniHeatmap values={series} scale={scale} theme={OCC_THEME} t={t} onT={onT} />
          ) : (
            <p className="py-2 text-body text-ink-muted">
              {detail.occStatus === "unavailable"
                ? "Không đọc được telemetry trong snapshot này."
                : detail.occStatus === "not-found"
                  ? "Trạm không có hồ sơ telemetry trong snapshot này."
                  : "Hồ sơ 168 giờ chưa sẵn sàng."}
            </p>
          )}
        </div>
        <p className="px-3 pb-2 pt-1 text-note leading-snug text-ink-muted">
          Cùng thang chia bậc với lớp trạm trên bản đồ. Ô vân xám = chưa quan sát đủ 1 giờ. Bấm ô để chuyển giờ xem.
        </p>

        {/* Shape Pattern Translation Sentence */}
        {o && (
          <div className="border-t border-hairline px-3 py-2 text-title leading-relaxed text-ink bg-basemap/20">
            {shapeSentence(o)}
          </div>
        )}

        {/* Measurement Quality Block */}
        {o && (
          <div className="border-t border-hairline px-3 py-2">
            <div className="text-body font-medium text-ink-2">Chất lượng đo lường</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-body text-ink-muted">
              <div>Độ phủ dữ liệu: <span className="font-mono text-ink-2">{num(o["coverage"]) !== null ? pct1(num(o["coverage"])!) : "chưa có dữ liệu"}</span></div>
              <div>Số ngày quan sát: <span className="font-mono text-ink-2">{num(o["obs_days"]) ?? "—"} ngày</span></div>
              <div>Xếp loại đo lường: <span className="font-mono text-ink-2">{str(o["grade"]) ?? "—"}</span></div>
              <div>Đủ chuẩn báo cáo: <span className="font-mono text-ink-2">{formatTriState(o["util_reportable"], "Đạt", "Chưa đạt")}</span></div>
            </div>
          </div>
        )}

        {/* Live Connector Composition */}
        {detail.connectors && detail.connectors.length > 0 && (
          <div className="border-t border-hairline px-3 py-2">
            <div className="text-body font-medium text-ink-2">Cơ cấu đầu sạc (Registry)</div>
            <div className="pt-1 space-y-1">
              {detail.connectors.map((c: { standard: string; nRows: number; nGuns: number }) => (
                <div key={c.standard} className="flex items-center justify-between text-body">
                  <span className="text-ink-muted">
                    {c.standard === "UNKNOWN" ? "Chuẩn khác / Chưa phân loại" : c.standard}
                  </span>
                  <span className="font-mono font-medium text-ink-2">{c.nGuns.toLocaleString("vi-VN")} súng</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {detail.connectorsStatus === "unavailable" && (
          <p className="border-t border-hairline px-3 py-2 text-body text-ink-muted">
            Chi tiết registry đầu sạc hiện không đọc được; số cổng lắp đặt phía trên vẫn giữ nguyên.
          </p>
        )}
        {detail.connectorsStatus === "ready" && detail.connectors.length === 0 && (
          <p className="border-t border-hairline px-3 py-2 text-body text-ink-muted">
            Registry không có chi tiết đầu sạc cho trạm này; đây không phải là 0 cổng lắp đặt.
          </p>
        )}
      </section>

      {/* ── 5. COMPARISON ──────────────────────────────────────────────────── */}
      {o && num(o["util_pctl"]) !== null && (
        <section className="border-b border-hairline px-3 py-2 bg-basemap/20">
          <div className="text-body font-medium text-ink-2">So sánh phân vị ngang hàng</div>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-readout font-semibold leading-none text-ink">
              {formatPercentile(num(o["util_pctl"])!)}
            </span>
            <span className="text-body text-ink-muted">
              trong nhóm {str(o["util_pctl_peer"]) ?? "cùng loại dòng & tỉnh"}
            </span>
          </div>
          <p className="pt-1 text-note text-ink-muted">
            Chỉ so sánh các trạm có cùng phân loại dòng điện (AC/DC) trong cùng tỉnh thành.
          </p>
        </section>
      )}

      {/* ── 6. TECHNICAL DETAILS (Disclosure) ───────────────────────────────── */}
      <details className="border-b border-hairline group">
        <summary className="cursor-pointer px-3 py-2 text-body font-medium text-ink-2 hover:bg-basemap/50 transition-colors">
          Chi tiết kỹ thuật
        </summary>
        <div className="bg-basemap/10 px-3 pb-3 pt-1 space-y-3">
          {/* Identity */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Định danh & Không gian</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Mã hệ thống (station_id)" v={str(s["station_id"]) ?? id} />
              <TechRow k="Mã hiển thị (station_code)" v={str(s["station_code"])} />
              <TechRow k="Toạ độ (lat, lng)" v={`${num(s["lat"])?.toFixed(5) ?? "—"}, ${num(s["lng"])?.toFixed(5) ?? "—"}`} />
              <TechRow k="Mã xã/phường" v={str(s["commune_code"])} />
              <TechRow k="Ô H3 r8" v={str(s["h3_r8"])} />
              <TechRow k="Phạm vi (scope)" v={str(s["scope"])} />
            </div>
          </div>

          {/* Installed Assets */}
          <div>
            <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Tài sản lắp đặt</div>
            <div className="divide-y divide-hairline text-body">
              <TechRow k="Loại trạm" v={str(s["station_type"])} />
              <TechRow k="Dòng phương tiện" v={str(s["vehicle_class"])} />
              <TechRow k="Loại dòng điện" v={str(s["current_type"])} />
              <TechRow k="Số cổng (n_ports)" v={nPorts?.toString()} />
              <TechRow k="Số súng nội suy" v={num(s["n_guns_imputed"])?.toString()} />
              <TechRow k="Công suất trạm (kW)" v={powerKw?.toString()} />
              <TechRow k="Công suất max/cổng (kW)" v={powerMaxPort?.toString()} />
              <TechRow k="Nguồn cấu hình cổng" v={str(s["port_config_source"])} />
              <TechRow k="Xác thực chính thức" v={formatTriState(s["verified_official"])} />
              <TechRow k="Độ tươi dữ liệu (0–1, nhỏ là mới)" v={freshness !== null ? freshness.toLocaleString("vi-VN", { maximumFractionDigits: 3 }) : null} />
              <TechRow k="Có chuỗi thời gian" v={formatTriState(s["has_timeseries"])} />
            </div>
          </div>

          {/* Telemetry */}
          {o && (
            <div>
              <div className="text-note font-semibold uppercase tracking-wider text-ink-muted">Viễn trắc (Telemetry)</div>
              <div className="divide-y divide-hairline text-body">
                <TechRow k="Mẫu số cổng tính util" v={num(o["util_denominator_ports"])?.toString()} />
                <TechRow k="Tỉ lệ cuối tuần" v={num(o["weekend_ratio"]) !== null ? pct1(num(o["weekend_ratio"])!) : null} />
                <TechRow k="Từng hoạt động" v={formatTriState(o["ever_active"])} />
                <TechRow k="Trạng thái occupancy" v={str(o["occ_status"])} />
                <TechRow k="Bắt đầu cửa sổ (UTC)" v={str(o["window_start_utc"])} />
                <TechRow k="Kết thúc cửa sổ (UTC)" v={str(o["window_end_utc"])} />
                <TechRow k="Snapshot telemetry" v={str(o["snapshot_id"])} />
              </div>
            </div>
          )}

          {/* Source block */}
          <div className="pt-2 border-t border-hairline">
            <SourceBlock manifest={model?.manifest ?? null} station={detail} />
          </div>
        </div>
      </details>

      {/* ── 7. CTA ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 px-3 py-2.5 bg-basemap/30">
        {str(s["h3_r8"]) && (
          <button
            onClick={() => {
              const sel = cellSelection(String(s["h3_r8"]), model?.datasetId);
              if (sel) onSelectEntity(sel);
            }}
            className="cursor-pointer rounded-xs border border-hairline bg-panel px-2.5 py-1 text-body font-medium text-ink hover:border-ink hover:bg-basemap transition-colors"
          >
            Xem ô H3 chứa trạm
          </button>
        )}
        {str(s["commune_code"]) && (
          <button
            onClick={() => {
              const sel = communeSelection(String(s["commune_code"]), model?.datasetId);
              if (sel) onSelectEntity(sel);
            }}
            className="cursor-pointer rounded-xs border border-hairline bg-panel px-2.5 py-1 text-body font-medium text-ink hover:border-ink hover:bg-basemap transition-colors"
          >
            Xem xã/phường
          </button>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  missingText,
  hint,
}: {
  label: string;
  value: string | null;
  missingText: string;
  hint: string;
}) {
  return (
    <div className="border-r border-hairline px-2 py-2 last:border-r-0" title={hint}>
      <div className="text-heading tabular-nums leading-tight font-semibold text-ink">
        {value === null ? <span className="text-note italic text-ink-muted">{missingText}</span> : value}
      </div>
      <div className="pt-0.5 text-note leading-tight text-ink-muted">{label}</div>
    </div>
  );
}

function TechRow({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 text-body">
      <span className="truncate text-ink-muted">{k}</span>
      <span className="font-mono text-ink-2 tabular-nums">{v ?? "—"}</span>
    </div>
  );
}

function shapeSentence(o: Record<string, unknown>): string {
  const shape = String(o["shape_class"] ?? "");
  const label = CONSTANTS[shape]?.short ?? shape;
  const h = num(o["peak_hour"]);
  const d = num(o["peak_dow"]);
  const night = num(o["night_share"]);
  const parts: string[] = [];
  if (label) parts.push(`Dạng nhịp: ${label}`);
  if (h !== null) parts.push(`đỉnh ${h}h${d !== null ? ` ${DOW_FULL[d] ?? ""}` : ""}`.trim());
  if (night !== null) parts.push(`${pct1(night)} lượng bận rơi vào ban đêm`);
  return parts.length > 0 ? `${parts.join(" · ")}.` : "Không có nhãn dạng nhịp cho trạm này.";
}

const pct1 = (v: number) =>
  v.toLocaleString("vi-VN", { style: "percent", maximumFractionDigits: 1 });

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
