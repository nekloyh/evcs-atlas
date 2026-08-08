/**
 * Panel TRẠM — DESIGN.md §8a, thi công M4.1.
 *
 * `station_occupancy` là bảng giàu nhất của bộ dữ liệu (`util_p95` · `saturation_frac` ·
 * `duty_cycle` · `shape_class` · `peak_hour` · `night_share`…) mà tới M4 **không có chỗ nào
 * hiển thị** ngoài phép gộp `util_cell` — cùng loại lỗi "tính xong rồi ném đi" đã bắt hai
 * lần (§13e, M3-R). Đây là chỗ trả nợ đó.
 *
 * Thứ tự §8a chốt sẵn, và nó là thứ tự **"một con số → vài con số → hình → chữ"**:
 * hero `util` → ba stat tile → mini-heatmap 7×24 → dòng dịch `shape_class`+`peak` → NGUỒN
 * (khối cuối do `Rail` neo đáy, ràng buộc 5).
 *
 * Cùng khuôn với `CellPanel`/`CommunePanel`/`PoiPanel`: `‹ quay lại`, thay nội dung rail
 * tại chỗ, không popup, không drawer thứ hai. Khác khuôn thì mentor phải học lại ở mỗi
 * loại đối tượng.
 */

import type { StationDetail } from "../data/queries";
import { isInScope } from "../data/scope";
import { CONSTANTS, constantShort } from "../fields";
import { DOW_FULL } from "../state/types";
import type { Scale } from "../viz/palette";
import { MiniHeatmap } from "./MiniHeatmap";
import { formatValue } from "./format";

