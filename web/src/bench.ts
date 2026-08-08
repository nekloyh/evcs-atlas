/**
 * Đo thời gian truy vấn THẬT trong DuckDB-WASM, trên store theo tỉnh.
 *
 * Vì sao là một trang riêng chứ không phải một nút trong app:
 *
 *  · **Số đo phải là số đo của DuckDB, không của deck.gl.** Bấm trong app thì mỗi truy vấn
 *    kéo theo dựng lớp, cập nhật state, vẽ lại — trộn ba thứ vào một con số.
 *  · **Nó phải chạy được khi app đang dở.** Trang này không import một thành phần giao diện
 *    nào, nên nó không chết theo một `MapView` đang sửa.
 *  · **Cùng bundle, cùng giao thức.** Vẫn `mvp`/`eh` đơn luồng và vẫn
 *    `DuckDBDataProtocol.HTTP` — tức vẫn HTTP range request trên chính file đã xuất, không
 *    phải một bản nạp sẵn vào RAM.
 *
 * Chạy: `pnpm dev` rồi mở `/bench.html`. Kết quả in ra trang và ra console (`[BENCH]`).
 */

import * as duckdb from "@duckdb/duckdb-wasm";

import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

/** Số lần lặp. 3 lần đầu không tính — lần đầu gồm cả tải file, và nó không phải p95. */
const WARMUP = 3;
const RUNS = 15;

const out = document.getElementById("out")!;
const lines: string[] = [];
function log(s: string) {
  lines.push(s);
  out.textContent = lines.join("\n");
  console.log("[BENCH]", s);
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i]!;
}

