import { useEffect, useMemo, useRef, useState } from "react";

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
  lensOfField,
  type RuntimeCoverage,
} from "./fields";
import { selectionWireOf, useStore } from "./state/store";
import { filterKeepsCell, filterKeepsStation, isKnownPopulation } from "./state/filter";
import { syncHash } from "./state/hash";
import { INITIAL_VIEW } from "./state/view-config";
import { storyEnabled } from "./story/scenes";
import { StoryColumn } from "./story/StoryColumn";
import { DataMode } from "./ui/DataMode";
import { Scrubber } from "./ui/Scrubber";
import { NavRail } from "./components/atlas/NavRail";
import { LayersTab } from "./ui/LayersTab";
import { AtlasReadColumn } from "./components/atlas/AtlasReadColumn";
import { presetStatsFrom } from "./state/presets";
import { FilterChip, type FilterCounts } from "./ui/FilterSummary";
import { EvidenceCard } from "./components/atlas/EvidenceCard";
import { AppShell } from "./components/atlas/AppShell";
import { MapWorkspace, ModeSwitch, Workspace } from "./components/atlas/Workspace";
import NationalApp from "./national/NationalApp";
import type { AppNavMode } from "./state/types";
import { allOccValues, occCountAt, occCoverage, stationOccAt } from "./viz/occ";
import { buildScale, computeClassingByWeight, type Scale } from "./viz/palette";
import { bivariateAxes } from "./viz/demand";

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

interface CellSnapshot {
  fieldId: string;
  rows: GridCell[];
  scale: Scale;
}

interface ScaleSnapshot {
  fieldId: string;
  scale: Scale;
}

