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
  fetchSubstations,
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
import type { SubstationCollection } from "./data/substations";
import { poiRefOf, stationIdOf } from "./data/h3";
import { fetchOccupancy, type StationOccupancy } from "./data/occupancy";
import { loadManifest, type Manifest } from "./data/manifest";
import {
  DEFAULT_FIELD,
  FIELD_BY_ID,
  STATION_OCC_FIELD,
  fieldAvailable,
  layerUsable,
  type RuntimeCoverage,
} from "./fields";
import { ProvincePicker } from "./ui/ProvincePicker";
import { keep } from "./state/brush";
import { useStore } from "./state/store";
import { syncHash } from "./state/hash";
import { SCENES } from "./story/scenes";
import { StoryColumn } from "./story/StoryColumn";
import { DataMode } from "./ui/DataMode";
import { Dock, DockTab, type DockData } from "./ui/Dock";
import { Legend } from "./ui/Legend";
import { Rail } from "./ui/Rail";
import { Scrubber } from "./ui/Scrubber";
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
interface NavItem {
  label: string;
  /** đã dựng chưa — `false` thì mục hiện mờ hẳn và không bấm được */
  ready: boolean;
  /** mốc sẽ dựng, hiện NGAY TRÊN nav; rỗng = chưa xếp lịch */
  milestone?: string;
  /** câu đầy đủ, hiện khi rê chuột */
  note?: string;
  /** bấm thì làm gì. Vắng = chưa dựng, và `ready: false` phải đi kèm. */
  go?: () => void;
}

// M3.5: 3D thành thật — hết `ready: false`, hết nhãn M5, có `go` (§3a: dựng xong thì
// phải BỎ dấu hiệu "chưa dựng" đi, để lại một cái là nói dối theo chiều ngược lại).

/**
 * Một mục nav.
 *
 * Dùng `aria-disabled` chứ KHÔNG dùng thuộc tính `disabled`: phần tử `disabled` không
 * nhận sự kiện chuột ở nhiều trình duyệt, nên `title` của nó không bao giờ hiện — lời
 * giải thích sẽ vô hình đúng lúc cần nhất. Và mốc còn được in THẲNG lên nav, để thông tin
 * không phụ thuộc việc rê chuột.
 */
function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <button
      aria-disabled={!item.ready}
      aria-current={active || undefined}
      title={item.note}
      onClick={item.go}
      className={`${item.go ? "cursor-pointer" : "cursor-default"} ${
        item.ready ? (active ? "text-ink" : "text-ink-2 hover:text-ink") : "text-ink-muted/50"
      }`}
    >
      {item.label}
      {item.milestone && (
        <span className="pl-1 align-super text-[9px] tracking-normal">{item.milestone}</span>
      )}
    </button>
  );
}

