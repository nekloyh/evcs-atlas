/**
 * Nhận dạng **đối tượng đang chọn** — khoá `c` của hash, DESIGN.md §9 và M2.1-A.
 *
 * Khoá `c` mang MỘT đối tượng: một ô, hoặc một xã. Không phải hai khoá, vì rail chỉ có
 * một vùng chi tiết — hai khoá thì trạng thái "chọn cả ô lẫn xã" biểu diễn được, và ta sẽ
 * phải viết luật cấm nó. Một khoá thì trạng thái sai không tồn tại.
 *
 * Ở file riêng, không ở `queries.ts`, vì `hash.ts` cần nó mà `queries.ts` kéo theo cả
 * `duckdb.ts` — file đó import `.wasm?url` của Vite, thứ Node không giải được. Không tách
 * thì `hash.ts` không test được bằng `node:test`, và §12 nói logic thuần thì phải có test.
 */

/** Mã H3 r8 là 15 ký tự hex CHỮ THƯỜNG. Kiểm trước khi nhét vào SQL — hash là dữ liệu lạ. */
export const H3_RE = /^[0-9a-f]{15}$/;

/** Tiền tố của xã trong khoá `c`, giống hệt tiền tố của trường xã trong khoá `f` (§6b). */
export const COMMUNE_SEL_PREFIX = "commune:";

/** Mã xã VNSDI là 5 chữ số, ví dụ `00004`. */
export const COMMUNE_CODE_RE = /^\d{5}$/;

/** Tiền tố của POI trong khoá `c` — M3.5 (§9). */
export const POI_SEL_PREFIX = "poi:";

/**
 * Tham chiếu POI: chữ đầu là LOẠI đối tượng OSM (`n`ode / `w`ay / `r`elation), phần còn
 * lại là osm_id — vì ID node và way trong OSM là hai không gian số giẫm nhau được.
 */
export const POI_REF_RE = /^[nwr]\d+$/;

/** Tiền tố của trạm trong khoá `c` — M4.1 (§8a, §9). Cùng tiền tố với trường `station:`. */
export const STATION_SEL_PREFIX = "station:";
export const ROAD_SEL_PREFIX = "road:";
export const ROAD_ID_RE = /^\d+$/;

/**
 * Định danh trạm trong hash là **`station_id`**, không phải `station_code` — quyết định
 * M4.1, và nó đến từ dữ liệu chứ không từ sở thích.
 *
 * §8a viết `c=station:<mã evcs>`. Nguồn có hai mã, và chỉ một cái sống được trong URL:
 *   · `station_code` — 6/939 mã chứa **dấu cách, dấu phẩy và dấu tiếng Việt**
 *     (`CONGDONG-Anh Chiến, Thường Tín`). Dấu phẩy là ký tự phân cách của khoá `l`, và
 *     `serializeHash` cố ý không encode nó (§9) — nên một mã như thế làm hash vừa xấu
 *     vừa khó đọc lại đúng.
 *   · `station_id` — slug ASCII `vn-c-ac000091`, **duy nhất trên cả 939 trạm**, không ký
 *     tự nào cần encode.
 * Cả hai đều là "mã evcs"; chọn cái đi qua được một URL nguyên vẹn.
 */
export const STATION_ID_RE = /^[a-z0-9-]{1,64}$/;

export type Selection =
  | { kind: "cell"; id: string }
  | { kind: "commune"; code: string }
  | { kind: "poi"; ref: string }
  | { kind: "station"; id: string }
  | { kind: "road"; id: string };

/**
 * Đọc khoá `c`. Trả `null` khi sai hình dạng — và sai hình dạng thì **bỏ đúng khoá đó**,
 * không kéo theo khoá nào khác (§9).
 *
 * Chỉ kiểm được HÌNH DẠNG ở đây. Ô/xã không có thật trong dữ liệu bị bỏ khi truy vấn trả
 * rỗng, và panel nói ra điều đó thay vì im lặng.
 */
export function parseSelection(raw: string | null): Selection | null {
  if (!raw) return null;
  if (raw.startsWith(COMMUNE_SEL_PREFIX)) {
    const code = raw.slice(COMMUNE_SEL_PREFIX.length);
    return COMMUNE_CODE_RE.test(code) ? { kind: "commune", code } : null;
  }
  if (raw.startsWith(POI_SEL_PREFIX)) {
    const ref = raw.slice(POI_SEL_PREFIX.length);
    return POI_REF_RE.test(ref) ? { kind: "poi", ref } : null;
  }
  if (raw.startsWith(STATION_SEL_PREFIX)) {
    const id = raw.slice(STATION_SEL_PREFIX.length);
    return STATION_ID_RE.test(id) ? { kind: "station", id } : null;
  }
  if (raw.startsWith(ROAD_SEL_PREFIX)) {
    const id = raw.slice(ROAD_SEL_PREFIX.length);
    return ROAD_ID_RE.test(id) ? { kind: "road", id } : null;
  }
  return H3_RE.test(raw) ? { kind: "cell", id: raw } : null;
}

/** Chuỗi hoá lại — phải là nghịch đảo đúng của `parseSelection`. */
export function serializeSelection(s: Selection): string {
  if (s.kind === "commune") return COMMUNE_SEL_PREFIX + s.code;
  if (s.kind === "poi") return POI_SEL_PREFIX + s.ref;
  if (s.kind === "station") return STATION_SEL_PREFIX + s.id;
  if (s.kind === "road") return ROAD_SEL_PREFIX + s.id;
  return s.id;
}

/** Mã xã của một lựa chọn, hoặc `null` nếu đang chọn một ô. Dùng để tra `commune.geojson`. */
export function communeCodeOf(raw: string | null): string | null {
  const s = parseSelection(raw);
  return s?.kind === "commune" ? s.code : null;
}

/** Mã H3 của một lựa chọn, hoặc `null` nếu đang chọn một xã. */
export function cellIdOf(raw: string | null): string | null {
  const s = parseSelection(raw);
  return s?.kind === "cell" ? s.id : null;
}

/** Tham chiếu POI (`n|w|r` + osm_id) của một lựa chọn, hoặc `null`. */
export function poiRefOf(raw: string | null): string | null {
  const s = parseSelection(raw);
  return s?.kind === "poi" ? s.ref : null;
}

/** `station_id` của một lựa chọn, hoặc `null` — M4.1. */
export function stationIdOf(raw: string | null): string | null {
  const s = parseSelection(raw);
  return s?.kind === "station" ? s.id : null;
}

export function roadIdOf(raw: string | null): string | null {
  const s = parseSelection(raw);
  return s?.kind === "road" ? s.id : null;
}
