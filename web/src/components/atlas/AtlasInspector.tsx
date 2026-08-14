import * as React from "react";
import { X, MapPin } from "lucide-react";
import type { Manifest } from "../../data/manifest";
import {
  fetchCell,
  fetchCellOccStatus,
  fetchStation,
  type CellOccStatus,
  type CellRow,
  type CommuneCollection,
  type StationDetail,
  type RoadSeg,
} from "../../data/queries";
import type { PoiCollection } from "../../data/poi";
import { cellIdOf, communeCodeOf, poiRefOf, roadIdOf, stationIdOf } from "../../data/h3";
import { defaultFieldOfLens } from "../../fields";
import type { StationOccupancy } from "../../data/occupancy";
import { useStore } from "../../state/store";
import { stationSeries } from "../../viz/occ";
import type { Scale } from "../../viz/palette";
import { CellPanel } from "../../ui/CellPanel";
import { CommunePanel } from "../../ui/CommunePanel";
import { PoiPanel } from "../../ui/PoiPanel";
import { SourceBlock } from "../../ui/Source";
import { StationPanel } from "../../ui/StationPanel";
import { RoadPanel } from "../../ui/RoadPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Button } from "../ui/button";
import { AtlasSurface, AtlasSurfaceBody, AtlasSurfaceFooter, AtlasSurfaceHeader } from "./AtlasSurface";

export interface AtlasInspectorProps {
  manifest: Manifest | null;
  communes: CommuneCollection | null;
  poi: PoiCollection | null;
  occupancy: StationOccupancy | null;
  occScale: Scale | null;
  roads: RoadSeg[];
  roadsLoading: boolean;
}

interface CellDataState {
  row: CellRow | null;
  occ: CellOccStatus | null;
  loading: boolean;
  error: string | null;
}

const IDLE_CELL: CellDataState = { row: null, occ: null, loading: false, error: null };

function useCellData(h3: string | null): CellDataState {
  const [state, setState] = React.useState<CellDataState>(IDLE_CELL);
  React.useEffect(() => {
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

interface StationDataState {
  detail: StationDetail | null;
  loading: boolean;
  error: string | null;
}

const IDLE_STATION: StationDataState = { detail: null, loading: false, error: null };

function useStationData(id: string | null): StationDataState {
  const [state, setState] = React.useState<StationDataState>(IDLE_STATION);
  React.useEffect(() => {
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

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return isDesktop;
}

export function AtlasInspector({
  manifest,
  communes,
  poi,
  occupancy,
  occScale,
  roads,
  roadsLoading,
}: AtlasInspectorProps) {
  const { cell, field, setField, selectCell } = useStore();
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const isDesktop = useIsDesktop();

  const h3 = cellIdOf(cell);
  const communeCode = communeCodeOf(cell);
  const poiSel = poiRefOf(cell);
  const stationSel = stationIdOf(cell);
  const roadSel = roadIdOf(cell);

  const cellData = useCellData(h3);
  const stationData = useStationData(stationSel);

  const feature =
    communeCode && communes
      ? communes.features.find((f) => f.properties["commune_code"] === communeCode) ?? null
      : null;

  const seriesIndex =
    stationSel && occupancy
      ? occupancy.stations.findIndex((s) => s.id === stationSel)
      : -1;
  const series =
    occupancy && seriesIndex >= 0
      ? stationSeries(occupancy.profiles, seriesIndex)
      : null;

  // Handle Escape key to close Inspector
  React.useEffect(() => {
    if (!cell) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectCell(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cell, selectCell]);

  const isOpen = Boolean(cell);
  if (!isOpen) return null;

  const inspectorInnerContent = (
    <>
      {/* Header Bar - Exactly one header & close button */}
      <AtlasSurfaceHeader className="justify-between gap-2 px-3.5 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-cold-2 shrink-0" />
          <div>
            <div className="text-note uppercase font-bold tracking-wider text-ink-muted">KIỂM TRA</div>
            <div className="text-title font-semibold text-ink truncate">Bằng chứng đối tượng</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => selectCell(null)}
          aria-label="Đóng Inspector"
        >
          <X className="h-4 w-4 text-ink-2 hover:text-ink" />
        </Button>
      </AtlasSurfaceHeader>

      {/* Scrollable Evidence Content */}
      <AtlasSurfaceBody className="custom-scrollbar space-y-4 p-3 text-title">
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

        {roadSel && (
          <RoadPanel
            id={roadSel}
            road={roads.find((r) => r.id === roadSel) ?? null}
            loading={roadsLoading}
            onBack={() => selectCell(null)}
            onOpenAccess={() => {
              const access = defaultFieldOfLens("access");
              if (access) setField(access.id);
            }}
          />
        )}
      </AtlasSurfaceBody>

      {/* Footer Source & Provenance */}
      <AtlasSurfaceFooter>
        <SourceBlock
          manifest={manifest}
          cell={h3 ? cellData.row : null}
          occ={cellData.occ}
          station={stationSel ? stationData.detail : null}
        />
      </AtlasSurfaceFooter>
    </>
  );

  // Desktop (≥1024px): Non-modal map-anchored side panel (NO backdrop, map fully interactive)
  if (isDesktop) {
    return (
      /* Cao theo NỘI DUNG, chặn trên bằng chiều cao khung nhìn — không kéo dài xuống đáy.
         `bottom-3` ép tấm cao bằng cả màn hình bất kể nó có bao nhiêu chữ; với một xã (bốn
         fact và một dòng nguồn) đó là ~450 px trống ở giữa, và khối nguồn bị đẩy xuống đáy
         xa khỏi thứ nó dẫn nguồn cho. Panel dài bằng thứ nó nói. */
      <AtlasSurface
        className="fixed top-3 right-3 z-30 flex max-h-[calc(100vh-1.5rem)] w-[360px] flex-col transition-all"
        aria-label="Kiểm tra đối tượng đang chọn"
      >
        {inspectorInnerContent}
      </AtlasSurface>
    );
  }

  // Tablet/Mobile (<1024px): Modal Sheet with backdrop & focus trap
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && selectCell(null)}>
      <SheetContent
        side="right"
        showClose={false}
        className="w-full sm:w-[360px] p-0 flex flex-col h-full bg-panel text-ink border-l border-hairline shadow-sheet z-50"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Kiểm tra đối tượng</SheetTitle>
        </SheetHeader>
        {inspectorInnerContent}
      </SheetContent>
    </Sheet>
  );
}
