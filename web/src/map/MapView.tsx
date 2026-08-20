import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { ContourLayer, HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";

import { IconLayer } from "@deck.gl/layers";

import { labelLayerIds, loadStyle } from "./positron";
import { getMapTooltip } from "./tooltip";
import type {
  CommuneCollection,
  GridCell,
  RoadSeg,
  ShowcaseRoute,
  StationPoint,
} from "../data/queries";
import { SURFACE_CELL_M } from "../data/queries";
import { STATION_PORTS_FIELD, hasDemandRepresentations, type FieldMeta } from "../fields";
import { selectionWireOf, useStore } from "../state/store";
import {
  SCENE_BY_ID,
  activeCellFilter,
  beatHasFilter,
  beatOf,
  type CellFilter,
  type SceneMark,
} from "../story/scenes";
import { majorBridges } from "../story/bridges";
import { formatNumber } from "../ui/format";
import type { DemandRepresentation, Mode, OverlayId } from "../state/types";
import { PathStyleExtension } from "@deck.gl/extensions";
import { cellToBoundary } from "h3-js";
import { HatchExtension } from "../viz/hatch-extension";
import { NULL_STATE_HATCH_DEG, type NullState } from "../data/null-states";
import { planFor } from "../viz/render-plan";
import { cellIdOf, communeCodeOf, poiRefOf, roadIdOf, serializeSelection, stationIdOf } from "../data/h3";
import { dacKhuLabels, type DacKhuLabel } from "../data/dackhu";
import { useSimulationStore } from "../simulation/store";
import type { CandidatePoint, SimulationResult } from "../simulation/types";
import { generateCirclePath } from "../simulation/geometry";
import {
  STATUS_ICON_ID,
  isAbnormal,
  buildStatusIconAtlas,
  statusIconSize,
  statusRingRadius,
  type StatusIconEntry,
} from "../viz/station-status";
import {
  POI_BLOCK_HEIGHT_M,
  hasShape,
  poiGroupsOn,
  poiRef,
  type PoiCollection,
  type PoiFeature,
} from "../data/poi";
import { buildPoiIconAtlas, iconId, type IconEntry } from "../viz/poi-icons";
import {
  BASEMAP_RGB,
  COLD_HEX,
  COLD_RGB,
  HATCH_RGB,
  RAMP_RGB,
  SELECT_CASING_RGB,
  SELECT_CASING_W,
  SELECT_CORE_W,
  SELECT_RGB,
  colorFor,
  type RGB,
  type Scale,
} from "../viz/palette";
import { elevationFor, MAX_ELEV_R8_M } from "../national/elevation";
import { EXTRUSION_MATERIAL, PROVINCE_LIGHTING } from "../viz/lighting";
import type { StationOccupancy } from "../data/occupancy";
import { stationOccAt } from "../viz/occ";
import { DEMAND_SUPPLY_RGB, bivariateAxes, tertileClass } from "../viz/demand";
import { themeFor, type AnalysisTheme } from "../viz/theme";

interface Props {
  field: FieldMeta;
  cells: GridCell[];
  communes: CommuneCollection | null;
  /** ranh giới Hà Nội — lớp BỐI CẢNH, không phải overlay (M2.1 F4/F5) */
  boundary: CommuneCollection | null;
  stations: StationPoint[];
  scale: Scale | null;
  /** ngưỡng dải đồng mức, đã chia bậc trên phép gộp thật (§1b) */
  surfaceBreaks: number[];
  /** 160.823 đoạn đường — đơn vị đọc thứ ba (§6b), ship ở M3-R */
  roads: RoadSeg[];
  /** 3 cặp tuyến minh hoạ của cảnh C — §11 M3-R */
  routes: ShowcaseRoute[];
  /** 6.633 POI 4 nhóm — M3.5, nạp lười (§5a). `null` = chưa nạp. */
  poi: PoiCollection | null;
  /** 939 trạm × 168 giờ — đơn vị đọc `station` (M4), nạp lười. `null` = chưa nạp. */
  occupancy: StationOccupancy | null;
  /**
   * Tập PHÂN TÍCH đã áp SUBSET, dẫn xuất ở App (§5.4).
   *
   * `cells`/`stations` ở trên vẫn là tập ĐẦY ĐỦ và vẫn phải như vậy: lớp bối cảnh, overlay,
   * tooltip và ký hiệu ĐANG CHỌN đọc từ chúng, và §2.1 nói bộ lọc không đụng tới ba thứ đó.
   */
  analyticalCells?: GridCell[];
  analyticalStations?: StationPoint[];
}

/** Vân của overlay VÙNG — 135°, nghiêng ngược vân null 45°. §4d-1. */
const OVERLAY_HATCH = new HatchExtension({ angle: 135 });

/**
 * Một vân cho MỖI trạng thái ô trống — §6.4, góc lấy từ `NULL_STATE_HATCH_DEG` chứ không gõ
 * lại ở đây. Cùng xám (đều là vắng giá trị), khác góc (khác nguyên nhân): gộp chúng lại là
 * để ô sát trạm — nhóm được phục vụ tốt nhất thành phố — đeo cùng ký hiệu với ô hoang không
 * tới được, tức hai đầu đối lập của thang phục vụ dưới một vân.
 */
const STATE_HATCH: Record<NullState, HatchExtension> = {
  MISSING: new HatchExtension({ angle: NULL_STATE_HATCH_DEG.MISSING }),
  NOT_APPLICABLE: new HatchExtension({ angle: NULL_STATE_HATCH_DEG.NOT_APPLICABLE }),
  NOT_MEASURED: new HatchExtension({ angle: NULL_STATE_HATCH_DEG.NOT_MEASURED }),
  FILTERED: new HatchExtension({ angle: NULL_STATE_HATCH_DEG.FILTERED }),
};
const NULL_HATCH = STATE_HATCH.MISSING;

/**
 * Ô trống này thuộc trạng thái nào, đọc từ khai báo `nullSplit` của chính trường.
 *
 * Trường không khai `nullSplit` ⇒ MISSING: một ô trống không có luật nào phân giải là "không
 * biết", đúng §1.1 bước 4. Không đoán gì thêm ở tầng bản đồ.
 */
function splitStateOf(field: FieldMeta, c: { reachable?: boolean | null }): NullState {
  const sp = field.nullSplit;
  if (!sp) return "MISSING";
  return c.reachable === true ? sp.whenTrue.state : sp.whenFalse.state;
}

const rgba = (c: RGB, a: number) => [c[0], c[1], c[2], a] as [number, number, number, number];
const FAIL_VISIBLE_RGB: RGB = [255, 0, 255];

/**
 * Lớp SÔNG HỒNG của cảnh C — DESIGN.md §2a (lời hẹn từ M1.1) và §14b.
 *
 * Gắn/gỡ theo vòng đời cảnh, dùng chính vector source của basemap. Ba điều khiến nó không
 * phải là "sửa nền": `transformPositron` không đổi một dòng nào · nó không có trong tab
 * LAYER · nó không ship thêm hình học nào.
 *
 * **NÉT, không phải mảng màu.** §4d-1 cấm overlay dạng vùng phẳng một cách vô điều kiện;
 * một đường viền không đụng luật đó, và nó khớp nghĩa hơn — thứ cảnh C nói tới là một
 * RÀO CẢN, thứ phải đi vòng, không phải một vùng giá trị.
 */
const RIVER_LAYER_ID = "scene-river";
/** Source vector của positron. `addLayer` chỉ cần source này CÓ MẶT, không cần gì hơn. */
const BASEMAP_SOURCE = "openmaptiles";

function setRiverLayer(m: maplibregl.Map, on: boolean): void {
  // Điều kiện đúng là "source đã có trong style", KHÔNG phải `isStyleLoaded()` — xem effect
  // gọi hàm này để biết vì sao. Nếu source chưa có thì `addLayer` ném, nên phải chờ.
  if (on && !m.getSource(BASEMAP_SOURCE)) return;
  const has = Boolean(m.getLayer(RIVER_LAYER_ID));
  if (on === has) return;
  if (!on) {
    m.removeLayer(RIVER_LAYER_ID);
    return;
  }
  m.addLayer({
    id: RIVER_LAYER_ID,
    type: "line",
    source: "openmaptiles",
    "source-layer": "water",
    // Đã kiểm tile thật: z9 có 21 đa giác `class = river` quanh Hà Nội, nên lớp này vẽ được
    // ở đúng mức phóng mà cảnh C dùng (z9,3).
    filter: ["==", ["get", "class"], "river"],
    paint: {
      "line-color": COLD_HEX_LIGHT,
      "line-width": 2,
    },
  });
}

/** Lạnh NHẠT (§4d, blue-400) — nhạt nhất trong họ, vì đây là bối cảnh chứ không phải dữ liệu. */
const COLD_HEX_LIGHT = COLD_HEX[0];

/**
 * Lớp NHÀ CỬA 3D của basemap — §2a-3, bật ở chế độ `m=3d` (M3.5-P5).
 *
 * Vai BỐI CẢNH, không phải vai chính: khối mang dữ liệu là POI của ta (deck.gl), nhà cửa
 * `#e4e4de` chỉ để khối POI đứng được trong một đô thị có thật. Cùng cơ chế gắn/gỡ và
 * cùng cái bẫy `isStyleLoaded()` với lớp sông ở trên — điều kiện đúng là "source có mặt".
 */
const BUILDINGS_3D_LAYER_ID = "evcs-3d-buildings";
const THEME_CONTEXT_LAYER_IDS = ["evcs-theme-demand", "evcs-theme-accessibility", "evcs-theme-urban"] as const;

/** Context is part of a scene: it changes with the analytical question, not a checkbox. */
function setThemeContextLayer(m: maplibregl.Map, theme: AnalysisTheme): void {
  const wanted = theme === "demand" ? "evcs-theme-demand" : theme === "accessibility" ? "evcs-theme-accessibility" : theme === "urban-context" ? "evcs-theme-urban" : null;
  if (wanted && m.getLayer(wanted)) return;
  for (const id of THEME_CONTEXT_LAYER_IDS) if (m.getLayer(id)) m.removeLayer(id);
  if (!wanted) return;
  if (!m.getSource(BASEMAP_SOURCE)) return;

  if (theme === "demand") {
    m.addLayer({
      id: "evcs-theme-demand",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "landuse",
      filter: ["==", ["get", "class"], "residential"],
      paint: { "fill-color": "#e9c6b8", "fill-opacity": 0.3 },
    });
  }
  if (theme === "accessibility") {
    m.addLayer({
      id: "evcs-theme-accessibility",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "water",
      filter: ["==", ["get", "class"], "river"],
      paint: { "line-color": COLD_HEX[0], "line-width": 1.5, "line-opacity": 0.8 },
    });
  }
  if (theme === "urban-context") {
    m.addLayer({
      id: "evcs-theme-urban",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "park",
      paint: { "fill-color": "#b9d7be", "fill-opacity": 0.45 },
    });
  }
}

function setBuildings3dLayer(m: maplibregl.Map, on: boolean): void {
  if (on && !m.getSource(BASEMAP_SOURCE)) return;
  const has = Boolean(m.getLayer(BUILDINGS_3D_LAYER_ID));
  if (on === has) return;
  if (!on) {
    m.removeLayer(BUILDINGS_3D_LAYER_ID);
    return;
  }
  m.addLayer({
    id: BUILDINGS_3D_LAYER_ID,
    type: "fill-extrusion",
    source: BASEMAP_SOURCE,
    "source-layer": "building",
    // minzoom 12 — đúng minzoom của layer `building` phẳng trong positron (§2).
    minzoom: 12,
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      "fill-extrusion-color": "#e4e4de",
      // Tên thuộc tính TILE là `render_min_height` (§2a) nhưng tên thuộc tính PAINT của
      // spec là `fill-extrusion-base` — đừng "sửa" thành min-height, TS bắt được thật.
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.9,
    },
  });
}

