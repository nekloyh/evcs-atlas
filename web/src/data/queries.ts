import { query, registerParquet } from "./duckdb";
import { dataPath, isProvinceMode } from "./province";
import { columnAvailable, fieldAvailable, gridColumnAvailable } from "../fields";
import { H3_RE, STATION_ID_RE } from "./h3";
// Tách ra file riêng vì `queries.ts` kéo theo `duckdb.ts` (import `.wasm?url` của Vite) nên
// logic thuần ở đây KHÔNG test được bằng `node --test` — cùng lý do đã tách `h3.ts` (§12).
import { isInScope } from "./scope";
export { isInScope } from "./scope";
import type { AreaPop } from "../story/lorenz";
import type { PoiCollection } from "./poi";
import type { CellValue } from "../viz/palette";
import { FIELDS, type FieldMeta, type RuntimeCoverage } from "../fields";
import { powerTierOf, type PowerTierId } from "../state/filter";
import type { OpportunityCommuneRow } from "../viz/chart-models";
import { BEYOND_2KM_M } from "../domain-thresholds";

export { H3_RE };
export { BEYOND_2KM_M } from "../domain-thresholds";

/**
 * Lớp vắng mặt ở chế độ TỈNH trả về tập rỗng — "chưa dựng" khác "hỏng" (§7a cùng họ).
 *
 * Chỉ áp ở chế độ TỈNH. Ở bộ Hà Nội gốc, 404 vẫn NỔ như cũ: nuốt nó ở đó là giấu một lỗi
 * build thật sau một lớp trông như trống.
 */
// Tên file KHÔNG đổi; chỉ đi qua `dataPath()` để mang tiền tố tỉnh khi hash có khoá `tinh`
// (xem `province.ts`). Không hàm nào dưới đây đổi chữ ký — đó là điều kiện của "có shim".
export const GRID = dataPath("grid_h3_r8.parquet");
export const STATIONS = dataPath("stations.parquet");
export const OCCUPANCY = dataPath("station_occupancy.parquet");
export const COMMUNE_GEOJSON = dataPath("commune.geojson");

/** Một ô lưới. `value` có thể null — đó là điểm mấu chốt. */
export interface GridCell {
  h3: string;
  value: CellValue;
  /**
   * Dân số của ô, đi kèm mọi truy vấn trường ô. Hai chỗ cần: phủ theo DÂN của trường phái
   * sinh (§13c-1) và trọng số của mặt độ cầu (§1b). Nạp một lần thay vì hai lần.
   */
  pop: number | null;
  /** Số cổng lắp đặt trong ô — trục cung của P1 bivariate, `0` là giá trị thật. */
  ports: number;
  lat: number;
  lng: number;
  /**
   * Ô này có nằm ngoài 2 km đường tới trạm không — cho overlay `beyond2km` (§4d-1).
   *
   * Đi cùng mọi truy vấn trường ô vì overlay phải bật được **bất kể trường nào đang chọn**;
   * nếu nó phụ thuộc trường thì nó là một trường thứ hai chứ không phải overlay.
   *
   * `null` khi không tới được bằng đường bộ — "không biết mất bao lâu" khác "biết là hơn 5
   * phút", và ô null KHÔNG được vào lớp overlay.
   */
  beyond2km: boolean | null;
  /**
   * `dist_station_network_m` — trục Y của scatter trong dock (§3d, M4).
   *
   * Đi cùng mọi truy vấn trường ô vì brush scatter phải hoạt động **bất kể trường nào đang
   * chọn**: nếu nó phụ thuộc trường thì nó không còn là một bộ lọc độc lập nữa. Cùng lý do
   * đã đưa `pop` và `beyond2km` vào đây.
   *
   * `null` ở 51 ô không tới được — và brush LOẠI chúng, vì "không biết xa bao nhiêu" không
   * khẳng định được là "trong khoảng" (§3d-1).
   */
  dist: number | null;
  /**
   * Ô có tới được bằng đường bộ không — cột `network_reachable`.
   *
   * Đi cùng mọi truy vấn vì nó là **cột phân loại null** của `nullSplit` (§7a mở rộng):
   * cùng một `value === null`, `reachable === true` nghĩa là "câu hỏi không áp dụng" còn
   * `false` nghĩa là "không biết". Hai thứ đó phải vẽ khác nhau.
   */
  reachable: boolean | null;
}


/** Arrow trả về nhiều kiểu; đưa hết về `CellValue`, KHÔNG có nhánh nào biến null thành 0. */
function toCellValue(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  return String(v);
}

/**
 * Biểu thức SELECT của một trường ô: cột thô, hoặc công thức phái sinh khai ở `fields.ts`.
 * Chỉ có MỘT chỗ quyết định điều này, để công thức và câu mô tả nó không trôi khỏi nhau.
 */
function selectExpr(meta: FieldMeta): string {
  return meta.expr ?? `g."${meta.column}"`;
}

/**
 * Một cột của LƯỚI trong SQL, hoặc `NULL` nếu bộ dữ liệu đang mở không có cột đó.
 *
 * `fetchField` phải kèm bốn cột cố định (`population`, `dist_station_network_m`,
 * `network_reachable`) bất kể trường nào đang tô — chúng nuôi mặt độ cầu, overlay 2 km,
 * brush scatter và `nullSplit`. Ở bộ Hà Nội cả bốn đều có. Ở store toàn quốc chúng thuộc
 * lớp TÍNH TOÁN và chưa tồn tại, nên câu SQL nguyên văn sẽ ném lỗi và không vẽ được gì —
 * kể cả những trường HOÀN TOÀN dựng được.
 *
 * `NULL` là câu trả lời đúng chứ không phải một chỗ vá: `null` đã là ngôn ngữ mà cả tầng
 * vẽ lẫn ràng buộc 1 dùng cho "không biết". Ô sẽ mang vân "không đo được", overlay 2 km
 * không nhận ô nào, brush loại chúng — đúng hành vi đã định nghĩa cho dữ liệu vắng.
 */
function gcol(name: string): string {
  return gridColumnAvailable(name) ? `g."${name}"` : "NULL";
}

/**
 * Trường của Ô, ĐÃ lọc theo "dựng được trên bộ đang mở" — cổng duy nhất để lấy `FIELDS`.
 *
 * `gcol()` bảo vệ mấy cột CỐ ĐỊNH mà mọi truy vấn kèm theo. Nó không bảo vệ được thứ ở đây:
 * biểu thức RIÊNG của một trường, do `selectExpr()` nhả ra nguyên văn. `detour_ratio` ở bộ
 * tỉnh không tồn tại, và câu SQL sinh ra ném `Binder Error` — dải đỏ ở MỌI lần mở tỉnh
 * (`fetchDerivedCoverage`, chạy lúc boot) và panel Ô chết hẳn (`fetchCell`).
 *
 * Là HÀM chứ không phải hai lần `&& fieldAvailable(f)` tại chỗ: luật này đã bị quên hai
 * lần ở hai chỗ gọi khác nhau, nên nó phải nằm ở chỗ mà chỗ gọi thứ ba không quên được.
 *
 * Ở bộ Hà Nội gốc KHÔNG có gì đổi: manifest không phát `available_columns` ⇒ `AVAILABLE`
 * là `null` ⇒ `fieldAvailable` trả `true` cho tất cả. Bộ lọc chỉ có tác dụng ở nơi ta
 * thật sự biết bộ dữ liệu thiếu gì.
 */
