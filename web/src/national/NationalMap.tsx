/**
 * Bản đồ của màn hình TOÀN QUỐC — MapLibre + deck.gl interleaved, cùng khuôn với `MapView`.
 *
 * Là một component RIÊNG chứ không phải một nhánh trong `MapView`: `MapView` nhận 12 prop
 * của bậc tỉnh (cảnh, scrubber, brush, POI 3D, trạm biến áp, mạng đường…) và đọc `useStore`
 * ở chín chỗ. Nhồi bậc toàn quốc vào đó là thêm một cờ `isNational` phải kiểm ở từng chỗ
 * một, và chỗ nào quên là một lớp của tỉnh vẽ đè lên bản đồ cả nước.
 *
 * Đổi lại phải chép lại phần dựng map + overlay. Đó là ~40 dòng, và chúng là những dòng
 * ổn định nhất trong `MapView`.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { GeoJsonLayer, IconLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

import { loadStyle } from "../map/positron";
import { HATCH_RGB, classOf, rampFor, type RGB, type Scale } from "../viz/palette";
import { buildPoiIconAtlas, iconId, type IconEntry } from "../viz/poi-icons";
import type { NationalField } from "./fields";
import type {
  NationalCell,
  NationalPoi,
  NationalStation,
  ProvinceFeature,
  ProvinceRow,
} from "./data";

type RGBA = [number, number, number, number];
const rgba = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], a];

/** Mực của ranh giới tỉnh — nét mảnh, không phải một lớp mang dữ liệu. */
const BORDER_RGB: RGB = [120, 118, 112];
const STATION_RGB: RGB = [24, 24, 24];

export interface NationalMapProps {
  view: { lng: number; lat: number; zoom: number };
  onView: (v: { lng: number; lat: number; zoom: number }) => void;
  field: NationalField;
  scale: Scale | null;
  cells: NationalCell[];
  provinces: ProvinceFeature[];
  rows: Record<string, ProvinceRow>;
  stations: NationalStation[] | null;
  poi: NationalPoi[] | null;
  showStations: boolean;
  showPoi: Set<string>;
  hovered: string | null;
  onHoverProvince: (code: string | null) => void;
  onPickProvince: (code: string) => void;
}

/**
 * Bán kính chấm trạm theo mức phóng — HẰNG SỐ theo zoom, không bao giờ theo giá trị.
 *
 * Cùng luật §4d-1 mà `stationOverlayRadius` của màn hình tỉnh đang theo, chỉ khác quãng
 * phóng: ở đây quãng sống là z4–z9, chứ không phải z9–z14. Ở z5 với 6.380 chấm thì 1,6 px
 * là chỗ tập chấm còn đọc được thành một HÌNH (dày ở hai đồng bằng, thưa ở Tây Bắc) thay
 * vì thành một vệt liền.
 */
function stationRadius(zoom: number): number {
  return zoom <= 5 ? 1.3 : zoom >= 9 ? 4 : 1.3 + ((zoom - 5) / 4) * 2.7;
}

/**
 * Cỡ mark POI theo mức phóng — nhỏ hơn HẲN cỡ của bậc tỉnh, và đó là một phép đo chứ không
 * phải khẩu vị.
 *
 * Đo được ở lần dựng đầu: 25.220 mark cỡ 4 px với mực gần đen phủ kín cả dải ven biển và
 * hai đồng bằng thành một khối ĐEN — nuốt sạch mặt tô bên dưới, tức nuốt chính cái trường
 * đang xem. Diện tích mark cộng dồn chứ không cộng thông tin.
 *
 * 2,2 px + alpha 130 ở z5 thì tập mark đọc thành một **vệt lấm tấm** (thấy được chỗ nào dày
 * chỗ nào thưa, và vẫn nhìn xuyên xuống mặt tô); tới z10 nó về đúng cỡ mark của bậc tỉnh.
 */
function poiSize(zoom: number): number {
  return zoom <= 5 ? 2.2 : zoom >= 10 ? 10 : 2.2 + ((zoom - 5) / 5) * 7.8;
}