export function MapView(props: Props) {
  const { field, cells, communes, boundary, stations, scale, surfaceBreaks, roads, routes, poi, occupancy } = props;
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Bản đồ dựng trong một `.then`, nên `map.current` còn null ở lần render đầu. Các effect
  // dưới đây phải chạy LẠI lúc nó có — một `ref` không kích hoạt render, nên cần một state.
  // Không có nó thì link mở thẳng vào cảnh C sẽ không có sông: effect chạy một lần, quá sớm.
  const [ready, setReady] = useState(false);
  const selected = useStore(selectionWireOf);
  const layersOn = useStore((s) => s.layers);
  const zoom = useStore((s) => s.view.zoom);
  const mode = useStore((s) => s.mode);
  const paintOn = useStore((s) => s.paintOn);
  const scene = useStore((s) => s.scene);
  const beatId = useStore((s) => s.beat);
  const sceneDef = scene ? SCENE_BY_ID.get(scene) : undefined;
  const beat = scene ? beatOf(scene, beatId) : undefined;
  // Ngưỡng phân vị phân giải trên CHÍNH dãy giá trị đang được vẽ — nhịp lọc luôn tô đúng
  // trường mà nó lọc, nên `cells` ở đây mang đúng cột cần thiết.
  const filter = useMemo(
    () => activeCellFilter(scene, beatId, cells.map((c) => (typeof c.value === "number" ? c.value : null))),
    [scene, beatId, cells],
  );
  const marks = beat?.marks;
  const wantRiver = sceneDef?.basemapLayer === "river";

  const basemapStyle = useStore((s) => s.basemapStyle);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;

    void loadStyle(basemapStyle).then((style) => {
      if (cancelled || !container.current) return;
      // Khung nhìn ban đầu đến từ STORE, không từ hằng số: store đã đọc khoá `v` của hash
      // lúc boot (§9), nên link mentor gửi mở ra đúng khung nhìn đó.
      const v = useStore.getState().view;
      const m = new maplibregl.Map({
        container: el,
        style,
        // Từ vựng MapLibre (`center`), KHÔNG phải `longitude`/`latitude` kiểu deck.gl —
        // MapLibre lặng lẽ bỏ qua khoá lạ và bản đồ về [0,0] mà không báo lỗi.
        center: [v.lng, v.lat],
        zoom: v.zoom,
        pitch: v.pitch,
        bearing: v.bearing,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.on("moveend", () => {
        const c = m.getCenter();
        useStore.getState().setView({
          lng: c.lng,
          lat: c.lat,
          zoom: m.getZoom(),
          pitch: m.getPitch(),
          bearing: m.getBearing(),
        });
      });
      const ov = new MapboxOverlay({
        interleaved: true,
        layers: [],
        /*
         * Bấm trúng KHOẢNG TRỐNG của bản đồ = bỏ chọn — đường thứ ba đóng thẻ bằng chứng
         * (§3h), cạnh `Esc` và nút `×`. Cả ba đi qua đúng `selectCell(null)`.
         *
         * Đặt ở `onClick` GỐC của deck chứ không phải một listener `pointerdown` trên
         * `document`, và đó là khác biệt duy nhất giữa "bấm ra ngoài" và "kéo bản đồ": deck
         * chỉ phát `onClick` khi con trỏ không đi quá ngưỡng kéo của nó, nên một lượt pan
         * không bỏ chọn. Listener trên `document` thì bắt cả cú nhấn mở đầu lượt pan ấy.
         *
         * `info.picked` là cổng: bấm trúng một mark thì `onClick` của chính lớp đó đã chọn
         * đối tượng mới, và bỏ chọn ngay sau đấy sẽ huỷ đúng cú bấm vừa xảy ra.
         */
        onClick: (info: { picked?: boolean; coordinate?: number[] }) => {
          const simStore = useSimulationStore.getState();
          if (simStore.placementMode && info.coordinate) {
            // Chế độ đặt trạm: cú bấm KẾ TIẾP đặt P (§3.1) — kể cả khi nó trúng một mark
            // pickable. onClick của lớp đã kịp chọn đối tượng trước khi handler này chạy,
            // nên phải bỏ chọn lại, nếu không luật một-tiêu-điểm xoá ngay P vừa đặt.
            useStore.getState().selectCell(null);
            simStore.setCandidate({ lat: info.coordinate[1]!, lng: info.coordinate[0]! });
            return;
          }
          if (!info.picked) useStore.getState().selectCell(null);
        },
      });
      overlay.current = ov;
      m.addControl(ov);
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      overlay.current = null;
      // Đánh dấu instance hết quyền sở hữu TRƯỚC khi remove. React dọn passive effects
      // theo thứ tự khai báo, nên các effect phụ phía dưới chạy cleanup sau effect này;
      // chúng phải thấy `null` và không gọi `getLayer()` trên một style đã bị remove.
      const doomed = map.current;
      map.current = null;
      doomed?.remove();
    };
  }, []);

  // Layout shell đổi hình học mà không remount map (320→340 ở 1440 px; rail trái→bottom
  // dưới 1024 px). Gọi `resize()` theo chính container, không theo `window.resize`: drawer,
  // devtools và thay đổi CSS đều có thể đổi phần tử mà không đổi viewport theo cùng nhịp.
  // MapLibre hiện cũng tự quan sát, nhưng contract này thuộc MapView và không phụ thuộc một
  // chi tiết triển khai của phiên bản thư viện.
  useEffect(() => {
    const el = container.current;
    const m = map.current;
    if (!el || !m || !ready || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let cancelled = false;
    void loadStyle(basemapStyle).then((style) => {
      if (!cancelled && map.current === m) m.setStyle(style);
    });
    return () => {
      cancelled = true;
    };
  }, [basemapStyle, ready]);

  // Hash đổi khung nhìn (sửa tay URL / Back — §9) thì camera phải đi theo. `moveend` ở trên
  // ghi ngược lại vào store, nên chỉ bay khi lệch đáng kể — nếu không hai chiều sẽ đá nhau.
  const view = useStore((s) => s.view);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    const same =
      Math.abs(c.lng - view.lng) < 1e-4 &&
      Math.abs(c.lat - view.lat) < 1e-4 &&
      Math.abs(m.getZoom() - view.zoom) < 0.01 &&
      // Pitch phải nằm trong phép so — thiếu nó thì toggle 2D|3D (chỉ đổi pitch, M3.5)
      // không làm camera nhúc nhích và nút trông như hỏng.
      Math.abs(m.getPitch() - view.pitch) < 0.5;
    if (same) return;
    const to = { center: [view.lng, view.lat] as [number, number], zoom: view.zoom, pitch: view.pitch, bearing: view.bearing };
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Trong một cảnh thì BAY (trừ khi có reduced-motion), ngoài cảnh thì NHẢY.
    if (scene && !prefersReducedMotion) m.flyTo({ ...to, duration: 1200, essential: true });
    else m.jumpTo(to);
  }, [view, scene, ready]);

  // Lớp riêng của cảnh trên basemap — §2a. Gắn/gỡ theo vòng đời cảnh, không đụng
  // `transformPositron`.
  //
  // **Bẫy đã sập một lần, và nó im lặng.** Bản đầu gác bằng `m.isStyleLoaded()`. Ghi lại
  // vết chạy thật: effect chạy với `wantRiver = true`, rồi `styledata` bắn BA lần và cả ba
  // lần `isStyleLoaded()` đều trả `false`; sau lần thứ ba nó không bắn nữa, còn style thì
  // ít lâu sau mới thành "loaded". Cửa sổ mà cả hai điều kiện cùng đúng KHÔNG BAO GIỜ tồn
  // tại, nên lớp sông không bao giờ được thêm — và vì `addLayer` không hề chạy nên console
  // sạch trơn. Triệu chứng trông y hệt "sông không có trong dữ liệu".
  //
  // `isStyleLoaded()` là điều kiện SAI ở đây: nó còn đòi mọi source nạp xong, chặt hơn hẳn
  // thứ `addLayer` thật sự cần. Điều kiện đúng là **source có mặt trong style**, và nó
  // đúng ngay khi style spec được phân tích — kiểm trong `setRiverLayer`.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => setRiverLayer(m, wantRiver);
    apply();
    // Vẫn nghe `styledata`: style nạp lại thì maplibre vứt hết layer do ta thêm, và lúc đó
    // phải gắn lại. Đây là đường phục hồi, không phải đường chính.
    m.on("styledata", apply);
    return () => {
      if (map.current !== m) return;
      m.off("styledata", apply);
    };
  }, [wantRiver, ready]);

  // Nhà cửa 3D của basemap — cùng vòng đời và cùng bẫy với lớp sông ở trên (M3.5-P5).
  const want3d = mode === "3d";
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => setBuildings3dLayer(m, want3d);
    apply();
    m.on("styledata", apply);
    return () => {
      if (map.current !== m) return;
      m.off("styledata", apply);
    };
  }, [want3d, ready]);

  // Scrubber là thứ ĐỔI NHANH — `t` đổi 4 lần mỗi giây khi play. Nó đi
  // thẳng vào `buildLayers` như mọi state khác: deck.gl dựng lại danh sách layer mỗi lần,
  // và với 939 chấm thì đó là việc rẻ. Không có đường tắt nào ở đây, và không nên có —
  // một đường vẽ riêng cho "lúc đang chạy" là hai đường vẽ cho cùng một bản đồ.
  const t = useStore((s) => s.t);
  const demandRepresentation = useStore((s) => s.demandRepresentation);
  const candidate = useSimulationStore((s) => s.candidate);
  const simulationResult = useSimulationStore((s) => s.result);
  const placementMode = useSimulationStore((s) => s.placementMode);
  const theme = themeFor(field, demandRepresentation);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    // Nhãn nâng lại ngay sau lớp bối cảnh của theme: đổi nền bản đồ (`setStyle`) dựng lại
    // toàn bộ stack, nên thứ tự lập ở lượt trước không sống sót.
    const apply = () => {
      setThemeContextLayer(m, theme);
      raiseLabels(m);
    };
    apply();
    m.on("styledata", apply);
    return () => {
      if (map.current !== m) return;
      m.off("styledata", apply);
      for (const id of THEME_CONTEXT_LAYER_IDS) if (m.getLayer(id)) m.removeLayer(id);
    };
  }, [theme, ready]);
  useEffect(() => {
    const ov = overlay.current;
    if (!ov) return;
    const built = buildLayers({
      ...props,
      selected,
      layersOn,
      zoom,
      mode,
      paintOn,
      filter,
      hasFilter: beatHasFilter(scene, beatId),
      marks,
      t,
      demandRepresentation,
      inStory: scene !== null,
      candidate,
      simulationResult,
    });
    ov.setProps({
      // Chế độ ĐẶT TRẠM (§3.1): tắt picking TOÀN stack. onClick của một lớp trả truthy
      // là deck nuốt luôn onClick cấp Deck — lớp ô phủ kín tỉnh nên cú bấm đặt trạm
      // không bao giờ tới lượt nếu còn lớp nào pickable.
      layers: placementMode ? built.map((l) => l.clone({ pickable: false })) : built,
      effects: mode === "3d" ? [PROVINCE_LIGHTING] : [],
      getCursor: placementMode
        ? () => "crosshair"
        : ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
      getTooltip: ({ object, layer }: { object?: unknown; layer?: { id: string } | null }) =>
        getMapTooltip({
          object,
          layerId: layer?.id,
          field,
          t,
          scale,
          stations,
          communes,
        }),
    });
    // Nhãn định vị phải nằm TRÊN mặt tô, nếu không giữ lại chúng cũng vô nghĩa: `interleaved`
    // chèn lớp deck vào cuối stack của maplibre, nên một choropleth mờ 100% sẽ nuốt sạch
    // tên nơi chốn bên dưới. Nâng lại sau MỖI lượt dựng lớp — lớp deck mới luôn được thêm
    // lên đỉnh, nên một lần nâng lúc khởi tạo sẽ hết tác dụng ở lượt đổi trường kế tiếp.
    raiseLabels(map.current);
  }, [props, field, cells, communes, boundary, stations, scale, surfaceBreaks, roads, routes, poi, occupancy, selected, layersOn, zoom, mode, paintOn, filter, marks, t, demandRepresentation, scene, ready, candidate, simulationResult, placementMode]);

  // `h-full w-full`, KHÔNG `absolute inset-0`: maplibre-gl.css đặt
  // `.maplibregl-map { position: relative }` và được import SAU tailwind, nên cùng độ ưu
  // tiên thì nó thắng — container sẽ tụt về chiều cao 0 và bản đồ không bao giờ vẽ.
  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {scene && sceneDef && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 hidden sm:flex flex-col gap-0.5 rounded-md border border-hairline bg-panel/90 px-3 py-1.5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-note font-semibold tracking-wider text-cold-3">{sceneDef.kicker}</span>
            <span className="text-note text-ink-muted">·</span>
            <span className="text-body font-semibold text-ink">{sceneDef.title}</span>
          </div>
          {beat && sceneDef.beats.length > 1 && (
            <span className="text-note text-ink-muted">Nhịp: {beat.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Đưa mọi nhãn nền lên đỉnh stack, giữ nguyên thứ tự tương đối giữa chúng.
 *
 * Im lặng khi style chưa nạp xong hoặc layer không còn: hàm này chạy sau MỖI lượt dựng lớp,
 * kể cả lượt xảy ra giữa hai lần `setStyle` — ném ở đây sẽ giết cả lượt vẽ vì một việc
 * thuần trang trí.
 */
function raiseLabels(m: maplibregl.Map | null): void {
  if (!m || !m.isStyleLoaded()) return;
  for (const id of labelLayerIds(m.getStyle())) {
    if (m.getLayer(id)) m.moveLayer(id);
  }
}

/**
 * Hai lượt vẽ của ký hiệu ĐANG CHỌN, dưới lên trên: casing sáng rồi lõi mực.
 *
 * Một hằng dùng chung cho cả năm hình học (ô, xã, trạm, đường, POI) chứ không phải năm cặp
 * số chép lại — "đang chọn" là MỘT khái niệm, nên nó phải có đúng một ký hiệu, và cách duy
 * nhất để điều đó còn đúng sau lần sửa thứ ba là chỉ có một chỗ để sửa.
 */
const SELECT_PASSES = [
  // Casing KHÔNG đục: 190/255 để nó đọc như một quầng sáng quanh nét mực chứ không như một
  // nét trắng thứ hai cạnh tranh với nó.
  ["casing", rgba(SELECT_CASING_RGB, 190), SELECT_CASING_W],
  ["core", rgba(SELECT_RGB, 255), SELECT_CORE_W],
] as const satisfies readonly (readonly [string, [number, number, number, number], number])[];

interface BuildInput extends Props {
  selected: string | null;
  layersOn: Set<OverlayId>;
  zoom: number;
  mode: Mode;
  /** mặt tô có đang vẽ không — nút thứ ba cạnh Ô H3 | XÃ, thêm sau M3.5 */
  paintOn: boolean;
  /** bộ lọc ô của nhịp đang mở, nếu có — §13b-2 */
  filter?: CellFilter;
  /**
   * Nhịp này CÓ thu hẹp tập ô không — câu hỏi tách khỏi `filter`.
   *
   * `filter` vắng có hai nghĩa ("nhịp không lọc" và "ngưỡng chưa phân giải xong"), và
   * render plan cần đúng nghĩa thứ nhất. Suy từ `Boolean(filter)` sẽ làm chú giải và bản
   * đồ nói khác nhau trong đúng khoảnh khắc dữ liệu đang về.
   */
  hasFilter?: boolean;
  /** lớp riêng của nhịp — cầu, cặp tuyến minh hoạ (§11 M3-R) */
  marks?: readonly SceneMark[];
  /** vị trí scrubber 0–167 — §3e */
  t: number;
  demandRepresentation: DemandRepresentation;
  /** đang ở trong một cảnh CÂU CHUYỆN — xem `PlanInput.inStory` */
  inStory: boolean;
  candidate?: CandidatePoint | null;
  simulationResult?: SimulationResult | null;
}

/**
 * Danh sách layer cho một trạng thái. Thứ tự trong mảng là thứ tự vẽ, dưới lên trên:
 * mặt tô (đúng một) → overlay vùng → overlay đường → overlay điểm → viền ô đang chọn.
 *
 * Đó không phải thứ tự tuỳ tiện: vùng che được điểm, nên vùng phải nằm dưới. Cùng lý do
 * với §4d cho overlay điểm giữ opacity đầy đủ.
 */
export function buildLayers({
  field,
  cells,
  communes,
  boundary,
  stations,
  scale,
  surfaceBreaks,
  roads,
  routes,
  poi,
  occupancy,
  selected,
  layersOn,
  zoom,
  mode,
  paintOn,
  filter,
  hasFilter,
  marks,
  t,
  demandRepresentation,
  inStory,
  analyticalCells: analyticalCellRows,
  analyticalStations: analyticalStationRows,
  candidate,
  simulationResult,
}: BuildInput): Layer[] {
  // `inStory` KHÔNG suy từ `marks`: cảnh A không có mark riêng nào, nên `marks` rỗng ở
  // đúng cảnh duy nhất mà cờ này quan trọng.
  const plan = planFor({
    readAs: field.readAs,
    hasSurface: Boolean(field.surface),
    zoom,
    filtered: hasFilter ?? false,
    inStory,
  });
  const out: Layer[] = [];
  const demandP1 = !inStory && hasDemandRepresentations(field);
  const demandSurface = demandP1 && (demandRepresentation === "density" || demandRepresentation === "hybrid");

  const activeTheme = themeFor(field, demandRepresentation);

  // Tập phân tích đã DẪN XUẤT SẴN ở tầng App (§5.2, §5.4). MapView chỉ vẽ thứ nó nhận:
  // không có phép thử filter nào chạy trong file này, nên không có bản sao predicate nào
  // để lệch khỏi biểu đồ, readout và Inspector — cả bốn dùng chung `filterKeepsCell` /
  // `filterKeepsStation` của `state/filter.ts`.
  //
  // Nhánh `??` chỉ đỡ cho lời gọi trong test dựng `BuildInput` tối thiểu; đường chạy thật
  // luôn truyền mảng đã lọc. Mặc định của trạm là IN-only vì đó là tập phân tích của §1.3,
  // đúng kể cả khi không có filter nào.
  const analyticalCells = analyticalCellRows ?? cells;
  const analyticalStations = analyticalStationRows ?? stations.filter((st) => st.inScope);
  // Demand representations aggregate population. A missing population is neither a zero
  // weight nor the first bivariate tertile, so it is excluded from those derived marks.
  const populationCells = analyticalCells.filter((cell) => cell.pop !== null);

  // ── mặt tô — ĐÚNG MỘT, ràng buộc 2 (§6b) ───────────────────────────────────
  // Nút thứ ba cạnh Ô H3 | XÃ (thêm sau M3.5) tắt cả khối này mà KHÔNG đụng `field` —
  // trường đang chọn vẫn là chính nó, chỉ phần TÔ của nó không vẽ. Ràng buộc 2 nói "đúng
  // một trường được tô", không nói "luôn phải có một trường được tô".
  if (paintOn) {
    if (demandP1 && demandRepresentation !== "hex") {
      if (demandRepresentation === "density") out.push(surfaceLayer(populationCells, surfaceBreaks));
      if (demandRepresentation === "intensity") out.push(demandIntensityLayer(populationCells));
      if (demandRepresentation === "bivariate") out.push(demandSupplyLayer(populationCells));
      if (demandRepresentation === "hybrid") out.push(surfaceLayer(populationCells, surfaceBreaks), ...capacityStationLayers(analyticalStations));
    } else {
      if (scale && plan.paint === "hex") out.push(...hexLayers(analyticalCells, scale, field, filter, mode === "3d", activeTheme));
      if (scale && plan.paint === "commune" && communes) out.push(...communeLayers(communes, field, scale, activeTheme));
      if (scale && plan.paint === "road") out.push(...roadLayers(roads, scale, field, zoom, activeTheme));
      if (scale && plan.paint === "station" && field.id === STATION_PORTS_FIELD)
        out.push(...stationPortsLayers(analyticalStations, scale, field, zoom, activeTheme));
      else if (scale && plan.paint === "station" && occupancy)
        out.push(...stationFieldLayers(occupancy, scale, field, zoom, t, activeTheme));
      if (plan.paint === "surface") out.push(surfaceLayer(analyticalCells, surfaceBreaks));
    }
  }

  // ── BỐI CẢNH — luôn có mặt khi mặt tô không nói được vị trí ────────────────
  //
  // Ba trường hợp, cùng một lý do: người xem phải biết mình đang nhìn ở ĐÂU.
  //   · `!paintOn` — mặt tô bị tắt CÓ CHỦ Ý; không hình học nào khác (hex/xã/đường) vẽ,
  //     nên không gì khác nói lên hình dáng thành phố.
  //   · `paint === "none"` — bản đồ trắng trơn đọc thành "không có dữ liệu ở đây". Nguyên
  //     tắc "không vẽ thứ đọc sai" vẫn đúng, nhưng nó không cho phép vứt luôn bối cảnh.
  //   · `paint === "surface"` — dải đồng mức phủ kín ở opacity 0,85 và nuốt mất hình dáng
  //     thành phố lẫn sông Hồng.
  //   · `paint === "station"` (M4) — 939 chấm rời không lát kín cái gì, nên chúng không
  //     nói được hình dáng thành phố. Không có ranh giới thì cụm chấm nội đô trôi trên một
  //     nền trắng và mentor không biết phần Hà Nội còn lại nằm ở đâu.
  //
  // Đây KHÔNG phải overlay: nó không có trong tab LAYER, không bật/tắt được, không mang
  // dữ liệu nào. Nó chỉ trả lời "ở đâu", nên nó không đụng ràng buộc 2.
  if (boundary && (!paintOn || demandSurface || demandRepresentation === "intensity" || plan.paint === "none" || plan.paint === "surface" || plan.paint === "station")) {
    out.push(
      new GeoJsonLayer({
        id: "context-boundary",
        data: {
          type: "FeatureCollection",
          features: boundary.features.filter((f) => f.properties["kind"] === "boundary"),
        },
        filled: false,
        stroked: true,
        pickable: false,
        // Mực phụ của chrome (§4e), không phải họ lạnh: đường này là KHUNG, không phải một
        // overlay mang thông tin, nên nó không được lấy màu của họ overlay.
        getLineColor: [82, 81, 78, 200],
        lineWidthUnits: "pixels",
        getLineWidth: 1.5,
      }),
    );
  }

  // ── Tên hai quần đảo và các đặc khu hải đảo. Vẽ SAU khung ranh giới và TRƯỚC mọi
  //    overlay: nó là chrome của bản đồ, nhưng nó phải nằm dưới các mark dữ liệu để không
  //    che mất thứ người xem đang đo.
  if (communes) {
    const dk = dacKhuLayer(communes, zoom);
    if (dk) out.push(dk);
  }

  // ── mark riêng của NHỊP — §11 M3-R. Không phải overlay: không có trong tab LAYER,
  //    không bật/tắt được, và chúng chỉ tồn tại trong đúng một nhịp của đúng một cảnh.
  if (marks?.includes("bridges")) out.push(bridgeLayer(roads, zoom));
  if (marks?.includes("routes")) out.push(...routeLayers(routes));

  // ── overlay — không cái nào là mảng màu phẳng (§4d-1) ──────────────────────
  if (layersOn.has("beyond2km")) out.push(beyond2kmLayer(cells));
  if (layersOn.has("communes") && communes) out.push(communeOutline(communes));
  // §6b: khi `f=station:occ`, overlay `stations` **tự thay bằng lớp trường** — không bao
  // giờ vẽ chấm hai lần (một lạnh, một ramp) cho cùng một trạm. Người xem sẽ không có cách
  // nào biết chấm nào là dữ liệu, đúng thứ ràng buộc 2 dựng ra để tránh.
  const stationDotsOn = (paintOn && plan.paint === "station") || layersOn.has("stations");
  if (layersOn.has("stations") && plan.paint !== "station" && !(demandP1 && demandRepresentation === "hybrid")) out.push(...stationLayers(stations, zoom));
  // Vòng NÉT ĐỨT — M4.1, §4d-3a. Vẽ ngay sau chấm trạm vì nó là **chú thích trên chấm đó**,
  // không phải một lớp độc lập vô tình nằm cùng chỗ: không có chấm thì nó không có gì để
  // chú thích, nên nó tắt theo. Bán kính chấm phải khớp lớp bên dưới — hai công thức khác
  // nhau ở đây (overlay 4,5 px ↔ trường 6 px) sẽ làm vòng lệch khỏi chấm ở nội đô.
  if (layersOn.has("station_status") && stationDotsOn) {
    out.push(
      stationStatusLayer(
        stations,
        plan.paint === "station" ? stationFieldRadius(zoom) : stationOverlayRadius(zoom),
      ),
    );
  }
  // POI 4 nhóm — M3.5, §4d-4. Sau trạm để icon POI không bị chấm trạm đè.
  if (poi) out.push(...poiLayers(poi, layersOn, zoom, mode === "3d", selected));
  // Viền ĐỐI TƯỢNG đang chọn. Màu HỌ LẠNH (§4d overlay đậm), KHÔNG phải một bậc của ramp:
  // "đang chọn" là trạng thái UI, không phải một giá trị của trường — tô nó bằng màu ramp
  // là bịa thêm một bậc không có thật. Một khuôn cho cả ô lẫn xã (M2.1-A).
  const selectedCommune = communeCodeOf(selected);
  if (selectedCommune && communes) {
    const data = {
      type: "FeatureCollection" as const,
      features: communes.features.filter(
        (f) => f.properties["commune_code"] === selectedCommune,
      ),
    };
    // Casing rồi lõi — HAI lớp, không một lớp. Xem `SELECT_HEX`: đây là cặp duy nhất đọc
    // được trên cả bậc sáng nhất lẫn bậc sẫm nhất của bảy ramp.
    for (const [suffix, color, width] of SELECT_PASSES) {
      out.push(
        new GeoJsonLayer({
          id: `commune-selected-${suffix}`,
          data,
          filled: false,
          stroked: true,
          pickable: false,
          getLineColor: color,
          lineWidthUnits: "pixels",
          getLineWidth: width,
          updateTriggers: { getLineColor: selectedCommune },
        }),
      );
    }
  }
  // Trạm đang chọn — M4.1. Cùng khuôn, cùng màu, cùng bề rộng nét với ô và xã: "đang chọn"
  // là một khái niệm, nên nó có đúng một ký hiệu bất kể hình học bên dưới là gì.
  const selectedStation = stationIdOf(selected);
  if (selectedStation) {
    const st = stations.find((s) => s.id === selectedStation);
    if (st) {
      const r = plan.paint === "station" ? stationFieldRadius(zoom) : stationOverlayRadius(zoom);
      // Rộng hơn cả vòng nét đứt: hai vòng chồng đúng nhau thì không đọc được cái nào.
      const rr = statusRingRadius(r) + 2.5;
      for (const [suffix, color, width] of SELECT_PASSES) {
        out.push(
          new ScatterplotLayer<StationPoint>({
            id: `station-selected-${suffix}`,
            data: [st],
            getPosition: (d) => [d.lng, d.lat],
            radiusUnits: "pixels",
            getRadius: rr,
            radiusMinPixels: rr,
            radiusMaxPixels: rr,
            filled: false,
            stroked: true,
            pickable: false,
            getLineColor: color,
            lineWidthUnits: "pixels",
            getLineWidth: width,
            updateTriggers: { getRadius: r, getPosition: selectedStation },
          }),
        );
      }
    }
  }

  const selectedCell = cellIdOf(selected);
  if (selectedCell) {
    for (const [suffix, color, width] of SELECT_PASSES) {
      out.push(
        new H3HexagonLayer<{ h3: string }>({
          id: `grid-selected-${suffix}`,
          data: [{ h3: selectedCell }],
          getHexagon: (d) => d.h3,
          // Chế độ `auto` dựng ô bằng một lục giác ĐỀU dùng chung, lấy từ ô ở tâm khung nhìn.
          // Viền chọn phải trùng đúng ô bên dưới nên ép high precision. Một ô thì không tốn gì.
          highPrecision: true,
          extruded: false,
          filled: false,
          stroked: true,
          pickable: false,
          getLineColor: color,
          lineWidthUnits: "pixels",
          getLineWidth: width,
          updateTriggers: { getHexagon: selectedCell },
        }),
      );
    }
  }

  // Đoạn đường đang chọn — chỗ HỔNG của quy tắc "một ký hiệu cho mọi hình học". `c=road:…`
  // round-trip qua hash và mở đúng panel (xem `road-selection.test.ts`), nhưng trên bản đồ
  // nó không được đánh dấu gì cả: người xem theo một deep-link tới một đoạn đường thấy
  // inspector nói về một đoạn mà họ không tìm được trong 427 nghìn điểm của mạng đường.
  const selectedRoad = roadIdOf(selected);
  if (selectedRoad) {
    const seg = roads.find((r) => r.id === selectedRoad);
    if (seg) {
      for (const [suffix, color, width] of SELECT_PASSES) {
        out.push(
          new PathLayer<RoadSeg>({
            id: `road-selected-${suffix}`,
            data: [seg],
            getPath: (d) => d.path,
            // `path` là mảng PHẲNG `[lng, lat, lng, lat, …]` (§5b) — thiếu dòng này thì
            // deck đọc mỗi số thành một điểm và đoạn đường vẽ ra ở giữa Thái Bình Dương.
            positionFormat: "XY",
            widthUnits: "pixels",
            getWidth: width,
            widthMinPixels: width,
            getColor: color,
            capRounded: true,
            jointRounded: true,
            pickable: false,
            updateTriggers: { getColor: selectedRoad },
          }),
        );
      }
    }
  }

  // ── Lớp mô phỏng TRANSIENT (Phase 6 §3.1) — cuối stack, trên mọi lớp đo đạc ─────
  //
  // KHÔNG hue mới: kênh hue đã đầy (M3.5), nên cả ba lớp dùng đúng idiom SELECT_PASSES
  // (casing trắng + lõi mực). Phân biệt IMPROVES/UNCERTAIN bằng NÉT (liền/đứt), không
  // bằng màu — cùng kênh với op_status ở §4d-3a. Số liệu sống trong panel, không trên
  // bản đồ.
  if (candidate) {
    const DASH = new PathStyleExtension({ dash: true });
    const dashed: [number, number] = [6, 4];

    // Vòng 5 km — nét ĐỨT: đây là một bán kính hiệu lực, không phải một ranh giới đo được.
    const circlePath = generateCirclePath(candidate.lat, candidate.lng, 5000);
    for (const [suffix, color, width] of SELECT_PASSES) {
      out.push(
        new PathLayer({
          id: `sim-zone-5km-${suffix}`,
          data: [{ path: circlePath }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: color,
          widthUnits: "pixels",
          getWidth: width,
          widthMinPixels: width,
          capRounded: true,
          jointRounded: true,
          pickable: false,
          extensions: [DASH],
          getDashArray: dashed,
          dashJustified: true,
        }),
      );
    }

    // Viền ô IMPROVES (liền) / UNCERTAIN (đứt) — đường bao H3 qua PathLayer vì
    // H3HexagonLayer không vẽ được nét đứt.
    if (simulationResult?.cells) {
      const boundaryOf = (h3: string): [number, number][] =>
        cellToBoundary(h3, true) as [number, number][];
      const improves = simulationResult.cells
        .filter((c) => c.cls === "IMPROVES")
        .map((c) => ({ path: boundaryOf(c.h3) }));
      const uncertain = simulationResult.cells
        .filter((c) => c.cls === "UNCERTAIN")
        .map((c) => ({ path: boundaryOf(c.h3) }));

      for (const [suffix, color, width] of SELECT_PASSES) {
        if (improves.length > 0) {
          out.push(
            new PathLayer({
              id: `sim-cells-improves-${suffix}`,
              data: improves,
              getPath: (d: { path: [number, number][] }) => d.path,
              getColor: color,
              widthUnits: "pixels",
              getWidth: width,
              widthMinPixels: width,
              jointRounded: true,
              pickable: false,
            }),
          );
        }
        if (uncertain.length > 0) {
          out.push(
            new PathLayer({
              id: `sim-cells-uncertain-${suffix}`,
              data: uncertain,
              getPath: (d: { path: [number, number][] }) => d.path,
              getColor: color,
              widthUnits: "pixels",
              getWidth: width,
              widthMinPixels: width,
              jointRounded: true,
              pickable: false,
              extensions: [DASH],
              getDashArray: dashed,
              dashJustified: true,
            }),
          );
        }
      }
    }

    // Chấm P — cùng cặp màu casing/lõi, to hơn nét chọn một bậc để đọc là "điểm đang
    // mô phỏng" chứ không phải một trạm thật (trạm thật có icon riêng).
    out.push(
      new ScatterplotLayer({
        id: "sim-candidate-casing",
        data: [candidate],
        getPosition: (d: CandidatePoint) => [d.lng, d.lat],
        getRadius: 8,
        radiusUnits: "pixels",
        radiusMinPixels: 7,
        stroked: false,
        filled: true,
        getFillColor: rgba(SELECT_CASING_RGB, 235),
        pickable: false,
      }),
      new ScatterplotLayer({
        id: "sim-candidate-core",
        data: [candidate],
        getPosition: (d: CandidatePoint) => [d.lng, d.lat],
        getRadius: 4.5,
        radiusUnits: "pixels",
        radiusMinPixels: 4,
        stroked: false,
        filled: true,
        getFillColor: rgba(SELECT_RGB, 255),
        pickable: false,
      }),
    );
  }

  assertUniqueLayerIds(out);
  return out;
}

/** Fail fast: deck.gl thay layer trùng id thay vì báo stack bị nhân đôi. */
export function assertUniqueLayerIds(layers: Layer[]): void {
  const seen = new Set<string>();
  for (const layer of layers) {
    if (seen.has(layer.id)) throw new Error(`Duplicate map layer id: ${layer.id}`);
    seen.add(layer.id);
  }
}

// ── Mặt tô: ô H3 ───────────────────────────────────────────────────────────────

function hexLayers(
  cells: GridCell[],
  scale: Scale,
  field: FieldMeta,
  filter?: CellFilter,
  is3d: boolean = false,
  theme?: AnalysisTheme,
): Layer[] {
  // Cảnh thu hẹp tập ô (§13b-2) thì ô KHÔNG thoả điều kiện không vẽ gì cả — kể cả vân null.
  // Chúng không phải "không biết"; chúng là "biết, và không thoả". Vẽ vân cho chúng là
  // dùng ký hiệu của §4b để nói một điều §4b không nói — §7a ở dạng hình học.
  if (filter) {
    const kept = cells.filter((c) => filter.keep(c.value));
    const valued = kept.filter((c) => c.value !== null && c.value !== undefined);
    // Nhánh nào là "câu hỏi không áp dụng" do TRẠNG THÁI của `nullSplit` quyết định, không
    // do `reachable === true` gõ cứng ở đây — §0.2 và §6.4 mới là nơi định nghĩa nó.
    const blank = (c: GridCell) => c.value === null || c.value === undefined;
    const byState = (st: NullState) =>
      kept.filter((c) => blank(c) && splitStateOf(field, c) === st);
    const notApplicable = byState("NOT_APPLICABLE");
    const filtered = byState("FILTERED");
    const missing = kept.filter(
      (c) => blank(c) && !["NOT_APPLICABLE", "FILTERED"].includes(splitStateOf(field, c)),
    );
    const common = {
      getHexagon: (d: GridCell) => d.h3,
      extruded: is3d,
      getElevation: (d: GridCell) => elevationFor(d.value, scale, MAX_ELEV_R8_M),
      elevationScale: is3d ? 1 : 0,
      material: EXTRUSION_MATERIAL,
      stroked: false,
      filled: true,
      pickable: true,
      onClick: (info: { object?: GridCell }) => {
        if (info.object) useStore.getState().selectCell(info.object.h3);
        return true;
      },
    } as const;
    return [
      new H3HexagonLayer<GridCell>({
        ...common,
        id: "grid-filtered-value",
        data: valued,
        getFillColor: (d) => {
          const color = colorFor(d.value, scale, theme);
          return rgba(color ?? FAIL_VISIBLE_RGB, is3d ? 255 : 217);
        },
        updateTriggers: { getFillColor: [scale, theme, is3d], getElevation: [scale] },
      }),
      new H3HexagonLayer<GridCell>({
        ...common,
        id: "grid-filtered-null",
        data: missing,
        getFillColor: () => rgba(HATCH_RGB, 255),
        extensions: [NULL_HATCH],
      }),
      new H3HexagonLayer<GridCell>({
        ...common,
        id: "grid-filtered-na",
        data: notApplicable,
        getFillColor: () => rgba(HATCH_RGB, 255),
        extensions: [STATE_HATCH.NOT_APPLICABLE],
      }),
      new H3HexagonLayer<GridCell>({
        ...common,
        id: "grid-filtered-removed",
        data: filtered,
        getFillColor: () => rgba(HATCH_RGB, 255),
        extensions: [STATE_HATCH.FILTERED],
      }),
    ];
  }

  // Tách hai lớp: ô CÓ giá trị (ramp) và ô NULL (gạch chéo). Không có nhánh nào biến null
  // thành 0 — ràng buộc 1, DESIGN.md §10.
  const valued: GridCell[] = [];
  const missing: GridCell[] = [];
  // Ô null vì CÂU HỎI KHÔNG ÁP DỤNG — tách hẳn khỏi ô null vì KHÔNG BIẾT (§7a mở rộng).
  // Gộp chúng lại là để 86 ô sát trạm đeo cùng ký hiệu với 50 ô hoang không tới được:
  // hai đầu đối lập của thang phục vụ, một vân.
  const notApplicable: GridCell[] = [];
  /** Ô trống vì LUẬT CỦA TA gỡ giá trị đi — vân riêng, và nó Ở LẠI mẫu số (§0.2). */
  const filtered: GridCell[] = [];
  for (const c of cells) {
    if (c.value !== null && c.value !== undefined) valued.push(c);
    else {
      const st = splitStateOf(field, c);
      if (st === "NOT_APPLICABLE") notApplicable.push(c);
      else if (st === "FILTERED") filtered.push(c);
      else missing.push(c);
    }
  }

  const common = {
    getHexagon: (d: GridCell) => d.h3,
    extruded: is3d,
    getElevation: (d: GridCell) => elevationFor(d.value, scale, MAX_ELEV_R8_M),
    elevationScale: is3d ? 1 : 0,
    material: EXTRUSION_MATERIAL,
    stroked: false,
    filled: true,
    pickable: true,
    onClick: (info: { object?: GridCell }) => {
      if (info.object) useStore.getState().selectCell(info.object.h3);
      return true;
    },
  } as const;

  return [
    new H3HexagonLayer<GridCell>({
      ...common,
      id: "grid-value",
      data: valued,
      getFillColor: (d) => {
        const color = colorFor(d.value, scale, theme);
        return rgba(color ?? FAIL_VISIBLE_RGB, is3d ? 255 : 217);
      },
      updateTriggers: { getFillColor: [scale, theme, is3d], getElevation: [scale] },
    }),
    // Ô null giữ VÂN của nó: chất liệu nói "không đo được". Một ô bị SUBSET loại không tới
    // được đây — nó đã bị loại khỏi `data` ở tầng App (§2.1), không tô xám ở tầng vẽ.
    new H3HexagonLayer<GridCell>({
      ...common,
      id: "grid-null",
      data: missing,
      getFillColor: () => rgba(HATCH_RGB, 255),
      extensions: [NULL_HATCH],
    }),
    new H3HexagonLayer<GridCell>({
      ...common,
      id: "grid-na",
      data: notApplicable,
      getFillColor: () => rgba(HATCH_RGB, 255),
      extensions: [STATE_HATCH.NOT_APPLICABLE],
    }),
    new H3HexagonLayer<GridCell>({
      ...common,
      id: "grid-removed",
      data: filtered,
      getFillColor: () => rgba(HATCH_RGB, 255),
      extensions: [STATE_HATCH.FILTERED],
    }),
  ];
}

// ── Mặt tô: 126 đa giác xã (§6b, §13d-B) ───────────────────────────────────────

function communeLayers(
  fc: CommuneCollection,
  field: FieldMeta,
  scale: Scale,
  theme?: AnalysisTheme,
): Layer[] {
  const valueOf = (f: { properties: Record<string, unknown> }) =>
    f.properties[field.column] as number | string | boolean | null;

  return [
    new GeoJsonLayer({
      id: "commune-value",
      data: fc,
      filled: true,
      stroked: true,
      // Bấm được — §13d-B đòi xã phải "chỉ tay vào được". Trước M2.1 lớp này `pickable:
      // false`, nên cách duy nhất biết tên một xã là phóng tới z11 rồi bấm một ô H3, tức
      // đi qua đúng đơn vị mà lớp xã dựng ra để thoát khỏi.
      pickable: true,
      onClick: (info: { object?: { properties?: Record<string, unknown> } }) => {
        const code = info.object?.properties?.["commune_code"];
        if (typeof code === "string") {
          useStore.getState().selectCell(serializeSelection({ kind: "commune", code }));
        }
        return true;
      },
      // Nét ngăn xã với xã là hairline của chính bảng màu chrome (§4e), không phải một bậc
      // ramp: đường biên là cấu trúc, không phải giá trị.
      //
      // ĐỤC hẳn (alpha 255, 1 px) là cái sai cũ: 126 đa giác viền trắng đặc biến bản đồ
      // thành một trang tô màu — nét khoẻ ngang với mảng màu, và mắt đọc LƯỚI trước khi đọc
      // GIÁ TRỊ. Ranh giới ở đây chỉ cần tách hai mảng cùng bậc ra khỏi nhau, nên nó là thứ
      // mờ nhất còn làm được việc đó: trắng ~35%, mỏng hơn một pixel.
      getLineColor: [255, 255, 255, 90],
      lineWidthUnits: "pixels",
      getLineWidth: 0.75,
      lineWidthMinPixels: 0.5,
      getFillColor: (f: unknown) => {
        const v = valueOf(f as { properties: Record<string, unknown> });
        const color = colorFor(v, scale, theme);
        // Xã không có giá trị: KHÔNG tô nhạt. Nó được lớp gạch chéo bên dưới lo (ràng buộc 1).
        if (color === null) return [0, 0, 0, 0];
        return rgba(color, 217);
      },
      updateTriggers: { getFillColor: [scale, field.id, theme] },
    }),
    // Xã null — cùng vân 45° xám như ô null. Một chất liệu cho một khái niệm, bất kể hình học.
    new GeoJsonLayer({
      id: "commune-null",
      data: {
        type: "FeatureCollection",
        features: fc.features.filter((f) => {
          const v = f.properties[field.column];
          return v === null || v === undefined;
        }),
      },
      filled: true,
      stroked: false,
      pickable: false,
      // Cùng luật với ô null của lưới: vân giữ nguyên, không có trạng thái "bị loại".
      getFillColor: () => rgba(HATCH_RGB, 255),
      extensions: [NULL_HATCH],
      updateTriggers: { getFillColor: [field.id] },
    }),
  ];
}

// ── Mặt tô: MẠNG ĐƯỜNG — đơn vị đọc thứ ba (§6b, M3.1) ─────────────────────────

/**
 * Bề rộng nét đường theo mức phóng. Cùng luật với bán kính chấm trạm (§4d-1): co theo
 * **mức phóng** thì được, co theo **giá trị** thì cấm — mọi đoạn co cùng nhau nên không
 * đoạn nào nói gì khác đoạn nào.
 *
 * Ở z9,3 toàn thành phố có 160 nghìn đoạn: nét 1 px là mật độ đọc được. Phóng sâu thì nét
 * dày lên để một con phố còn là một con phố.
 */
function roadWidth(zoom: number): number {
  return zoom <= 10 ? 1 : zoom >= 14 ? 3.5 : 1 + ((zoom - 10) / 4) * 2.5;
}

/**
 * Mạng đường tô theo khoảng cách tới trạm — **mark chủ lực của cảnh C** (§11, 2026-08-07).
 *
 * Vì sao nó thay thảm hex: hex nói *ở đâu* sai, mạng đường cho thấy *vì sao* sai. Khoảng
 * cách chảy dọc phố, khựng lại ở sông Hồng, và dồn qua vài cây cầu — cái đó là một cơ chế
 * nhìn thấy được, còn một thảm ô cháy màu thì chỉ là một kết quả.
 *
 * HAI lớp, và sự tách đôi này chính là ràng buộc 1 áp cho hình học đường:
 * 396/160.823 đoạn không tới được mang `dist = null`. Chúng KHÔNG được rơi vào bậc ramp
 * nào — "không tới được" mà tô bậc nhạt thì đọc thành "sát trạm", tức đảo ngược đúng cái
 * nó nói. Một đường 1px không mang được vân 45° của §4b, nên chất liệu chuyển thành
 * **mực của vân đó** (`#898781`): khác kênh, cùng khái niệm.
 */
function roadLayers(
  roads: RoadSeg[],
  scale: Scale,
  field: FieldMeta,
  zoom: number,
  theme?: AnalysisTheme,
): Layer[] {
  const valued: RoadSeg[] = [];
  const missing: RoadSeg[] = [];
  for (const r of roads) (r.dist === null ? missing : valued).push(r);

  const w = roadWidth(zoom);
  const common = {
    getPath: (d: RoadSeg) => d.path,
    positionFormat: "XY" as const,
    widthUnits: "pixels" as const,
    capRounded: true,
    jointRounded: true,
    // Overview không đủ độ phân giải để biết đang chọn đường nào; tắt pick buffer cho tới
    // khi một đường còn là object đọc được, vừa tránh click nhầm vừa giảm chi phí GPU.
    pickable: zoom >= 11,
    onClick: (info: { object?: RoadSeg }) => {
      if (zoom >= 11 && info.object) useStore.getState().selectCell(serializeSelection({ kind: "road", id: info.object.id }));
    },
  };

  return [
    new PathLayer<RoadSeg>({
      ...common,
      id: "road-null",
      data: missing,
      getColor: () => rgba(HATCH_RGB, 255),
      getWidth: w,
    }),
    new PathLayer<RoadSeg>({
      ...common,
      id: "road-value",
      data: valued,
      getColor: (d) => {
        const color = colorFor(d.dist, scale, theme);
        return rgba(color ?? FAIL_VISIBLE_RGB, 235);
      },
      getWidth: w,
      updateTriggers: { getColor: [scale, field.id, theme] },
    }),
  ];
}

// ── Mặt tô: 939 CHẤM TRẠM — đơn vị đọc thứ tư (§6b, M4) ───────────────────────

/**
 * Bán kính chấm khi trạm là TRƯỜNG (§6b). To hơn overlay một bậc vì ở đây chấm là DỮ LIỆU,
 * và thứ phải đọc được là bậc màu chứ không chỉ vị trí.
 *
 * Tách thành hàm ở M4.1: vòng nét đứt (§4d-3a) phải khớp đúng bán kính của chấm bên dưới,
 * và một công thức chép ra hai chỗ là cách hai chỗ trôi khỏi nhau.
 */
function stationFieldRadius(zoom: number): number {
  return zoom <= 10 ? 3 : zoom >= 12 ? 6 : 3 + ((zoom - 10) / 2) * 3;
}

/** Supply field: fixed-radius station points, color is the only analytical channel. */
function stationPortsLayers(
  stations: StationPoint[],
  scale: Scale,
  field: FieldMeta,
  zoom: number,
  theme?: AnalysisTheme,
): Layer[] {
  const r = stationFieldRadius(zoom);
  const known = stations.filter((s) => s.nPorts !== null);
  const missing = stations.filter((s) => s.nPorts === null);
  const common = {
    getPosition: (d: StationPoint) => [d.lng, d.lat] as [number, number],
    radiusUnits: "pixels" as const,
    getRadius: r,
    radiusMinPixels: r,
    radiusMaxPixels: r,
    lineWidthUnits: "pixels" as const,
    pickable: true,
    onClick: (info: { object?: StationPoint }) => {
      if (info.object) useStore.getState().selectCell(serializeSelection({ kind: "station", id: info.object.id }));
    },
  };
  return [
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "station-ports-null",
      data: missing,
      filled: false,
      stroked: true,
      getLineColor: () => rgba(HATCH_RGB, 255),
      getLineWidth: 1.5,
      updateTriggers: { getRadius: r },
    }),
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "station-ports-value",
      data: known,
      filled: true,
      stroked: true,
      getFillColor: (d) => {
        const color = colorFor(d.nPorts, scale, theme);
        return rgba(color ?? FAIL_VISIBLE_RGB, 235);
      },
      getLineColor: rgba(BASEMAP_RGB, 255),
      getLineWidth: 1,
      updateTriggers: { getFillColor: [scale, field.id, theme], getRadius: r },
    }),
  ];
}

/**
 * Chấm trạm tô theo `station:occ` tại giờ `t` — **kênh thị giác của scrubber** (§3e).
 *
 * Ba điều đáng nói, và cả ba là quyết định chứ không phải chi tiết thi công:
 *
 * **1. ĐẶC ↔ RỖNG ở đây mang nghĩa của RÀNG BUỘC 1, không mang nghĩa HANOI/BUFFER.** Lớp
 * overlay `stations` (§4d) dùng đặc/rỗng để nói "thuộc Hà Nội hay vành đệm". Khi trạm trở
 * thành TRƯỜNG thì kênh đó bị ràng buộc 1 trưng dụng: rỗng = **không biết** (thiếu hồ sơ ·
 * thiếu quan sát ở giờ này · thiếu `n_ports`). Một ký hiệu không mang được hai nghĩa, và
 * giữa hai nghĩa thì ràng buộc 1 thắng — nó là ràng buộc, còn tư cách HANOI/BUFFER thì đã
 * có lớp BỐI CẢNH (ranh giới) trả lời bằng vị trí.
 *
 * **2. BẤM ĐƯỢC từ M4.1.** Trước đó `pickable: false` — vì panel TRẠM chưa dựng, và một
 * chấm bấm được mà bấm không ra gì là nói dối bằng giao diện (§3a). Panel §8a đã có, nên
 * cờ đó phải lật: để nguyên `false` sau khi panel dựng xong là nói dối theo chiều ngược
 * lại, đúng mặt kia của cùng luật mà nav đã áp ở M3.
 *
 * **3. Vẽ RỖNG TRƯỚC, ĐẶC SAU.** Ở nội đô chấm chồng nhau; chấm có giá trị là thứ đang
 * được chứng minh nên nó phải nằm trên.
 */
function stationFieldLayers(
  occ: StationOccupancy,
  scale: Scale,
  field: FieldMeta,
  zoom: number,
  t: number,
  theme?: AnalysisTheme,
): Layer[] {
  // Cùng luật co theo mức phóng với overlay trạm (§4d-1): mọi chấm co cùng nhau nên không
  // chấm nào nói gì khác chấm nào.
  const r = stationFieldRadius(zoom);

  interface Dot {
    lng: number;
    lat: number;
    value: number | null;
    /** `station_id` — khoá `c` của panel TRẠM (M4.1). */
    id: string;
  }
  const valued: Dot[] = [];
  const missing: Dot[] = [];
  for (let s = 0; s < occ.profiles.n; s++) {
    const st = occ.stations[s]!;
    if (!st.inScope) continue;
    const value = stationOccAt(occ.profiles, s, t);
    (value === null ? missing : valued).push({ lng: st.lng, lat: st.lat, value, id: st.id });
  }

  const common = {
    getPosition: (d: Dot) => [d.lng, d.lat] as [number, number],
    radiusUnits: "pixels" as const,
    getRadius: r,
    radiusMinPixels: r,
    radiusMaxPixels: r,
    lineWidthUnits: "pixels" as const,
    // M4.1 — panel TRẠM đã dựng, nên chấm bấm được. CHẤM RỖNG cũng bấm được, và đó là
    // quyết định: "chưa quan sát đủ ở giờ này" vẫn là một trạm có thật, có tên, có số cổng,
    // có hồ sơ 30 ngày — thứ duy nhất thiếu là một ô giờ. Không cho bấm sẽ biến ràng buộc 1
    // thành một hình phạt: trạm nào dữ liệu mỏng thì càng khó tra.
    pickable: true,
    onClick: (info: { object?: Dot }) => {
      if (info.object) {
        useStore.getState().selectCell(serializeSelection({ kind: "station", id: info.object.id }));
      }
    },
  };

  return [
    // CHẤM RỖNG viền xám — "chưa biết ở giờ này". KHÔNG tô bậc nhạt: ràng buộc 1 mở rộng
    // sang chiều thời gian (§4d-3b).
    new ScatterplotLayer<Dot>({
      ...common,
      id: "station-null",
      data: missing,
      filled: false,
      stroked: true,
      getLineColor: () => rgba(HATCH_RGB, 255),
      getLineWidth: 1.5,
      updateTriggers: { getRadius: r },
    }),
    new ScatterplotLayer<Dot>({
      ...common,
      id: "station-value",
      data: valued,
      filled: true,
      stroked: true,
      getFillColor: (d) => {
        const color = colorFor(d.value, scale, theme);
        return rgba(color ?? FAIL_VISIBLE_RGB, 235);
      },
      // Vòng viền màu SURFACE để tách chấm khỏi chấm bên cạnh ở nội đô — nó không mang
      // thông tin nào, đúng vai đã định ở §4d.
      getLineColor: rgba(BASEMAP_RGB, 255),
      getLineWidth: 1,
      updateTriggers: { getFillColor: [scale, t, field.id, theme], getRadius: r },
    }),
  ];
}

/**
 * CẦU LỚN — kẻ đậm. Mark của nhịp `mang-duong` (§11 M3-R).
 *
 * **Chỉ cầu dài hơn `MAJOR_BRIDGE_MIN_M`**, không phải cả 4.154 đoạn `bridge`. Lý do đầy
 * đủ ở `bridges.ts`, và nó đến từ một ảnh chụp chứ không từ suy đoán: kẻ đậm tất cả thì
 * trung vị 16 m — cống và cầu vượt bộ hành — thành một lớp chấm đen phủ khắp tỉnh và nuốt
 * mất chính cái ramp mà cảnh đang muốn cho xem.
 *
 * Vẽ **trên** lớp đường và dày hơn, màu mực chính: cầu không mang giá trị nào của trường —
 * nó là *cấu trúc*, thứ giải thích tại sao khoảng cách dồn lại ở vài chỗ. Cho nó một bậc
 * ramp sẽ là nói rằng cầu có một giá trị khoảng cách đáng đọc riêng; cho nó màu lạnh sẽ
 * là gọi nó là overlay. Nó không phải cả hai.
 *
 * **Không dán nhãn tên cầu lên bản đồ**: bản trích OSM không có
 * cột `name`, nên một nhãn đặt trên bản đồ là khẳng định một toạ độ ta không neo được vào
 * đâu. Tên nằm trong panel dưới dạng câu.
 */
function bridgeLayer(roads: RoadSeg[], zoom: number): Layer {
  return new PathLayer<RoadSeg>({
    id: "scene-bridges",
    data: majorBridges(roads),
    getPath: (d) => d.path,
    positionFormat: "XY",
    widthUnits: "pixels",
    getWidth: roadWidth(zoom) + 2,
    getColor: [11, 11, 11, 255],
    capRounded: true,
    jointRounded: true,
    pickable: false,
  });
}


/**
 * Ba cặp tuyến minh hoạ — mark của nhịp `mang-duong`.
 *
 * Đây là thứ **thay** cho cảnh morph mà §13e đã bỏ, và nó trung thực hơn: nó vẽ một đường
 * đi **có thật** (Dijkstra trả về) cạnh đoạn thẳng chim bay của cùng một ô, thay vì nội
 * suy một hình tròn không có trong dữ liệu.
 *
 * Hai nét phân biệt bằng **bề rộng và màu**, không bằng nét đứt: nét đứt đã được §4d-3a
 * đặt trước cho "trạng thái không vận hành bình thường" (M4.1), và mượn nó ở đây sẽ làm
 * một ký hiệu mang hai nghĩa.
 */
function routeLayers(routes: ShowcaseRoute[]): Layer[] {
  const common = {
    getPath: (d: ShowcaseRoute) => d.path,
    widthUnits: "pixels" as const,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  };
  const euclid = routes.filter((r) => r.kind === "euclid");
  const network = routes.filter((r) => r.kind === "network");
  const out: Layer[] = [
    // Chim bay dưới, đường thật trên: đường thật là thứ đang được chứng minh.
    new PathLayer<ShowcaseRoute>({
      ...common,
      id: "route-euclid",
      data: euclid,
      getColor: rgba(COLD_RGB[0]!, 255),
      getWidth: 2,
    }),
    new PathLayer<ShowcaseRoute>({
      ...common,
      id: "route-network",
      data: network,
      getColor: rgba(COLD_RGB[2]!, 255),
      getWidth: 4,
    }),
  ];

  if (network.length > 0) {
    out.push(
      new ScatterplotLayer<ShowcaseRoute>({
        id: "route-network-endpoints",
        data: network,
        getPosition: (d) => d.path[0] ?? [0, 0],
        getRadius: 5,
        radiusUnits: "pixels",
        filled: true,
        stroked: true,
        getFillColor: rgba(COLD_RGB[2]!, 255),
        getLineColor: [255, 255, 255, 255],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        pickable: false,
      }),
      new TextLayer<ShowcaseRoute>({
        id: "route-network-labels",
        data: network,
        getPosition: (d) => d.path[0] ?? [0, 0],
        getText: (d) => `${d.communeName}: ${formatNumber(d.detour)}×`,
        getSize: 10,
        getColor: [11, 11, 11, 240],
        backgroundColor: [249, 249, 247, 220],
        backgroundPadding: [4, 2, 4, 2],
        characterSet: "auto",
        fontFamily: '"Be Vietnam Pro", sans-serif',
        fontWeight: 600,
        getTextAnchor: "start",
        getAlignmentBaseline: "center",
        getPixelOffset: [10, 0],
        pickable: false,
      }),
    );
  }

  return out;
}

// ── Mặt tô: mặt độ cầu liên tục (§1b, §13d-A) ──────────────────────────────────

/** P1 exploration-only: cường độ theo pixel màn hình, không mang ngưỡng định lượng. */
function demandIntensityLayer(cells: GridCell[]): Layer {
  return new HeatmapLayer<GridCell>({
    id: "demand-intensity",
    data: cells,
    getPosition: (d) => [d.lng, d.lat],
    getWeight: (d) => d.pop ?? 0,
    radiusPixels: 42,
    intensity: 1,
    threshold: 0.06,
    colorRange: RAMP_RGB.map((c) => [...c, 220]),
    pickable: false,
  });
}

/** P1 bivariate comparison: Hàng = population tertile, cột = installed-port tertile. */
function demandSupplyLayer(cells: GridCell[]): Layer {
  // MỘT cửa cho cả bản đồ lẫn chú giải — xem `bivariateAxes`.
  const { pop, ports } = bivariateAxes(cells);
  const popBreaks = pop.breaks;
  const portBreaks = ports.breaks;
  return new H3HexagonLayer<GridCell>({
    id: "demand-supply-bivariate",
    data: cells,
    getHexagon: (d) => d.h3,
    filled: true,
    stroked: false,
    pickable: true,
    onClick: (info: { object?: GridCell }) => {
      if (info.object) useStore.getState().selectCell(info.object.h3);
      return true;
    },
    getFillColor: (d) => {
      const r = tertileClass(d.pop ?? 0, popBreaks);
      const c = tertileClass(d.ports, portBreaks);
      return [...DEMAND_SUPPLY_RGB[r]![c]!, 225] as [number, number, number, number];
    },
    updateTriggers: { getFillColor: [popBreaks, portBreaks] },
  });
}

function surfaceLayer(cells: GridCell[], breaks: number[]): Layer {
  // Dải giữa hai ngưỡng liên tiếp; ngưỡng cuối mở tới vô cực. Màu là RAMP CAM — đây là một
  // TRƯỜNG GIÁ TRỊ (cầu), không phải overlay, nên nó dùng trục màu của trường (§1b-2).
  const n = Math.max(breaks.length, 1);
  const contours = breaks.map((b, i) => ({
    threshold: [b, i + 1 < breaks.length ? breaks[i + 1]! : Number.MAX_SAFE_INTEGER] as [number, number],
    color: RAMP_RGB[Math.round((i / Math.max(n - 1, 1)) * (RAMP_RGB.length - 1))]!,
    zIndex: i,
  }));

  return new ContourLayer<GridCell>({
    id: "demand-surface",
    data: cells,
    // `population` không có ô null nào (đã kiểm ở `no_missing_after_join`), nên phép cộng
    // không âm thầm bỏ sót ô nào. Trường có null thì mặt sẽ trũng đúng chỗ ta không biết —
    // lý do `surface` phải khai từng trường một, xem `FieldMeta.surface`.
    getPosition: (d) => [d.lng, d.lat],
    getWeight: (d) => d.pop ?? 0,
    aggregation: "SUM",
    cellSize: SURFACE_CELL_M,
    contours,
    opacity: 0.85,
    pickable: false,
  });
}

// ── Overlay ────────────────────────────────────────────────────────────────────

/**
 * Bán kính chấm khi trạm là OVERLAY.
 *
 * z≤10 → 2 px (chấm là hạt, đọc được MẬT ĐỘ) · z≥12 → 4,5 px (đọc được TỪNG chấm, phân
 * biệt được đặc/rỗng) · giữa hai mốc thì nội suy tuyến tính. Ở z9,3 có 939 chấm 9 px chen
 * nhau: 4,5 px là cỡ đúng để ĐỌC MỘT CHẤM (đo ở M2) nhưng sai để đọc 939 chấm cùng lúc.
 */
function stationOverlayRadius(zoom: number): number {
  return zoom <= 10 ? 2 : zoom >= 12 ? 4.5 : 2 + ((zoom - 10) / 2) * 2.5;
}

/**
 * Trạm sạc — điểm. HAI lớp, không một lớp có màu khác nhau: khác biệt HANOI/BUFFER là khác
 * biệt về **tư cách** (thuộc Hà Nội hay không), và nó được mã hoá bằng **hình** — đặc so
 * với rỗng. Đó là kênh đọc được cả khi mù màu, và nó khớp nghĩa: chấm rỗng = "có mặt ở đây
 * để tính phủ đúng ở biên, nhưng không được tính vào phạm vi đang xem".
 *
 * Mốc phân biệt là `isInScope` (neo vào `BUFFER`), KHÔNG phải `scope === "HANOI"` — bộ Hà
 * Nội ghi `HANOI` còn store toàn quốc ghi `IN`, và điều kiện cũ làm MỌI trạm của MỌI tỉnh
 * rơi vào nhánh "vành đệm".
 *
 * Bán kính là HẰNG SỐ, không tỉ lệ với `n_ports` — §4d-1.
 */
function stationLayers(stations: StationPoint[], zoom: number): Layer[] {
  const r = stationOverlayRadius(zoom);
  const inScope = stations.filter((s) => s.inScope);
  const buffer = stations.filter((s) => !s.inScope);
  const common = {
    getPosition: (d: StationPoint) => [d.lng, d.lat] as [number, number],
    // Bán kính CO THEO ZOOM — và điều đó không phạm §4d-1: luật đó cấm mã hoá GIÁ TRỊ
    // bằng kích thước, không cấm co theo mức phóng. Mọi chấm co cùng nhau nên không chấm
    // nào nói gì khác chấm nào.
    //
    // Vì sao cần: ở z9,3 có 939 chấm 9 px chen nhau — đặc/rỗng không phân biệt nổi, và
    // chấm vành đệm rải khắp vùng trắng làm mất hình dáng Hà Nội. 4,5 px là kích thước
    // đúng để ĐỌC MỘT CHẤM (đã đo ở M2), nhưng sai để đọc 939 chấm cùng lúc.
    radiusUnits: "pixels" as const,
    getRadius: r,
    radiusMinPixels: r,
    radiusMaxPixels: r,
    lineWidthUnits: "pixels" as const,
    // M4.1 — bấm một chấm mở panel TRẠM (§8a). Cả HANOI lẫn BUFFER: trạm vành đệm không
    // vào con số nào của thành phố, nhưng nó tồn tại và tra được — và đúng lúc mentor hỏi
    // "cái chấm rỗng kia là gì" thì câu trả lời phải nằm trong một cú bấm.
    pickable: true,
    onClick: (info: { object?: StationPoint }) => {
      if (info.object) {
        useStore.getState().selectCell(serializeSelection({ kind: "station", id: info.object.id }));
      }
    },
  };
  return [
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "stations-buffer",
      data: buffer,
      filled: false,
      stroked: true,
      getLineColor: rgba(COLD_RGB[1]!, 255),
      getLineWidth: 2,
    }),
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "stations-in-scope",
      data: inScope,
      filled: true,
      stroked: true,
      getFillColor: rgba(COLD_RGB[2]!, 255),
      // Vòng viền màu SURFACE, không phải màu lạnh: nó để tách chấm khỏi ô bên dưới, không
      // để mang thông tin. §4d.
      getLineColor: rgba(BASEMAP_RGB, 255),
      getLineWidth: 2,
    }),
  ];
}

