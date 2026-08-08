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
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!, { type: "module" });
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export function getDb(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= boot();
  return dbPromise;
}

const registered = new Set<string>();

/**
 * Đăng ký một file Parquet trong `public/data/` để đọc qua HTTP range request —
 * không tải hết file vào RAM. Quan trọng với file 168h (363.518 dòng).
 */
export async function registerParquet(name: string): Promise<string> {
  const db = await getDb();
  if (!registered.has(name)) {
    const url = new URL(`data/${name}`, window.location.href).toString();
    await db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false);
    registered.add(name);
  }
  return name;
}

export async function query(sql: string): Promise<Table> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    return await conn.query(sql);
  } finally {
    await conn.close();
  }
}
