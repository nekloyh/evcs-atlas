/**
 * Nạp dữ liệu cho chế độ PROXY POI — `data/proxy/manifest.json` + một GeoJSON mỗi tập.
 *
 * Không đi qua DuckDB, và đó là quyết định chính của file này. Ba lý do, theo thứ tự
 * quan trọng:
 *
 *  1. **Tập ở đây đổi CỘT mỗi lần chạy lại notebook.** `queries.ts` biết trước tên cột vì
 *     lưới r8 có schema; ở đây `b2` có 33 cột và `b3` có 43. Một đường đọc phải khai cột
 *     là một đường đọc hỏng ở lần lặp thứ hai.
 *  2. **Hình học là nội dung chính**, không phải một cột phụ. Đúng cái người xem cần thấy
 *     là "polygon này có phải một toà không" — GeoJSON là định dạng mà cả deck.gl lẫn mắt
 *     đọc thẳng được.
 *  3. Bảng 10 nghìn dòng nạp trọn vào RAM một lần rồi thôi; không có truy vấn nào ở màn
 *     hình này để mà cần một engine.
 */

import { PROXY_DIR } from "../data/province";

/** Bookmark camera của một cụm — thuần navigation, xem `_diem_nhay` ở `vn/proxy_poi.py`. */
export interface DiemNhay {
  ten: string;
  n: number;
  bbox: [number, number, number, number];
}

/** Một tập đã xuất. Mọi con số đến từ lúc export — không TS nào tính lại (ràng buộc 4). */
export interface ProxySet {
  key: string;
  /** tên geojson trong `data/proxy/` — **chuỗi rỗng** với tập nạp tay (`tam`) */
  file: string;
  /**
   * Tập này chỉ sống trong TAB, không có file trên đĩa và không có trong manifest — nó
   * đến từ một file người dùng thả vào (`nap.ts`). Không bao giờ có trong JSON của
   * manifest; đọc qua `laTam()` chứ đừng so `file === ""` ở từng chỗ.
   */
  tam?: true;
  /** đường dẫn parquet gốc — chỗ duy nhất nói tập này *là* cái gì */
  nguon: string;
  n: number;
  /** dòng không có toạ độ nào dùng được, đã bị bỏ lúc export */
  n_bo_qua: number;
  /** số POI có hình học thật (polygon); phần còn lại chỉ biết vị trí */
  n_hinh: number;
  bytes: number;
  bbox: [number, number, number, number];
  cot: string[];
  diem_nhay: DiemNhay[];
  xuat_utc: string;
}

export interface ProxyManifest {
  xuat_utc: string;
  tap: ProxySet[];
}

export type ProxyProps = Record<string, string | number | boolean> & {
  co_hinh: boolean;
  lat?: number;
  lng?: number;
};

export interface ProxyFeature {
  type: "Feature";
  // MultiPoint/MultiLineString có mặt vì đường NẠP TAY đọc WKB thẳng từ file người dùng và
  // không có shapely đứng giữa để chuẩn hoá — một bảng thật có đủ bảy mã WKB.
  geometry:
    | GeoJSON.Point
    | GeoJSON.MultiPoint
    | GeoJSON.LineString
    | GeoJSON.MultiLineString
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon;
  properties: ProxyProps;
}

const url = (name: string) => new URL(`data/${PROXY_DIR}/${name}`, window.location.href).toString();

/**
 * Manifest của proxy. Ném một câu CHỈ RA LỆNH PHẢI CHẠY khi chưa có gì — chế độ này chỉ
 * tồn tại vì một lệnh ở terminal, nên "chưa chạy lệnh đó" là trạng thái thường gặp nhất
 * và nó phải tự giải thích được.
 */
let manCache: Promise<ProxyManifest> | null = null;

export function loadProxyManifest(): Promise<ProxyManifest> {
  // CACHE, cùng khuôn `loadProvinceIndex`. Không phải để tiết kiệm một request 10 KB: dưới
  // StrictMode effect chạy hai lần, hai promise về ở hai thời điểm, và handler của chúng
  // ĐẶT tập đang xem. Cái về sau ghi đè lựa chọn của người dùng — đã đo: thả một file vào
  // trong lúc lần fetch thứ hai còn bay, và màn hình lặng lẽ quay về tập cũ.
  manCache ??= fetch(url("manifest.json")).then((r) => {
    if (!r.ok) {
      throw new Error(
        "Chưa có tập nào xuất sẵn trên đĩa. Thả một file vào cửa sổ này, hoặc chạy:" +
          "  make poi-proxy SRC=data/qa/eda/poi_chungcu_7tinh.parquet",
      );
    }
    return r.json() as Promise<ProxyManifest>;
  });
  return manCache;
}

export async function loadProxySet(s: ProxySet): Promise<ProxyFeature[]> {
  const r = await fetch(url(s.file));
  if (!r.ok) throw new Error(`Không nạp được ${s.file}: HTTP ${r.status} — xuất lại tập này?`);
  const fc = (await r.json()) as { features: ProxyFeature[] };
  return fc.features;
}

