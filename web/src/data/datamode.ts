/**
 * Truy vấn riêng của chế độ DỮ LIỆU — DESIGN.md §3f, mở rộng ở Phase 8 §5.
 *
 * §3f nói rõ chế độ này **không thêm khái niệm dữ liệu nào**: mọi khối đọc từ file đã ship
 * cộng manifest. File này chỉ làm những việc manifest không làm được — *phân trang một
 * bảng*, *tra một cột hạng mục theo trạm*. Không có phép tính nào ở đây; phép tính sống ở
 * `viz/occ.ts` như mọi khi.
 *
 * ── Vì sao SẮP XẾP chạy trong SQL chứ không trong JS ─────────────────────────────────
 *
 * Không phải chuyện tốc độ (4.400 dòng thì JS cũng xong): nó là chuyện **null**. `ORDER BY`
 * của DuckDB đặt NULL ở một đầu XÁC ĐỊNH, còn `Array.sort` của JS đẩy `undefined` xuống cuối
 * bất kể chiều — tức cùng một bảng sắp xuôi và sắp ngược cho hai tập "dòng đầu" không đối
 * xứng, và người đọc không có cách nào biết. §5.1 nói rõ lý do này **sống nguyên qua Phase 8
 * và là ràng buộc chi phối**.
 *
 * Hai bảng GeoJSON (`commune`, `poi`) không đi qua DuckDB nên chúng buộc phải sắp trong JS.
 * `compareWithNullsLast` ở dưới sao lại đúng ngữ nghĩa `NULLS LAST` của DuckDB ở CẢ HAI chiều,
 * và `test/null-states.test.ts` chốt tính đối xứng ấy — nếu không thì hai bảng trong cùng một
 * màn hình trả lời "dòng đầu là gì" theo hai luật khác nhau.
 *
 * ── Luật hiệu năng (§5.2) ────────────────────────────────────────────────────────────
 *
 * 1. **Không bao giờ `SELECT *`.** Chiếu cửa sổ cột đang hiện + khoá hàng + cột bạn đồng
 *    hành của hợp đồng null. Lưới có 61 cột; một trang 50 dòng vật chất hoá 3.050 ô Arrow để
 *    vẽ ra ~600. Cả schema cũng đọc bằng `DESCRIBE`, không bằng `SELECT * LIMIT 0`.
 * 2. **Schema một lần cho mỗi (bảng, tỉnh)**, nhớ lại — thay cho truy vấn `LIMIT 0` mỗi trang.
 * 3. **`count(*)` nhớ theo (bảng, bộ lọc)**, không theo offset. Số dòng không thể đổi giữa
 *    hai trang của cùng một bộ lọc. Bớt 1 trong 3 truy vấn mỗi lần bấm trang (AC-17).
 * 4. **Cột hình học bị chặn khỏi bảng phẳng.** `roads.coords` là cột list; `SELECT *` trên
 *    124.636 dòng vật chất hoá 124.636 mảng toạ độ vào JS.
 * 5. **Offset tới 10.000 dòng, keyset ở trên đó.** DuckDB phải quét để thoả một `OFFSET` lớn.
 * 6. **Không ảo hoá dòng.** Trang 50 (tuỳ chọn 100/200); một DOM có chặn thắng một bộ mô
 *    phỏng vị trí cuộn ở cỡ này.
 * 7. **Dùng lại phép khử trùng promise của `registerParquet`** — nó có sẵn chính vì hai lời
 *    gọi đăng ký cùng một file có thể treo worker đơn luồng.
 * 8. **Một truy vấn đang bay cho MỖI BẢNG.** Bấm sắp xếp liên tục thì huỷ-và-thay chứ không
 *    xếp hàng. Bộ đếm tách theo bảng: một bộ đếm chung làm truy vấn của bảng A bị truy vấn
 *    của bảng B "vượt mặt", và lỗi ấy hiện lên màn hình như một lỗi truy vấn thật.
 */

import { query, registerParquet } from "./duckdb";
import { companionColumns, type TableId } from "./null-states";
import { dataPath } from "./province";
import { OCCUPANCY } from "./queries";

/** Số dòng mỗi trang. Đủ để cuộn thấy hình dạng, đủ nhỏ để render tức thì. */
export const PAGE_SIZE = 50;