/** P1 Hybrid: size is deliberately `n_ports`, unlike the ordinary station overlay. */
function capacityStationLayers(stations: StationPoint[]): Layer[] {
  const known = stations.filter((s) => s.nPorts !== null);
  const unknown = stations.filter((s) => s.nPorts === null);
  const inScope = known.filter((s) => s.inScope);
  const buffer = known.filter((s) => !s.inScope);
  const radius = (d: StationPoint) => Math.max(3, Math.min(15, 2 + Math.sqrt(d.nPorts!) * 1.7));
  const common = {
    getPosition: (d: StationPoint) => [d.lng, d.lat] as [number, number],
    getRadius: radius,
    radiusUnits: "pixels" as const,
    radiusMinPixels: 3,
    radiusMaxPixels: 15,
    lineWidthUnits: "pixels" as const,
    pickable: true,
    onClick: (info: { object?: StationPoint }) => {
      if (info.object) useStore.getState().selectCell(serializeSelection({ kind: "station", id: info.object.id }));
    },
  };
  return [
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "demand-capacity-buffer",
      data: buffer,
      filled: false,
      stroked: true,
      getLineColor: rgba(COLD_RGB[1]!, 255),
      getLineWidth: 2,
    }),
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "demand-capacity-in-scope",
      data: inScope,
      filled: true,
      stroked: true,
      getFillColor: rgba(COLD_RGB[2]!, 255),
      getLineColor: rgba(BASEMAP_RGB, 255),
      getLineWidth: 2,
    }),
    // Không có `n_ports` thì không có kích thước. Vòng xám cố định nói “trạm có mặt,
    // nhưng chưa biết số cổng”, không mượn 0 làm kích thước nhỏ nhất.
    new ScatterplotLayer<StationPoint>({
      ...common,
      id: "demand-capacity-unknown",
      data: unknown,
      getRadius: 4,
      radiusMinPixels: 4,
      radiusMaxPixels: 4,
      filled: false,
      stroked: true,
      getLineColor: rgba(HATCH_RGB, 255),
      getLineWidth: 1.5,
    }),
  ];
}