/**
 * Cột nào đáng in LÊN ĐẦU panel — hàm THUẦN, có test.
 *
 * Panel in *mọi* thuộc tính (đó là điểm của một proxy soi dữ liệu), nhưng thứ tự thì không
 * được để `Object.keys` quyết định: thứ tự đó là thứ tự cột của parquet, và cột đầu tiên
 * của mọi bảng POI là `osm_type` — thứ không ai nhìn. Bốn khoá dưới đây là bốn câu hỏi đầu
 * tiên khi soi một dòng ("nó tên gì, nó thuộc lớp nào, nó ở tỉnh nào, nó to bằng nào"),
 * và chúng đứng trước; phần còn lại giữ nguyên thứ tự gốc.
 */
export const KHOA_UU_TIEN = ["name", "lop", "province_name", "area_m2"] as const;

/** Khoá KHÔNG in ra panel: hoặc đã hiện ở chỗ khác, hoặc là chi tiết của chính proxy. */
const KHOA_AN = new Set(["co_hinh", "lat", "lng", "ten_chuan"]);

export function sapKhoa(props: Record<string, unknown>): string[] {
  const co = Object.keys(props).filter((k) => !KHOA_AN.has(k));
  const uu = KHOA_UU_TIEN.filter((k) => co.includes(k));
  return [...uu, ...co.filter((k) => !uu.includes(k as (typeof KHOA_UU_TIEN)[number]))];
}

/**
 * Bbox của một tập feature đang lọc — hàm THUẦN, có test.
 *
 * Trả `null` cho tập rỗng chứ không trả một bbox mặc định: "không có POI nào khớp" phải
 * dừng camera lại, không được bay tới một khung nhìn bịa rồi để người xem tưởng mình đang
 * nhìn đúng chỗ mà chỗ đó trống.
 */
export function bboxOf(
  feats: readonly { properties: { lat?: number; lng?: number } }[],
): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const f of feats) {
    const { lat, lng } = f.properties;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * Hạ chữ + BỎ DẤU tiếng Việt — hàm THUẦN, có test.
 *
 * Cùng phép chuẩn hoá mà notebook dùng để dựng `ten_chuan` (`bo_dau`), và nó phải có mặt
 * ở đây vì cùng một lý do: người gõ ô lọc gõ "ngo gia tu", còn dữ liệu ghi "Ngô Gia Tự".
 * Một bộ lọc phân biệt dấu sẽ trả về 0 dòng, và "0 dòng" ở màn hình này đọc thành **luật
 * đã sạch** — đúng kiểu sai im lặng mà một công cụ soi lỗi không được phép mắc.
 *
 * `đ`/`Đ` xử lý riêng: NFD không tách được gạch ngang của nó.
 */
export function boDau(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Khoá KHÔNG vào chỉ mục lọc: cờ nội bộ của proxy, gõ "true" không được quét cả tập. */
const KHOA_NGOAI_CHI_MUC = new Set(["co_hinh"]);

/**
 * Chuỗi tra cứu của MỘT feature — mọi thuộc tính nối lại, đã bỏ dấu. Hàm THUẦN, có test.
 *
 * Dựng MỘT lần cho mỗi tập (không phải mỗi lần gõ): 10 nghìn feature × ~30 cột là ~300
 * nghìn phép chuẩn hoá, làm lại ở từng ký tự thì ô lọc giật thấy được.
 *
 * Quét mọi cột chứ không riêng `name`, vì ở một proxy soi luật câu hỏi hay gặp nhất là
 * "cho tôi xem những dòng có `highway=bus_stop`" — và cột đó khác nhau ở mỗi tập.
 */
export function chiMuc(f: { properties: Record<string, unknown> }): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(f.properties)) {
    if (v === null || v === undefined || KHOA_NGOAI_CHI_MUC.has(k)) continue;
    parts.push(String(v));
  }
  return boDau(parts.join("  "));
}

/**
 * Một dòng chỉ mục có khớp chuỗi đang gõ không. Hàm THUẦN, có test.
 *
 * Không có cú pháp nào cả — một proxy không đáng một ngôn ngữ truy vấn. Chuỗi rỗng giữ
 * lại mọi dòng.
 */
export function khop(doc: string, q: string): boolean {
  const t = boDau(q.trim());
  return t === "" || doc.includes(t);
}

/**
 * Một giá trị thuộc tính → chuỗi in ra panel. Hàm THUẦN, có test.
 *
 * Số NGUYÊN in nguyên văn, số THỰC làm tròn 2 chữ số và có phân nhóm hàng nghìn. Hai luật
 * khác nhau vì hai loại số ở đây phục vụ hai việc khác nhau: `osm_id = 1503681357` là một
 * **khoá để copy đi tra cứu** (chấm phân nhóm làm hỏng nó), còn `area_m2 =
 * 104567.05876407165` là một **đại lượng đo** — 11 chữ số thập phân của nó là nhiễu của
 * phép chiếu, và in ra đủ chỉ khiến mắt phải đếm chữ số để so hai dòng.
 */
export function inGiaTri(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)) {
    return v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  }
  return String(v);
}