async function main() {
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = new Worker(bundle.mainWorker!, { type: "module" });
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  log(`bundle: ${bundle.mainModule.includes("eh") ? "eh" : "mvp"} (đơn luồng, không COI)`);

  const idx = (await fetch("data/provinces.geojson").then((r) => (r.ok ? r.json() : null))) as {
    features: { properties: { province_code: string; province_name: string; in_store: boolean } }[];
  } | null;

  // Bộ Hà Nội gốc (đường dẫn không tiền tố) + mọi tỉnh có trong store. Hà Nội xuất hiện hai
  // lần một cách CỐ Ý: nó là điểm đối chứng duy nhất có cả hai phiên bản, nên chênh lệch
  // giữa hai dòng của nó chính là cái giá của việc thiếu/đủ lớp TÍNH TOÁN.
  const targets: { label: string; base: string }[] = [
    { label: "— (bộ Hà Nội gốc, đủ 53 cột)", base: "" },
  ];
  for (const f of idx?.features ?? [])
    if (f.properties.in_store)
      targets.push({
        label: `${f.properties.province_code} ${f.properties.province_name}`,
        base: `p/${f.properties.province_code}/`,
      });

  const registered = new Set<string>();
  async function reg(name: string) {
    if (registered.has(name)) return;
    await db.registerFileURL(
      name,
      new URL(`data/${name}`, window.location.href).toString(),
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    registered.add(name);
  }

  async function timed(sql: string): Promise<number[]> {
    const conn = await db.connect();
    try {
      for (let i = 0; i < WARMUP; i++) await conn.query(sql);
      const ts: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        await conn.query(sql);
        ts.push(performance.now() - t0);
      }
      return ts.sort((a, b) => a - b);
    } finally {
      await conn.close();
    }
  }

  log(`\n${RUNS} lần/truy vấn sau ${WARMUP} lần khởi động. Đơn vị: ms.\n`);
  log(
    "tỉnh".padEnd(30) +
      "  ô".padStart(8) +
      "Q1 lưới".padStart(18) +
      "Q2 gộp".padStart(16) +
      "Q3 một ô".padStart(16) +
      "Q4 168h".padStart(16) +
      "Q5 đường".padStart(16),
  );

  const rows: Record<string, unknown>[] = [];
  for (const t of targets) {
    const G = `${t.base}grid_h3_r8.parquet`;
    const P = `${t.base}station_occupancy_profile_168h.parquet`;
    const R = `${t.base}roads.parquet`;
    const S = `${t.base}stations.parquet`;
    await Promise.all([reg(G), reg(P), reg(R), reg(S)]);

    let nCells = 0;
    const probe = await db.connect();
    try {
      const t0 = await probe.query(`SELECT count(*) AS n FROM read_parquet('${G}')`);
      nCells = Number(t0.get(0)!["n"]);
      await probe.close();
    } catch {
      await probe.close();
      log(`${t.label}: KHÔNG đọc được ${G} — bỏ qua`);
      continue;
    }

    // Q1 — truy vấn TRỤ CỘT của app: quét cả lưới cho một trường. Cột đi kèm dùng NULL khi
    // vắng, đúng như `gcol()` trong queries.ts, để hai bộ so được với nhau về CHI PHÍ QUÉT.
    const hasPop = t.base === "";
    const q1 = `SELECT g."h3_r8" AS h3, g."n_ports" AS value, ${
      hasPop ? 'g."population"' : "NULL"
    } AS pop, g."lat" AS lat, g."lng" AS lng FROM read_parquet('${G}') g`;
    const q2 = `SELECT count(*) AS n_all, count(*) FILTER (WHERE g."n_stations" > 0) AS n1,
                       sum(g."area_km2") AS a FROM read_parquet('${G}') g`;
    const q3 = `SELECT g.* FROM read_parquet('${G}') g LIMIT 1`;
    const q4 = `SELECT station_code, dow, hour, occ, observed_h FROM read_parquet('${P}')`;
    const q5 = `SELECT "coords" AS c, "road_class" AS rc FROM read_parquet('${R}')`;

    // TUẦN TỰ, không `Promise.all`. DuckDB-WASM ở bundle này chạy MỘT worker: năm truy vấn
    // gửi song song sẽ xếp hàng trong worker và mỗi cái đo được tổng thời gian của cả năm.
    // Bản đo đầu tiên của lượt này mắc đúng lỗi đó — dấu hiệu nhận ra là năm cột bằng nhau
    // tới từng mili giây trong khi khối lượng việc của chúng chênh nhau hàng chục lần.
    const a = await timed(q1);
    const b = await timed(q2);
    const c = await timed(q3);
    const d = await timed(q4);
    const e = await timed(q5);
    const fmt = (x: number[]) => `${pct(x, 0.5).toFixed(0)}/${pct(x, 0.95).toFixed(0)}`;
    log(
      t.label.slice(0, 29).padEnd(30) +
        String(nCells).padStart(8) +
        fmt(a).padStart(18) +
        fmt(b).padStart(16) +
        fmt(c).padStart(16) +
        fmt(d).padStart(16) +
        fmt(e).padStart(16),
    );
    rows.push({
      label: t.label,
      n_cells: nCells,
      q1_p50: +pct(a, 0.5).toFixed(1),
      q1_p95: +pct(a, 0.95).toFixed(1),
      q2_p95: +pct(b, 0.95).toFixed(1),
      q3_p95: +pct(c, 0.95).toFixed(1),
      q4_p95: +pct(d, 0.95).toFixed(1),
      q5_p95: +pct(e, 0.95).toFixed(1),
    });
  }

  log("\ncột: p50/p95");
  log("Q1 quét cả lưới cho một trường (truy vấn mỗi lần đổi trường)");
  log("Q2 gộp toàn lưới (bảng phủ)   Q3 một ô (panel Ô)");
  log("Q4 quét hồ sơ 168 giờ (scrubber)   Q5 quét mạng đường (lớp M3-R)");
  (window as unknown as { BENCH: unknown }).BENCH = rows;
  log("\nXONG — mảng kết quả ở window.BENCH");
}

void main().catch((e) => log(`HỎNG: ${String(e)}`));
