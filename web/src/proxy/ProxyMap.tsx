/**
 * Bản đồ của chế độ PROXY POI — MapLibre + deck.gl interleaved, cùng khuôn với `MapView`
 * và `NationalMap`, và là một component RIÊNG vì đúng lý do đã viết ở `NationalMap`:
 * `MapView` nhận 12 prop của bậc tỉnh và đọc `useStore` ở chín chỗ.
 *
 * ── MỘT MÀU, HAI HÌNH ─────────────────────────────────────────────────────────────────
 *
 * Màn hình này cố ý **không** tô màu theo `lop`. Không phải vì lười: một thang màu theo
 * lớp nói rằng "lớp" đã là một kết luận, mà đây đúng là chỗ để soi xem kết luận đó có
 * đúng không. Mọi POI vì thế là **một màu lạnh** — cùng `#1c5cab` của lớp POI ở bản đồ
 * chính (§4d-4).
 *
 * Thứ DUY NHẤT phân biệt được trên bản đồ là **có hình hay không**: đặc = có polygon thật
 * (nhìn được cạnh, đọc được diện tích), rỗng = chỉ biết vị trí. Cùng luật §4d với lớp POI
 * gốc, và ở đây nó chở nhiều thông tin hơn bình thường: một lớp toàn mark rỗng là một lớp
 * tuyển từ TÊN, và điều đó phải nhìn thấy được trước khi đọc bất kỳ con số nào.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

import { loadStyle } from "../map/positron";
import { COLD_RGB, type RGB } from "../viz/palette";
import type { ProxyFeature } from "./data";

type RGBA = [number, number, number, number];
const rgba = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], a];

/** Một màu lạnh cho MỌI POI — xem docstring. */
const POI_RGB: RGB = COLD_RGB[1]!; // #1c5cab
/** Mực của POI đang chọn — gần đen, và nó là thứ DUY NHẤT khác màu trên màn hình này. */
const SEL_RGB: RGB = [17, 17, 17];

export interface FitRequest {
  bbox: [number, number, number, number];
  /** tăng mỗi lần yêu cầu — cùng bbox bấm hai lần vẫn phải bay lại */
  nonce: number;
}

export interface ProxyMapProps {
  feats: ProxyFeature[];
  selected: ProxyFeature | null;
  onSelect: (f: ProxyFeature | null) => void;
  onHover: (f: ProxyFeature | null) => void;
  fit: FitRequest | null;
  /** vẽ cả POI chỉ-điểm (mark rỗng) hay chỉ vẽ POI có polygon */
  showPoints: boolean;
}

/**
 * Bán kính mark của POI chỉ-điểm, theo ZOOM — hằng số theo mức phóng, không bao giờ theo
 * một giá trị của dòng (§4d-1). Cùng dải với `poiIconSize` của bản đồ chính.
 */
function pointRadius(zoom: number): number {
  return zoom <= 8 ? 2.5 : zoom >= 15 ? 7 : 2.5 + ((zoom - 8) / 7) * 4.5;
}

const isPoint = (f: ProxyFeature) => f.geometry.type === "Point";

export function ProxyMap(props: ProxyMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(9);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let cancelled = false;

    void loadStyle().then((style) => {
      if (cancelled || !container.current) return;
      const m = new maplibregl.Map({
        container: el,
        style,
        center: [105.84, 21.0],
        zoom: 8,
        attributionControl: { compact: true },
      });
      map.current = m;
      m.on("zoomend", () => setZoom(m.getZoom()));
      const ov = new MapboxOverlay({ interleaved: true, layers: [] });
      overlay.current = ov;
      m.addControl(ov);
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      overlay.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Bay tới một bbox. `fitBounds` của MapLibre chứ không phải một phép tính zoom của ta:
  // camera là của MapLibre ở chế độ interleaved, và tự tính zoom rồi `setCenter` là dựng
  // một nguồn sự thật thứ hai cho cùng một thứ.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !props.fit) return;
    const [w, s, e, n] = props.fit.bbox;
    m.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 60, duration: 700, maxZoom: 16 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fit?.nonce, ready]);

  const { feats, selected, onSelect, onHover, showPoints } = props;

  useEffect(() => {
    const ov = overlay.current;
    if (!ov) return;

    const polys = feats.filter((f) => !isPoint(f));
    const points = showPoints ? feats.filter(isPoint) : [];
    const r = pointRadius(zoom);
    const pick = (i: { object?: unknown }) => onSelect((i.object as ProxyFeature) ?? null);
    const hover = (i: { object?: unknown }) => onHover((i.object as ProxyFeature) ?? null);

    const out: Layer[] = [
      new GeoJsonLayer({
        id: "proxy-poly",
        data: polys,
        filled: true,
        stroked: true,
        pickable: true,
        // Nền mờ + nét đậm: ở mức phóng của một khu đô thị, hàng trăm polygon chồng nhau,
        // và một mặt tô đặc biến cả cụm thành một vệt liền — nét là thứ giữ được RANH GIỚI
        // từng vật thể, mà ranh giới mới là cái đang cần soi.
        getFillColor: rgba(POI_RGB, 46),
        getLineColor: rgba(POI_RGB, 230),
        getLineWidth: 1.4,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        onClick: pick,
        onHover: hover,
      }),
      new ScatterplotLayer<ProxyFeature>({
        id: "proxy-point",
        data: points,
        getPosition: (d) => (d.geometry as GeoJSON.Point).coordinates as [number, number],
        // RỖNG — chỉ biết vị trí. Xem docstring: đây là kênh mang thông tin, không phải
        // một lựa chọn thẩm mỹ.
        filled: false,
        stroked: true,
        radiusUnits: "pixels",
        getRadius: r,
        lineWidthUnits: "pixels",
        getLineWidth: 1.4,
        getLineColor: rgba(POI_RGB, 235),
        pickable: true,
        onClick: pick,
        onHover: hover,
        updateTriggers: { getRadius: r },
      }),
    ];

    // POI đang chọn — vẽ ĐÈ bằng mực gần đen. Một lớp riêng chứ không phải một accessor màu
    // trên hai lớp trên: accessor buộc cả 10 nghìn mark render lại mỗi lần bấm một dòng,
    // và nó vẫn không giải quyết được chuyện mark được chọn phải nằm TRÊN các mark khác.
    if (selected) {
      out.push(
        new GeoJsonLayer({
          id: "proxy-selected",
          data: [selected],
          filled: true,
          stroked: true,
          // Điểm không có "trong": tô nó là vẽ một đĩa đặc ở chỗ mà cả màn hình đang nói
          // "chưa biết cạnh ở đâu". Giữ rỗng, chỉ đổi mực.
          getFillColor: isPoint(selected) ? [0, 0, 0, 0] : rgba(SEL_RGB, 40),
          getLineColor: rgba(SEL_RGB, 255),
          getLineWidth: 2.4,
          lineWidthUnits: "pixels",
          pointType: "circle",
          pointRadiusUnits: "pixels",
          getPointRadius: r + 3,
        }),
      );
    }

    ov.setProps({ layers: out });
  }, [feats, selected, showPoints, zoom, onSelect, onHover, ready]);

  // `h-full w-full`, KHÔNG phải `absolute inset-0`: CSS của maplibre đặt
  // `.maplibregl-map { position: relative }` và nó thắng utility `absolute` của Tailwind,
  // nên `inset-0` mất tác dụng và div cao 0 px — bản đồ trắng trơn, không một lỗi nào.
  // Đo được đúng như thế ở lần dựng đầu. Cùng khuôn với `MapView` và `NationalMap`.
  return <div ref={container} className="h-full w-full" />;
}
