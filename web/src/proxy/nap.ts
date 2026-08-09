/**
 * NẠP MỘT FILE TỪ TRÌNH DUYỆT — cửa thứ hai vào chế độ PROXY POI.
 *
 * Cửa thứ nhất (`vn/proxy_poi.py`) cần một terminal, một checkout của repo và một lần
 * build lại: nó ghi geojson vào `web/public/data/proxy/`. Đó là cửa đúng cho vòng lặp soi
 * notebook, và là cửa SAI cho một bản đã golive — ở đó người cầm dữ liệu không có repo.
 *
 * File nạp ở đây **không bao giờ rời khỏi tab**: không upload, không ghi đĩa, không vào
 * manifest. Đổi lại, nó mất khi tải lại trang — và đó là điều PHẢI nói ra trên giao diện
 * chứ không phải một chi tiết cài đặt, vì §9 của app là "link là một lời hứa": một tập chỉ
 * sống trong RAM không được ghi khoá của nó vào hash, nếu không thì link gửi đi sẽ mở ra
 * một màn hình trống.
 *
 * ── VÌ SAO PARSE Ở ĐÂY, KHÔNG TÁI DÙNG `_feature` CỦA PYTHON ──────────────────────────
 *
 * Không tái dùng được — nhưng phải **cùng luật**, và file này giữ đúng bốn luật đó:
 *
 *   1. `lat`/`lng` là bắt buộc *hoặc* suy được từ hình học; dòng không có gì thì bị bỏ và
 *      ĐẾM vào `n_bo_qua`, không im lặng biến mất.
 *   2. `co_hinh` phân biệt "có cạnh" với "chỉ biết vị trí" — kênh thị giác duy nhất của cả
 *      màn hình này, nên nó không được đoán.
 *   3. Không suy diễn gì về nội dung bảng: mọi cột khác đi thẳng vào `properties` nguyên
 *      văn. Bảng lạ là chuyện thường ở đây, không phải lỗi.
 *   4. Toạ độ làm tròn 6 chữ số (~0,11 m) — cùng `GEO_DECIMALS` của bên python, để một tập
 *      nạp tay và một tập xuất bằng lệnh không lệch nhau ở chữ số thứ chín.
 */

import type { ProxyFeature, ProxyProps, ProxySet } from "./data";

/** 6 chữ số ≈ 0,11 m — cùng hằng với `vn/proxy_poi.GEO_DECIMALS`. */
const GEO_DECIMALS = 6;
const P = 10 ** GEO_DECIMALS;
const r6 = (n: number) => Math.round(n * P) / P;

/** Cột KHÔNG vào `properties` — hình học đã thành `geometry`, giữ lại là ship hai lần. */
const BO_COT = new Set(["geometry_wkb", "geometry", "geom", "wkb_geometry", "geometry_wkt"]);

/** Tên cột toạ độ mà một bảng thật hay dùng, xếp theo thứ tự ưu tiên khi đoán. */
const COT_LAT = ["lat", "latitude", "y", "vi_do", "vĩ độ"];
const COT_LNG = ["lng", "lon", "long", "longitude", "x", "kinh_do", "kinh độ"];

// ─────────────────────────────────────────────────────────────────────────────────────
// WKB
// ─────────────────────────────────────────────────────────────────────────────────────

/** Hình học mà proxy vẽ được — mọi thứ trừ `GeometryCollection`. */
export type Hinh =
  | GeoJSON.Point
  | GeoJSON.MultiPoint
  | GeoJSON.LineString
  | GeoJSON.MultiLineString
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon;

interface Con {
  dv: DataView;
  i: number;
}

const u8 = (c: Con) => c.dv.getUint8(c.i++);
const u32 = (c: Con, le: boolean) => {
  const v = c.dv.getUint32(c.i, le);
  c.i += 4;
  return v;
};
const f64 = (c: Con, le: boolean) => {
  const v = c.dv.getFloat64(c.i, le);
  c.i += 8;
  return v;
};