/** Trên ngưỡng này thì phân trang bằng keyset chứ không bằng `OFFSET` — §5.2 luật 5. */
export const KEYSET_THRESHOLD_ROWS = 10_000;

/** Trần dòng cho các định dạng phải dựng cây JS (§4.3). Dùng chung với `export.ts`. */
export const JS_MATERIALIZE_ROW_CAP = 50_000;

export type DataModeTableId =
  | "grid"
  | "stations"
  | "station_occupancy"
  | "roads"
  | "commune"
  | "poi";

export interface DataModeTableMeta {
  id: DataModeTableId;
  label: string;
  filename: string;
  isParquet: boolean;
  primaryKey: string;
  desc: string;
  /** Cột đem đi so với chuỗi người dùng gõ. Rỗng ⇒ bảng không lọc bằng ô tìm kiếm. */
  searchColumns: readonly string[];
  /**
   * Cột hình học bị CHẶN khỏi bảng phẳng (§5.2 luật 4). Giá trị vẫn tới được qua xuất dữ liệu.
   */
  geometryColumns: readonly string[];
}

export const DATA_TABLES: readonly DataModeTableMeta[] = [
  {
    id: "grid",
    label: "Lưới H3 r8 (grid_h3_r8)",
    filename: dataPath("grid_h3_r8.parquet"),
    isParquet: true,
    primaryKey: "h3_r8",
    desc: "Bảng lưới cơ sở cấp ô H3 độ phân giải 8 (~0,74 km²).",
    searchColumns: ["commune_name", "h3_r8"],
    geometryColumns: [],
  },
  {
    id: "stations",
    label: "Trạm sạc (stations)",
    filename: dataPath("stations.parquet"),
    isParquet: true,
    primaryKey: "station_code",
    desc: "Danh mục trạm sạc công cộng đã lắp đặt.",
    searchColumns: ["name", "station_code", "address"],
    geometryColumns: [],
  },
  {
    id: "station_occupancy",
    label: "Mức sử dụng trạm (station_occupancy)",
    filename: dataPath("station_occupancy.parquet"),
    isParquet: true,
    primaryKey: "station_code",
    desc: "Chỉ số mức sử dụng telemetry tổng hợp 30 ngày.",
    searchColumns: ["station_code", "occ_status"],
    geometryColumns: [],
  },
  {
    id: "roads",
    label: "Mạng đường (roads)",
    filename: dataPath("roads.parquet"),
    isParquet: true,
    primaryKey: "osm_id",
    desc: "Mạng đường xe công cộng đi được và khoảng cách tới trạm.",
    searchColumns: ["road_class", "osm_id"],
    geometryColumns: ["coords"],
  },
  {
    id: "commune",
    label: "Xã / phường (commune)",
    filename: dataPath("commune.geojson"),
    isParquet: false,
    primaryKey: "commune_code",
    desc: "Đơn vị hành chính cấp xã/phường kèm chỉ số tổng hợp.",
    searchColumns: ["commune_name", "commune_code"],
    geometryColumns: [],
  },
  {
    id: "poi",
    label: "Điểm quan tâm (poi)",
    filename: dataPath("poi.geojson"),
    isParquet: false,
    primaryKey: "osm_id",
    desc: "Điểm và đa giác quan tâm trực quan từ OSM.",
    searchColumns: ["name", "tag", "group"],
    geometryColumns: [],
  },
] as const;

export function tableMeta(id: DataModeTableId): DataModeTableMeta {
  const m = DATA_TABLES.find((t) => t.id === id);
  if (!m) throw new Error(`Bảng không có trong DATA_TABLES: ${id}`);
  return m;
}

export interface TablePage {
  tableId: DataModeTableId;
  /** Cột được VẼ. Cột bạn đồng hành có trong `rows` nhưng không có ở đây. */
  columns: string[];
  rows: Record<string, unknown>[];
  /** Tổng số dòng SAU bộ lọc — mẫu số của "đang xem 50/4.400". */
  total: number;
  /** Tổng số dòng TRƯỚC bộ lọc. Một tử số không có mẫu số là một nửa sự thật (§2.1). */
  totalUnfiltered: number;
  /** Bảng có nhiều dòng tới mức phải keyset thay vì offset? Bench đọc cờ này. */
  keyset: boolean;
}

