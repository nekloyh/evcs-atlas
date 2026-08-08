import { useEffect, useState } from "react";

import type { Manifest } from "../data/manifest";
import {
  fetchCell,
  fetchCellOccStatus,
  fetchStation,
  type CellOccStatus,
  type CellRow,
  type CommuneCollection,
  type StationDetail,
} from "../data/queries";
import type { RuntimeCoverage } from "../fields";
import { useStore } from "../state/store";
import type { RailTab } from "../state/types";
import { cellIdOf, communeCodeOf, poiRefOf, stationIdOf } from "../data/h3";
import type { PoiCollection } from "../data/poi";
import type { StationOccupancy } from "../data/occupancy";
import { stationSeries } from "../viz/occ";
import type { Scale } from "../viz/palette";
import { CellPanel } from "./CellPanel";
import { CommunePanel } from "./CommunePanel";
import { FieldsTab } from "./FieldsTab";
import { LayersTab } from "./LayersTab";
import { PoiPanel } from "./PoiPanel";
import { SourceBlock } from "./Source";
import { StationPanel } from "./StationPanel";

const TABS: { id: RailTab; label: string }[] = [
  { id: "field", label: "TRƯỜNG" },
  { id: "layer", label: "LAYER" },
  // Nhãn tab thứ ba do `detailLabel()` quyết — nó đổi theo thứ đang chọn. Nhãn cố định
  // "Ô" sẽ nói dối về nội dung bên trong khi người dùng đang xem một XÃ (M2.1-A).
  { id: "cell", label: "Ô" },
];

/** Tab chi tiết tên là gì, và mách gì khi chưa chọn — nhãn phải khớp nội dung. */
function detailLabel(sel: string | null): { label: string; hint: string } {
  if (communeCodeOf(sel)) return { label: "XÃ", hint: "" };
  if (cellIdOf(sel)) return { label: "Ô", hint: "" };
  if (poiRefOf(sel)) return { label: "POI", hint: "" };
  if (stationIdOf(sel)) return { label: "TRẠM", hint: "" };
  return { label: "Ô · XÃ", hint: "bấm một ô, một xã, một trạm hoặc một POI trên bản đồ để mở" };
}

/**
 * Rail phải, 320px — DESIGN.md §3c. Ba tab, và khối NGUỒN neo đáy ở CẢ BA.
 * Không thẻ nổi, không bo góc, không đổ bóng: ngăn cách bằng hairline (§3).
 */