/**
 * WKB → hình học GeoJSON. Trả `null` nếu byte không đọc được. Hàm THUẦN, có test.
 *
 * Cần ở đây vì cột `geometry_wkb` là thứ CHỞ NỘI DUNG của một bảng POI: bỏ nó đi thì mọi
 * POI thành một chấm, và "một lớp toàn mark rỗng" là kết luận sai nghiêm trọng nhất mà màn
 * hình này có thể sinh ra (nó đọc thành "lớp này tuyển từ TÊN" — xem `ProxyMap`).
 *
 * Đọc được cả ba phương ngữ mà một bảng thật có thể mang, vì shapely/PostGIS/GeoPandas
 * mỗi bên ghi một kiểu và ta không kiểm soát nguồn:
 *   - WKB chuẩn OGC: mã loại 1…7;
 *   - ISO WKB: `1000*chiều + loại` (Z/M/ZM);
 *   - EWKB của PostGIS: ba bit cao mang cờ Z/M/SRID.
 * Chiều thứ ba (nếu có) bị ĐỌC RỒI BỎ — bản đồ này phẳng, và giữ lại một cao độ không ai
 * vẽ chỉ làm nặng thêm payload.
 */
export function docWKB(buf: ArrayBufferView): Hinh | null {
  try {
    const c: Con = {
      dv: new DataView(buf.buffer, buf.byteOffset, buf.byteLength),
      i: 0,
    };
    return docHinh(c);
  } catch {
    // Byte hỏng là DỮ LIỆU hỏng, không phải lỗi lập trình — cùng cách xử lý với bên
    // python (`except Exception → geom = None`): dòng đó tụt xuống hạng "chỉ biết vị trí".
    return null;
  }
}