/** Mực POI mờ dần về phía zoom thấp — cùng lý do với `poiSize`. */
function poiAlpha(zoom: number): number {
  return zoom <= 5 ? 130 : zoom >= 9 ? 235 : 130 + ((zoom - 5) / 4) * 105;
}

export function NationalMap(props: NationalMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [atlas, setAtlas] = useState<{
    atlasUrl: string;
    mapping: Record<string, IconEntry>;
  } | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;
    const v0 = props.view;

    void loadStyle().then((style) => {
      if (cancelled || !container.current) return;
      const m = new maplibregl.Map({
        container: el,
        style,
        center: [v0.lng, v0.lat],
        zoom: v0.zoom,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.on("moveend", () => {
        const c = m.getCenter();
        props.onView({ lng: c.lng, lat: c.lat, zoom: m.getZoom() });
      });
      const ov = new MapboxOverlay({ interleaved: true, layers: [] });
      overlay.current = ov;
      m.addControl(ov);
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      overlay.current = null;
      map.current?.remove();
      map.current = null;
    };
    // Dựng MỘT lần. `props.view` chỉ đọc ở đây làm khung nhìn khởi tạo — sau đó camera là
    // nguồn sự thật và nó ghi ngược ra qua `moveend`, nên đưa `view` vào deps sẽ dựng lại
    // cả bản đồ ở mỗi lần kéo chuột.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atlas icon POI dựng bằng `<canvas>` — chỉ dựng khi thật sự có nhóm POI được bật, và
  // chỉ dựng MỘT lần. Cùng atlas với màn hình tỉnh ⇒ bốn hình dạng giống hệt ở hai bậc.
  const needPoi = props.showPoi.size > 0;
  useEffect(() => {
    if (!needPoi || atlas) return;
    setAtlas(buildPoiIconAtlas());
  }, [needPoi, atlas]);

  const {
    field,
    scale,
    cells,
    provinces,
    rows,
    stations,
    poi,
    showStations,
    showPoi,
    hovered,
    onHoverProvince,
    onPickProvince,
  } = props;
  const zoom = props.view.zoom;

  useEffect(() => {
    const ov = overlay.current;
    if (!ov) return;
    const out: Layer[] = [];

    const paintProvince = field.unit === "province";
    // Màu ĐÃ áp cực tính — cùng một hàm mà legend gọi, nên bản đồ không thể lệch với chú
    // giải của chính nó.
    //
    // Bản đầu dùng `colorFor()`, và đó là một lỗi im lặng: `colorFor` đi thẳng qua
    // `scaleColors` và **không biết gì về cực tính**. Với trường `high-good` (cổng trên 10
    // nghìn dân, số trạm, trạm đo được mức sử dụng) legend đảo thang còn bản đồ thì không —
    // hai thứ nói ngược nhau về cùng một tỉnh, và không có lỗi nào để nhìn thấy.
    const ramp = scale ? rampFor(scale, field.polarity).colors : [];
    const colorOf = (v: unknown): RGBA | null => {
      if (!scale) return null;
      const k = classOf(v as number, scale);
      return k === null ? null : rgba(ramp[k] ?? ramp[ramp.length - 1]!, 255);
    };

    // ── mặt tô — ĐÚNG MỘT, cùng ràng buộc 2 của bậc tỉnh (§6b) ────────────────
    if (paintProvince) {
      out.push(
        new GeoJsonLayer({
          id: "vn-provinces-fill",
          data: provinces,
          filled: true,
          stroked: true,
          pickable: true,
          // Accessor nhận `unknown` rồi ép trong thân hàm — cùng khuôn với `commune-value`
          // của `MapView`: kiểu feature của deck.gl là `Feature<Geometry>` cố định, nên
          // khai tham số hẹp hơn sẽ không khớp chữ ký của layer.
          getFillColor: (f: unknown) => {
            const row = rows[(f as ProvinceFeature).properties.province_code];
            const c = colorOf(row?.[field.column] ?? null);
            // Không có màu ⇒ ô VÂN xám của bậc tỉnh: "không đo được", không phải "bằng 0".
            // Tỉnh chưa dựng trong store rơi vào đúng nhánh này và đó là câu đúng cho nó.
            return c ? ([c[0], c[1], c[2], 220] as RGBA) : rgba(HATCH_RGB, 90);
          },
          getLineColor: (f: unknown) =>
            (f as ProvinceFeature).properties.province_code === hovered
              ? ([20, 20, 20, 255] as RGBA)
              : rgba(BORDER_RGB, 190),
          getLineWidth: (f: unknown): number =>
            (f as ProvinceFeature).properties.province_code === hovered ? 2.2 : 0.8,
          lineWidthUnits: "pixels",
          onHover: (i: { object?: unknown }) =>
            onHoverProvince(
              i.object ? (i.object as ProvinceFeature).properties.province_code : null,
            ),
          onClick: (i: { object?: unknown }) => {
            const f = i.object as ProvinceFeature | undefined;
            if (f?.properties.in_store) onPickProvince(f.properties.province_code);
          },
          updateTriggers: { getFillColor: [field.id, scale], getLineColor: hovered, getLineWidth: hovered },
        }),
      );
    } else {
      out.push(
        new H3HexagonLayer({
          id: "vn-cells",
          data: cells,
          getHexagon: (d: NationalCell) => d.h3,
          // `extruded: false` và `highPrecision: false`: ở bậc r6 phép nội suy nhanh không
          // lệch thấy được, còn 9,8 nghìn ô dựng chính xác từng đỉnh là chi phí thật.
          extruded: false,
          filled: true,
          stroked: false,
          pickable: true,
          getFillColor: (d: NationalCell) => {
            const c = colorOf(d[field.column]);
            return c ? ([c[0], c[1], c[2], 225] as RGBA) : rgba(HATCH_RGB, 70);
          },
          updateTriggers: { getFillColor: [field.id, scale] },
        }),
      );
      // Ranh giới tỉnh vẫn vẽ, dưới dạng NÉT: thảm ô r6 không nói được mình đang ở tỉnh nào,
      // và "cả nước" là một phát biểu về 34 tỉnh chứ không phải về 9,8 nghìn ô.
      out.push(
        new GeoJsonLayer({
          id: "vn-provinces-line",
          data: provinces,
          filled: true,
          stroked: true,
          pickable: true,
          // Nền trong suốt nhưng KHÔNG bỏ `filled`: deck.gl chỉ bắt được con trỏ trên phần
          // được tô, nên bỏ nó đi là mất luôn hover/click vào tỉnh khi đang xem trường ô.
          getFillColor: [0, 0, 0, 0],
          getLineColor: (f: unknown) =>
            (f as ProvinceFeature).properties.province_code === hovered
              ? ([20, 20, 20, 255] as RGBA)
              : rgba(BORDER_RGB, 150),
          getLineWidth: (f: unknown): number =>
            (f as ProvinceFeature).properties.province_code === hovered ? 2.2 : 0.7,
          lineWidthUnits: "pixels",
          onHover: (i: { object?: unknown }) =>
            onHoverProvince(
              i.object ? (i.object as ProvinceFeature).properties.province_code : null,
            ),
          onClick: (i: { object?: unknown }) => {
            const f = i.object as ProvinceFeature | undefined;
            if (f?.properties.in_store) onPickProvince(f.properties.province_code);
          },
          updateTriggers: { getLineColor: hovered, getLineWidth: hovered },
        }),
      );
    }

    // ── lớp chồng ──────────────────────────────────────────────────────────────
    if (showPoi.size > 0 && poi && atlas) {
      const shown = poi.filter((p) => showPoi.has(p.group));
      out.push(
        new IconLayer({
          id: "vn-poi",
          data: shown,
          iconAtlas: atlas.atlasUrl,
          iconMapping: atlas.mapping,
          // Mark RỖNG ở bậc này. Ở màn hình tỉnh POI là mark đặc; ở đây 25 nghìn mark đặc
          // phủ kín hai đồng bằng và nuốt cả mặt tô bên dưới — mà mặt tô mới là trường đang
          // xem. Rỗng giữ được vị trí và hình dạng nhóm mà vẫn nhìn xuyên qua được.
          getIcon: (d: NationalPoi) => iconId(d.shape, false),
          getPosition: (d: NationalPoi) => [d.lng, d.lat],
          getSize: poiSize(zoom),
          sizeUnits: "pixels",
          getColor: [30, 30, 30, poiAlpha(zoom)] as RGBA,
          pickable: true,
          updateTriggers: { getSize: zoom, getColor: zoom },
        }),
      );
    }

    if (showStations && stations) {
      out.push(
        new ScatterplotLayer({
          id: "vn-stations",
          data: stations,
          getPosition: (d: NationalStation) => [d.lng, d.lat],
          getRadius: stationRadius(zoom),
          radiusUnits: "pixels",
          // Bán kính là hằng theo zoom — KHÔNG theo `n_ports` hay công suất (§4d-1). Cỡ
          // mark chở giá trị thì "trạm to" đọc thành "trạm quan trọng", và ở 6.380 chấm
          // chồng nhau thì diện tích cộng dồn thành một phát biểu không ai kiểm được.
          getFillColor: rgba(STATION_RGB, 210),
          stroked: false,
          pickable: true,
          updateTriggers: { getRadius: zoom },
        }),
      );
    }

    ov.setProps({
      layers: out,
      getTooltip: ({ object, layer }: { object?: unknown; layer?: { id: string } | null }) =>
        tooltip(object, layer?.id, field, rows),
    });
  }, [
    field,
    scale,
    cells,
    provinces,
    rows,
    stations,
    poi,
    showStations,
    showPoi,
    hovered,
    zoom,
    atlas,
    ready,
    onHoverProvince,
    onPickProvince,
  ]);

  // Nhảy tới khung nhìn từ ngoài (nút "về cả nước") — cùng luật với `MapView`: chỉ nhảy
  // khi lệch đáng kể, nếu không `moveend` và effect này sẽ đá nhau.
  const { lng, lat } = props.view;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    if (
      Math.abs(c.lng - lng) < 1e-4 &&
      Math.abs(c.lat - lat) < 1e-4 &&
      Math.abs(m.getZoom() - zoom) < 0.01
    )
      return;
    m.jumpTo({ center: [lng, lat], zoom });
  }, [lng, lat, zoom, ready]);

  return <div ref={container} className="h-full w-full" />;
}

function fmt(v: unknown): string {
  return typeof v === "number" ? v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "—";
}

function tooltip(
  object: unknown,
  layerId: string | undefined,
  field: NationalField,
  rows: Record<string, ProvinceRow>,
): { text: string } | null {
  if (!object) return null;
  if (layerId === "vn-stations") {
    const s = object as NationalStation;
    return {
      text: [
        s.name ?? s.station_code,
        `${s.n_ports ?? "—"} cổng · ${fmt(s.power_kw_site)} kW`,
        `${s.current_type ?? "—"} · ${s.op_status ?? "—"}`,
        rows[s.province_code]?.province_name ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  if (layerId === "vn-poi") {
    const p = object as NationalPoi;
    return {
      text: [p.name ?? "(không tên)", p.tag ?? "", rows[p.province_code]?.province_name ?? ""]
        .filter(Boolean)
        .join("\n"),
    };
  }
  if (layerId === "vn-cells") {
    const c = object as NationalCell;
    const prov = rows[c.province_code]?.province_name ?? c.province_code;
    return {
      text: `${field.label}: ${fmt(c[field.column])} ${field.unit_label}\nô gộp H3 r6 · ${prov}`,
    };
  }
  const f = object as ProvinceFeature;
  const row = rows[f.properties.province_code];
  const head = row?.province_name ?? f.properties.province_code;
  if (field.unit !== "province") return { text: `${head}\nbấm để mở bộ dữ liệu của tỉnh` };
  return {
    text: `${head}\n${field.label}: ${fmt(row?.[field.column])} ${field.unit_label}\n${
      row?.in_store ? "bấm để mở bộ dữ liệu của tỉnh" : "chưa dựng trong store"
    }`,
  };
}