export function Rail({
  manifest,
  runtime,
  communes,
  poi,
  occupancy,
  occScale,
}: {
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  communes: CommuneCollection | null;
  poi: PoiCollection | null;
  /** hồ sơ 168h — panel TRẠM cần nó cho mini-heatmap (§8a-3). `null` = chưa nạp. */
  occupancy: StationOccupancy | null;
  /** thang dùng CHUNG giữa chấm trạm, heatmap dock và mini-heatmap — §8a luật 1. */
  occScale: Scale | null;
}) {
  const { field, setField, tab, setTab, cell, selectCell, backTab, layers } = useStore();
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const [search, setSearch] = useState("");
  const h3 = cellIdOf(cell);
  const communeCode = communeCodeOf(cell);
  const poiSel = poiRefOf(cell);
  const stationSel = stationIdOf(cell);
  const { row, occ, loading, error } = useCellData(h3);
  const station = useStationData(stationSel);

  // Hồ sơ 168h của CHÍNH trạm đang chọn. Chỉ số `s` tra bằng `station_id`, không bằng thứ
  // tự mảng: `occupancy.stations` sắp theo `station_code` (xem `fetchOccupancy`), và hai
  // mã đó không cùng thứ tự.
  const seriesIdx = stationSel && occupancy
    ? occupancy.stations.findIndex((s) => s.id === stationSel)
    : -1;
  const series =
    occupancy && seriesIdx >= 0 ? stationSeries(occupancy.profiles, seriesIdx) : null;
  const feature =
    communeCode && communes
      ? (communes.features.find((f) => f.properties["commune_code"] === communeCode) ?? null)
      : null;
  const detail = detailLabel(cell);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-hairline bg-panel">
      <div className="flex shrink-0 border-b border-hairline text-[11px] tracking-[0.1em]">
        {TABS.map((t) => {
          const disabled = t.id === "cell" && !cell;
          return (
            <button
              key={t.id}
              // `aria-disabled` chứ không `disabled`: phần tử `disabled` không nhận sự
              // kiện chuột nên `title` không bao giờ hiện. Cùng lý do với nav (§3a).
              aria-disabled={disabled}
              onClick={disabled ? undefined : () => setTab(t.id)}
              title={disabled ? detail.hint : undefined}
              className={`flex-1 border-r border-hairline py-2 last:border-r-0 ${
                disabled
                  ? "cursor-default text-ink-muted/50"
                  : tab === t.id
                    ? "cursor-pointer bg-basemap font-semibold text-ink"
                    : "cursor-pointer text-ink-2 hover:text-ink"
              }`}
            >
              {t.id === "cell" ? detail.label : t.label}
              {/* Số overlay đang bật, hiện cả khi đang ở tab khác — nếu không, một lớp bật
                  từ hash `l` sẽ vẽ trên bản đồ mà không có gì trong rail nói nó đang bật. */}
              {t.id === "layer" && layers.size > 0 && (
                <span className="pl-1 tabular-nums text-cold-2">{layers.size}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "field" && (
          <FieldsTab
            field={field}
            setField={setField}
            search={search}
            setSearch={setSearch}
            manifest={manifest}
            runtime={runtime}
            communes={communes}
          />
        )}
        {tab === "layer" && <LayersTab manifest={manifest} />}
        {tab === "cell" && h3 && (
          <CellPanel
            h3={h3}
            row={row}
            loading={loading}
            error={error}
            field={field}
            setField={setField}
            onBack={() => setTab(backTab)}
          />
        )}
        {tab === "cell" && communeCode && (
          <CommunePanel
            code={communeCode}
            feature={feature}
            field={field}
            setField={setField}
            onBack={() => setTab(backTab)}
          />
        )}
        {tab === "cell" && poiSel && (
          <PoiPanel refId={poiSel} poi={poi} onBack={() => setTab(backTab)} />
        )}
        {tab === "cell" && stationSel && (
          <StationPanel
            id={stationSel}
            detail={station.detail}
            loading={station.loading}
            error={station.error}
            series={series}
            scale={occScale}
            t={t}
            onT={setT}
            onBack={() => setTab(backTab)}
          />
        )}
        {tab === "cell" && !cell && (
          <p className="p-3 text-[12px] text-ink-muted">Chưa chọn ô hay xã nào.</p>
        )}
      </div>

      {/* Nút này nằm TRÊN khối NGUỒN: ràng buộc 5 nói NGUỒN ở đáy panel, nên không có gì
          được chen xuống dưới nó. */}
      {cell && tab !== "cell" && (
        <button
          onClick={() => selectCell(null)}
          className="shrink-0 cursor-pointer border-t border-hairline px-2 py-1 text-left text-[11px] text-ink-2 hover:text-ink"
        >
          bỏ chọn {detail.label.toLowerCase()} <span className="font-mono text-ink-muted">{cell}</span>
        </button>
      )}

      {/* Ràng buộc 5: NGUỒN neo đáy, ở cả ba tab. Ở tab chi tiết nó nói về ĐỐI TƯỢNG đang
          xem — ô hay trạm — chứ không nói về cả bộ dữ liệu. */}
      <SourceBlock
        manifest={manifest}
        cell={tab === "cell" ? row : null}
        occ={occ}
        station={tab === "cell" ? station.detail : null}
      />
    </aside>
  );
}

interface CellData {
  row: CellRow | null;
  occ: CellOccStatus | null;
  loading: boolean;
  error: string | null;
}

const IDLE: CellData = { row: null, occ: null, loading: false, error: null };

/**
 * Đọc dữ liệu của ô đang chọn. Panel Ô và khối NGUỒN dùng chung một lần đọc.
 *
 * `.catch` KHÔNG được thiếu ở đây. Thiếu nó thì một lần `fetchCell` reject (chưa chạy
 * `make web-data`, DuckDB chưa boot xong) là `setState` không bao giờ chạy: panel kẹt ở
 * "đang đọc ô…" vĩnh viễn và lỗi chỉ hiện dưới dạng unhandled rejection trong console —
 * tức UI nói "đang chạy" trong khi thật ra đã chết. Cùng loại nói dối mà ràng buộc 1 cấm,
 * chỉ khác là nói dối về TRẠNG THÁI thay vì về giá trị.
 */
interface StationData {
  detail: StationDetail | null;
  loading: boolean;
  error: string | null;
}

const STATION_IDLE: StationData = { detail: null, loading: false, error: null };

/**
 * Đọc trạm đang chọn — M4.1. Cùng khuôn `useCellData`, kể cả nhánh `.catch`.
 *
 * Nhánh lỗi KHÔNG được thiếu, và lý do đã ghi ở `useCellData`: thiếu nó thì một lần reject
 * làm panel kẹt ở "đang đọc trạm…" vĩnh viễn — UI nói "đang chạy" trong khi đã chết.
 */
function useStationData(id: string | null): StationData {
  const [state, setState] = useState<StationData>(STATION_IDLE);

  useEffect(() => {
    if (!id) {
      setState(STATION_IDLE);
      return;
    }
    let cancelled = false;
    setState({ ...STATION_IDLE, loading: true });
    void fetchStation(id).then(
      (detail) => {
        if (!cancelled) setState({ detail, loading: false, error: null });
      },
      (e: unknown) => {
        if (!cancelled) {
          setState({ ...STATION_IDLE, error: e instanceof Error ? e.message : String(e) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}

function useCellData(h3: string | null): CellData {
  const [state, setState] = useState<CellData>(IDLE);

  useEffect(() => {
    if (!h3) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ ...IDLE, loading: true });
    void Promise.all([fetchCell(h3), fetchCellOccStatus(h3)]).then(
      ([row, occ]) => {
        if (!cancelled) setState({ row, occ, loading: false, error: null });
      },
      (e: unknown) => {
        if (!cancelled) {
          setState({ ...IDLE, error: e instanceof Error ? e.message : String(e) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [h3]);

  return state;
}
