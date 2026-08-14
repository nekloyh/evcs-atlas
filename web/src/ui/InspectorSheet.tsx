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
import type { PoiCollection } from "../data/poi";
import { cellIdOf, communeCodeOf, poiRefOf, roadIdOf, stationIdOf } from "../data/h3";
import type { RoadSeg } from "../data/queries";
import { defaultFieldOfLens } from "../fields";
import type { StationOccupancy } from "../data/occupancy";
import { useStore } from "../state/store";
import { stationSeries } from "../viz/occ";
import type { Scale } from "../viz/palette";
import { CellPanel } from "./CellPanel";
import { CommunePanel } from "./CommunePanel";
import { PoiPanel } from "./PoiPanel";
import { SourceBlock } from "./Source";
import { StationPanel } from "./StationPanel";
import { RoadPanel } from "./RoadPanel";

/** Map-anchored inspector. Chỉ có mặt khi click đã pin một selection. */
export function InspectorSheet({
  manifest,
  communes,
  poi,
  occupancy,
  occScale,
  roads,
  roadsLoading,
}: {
  manifest: Manifest | null;
  communes: CommuneCollection | null;
  poi: PoiCollection | null;
  occupancy: StationOccupancy | null;
  occScale: Scale | null;
  roads: RoadSeg[];
  roadsLoading: boolean;
}) {
  const { cell, field, setField, selectCell } = useStore();
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const h3 = cellIdOf(cell);
  const communeCode = communeCodeOf(cell);
  const poiSel = poiRefOf(cell);
  const stationSel = stationIdOf(cell);
  const roadSel = roadIdOf(cell);
  const cellData = useCellData(h3);
  const stationData = useStationData(stationSel);
  const feature = communeCode && communes
    ? communes.features.find((f) => f.properties["commune_code"] === communeCode) ?? null
    : null;
  const seriesIndex = stationSel && occupancy
    ? occupancy.stations.findIndex((s) => s.id === stationSel)
    : -1;
  const series = occupancy && seriesIndex >= 0
    ? stationSeries(occupancy.profiles, seriesIndex)
    : null;

  // Inspector là drawer trên màn hẹp: Escape phải đóng nó như nút đóng, không bắt người
  // dùng cuộn lên đầu sheet. Chỉ đăng ký khi thực sự có selection.
  useEffect(() => {
    if (!cell) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") selectCell(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [cell, selectCell]);

  if (!cell) return null;

  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-[calc(100%-1rem)] flex-col border-l border-hairline bg-panel shadow-[0_8px_28px_rgb(0_0_0_/_0.16)] max-lg:inset-0 max-lg:w-full max-lg:max-w-none"
      aria-label="Kiểm tra đối tượng đang chọn"
    >
      <div className="flex shrink-0 items-center border-b border-hairline px-3 py-2">
        <div>
          <div className="text-note tracking-[0.12em] text-ink-muted">KIỂM TRA</div>
          <div className="text-title font-semibold text-ink">bằng chứng của đối tượng đã chọn</div>
        </div>
        <button
          onClick={() => selectCell(null)}
          className="ml-auto cursor-pointer border border-hairline px-2 py-1 text-body text-ink-2 hover:bg-basemap hover:text-ink"
        >
          đóng
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {h3 && (
          <CellPanel
            h3={h3}
            row={cellData.row}
            loading={cellData.loading}
            error={cellData.error}
            field={field}
            setField={setField}
            onBack={() => selectCell(null)}
          />
        )}
        {communeCode && (
          <CommunePanel
            code={communeCode}
            feature={feature}
            field={field}
            setField={setField}
            onBack={() => selectCell(null)}
          />
        )}
        {poiSel && <PoiPanel refId={poiSel} poi={poi} onBack={() => selectCell(null)} />}
        {stationSel && (
          <StationPanel
            id={stationSel}
            detail={stationData.detail}
            loading={stationData.loading}
            error={stationData.error}
            series={series}
            scale={occScale}
            t={t}
            onT={setT}
            onBack={() => selectCell(null)}
          />
        )}
        {roadSel && <RoadPanel id={roadSel} road={roads.find((r) => r.id === roadSel) ?? null} loading={roadsLoading} onBack={() => selectCell(null)} onOpenAccess={() => {
          const access = defaultFieldOfLens("access");
          if (access) setField(access.id);
        }} />}
      </div>

      <SourceBlock
        manifest={manifest}
        cell={h3 ? cellData.row : null}
        occ={cellData.occ}
        station={stationSel ? stationData.detail : null}
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

const IDLE_CELL: CellData = { row: null, occ: null, loading: false, error: null };

function useCellData(h3: string | null): CellData {
  const [state, setState] = useState<CellData>(IDLE_CELL);
  useEffect(() => {
    if (!h3) {
      setState(IDLE_CELL);
      return;
    }
    let cancelled = false;
    setState({ ...IDLE_CELL, loading: true });
    void Promise.all([fetchCell(h3), fetchCellOccStatus(h3)]).then(
      ([row, occ]) => !cancelled && setState({ row, occ, loading: false, error: null }),
      (e: unknown) => !cancelled && setState({ ...IDLE_CELL, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => { cancelled = true; };
  }, [h3]);
  return state;
}

interface StationData {
  detail: StationDetail | null;
  loading: boolean;
  error: string | null;
}

const IDLE_STATION: StationData = { detail: null, loading: false, error: null };

function useStationData(id: string | null): StationData {
  const [state, setState] = useState<StationData>(IDLE_STATION);
  useEffect(() => {
    if (!id) {
      setState(IDLE_STATION);
      return;
    }
    let cancelled = false;
    setState({ ...IDLE_STATION, loading: true });
    void fetchStation(id).then(
      (detail) => !cancelled && setState({ detail, loading: false, error: null }),
      (e: unknown) => !cancelled && setState({ ...IDLE_STATION, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => { cancelled = true; };
  }, [id]);
  return state;
}