function docHinh(c: Con): Hinh | null {
  const le = u8(c) === 1;
  const raw = u32(c, le);
  const zEw = (raw & 0x80000000) !== 0;
  const mEw = (raw & 0x40000000) !== 0;
  const srid = (raw & 0x20000000) !== 0;
  const base = raw & 0x0fffffff;
  const iso = Math.floor(base / 1000);
  const ma = base % 1000;
  // Số toạ độ mỗi điểm: 2 + Z + M, cộng từ CẢ HAI cách mã hoá.
  const nd = 2 + (zEw || iso === 1 || iso === 3 ? 1 : 0) + (mEw || iso === 2 || iso === 3 ? 1 : 0);
  if (srid) u32(c, le); // SRID đứng ngay sau mã loại; ta chỉ nhận EPSG:4326 nên bỏ qua

  const diem = (): number[] => {
    const x = f64(c, le);
    const y = f64(c, le);
    for (let k = 2; k < nd; k++) f64(c, le);
    return [r6(x), r6(y)];
  };
  const chuoi = (): number[][] => {
    const n = u32(c, le);
    const out: number[][] = [];
    for (let k = 0; k < n; k++) out.push(diem());
    return out;
  };
  const vanh = (): number[][][] => {
    const n = u32(c, le);
    const out: number[][][] = [];
    for (let k = 0; k < n; k++) out.push(chuoi());
    return out;
  };
  /** Phần tử của một Multi* mang HEADER RIÊNG (byte order + mã loại) — phải đệ quy. */
  const con = <T,>(lay: (h: Hinh) => T | null): T[] => {
    const n = u32(c, le);
    const out: T[] = [];
    for (let k = 0; k < n; k++) {
      const h = docHinh(c);
      const v = h && lay(h);
      if (v) out.push(v);
    }
    return out;
  };

  switch (ma) {
    case 1:
      return { type: "Point", coordinates: diem() };
    case 2:
      return { type: "LineString", coordinates: chuoi() };
    case 3:
      return { type: "Polygon", coordinates: vanh() };
    case 4:
      return {
        type: "MultiPoint",
        coordinates: con((h) => (h.type === "Point" ? h.coordinates : null)),
      };
    case 5:
      return {
        type: "MultiLineString",
        coordinates: con((h) => (h.type === "LineString" ? h.coordinates : null)),
      };
    case 6:
      return {
        type: "MultiPolygon",
        coordinates: con((h) => (h.type === "Polygon" ? h.coordinates : null)),
      };
    default:
      // `GeometryCollection` (7) và mọi mã lạ: KHÔNG đoán. Một POI là một vật thể, và một
      // bảng POI mà dòng nào cũng là một bộ sưu tập hình là một bảng chưa gộp xong — nói
      // "chỉ biết vị trí" thì thật hơn là chọn bừa một hình con làm đại diện.
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// WKT — đối ứng text của WKB, cho những bảng xuất bằng `shapely.to_wkt` thay vì WKB
// ─────────────────────────────────────────────────────────────────────────────────────

interface Cur2 {
  s: string;
  i: number;
}

const skipWs = (c: Cur2) => {
  while (c.s[c.i] === " ") c.i++;
};
const espere = (c: Cur2, ch: string) => {
  skipWs(c);
  if (c.s[c.i] !== ch) throw new Error(`WKT hỏng: cần "${ch}" ở vị trí ${c.i}`);
  c.i++;
};
const docSo = (c: Cur2): number => {
  skipWs(c);
  const dau = c.i;
  while (c.i < c.s.length && /[-+0-9.eE]/.test(c.s[c.i] ?? "")) c.i++;
  return Number(c.s.slice(dau, c.i));
};
const docDiem = (c: Cur2): number[] => {
  const x = docSo(c);
  const y = docSo(c);
  skipWs(c);
  while (c.s[c.i] && !/[,)]/.test(c.s[c.i] ?? "")) docSo(c); // Z/M — đọc rồi bỏ, cùng luật WKB
  return [r6(x), r6(y)];
};
const docDsDiem = (c: Cur2): number[][] => {
  espere(c, "(");
  const out: number[][] = [];
  skipWs(c);
  if (c.s[c.i] !== ")") {
    out.push(docDiem(c));
    skipWs(c);
    while (c.s[c.i] === ",") {
      c.i++;
      out.push(docDiem(c));
      skipWs(c);
    }
  }
  espere(c, ")");
  return out;
};
const docDsVanh = (c: Cur2): number[][][] => {
  espere(c, "(");
  const out: number[][][] = [docDsDiem(c)];
  skipWs(c);
  while (c.s[c.i] === ",") {
    c.i++;
    out.push(docDsDiem(c));
    skipWs(c);
  }
  espere(c, ")");
  return out;
};

/**
 * WKT → hình học GeoJSON. Trả `null` nếu văn bản không đọc được. Hàm THUẦN, có test.
 *
 * Đối ứng `docWKB` cho những bảng ghi hình học dạng chữ (``geometry_wkt``, ví dụ export từ
 * ``shapely.to_wkt``) thay vì nhị phân — cùng bốn loại POINT/LINESTRING/POLYGON và ba biến
 * thể MULTI*; ``GEOMETRYCOLLECTION`` và mã lạ trả `null`, cùng lý do với WKB: không đoán.
 */
export function docWKT(text: string): Hinh | null {
  try {
    const s = text.trim();
    const upper = s.toUpperCase();
    const loai = ["MULTIPOLYGON", "MULTILINESTRING", "MULTIPOINT", "LINESTRING", "POLYGON", "POINT"].find(
      (t) => upper.startsWith(t),
    );
    if (!loai) return null;
    let i = loai.length;
    while (i < s.length && s[i] !== "(") i++; // bỏ hậu tố Z/M/EMPTY và khoảng trắng
    const c: Cur2 = { s, i };
    switch (loai) {
      case "POINT": {
        espere(c, "(");
        const p = docDiem(c);
        skipWs(c);
        espere(c, ")");
        return { type: "Point", coordinates: p };
      }
      case "LINESTRING":
        return { type: "LineString", coordinates: docDsDiem(c) };
      case "POLYGON":
        return { type: "Polygon", coordinates: docDsVanh(c) };
      case "MULTIPOINT": {
        espere(c, "(");
        const out: number[][] = [];
        const docMot = (): number[] => {
          skipWs(c);
          if (c.s[c.i] === "(") {
            c.i++;
            const p = docDiem(c);
            skipWs(c);
            espere(c, ")");
            return p;
          }
          return docDiem(c);
        };
        skipWs(c);
        if (c.s[c.i] !== ")") {
          out.push(docMot());
          skipWs(c);
          while (c.s[c.i] === ",") {
            c.i++;
            out.push(docMot());
            skipWs(c);
          }
        }
        espere(c, ")");
        return { type: "MultiPoint", coordinates: out };
      }
      case "MULTILINESTRING":
        return { type: "MultiLineString", coordinates: docDsVanh(c) };
      case "MULTIPOLYGON": {
        espere(c, "(");
        const out: number[][][][] = [docDsVanh(c)];
        skipWs(c);
        while (c.s[c.i] === ",") {
          c.i++;
          out.push(docDsVanh(c));
          skipWs(c);
        }
        espere(c, ")");
        return { type: "MultiPolygon", coordinates: out };
      }
      default:
        return null;
    }
  } catch {
    return null; // WKT hỏng là dữ liệu hỏng — cùng cách xử lý với `docWKB`
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Một dòng / một feature → ProxyFeature
// ─────────────────────────────────────────────────────────────────────────────────────

/** Hình học có CẠNH (đọc được diện tích) hay chỉ là vị trí. Hàm THUẦN, có test. */
export function coHinh(g: { type: string } | null | undefined): boolean {
  return !!g && g.type !== "Point" && g.type !== "MultiPoint";
}

/**
 * Một ô bất kỳ → giá trị in được. Hàm THUẦN, có test. Đối ứng của `_sach` bên python.
 *
 * `bigint` là chỗ khác biệt duy nhất so với bản python và nó BẮT BUỘC phải có: Arrow trả
 * `INT64` (mọi `osm_id`) về dạng `bigint`, và `JSON.stringify` ném `TypeError` trên bigint
 * — tức là cả một tập 10 nghìn dòng chết vì một cột id. Số vượt ngưỡng an toàn của
 * `Number` giữ nguyên dạng CHUỖI chứ không ép về `Number`: `osm_id` là khoá để copy đi tra
 * cứu, làm tròn nó là làm hỏng nó trong im lặng.
 */
export function sach(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") {
    return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(v)
      : v.toString();
  }
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return null; // cột nhị phân lạ
  return String(v);
}

/** Điểm đại diện của một hình — bbox tâm. Hàm THUẦN, có test.
 *
 * Tâm BBOX chứ không phải trọng tâm đa giác: nó rẻ, nó không cần một thư viện hình học, và
 * việc duy nhất nó phục vụ là "bay tới POI này" — một camera lệch vài mét không ai thấy.
 * (Bên python không cần hàm này vì bảng parquet đã có sẵn cột `lat`/`lng`; một GeoJSON thả
 * vào thì thường KHÔNG có.)
 */
export function tamHinh(g: Hinh): [number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const di = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [x, y] = c as [number, number];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
      return;
    }
    for (const x of c) di(x);
  };
  di(g.coordinates);
  return Number.isFinite(w) ? [r6((w + e) / 2), r6((s + n) / 2)] : null;
}