/** Truy vấn bị một truy vấn mới hơn TRÊN CÙNG BẢNG thay thế. Không phải lỗi — bỏ qua nó. */
export class SupersededError extends Error {
  constructor(tableId: string) {
    super(`Truy vấn bảng ${tableId} đã bị một truy vấn mới hơn thay thế`);
    this.name = "SupersededError";
  }
}

export function isSuperseded(e: unknown): boolean {
  return e instanceof SupersededError || (e instanceof Error && e.name === "SupersededError");
}

// ── Bộ nhớ đệm ────────────────────────────────────────────────────────────────────────
//
// Khoá LUÔN mang mã tỉnh, kể cả khi bản phát hành này ghim một tỉnh (`province.ts`). Một bộ
// đệm không khoá theo tỉnh là một quả mìn hẹn giờ cho ngày chiều tỉnh mở lại: nó trả schema
// và số đếm của tỉnh trước trong khi tiêu đề đã đổi.

const schemaCache = new Map<string, string[]>();
const countCache = new Map<string, number>();
const geojsonCache = new Map<string, Array<Record<string, unknown>>>();

/** Một bộ đếm cho MỖI BẢNG — §5.2 luật 8. Chung một bộ đếm là để hai bảng vượt mặt nhau. */
const querySequence = new Map<DataModeTableId, number>();

function nextSeq(tableId: DataModeTableId): number {
  const n = (querySequence.get(tableId) ?? 0) + 1;
  querySequence.set(tableId, n);
  return n;
}

function assertCurrent(tableId: DataModeTableId, seq: number): void {
  if (querySequence.get(tableId) !== seq) throw new SupersededError(tableId);
}

/** Chỉ để test: xoá sạch đệm giữa hai phép đo. */
export function __resetDataModeCaches(): void {
  schemaCache.clear();
  countCache.clear();
  geojsonCache.clear();
  querySequence.clear();
}

/**
 * Schema một lần cho mỗi (bảng, tỉnh) — §5.2 luật 2.
 *
 * `DESCRIBE` chứ không `SELECT * … LIMIT 0`: AC-16 cấm `SELECT *` ở workspace này không kèm
 * ngoại lệ nào, và `DESCRIBE` là câu trả lời đúng cho câu hỏi đang hỏi (bảng có cột gì) thay
 * vì một phép chiếu 0 dòng tình cờ cũng trả lời được.
 */
export async function getTableSchema(
  tableId: DataModeTableId,
  provinceCode = "default",
): Promise<string[]> {
  const cacheKey = `${provinceCode}:${tableId}`;
  const hit = schemaCache.get(cacheKey);
  if (hit) return hit;

  const meta = tableMeta(tableId);
  let cols: string[];
  if (meta.isParquet) {
    await registerParquet(meta.filename);
    const t = await query(`DESCRIBE SELECT * FROM read_parquet('${meta.filename}')`);
    const names = t.getChild("column_name")!;
    cols = [];
    for (let i = 0; i < t.numRows; i++) cols.push(String(names.get(i)));
  } else {
    const rows = await loadGeoJsonRows(tableId as "commune" | "poi");
    cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
  }
  cols = cols.filter((c) => !meta.geometryColumns.includes(c));
  schemaCache.set(cacheKey, cols);
  return cols;
}