function cellFields(pred: (f: FieldMeta) => boolean): FieldMeta[] {
  return FIELDS.filter((f) => f.readAs === "cell" && fieldAvailable(f) && pred(f));
}

/**
 * Cột của một file parquet, đọc từ metadata (`LIMIT 0`) và nhớ theo tên file.
 *
 * Câu hỏi thứ ba, khác cả `gcol()` lẫn `cellFields()`: hai cái kia hỏi về cột của LƯỚI, mà
 * lưới là thứ duy nhất manifest liệt cột. Bảng TRẠM thì không ai liệt — và nó khác nhau
 * giữa hai bộ dữ liệu (bộ Hà Nội gắn trạm vào ô bằng `h3_r8`, store toàn quốc gắn vào XÃ
 * bằng `commune_code`). Hỏi thẳng file là cách duy nhất không cần đổi exporter.
 *
 * Rẻ: parquet mang schema ở footer, nên `LIMIT 0` không quét hàng nào. Và nhớ theo tên
 * file nên mỗi bảng chỉ hỏi một lần cho cả phiên — cùng khuôn với `registered` ở `duckdb.ts`.
 */
const columnCache = new Map<string, Promise<Set<string>>>();

async function columnsOf(file: string): Promise<Set<string>> {
  let p = columnCache.get(file);
  if (!p) {
    p = (async () => {
      await registerParquet(file);
      const t = await query(`SELECT * FROM read_parquet('${file}') LIMIT 0`);
      return new Set(t.schema.fields.map((f) => f.name));
    })();
    columnCache.set(file, p);
  }
  return p;
}

async function registerFor(metas: FieldMeta[]): Promise<void> {
  const files = new Set<string>([GRID]);
  for (const m of metas) for (const d of m.deps ?? []) files.add(d);
  await Promise.all([...files].map(registerParquet));
}

/**
 * Đọc `h3_r8` + một trường bất kỳ cho cả lưới.
 *
 * KHÔNG `COALESCE(..., 0)`, KHÔNG `IFNULL`. Ô không có giá trị phải về tới lớp vẽ dưới
 * dạng `null` để nó được tô gạch chéo — ràng buộc 1, DESIGN.md §10.
 */
async function fetchFieldUncached(meta: FieldMeta): Promise<GridCell[]> {
  await registerFor([meta]);
  const table = await query(
    `SELECT g."h3_r8" AS h3, ${selectExpr(meta)} AS value, ${gcol("population")} AS pop,
            ${gcol("n_ports")} AS ports,
            g."lat" AS lat, g."lng" AS lng,
            ${gcol("dist_station_network_m")} AS dist,
            ${gridColumnAvailable("dist_station_network_m") ? `g."dist_station_network_m" > ${BEYOND_2KM_M}` : "NULL"} AS beyond2km,
            ${gcol("network_reachable")} AS reachable
     FROM read_parquet('${GRID}') g`,
  );
  const out: GridCell[] = new Array(table.numRows);
  const h3s = table.getChild("h3")!;
  const vals = table.getChild("value")!;
  const pops = table.getChild("pop")!;
  const ports = table.getChild("ports")!;
  const lats = table.getChild("lat")!;
  const lngs = table.getChild("lng")!;
  const far = table.getChild("beyond2km")!;
  const rch = table.getChild("reachable")!;
  const dst = table.getChild("dist")!;
  for (let i = 0; i < table.numRows; i++) {
    const b = far.get(i);
    const d = dst.get(i);
    const rawPop = pops.get(i);
    const parsedPop = rawPop === null || rawPop === undefined ? null : Number(rawPop);
    out[i] = {
      h3: String(h3s.get(i)),
      value: toCellValue(vals.get(i)),
      // Population is an analytical input, not a default. Keep missing values null so
      // the histogram/filter can exclude and disclose them rather than recoding as zero.
      pop: parsedPop !== null && Number.isFinite(parsedPop) ? parsedPop : null,
      ports: Number(ports.get(i)) || 0,
      lat: Number(lats.get(i)),
      lng: Number(lngs.get(i)),
      // KHÔNG `?? 0`: 51 ô không tới được. Ghi 0 vào đó là nói "sát trạm" ở đúng chỗ tệ
      // nhất thành phố, và brush scatter sẽ giữ lại chúng như thể chúng thoả điều kiện.
      dist: d === null || d === undefined ? null : Number(d),
      beyond2km: b === null || b === undefined ? null : Boolean(b),
      reachable: (() => {
        const r = rch.get(i);
        return r === null || r === undefined ? null : Boolean(r);
      })(),
    };
  }
  return out;
}

/**
 * Cache theo dataset-session + field. React render/revisit có thể gọi lại loader, nhưng
 * chỉ lần đầu được phát truy vấn DuckDB. Promise lỗi bị bỏ để retry có chủ ý.
 */
const fieldRequests = new Map<string, Promise<GridCell[]>>();

export function fetchField(meta: FieldMeta): Promise<GridCell[]> {
  const key = `${GRID}:${meta.id}`;
  const cached = fieldRequests.get(key);
  if (cached) return cached;
  const request = fetchFieldUncached(meta).catch((error) => {
    fieldRequests.delete(key);
    throw error;
  });
  fieldRequests.set(key, request);
  return request;
}

/**
 * Phủ của các trường PHÁI SINH, đo một lần lúc boot — ràng buộc 4 nói badge phải thấy được
 * **trước khi bấm**, nên không thể đợi tới lúc trường được chọn mới biết phủ của nó.
 *
 * Một truy vấn cho tất cả, không phải mỗi trường một truy vấn: chúng cùng quét một bảng.
 */
