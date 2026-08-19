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

import { BEYOND_2KM_M } from "./domain-thresholds";
import { getIssuedQueryCount } from "./data/duckdb";
import { fetchCommunes, fetchField, fetchStations } from "./data/queries";
import { FIELD_BY_ID } from "./fields";
import { PRESETS, presetStatsFrom, resolvePreset } from "./state/presets";
import { buildSearchIndex, rankSearchResults } from "./ui/search";
import { loadManifest } from "./data/manifest";

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
let issuedQueries = 0;
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

  /** Cột có thật trong một Parquet — hỏi chính file, không suy từ tên gói. */
  async function columnsOf(name: string): Promise<Set<string>> {
    const conn = await db.connect();
    try {
      issuedQueries++;
      const t = await conn.query(`SELECT * FROM read_parquet('${name}') LIMIT 0`);
      return new Set(t.schema.fields.map((f: { name: string }) => f.name));
    } catch {
      return new Set<string>();
    } finally {
      await conn.close();
    }
  }

  /**
   * Cỡ artifact tính bằng BYTE, đọc từ `Content-Length` của một HEAD.
   *
   * §4.4 đòi bản đo ghi lại "p50/p95, số truy vấn, số dòng trả về, và cỡ artifact". Bốn
   * con số ấy đi cùng nhau vì một p95 chậm chỉ đọc được khi biết nó quét bao nhiêu byte.
   */
  async function bytesOf(name: string): Promise<number | null> {
    try {
      const r = await fetch(new URL(`data/${name}`, window.location.href).toString(), { method: "HEAD" });
      const len = r.headers.get("content-length");
      return len === null ? null : Number(len);
    } catch {
      return null;
    }
  }

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
      for (let i = 0; i < WARMUP; i++) {
        issuedQueries++;
        await conn.query(sql);
      }
      const ts: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        issuedQueries++;
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
      "Q5 đường".padStart(16) +
      "Q-P4-4 xã".padStart(18) +
      "queries".padStart(10),
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
    //
    // Cột nào CÓ THẬT thì hỏi chính file, đừng suy từ tên bộ. Bản trước khoá bằng
    // `t.base === ""`, tức chỉ bộ Hà Nội gốc mới được đo Q-P4-4 — trong khi bộ app thật sự
    // mở là `p/01/`. Hậu quả: cổng §4.4 ("p95 của Q-P4-4 không được vượt p95 của Q1 trên
    // CÙNG một gói") chưa từng chạy trên bất kỳ gói nào app mở được, và mọi dòng `p/*` in
    // ra `n/a`. Ba cột dưới đây là đúng ba cột Q-P4-4 cần.
    const gridCols = await columnsOf(G);
    const hasPop = gridCols.has("population");
    const hasP44 = hasPop && gridCols.has("dist_station_network_m") && gridCols.has("commune_code");
    const q1 = `SELECT g."h3_r8" AS h3, g."n_ports" AS value, ${
      hasPop ? 'g."population"' : "NULL"
    } AS pop, g."lat" AS lat, g."lng" AS lng FROM read_parquet('${G}') g`;
    const q2 = `SELECT count(*) AS n_all, count(*) FILTER (WHERE g."n_stations" > 0) AS n1,
                       sum(g."area_km2") AS a FROM read_parquet('${G}') g`;
    const q3 = `SELECT g.* FROM read_parquet('${G}') g LIMIT 1`;
    const q4 = `SELECT station_code, dow, hour, occ, observed_h FROM read_parquet('${P}')`;
    const q5 = `SELECT "coords" AS c, "road_class" AS rc FROM read_parquet('${R}')`;
    const qP44 = hasP44
      ? `SELECT commune_code, commune_name, count(*) AS n_cells,
                count(*) FILTER (WHERE population IS NULL) AS n_population_missing,
                count(*) FILTER (WHERE population IS NOT NULL
                                  AND dist_station_network_m IS NULL) AS n_distance_unknown,
                sum(population) AS population_total,
                coalesce(sum(population) FILTER (WHERE dist_station_network_m IS NOT NULL), 0) AS population_measured,
                coalesce(sum(population) FILTER (WHERE dist_station_network_m <= ${BEYOND_2KM_M}), 0) AS population_within_2km,
                coalesce(sum(population) FILTER (WHERE dist_station_network_m > ${BEYOND_2KM_M}), 0) AS population_beyond_2km,
                coalesce(sum(population) FILTER (WHERE dist_station_network_m IS NULL), 0) AS population_distance_unknown
         FROM read_parquet('${G}') WHERE commune_code IS NOT NULL
         GROUP BY commune_code, commune_name`
      : null;

    // TUẦN TỰ, không `Promise.all`. DuckDB-WASM ở bundle này chạy MỘT worker: năm truy vấn
    // gửi song song sẽ xếp hàng trong worker và mỗi cái đo được tổng thời gian của cả năm.
    // Bản đo đầu tiên của lượt này mắc đúng lỗi đó — dấu hiệu nhận ra là năm cột bằng nhau
    // tới từng mili giây trong khi khối lượng việc của chúng chênh nhau hàng chục lần.
    const queryStart = issuedQueries;
    const a = await timed(q1);
    const b = await timed(q2);
    const c = await timed(q3);
    const d = await timed(q4);
    const e = await timed(q5);
    const f = qP44 ? await timed(qP44) : [];


    let qP44Rows: number | null = null;
    if (qP44) {
      const countConn = await db.connect();
      try {
        issuedQueries++;
        const result = await countConn.query(`SELECT count(*) AS n FROM (${qP44}) q`);
        qP44Rows = Number(result.get(0)!["n"]);
      } finally {
        await countConn.close();
      }
    }
    const targetQueryCount = issuedQueries - queryStart;
    const fmt = (x: number[]) => `${pct(x, 0.5).toFixed(0)}/${pct(x, 0.95).toFixed(0)}`;
    log(
      t.label.slice(0, 29).padEnd(30) +
        String(nCells).padStart(8) +
        fmt(a).padStart(18) +
        fmt(b).padStart(16) +
        fmt(c).padStart(16) +
        fmt(d).padStart(16) +
        fmt(e).padStart(16) +
        (f.length ? fmt(f) : "n/a").padStart(18) +
        String(targetQueryCount).padStart(10),
    );
    const [gridBytes, profileBytes, roadBytes, stationBytes] = await Promise.all([
      bytesOf(G),
      bytesOf(P),
      bytesOf(R),
      bytesOf(S),
    ]);
    rows.push({
      label: t.label,
      n_cells: nCells,
      grid_bytes: gridBytes,
      profile_bytes: profileBytes,
      road_bytes: roadBytes,
      station_bytes: stationBytes,
      q1_p50: +pct(a, 0.5).toFixed(1),
      q1_p95: +pct(a, 0.95).toFixed(1),
      q2_p95: +pct(b, 0.95).toFixed(1),
      q3_p95: +pct(c, 0.95).toFixed(1),
      q4_p95: +pct(d, 0.95).toFixed(1),
      q5_p95: +pct(e, 0.95).toFixed(1),
      qp44_p95: f.length ? +pct(f, 0.95).toFixed(1) : null,
      qp44_rows: qP44Rows,
      query_count: targetQueryCount,
      qp44_within_q1_p95: f.length ? pct(f, 0.95) <= pct(a, 0.95) : null,
    });
  }

  log("\ncột: p50/p95");
  log("Q1 quét cả lưới cho một trường (truy vấn mỗi lần đổi trường)");
  log("Q2 gộp toàn lưới (bảng phủ)   Q3 một ô (panel Ô)");
  log("Q4 quét hồ sơ 168 giờ (scrubber)   Q5 quét mạng đường (lớp M3-R)");
  log("Q-P4-4 gộp lưới theo xã; cổng tương đối: p95 Q-P4-4 ≤ p95 Q1. queries gồm warmup.");
  log("Q-P4-4 chỉ bỏ qua khi gói THIẾU cột (population · dist_station_network_m · commune_code).");
  log("cỡ artifact (byte) đi kèm từng dòng trong window.BENCH.");
  (window as unknown as { BENCH: unknown }).BENCH = rows;
  log("\nXONG — mảng kết quả ở window.BENCH");
}