export default function App() {
  const field = useStore((s) => s.field);
  const scene = useStore((s) => s.scene);
  const dataMode = useStore((s) => s.dataMode);
  const nationalMode = useStore((s) => s.nationalMode);
  const setAppNavMode = useStore((s) => s.setAppNavMode);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const setBasemapStyle = useStore((s) => s.setBasemapStyle);
  const setView = useStore((s) => s.setView);
  const readColumnOpen = useStore((s) => s.readColumnOpen);
  const setReadColumnOpen = useStore((s) => s.setReadColumnOpen);
  const layerCount = useStore((s) => s.layers.size);
  const cellSel = useStore(selectionWireOf);
  const [cellSnapshot, setCellSnapshot] = useState<CellSnapshot | null>(null);
  const [communes, setCommunes] = useState<CommuneCollection | null>(null);
  const [boundary, setBoundary] = useState<CommuneCollection | null>(null);
  const [stations, setStations] = useState<StationPoint[]>([]);
  const [roads, setRoads] = useState<RoadSeg[]>([]);
  const [roadsLoading, setRoadsLoading] = useState(false);
  const roadsRequest = useRef<Promise<void> | null>(null);
  const [routes, setRoutes] = useState<ShowcaseRoute[]>([]);
  const [poi, setPoi] = useState<PoiCollection | null>(null);
  const [occupancy, setOccupancy] = useState<StationOccupancy | null>(null);
  const [scaleSnapshot, setScaleSnapshot] = useState<ScaleSnapshot | null>(null);
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
            cell: selectionWireOf(s),
            selection: s.selection,
            scene: s.scene,
            dataMode: s.dataMode,
            nationalMode: s.nationalMode,
            t: s.t,
            filter: s.filter.active,
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

  // Chỉ công bố rows và scale khi cả hai thuộc cùng field. Trong lúc truy vấn field mới,
  // snapshot cũ bị che thay vì ghép metadata mới với giá trị/ngưỡng cũ trong một frame.
  const activeCellSnapshot = meta.readAs === "cell" && cellSnapshot?.fieldId === meta.id ? cellSnapshot : null;
  const cells = meta.readAs === "cell" ? activeCellSnapshot?.rows ?? [] : cellSnapshot?.rows ?? [];
  const scale = meta.readAs === "cell"
    ? activeCellSnapshot?.scale ?? null
    : scaleSnapshot?.fieldId === meta.id ? scaleSnapshot.scale : null;

  // Hai trục bivariate dựng từ đúng snapshot ô đang công bố.
  const bivariate = useMemo(() => (cells.length ? bivariateAxes(cells) : null), [cells]);

  /**
   * Thống kê một phiên cho Quick Preset — Phase 5 §2.3.
   *
   * Suy từ dữ liệu ĐÃ cư trú, không phát truy vấn nào: `cells` mang `pop` ở mọi trường của
   * Ô (xem `GridCell.pop`), còn snapshot Trạm nạp từ boot. `manifest` cấp danh sách cột để
   * `resolvePreset` biết preset nào gói này đỡ được.
   *
   * Memo trên `cells` chứ không trên `analyticalCells`: ngưỡng của một preset phải tính trên
   * TOÀN BỘ tập, nếu không thì áp preset lần hai sẽ tính phân vị trên tập đã bị chính nó thu
   * hẹp — một vòng phản hồi cứ mỗi lần bấm lại siết thêm.
   */
  const presetStats = useMemo(
    () => presetStatsFrom({ cells, stations, manifest }),
    [cells, stations, manifest],
  );

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
    setScaleSnapshot({
      fieldId: meta.id,
      scale: buildScale(meta.kind, communes.features.map((f: CommuneFeature) => f.properties[meta.column] ?? null), meta.diverge, meta.categorical),
    });
  }, [meta, communes]);

  useEffect(() => {
    if (meta.readAs !== "cell") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchField(meta);
        if (cancelled) return;
        setCellSnapshot({
          fieldId: meta.id,
          rows,
          scale: buildScale(meta.kind, rows.map((r) => r.value), meta.diverge, meta.categorical),
        });
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
    if (roads.length || roadsRequest.current) return;
    setRoadsLoading(true);
    roadsRequest.current = Promise.all([fetchRoads(), fetchShowcaseRoutes()])
      .then(([segs, showcase]) => {
        setRoads(segs);
        setRoutes(showcase);
      })
      .catch((error) => {
        roadsRequest.current = null;
        fail(error);
      })
      .finally(() => setRoadsLoading(false));
  }, [meta.readAs, cellSel, roads.length]);

  // Scale là derivation của field đang xem, không phải side effect tình cờ của lần nạp
  // roads. Vì vậy deep-link nạp roads trước rồi đổi sang field road vẫn dựng đúng scale.
  useEffect(() => {
    if (meta.readAs !== "road" || roads.length === 0) return;
    setScaleSnapshot({
      fieldId: meta.id,
      scale: buildScale(meta.kind, roads.map((r) => r.dist), meta.diverge, meta.categorical),
    });
    setRoadCov(new Map([[meta.id, roadCoverage(roads)]]));
  }, [meta, roads]);

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
    let cancelled = false;
    void fetchField(seed).then((rows) => {
      if (cancelled) return;
      setCellSnapshot({
        fieldId: seed.id,
        rows,
        scale: buildScale(seed.kind, rows.map((r) => r.value), seed.diverge, seed.categorical),
      });
    }, fail);
    return () => {
      cancelled = true;
    };
  }, [meta.readAs, cells.length]);

  // ── Nhịp trạm 168h — M4 ──────────────────────────────────────────────────────
  //
  // Nạp LƯỜI như roads và POI (§5a). Ba đường cần nó: trường `station:occ`, một trạm đang
  // được chọn (mini-heatmap 168h), hoặc chế độ DỮ LIỆU dựng small multiples.
  const occupancyUnavailable = manifest?.unusable_layers?.find((item) => item.layer === "occupancy") ?? null;
  const needOcc =
    lensOfField(meta.id) === "utilization" ||
    (stationIdOf(cellSel) !== null && !scene) ||
    dataMode;
  useEffect(() => {
    // Wait for manifest capability before issuing the large profile request. A dataset
    // that explicitly disables occupancy must render its measured reason, not a fetch error.
    if (!manifest || occupancyUnavailable || !needOcc || occupancy) return;
    void fetchOccupancy().then(setOccupancy, fail);
  }, [manifest, occupancyUnavailable, needOcc, occupancy]);

  const t = useStore((s) => s.t);
  const analysisFilter = useStore((s) => s.filter.active);

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

  // Trường trạm: NGƯỠNG lấy từ cả tuần (ở trên), còn hai SỐ ĐẾM là của giờ đang xem —
  // legend đếm cái đang vẽ. Hai thứ khác nhau và chúng phải đến từ hai chỗ khác nhau.
  useEffect(() => {
    if (meta.id !== STATION_OCC_FIELD || !occupancy || !occClassing) return;
    const c = occCountAt(occupancy.profiles, t);
    setScaleSnapshot({ fieldId: meta.id, scale: { ...occClassing, n: c.present, nNull: c.missing } });
  }, [meta, occupancy, occClassing, t]);

  // Asset supply không phụ thuộc telemetry. Cùng geometry trạm nhưng khác measure, nên
  // scale đọc trực tiếp `stations` và null là “chưa khai cổng”, không là “chưa quan sát”.
  //
  // Mẫu số là trạm IN, không phải cả 939: từ Phase 4 lớp mặt tô chỉ vẽ trạm IN (§1.3), nên
  // đếm cả BUFFER sẽ khiến legend cộng một chấm nó không hề vẽ — một trạm BUFFER thiếu
  // `n_ports` từng làm ô "vắng số" của legend tăng lên mà bản đồ không có thêm vân nào.
  // KHÔNG áp filter ở đây: ngưỡng chia bậc phải đứng yên khi bộ lọc bật/tắt, nếu không
  // cùng một màu sẽ đổi nghĩa giữa hai lần bấm (§1.1).
  useEffect(() => {
    if (meta.id !== STATION_PORTS_FIELD) return;
    setScaleSnapshot({
      fieldId: meta.id,
      scale: buildScale(
        meta.kind,
        stations.filter((s) => s.inScope).map((s) => s.nPorts),
        meta.diverge,
        meta.categorical,
      ),
    });
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

  /**
   * TẬP PHÂN TÍCH — dẫn xuất ĐÚNG MỘT LẦN, ở đây (§5.2, §5.4).
   *
   * Trước đợt sửa này phép thử của bộ lọc được viết lại ở bốn nơi (bản đồ, model biểu đồ,
   * dòng readout, Inspector) và chúng đã lệch nhau ở đúng chỗ dễ bỏ qua nhất: một ô dân số
   * ÂM vừa được vẽ vừa bị đếm là khuyết. Nay cả bốn gọi chung `filterKeepsCell` /
   * `filterKeepsStation`, và MapView chỉ nhận mảng đã lọc.
   *
   * `filter.active` là tham chiếu BẤT BIẾN và `applyFilterIntent` giữ nguyên nó khi bộ lọc
   * không đổi nghĩa, nên hai memo này không chạy lại vì một lượt render thừa — kể cả trong
   * lúc scrubber chạy 4 lần/giây.
   */
  const analyticalCells = useMemo(
    () => (analysisFilter ? cells.filter((c) => filterKeepsCell(analysisFilter, c)) : cells),
    [cells, analysisFilter],
  );

  // Luật IN-only (§1.3) áp KỂ CẢ khi không có bộ lọc: trạm BUFFER là bối cảnh, không bao
  // giờ là số đo. Nó nằm ngoài `filterKeepsStation` vì nó không phải một mệnh đề lọc.
  const analyticalStations = useMemo(
    () =>
      stations.filter((st) => st.inScope && filterKeepsStation(analysisFilter, st)),
    [stations, analysisFilter],
  );

  /**
   * kept/eligible/total của bộ lọc — tính MỘT LẦN ở đây rồi phát xuống.
   *
   * Trước đây controller tự `reduce` qua toàn bộ `cells` trong thân render, mà controller
   * lại có đăng ký `t`, nên con số ấy được tính lại 4 lần mỗi giây trong lúc scrubber chạy
   * dù không có gì liên quan tới thời gian. Ở đây nó đi cùng memo của chính tập phân tích.
   */
  const filterCounts = useMemo<FilterCounts | null>(() => {
    if (!analysisFilter) return null;
    if (analysisFilter.entity === "h3-cell") {
      let eligible = 0;
      for (const c of cells) if (isKnownPopulation(c.pop)) eligible++;
      return {
        kept: analyticalCells.length,
        eligible,
        total: cells.length,
        excludedNull: cells.length - eligible,
      };
    }
    let inScope = 0;
    for (const st of stations) if (st.inScope) inScope++;
    return {
      kept: analyticalStations.length,
      eligible: inScope,
      total: inScope,
      excludedNull: 0,
    };
  }, [analysisFilter, cells, stations, analyticalCells, analyticalStations]);

  /**
   * Đối tượng ĐANG CHỌN có nằm ngoài tập lọc không — tính ở ĐÂY, không để Inspector tự suy.
   *
   * §5.4 nói rõ Inspector NHẬN cờ này. Tự suy có một lỗ thật: khi hàng của nó không có
   * trong snapshot đang mở, phép suy cục bộ trả `false` và Inspector khẳng định "đang trong
   * tập lọc" trong khi bản đồ không vẽ mark nào — sai theo đúng chiều nguy hiểm.
   *
   * Snapshot RỖNG (đang nạp) trả `false`: lúc đó ta không biết gì cả, và một nhãn "ngoài
   * tập lọc" nhấp nháy mỗi lần đổi trường còn tệ hơn là không nói.
   */
  const outsideActiveSubset = useMemo(() => {
    if (!analysisFilter || !cellSel) return false;
    if (analysisFilter.entity === "h3-cell") {
      const h3 = cellIdOf(cellSel);
      if (!h3 || cells.length === 0) return false;
      const row = cells.find((c) => c.h3 === h3);
      // Không tìm thấy trong snapshot ĐÃ NẠP ⇒ mark của nó không được vẽ ⇒ nó nằm ngoài.
      return row ? !filterKeepsCell(analysisFilter, row) : true;
    }
    const station = stationIdOf(cellSel);
    if (!station || stations.length === 0) return false;
    const row = stations.find((st) => st.id === station);
    if (!row) return true;
    return !row.inScope || !filterKeepsStation(analysisFilter, row);
  }, [analysisFilter, cellSel, cells, stations]);

  const activeNavMode: AppNavMode = nationalMode
    ? "national"
    : dataMode
    ? "data"
    : scene
    ? "story"
    : "map";
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
    !nationalMode &&
    !scene &&
    !dataMode &&
    layerUsable("occupancy") &&
    (meta.id === STATION_OCC_FIELD || stationIdOf(cellSel) !== null);

  const handleSelectNavMode = (targetMode: AppNavMode) => {
    if (targetMode === "story" && !isStoryEnabled) return;
    setAppNavMode(targetMode);
  };

  /*
   * ĐÃ BỎ ở đợt 15/8/2026: "chọn một đối tượng ⇒ đóng compare".
   *
   * Luật ấy tồn tại vì inspector và compare là hai TẤM neo cùng một chỗ, và hai tấm chồng
   * nhau là lỗi. Nhưng cái giá của nó là: bấm vào một ô để đọc bằng chứng thì biểu đồ phân
   * bố biến mất — đúng lúc người xem có một giá trị cụ thể để tìm nó trên thang. Nay cả hai
   * là hai TIẾT của một cột (§3g) nên không còn gì để điều phối, và cũng không còn luật.
   */

  const handleResetView = () => {
    setView({
      lng: INITIAL_VIEW.center[0],
      lat: INITIAL_VIEW.center[1],
      zoom: INITIAL_VIEW.zoom,
      pitch: mode === "3d" ? 50 : 0,
      bearing: INITIAL_VIEW.bearing,
    });
  };

  const mapSurface = (
    <MapWorkspace
      readColumn={scene
        ? <StoryColumn communes={communes} manifest={manifest} />
        : <AtlasReadColumn
            field={meta}
            scale={scale}
            manifest={manifest}
            runtime={runtimeCov}
            surfaceBreaks={surfaceBreaks}
            bivariate={bivariate}
            selectedValue={selectedValue}
            filterCounts={filterCounts}
            communes={communes}
            stations={stations}
            cells={cells}
            occupancy={occupancy}
            utilizationScale={occClassing}
            utilizationUnavailableReason={occupancyUnavailable?.reason}
            presetStats={presetStats}
          />}
      map={
        <>
          <MapView
            field={meta}
            cells={cells}
            analyticalCells={analyticalCells}
            analyticalStations={analyticalStations}
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
          {!scene && analysisFilter && (
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex">
              <FilterChip
                filter={analysisFilter}
                counts={filterCounts}
                onClear={() => useStore.getState().clearFilter("user")}
              />
            </div>
          )}
          {!scene && (
            <EvidenceCard
              manifest={manifest}
              communes={communes}
              poi={poi}
              occupancy={occupancy}
              occScale={occClassing}
              roads={roads}
              roadsLoading={roadsLoading}
              cells={cells}
              scale={scale}
              outsideActiveSubset={outsideActiveSubset}
            />
          )}
        </>
      }
    />
  );

  return (
    <AppShell nav={
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
        readColumnOpen={readColumnOpen}
        onToggleReadColumn={() => setReadColumnOpen(!readColumnOpen)}
        layerCount={layerCount}
        overlayControls={<LayersTab manifest={manifest} />}
      />
    }>
      <Workspace error={error} bottom={scrubberVisible ? <Scrubber field={field} /> : undefined}>
        <ModeSwitch
          mode={activeNavMode}
          map={mapSurface}
          story={mapSurface}
          data={<DataMode manifest={manifest} occupancy={occupancy} />}
          national={<div className="relative min-h-0 flex-1 overflow-hidden"><NationalApp /></div>}
        />
      </Workspace>
    </AppShell>
  );
}