export async function fetchDerivedCoverage(): Promise<Map<string, RuntimeCoverage>> {
  // Trường có `nullSplit` cũng cần đo lúc chạy, dù nó là cột thô: badge ⚠ của nó phải TRỪ
  // nhóm "không áp dụng" ra, mà `manifest.coverage` chỉ biết tổng số null (§7a mở rộng).
  const derived = cellFields((f) => Boolean(f.expr || f.nullSplit));
  const out = new Map<string, RuntimeCoverage>();
  if (derived.length === 0) return out;

  await registerFor(derived);
  const parts = derived.flatMap((f, i) => [
    `count(*) FILTER (WHERE (${selectExpr(f)}) IS NOT NULL) AS n${i}`,
    `sum(${gcol("population")}) FILTER (WHERE (${selectExpr(f)}) IS NOT NULL) AS p${i}`,
    // Nhóm "không áp dụng": giá trị null NHƯNG cột phân loại nói câu hỏi không áp dụng.
    // Nó bị TRỪ khỏi mẫu số của ⚠ — badge chỉ được nói về phần thật sự "không biết".
    f.nullSplit
      ? `count(*) FILTER (WHERE (${selectExpr(f)}) IS NULL AND ${gcol(f.nullSplit.by)}) AS x${i}`
      : `0 AS x${i}`,
  ]);
  const t = await query(
    `SELECT count(*) AS n_all, sum(${gcol("population")}) AS p_all, ${parts.join(", ")}
     FROM read_parquet('${GRID}') g`,
  );
  const row = t.get(0)!;
  const nAll = Number(row["n_all"]) || 0;
  const pAll = Number(row["p_all"]) || 0;
  derived.forEach((f, i) => {
    const n = Number(row[`n${i}`]) || 0;
    const p = Number(row[`p${i}`]) || 0;
    const notApplicable = Number(row[`x${i}`]) || 0;
    // Mẫu số bỏ nhóm "không áp dụng" đi: `detour_ratio` phủ 4.264/4.400 = 96,9% nếu đếm
    // thô, nhưng 4.264/4.314 = 98,8% nếu hỏi đúng câu "trong những ô mà câu hỏi có nghĩa,
    // bao nhiêu ô trả lời được". Câu sau mới là thứ badge ⚠ nói.
    const total = Math.max(nAll - notApplicable, 1);
    out.set(f.id, {
      n_present: n,
      n_total: total,
      share: n / total,
      pop_share: pAll ? p / pAll : 0,
      n_not_applicable: notApplicable || undefined,
    });
  });
  return out;
}

// ── Mặt độ cầu liên tục (§1b, §13d-A) ──────────────────────────────────────────

/**
 * Cạnh ô gộp của `ContourLayer`, tính bằng MÉT. Giả định khai báo, không phải số đo — nên
 * nó phải hiện trong câu đơn vị của legend, cùng khuôn với "chạy thông thoáng" ở §7.
 *
 * **3.000 m, chọn sau khi render thật.** Phép gộp đếm TÂM ô H3, nên số tâm rơi vào một ô
 * gộp mới là thứ quyết định nhiễu:
 *
 * | cạnh ô | diện tích | ~số tâm ô H3 (0,74 km²) | kết quả render |
 * |---|---:|---:|---|
 * | 1.500 m | 2,25 km² | ~3 | **đốm răng cưa** — phương sai lấy mẫu ±33% lộ thành hoa văn hình thoi, và hoa văn đó KHÔNG có trong dữ liệu |
 * | 3.000 m | 9 km² | ~12 | mặt đọc được, cụm vẫn rõ |
 *
 * Đây đúng là loại lỗi §12 cấm: vẽ ra một cấu trúc do phép gộp sinh ra rồi để người xem
 * đọc nó như cấu trúc của thành phố. Ở 3.000 m (~26 px tại zoom 9,3) mặt liên tục mà cụm
 * trung tâm vẫn tách khỏi vành ngoài — mà cụm chính là thứ luận điểm A phải cho thấy.
 */
export const SURFACE_CELL_M = 3000;

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 103_940;

/**
 * Ngưỡng cho các dải đồng mức, đo trên CHÍNH phép gộp mà `ContourLayer` sẽ làm.
 *
 * Vì sao phải tự gộp một lần trong SQL thay vì đoán ngưỡng: §3b nói legend luôn in giá trị
 * ngưỡng thật. Muốn in "12.400 người trên ô gộp 1,5 km" thì phải biết phân bố của chính
 * đại lượng đó — mà nó không phải phân bố của `population` theo ô H3.
 *
 * (Gốc lưới của deck.gl có thể lệch nửa ô so với lưới ở đây. Điều đó không làm ngưỡng sai:
 * ngưỡng là chỗ CẮT do ta chọn, không phải số đo — và câu legend nói đúng cái nó nói:
 * dải này là khoảng giá trị nào. Phép gộp ở đây chỉ để chọn chỗ cắt cho hợp phân bố.)
 */
export async function fetchSurfaceBins(): Promise<number[]> {
  // Không có cột dân số ⇒ **không có mặt độ cầu để chia bậc**, và trả mảng rỗng là câu trả
  // lời đúng: `renderPlan` chỉ chọn `paint: "surface"` cho trường có `surface: true`, mà
  // trường đó cũng bị `fieldAvailable` loại ở bộ thiếu cột. Không guard thì câu SQL nguyên
  // văn ném `Binder Error: Referenced column "population" not found` ngay lúc boot, ở MỌI
  // tỉnh, và dải lỗi che ngang bản đồ suốt phiên xem.
  if (!gridColumnAvailable("population")) return [];
  await registerParquet(GRID);
  const dx = SURFACE_CELL_M / M_PER_DEG_LON;
  const dy = SURFACE_CELL_M / M_PER_DEG_LAT;
  const t = await query(
    `SELECT sum("population") AS p
     FROM read_parquet('${GRID}')
     GROUP BY floor("lng" / ${dx}), floor("lat" / ${dy})
     HAVING sum("population") > 0`,
  );
  const col = t.getChild("p")!;
  const out: number[] = new Array(t.numRows);
  for (let i = 0; i < t.numRows; i++) out[i] = Number(col.get(i));
  return out;
}

// ── Số đo của các cảnh CÂU CHUYỆN (§14b) ───────────────────────────────────────
//
// Mọi con số hiện trong bốn cảnh đi qua đây, KHÔNG qua một hằng số trong TSX. §14b nói rõ
// vì sao luật này gắt hơn ở chế độ CÂU CHUYỆN so với chỗ khác: một câu chuyện là chỗ dễ
// nhất để một con số cũ sống sót qua ba lần đổi dữ liệu mà không ai thấy, vì không ai đọc
// lại nó.

/**
 * Diện tích **trong ranh giới Hà Nội** và dân số của từng ô — đầu vào của đường Lorenz.
 *
 * `area_km2 * area_frac`, không phải `area_km2` trần. Dân số của ô biên chỉ tính phần
 * trong Hà Nội (neo theo số công bố của xã VNSDI), nên mẫu số phải là diện tích trong Hà
 * Nội — nếu không thì ô biên bị gán một phần diện tích không có ai của nó ở trong đó, và
 * đường cong nói thành phố trải đều hơn thực tế.
 *
 * *Đối chứng:* tổng theo cách này ra 3.363,9 km², lệch **0,12%** so với 3.359,77 km² diện
 * tích công bố của 126 xã (`commune.area_km2`). Cách tính bằng `area_km2` trần ra 3.556,4
 * km², lệch 5,9% — chênh lệch đó chính là phần lưới nằm ngoài thành phố.
 */
