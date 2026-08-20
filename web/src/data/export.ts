/**
 * Máy xuất dữ liệu — Phase 8 §4.
 *
 * Ràng buộc quyết định hình dạng file này, cả ba đều kiểm được trong cây mã:
 * không mạng lúc chạy (`vite.config.ts` tự host bundle DuckDB có chủ ý); **không COEP**, do
 * đó không `SharedArrayBuffer` và không WASM đa luồng (bật lên là chết tile OpenFreeMap);
 * không thêm phụ thuộc nào.
 *
 * | định dạng | cơ chế |
 * |---|---|
 * | CSV     | `COPY … TO` vào FS ảo của WASM → `copyFileToBuffer` → `Blob` → thẻ neo → `dropFile` |
 * | Parquet | cùng đường, `(FORMAT PARQUET, COMPRESSION ZSTD)`. Bộ GHI Parquet là lõi DuckDB, không phải extension nạp thêm — đã xác nhận trên chính bản WASM đang ship |
 * | Arrow   | `tableToIPC` trên bảng Arrow đã cầm sẵn — không SQL, không FS ảo |
 * | JSON / NDJSON | JS trên bảng Arrow |
 * | GeoJSON | điểm từ `lat`/`lng`; đa giác ô qua `h3-js` `cellToBoundary`; `roads.coords` sẵn là mảng vị trí |
 *
 * ── Vì sao có `toPlainJson` ──────────────────────────────────────────────────────────
 *
 * Arrow trả cột int64 thành `BigInt`, và `JSON.stringify` NÉM trên `BigInt`. Cả sáu bảng đều
 * có cột i64 (`n_stations`, `n_ports`, `osm_id`…), nên nếu không chuẩn hoá thì cả ba đường
 * JSON/NDJSON/GeoJSON hỏng trên MỌI bảng — không phải một ca biên. Bảng phẳng đã có `cellOf`
 * cho đúng chuyện này; đường xuất phải có bản của nó, và `test/data-health.test.ts` chốt.
 *
 * ── Xuất phẩm là hiện vật kiểm toán, nên nó CHỞ THEO XUẤT XỨ ─────────────────────────
 *
 * Mọi định dạng, không ngoại lệ: JSON/GeoJSON nhúng `_meta`; Parquet nhúng cùng nội dung ấy
 * vào KV metadata của chính file; CSV/Arrow/NDJSON không có chỗ nhúng nên tải kèm một file
 * `.meta.json` thứ hai. Một bản xuất âm thầm đánh rơi xuất xứ thì không phải hiện vật kiểm
 * toán — nó chỉ là một đống số.
 */

import { tableToIPC } from "apache-arrow";
import { cellToBoundary } from "h3-js";
import {
  JS_MATERIALIZE_ROW_CAP,
  buildWhere,
  compareWithNullsLast,
  tableMeta,
  type DataModeTableId,
} from "./datamode";
import { getDb, query, registerParquet } from "./duckdb";
import type { Manifest } from "./manifest";

export type ExportFormat = "csv" | "parquet" | "arrow" | "json" | "ndjson" | "geojson";

/** Định dạng phải dựng cây JS trước khi ghi, nên chúng chịu trần `JS_MATERIALIZE_ROW_CAP`. */
const MATERIALIZING: ReadonlySet<ExportFormat> = new Set(["json", "ndjson", "geojson", "arrow"]);

export interface ExportMeta {
  province: { code: string; name: string } | null;
  table: DataModeTableId;
  exported_utc: string;
  vintage: Manifest["vintage"];
  snapshots?: Manifest["snapshots"];
  /** Năm phép lọc của pipeline (§2.9) — cái gì đã bị gỡ TRƯỚC KHI gói này tồn tại. */
  pipeline_filters?: Manifest["filters"];
  /** Ô tìm kiếm của bảng phẳng, hoặc `null`. */
  filter_applied: string | null;
  /** Bộ lọc phân tích đang bật của app (Phase 4), hoặc `null` nếu nó không chạm bảng này. */
  analysis_filter: string | null;
  /** Cột thực sự có trong file. Người chọn ẩn cột thì file phải khớp cái họ thấy. */
  columns: string[];
  columns_hidden: string[];
  /** Tử số và mẫu số. Một tử số đứng một mình là một nửa sự thật (§2.1). */
  exported_rows: number;
  total_rows: number;
}