export function StationPanel({
  id,
  detail,
  loading,
  error,
  series,
  scale,
  t,
  onT,
  onBack,
}: {
  id: string;
  detail: StationDetail | null;
  loading: boolean;
  error: string | null;
  /** 168 giá trị của chính trạm này; `null` = hồ sơ 168h chưa nạp xong */
  series: (number | null)[] | null;
  scale: Scale | null;
  t: number;
  onT: (t: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="text-[12px]">
      <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
        <button onClick={onBack} className="cursor-pointer text-[11px] text-ink-2 hover:text-ink">
          ‹ quay lại
        </button>
        <span className="ml-auto truncate font-mono text-[10px] text-ink-muted">{id}</span>
      </div>

      {loading && <p className="p-3 text-ink-muted">đang đọc trạm…</p>}

      {error && (
        <p className="p-3 text-[11px] leading-snug text-ink-2">
          Không đọc được trạm: {error}
          <span className="block pt-1 text-ink-muted">
            Thường là chưa chạy <code>make web-data</code>. Các phần khác của app không phụ
            thuộc lần đọc này.
          </span>
        </p>
      )}

      {!loading && !error && !detail && (
        <p className="p-3 text-[11px] leading-snug text-ink-2">
          Không có trạm nào mang mã <span className="font-mono">{id}</span>. Mã đúng hình
          dạng nhưng không thuộc bộ dữ liệu. Chỉ panel này rỗng — trường, khung nhìn và các
          khoá còn lại của hash giữ nguyên.
        </p>
      )}

      {detail && (
        <StationBody detail={detail} series={series} scale={scale} t={t} onT={onT} />
      )}
    </div>
  );
}

function StationBody({
  detail,
  series,
  scale,
  t,
  onT,
}: {
  detail: StationDetail;
  series: (number | null)[] | null;
  scale: Scale | null;
  t: number;
  onT: (t: number) => void;
}) {
  const s = detail.station;
  const o = detail.occ;
  const opStatus = String(s["op_status"] ?? "UNKNOWN");
  const abnormal = opStatus === "MAINTENANCE" || opStatus === "OUT_OF_SERVICE";
  const util = num(o?.["util"]);

  return (
    <>
      <div className="border-b border-hairline px-2 py-2">
        <div className="text-[14px] font-semibold leading-tight">
          {str(s["name"]) ?? "trạm không tên"}
        </div>
        <div className="pt-0.5 text-[11px] text-ink-muted">
          {/*
            Tư cách trạm đi qua `isInScope`, KHÔNG so với `"HANOI"`: store toàn quốc ghi
            `scope = 'IN'`, nên phép so cũ dán nhãn "vành đệm 5 km" lên cả 30 trạm của
            Cao Bằng — một câu sai về từng trạm một, không lỗi nào.
          */}
          {[
            str(s["operator"]),
            constantShort(String(s["access"] ?? "")),
            isInScope(String(s["scope"] ?? "")) ? "trong phạm vi" : "vành đệm 5 km",
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {str(s["address"]) && (
          <div className="pt-0.5 text-[11px] leading-snug text-ink-2">{str(s["address"])}</div>
        )}
      </div>

      {/*
        Trạng thái vận hành ở ĐẦU panel, bằng CHỮ — §4d-3a nói rõ vai của hai kênh: viền
        đứt trên bản đồ chỉ nói "không bình thường", panel mới là chỗ nói **cụ thể là gì**.
        Nên chỗ này không được rút gọn thành một chấm màu.
      */}
      {abnormal && (
        <p className="flex items-start gap-1.5 border-b border-hairline bg-basemap px-2 py-1.5 text-[11px] leading-snug text-ink">
          <span aria-hidden className="shrink-0 text-warn">
            ⚠
          </span>
          <span>
            <strong>{constantShort(opStatus)}</strong> — trạm này mang vòng nét đứt trên bản
            đồ. Số cổng và công suất dưới đây là <em>tài sản đã lắp</em>, không phải cung
            đang phục vụ.
          </span>
        </p>
      )}
      {opStatus === "UNKNOWN" && (
        <p className="border-b border-hairline px-2 py-1.5 text-[11px] leading-snug text-ink-muted">
          Nguồn không nói trạng thái vận hành của trạm này. Nó KHÔNG mang vòng nét đứt: vẽ
          nét đứt cho “không biết” là biến nó thành “biết là hỏng”.
        </p>
      )}

      {/* ── 1. Hero number ─────────────────────────────────────────────────── */}
      <div className="border-b border-hairline px-2 py-2.5">
        {/*
          `tabular-nums` cố ý KHÔNG dùng — §4e cấm nó cho số đứng một mình: nó cho mọi chữ
          số bề rộng của số 0, nên ở cỡ lớn nó đọc thành lỏng lẻo. Để dành cho cột số phải
          thẳng hàng, tức đúng ba stat tile ngay dưới.
        */}
        <div className="text-[30px] font-semibold leading-none">
          {util === null ? <span className="text-[15px] text-ink-muted italic">không đo được</span> : pct1(util)}
        </div>
        <div className="pt-1 text-[11px] leading-snug text-ink-2">
          {util === null
            ? "Trạm không có hồ sơ 30 ngày nào trong bộ dữ liệu — không phải “vắng khách”, mà là chưa từng báo cáo."
            : "tỉ lệ cổng-giờ bận, 30 ngày"}
        </div>
      </div>

      {/* ── 2. Ba stat tile ─────────────────────────────────────────────────── */}
      {o && (
        <div className="grid grid-cols-3 border-b border-hairline">
          <Tile
            label="đỉnh (p95)"
            value={num(o["util_p95"])}
            fmt={pct1}
            hint="phân vị 95 của tỉ lệ cổng bận theo giờ — mức mà trạm chạm tới trong những giờ bận nhất"
          />
          <Tile
            label="kín toàn bộ"
            value={num(o["saturation_frac"])}
            fmt={pct1}
            hint="phần thời gian MỌI cổng đều bận — tức phần thời gian người đến phải chờ"
          />
          <Tile
            label="chu kỳ bận"
            value={num(o["duty_cycle"])}
            fmt={pct1}
            hint="phần thời gian trạm có ít nhất một cổng bận"
          />
        </div>
      )}

      {/* ── 3. Mini-heatmap 7×24 ────────────────────────────────────────────── */}
      <section className="border-b border-hairline">
        <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
          NHỊP 168 GIỜ
        </h3>
        <div className="px-2 pt-1.5">
          {series && scale ? (
            <MiniHeatmap values={series} scale={scale} t={t} onT={onT} />
          ) : (
            <p className="py-3 text-[11px] text-ink-muted">đang nạp hồ sơ 168 giờ…</p>
          )}
        </div>
        <p className="px-2 pb-2 pt-1 text-[10px] leading-snug text-ink-muted">
          Cùng ramp và cùng phép chia bậc với chấm trạm trên bản đồ, nên một ô ở đây và một
          chấm ngoài kia cùng màu thì cùng nghĩa. Ô vân xám = chưa quan sát đủ 1 giờ, không
          phải “vắng khách”. Bấm một ô để nhảy tới giờ đó.
        </p>
      </section>

      {/* ── 4. Dòng dịch shape_class + peak ─────────────────────────────────── */}
      {o && (
        <p className="border-b border-hairline px-2 py-2 text-[12px] leading-relaxed text-ink">
          {shapeSentence(o)}
        </p>
      )}

      {/* ── Tài sản — cái mà `util` lấy làm mẫu số ──────────────────────────── */}
      <section>
        <h3 className="border-b border-hairline bg-basemap px-2 py-1 text-[11px] tracking-[0.1em] text-ink-2">
          TÀI SẢN
        </h3>
        <Row k="cổng lắp đặt" v={formatValue(s["n_ports"] ?? null)} />
        <Row
          k="công suất trạm"
          v={num(s["power_kw_site"]) === null ? "không đo được" : `${formatValue(s["power_kw_site"] ?? null)} kW`}
        />
        <Row
          k="công suất mỗi cổng"
          v={num(s["power_kw_max_port"]) === null ? "không đo được" : `tối đa ${formatValue(s["power_kw_max_port"] ?? null)} kW`}
        />
        <Row k="dòng" v={formatValue(s["current_type"] ?? null)} />
        {detail.connectors.map((c) => (
          <Row
            key={c.standard}
            k={`súng ${c.standard === "UNKNOWN" ? "không khớp registry" : c.standard}`}
            v={`${c.nGuns.toLocaleString("vi-VN")}`}
          />
        ))}
        <Row k="xã/phường" v={formatValue(s["commune_name"] ?? null)} />
      </section>
    </>
  );
}

/**
 * Một stat tile. `null` in ra CHỮ, không in ra `0` và không in ra ô trống — ràng buộc 1 ở
 * tầng chữ, cùng luật `formatValue` giữ ở panel Ô.
 */
function Tile({
  label,
  value,
  fmt,
  hint,
}: {
  label: string;
  value: number | null;
  fmt: (v: number) => string;
  hint: string;
}) {
  return (
    <div className="border-r border-hairline px-2 py-1.5 last:border-r-0" title={hint}>
      <div className="text-[15px] tabular-nums leading-tight">
        {value === null ? <span className="text-[11px] italic text-ink-muted">—</span> : fmt(value)}
      </div>
      <div className="pt-0.5 text-[10px] leading-tight text-ink-2">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-hairline px-2 py-1 text-[11px]">
      <span className="min-w-0 flex-1 truncate text-ink-muted">{k}</span>
      <span className="tabular-nums text-ink-2">{v}</span>
    </div>
  );
}

/**
 * `shape_class` + `peak_hour`/`peak_dow` thành một câu người đọc được — §8a-4.
 *
 * Đây là luật §8 áp cho một hằng số: `HAI_DINH` là mã, "hai đỉnh" là câu; panel in câu.
 * `night_share` đi kèm vì nó là **bằng chứng số** cho cái nhãn hình dạng — một nhãn không
 * có số đứng cạnh thì mentor không kiểm được nó.
 */
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