// ── Overlay: trạng thái vận hành — M4.1, §4d-3a ───────────────────────────────

let statusAtlas: { atlasUrl: string; mapping: Record<string, StatusIconEntry> } | null = null;
function getStatusAtlas() {
  statusAtlas ??= buildStatusIconAtlas();
  return statusAtlas;
}

/**
 * Vòng NÉT ĐỨT quanh trạm `MAINTENANCE`/`OUT_OF_SERVICE` — §4d-3a.
 *
 * `IconLayer` chứ không `ScatterplotLayer`: deck không có nét đứt cho viền chấm, và một
 * vòng "gần đứt" ghép từ nhiều cung là một lớp hình học mới cho một thứ vốn chỉ là một
 * texture. Cùng thủ pháp mà M5 đã dùng cho sao 5 cánh — atlas vẽ một lần lúc cần.
 *
 * `pickable: false` **có chủ ý**: vòng này chú thích một chấm đã bấm được: cho nó bắt chuột
 * nữa thì hai lớp tranh nhau cùng một cú bấm và mark nào thắng phụ thuộc thứ tự vẽ.
 */
function stationStatusLayer(stations: StationPoint[], dotRadius: number): Layer {
  const size = statusIconSize(dotRadius);
  return new IconLayer<StationPoint>({
    id: "station-status",
    data: stations.filter((s) => isAbnormal(s.opStatus)),
    getPosition: (d) => [d.lng, d.lat],
    getIcon: () => STATUS_ICON_ID,
    iconAtlas: getStatusAtlas().atlasUrl,
    iconMapping: getStatusAtlas().mapping,
    sizeUnits: "pixels",
    getSize: size,
    // Icon mang sẵn màu trong atlas; `getColor` trắng để deck không nhuộm lại nó.
    getColor: [255, 255, 255, 255],
    pickable: false,
    // Mark ĐIỂM ở cao độ 0 bị depth buffer ăn mất nửa dưới trong `m=3d` — lỗi đã bắt và
    // sửa ở M5, cùng nguyên nhân, cùng thuốc (tên luma.gl 9; `depthTest: false` của WebGL
    // cũ không nổ mà chỉ im lặng vô tác dụng).
    parameters: { depthCompare: "always" },
    updateTriggers: { getSize: size },
  });
}