/** Đọc `lat`/`lng` từ một dòng, chấp nhận vài tên cột thay thế. Hàm THUẦN, có test. */
export function toaDo(row: Record<string, unknown>): { lat: number; lng: number } | null {
  const lay = (ten: string[]): number | null => {
    for (const k of ten) {
      const v = sach(row[k]);
      if (typeof v === "number") return v;
      // Cột toạ độ đọc từ CSV/JSON hay về dạng chuỗi — "21,03" (dấu phẩy thập phân của
      // vi-VN) cũng phải đọc được, nếu không cả tập rơi vào `n_bo_qua` mà không ai hiểu vì sao.
      if (typeof v === "string" && v.trim()) {
        const f = Number(v.trim().replace(",", "."));
        if (Number.isFinite(f)) return f;
      }
    }
    return null;
  };
  const lat = lay(COT_LAT);
  const lng = lay(COT_LNG);
  return lat === null || lng === null ? null : { lat, lng };
}

/**
 * Một dòng bảng (parquet) → một feature. `null` nếu dòng không định vị được. Hàm THUẦN.
 *
 * Đối ứng 1-1 của `_feature` bên python, kể cả thứ tự ưu tiên: hình học THẬT thắng, điểm
 * là phương án lui, và `co_hinh` nói ra ta đang nhìn cái nào.
 */
