import * as duckdb from "@duckdb/duckdb-wasm";
import type { Table } from "apache-arrow";

import mvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

/**
 * Boot DuckDB-WASM — DESIGN.md §1a và §5c.
 *
 * CHỦ Ý dùng bundle `mvp`/`eh` (đơn luồng), KHÔNG dùng `coi`. Bundle `coi` cần
 * SharedArrayBuffer ⇒ cần header `Cross-Origin-Embedder-Policy: require-corp`, mà tile của
 * OpenFreeMap có CORS nhưng KHÔNG có `Cross-Origin-Resource-Policy` ⇒ bật COEP là mất bản
 * đồ. 4.400 dòng × 52 cột không cần đa luồng.
 *
 * Bundle self-host từ node_modules (Vite `?url`), không gọi jsDelivr — app phải chạy được
 * khi mất mạng, trừ tile bản đồ.
 */
const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function boot(): Promise<duckdb.AsyncDuckDB> {
  // Pilot Hà Nội ưu tiên bundle MVP ổn định trên mọi trình duyệt. Auto-select có thể chọn
  // EH ở môi trường có feature-detect không đầy đủ; khi EH không instantiate xong thì mọi
  // query chỉ treo ở getDb() và DataMode không bao giờ chạm tới parquet.
  const bundle = BUNDLES.mvp;
  // Worker do DuckDB-WASM phát ra là classic bundle (đã được Vite bundle, không còn
  // import ESM ở đầu file). Đánh dấu nó là module làm worker không khởi động đúng ở một
  // số trình duyệt; khi đó `getDb()` treo trước cả request parquet và DataMode chỉ hiện
  // "đang đọc…". Dùng classic Worker theo contract của bundle.
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(
    bundle.mainModule,
    "pthreadWorker" in bundle ? (bundle.pthreadWorker as string | undefined) : undefined,
  );
  return db;
}

export function getDb(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= boot();
  return dbPromise;
}

const registered = new Set<string>();
// `registered` chỉ biết sau khi request hoàn tất. Khi App boot, coverage, occupancy và
// DataMode có thể cùng gọi registerParquet() cho GRID/STATIONS; nếu chỉ dùng Set, các lời
// gọi đồng thời sẽ cùng registerFileURL một tên và DuckDB-WASM có thể treo không trả Promise.
// Giữ cả Promise đang chạy để mọi caller dùng chung một lần đăng ký.
const registering = new Map<string, Promise<string>>();
// DuckDB-WASM đang dùng bundle đơn luồng (`eh`/`mvp`). Nhiều connection vẫn có thể được
// tạo, nhưng các query khởi động đồng thời từ App/DataMode/occupancy dễ làm worker giữ
// các Promise chờ lẫn nhau. Queue này giữ thứ tự truy vấn; dữ liệu không đổi, chỉ tránh
// contention lúc boot.
let queryTail: Promise<void> = Promise.resolve();

/**
 * Đăng ký một file Parquet trong `public/data/` để đọc qua HTTP range request —
 * không tải hết file vào RAM. Quan trọng với file 168h (363.518 dòng).
 */
export async function registerParquet(name: string): Promise<string> {
  const db = await getDb();
  if (registered.has(name)) return name;
  const running = registering.get(name);
  if (running) return running;

  const p = (async () => {
    const url = new URL(`data/${name}`, window.location.href).toString();
    await db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false);
    registered.add(name);
    return name;
  })();
  registering.set(name, p);
  try {
    return await p;
  } catch (e) {
    registering.delete(name);
    throw e;
  }
}

export async function query(sql: string): Promise<Table> {
  const run = queryTail.then(async () => {
    const db = await getDb();
    const conn = await db.connect();
    try {
      return await conn.query(sql);
    } finally {
      await conn.close();
    }
  });
  queryTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