async function loadGeoJsonRows(
  tableId: "commune" | "poi",
): Promise<Array<Record<string, unknown>>> {
  const url = tableId === "commune" ? dataPath("commune.geojson") : dataPath("poi.geojson");
  const hit = geojsonCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ${url} (HTTP ${res.status})`);
  const fc = await res.json();
  const rows = ((fc.features ?? []) as Array<{ properties: Record<string, unknown> }>).map(
    (f) => f.properties,
  );
  geojsonCache.set(url, rows);
  return rows;
}

/**
 * So sánh sao lại ngữ nghĩa `NULLS LAST` của DuckDB — xem docstring đầu file.
 *
 * `Array.sort` để nguyên thì đẩy `undefined` xuống cuối theo cả hai chiều nhưng xử lý `null`
 * như một giá trị so sánh được, nên `null` trôi lên đầu khi sắp giảm dần. Hàm này giữ mọi ô
 * trống ở cuối theo CẢ HAI chiều, đúng như `ORDER BY … NULLS LAST` mà nhánh DuckDB đang dùng.
 */
export function compareWithNullsLast(a: unknown, b: unknown, desc: boolean): number {
  const na = a === null || a === undefined;
  const nb = b === null || b === undefined;
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  if (typeof a === "number" && typeof b === "number") return desc ? b - a : a - b;
  const sa = String(a);
  const sb = String(b);
  return desc ? sb.localeCompare(sa, "vi") : sa.localeCompare(sb, "vi");
}

/** Mệnh đề `WHERE` của ô tìm kiếm. Nháy đơn được nhân đôi — dữ liệu từ UI vẫn là dữ liệu lạ. */
export function buildWhere(meta: DataModeTableMeta, filter: string, columns: string[]): string {
  const f = filter.trim().replace(/'/g, "''");
  if (!f) return "";
  const cols = meta.searchColumns.filter((c) => columns.includes(c));
  if (cols.length === 0) return "";
  const preds = cols.map(
    (c) => `lower(CAST("${c}" AS VARCHAR)) LIKE lower('%${f}%')`,
  );
  return `WHERE ${preds.join(" OR ")}`;
}

/**
 * Một trang của bất kỳ bảng nào trong sáu bảng đã ship.
 *
 * `rows` mang cột ĐANG HIỆN **cộng** cột bạn đồng hành của hợp đồng null. Cột thêm không vào
 * `columns` nên chúng không được vẽ; chúng ở đó để `resolveRowNullState` đọc được lý do một
 * ô trống là trống. Không có chúng, giấu `n_stations` đi là mọi ô trống `util_cell` đọc thành
 * "ô không có trạm" — một trạng thái suy ra từ dữ liệu vắng mặt, đúng cái §1.1 Rule 0 cấm.
 */
export async function fetchTablePage(opts: {
  tableId: DataModeTableId;
  sort: string | null;
  desc: boolean;
  offset: number;
  limit?: number;
  filter: string;
  visibleColumns?: string[];
  provinceCode?: string;
}): Promise<TablePage> {
  const {
    tableId,
    sort,
    desc,
    offset,
    limit = PAGE_SIZE,
    filter,
    visibleColumns,
    provinceCode,
  } = opts;
  const seq = nextSeq(tableId);
  const meta = tableMeta(tableId);
  const prov = provinceCode ?? "default";

  const allColumns = await getTableSchema(tableId, prov);
  const visible =
    visibleColumns && visibleColumns.length > 0
      ? allColumns.filter((c) => visibleColumns.includes(c) || c === meta.primaryKey)
      : allColumns;

  // Cột bạn đồng hành: nạp về nhưng KHÔNG vẽ.
  const companions = companionColumns(tableId as TableId).filter(
    (c) => allColumns.includes(c) && !visible.includes(c),
  );
  const fetched = [...visible, ...companions];

  const sortCol = sort && allColumns.includes(sort) ? sort : null;
  const where = buildWhere(meta, filter, allColumns);

  if (meta.isParquet) {
    const filePath = meta.filename;
    await registerParquet(filePath);

    const from = `read_parquet('${filePath}')`;

    const totalKey = `${prov}:${tableId}:__all__`;
    let totalUnfiltered = countCache.get(totalKey) ?? -1;
    if (totalUnfiltered < 0) {
      const t = await query(`SELECT count(*) AS n FROM ${from}`);
      totalUnfiltered = Number(t.get(0)!["n"]);
      countCache.set(totalKey, totalUnfiltered);
    }

    const countKey = `${prov}:${tableId}:${where}`;
    let total = countCache.get(countKey) ?? -1;
    if (total < 0) {
      const t = await query(`SELECT count(*) AS n FROM ${from} ${where}`);
      total = Number(t.get(0)!["n"]);
      countCache.set(countKey, total);
    }
    assertCurrent(tableId, seq);

    // §5.2 luật 5 — trên ngưỡng thì keyset. Khoá sắp xếp luôn kèm khoá hàng để thứ tự tổng
    // là TOÀN PHẦN: sắp theo một cột có trùng lặp mà không phá hoà là bỏ sót và lặp dòng khi
    // lật trang.
    const keyset = total > KEYSET_THRESHOLD_ROWS;
    const orderCols = sortCol
      ? `"${sortCol}" ${desc ? "DESC" : "ASC"} NULLS LAST, "${meta.primaryKey}" ASC`
      : `"${meta.primaryKey}" ASC`;
    const select = fetched.map((c) => `"${c}"`).join(", ");
    const start = Math.max(0, Math.floor(offset));

    // Trang bằng keyset trên MỘT truy vấn: `qualify row_number()` cho DuckDB làm cùng việc mà
    // không phải mang một con trỏ qua lại giữa React và worker (một con trỏ như thế sẽ hỏng
    // ngay lần đầu ai đó nhảy tới trang cuối).
    const sql = keyset
      ? `WITH ranked AS (
           SELECT ${select}, row_number() OVER (ORDER BY ${orderCols}) AS __rn FROM ${from} ${where}
         )
         SELECT ${select} FROM ranked WHERE __rn > ${start} AND __rn <= ${start + limit}
         ORDER BY __rn`
      : `SELECT ${select} FROM ${from} ${where} ORDER BY ${orderCols} LIMIT ${limit} OFFSET ${start}`;

    const t = await query(sql);
    assertCurrent(tableId, seq);

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < t.numRows; i++) {
      const r = t.get(i)!;
      const out: Record<string, unknown> = {};
      for (const c of fetched) out[c] = r[c];
      rows.push(out);
    }
    return { tableId, columns: visible, rows, total, totalUnfiltered, keyset };
  }

  // Bảng GeoJSON (commune / poi) — nằm trong bộ nhớ, không qua DuckDB.
  const allRows = await loadGeoJsonRows(tableId as "commune" | "poi");
  const totalUnfiltered = allRows.length;
  const q = filter.trim().toLowerCase();
  const cols = meta.searchColumns.filter((c) => allColumns.includes(c));
  const filtered = q
    ? allRows.filter((r) =>
        cols.some((c) => String(r[c] ?? "").toLowerCase().includes(q)),
      )
    : allRows;

  const sorted = sortCol ? [...filtered] : filtered;
  if (sortCol) {
    sorted.sort((a, b) => {
      const c = compareWithNullsLast(a[sortCol], b[sortCol], desc);
      // Phá hoà bằng khoá hàng, cùng lý do với nhánh SQL ở trên.
      return c !== 0 ? c : compareWithNullsLast(a[meta.primaryKey], b[meta.primaryKey], false);
    });
  }

  const rows = sorted.slice(offset, offset + limit).map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of fetched) out[c] = r[c];
    return out;
  });
  assertCurrent(tableId, seq);
  return {
    tableId,
    columns: visible,
    rows,
    total: filtered.length,
    totalUnfiltered,
    keyset: false,
  };
}

/**
 * `station_code → shape_class` — nguồn của small multiples (§3f-5).
 *
 * Chỉ hai cột, 703 dòng. Nó được tra theo `station_code` chứ không theo chỉ số mảng vì
 * `fetchOccupancy` sắp trạm theo `station_code` còn bảng này thì DuckDB trả theo thứ tự
 * file — dựa vào hai thứ tự trùng nhau là dựa vào một sự tình cờ.
 */
export async function fetchShapeClasses(): Promise<Map<string, string>> {
  await registerParquet(OCCUPANCY);
  const t = await query(
    `SELECT station_code, shape_class FROM read_parquet('${OCCUPANCY}')`,
  );
  const codes = t.getChild("station_code")!;
  const cls = t.getChild("shape_class")!;
  const out = new Map<string, string>();
  for (let i = 0; i < t.numRows; i++) {
    const c = cls.get(i);
    // Trạm không có nhãn ⇒ KHÔNG vào map. Nó sẽ không thuộc dạng nào, và small multiples
    // đếm nó ra thay vì gán bừa vào `KHONG_XEP_LOAI` — hằng đó là một nhãn THẬT của dữ
    // liệu ("đã xét, không xếp được"), khác hẳn "chưa xét".
    if (c !== null && c !== undefined) out.set(String(codes.get(i)), String(c));
  }
  return out;
}