/** Bao nhiêu file một lần bấm sẽ lưu — UI phải NÓI RA trước khi bấm (§4.4). */
export function fileCountFor(format: ExportFormat): number {
  return format === "json" || format === "geojson" || format === "parquet" ? 1 : 2;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Giá trị Arrow → giá trị JSON hoá được. `BigInt` là ca bắt buộc; xem docstring đầu file.
 *
 * `Number(bigint)` mất chính xác trên 2^53. Không cột nào trong gói này tới gần mức đó
 * (`osm_id` lớn nhất khoảng 1,3·10^9), nhưng phép đổi vẫn kiểm cận trên rồi mới đổi, vì
 * "dữ liệu hôm nay không có" chưa bao giờ là một lớp bảo vệ.
 */
export function toPlainJson(v: unknown): unknown {
  if (typeof v === "bigint") {
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) {
      return v.toString();
    }
    return Number(v);
  }
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(toPlainJson);
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
  if (typeof v === "object") {
    // Vector/Struct của Arrow lặp được nhưng không phải mảng thật.
    const anyV = v as { toArray?: () => unknown; [Symbol.iterator]?: unknown };
    if (typeof anyV[Symbol.iterator] === "function") {
      return Array.from(v as Iterable<unknown>).map(toPlainJson);
    }
    if (typeof anyV.toArray === "function") return toPlainJson(anyV.toArray());
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = toPlainJson(val);
    }
    return out;
  }
  return v;
}

const stringifyMeta = (m: ExportMeta) => JSON.stringify(m, null, 2);

export function buildExportFilename(
  provinceCode: string,
  tableId: DataModeTableId,
  exportedUtc: string,
  ext: string,
): string {
  const d = (exportedUtc || new Date().toISOString()).slice(0, 10).replace(/-/g, "");
  return `evcs_${provinceCode}_${tableId}_${d}.${ext}`;
}

export interface ExportOptions {
  tableId: DataModeTableId;
  format: ExportFormat;
  manifest: Manifest;
  filter: string;
  sortCol: string | null;
  sortDesc: boolean;
  /** Cột đang hiện. Bỏ trống ⇒ mọi cột. File PHẢI khớp cái người dùng thấy. */
  visibleColumns?: string[];
  /** Mọi cột của bảng, để tính `columns_hidden`. Bỏ trống ⇒ suy từ `visibleColumns`. */
  allColumns?: string[];
  /** Mô tả bộ lọc phân tích đang bật, nếu nó có chạm bảng này. */
  analysisFilter?: string | null;
}

export async function exportDataset(
  opts: ExportOptions,
): Promise<{ filename: string; rows: number; files: number }> {
  const { tableId, format, manifest, filter, analysisFilter } = opts;
  const meta = tableMeta(tableId);
  const prov = manifest.province ?? null;
  // Không có `province` (manifest toàn quốc) thì mã tỉnh là `vn`. Rơi về `"01"` như bản trước
  // là dán nhãn Hà Nội lên một file không phải của Hà Nội.
  const provCode = prov?.province_code ?? "vn";
  const dateStr = manifest.exported_utc ?? new Date().toISOString();
  const base = buildExportFilename(provCode, tableId, dateStr, "");

  const allColumns = opts.allColumns ?? opts.visibleColumns ?? [];
  const visible =
    opts.visibleColumns && opts.visibleColumns.length > 0
      ? opts.visibleColumns.filter((c) => !meta.geometryColumns.includes(c))
      : allColumns.filter((c) => !meta.geometryColumns.includes(c));
  const hidden = allColumns.filter((c) => !visible.includes(c));

  // GeoJSON cần cột hình học dù người dùng đã ẩn nó — đó là thứ dựng nên hình dạng. Nó KHÔNG
  // vào `properties`, và `_meta.columns` vẫn nói đúng cái gì có trong thuộc tính.
  const geomNeeded =
    format === "geojson"
      ? [
          ...(tableId === "grid" ? ["h3_r8"] : []),
          ...(tableId === "stations" ? ["lat", "lng"] : []),
          ...(tableId === "roads" ? ["coords"] : []),
        ]
      : [];

  const mkMeta = (exported: number, total: number): ExportMeta => ({
    province: prov ? { code: prov.province_code, name: prov.province_name } : null,
    table: tableId,
    exported_utc: dateStr,
    vintage: manifest.vintage,
    snapshots: manifest.snapshots,
    pipeline_filters: manifest.filters,
    filter_applied: filter.trim() || null,
    analysis_filter: analysisFilter ?? null,
    columns: visible,
    columns_hidden: hidden,
    exported_rows: exported,
    total_rows: total,
  });

  if (meta.isParquet) {
    return exportParquetTable({
      opts,
      meta,
      base,
      visible,
      geomNeeded,
      mkMeta,
    });
  }
  return exportGeoJsonTable({ opts, meta, base, visible, mkMeta });
}

