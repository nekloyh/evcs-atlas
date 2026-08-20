/**
 * AC-12 — CSV và Parquet đi một vòng và về nguyên vẹn, trên CHÍNH bản DuckDB-WASM đã ship.
 *
 * Đây là cổng mà §4.1 nói rõ là **chưa xác nhận được** lúc viết đặc tả: *"bộ ghi Parquet là
 * lõi DuckDB, không phải extension nạp thêm… xác nhận lúc chạy là cổng AC-12; nó không chạy
 * được từ môi trường này và được nêu là chưa kiểm chứ không phải mặc định đúng."*
 *
 * Nó chạy được. File này chạy nó, ở mỗi lần `pnpm test`.
 *
 * ── Vì sao Node chứ không phải trình duyệt, và điều đó KHÔNG kiểm được cái gì ────────
 *
 * `@duckdb/duckdb-wasm` phát cùng một `duckdb-eh.wasm` cho cả hai môi trường; ở đây nạp qua
 * bindings Node đồng bộ. Thứ được kiểm là **động cơ**: bộ ghi có tồn tại không, ZSTD có nén
 * được không, và mẫu ô trống của cả bốn cột nullable có sống sót không.
 *
 * Thứ KHÔNG kiểm được ở đây là nửa của trình duyệt: `copyFileToBuffer` → `Blob` → thẻ neo →
 * `dropFile`. Nửa đó đã chạy tay trên Chrome (CSV 2.725.823 B + file phụ 1.583 B; Parquet
 * 786.263 B, khớp từng byte với con số Node dưới đây) và ngân sách thời gian của nó nằm ở
 * `bench.ts`. Ghi lại giới hạn thay vì để một test Node ngụ ý nó đã phủ cả đường đi.
 *
 * Một khác biệt cụ thể, và là lý do file này KHÔNG kiểm AC-14: `NODE_RUNTIME` cho `COPY … TO`
 * ghi ra hệ tập tin THẬT, còn trình duyệt ghi vào FS ảo của WASM. Nên phép kiểm "FS ảo sạch
 * sau `dropFile`" chỉ có nghĩa ở trình duyệt, và nó sống ở cổng `export_csv` trong `bench.ts`.
 * Ở đây chỉ dọn thư mục tạm.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const GRID = path.join(ROOT, "web/public/data/p/01/grid_h3_r8.parquet");

/** Bốn cột nullable của lưới (§0.3) — mẫu ô trống của chúng là thứ phải sống sót. */
const NULLABLE = [
  "dist_station_network_m",
  "dist_station_asym_m",
  "detour_ratio",
  "util_cell",
] as const;

const PROFILE_SQL = (from: string) =>
  `SELECT count(*) AS n, ${NULLABLE.map(
    (c) => `count(*) FILTER (WHERE "${c}" IS NULL) AS "null_${c}"`,
  ).join(", ")} FROM ${from}`;

type Profile = Record<string, number>;

const asProfile = (row: Record<string, unknown>): Profile =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));

describe("AC-12 — CSV & Parquet đi một vòng, trên bản WASM đã ship", () => {
  test("bộ ghi tồn tại, và mẫu ô trống của cả bốn cột nullable sống sót", async () => {
    const require = createRequire(path.join(ROOT, "web/"));
    const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
    const dist = path.dirname(require.resolve("@duckdb/duckdb-wasm"));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evcs-rt-"));
    const db = await duckdb.createDuckDB(
      {
        mvp: { mainModule: path.join(dist, "duckdb-mvp.wasm"), mainWorker: null },
        eh: { mainModule: path.join(dist, "duckdb-eh.wasm"), mainWorker: null },
      },
      new duckdb.VoidLogger(),
      duckdb.NODE_RUNTIME,
    );
    await db.instantiate();
    const conn = db.connect();
    try {
      db.registerFileBuffer("src.parquet", new Uint8Array(fs.readFileSync(GRID)));
      const source = asProfile(conn.query(PROFILE_SQL("read_parquet('src.parquet')")).get(0));

      // Nếu nguồn không có ô trống nào thì phép so dưới đây đúng một cách rỗng tuếch.
      assert.equal(source["n"], 4400, "lưới Hà Nội phải có 4.400 dòng");
      for (const c of NULLABLE) {
        assert.ok(source[`null_${c}`]! > 0, `${c} không có ô trống nào — phép so vô nghĩa`);
      }

      for (const [fmt, opts, reader] of [
        ["CSV", "(FORMAT CSV, HEADER)", "read_csv_auto"],
        ["PARQUET", "(FORMAT PARQUET, COMPRESSION ZSTD)", "read_parquet"],
      ] as const) {
        const out = path.join(tmp, `rt_${fmt}.bin`);
        conn.query(`COPY (SELECT * FROM read_parquet('src.parquet')) TO '${out}' ${opts}`);
        const buf = db.copyFileToBuffer(out);
        assert.ok(buf.length > 1000, `${fmt}: bộ ghi trả ra ${buf.length} byte`);

        db.registerFileBuffer(`back_${fmt}`, buf);
        const back = asProfile(conn.query(PROFILE_SQL(`${reader}('back_${fmt}')`)).get(0));
        assert.deepEqual(back, source, `${fmt}: mẫu ô trống hoặc số dòng đổi sau một vòng`);
        db.dropFile(out);
      }
    } finally {
      conn.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