export function tuHang(row: Record<string, unknown>): ProxyFeature | null {
  let geom: Hinh | null = null;
  for (const k of BO_COT) {
    const v = row[k];
    if (v && ArrayBuffer.isView(v)) {
      geom = docWKB(v);
      if (geom) break;
    }
  }
  if (!geom && typeof row["geometry_wkt"] === "string") {
    geom = docWKT(row["geometry_wkt"]);
  }
  const xy = toaDo(row);
  const co = coHinh(geom);
  if (!geom) {
    if (!xy) return null;
    geom = { type: "Point", coordinates: [r6(xy.lng), r6(xy.lat)] };
  }
  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(row)) {
    if (BO_COT.has(k)) continue;
    const s = sach(v);
    if (s !== null) props[k] = s;
  }
  props["co_hinh"] = co;
  const c = xy ? ([xy.lng, xy.lat] as [number, number]) : tamHinh(geom);
  if (c) {
    props["lng"] = r6(c[0]);
    props["lat"] = r6(c[1]);
  }
  return { type: "Feature", geometry: geom as ProxyFeature["geometry"], properties: props as ProxyProps };
}

/** Một Feature GeoJSON lạ → feature của proxy. `null` nếu không định vị được. Hàm THUẦN. */
export function tuFeature(raw: unknown): ProxyFeature | null {
  const f = raw as { geometry?: Hinh; properties?: Record<string, unknown> } | null;
  const g = f?.geometry;
  if (!g || typeof g.type !== "string" || !("coordinates" in g)) return null;
  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(f.properties ?? {})) {
    if (BO_COT.has(k)) continue;
    const s = sach(v);
    if (s !== null) props[k] = s;
  }
  props["co_hinh"] = coHinh(g);
  // Toạ độ trong PROPERTIES thắng toạ độ suy từ hình: nếu bảng gốc có cột `lat`/`lng` thì
  // đó là điểm mà người dựng bảng đã chọn làm đại diện (thường là trọng tâm thật), còn tâm
  // bbox chỉ là phương án khi không có gì.
  const xy = toaDo(f.properties ?? {});
  const c = xy ? ([xy.lng, xy.lat] as [number, number]) : tamHinh(g);
  if (c) {
    props["lng"] = r6(c[0]);
    props["lat"] = r6(c[1]);
  } else {
    // Không đọc được một toạ độ nào từ hình học ⇒ hình rỗng hoặc toạ độ NaN. Không có gì
    // để vẽ và không có gì để bay tới; bỏ dòng, và `n_bo_qua` sẽ nói ra là đã bỏ mấy dòng.
    return null;
  }
  return { type: "Feature", geometry: g as ProxyFeature["geometry"], properties: props as ProxyProps };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// GeoJSON
// ─────────────────────────────────────────────────────────────────────────────────────

export interface KetQuaNap {
  feats: ProxyFeature[];
  /** dòng có mặt trong file nhưng không định vị được — hiện lên panel, không im lặng bỏ */
  n_bo_qua: number;
  /** tên cột theo thứ tự GẶP ĐẦU TIÊN, không phải thứ tự `Object.keys` của dòng cuối */
  cot: string[];
}

