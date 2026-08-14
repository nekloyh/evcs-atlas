import { useEffect, useMemo, useState } from "react";

import { MapView } from "./map/MapView";
import {
  communeCoverage,
  roadCoverage,
  fetchBoundary,
  fetchCommunes,
  fetchDerivedCoverage,
  fetchField,
  fetchPoi,
  fetchRoads,
  fetchShowcaseRoutes,
  fetchStations,
  fetchSurfaceBins,
  type CommuneCollection,
  type CommuneFeature,
  type GridCell,
  type RoadSeg,
  type ShowcaseRoute,
  type StationPoint,
} from "./data/queries";
import { poiGroupsOn, type PoiCollection } from "./data/poi";
import { cellIdOf, communeCodeOf, poiRefOf, roadIdOf, stationIdOf } from "./data/h3";
import { fetchOccupancy, type StationOccupancy } from "./data/occupancy";
import { loadManifest, type Manifest } from "./data/manifest";
import {
  DEFAULT_FIELD,
  FIELD_BY_ID,
  STATION_OCC_FIELD,
  STATION_PORTS_FIELD,
  fieldAvailable,
  fieldMapAvailable,
  layerUsable,
  type RuntimeCoverage,
} from "./fields";
import { keep } from "./state/brush";
import { useStore } from "./state/store";
import { syncHash } from "./state/hash";
import { INITIAL_VIEW } from "./state/view-config";
import { SCENES, storyEnabled } from "./story/scenes";
import { StoryColumn } from "./story/StoryColumn";
import { DataMode } from "./ui/DataMode";
import { type DockData } from "./ui/Dock";
import { Scrubber } from "./ui/Scrubber";
import { NavRail } from "./components/atlas/NavRail";
import { FloatingLegend } from "./components/atlas/FloatingLegend";
import { FloatingWorkspace } from "./components/atlas/FloatingWorkspace";
import { AtlasInspector } from "./components/atlas/AtlasInspector";
import { CompareDock } from "./components/atlas/CompareDock";
import { allOccValues, cityProfile, occCountAt, occCoverage, stationOccAt } from "./viz/occ";
import { buildScale, computeClassingByWeight, type Scale } from "./viz/palette";

/**
 * Nav — DESIGN.md §3a.
 *
 * Chế độ chưa dựng phải **trông** như chưa dựng. Trước M1.1 đây là chữ tĩnh: nhìn bấm
 * được, bấm không làm gì, không nói vì sao. UI hứa một thứ nó không có là nói dối bằng
 * giao diện — cùng loại lỗi mà ràng buộc 1 và §7a cấm ở chỗ khác. Nên: `<button>` thật,
 * `disabled` thật, mực mờ hẳn, `title` nói rõ MỐC nào sẽ dựng. Cùng khuôn với tab `Ô`
 * bị vô hiệu trong rail.
 *
 * **Mặt kia của cùng luật, làm ở M3:** dựng xong thì phải BỎ dấu hiệu "chưa dựng" đi.
 * `CÂU CHUYỆN` mất `disabled`, mất mực mờ, mất nhãn `M3`, và có `onClick` thật — để lại
 * một trong bốn thứ đó là nói dối theo chiều ngược lại.
 */
const NO_COVERAGE: Map<string, RuntimeCoverage> = new Map();