// ── Overlay: POI 4 nhóm — M3.5, §4d-4 ─────────────────────────────────────────

/**
 * Atlas icon vẽ MỘT lần cho cả phiên — module-level vì nó chỉ phụ thuộc bảng màu,
 * không phụ thuộc dữ liệu hay state nào.
 */
let poiAtlas: { atlasUrl: string; mapping: Record<string, IconEntry> } | null = null;
function getPoiAtlas() {
  poiAtlas ??= buildPoiIconAtlas();
  return poiAtlas;
}

/**
 * Cỡ icon theo mức phóng — HẰNG SỐ theo zoom, không bao giờ theo giá trị (§4d-1, M2.1-F6).
 * Cần nhiều px hơn chấm trạm (2→4,5) vì thứ phải đọc được là HÌNH DẠNG, không chỉ vị trí:
 * dưới ~5 px thì vuông/thoi/tam giác/chữ thập là cùng một hạt.
 */
function poiIconSize(zoom: number): number {
  return zoom <= 10 ? 5 : zoom >= 13 ? 11 : 5 + ((zoom - 10) / 3) * 6;
}

/**
 * Các lớp của MỘT nhóm POI đang bật — §4d-4, P2–P5.
 *
 * 2D, mỗi nhóm hai lớp:
 *   · polygon: viền 2 px đặc + fill VÂN 135° (§4d-1 vô điều kiện — kể cả ở cỡ toà nhà,
 *     không mảng phẳng nào), tức "cạnh nhìn rõ" đến từ stroke chứ không từ fill;
 *   · icon: hình dạng của nhóm — ĐẶC tại tâm polygon ("hình học thật có trong dữ liệu"),
 *     RỖNG tại POI chỉ-điểm ("chỉ biết vị trí, không biết cạnh"). POI chỉ-điểm vì thế
 *     không bao giờ biến mất và không bao giờ thành vòng tròn bán kính bịa (P4).
 *
 * 3D (`m=3d`):
 *   · polygon thành KHỐI — extruded ở `POI_BLOCK_HEIGHT_M` (hằng số khai báo, in ở tab
 *     LAYER); icon đặc bay lên đỉnh khối để danh tính nhóm không chết trong 3D;
 *   · POI chỉ-điểm KHÔNG có khối — không đùn hộp giả; icon rỗng (billboard) vẫn vẽ để
 *     nhóm không âm thầm mất một nửa thành viên khi nghiêng camera.
 */