/**
 * Văn bản GeoJSON → tập feature. NÉM lỗi có nội dung hành động được.
 *
 * Mọi câu lỗi ở đây nói ra *cái gì sai ở file của bạn*, không phải *cái gì sai bên trong
 * app*: người thả file vào đây thường là người cầm dữ liệu chứ không phải người viết web,
 * và "Unexpected token < in JSON" thì không ai làm gì được với nó.
 *
 * Nhận cả `FeatureCollection`, một mảng Feature trần, và MỘT Feature đơn lẻ — ba dạng mà
 * một file xuất tay đều có thể có, và phân biệt chúng không phải việc của người dùng.
 */
export function docGeoJSON(text: string): KetQuaNap {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("File này không phải JSON hợp lệ — kiểm tra xem có phải .geojson không.");
  }
  const o = j as { type?: string; features?: unknown[] };
  const raw = Array.isArray(j)
    ? j
    : o?.type === "FeatureCollection"
      ? (o.features ?? [])
      : o?.type === "Feature"
        ? [j]
        : null;
  if (!raw) {
    throw new Error(
      `Không thấy feature nào: cần một FeatureCollection, nhận được "${o?.type ?? typeof j}".`,
    );
  }
  if (!raw.length) throw new Error("File hợp lệ nhưng RỖNG — không có feature nào để vẽ.");
  return gom(raw.map(tuFeature), raw.length);
}