// ── Bảng Parquet, qua DuckDB ──────────────────────────────────────────────────────────

async function exportParquetTable(a: {
  opts: ExportOptions;
  meta: ReturnType<typeof tableMeta>;
  base: string;
  visible: string[];
  geomNeeded: string[];
  mkMeta: (exported: number, total: number) => ExportMeta;
}): Promise<{ filename: string; rows: number; files: number }> {
  const { opts, meta, base, visible, geomNeeded, mkMeta } = a;
  const { tableId, format, filter, sortCol, sortDesc } = opts;
  const filePath = meta.filename;
  await registerParquet(filePath);

  const schemaT = await query(`DESCRIBE SELECT * FROM read_parquet('${filePath}')`);
  const nameCol = schemaT.getChild("column_name")!;
  const schema: string[] = [];
  for (let i = 0; i < schemaT.numRows; i++) schema.push(String(nameCol.get(i)));

  const wanted = (visible.length > 0 ? visible : schema).filter((c) => schema.includes(c));
  const fetched = [...new Set([...wanted, ...geomNeeded.filter((c) => schema.includes(c))])];
  // AC-16: chiếu tường minh, không `SELECT *`. Với `roads` điều đó cũng giữ `coords` khỏi tràn
  // vào JS ở mọi định dạng trừ GeoJSON, nơi nó CHÍNH LÀ hình dạng.
  const select = fetched.map((c) => `"${c}"`).join(", ");
  const from = `read_parquet('${filePath}')`;
  const where = buildWhere(meta, filter, schema);
  const order = sortCol && schema.includes(sortCol)
    ? `ORDER BY "${sortCol}" ${sortDesc ? "DESC" : "ASC"} NULLS LAST, "${meta.primaryKey}" ASC`
    : "";

  const totalT = await query(`SELECT count(*) AS n FROM ${from}`);
  const totalRows = Number(totalT.get(0)!["n"]);
  const filteredT = await query(`SELECT count(*) AS n FROM ${from} ${where}`);
  const exportedRows = Number(filteredT.get(0)!["n"]);

  if (MATERIALIZING.has(format) && exportedRows > JS_MATERIALIZE_ROW_CAP) {
    throw new Error(
      `${exportedRows.toLocaleString("vi-VN")} dòng vượt trần ${JS_MATERIALIZE_ROW_CAP.toLocaleString("vi-VN")} dòng của định dạng ${format.toUpperCase()}. Dùng CSV hoặc Parquet — hai định dạng đó ghi thẳng trong DuckDB, không dựng cây trong JS.`,
    );
  }

  const metaObj = mkMeta(exportedRows, totalRows);
  const projected = `SELECT ${select} FROM ${from} ${where} ${order}`;

  // CSV và Parquet: `COPY` vào FS ảo, MỘT `Uint8Array` băng qua ranh giới worker. 15 MB qua
  // `Blob` thì ổn; 15 MB do JS nối chuỗi thì không.
  if (format === "csv" || format === "parquet") {
    const isCsv = format === "csv";
    const tmp = `export_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
    const db = await getDb();
    try {
      const copyOpts = isCsv
        ? "(FORMAT CSV, HEADER)"
        : // Xuất xứ NHÚNG cho Parquet: định dạng CÓ chỗ chứa, nên nó không được đi kèm file
          // phụ. Nháy đơn trong JSON phải nhân đôi để chuỗi SQL không đứt.
          `(FORMAT PARQUET, COMPRESSION ZSTD, KV_METADATA {evcs_meta: '${stringifyMeta(metaObj).replace(/'/g, "''")}'})`;
      await query(`COPY (${projected}) TO '${tmp}' ${copyOpts}`);
      const buf = await db.copyFileToBuffer(tmp);
      await db.dropFile(tmp);
      const name = `${base}${isCsv ? "csv" : "parquet"}`;
      triggerDownload(
        new Blob([buf as unknown as BlobPart], {
          type: isCsv ? "text/csv;charset=utf-8;" : "application/octet-stream",
        }),
        name,
      );
      if (isCsv) downloadSidecar(metaObj, base);
      return { filename: name, rows: exportedRows, files: fileCountFor(format) };
    } finally {
      // FS ảo phải sạch dù đường nào cũng đi qua đây (AC-14). `dropFile` hai lần là vô hại.
      await db.dropFile(tmp).catch(() => {});
    }
  }

  const t = await query(projected);

  if (format === "arrow") {
    const name = `${base}arrow`;
    triggerDownload(
      new Blob([tableToIPC(t, "file") as unknown as BlobPart], {
        type: "application/vnd.apache.arrow.file",
      }),
      name,
    );
    downloadSidecar(metaObj, base);
    return { filename: name, rows: exportedRows, files: fileCountFor(format) };
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < t.numRows; i++) {
    const r = t.get(i)!;
    const out: Record<string, unknown> = {};
    for (const c of fetched) out[c] = r[c];
    rows.push(out);
  }

  if (format === "json" || format === "ndjson") {
    const plain = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const c of wanted) out[c] = toPlainJson(r[c]);
      return out;
    });
    return writeJsonish(format, plain, metaObj, base, exportedRows);
  }

  // GeoJSON — §4.1.
  const features: unknown[] = [];
  for (const r of rows) {
    const geom = geometryOf(tableId, r);
    if (!geom) continue;
    const props: Record<string, unknown> = {};
    for (const c of wanted) {
      if (meta.geometryColumns.includes(c)) continue;
      props[c] = toPlainJson(r[c]);
    }
    features.push({ type: "Feature", geometry: geom, properties: props });
  }
  if (features.length === 0) {
    // Một FeatureCollection rỗng tải về được là một lời nói dối có thể mở bằng phần mềm bản
    // đồ: nó đọc thành "không có gì ở đây". Bảng này không có hình học, và nói ra điều đó.
    throw new Error(
      `Bảng ${tableId} không mang hình học nào nên không xuất được GeoJSON. Dùng CSV, Parquet hoặc JSON.`,
    );
  }
  return writeGeoJson(features, metaObj, base, features.length);
}