export async function fetchAreaPop(): Promise<AreaPop[]> {
  await registerParquet(GRID);
  const t = await query(
    `SELECT "area_km2" * "area_frac" AS a, "population" AS p FROM read_parquet('${GRID}')`,
  );
  const as = t.getChild("a")!;
  const ps = t.getChild("p")!;
  const out: AreaPop[] = new Array(t.numRows);
  for (let i = 0; i < t.numRows; i++) out[i] = { area: Number(as.get(i)), pop: Number(ps.get(i)) };
  return out;
}

/** Số đo của cảnh C — §14b-C. Một truy vấn, vì cả năm con số quét cùng một bảng. */
export interface DetourStats {
  /** ô có `detour_ratio` > ngưỡng, và số người trong chúng */
  nCells: number;
  pop: number;
  median: number | null;
  /** ô mà CHIM BAY nói đã phủ ở bán kính r */
  euclidCovered: number;
  /** ô mà MẠNG ĐƯỜNG xác nhận đã phủ ở cùng bán kính */
  networkCovered: number;
}

export async function fetchDetourStats(threshold: number, radiusM: number): Promise<DetourStats> {
  await registerParquet(GRID);
  const t = await query(
    `SELECT count(*) FILTER (WHERE "detour_ratio" > ${threshold}) AS n,
            sum("population") FILTER (WHERE "detour_ratio" > ${threshold}) AS p,
            median("detour_ratio") AS med,
            count(*) FILTER (WHERE "dist_station_euclid_m" <= ${radiusM}) AS e,
            -- Ô không tới được để NULL, nên nó không lọt vào "mạng đường xác nhận đã phủ":
            -- phép so sánh trên NULL trả về NULL chứ không phải true. Đúng như mong muốn —
            -- "không biết" không được đếm thành "đã phủ".
            count(*) FILTER (WHERE "dist_station_network_m" <= ${radiusM}) AS w
     FROM read_parquet('${GRID}')`,
  );
  const r = t.get(0)!;
  const med = r["med"];
  return {
    nCells: Number(r["n"]) || 0,
    pop: Number(r["p"]) || 0,
    median: med === null || med === undefined ? null : Number(med),
    euclidCovered: Number(r["e"]) || 0,
    networkCovered: Number(r["w"]) || 0,
  };
}

// ── Mạng đường — đơn vị đọc thứ ba (§6b, ship ở M3-R) ──────────────────────────

export const ROADS = dataPath("roads.parquet");
export const ROUTES_GEOJSON = dataPath("routes_showcase.geojson");

/** Một đoạn đường. `dist` có thể null — 396/160.823 đoạn không tới được. */
export interface RoadSeg {
  /** OSM way id — selection/deep-link identity, không phải graph edge. */
  id: string;
  roadClass: string;
  /** toạ độ phẳng `[lng, lat, lng, lat, …]` — giải mã sẵn lúc export, KHÔNG phải WKB (§5b). */
  path: number[];
  dist: number | null;
  bridge: boolean;
}

let roadCache: Promise<RoadSeg[]> | null = null;

/**
 * 160.823 đoạn đường từ LOCAL trở lên (SERVICE đã bỏ ở export — 77.375 đoạn lối nội bộ
 * không chở luận điểm nào).
 *
 * Cache ở module: 3,2 MB và ~427 nghìn điểm, không đọc lại mỗi lần đổi cảnh.
 *
 * `coords` về từ Arrow dưới dạng `List<Double>`. Đưa thẳng sang `Float64Array` thay vì
 * `Array<number>`: `PathLayer` nhận typed array không cần chuyển đổi, và 427 nghìn số ở
 * dạng object array là ~10× bộ nhớ.
 */
export function fetchRoads(): Promise<RoadSeg[]> {
  roadCache ??= (async () => {
    await registerParquet(ROADS);
    // `dist_station_m` chỉ có ở bộ Hà Nội — store toàn quốc chưa dựng nhãn khoảng cách
    // theo ĐOẠN đường. Phát `NULL` thay vì tên cột không tồn tại, đúng khuôn `gcol()` ở
    // trên: DuckDB ném Binder Error ở cột lạ, và lỗi đó nổ ở tầng truy vấn — người dùng
    // thấy màn hình trắng chứ không thấy "trường này chưa tính".
    const d = columnAvailable("road", "dist_station_m") ? `"dist_station_m"` : "NULL";
    const t = await query(
      `SELECT "osm_id" AS id, "road_class" AS rc, "coords" AS c, ${d} AS d, "bridge" AS b FROM read_parquet('${ROADS}')`,
    );
    const cs = t.getChild("c")!;
    const ids = t.getChild("id")!;
    const rcs = t.getChild("rc")!;
    const ds = t.getChild("d")!;
    const bs = t.getChild("b")!;
    const out: RoadSeg[] = new Array(t.numRows);
    for (let i = 0; i < t.numRows; i++) {
      const raw = cs.get(i) as { toArray(): ArrayLike<number> } | null;
      const d = ds.get(i);
      out[i] = {
        id: String(ids.get(i)),
        roadClass: String(rcs.get(i) ?? "UNKNOWN"),
        path: raw ? Array.from(raw.toArray()) : [],
        // KHÔNG `?? 0`: 396 đoạn không tới được phải về tới lớp vẽ dưới dạng null để chúng
        // được vẽ bằng mực xám của vân null, không phải bậc "gần trạm" (ràng buộc 1).
        dist: d === null || d === undefined ? null : Number(d),
        bridge: Boolean(bs.get(i)),
      };
    }
    return out;
  })();
  return roadCache;
}

/**
 * Phủ của trường đường, đo trên chính các đoạn vừa nạp — ràng buộc 4.
 *
 * `pop_share` để `undefined` chứ không để 0: một đoạn đường **không có dân số**, nên câu
 * "x% dân" ở đây không sai số — nó *không có nghĩa*. Ghi 0 vào đó sẽ in ra "0% dân", đọc
 * thành "những đoạn này không phục vụ ai", tức bịa một phát biểu mà dữ liệu không nói.
 */
export function roadCoverage(roads: RoadSeg[]): RuntimeCoverage {
  const n = roads.reduce((s, r) => s + (r.dist === null ? 0 : 1), 0);
  return {
    n_present: n,
    n_total: roads.length,
    share: roads.length ? n / roads.length : 0,
    pop_share: undefined,
  };
}