/**
 * Phase 5 §6 — đo TÌM KIẾM và PRESET.
 *
 * Tìm kiếm là JavaScript thuần trong bộ nhớ, nên vòng đo DuckDB ở trên KHÔNG đo nó. Phần này
 * dùng chung `WARMUP`/`RUNS`/`pct()` với nửa kia để hai nửa của báo cáo so được với nhau.
 *
 * Hai phép đo, **không bao giờ cộng lại**: `INDEX` chạy một lần mỗi phiên dữ liệu, `QUERY`
 * chạy một lần mỗi phím gõ. Gộp thành một con số "thời gian tìm kiếm" sẽ giấu mất một hồi
 * quy đã rơi vào nửa nào.
 *
 * Corpus là gói `p/01` THẬT, nạp qua đúng loader của sản phẩm — không fixture tổng hợp.
 */

/** 20 truy vấn CAM KẾT TRONG REPO, không gõ lúc chạy, để hai lần chạy so được với nhau. */
const SEARCH_QUERIES: readonly { q: string; path: string }[] = [
  { q: "ba dinh", path: "xã NAME_PREFIX sau khi tách phân loại" },
  { q: "phuong", path: "truy vấn phân loại, so trên tên đầy đủ" },
  { q: "xa", path: "phân loại, nhóm xã lớn nhất" },
  { q: "ha", path: "xã WORD_START vs SUBSTRING" },
  { q: "00004", path: "xã EXACT_ID" },
  { q: "van mieu quoc tu giam", path: "gấp dấu câu (§1.2 bước 4)" },
  { q: "vinhomes", path: "trạm, trường hợp xấu nhất" },
  { q: "vincom", path: "trạm, trường hợp giữa" },
  { q: "times city", path: "trạm nhiều từ" },
  { q: "long bien", path: "trạm: tên + địa chỉ" },
  { q: "c ac000091", path: "station_code sau khi gấp `.`" },
  { q: "vn-c-ac000091", path: "station_id EXACT_ID" },
  { q: "s touch", path: "operator hiếm, bậc SECONDARY" },
  { q: "vinfast", path: "operator áp đảo, không được tràn" },
  { q: "884143625dfffff", path: "ô EXACT_ID" },
  { q: "884143625", path: "ô, tiền tố 9 ký tự — mức tối thiểu" },
  { q: "884", path: "dưới mức tối thiểu, phải trả 0 ô" },
  { q: "đống đa", path: "đủ dấu + `đ`, phải bằng kết quả của `dong da`" },
  { q: "q", path: "dưới 2 ký tự, trạng thái Gợi ý" },
  { q: "zzzzz", path: "trạng thái Rỗng" },
];