/**
 * Hình học của một hàng, hoặc `null` nếu bảng không có.
 *
 * `cellToBoundary(h3, true)` ĐÃ trả `[lng, lat]` khép vòng — đó là ý nghĩa của tham số thứ
 * hai. Bản trước còn `.map(([lat, lng]) => [lng, lat])` phía sau, tức đảo lại một lần nữa và
 * ghi ra vĩ độ 105,8 cho Hà Nội. `MapView.tsx` gọi cùng hàm này KHÔNG kèm phép đảo, và đó là
 * quy ước đúng.
 */
function geometryOf(
  tableId: DataModeTableId,
  r: Record<string, unknown>,
): Record<string, unknown> | null {
  if (tableId === "grid" && r["h3_r8"]) {
    return { type: "Polygon", coordinates: [cellToBoundary(String(r["h3_r8"]), true)] };
  }
  if (tableId === "stations" && r["lat"] != null && r["lng"] != null) {
    return { type: "Point", coordinates: [Number(r["lng"]), Number(r["lat"])] };
  }
  if (tableId === "roads" && r["coords"]) {
    return { type: "LineString", coordinates: toPlainJson(r["coords"]) };
  }
  return null;
}

// ── Bảng GeoJSON (commune / poi) ──────────────────────────────────────────────────────