/**
 * 3 cặp tuyến minh hoạ — mỗi cặp là *đường đi thật* (`kind: "network"`) và *đoạn chim bay*
 * (`kind: "euclid"`) của cùng một ô.
 *
 * Đây là thứ thay cho cảnh morph mà §13e đã bỏ: nó vẽ **đường đi có thật** chứ không vẽ
 * một hình tròn nội suy, nên nó rẻ hơn và trung thực hơn. Quy tắc chọn ô nằm trong
 * `manifest.roads.showcase_rule` — mỗi bậc dân số một ô, không phải một ngưỡng đơn.
 */
export interface ShowcaseRoute {
  h3: string;
  kind: "network" | "euclid";
  detour: number;
  networkM: number;
  euclidM: number;
  communeName: string;
  population: number;
  path: [number, number][];
}

let routeCache: Promise<ShowcaseRoute[]> | null = null;

export function fetchShowcaseRoutes(): Promise<ShowcaseRoute[]> {
  routeCache ??= fetch(new URL(`data/${ROUTES_GEOJSON}`, window.location.href))
    .then((r) => {
      // Cặp đường minh hoạ là tài sản của CẢNH C, và cảnh chỉ mở ở Hà Nội.
      // Cặp tuyến vắng ở tỉnh khác là ĐÚNG, không phải lỗi — trả rỗng thay vì ném.
      if (!r.ok && isProvinceMode)
        return {
          features: [] as {
            geometry: { coordinates: [number, number][] };
            properties: Record<string, unknown>;
          }[],
        };
      if (!r.ok) throw new Error(`${ROUTES_GEOJSON}: HTTP ${r.status} — chạy \`make web-data\` chưa?`);
      return r.json() as Promise<{
        features: {
          geometry: { coordinates: [number, number][] };
          properties: Record<string, unknown>;
        }[];
      }>;
    })
    .then((fc) =>
      fc.features.map((f) => {
        const p = f.properties;
        return {
          h3: String(p["h3_r8"]),
          kind: p["kind"] === "euclid" ? ("euclid" as const) : ("network" as const),
          detour: Number(p["detour_ratio"]),
          networkM: Number(p["dist_station_network_m"]),
          euclidM: Number(p["dist_station_euclid_m"]),
          communeName: String(p["commune_name"]),
          population: Number(p["population"]),
          path: f.geometry.coordinates,
        };
      }),
    );
  return routeCache;
}

// ── Xã — đơn vị đọc thứ hai (§6b) ──────────────────────────────────────────────

/**
 * Hình học phải là UNION PHÂN BIỆT, không phải một object có `type` là union: `GeoJsonLayer`
 * đòi `coordinates` khớp đúng với `type`, nên `{type: "Polygon" | "MultiPolygon";
 * coordinates: A | B}` không gán được. Viết đúng ở đây thì không phải ép kiểu ở chỗ truyền
 * vào — mà ép kiểu chính là vứt bỏ thứ đang bảo vệ ta.
 *
 * Không thêm `@types/geojson` làm dependency cho việc này (§1): sáu dòng dưới đây đủ, và
 * chúng khớp cấu trúc với kiểu chuẩn nên deck.gl nhận.
 */
export type CommuneGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface CommuneFeature {
  type: "Feature";
  geometry: CommuneGeometry;
  properties: Record<string, CellValue>;
}
export interface CommuneCollection {
  type: "FeatureCollection";
  features: CommuneFeature[];
}

let communeCache: Promise<CommuneCollection> | null = null;
let boundaryCache: Promise<CommuneCollection> | null = null;

export const BOUNDARY_GEOJSON = dataPath("admin_boundary.geojson");

/**
 * Ranh giới hành chính Hà Nội (+ vành đệm 5 km) — **lớp BỐI CẢNH, không phải overlay**.
 *
 * Nó không nằm trong tab LAYER và không bật/tắt được, vì nó không mang dữ liệu nào: nó chỉ
 * trả lời "đang nhìn ở đâu". Hai chỗ cần nó (M2.1):
 *   · khi không vẽ được trường (`paint === "none"`) — bản đồ trắng trơn đọc thành "không
 *     có dữ liệu ở đây", đúng loại nói dối mà ràng buộc 1 cấm, chỉ khác là về PHỦ;
 *   · trên mặt độ cầu — nó phủ kín ở opacity 0,85 nên nuốt mất hình dáng thành phố.
 */
export function fetchBoundary(): Promise<CommuneCollection> {
  boundaryCache ??= fetch(new URL(`data/${BOUNDARY_GEOJSON}`, window.location.href)).then((r) => {
    if (!r.ok) throw new Error(`${BOUNDARY_GEOJSON}: HTTP ${r.status} — chạy \`make web-data\` chưa?`);
    return r.json() as Promise<CommuneCollection>;
  });
  return boundaryCache;
}

/**
 * 126 đa giác xã. Đọc bằng `fetch`, KHÔNG qua DuckDB: hình học đã được chuyển WKB → GeoJSON
 * ở `web_export.py` (§5b) đúng để phía web không phải parse gì cả.
 */
export function fetchCommunes(): Promise<CommuneCollection> {
  communeCache ??= fetch(new URL(`data/${COMMUNE_GEOJSON}`, window.location.href)).then((r) => {
    if (!r.ok) throw new Error(`${COMMUNE_GEOJSON}: HTTP ${r.status} — chạy \`make web-data\` chưa?`);
    return r.json() as Promise<CommuneCollection>;
  });
  return communeCache;
}

let poiCache: Promise<PoiCollection> | null = null;

export const POI_GEOJSON = dataPath("poi.geojson");

/**
 * 6.633 POI của 4 nhóm visual — M3.5. Nạp LƯỜI như roads (§5a): 3,39 MB, và phần lớn
 * phiên xem không bật nhóm POI nào. Hình học đã là GeoJSON từ `web_export.py` (§5b).
 */
export function fetchPoi(): Promise<PoiCollection> {
  poiCache ??= fetch(new URL(`data/${POI_GEOJSON}`, window.location.href)).then((r) => {
    if (!r.ok) throw new Error(`${POI_GEOJSON}: HTTP ${r.status} — chạy \`make web-data\` chưa?`);
    return r.json() as Promise<PoiCollection>;
  });
  return poiCache;
}

/** Phủ của MỌI trường xã, đo trên chính 126 feature vừa nạp. Mẫu số là 126, không phải 4.427. */
export function communeCoverage(fc: CommuneCollection): Map<string, RuntimeCoverage> {
  const out = new Map<string, RuntimeCoverage>();
  const nTotal = fc.features.length;
  let popAll = 0;
  for (const f of fc.features) popAll += Number(f.properties["population"]) || 0;

  for (const meta of FIELDS) {
    if (meta.readAs !== "commune") continue;
    let n = 0;
    let pop = 0;
    for (const f of fc.features) {
      const v = f.properties[meta.column];
      if (v !== null && v !== undefined) {
        n++;
        pop += Number(f.properties["population"]) || 0;
      }
    }
    out.set(meta.id, {
      n_present: n,
      n_total: nTotal,
      share: nTotal ? n / nTotal : 0,
      pop_share: popAll ? pop / popAll : 0,
    });
  }
  return out;
}