/** Gom kết quả parse — dùng chung cho cả đường GeoJSON lẫn đường parquet. */
export function gom(kq: (ProxyFeature | null)[], nGoc: number): KetQuaNap {
  const feats = kq.filter((f): f is ProxyFeature => f !== null);
  if (!feats.length) {
    throw new Error(
      `${nGoc} dòng nhưng KHÔNG dòng nào định vị được — cần cột lat/lng, hoặc hình học trong file.`,
    );
  }
  const cot: string[] = [];
  const thay = new Set<string>();
  for (const f of feats) {
    for (const k of Object.keys(f.properties)) {
      if (!thay.has(k)) {
        thay.add(k);
        cot.push(k);
      }
    }
  }
  return { feats, n_bo_qua: nGoc - feats.length, cot };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Tóm tắt → một mục giống hệt manifest
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Khoá duy nhất cho một tập nạp tay. Hàm THUẦN, có test.
 *
 * Thả hai lần cùng một file là chuyện thường (sửa file rồi thả lại), và tập thứ hai phải
 * **thay** tập thứ nhất chứ không đứng cạnh nó — nếu không, bộ chọn đầy những dòng trùng
 * tên mà không cách nào biết cái nào mới. Vì thế: cùng tên file ⇒ cùng khoá, và người gọi
 * ghi đè. Chỉ khi khoá đó đã thuộc về một tập XUẤT BẰNG LỆNH thì mới thêm hậu tố — tập
 * trên đĩa là tập đã kiểm, một file thả tay không được phép che nó.
 */
export function khoaNap(tenFile: string, dangCo: Iterable<string>): string {
  const goc = tenFile.replace(/\.[a-z0-9]+$/i, "") || "tap";
  const co = new Set(dangCo);
  if (!co.has(goc)) return goc;
  for (let i = 2; ; i++) if (!co.has(`${goc}-${i}`)) return `${goc}-${i}`;
}

/**
 * Bookmark camera theo `province_name` — THUẦN NAVIGATION, đối ứng `_diem_nhay` bên python.
 * Bảng không có cột đó thì danh sách rỗng và bộ chọn không hiện. Không phải một phép tính
 * về tỉnh và không được đọc như vậy.
 */
export function diemNhay(feats: readonly ProxyFeature[]): ProxySet["diem_nhay"] {
  const theo = new Map<string, { n: number; b: [number, number, number, number] }>();
  for (const f of feats) {
    const ten = f.properties["province_name"];
    const { lat, lng } = f.properties;
    if (typeof ten !== "string" || typeof lat !== "number" || typeof lng !== "number") continue;
    const cu = theo.get(ten);
    if (!cu) theo.set(ten, { n: 1, b: [lng, lat, lng, lat] });
    else {
      cu.n++;
      cu.b = [
        Math.min(cu.b[0], lng),
        Math.min(cu.b[1], lat),
        Math.max(cu.b[2], lng),
        Math.max(cu.b[3], lat),
      ];
    }
  }
  return [...theo]
    .map(([ten, v]) => ({ ten, n: v.n, bbox: v.b }))
    .sort((a, b) => b.n - a.n);
}

export interface DauVaoTomTat {
  key: string;
  /** tên file gốc — chỗ DUY NHẤT nói tập này *là* cái gì */
  nguon: string;
  bytes: number;
  kq: KetQuaNap;
  /** ISO UTC, truyền vào để hàm giữ được tính THUẦN (có test) */
  luc: string;
}

/**
 * Một tập nạp tay → đúng khuôn `ProxySet` của manifest, cộng cờ `tam`.
 *
 * Cùng khuôn là chủ ý: panel "TẬP NÀY LÀ GÌ", bộ chọn TẬP và danh sách "BAY TỚI" không cần
 * biết tập đến từ đâu, và **không nên** biết — một nhánh `if (tam)` ở mỗi chỗ hiển thị là
 * ba chỗ để hai loại tập từ từ trôi ra khác nhau. Thứ duy nhất khác là `file: ""`, và
 * `laTam()` là cổng duy nhất đọc điều đó.
 *
 * `bbox` tính từ `lat`/`lng` của feature, KHÔNG từ vành đa giác — đúng như `_bbox` bên
 * python: một polygon lỗi trải nửa nước Lào sẽ kéo camera ra khỏi dữ liệu thật.
 */
export function tomTat(d: DauVaoTomTat): ProxySet {
  const { feats } = d.kq;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  let nHinh = 0;
  for (const f of feats) {
    if (f.properties.co_hinh) nHinh++;
    const { lat, lng } = f.properties;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return {
    key: d.key,
    file: "",
    tam: true,
    nguon: d.nguon,
    n: feats.length,
    n_bo_qua: d.kq.n_bo_qua,
    n_hinh: nHinh,
    bytes: d.bytes,
    // Cả nước làm phương án lui — thà rộng còn hơn bay ra Đại Tây Dương (cùng `_bbox`).
    bbox: Number.isFinite(w) ? [w, s, e, n] : [102.1, 8.4, 109.5, 23.4],
    cot: d.kq.cot.filter((c) => c !== "co_hinh"),
    diem_nhay: diemNhay(feats),
    xuat_utc: d.luc,
  };
}

/**
 * Một `Date` → ĐÚNG khuôn `xuat_utc` của manifest. Hàm THUẦN, có test.
 *
 * `datetime.now(UTC).isoformat(timespec="seconds")` bên python cho
 * `2026-08-09T01:57:09+00:00`, còn `toISOString()` cho `2026-08-09T01:57:09.189Z`. Hai
 * chuỗi này đi vào CÙNG MỘT ô của panel, và ô đó in bằng một cặp `replace` khớp đúng khuôn
 * python — nên một tập nạp tay in ra `01:57:09.189Z` giữa những dòng `22:05:28 UTC`. Không
 * phải một lỗi nặng, nhưng nó là loại chi tiết nói với người xem rằng hai loại tập này là
 * hai thứ khác nhau, đúng lúc cả thiết kế đang cố nói ngược lại.
 */
export function gioUtc(d: Date): string {
  return `${d.toISOString().slice(0, 19)}+00:00`;
}

/** Tập này chỉ sống trong tab hay có file trên đĩa. Cổng DUY NHẤT đọc `tam`. */
export const laTam = (s: Pick<ProxySet, "tam">): boolean => s.tam === true;