export default function App() {
  const field = useStore((s) => s.field);
  const scene = useStore((s) => s.scene);
  const enterScene = useStore((s) => s.enterScene);
  const dataMode = useStore((s) => s.dataMode);
  const setDataMode = useStore((s) => s.setDataMode);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const setBasemapStyle = useStore((s) => s.setBasemapStyle);
  const setView = useStore((s) => s.setView);
  const workspaceOpen = useStore((s) => s.workspaceOpen);
  const setWorkspaceOpen = useStore((s) => s.setWorkspaceOpen);
  const cellSel = useStore((s) => s.cell);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [communes, setCommunes] = useState<CommuneCollection | null>(null);
  const [boundary, setBoundary] = useState<CommuneCollection | null>(null);
  const [stations, setStations] = useState<StationPoint[]>([]);
  const [roads, setRoads] = useState<RoadSeg[]>([]);
  const [roadsLoading, setRoadsLoading] = useState(false);
  const [routes, setRoutes] = useState<ShowcaseRoute[]>([]);
  const [poi, setPoi] = useState<PoiCollection | null>(null);
  const [occupancy, setOccupancy] = useState<StationOccupancy | null>(null);
  const [scale, setScale] = useState<Scale | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [derivedCov, setDerivedCov] = useState(NO_COVERAGE);
  const [roadCov, setRoadCov] = useState(NO_COVERAGE);
  const [surfaceBreaks, setSurfaceBreaks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  // Hash là serialization HAI CHIỀU: ghi có debounce 250ms, và nghe `hashchange` để sửa
  // tay URL / bấm Back đều có tác dụng — §9.
  useEffect(
    () =>
      syncHash(
        useStore.subscribe,
        // Store giữ `layers` là `Set` (thêm/bớt một phần tử là O(1) và không trùng lặp);
        // hash giữ nó là MẢNG vì thứ tự trong chuỗi phải ổn định. Chuyển đổi ở đúng ranh
        // giới giữa hai thế giới, không bắt bên nào mang kiểu của bên kia.
        () => {
          const s = useStore.getState();
          return {
            field: s.field,
            mode: s.mode,
            view: s.view,
            layers: [...s.layers],
            paintOn: s.paintOn,
            cell: s.cell,
            scene: s.scene,
            dataMode: s.dataMode,
            t: s.t,
            brush: s.brush,
          };
        },
        useStore.getState().applyHash,
      ),
    [],
  );

  useEffect(() => {
    void loadManifest().then(setManifest, fail);
    // Nạp một lần lúc boot, không đợi tới lúc lớp được bật: ràng buộc 4 nói badge phải
    // thấy được TRƯỚC khi bấm, và tab LAYER cũng vậy. Tổng cộng ~0,6 MB.
    void fetchCommunes().then(setCommunes, fail);
    void fetchBoundary().then(setBoundary, fail);
    void fetchStations().then(setStations, fail);
    void fetchDerivedCoverage().then(setDerivedCov, fail);
    void fetchSurfaceBins().then(
      // Ngưỡng dải đồng mức chia đều theo NGƯỜI, không theo ô gộp — F8. Vẫn là ngưỡng
      // thật in được lên legend (§1b, §3b), chỉ khác chỗ cắt.
      (bins) => setSurfaceBreaks(computeClassingByWeight(bins).breaks),
      fail,
    );
  }, []);

  // Trường từ hash phải vừa TỒN TẠI vừa DỰNG ĐƯỢC trên bộ dữ liệu đang mở. `#f=population`
  // là một id hợp lệ ở mọi tỉnh, nhưng cột `population` chỉ có ở bộ Hà Nội — mở nó ở tỉnh
  // khác sẽ là một `SELECT` cột không tồn tại. Rơi về mặc định (trường của XÃ, luôn dựng
  // được vì nó đọc từ `commune.geojson`) thay vì nổ.
  const picked = FIELD_BY_ID.get(field);
  const meta = picked && fieldMapAvailable(picked) ? picked : FIELD_BY_ID.get(DEFAULT_FIELD)!;

  // Sửa luôn STATE, không chỉ sửa lượt vẽ này: nếu chỉ thay ở đây thì hash vẫn ghi
  // `f=population` trong khi bản đồ tô một trường khác — URL nói một đằng, màn hình nói
  // một nẻo, và người gửi link không có cách nào biết. Cùng nguyên tắc "một nguồn sự thật"
  // mà ràng buộc 2 áp cho `field`.
  const setField = useStore((s) => s.setField);
  useEffect(() => {
    if (picked && !fieldMapAvailable(picked)) setField(DEFAULT_FIELD);
  }, [picked, setField]);

  // Phủ của trường xã đo trên chính 126 feature vừa nạp — mẫu số là 126, không phải 4.427.
  const runtimeCov = useMemo(() => {
    const out = new Map(derivedCov);
    if (communes) for (const [k, v] of communeCoverage(communes)) out.set(k, v);
    for (const [k, v] of roadCov) out.set(k, v);
    if (occupancy) {
      // Số ỔN ĐỊNH (trạm có ít nhất một giờ đọc được), không phải số theo giờ: badge trong
      // rail được đọc TRƯỚC khi bấm, nên nó không được nhảy 4 lần mỗi giây khi play. Số
      // theo giờ nằm ở swatch chấm rỗng của legend — xem `occCoverage`.
      const c = occCoverage(occupancy.profiles);
      out.set(STATION_OCC_FIELD, {
        n_present: c.present,
        n_total: c.total,
        share: c.total ? c.present / c.total : 0,
        // Một TRẠM không có dân số — "x% dân" ở đây không sai số, nó KHÔNG CÓ NGHĨA. Cùng
        // lý do đã ghi cho đoạn đường trong `roadCoverage`.
        pop_share: undefined,
      });
    }
    return out;
  }, [derivedCov, communes, roadCov, occupancy]);

  // Trường của XÃ đọc từ GeoJSON đã nạp, không truy vấn DuckDB: 126 đa giác đã ở trong RAM.
  useEffect(() => {
    if (meta.readAs !== "commune") return;
    if (!communes) return;
    setScale(buildScale(meta.kind, communes.features.map((f: CommuneFeature) => f.properties[meta.column] ?? null), meta.diverge));
  }, [meta, communes]);

  useEffect(() => {
    if (meta.readAs !== "cell") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchField(meta);
        if (cancelled) return;
        setCells(rows);
        setScale(buildScale(meta.kind, rows.map((r) => r.value), meta.diverge));
      } catch (e) {
        if (!cancelled) fail(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // Mạng đường nạp LƯỜI, không nạp lúc boot — 3,2 MB và 427 nghìn điểm là chi phí thật, và
  // phần lớn phiên xem không bao giờ chọn trường của đường. Điều kiện chính là `readAs`:
  // cả mark CẦU lẫn cặp tuyến minh hoạ chỉ sống trong đúng nhịp mà trường đường đang tô
  // (§14b), nên không có trường hợp nào cần đường mà `readAs` không phải `road`.
  useEffect(() => {
    if (meta.readAs !== "road" && roadIdOf(cellSel) === null) return;
    if (roads.length || roadsLoading) return;
    let cancelled = false;
    setRoadsLoading(true);
    void (async () => {
      try {
        const [segs, showcase] = await Promise.all([fetchRoads(), fetchShowcaseRoutes()]);
        if (cancelled) return;
        setRoads(segs);
        setRoutes(showcase);
        // Cold road deep-link cần feature để inspector đọc, nhưng không được thay scale/
        // legend của measure đang xem bằng scale khoảng cách đường.
        if (meta.readAs === "road") {
          setScale(buildScale(meta.kind, segs.map((r) => r.dist), meta.diverge));
          setRoadCov(new Map([[meta.id, roadCoverage(segs)]]));
        }
      } catch (e) {
        if (!cancelled) fail(e);
      } finally {
        if (!cancelled) setRoadsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta, cellSel, roads.length, roadsLoading]);

  // POI nạp LƯỜI như roads (§5a): 3,39 MB, phần lớn phiên xem không bật nhóm POI nào.
  // Hai đường cần nó: một overlay `poi_*` bật, hoặc hash mở sẵn `c=poi:` (panel POI phải
  // dựng được cả khi chưa bật lớp nào — link là lời hứa, §9).
  const layersSet = useStore((s) => s.layers);
  const needPoi = poiGroupsOn(layersSet).length > 0 || poiRefOf(cellSel) !== null;
  useEffect(() => {
    if (!needPoi || poi) return;
    void fetchPoi().then(setPoi, fail);
  }, [needPoi, poi]);

  // Ô lưới vẫn cần nạp cả khi đang xem trường XÃ: overlay `beyond2km` và mặt độ cầu đọc từ
  // đó, và chúng phải bật được bất kể trường nào đang chọn.
  //
  // Trường mồi phải TỒN TẠI ở bộ dữ liệu đang mở. `population` thuộc lớp TÍNH TOÁN, và
  // store toàn quốc chưa có nó ⇒ câu SQL nguyên văn ném `Binder Error: Table "g" does not
  // have a column named "population"` và dải lỗi đỏ che ngang bản đồ ở MỌI tỉnh. `gcol()`
  // của `fetchField` chỉ bọc bốn cột cố định, không bọc biểu thức của chính trường được
  // truyền vào — nên chỗ chặn đúng là ở đây, nơi cái tên `population` được gõ ra.
  useEffect(() => {
    if (meta.readAs === "cell" || cells.length > 0) return;
    const seed = FIELD_BY_ID.get("population");
    if (!seed || !fieldAvailable(seed)) return;
    void fetchField(seed).then(setCells, fail);
  }, [meta, cells.length]);

  // ── Nhịp trạm 168h — M4 ──────────────────────────────────────────────────────
  //
  // Nạp LƯỜI như roads và POI (§5a). Hai đường cần nó: trường `station:occ` đang tô, hoặc
  // dock đang mở (heatmap 168h là một trong ba biểu đồ của nó). 116.785 dòng là chi phí
  // thật, và phần lớn phiên xem chỉ mở bản đồ rồi thôi.
  const dockOpen = useStore((s) => s.dockOpen);
  const compareView = useStore((s) => s.compareView);
  const setDockOpen = useStore((s) => s.setDockOpen);
  // Đường thứ ba từ M4.1: một TRẠM đang được chọn. Panel TRẠM có mini-heatmap 168h (§8a-3),
  // nên nó cần đúng bộ hồ sơ này — kể cả khi dock đóng và trường đang tô là trường của ô.
  // Đường thứ tư từ M4.2: chế độ DỮ LIỆU dựng small multiples từ chính hồ sơ đó (§3f-5).
  const needOcc =
    meta.id === STATION_OCC_FIELD ||
    (dockOpen && !scene) ||
    (stationIdOf(cellSel) !== null && !scene) ||
    dataMode;

  // Compare là câu trả lời gắn với measure đã gọi nó. Đổi measure thì đóng compare không
  // còn cùng nghĩa, thay vì giữ scatter/heatmap cũ cạnh một bản đồ khác rồi ngầm nói chúng
  // vẫn được liên kết.
  useEffect(() => {
    if (!dockOpen) return;
    if (compareView === "demand-access" && meta.id !== "population") setDockOpen(false);
    if (compareView === "utilization-pattern" && meta.id !== STATION_OCC_FIELD) setDockOpen(false);
  }, [dockOpen, compareView, meta, setDockOpen]);
  useEffect(() => {
    if (!needOcc || occupancy) return;
    void fetchOccupancy().then(setOccupancy, fail);
  }, [needOcc, occupancy]);

  const t = useStore((s) => s.t);
  const brush = useStore((s) => s.brush);

  /**
   * Chia bậc của `station:occ` — tính MỘT LẦN trên cả 168 giờ, không theo từng giờ.
   *
   * Đây là quyết định quan trọng nhất của trường này (xem `allOccValues`): chia bậc theo
   * giờ thì màu đổi nghĩa 4 lần mỗi giây khi scrubber chạy, và hai giờ không so được với
   * nhau. Cùng lý do §1b loại `HeatmapLayer`, chỉ khác trục.
   */
  const occClassing = useMemo(
    () => (occupancy ? buildScale("numeric", allOccValues(occupancy.profiles)) : null),
    [occupancy],
  );
  const city = useMemo(() => (occupancy ? cityProfile(occupancy.profiles) : []), [occupancy]);

  // Trường trạm: NGƯỠNG lấy từ cả tuần (ở trên), còn hai SỐ ĐẾM là của giờ đang xem —
  // legend đếm cái đang vẽ. Hai thứ khác nhau và chúng phải đến từ hai chỗ khác nhau.
  useEffect(() => {
    if (meta.id !== STATION_OCC_FIELD || !occupancy || !occClassing) return;
    const c = occCountAt(occupancy.profiles, t);
    setScale({ ...occClassing, n: c.present, nNull: c.missing });
  }, [meta, occupancy, occClassing, t]);

  // Asset supply không phụ thuộc telemetry. Cùng geometry trạm nhưng khác measure, nên
  // scale đọc trực tiếp `stations` và null là “chưa khai cổng”, không là “chưa quan sát”.
  useEffect(() => {
    if (meta.id !== STATION_PORTS_FIELD) return;
    setScale(buildScale(meta.kind, stations.map((s) => s.nPorts), meta.diverge));
  }, [meta, stations]);

  /**
   * Giá trị của ĐỐI TƯỢNG ĐANG CHỌN theo measure đang tô — mốc trên thước đo của legend.
   *
   * §8 của DESIGN.md đòi map, legend và inspector cùng nói MỘT measure; ba mặt ấy đang nói
   * đúng một measure nhưng không nói với nhau. Người xem bấm một xã, inspector đưa ra con
   * số, rồi phải tự ước lượng con số đó nằm đâu trên thang màu — tức tự làm bằng mắt đúng
   * phép tra mà thang màu tồn tại để làm hộ.
   *
   * Tính ở đây vì đây là chỗ duy nhất giữ cả năm mảng dữ liệu. Trả `null` khi không tra
   * được (chưa nạp, đối tượng không có trong measure này) — mốc vắng mặt là câu trả lời
   * đúng cho "không biết", không phải 0.
   */
  const selectedValue = useMemo<number | null>(() => {
    if (!cellSel) return null;
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;

    const commune = communeCodeOf(cellSel);
    if (commune && meta.readAs === "commune" && communes) {
      const f = communes.features.find((c) => c.properties["commune_code"] === commune);
      return f ? num(f.properties[meta.column]) : null;
    }
    const h3 = cellIdOf(cellSel);
    if (h3 && meta.readAs === "cell") return num(cells.find((c) => c.h3 === h3)?.value);

    const station = stationIdOf(cellSel);
    if (station && meta.id === STATION_PORTS_FIELD)
      return num(stations.find((s) => s.id === station)?.nPorts);
    if (station && meta.id === STATION_OCC_FIELD && occupancy) {
      const i = occupancy.stations.findIndex((s) => s.id === station);
      return i < 0 ? null : num(stationOccAt(occupancy.profiles, i, t));
    }
    const road = roadIdOf(cellSel);
    if (road && meta.readAs === "road") return num(roads.find((r) => r.id === road)?.dist);
    return null;
  }, [cellSel, meta, communes, cells, stations, occupancy, roads, t]);

  const dockData: DockData = useMemo(() => {
    let histValues: number[] = [];
    let total = 0;
    let kept = 0;
    const numeric = (v: unknown): number | null =>
      typeof v === "number" && !Number.isNaN(v) ? v : null;

    if (meta.readAs === "cell") {
      for (const c of cells) {
        total++;
        const v = numeric(c.value);
        if (v !== null) histValues.push(v);
        if (keep(brush, { value: c.value, scatter: { x: c.pop, y: c.dist } })) kept++;
      }
    } else if (meta.readAs === "commune" && communes) {
      for (const f of communes.features) {
        total++;
        const v = numeric(f.properties[meta.column]);
        if (v !== null) histValues.push(v);
        if (keep(brush, { value: f.properties[meta.column] })) kept++;
      }
    } else if (meta.readAs === "road") {
      for (const r of roads) {
        total++;
        if (r.dist !== null) histValues.push(r.dist);
        if (keep(brush, { value: r.dist })) kept++;
      }
    } else if (meta.id === STATION_OCC_FIELD && occupancy) {
      for (let s = 0; s < occupancy.profiles.n; s++) {
        total++;
        const v = stationOccAt(occupancy.profiles, s, t);
        if (v !== null) histValues.push(v);
        if (keep(brush, { value: v })) kept++;
      }
    } else if (meta.id === STATION_PORTS_FIELD) {
      for (const s of stations) {
        total++;
        if (s.nPorts !== null) histValues.push(s.nPorts);
        if (keep(brush, { value: s.nPorts })) kept++;
      }
    }
    if (meta.kind !== "numeric") histValues = [];

    const points = cells
      .filter((c) => c.dist !== null)
      .map((c) => ({ x: c.pop, y: c.dist as number }));

    return {
      histValues,
      points,
      nScatterMissing: cells.length - points.length,
      city,
      occScale: occClassing,
      kept: total > 0 ? { n: kept, total } : null,
    };
  }, [meta, cells, communes, roads, stations, occupancy, t, brush, city, occClassing]);

  const activeNavMode = dataMode ? "data" : scene ? "story" : "map";
  const isStoryEnabled = manifest?.story_enabled !== false && storyEnabled();
  /*
   * Scrubber chỉ có mặt khi nó ĐIỀU KHIỂN được thứ gì đó — DESIGN.md §3.3.
   *
   * Điều kiện cũ là "bộ dữ liệu có lớp occupancy", tức nó hiện ở gần như mọi phiên xem, kể
   * cả khi bản đồ đang tô một trường của XÃ mà nó không đụng tới. Hậu quả không phải chỉ là
   * thừa: nó chiếm một dải ngang đáy màn hình và tự dán lên mình dòng "chỉ tác động khi
   * chọn trường nhịp trạm" — một điều khiển vô hiệu, giải thích vì sao nó vô hiệu, ngay
   * cạnh bản đồ. Cùng loại lỗi mà §3a cấm ở nav: giao diện không được hứa thứ nó không có.
   *
   * Hai đường nó thật sự tác động: trường đang tô LÀ nhịp trạm, hoặc một TRẠM đang được
   * chọn (panel trạm có mini-heatmap 168h đọc theo `t`).
   */
  const scrubberVisible =
    !scene &&
    !dataMode &&
    layerUsable("occupancy") &&
    (meta.id === STATION_OCC_FIELD || stationIdOf(cellSel) !== null);

  const handleSelectNavMode = (mode: "map" | "story" | "data") => {
    if (mode === "data") {
      setDataMode(true);
    } else if (mode === "story") {
      if (isStoryEnabled) enterScene(SCENES[0]!.id);
    } else {
      enterScene(null);
      setDataMode(false);
    }
  };

  // Surface Coordinator Rule: When an object/cell selection is active, close Compare Dock so Inspector has exclusive right panel space
  useEffect(() => {
    if (cellSel && dockOpen) {
      setDockOpen(false);
    }
  }, [cellSel, dockOpen, setDockOpen]);

  const handleResetView = () => {
    setView({
      lng: INITIAL_VIEW.center[0],
      lat: INITIAL_VIEW.center[1],
      zoom: INITIAL_VIEW.zoom,
      pitch: mode === "3d" ? 50 : 0,
      bearing: INITIAL_VIEW.bearing,
    });
  };

  return (
    <div className="flex h-full bg-panel text-ink overflow-hidden">
      <NavRail
        manifest={manifest}
        activeMode={activeNavMode}
        storyEnabled={isStoryEnabled}
        onSelectMode={handleSelectNavMode}
        basemapStyle={basemapStyle}
        onSelectBasemap={setBasemapStyle}
        viewMode={mode}
        onToggle2D3D={() => setMode(mode === "2d" ? "3d" : "2d")}
        onResetView={handleResetView}
        workspaceOpen={workspaceOpen}
        onToggleWorkspace={() => setWorkspaceOpen(!workspaceOpen)}
      />

      <div className="flex min-w-0 flex-1 flex-col relative overflow-hidden">
        {error && (
          <div className="shrink-0 border-b border-hairline bg-panel px-4 py-2 text-heading">
            Không nạp được dữ liệu: {error}
            <span className="text-ink-muted"> — đã chạy `make web-data` chưa?</span>
          </div>
        )}

        {dataMode && <DataMode manifest={manifest} occupancy={occupancy} />}

        {!dataMode && (
          <div className="flex min-h-0 flex-1 relative">
            <main className="relative min-w-0 flex-1">
              <MapView
                field={meta}
                cells={cells}
                communes={communes}
                boundary={boundary}
                stations={stations}
                scale={scale}
                surfaceBreaks={surfaceBreaks}
                roads={roads}
                routes={routes}
                poi={poi}
                occupancy={occupancy}
              />

              {/* Floating Legend Top-Left */}
              <FloatingLegend
                field={meta}
                scale={scale}
                manifest={manifest}
                runtime={runtimeCov}
                surfaceBreaks={surfaceBreaks}
                selectedValue={selectedValue}
              />

              {/* Inspector Sheet from Right */}
              {!scene && (
                <AtlasInspector
                  manifest={manifest}
                  communes={communes}
                  poi={poi}
                  occupancy={occupancy}
                  occScale={occClassing}
                  roads={roads}
                  roadsLoading={roadsLoading}
                />
              )}

              {/* Floating Workspace Bottom-Right */}
              {!scene && (
                <FloatingWorkspace
                  manifest={manifest}
                  runtime={runtimeCov}
                  communes={communes}
                  scrubberVisible={scrubberVisible}
                />
              )}
            </main>

            {/* Compare Dock on Right */}
            {!scene && <CompareDock field={meta} dockData={dockData} />}

            {/* Story Column in Story Mode */}
            {scene ? (
              <StoryColumn communes={communes} manifest={manifest} />
            ) : null}
          </div>
        )}

        {scrubberVisible && <Scrubber field={field} />}
      </div>
    </div>
  );
}