/** Cả 52 cột của đúng một ô, **cộng** các trường phái sinh — panel Ô. */
export type CellRow = Record<string, CellValue>;

/**
 * Một hàng đầy đủ của một ô.
 *
 * `SELECT *` **cộng thêm biểu thức của mọi trường phái sinh**, chứ không chỉ `*`. Vì sao
 * điều đó quan trọng: panel Ô từng in "không đo được" cho `pop_beyond_2km` và
 * `util_pctl_cell` chỉ vì chúng không phải cột — trong khi giá trị hoàn toàn tính được.
 * Đó là nói dối về null (ràng buộc 1) ngay trong panel mà ràng buộc 5 cai quản.
 *
 * Và công thức lấy qua `selectExpr` — **cùng một hàm** mà `fetchField` dùng. Chép công
 * thức sang JS cho panel sẽ tạo bản thứ hai, và bản thứ hai sẽ trôi khỏi bản thứ nhất.
 */
export async function fetchCell(h3: string): Promise<CellRow | null> {
  if (!H3_RE.test(h3)) return null;
  const derived = cellFields((f) => Boolean(f.expr));
  await registerFor(derived);
  const extra = derived.map((f) => `, ${selectExpr(f)} AS "${f.column}"`).join("");
  const t = await query(
    `SELECT g.*${extra} FROM read_parquet('${GRID}') g WHERE g."h3_r8" = '${h3}'`,
  );
  if (t.numRows === 0) return null;
  const row = t.get(0)!;
  const out: CellRow = {};
  for (const f of t.schema.fields) out[f.name] = toCellValue(row[f.name]);
  return out;
}

/**
 * `occ_status` của các trạm TRONG ô — DESIGN.md §8.
 *
 * Đây là trường của TRẠM, không phải của ô: phải join `station_occupancy` ← `stations`
 * theo `station_code`, rồi gộp theo `stations.h3_r8`. Không có cột nào của bảng ô mang
 * sẵn nó.
 */
export interface CellOccStatus {
  counts: { status: string; n: number }[];
  nStationsWithOcc: number;
  /**
   * Phép gộp này có làm được trên bộ đang mở không.
   *
   * `false` KHÔNG có nghĩa là "ô này không có trạm đo được" — nó có nghĩa là **câu hỏi
   * không trả lời được**, vì bảng trạm của bộ này không mang `h3_r8` để nối lên ô. Hai
   * thứ đó phải phân biệt được ở kiểu dữ liệu, nếu không thì panel sẽ in "không đo được"
   * cho một ô đầy trạm — đúng cái lỗi ràng buộc 1 cấm, chỉ khác là bằng chữ.
   */
  joinable: boolean;
}

const EMPTY_OCC: CellOccStatus = { counts: [], nStationsWithOcc: 0, joinable: true };