function poiLayers(
  poi: PoiCollection,
  layersOn: Set<OverlayId>,
  zoom: number,
  is3d: boolean,
  selected: string | null,
): Layer[] {
  const groupsOn = poiGroupsOn(layersOn);
  if (groupsOn.length === 0) return [];
  const { atlasUrl, mapping } = getPoiAtlas();
  const size = poiIconSize(zoom);
  const selectedRef = poiRefOf(selected);
  const out: Layer[] = [];

  const onClick = (info: { object?: PoiFeature }) => {
    if (info.object) {
      useStore.getState().selectCell(
        serializeSelection({ kind: "poi", ref: poiRef(info.object.properties) }),
      );
    }
    return true;
  };

  for (const g of groupsOn) {
    const feats = poi.features.filter((f) => f.properties.group === g.group);
    const polys = feats.filter((f) => hasShape(f.geometry));

    if (is3d) {
      out.push(
        new GeoJsonLayer({
          id: `poi-block-${g.id}`,
          data: { type: "FeatureCollection", features: polys },
          extruded: true,
          wireframe: false,
          filled: true,
          stroked: false,
          getElevation: POI_BLOCK_HEIGHT_M,
          getFillColor: rgba(COLD_RGB[1]!, 230),
          pickable: true,
          onClick,
        }),
      );
    } else {
      // HAI lớp, không một: `HatchExtension` sửa fragment shader của CẢ layer con vẽ
      // stroke, nên một GeoJsonLayer vừa fill-vân vừa stroke sẽ có cạnh bị vân ăn mất —
      // đã thấy trên render thật. Fill-vân một lớp, cạnh đặc một lớp.
      out.push(
        new GeoJsonLayer({
          id: `poi-fill-${g.id}`,
          data: { type: "FeatureCollection", features: polys },
          filled: true,
          stroked: false,
          // Fill là VÂN 135° (§4d-1 vô điều kiện), không phải mảng màu — mặt tô bên
          // dưới vẫn thắng.
          getFillColor: rgba(COLD_RGB[1]!, 255),
          extensions: [OVERLAY_HATCH],
          pickable: true,
          onClick,
        }),
        new GeoJsonLayer({
          id: `poi-stroke-${g.id}`,
          data: { type: "FeatureCollection", features: polys },
          filled: false,
          stroked: true,
          // Cạnh phải NHÌN RÕ (P3) — viền 2 px đặc, không vân.
          getLineColor: rgba(COLD_RGB[1]!, 255),
          lineWidthUnits: "pixels",
          getLineWidth: 2,
          pickable: false,
        }),
      );
    }

    out.push(
      new IconLayer<PoiFeature>({
        id: `poi-icon-${g.id}`,
        data: feats,
        iconAtlas: atlasUrl,
        iconMapping: mapping,
        getIcon: (d) => iconId(g.shape, hasShape(d.geometry)),
        // Tâm polygon do s03b tính sẵn (`lat`/`lng` của properties); POI chỉ-điểm thì đó
        // chính là toạ độ node. Trong 3D, icon của khối bay lên đỉnh khối.
        getPosition: (d) =>
          is3d && hasShape(d.geometry)
            ? [d.properties.lng, d.properties.lat, POI_BLOCK_HEIGHT_M + 6]
            : [d.properties.lng, d.properties.lat],
        sizeUnits: "pixels",
        getSize: size,
        billboard: true,
        // Cùng thuốc, cùng bệnh với vòng nét đứt (M4.1) — nhưng
        // ở đây nó bị BỎ SÓT và lỗi sống từ M3.5. `interleaved: true` (xem `new
        // MapboxOverlay`) nghĩa là deck dùng CHUNG depth buffer với basemap, nên vật che
        // không chỉ là mặt tô xã: **khối nhà 3D của basemap** cắt cụt icon POI đứng trên
        // mái. Icon ở cao độ 0 mất nửa dưới, và nửa dưới chính là chỗ phân biệt tam giác
        // với thoi — tức KÊNH HÌNH DẠNG, thứ duy nhất mang danh tính nhóm POI (§4d-4).
        //
        // Giá phải trả, viết ra vì nó có thật: icon của POI CÓ POLYGON (bay lên đỉnh khối
        // trong 3D) cũng mất depth test, nên nó xuyên qua một khối cao hơn đứng chắn phía
        // trước. Chấp nhận, cùng lập luận M5 đã chốt: **lớp icon là chú thích, không phải
        // một vật thể trong cảnh 3D.** Hai lối khác đã loại từ M5 vì lý do không đổi: nâng
        // cao độ bằng mét thì sai theo zoom (mark tính bằng pixel), còn `getPixelOffset`
        // thì mark không còn đứng tại toạ độ của nó.
        parameters: { depthCompare: "always" as const },
        pickable: true,
        onClick,
        updateTriggers: { getPosition: is3d, getSize: size },
      }),
    );
  }

  // Viền POLYGON của POI đang chọn — cùng khuôn viền chọn ô/xã (họ lạnh đậm, không phải
  // bậc ramp). POI chỉ-điểm không có viền chọn: không biết cạnh thì không vẽ cạnh.
  if (selectedRef) {
    const sel = poi.features.filter(
      (f) => poiRef(f.properties) === selectedRef && hasShape(f.geometry),
    );
    if (sel.length > 0) {
      out.push(
        new GeoJsonLayer({
          id: "poi-selected",
          data: { type: "FeatureCollection", features: sel },
          filled: false,
          stroked: true,
          pickable: false,
          getLineColor: rgba(SELECT_RGB, 255),
          lineWidthUnits: "pixels",
          getLineWidth: SELECT_CORE_W,
          updateTriggers: { getLineColor: selectedRef },
        }),
      );
    }
  }
  return out;
}