function timePure(fn: () => unknown): number[] {
  for (let i = 0; i < WARMUP; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    fn();
    t.push(performance.now() - t0);
  }
  return t.sort((a, b) => a - b);
}

async function searchBench() {
  log("\n────────────────────────────────────────────");
  log("Phase 5 §6 — TÌM KIẾM (JS thuần) và PRESET");

  const popMeta = FIELD_BY_ID.get("population");
  if (!popMeta) {
    log("gói không có trường `population` — bỏ qua phần tìm kiếm.");
    return;
  }

  const [communes, stations, cells, manifest] = await Promise.all([
    fetchCommunes(),
    fetchStations(),
    fetchField(popMeta),
    loadManifest(),
  ]);
  const corpus = { communes, stations, cells };
  log(
    `corpus: ${communes.features.length} xã · ${stations.length} trạm · ${cells.length} ô` +
      ` — gói ${manifest.exported_utc}`,
  );

  // ── INDEX: mỗi lần lặp dựng từ một index NGUỘI ─────────────────────────────
  const indexTimes = timePure(() => buildSearchIndex(corpus));
  log(`INDEX  p50 ${pct(indexTimes, 0.5).toFixed(3)} ms   p95 ${pct(indexTimes, 0.95).toFixed(3)} ms`);

  // ── QUERY: cổng G1 đo quanh CẢ bộ truy vấn ─────────────────────────────────
  const index = buildSearchIndex(corpus);
  const sqlBefore = getIssuedQueryCount();
  const queryRows = SEARCH_QUERIES.map(({ q, path }) => {
    const outcome = rankSearchResults(q, index);
    const t = timePure(() => rankSearchResults(q, index));
    return {
      q,
      path,
      p50: +pct(t, 0.5).toFixed(3),
      p95: +pct(t, 0.95).toFixed(3),
      /** Ứng viên TRƯỚC mọi phép cắt — cổng G5 đọc nó, và §1.5 cấm cắt im lặng. */
      candidates: outcome.matched,
      shown: outcome.results.length,
      truncated: outcome.truncated,
    };
  });
  const g1 = getIssuedQueryCount() - sqlBefore;

  for (const r of queryRows) {
    log(
      `QUERY  ${r.q.padEnd(24)} p50 ${String(r.p50).padStart(7)}  p95 ${String(r.p95).padStart(7)}` +
        `  ứng viên ${String(r.candidates).padStart(4)} → hiện ${r.shown} (cắt ${r.truncated})`,
    );
  }
  const maxP95 = Math.max(...queryRows.map((r) => r.p95));
  log(`QUERY  p95 lớn nhất cả bộ: ${maxP95.toFixed(3)} ms`);

  // ── Cổng cấu trúc G1 · G2 · G5 ─────────────────────────────────────────────
  const stats = presetStatsFrom({ cells, stations, manifest });
  const presetBefore = getIssuedQueryCount();
  const presetRows = PRESETS.map((p) => {
    const filter = resolvePreset(p, stats);
    return { id: p.id, resolved: filter !== null, bound: filter && filter.entity === "h3-cell" ? [filter.lo, filter.hi] : null };
  });
  const g2 = getIssuedQueryCount() - presetBefore;
  const g5 = queryRows.every((r) => r.shown <= 10);

  log(`G1 gõ phím phát ${g1} câu lệnh DuckDB (phải là 0) — ${g1 === 0 ? "ĐẠT" : "TRƯỢT"}`);
  log(`G2 giải 5 preset phát ${g2} câu lệnh (phải là 0 khi snapshot đã cư trú) — ${g2 === 0 ? "ĐẠT" : "TRƯỢT"}`);
  log(`G5 không lượt nào trả quá 10 dòng — ${g5 ? "ĐẠT" : "TRƯỢT"}`);
  log("G3 index dựng một lần mỗi phiên — cổng ở tầng mã, xem test/search-integration.test.ts.");
  log("G4 Long Task — §6.5, phải chạy TRONG app, không phải ở trang này.");
  log("KHÔNG đặt ngưỡng mili-giây ở đây: lần chạy này LÀ đường cơ sở (§6.6).");

  (window as unknown as { BENCH_SEARCH: unknown }).BENCH_SEARCH = {
    corpus: { communes: communes.features.length, stations: stations.length, cells: cells.length },
    exported_utc: manifest.exported_utc,
    index: { p50: +pct(indexTimes, 0.5).toFixed(3), p95: +pct(indexTimes, 0.95).toFixed(3) },
    queries: queryRows,
    max_query_p95: +maxP95.toFixed(3),
    presets: presetRows,
    gates: { g1_sql_on_typing: g1, g2_sql_on_preset: g2, g5_cap_respected: g5 },
    warmup: WARMUP,
    runs: RUNS,
  };
  log("\nXONG — kết quả tìm kiếm ở window.BENCH_SEARCH");
}

void main()
  .then(searchBench)
  .catch((e) => log(`HỎNG: ${String(e)}`));