function Nav({ manifest }: { manifest: Manifest | null }) {
  const scene = useStore((s) => s.scene);
  const enterScene = useStore((s) => s.enterScene);
  const dataMode = useStore((s) => s.dataMode);
  const setDataMode = useStore((s) => s.setDataMode);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const viewModes: NavItem[] = [
    { label: "2D", ready: true, go: () => setMode("2d") },
    {
      label: "3D",
      ready: true,
      note: "khối POI + nhà cửa basemap, pitch 50 — phóng tới z12 để thấy nhà",
      go: () => setMode("3d"),
    },
  ];

  // Cảnh CÂU CHUYỆN được VIẾT cho Hà Nội: nó gọi tên hai xã cụ thể (`scenes.ts`), bay tới
  // toạ độ cụ thể, và dựa vào `detour_ratio` — một cột của lớp TÍNH TOÁN mà store toàn quốc
  // chưa có. Ở tỉnh khác nó phải hiện như CHƯA DỰNG (§3a), không phải bay tới một xã không
  // tồn tại rồi im lặng không vẽ gì.
  const storyOn = manifest?.story_enabled !== false;

  const appModes: NavItem[] = [
    {
      label: "CÂU CHUYỆN",
      ready: storyOn,
      note: storyOn
        ? undefined
        : "cảnh được viết cho Hà Nội và cần lớp TÍNH TOÁN (detour_ratio) — chưa dựng cho tỉnh này",
      // Vào lại thì về cảnh ĐANG xem nếu có, không phải luôn về cảnh đầu — nhưng ở chế độ
      // BẢN ĐỒ thì `scene` là null, nên nút này luôn mở cảnh đầu. Đúng ý: câu chuyện đọc
      // từ đầu, và mọi cảnh vẫn tới thẳng được bằng link (§9a).
      go: storyOn ? () => enterScene(SCENES[0]!.id) : undefined,
    },
    { label: "BẢN ĐỒ", ready: true, go: () => { enterScene(null); setDataMode(false); } },
    // M4.2 — trang dữ liệu thành thật: hết `ready: false`, hết nhãn M4.2, có `go`. Mặt kia
    // của luật §3a, đúng như CÂU CHUYỆN đã trải ở M3 và 3D ở M3.5: để lại một trong bốn dấu
    // hiệu "chưa dựng" là nói dối theo chiều ngược lại.
    {
      label: "DỮ LIỆU",
      ready: true,
      note: "KPI + chuẩn phích + hồ sơ ngày theo dạng nhịp + bảng phủ + bảng dữ liệu (§3f)",
      go: () => setDataMode(true),
    },
  ];
  const activeLabel = dataMode ? "DỮ LIỆU" : scene ? "CÂU CHUYỆN" : "BẢN ĐỒ";

  return (
    <nav className="flex h-11 shrink-0 items-center gap-6 border-b border-hairline px-4 text-[13px]">
      <span className="font-semibold tracking-[0.14em]">
        EVCS {(manifest?.province?.province_name ?? "Hà Nội").toUpperCase()}
      </span>
      <ProvincePicker />
      <div className="flex items-center gap-4 tracking-[0.1em]">
        {appModes.map((m) => (
          <NavButton key={m.label} item={m} active={m.label === activeLabel} />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2 tracking-[0.1em]">
        <NavButton item={viewModes[0]!} active={mode === "2d"} />
        <span className="text-ink-muted/50">|</span>
        <NavButton item={viewModes[1]!} active={mode === "3d"} />
      </div>
    </nav>
  );
}

const NO_COVERAGE: Map<string, RuntimeCoverage> = new Map();

export default function App() {
  const field = useStore((s) => s.field);
  const scene = useStore((s) => s.scene);
  const dataMode = useStore((s) => s.dataMode);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [communes, setCommunes] = useState<CommuneCollection | null>(null);
  const [boundary, setBoundary] = useState<CommuneCollection | null>(null);
  const [stations, setStations] = useState<StationPoint[]>([]);
  const [roads, setRoads] = useState<RoadSeg[]>([]);
  const [routes, setRoutes] = useState<ShowcaseRoute[]>([]);
  const [poi, setPoi] = useState<PoiCollection | null>(null);
  const [substations, setSubstations] = useState<SubstationCollection | null>(null);
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
  const meta = picked && fieldAvailable(picked) ? picked : FIELD_BY_ID.get(DEFAULT_FIELD)!;

  // Sửa luôn STATE, không chỉ sửa lượt vẽ này: nếu chỉ thay ở đây thì hash vẫn ghi
  // `f=population` trong khi bản đồ tô một trường khác — URL nói một đằng, màn hình nói
  // một nẻo, và người gửi link không có cách nào biết. Cùng nguyên tắc "một nguồn sự thật"
  // mà ràng buộc 2 áp cho `field`.
  const setField = useStore((s) => s.setField);
  useEffect(() => {
    if (picked && !fieldAvailable(picked)) setField(DEFAULT_FIELD);
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
    setScale(buildScale(meta.kind, communes.features.map((f: CommuneFeature) => f.properties[meta.column] ?? null)));
  }, [meta, communes]);

  useEffect(() => {
    if (meta.readAs !== "cell") return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchField(meta);
        if (cancelled) return;
        setCells(rows);
        setScale(buildScale(meta.kind, rows.map((r) => r.value)));
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
    if (meta.readAs !== "road") return;
    let cancelled = false;
    void (async () => {
      try {
        const [segs, showcase] = await Promise.all([fetchRoads(), fetchShowcaseRoutes()]);
        if (cancelled) return;
        setRoads(segs);
        setRoutes(showcase);
        setScale(buildScale(meta.kind, segs.map((r) => r.dist)));
        // Phủ đo trên chính mảng vừa nạp — mẫu số là 160.823 đoạn, không phải 4.400 ô.
        setRoadCov(new Map([[meta.id, roadCoverage(segs)]]));
      } catch (e) {
        if (!cancelled) fail(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // POI nạp LƯỜI như roads (§5a): 3,39 MB, phần lớn phiên xem không bật nhóm POI nào.
  // Hai đường cần nó: một overlay `poi_*` bật, hoặc hash mở sẵn `c=poi:` (panel POI phải
  // dựng được cả khi chưa bật lớp nào — link là lời hứa, §9).
  const layersSet = useStore((s) => s.layers);
  const cellSel = useStore((s) => s.cell);
  const needPoi = poiGroupsOn(layersSet).length > 0 || poiRefOf(cellSel) !== null;
  useEffect(() => {
    if (!needPoi || poi) return;
    void fetchPoi().then(setPoi, fail);
  }, [needPoi, poi]);

  // Trạm biến áp — M5. Nạp lười cùng khuôn, dù chỉ 20 KB: điều kiện là một checkbox, và
  // một lớp không ai bật thì không đáng một request. Chỉ MỘT đường cần nó (overlay bật) —
  // khác POI, vì không có `c=substation:` nào: lớp này không bấm được (chưa có panel).
  useEffect(() => {
    if (!layersSet.has("substations") || substations) return;
    void fetchSubstations().then(setSubstations, fail);
  }, [layersSet, substations]);

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
  // Đường thứ ba từ M4.1: một TRẠM đang được chọn. Panel TRẠM có mini-heatmap 168h (§8a-3),
  // nên nó cần đúng bộ hồ sơ này — kể cả khi dock đóng và trường đang tô là trường của ô.
  // Đường thứ tư từ M4.2: chế độ DỮ LIỆU dựng small multiples từ chính hồ sơ đó (§3f-5).
  const needOcc =
    meta.readAs === "station" ||
    (dockOpen && !scene) ||
    (stationIdOf(cellSel) !== null && !scene) ||
    dataMode;
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
    if (meta.readAs !== "station" || !occupancy || !occClassing) return;
    const c = occCountAt(occupancy.profiles, t);
    setScale({ ...occClassing, n: c.present, nNull: c.missing });
  }, [meta, occupancy, occClassing, t]);

  const dockData: DockData = useMemo(() => {
    // Histogram vẽ CHÍNH thứ bản đồ đang tô — nên nguồn của nó đổi theo đơn vị đọc.
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
    } else if (meta.readAs === "station" && occupancy) {
      for (let s = 0; s < occupancy.profiles.n; s++) {
        total++;
        const v = stationOccAt(occupancy.profiles, s, t);
        if (v !== null) histValues.push(v);
        if (keep(brush, { value: v })) kept++;
      }
    }
    // Trường hạng mục/bool không có "khoảng giá trị" để kéo — dock nói ra thay vì vẽ một
    // histogram của mã hạng mục, thứ đọc thành một thứ tự không có thật (§6a-5).
    if (meta.kind !== "numeric") histValues = [];

    const points = cells
      .filter((c) => c.dist !== null)
      .map((c) => ({ x: c.pop, y: c.dist as number }));

    return {
      histValues,
      points,
      // Ô bị bỏ khỏi mặt phẳng vì thiếu MỘT trục (51 ô không tới được bằng đường bộ). Đếm ở
      // đây, hiện ở readout của scatter — đặt chúng ở 0 là bịa, im lặng về chúng là để hình
      // trông như nói về toàn bộ lưới.
      nScatterMissing: cells.length - points.length,
      city,
      occScale: occClassing,
      kept: total > 0 ? { n: kept, total } : null,
    };
  }, [meta, cells, communes, roads, occupancy, t, brush, city, occClassing]);

  return (
    <div className="flex h-full flex-col bg-panel text-ink">
      <Nav manifest={manifest} />

      {/* Dải legend là chú giải của MẶT TÔ — chế độ DỮ LIỆU không có bản đồ (§3f), nên để
          nó ở đó là một dải chú giải cho một thứ không có trên màn hình. */}
      {!dataMode && (
        <Legend
          field={meta}
          scale={scale}
          manifest={manifest}
          runtime={runtimeCov}
          surfaceBreaks={surfaceBreaks}
        />
      )}

      {/* Chế độ DỮ LIỆU THAY cả ba dải giữa (dock · bản đồ · rail), không chen vào giữa
          chúng — §3f: "không có bản đồ". Trạng thái bản đồ vẫn nguyên trong store và trong
          hash, nên bấm về BẢN ĐỒ trả người xem về đúng chỗ họ rời đi (luật bàn giao L2). */}
      {dataMode && <DataMode manifest={manifest} occupancy={occupancy} />}

      {/*
        THÁO hẳn ba dải chứ không `hidden` chúng, và đó là một quyết định có bẫy đi kèm:
        một `<canvas>` MapLibre khởi tạo trong lúc bị ẩn sẽ đo được kích thước 0×0 và giữ
        nguyên như thế cho tới khi có sự kiện resize — nên link `#d=1` mở nguội rồi bấm sang
        BẢN ĐỒ sẽ ra một bản đồ trống mà không lỗi nào. Tháo ra thì khung nhìn được dựng lại
        từ `store.view` (MapView đọc nó lúc khởi tạo), tức đúng chỗ người xem rời đi.
      */}
      {!dataMode && (
      <div className="flex min-h-0 flex-1">
        {/* Dock và scrubber là đồ đạc của chế độ BẢN ĐỒ — §3d-1. Trong một cảnh chúng
            không dựng: cảnh chốt trường + khung nhìn + tập ô của nó (L3), nên một bộ lọc
            bấm được bên cạnh là nguồn sự thật thứ hai cho "cảnh này cho xem những ô nào". */}
        {!scene && dockOpen && <Dock field={meta} data={dockData} />}
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
            substations={substations}
          />
          {!scene && <DockTab />}
          {error && (
            <div className="absolute inset-x-0 top-0 border-b border-hairline bg-panel px-4 py-2 text-[13px]">
              Không nạp được dữ liệu: {error}
              <span className="text-ink-muted"> — đã chạy `make web-data` chưa?</span>
            </div>
          )}
        </main>
        {/* Cột cảnh THAY rail, không đứng cạnh — §14c. Trong một cảnh không có bộ chọn
            trường vì cảnh chọn trường; để rail ở đó là hai thứ tranh nhau cùng một state. */}
        {scene ? (
          <StoryColumn communes={communes} manifest={manifest} />
        ) : (
          <Rail
            manifest={manifest}
            runtime={runtimeCov}
            communes={communes}
            poi={poi}
            occupancy={occupancy}
            occScale={occClassing}
          />
        )}
      </div>
      )}

      {/* Scrubber đọc hồ sơ 168 giờ. Lớp đó không đọc được thì thanh trượt vẫn kéo được
          và bản đồ vẫn đổi — nhưng đổi giữa các giờ trống, tức một chuyển động không mang
          thông tin nào. Tắt hẳn, cùng luật §3a với nav "chưa dựng". */}
      {!scene && !dataMode && layerUsable("occupancy") && <Scrubber field={field} />}
    </div>
  );
}