/**
 * Nhãn ĐẶC KHU — Hoàng Sa, Trường Sa và 11 đặc khu hải đảo khác. Xem `data/dackhu.ts`.
 *
 * **Không phải overlay.** Nó không có trong tab LAYER và không tắt được, cùng vai với
 * đường khung ranh giới BỐI CẢNH ở trên: đây là *chrome của bản đồ* — thứ nói bản đồ này
 * đang vẽ ở đâu — chứ không phải một lớp dữ liệu để so sánh. Một cái tên địa lý không phải
 * một biến.
 *
 * Mực chính §4e, không lấy màu của họ lạnh và cũng không lấy bậc ramp nào: nhãn là chữ,
 * và chữ ở đây khẳng định *tên*, không khẳng định *giá trị*. Viền surface quanh chữ là để
 * đọc được trên cả nền biển xám lẫn mặt tô cam, cùng thủ pháp vòng viền của mark điểm.
 *
 * `billboard` + `depthCompare: "always"`: nhãn phải đọc được y hệt ở `m=3d` — cùng lý do
 * đã ghi cho icon POI, và ở đây còn gắt hơn vì chữ nghiêng theo pitch
 * là chữ không đọc được.
 */
function dacKhuLayer(fc: CommuneCollection, zoom: number): Layer | null {
  const labels = dacKhuLabels(fc);
  if (labels.length === 0) return null;
  return new TextLayer<DacKhuLabel>({
    id: "dac-khu-label",
    data: labels,
    getPosition: (d) => d.at,
    getText: (d) => d.name,
    // Cỡ chữ theo ZOOM, không theo dữ liệu (§4d-1). Chặn hai đầu: dưới 10 px thì không
    // đọc được, trên 15 px thì một cái tên dài che mất chính cụm đảo nó đang gọi tên.
    getSize: Math.max(10, Math.min(15, 9 + zoom * 0.4)),
    sizeUnits: "pixels",
    getColor: [11, 11, 11, 255],
    outlineWidth: 3,
    outlineColor: [242, 243, 240, 235],
    // `characterSet: "auto"` — BẮT BUỘC, và đây là một lỗi đã sập chứ không phải phòng xa:
    // tập ký tự mặc định của `TextLayer` là ASCII, nên atlas không có `Đ` `ặ` `à`, và nhãn
    // render ra **"c khu Ho ng Sa"** — mỗi chữ có dấu bị nuốt lặng lẽ, không một cảnh báo
    // nào. Một bản đồ tiếng Việt không được phép có mặc định đó.
    characterSet: "auto",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 600,
    fontSettings: { sdf: true },
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    billboard: true,
    pickable: false,
    parameters: { depthCompare: "always" as const },
    updateTriggers: { getSize: zoom },
  });
}