async function exportGeoJsonTable(a: {
  opts: ExportOptions;
  meta: ReturnType<typeof tableMeta>;
  base: string;
  visible: string[];
  mkMeta: (exported: number, total: number) => ExportMeta;
}): Promise<{ filename: string; rows: number; files: number }> {
  const { opts, meta, base, visible, mkMeta } = a;
  const { format, filter, sortCol, sortDesc } = opts;
  const res = await fetch(meta.filename);
  if (!res.ok) throw new Error(`Không tải được ${meta.filename} (HTTP ${res.status})`);
  const fc = await res.json();
  const raw: Array<{ properties: Record<string, unknown>; geometry: unknown }> = fc.features ?? [];
  const totalRows = raw.length;

  const q = filter.trim().toLowerCase();
  const searchable = meta.searchColumns;
  let items = q
    ? raw.filter((it) =>
        searchable.some((c) => String(it.properties[c] ?? "").toLowerCase().includes(q)),
      )
    : raw;

  if (sortCol) {
    items = [...items].sort((x, y) => {
      const c = compareWithNullsLast(x.properties[sortCol], y.properties[sortCol], sortDesc);
      return c !== 0
        ? c
        : compareWithNullsLast(x.properties[meta.primaryKey], y.properties[meta.primaryKey], false);
    });
  }

  const exportedRows = items.length;
  if (MATERIALIZING.has(format) && exportedRows > JS_MATERIALIZE_ROW_CAP) {
    throw new Error(
      `${exportedRows.toLocaleString("vi-VN")} dòng vượt trần ${JS_MATERIALIZE_ROW_CAP.toLocaleString("vi-VN")} dòng của định dạng ${format.toUpperCase()}.`,
    );
  }
  const metaObj = mkMeta(exportedRows, totalRows);
  const keys = visible.length > 0 ? visible : Object.keys(raw[0]?.properties ?? {});
  const pick = (p: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = toPlainJson(p[k]);
    return out;
  };

  if (format === "geojson") {
    const features = items.map((it) => ({
      type: "Feature",
      geometry: it.geometry,
      properties: pick(it.properties),
    }));
    return writeGeoJson(features, metaObj, base, exportedRows);
  }
  if (format === "json" || format === "ndjson") {
    return writeJsonish(format, items.map((it) => pick(it.properties)), metaObj, base, exportedRows);
  }
  if (format === "csv") {
    const esc = (v: unknown) => {
      const p = toPlainJson(v);
      if (p === null) return "";
      if (typeof p === "number" || typeof p === "boolean") return String(p);
      return `"${String(p).replace(/"/g, '""')}"`;
    };
    const body = [
      keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(","),
      ...items.map((it) => keys.map((k) => esc(it.properties[k])).join(",")),
    ].join("\n");
    const name = `${base}csv`;
    triggerDownload(new Blob([body], { type: "text/csv;charset=utf-8;" }), name);
    downloadSidecar(metaObj, base);
    return { filename: name, rows: exportedRows, files: fileCountFor(format) };
  }
  // Arrow và Parquet cần một bảng DuckDB; hai bảng GeoJSON không có. Nói ra thay vì ghi rỗng.
  throw new Error(
    `Bảng ${meta.id} là GeoJSON nên không xuất được ${format.toUpperCase()}. Dùng GeoJSON, JSON, NDJSON hoặc CSV.`,
  );
}

// ── Người ghi ─────────────────────────────────────────────────────────────────────────

function downloadSidecar(metaObj: ExportMeta, base: string): void {
  triggerDownload(
    new Blob([stringifyMeta(metaObj)], { type: "application/json;charset=utf-8;" }),
    `${base}meta.json`,
  );
}

function writeJsonish(
  format: "json" | "ndjson",
  rows: Record<string, unknown>[],
  metaObj: ExportMeta,
  base: string,
  exportedRows: number,
): { filename: string; rows: number; files: number } {
  if (format === "json") {
    const name = `${base}json`;
    triggerDownload(
      new Blob([JSON.stringify({ _meta: metaObj, data: rows }, null, 2)], {
        type: "application/json;charset=utf-8;",
      }),
      name,
    );
    return { filename: name, rows: exportedRows, files: 1 };
  }
  // NDJSON mỗi dòng một bản ghi nên không có chỗ nhúng — nó nhận file phụ.
  const name = `${base}ndjson`;
  triggerDownload(
    new Blob([rows.map((r) => JSON.stringify(r)).join("\n")], {
      type: "application/x-ndjson;charset=utf-8;",
    }),
    name,
  );
  downloadSidecar(metaObj, base);
  return { filename: name, rows: exportedRows, files: 2 };
}

function writeGeoJson(
  features: unknown[],
  metaObj: ExportMeta,
  base: string,
  exportedRows: number,
): { filename: string; rows: number; files: number } {
  const name = `${base}geojson`;
  triggerDownload(
    new Blob([JSON.stringify({ type: "FeatureCollection", _meta: metaObj, features }, null, 2)], {
      type: "application/geo+json;charset=utf-8;",
    }),
    name,
  );
  return { filename: name, rows: exportedRows, files: 1 };
}