export async function fetchCellOccStatus(h3: string): Promise<CellOccStatus> {
  if (!H3_RE.test(h3)) return EMPTY_OCC;
  // Bảng TRẠM của store toàn quốc không có `h3_r8` (nó gắn trạm vào XÃ, không vào ô lưới).
  // Không hỏi trước thì câu SQL ném `Binder Error: Table "s" does not have a column named
  // "h3_r8"`, và vì `Rail` gọi hàm này trong cùng một `Promise.all` với `fetchCell`, MỘT
  // lỗi ở đây giết CẢ panel Ô — 52 cột đọc được cũng không hiện ra.
  //
  // Hỏi chính file thay vì hỏi manifest: manifest liệt cột của LƯỚI, không liệt cột của
  // bảng trạm. `LIMIT 0` chỉ đọc metadata parquet, và kết quả nhớ theo tên file.
  if (!(await columnsOf(STATIONS)).has("h3_r8")) {
    return { counts: [], nStationsWithOcc: 0, joinable: false };
  }
  await Promise.all([registerParquet(STATIONS), registerParquet(OCCUPANCY)]);
  const t = await query(`
    SELECT o.occ_status AS status, count(*) AS n
    FROM read_parquet('${STATIONS}') s
    JOIN read_parquet('${OCCUPANCY}') o ON o.station_code = s.station_code
    WHERE s.h3_r8 = '${h3}'
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  const counts: { status: string; n: number }[] = [];
  for (let i = 0; i < t.numRows; i++) {
    const r = t.get(i)!;
    counts.push({ status: String(r["status"]), n: Number(r["n"]) });
  }
  return { counts, nStationsWithOcc: counts.reduce((s, c) => s + c.n, 0), joinable: true };
}

// ── Lớp TRẠM (§4d, điểm) ───────────────────────────────────────────────────────

export interface StationPoint {
  /** `station_id` — định danh trong khoá `c` (M4.1). Xem `STATION_ID_RE`. */
  id: string;
  lat: number;
  lng: number;
  /**
   * Trạm thuộc **phạm vi đang xem** hay chỉ nằm trong vành đệm 5 km — hai tư cách khác
   * nhau, phải NHÌN ra được khác nhau (§4d: đặc ↔ rỗng).
   *
   * Tên là `inScope` chứ không phải `hanoi`, và đó là một sửa lỗi: bộ Hà Nội ghi
   * `scope = 'HANOI'` còn store toàn quốc ghi `scope = 'IN'`. Điều kiện cũ
   * `=== "HANOI"` vì thế cho **false ở mọi trạm của mọi tỉnh** — cả 30 chấm của Cao Bằng
   * vẽ thành chấm rỗng "vành đệm", và panel TRẠM ghi sai tư cách của từng cái. Không lỗi
   * nào, chỉ một bản đồ nói dối.
   */
  inScope: boolean;
  scope?: string;
  stationCode?: string;
  /** `op_status` thô — `OPERATIONAL` · `MAINTENANCE` · `OUT_OF_SERVICE` · `UNKNOWN`. */
  opStatus: string;
  /** Số cổng ASSET; chỉ P1 Hybrid dùng bán kính như một encoding có legend riêng. */
  nPorts: number | null;
  currentType?: string | null;
  powerKwMaxPort?: number | null;
  powerKwSite?: number | null;
  powerTier?: PowerTierId;
  /**
   * Ba cột VĂN BẢN của Q-P4-2 — chỉ thêm vào phép chiếu, không thêm lượt quét (Phase 5 §4).
   *
   * Trước Phase 5 snapshot này chỉ mang `station_id`, nên tìm kiếm chỉ khớp được một định
   * danh không ai gõ (`vn-c-ac000091`). Đo trên gói đang mở: `name` có đủ 939/939 dòng và
   * `vinhomes` chạm 112 tên, `vincom` 17, `long bien` 14, `times city` 12 — tức toàn bộ
   * phần chuỗi người dùng thật sự nhớ đều nằm ngoài bộ nhớ cho tới lúc này.
   */
  name?: string | null;
  address?: string | null;
  operator?: string | null;
  /**
   * `commune_name` của trạm — null trên ĐÚNG 229/229 dòng `BUFFER` (đã đo).
   *
   * Trường CÓ ĐIỀU KIỆN chứ không phải trường thiếu: nó vắng khi và chỉ khi trạm nằm ngoài
   * phạm vi, nên chỗ nào đọc nó phải hiểu "ngoài phạm vi", không phải "chưa biết".
   */
  communeName?: string | null;
}

let stationCache: Promise<StationPoint[]> | null = null;

/**
 * 939 trạm sạc **công cộng** (Q-P4-2 — PHASE4_VISUALIZATION.md §4.2).
 *
 * `power_kw_max_port`, `power_kw_site`, `current_type`, `scope` nạp một lần duy nhất
 * cùng Station core snapshot và phân loại `powerTier` ngay tại loader boundary.
 */
export function fetchStations(): Promise<StationPoint[]> {
  if (stationCache) return stationCache;
  stationCache = (async () => {
    await registerParquet(STATIONS);
    const t = await query(
      `SELECT station_id, station_code, lat, lng, scope, op_status,
              n_ports, current_type, power_kw_max_port, power_kw_site,
              name, address, operator, commune_name
       FROM read_parquet('${STATIONS}')
       WHERE lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY station_code`,
    );
    const ids = t.getChild("station_id")!;
    const codes = t.getChild("station_code")!;
    const lats = t.getChild("lat")!;
    const lngs = t.getChild("lng")!;
    const scopes = t.getChild("scope")!;
    const ops = t.getChild("op_status")!;
    const ports = t.getChild("n_ports")!;
    const cTypes = t.getChild("current_type")!;
    const maxKw = t.getChild("power_kw_max_port")!;
    const siteKw = t.getChild("power_kw_site")!;
    const names = t.getChild("name")!;
    const addresses = t.getChild("address")!;
    const operators = t.getChild("operator")!;
    const communeNames = t.getChild("commune_name")!;

    /** Arrow trả `null` và `undefined` lẫn lộn; đưa cả hai về `null`, không về `""`. */
    const text = (col: { get(i: number): unknown }, i: number): string | null => {
      const v = col.get(i);
      return v === null || v === undefined ? null : String(v);
    };

    const out: StationPoint[] = new Array(t.numRows);
    for (let i = 0; i < t.numRows; i++) {
      const scopeVal = String(scopes.get(i) ?? "");
      const maxPortKw = maxKw.get(i) === null || maxKw.get(i) === undefined ? null : Number(maxKw.get(i));
      const sKw = siteKw.get(i) === null || siteKw.get(i) === undefined ? null : Number(siteKw.get(i));
      const pVal = ports.get(i) === null || ports.get(i) === undefined ? null : Number(ports.get(i));
      const cTypeVal = cTypes.get(i) === null || cTypes.get(i) === undefined ? null : String(cTypes.get(i));

      out[i] = {
        id: String(ids.get(i)),
        stationCode: String(codes.get(i) ?? ""),
        lat: Number(lats.get(i)),
        lng: Number(lngs.get(i)),
        inScope: isInScope(scopeVal),
        scope: scopeVal,
        opStatus: String(ops.get(i) ?? "UNKNOWN"),
        nPorts: pVal,
        currentType: cTypeVal,
        powerKwMaxPort: maxPortKw,
        powerKwSite: sKw,
        powerTier: powerTierOf(maxPortKw),
        name: text(names, i),
        address: text(addresses, i),
        operator: text(operators, i),
        communeName: text(communeNames, i),
      };
    }
    return out;
  })().catch((error) => {
    stationCache = null;
    throw error;
  });
  return stationCache;
}

let opportunityCommuneCache: Promise<readonly OpportunityCommuneRow[]> | null = null;

/** Huỷ cache Q-P4-4 — chỉ `data/chart-session.ts` và test được gọi. */
export function resetOpportunityCommuneCache(): void {
  opportunityCommuneCache = null;
}

/**
 * Bảo toàn cộng tính của Q-P4-4 (§4.2): với dân số KHÔNG khuyết,
 * `total = within_2km + beyond_2km + distance_unknown`.
 *
 * Ba nhánh `FILTER` chia đôi trên `dist_station_network_m` phải phủ kín và không chồng
 * nhau. Một giá trị `NaN` trong cột cự ly làm cả `<= 2000` lẫn `> 2000` sai và rơi khỏi
 * cả ba nhóm — tổng vẫn ra một con số trông bình thường, còn thanh xếp hạng thì tụt xuống
 * mà không có dấu hiệu nào. Kiểm ở ĐÂY, ngay chỗ hàng vừa rời khỏi SQL.
 *
 * Sai số cho phép là 0,5 người: `sum()` trên số thực cộng dồn theo thứ tự khác nhau giữa
 * bốn biểu thức, nên đòi bằng nhau tuyệt đối sẽ báo động vì làm tròn dấu phẩy động.
 */
function assertPopulationConservation(rows: readonly OpportunityCommuneRow[]): void {
  for (const r of rows) {
    if (r.population_total === null || r.n_population_missing > 0) continue;
    const parts = r.population_within_2km + r.population_beyond_2km + r.population_distance_unknown;
    if (Math.abs(parts - r.population_total) > 0.5) {
      throw new Error(
        `Q-P4-4 vi phạm bảo toàn dân số ở xã ${r.commune_code}: ` +
          `tổng ${r.population_total} ≠ ${r.population_within_2km} + ${r.population_beyond_2km} + ` +
          `${r.population_distance_unknown} = ${parts}`,
      );
    }
  }
}

/**
 * Q-P4-4 — Opportunity grid-to-Commune aggregate (PHASE4_VISUALIZATION.md §4.2).
 * Nạp lười một lần khi mở lens Cơ hội.
 */
export function fetchOpportunityCommunes(): Promise<readonly OpportunityCommuneRow[]> {
  opportunityCommuneCache ??= (async () => {
    await registerParquet(GRID);
    const t = await query(
      `SELECT
        commune_code,
        commune_name,
        count(*) AS n_cells,
        count(*) FILTER (WHERE population IS NULL) AS n_population_missing,
        count(*) FILTER (WHERE population IS NOT NULL
                          AND dist_station_network_m IS NULL) AS n_distance_unknown,
        sum(population) AS population_total,
        coalesce(sum(population) FILTER (
          WHERE dist_station_network_m IS NOT NULL
        ), 0) AS population_measured,
        coalesce(sum(population) FILTER (
          WHERE dist_station_network_m <= ${BEYOND_2KM_M}
        ), 0) AS population_within_2km,
        coalesce(sum(population) FILTER (
          WHERE dist_station_network_m > ${BEYOND_2KM_M}
        ), 0) AS population_beyond_2km,
        coalesce(sum(population) FILTER (
          WHERE dist_station_network_m IS NULL
        ), 0) AS population_distance_unknown
      FROM read_parquet('${GRID}')
      WHERE commune_code IS NOT NULL
      GROUP BY commune_code, commune_name`,
    );
    const codes = t.getChild("commune_code")!;
    const names = t.getChild("commune_name")!;
    const cells = t.getChild("n_cells")!;
    const popMissing = t.getChild("n_population_missing")!;
    const distUnknownCells = t.getChild("n_distance_unknown")!;
    const popTotals = t.getChild("population_total")!;
    const popMeasured = t.getChild("population_measured")!;
    const popWithin2km = t.getChild("population_within_2km")!;
    const popBeyond2km = t.getChild("population_beyond_2km")!;
    const popDistUnknown = t.getChild("population_distance_unknown")!;

    const out: OpportunityCommuneRow[] = new Array(t.numRows);
    for (let i = 0; i < t.numRows; i++) {
      const totalValue = popTotals.get(i);
      out[i] = {
        commune_code: String(codes.get(i)),
        commune_name: String(names.get(i) ?? ""),
        n_cells: Number(cells.get(i)) || 0,
        n_population_missing: Number(popMissing.get(i)) || 0,
        n_distance_unknown: Number(distUnknownCells.get(i)) || 0,
        population_total: totalValue === null || totalValue === undefined ? null : Number(totalValue),
        population_measured: Number(popMeasured.get(i)) || 0,
        population_within_2km: Number(popWithin2km.get(i)) || 0,
        population_beyond_2km: Number(popBeyond2km.get(i)) || 0,
        population_distance_unknown: Number(popDistUnknown.get(i)) || 0,
      };
    }
    assertPopulationConservation(out);
    return out;
  })().catch((error) => {
    opportunityCommuneCache = null;
    throw error;
  });
  return opportunityCommuneCache;
}

// ── Panel TRẠM — §8a, M4.1 ─────────────────────────────────────────────────────

export const CONNECTORS = dataPath("connectors.parquet");

/**
 * Một trạm ở dạng panel cần — DESIGN.md §8a.
 *
 * Ba nguồn, tách theo độ bắt buộc: `stations` là entity lõi; `station_occupancy` và
 * `connectors` là evidence tùy chọn. Lỗi ở evidence không được xóa asset row hợp lệ.
 *
 * `occ` là `null` khi trạm không có dòng nào trong `station_occupancy`, và panel phải NÓI
 * ra điều đó thay vì in số 0 — ràng buộc 1 ở tầng chữ, đúng cùng luật `formatValue` giữ.
 */
export interface StationDetail {
  station: CellRow;
  occ: CellRow | null;
  connectors: { standard: string; nRows: number; nGuns: number }[];
  occStatus: "ready" | "not-found" | "unavailable";
  connectorsStatus: "ready" | "unavailable";
}

/**
 * Đọc một trạm theo `station_id`.
 *
 * Kiểm hình dạng TRƯỚC khi nhét vào SQL, cùng luật `fetchCell` áp cho mã H3: khoá `c` là
 * dữ liệu lạ đến từ URL, và `STATION_ID_RE` là thứ chặn nó — không phải sự tin tưởng.
 */
export async function fetchStation(id: string): Promise<StationDetail | null> {
  if (!STATION_ID_RE.test(id)) return null;
  await registerParquet(STATIONS);
  const t = await query(`SELECT s.* FROM read_parquet('${STATIONS}') s WHERE s.station_id = '${id}'`);
  if (t.numRows === 0) return null;
  const row = t.get(0)!;
  const station: CellRow = {};
  for (const k of STATION_COLUMNS) station[k] = toCellValue(row[k]);

  // Occupancy and connector registry are optional evidence. A failure in either must not
  // erase the valid Station asset row that was already resolved above.
  let occ: CellRow | null = null;
  let occStatus: StationDetail["occStatus"] = "not-found";
  try {
    await registerParquet(OCCUPANCY);
    const o = await query(
      `SELECT o.* FROM read_parquet('${OCCUPANCY}') o
       JOIN read_parquet('${STATIONS}') s ON s.station_code = o.station_code
       WHERE s.station_id = '${id}'`,
    );
    if (o.numRows > 0) {
      const occRow = o.get(0)!;
      occ = {};
      for (const k of OCC_COLUMNS) occ[k] = toCellValue(occRow[k]);
      occStatus = "ready";
    }
  } catch {
    occStatus = "unavailable";
  }

  const connectors: StationDetail["connectors"] = [];
  let connectorsStatus: StationDetail["connectorsStatus"] = "ready";
  try {
    await registerParquet(CONNECTORS);
    const c = await query(
      `SELECT c.connector_standard AS std, count(*) AS n_rows, sum(c.count_total) AS n_guns
       FROM read_parquet('${CONNECTORS}') c
       JOIN read_parquet('${STATIONS}') s ON s.station_code = c.station_code
       WHERE s.station_id = '${id}'
       GROUP BY 1 ORDER BY 3 DESC`,
    );
    for (let i = 0; i < c.numRows; i++) {
      const r = c.get(i)!;
      connectors.push({
        standard: String(r["std"]),
        nRows: Number(r["n_rows"]),
        nGuns: Number(r["n_guns"]),
      });
    }
  } catch {
    connectorsStatus = "unavailable";
  }

  return { station, occ, connectors, occStatus, connectorsStatus };
}

/** Cột của `stations.parquet` mà panel TRẠM đọc. Khai tường minh để đừng in cả bảng ra. */
const STATION_COLUMNS = [
  "station_id",
  "station_code",
  "name",
  "address",
  "operator",
  "station_type",
  "vehicle_class",
  "op_status",
  "access",
  "current_type",
  "n_ports",
  "n_guns_imputed",
  "power_kw_max_port",
  "power_kw_site",
  "port_config_source",
  "verified_official",
  "freshness",
  "has_timeseries",
  "commune_code",
  "commune_name",
  "scope",
  "h3_r8",
  "lat",
  "lng",
] as const;

/** Cột của `station_occupancy.parquet` mà panel TRẠM đọc. */
const OCC_COLUMNS = [
  "util",
  "util_p95",
  "saturation_frac",
  "duty_cycle",
  "grade",
  "coverage",
  "obs_days",
  "util_reportable",
  "occ_status",
  "shape_class",
  "peak_hour",
  "peak_dow",
  "night_share",
  "weekend_ratio",
  "ever_active",
  "util_denominator_ports",
  "util_pctl",
  "util_pctl_peer",
  "window_start_utc",
  "window_end_utc",
  "snapshot_id",
] as const;