/** Ranh giới xã — đường. Overlay dạng đường giữ opacity đầy đủ (§4d). */
function communeOutline(fc: CommuneCollection): Layer {
  return new GeoJsonLayer({
    id: "commune-outline",
    data: fc,
    filled: false,
    stroked: true,
    pickable: false,
    getLineColor: rgba(COLD_RGB[1]!, 255),
    lineWidthUnits: "pixels",
    getLineWidth: 1,
  });
}

/**
 * Vùng ngoài 5 phút lái — overlay dạng VÙNG, nên nó là **vân 135°**, không phải mảng màu
 * alpha 0,5 (§4d-1). Đây là overlay chứng minh luật đó: bật nó cùng lúc với một trường
 * hạng mục (cũng màu lạnh, cũng phẳng) mà vẫn phân biệt được thì luật đúng.
 *
 * Dùng đa giác H3 thật của từng ô — cùng hình học với lớp hex, nên biên trùng khít.
 */
function beyond2kmLayer(cells: GridCell[]): Layer {
  return new H3HexagonLayer<GridCell>({
    id: "overlay-beyond2km",
    // `=== true` chứ không phải truthy: `null` là ô KHÔNG TỚI ĐƯỢC, và "không biết mất bao
    // lâu" không được vẽ thành "biết là hơn 5 phút". Cùng tinh thần ràng buộc 1.
    data: cells.filter((c) => c.beyond2km === true),
    getHexagon: (d) => d.h3,
    extruded: false,
    stroked: false,
    filled: true,
    pickable: false,
    // Bậc lạnh ĐẬM NHẤT, không phải bậc vừa. Danh tính overlay đến từ hình học + chất
    // liệu (§4d-1), nên trùng hue với một hạng mục không phá luật — nhưng trường hạng mục
    // lấy bậc lạnh theo thứ tự từ NHẠT (§6a-5), nên chọn đầu kia của họ màu thì hai thứ
    // tách nhau thêm một bậc nữa, miễn phí.
    getFillColor: rgba(COLD_RGB[2]!, 255),
    extensions: [OVERLAY_HATCH],
  });
}
