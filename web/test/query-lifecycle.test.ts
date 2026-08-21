/**
 * Phase 4 — §4.2 Q-P4-5 và §6.5 mục 36–40: tương tác biểu đồ KHÔNG phát SQL.
 *
 * Không dựng DuckDB ở đây (bundle WASM không chạy trong `node --test`, và một test cần
 * mạng thì không còn là cổng hồi quy). Thay vào đó khoá lại thứ QUYẾT ĐỊNH số truy vấn:
 * đường nào được phép gọi `query()`, và đường nào chỉ được đọc mảng đã nạp.
 *
 * Đây là bản kiểm CẤU TRÚC, không phải bản đo. Con số truy vấn thật do `bench.ts` in ra
 * (cột `queries`, có `getIssuedQueryCount` đứng sau) trên trình duyệt thật.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
const code = (rel: string) =>
  readFileSync(`${SRC}${rel}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("bộ đếm truy vấn được EXPORT và có nơi dùng — không phải API chết", () => {
  const duck = code("data/duckdb.ts");
  assert.match(duck, /export function getIssuedQueryCount/);
  assert.match(duck, /export function resetIssuedQueryCount/);

  // `bench.ts` là bên tiêu thụ thật: nó in cột `queries` cho từng gói tỉnh.
  const bench = code("bench.ts");
  assert.match(bench, /issuedQueries/, "bench phải đếm truy vấn cho cổng §4.4");
  assert.match(bench, /queries/, "cột số truy vấn phải có trong bảng kết quả");
});

test("tầng model biểu đồ KHÔNG chạm tới DuckDB (§2.4 luật 3)", () => {
  const models = code("viz/chart-models.ts");
  assert.doesNotMatch(models, /from "\.\.\/data\/duckdb"/, "model thuần không được nạp DuckDB");
  assert.doesNotMatch(models, /\bquery\(/, "model thuần không được phát SQL");
  assert.doesNotMatch(models, /useStore/, "model thuần không được đọc store");

  // Chỉ được import KIỂU từ tầng dữ liệu; import giá trị sẽ kéo cả bộ nạp WASM vào.
  assert.doesNotMatch(
    models,
    /^import \{[^}]*\} from "\.\.\/data\/queries"/m,
    "import giá trị từ data/queries kéo theo DuckDB — đã từng làm hỏng cả test thuần",
  );
});

test("tầng filter thuần: đặt/xoá bộ lọc không thể phát SQL (§4.2 Q-P4-5)", () => {
  const filter = code("state/filter.ts");
  assert.doesNotMatch(filter, /\bquery\(|duckdb|fetch\(/);

  const store = code("state/store.ts");
  assert.doesNotMatch(store, /\bquery\(|registerParquet/,
    "reducer không được nạp dữ liệu: commit bộ lọc chỉ cắt mảng đã có trong RAM");
});

test("SQL của biểu đồ nằm ở tầng dữ liệu, không nằm trong component", () => {
  for (const rel of [
    "components/atlas/LensChartController.tsx",
    "components/atlas/PrimaryLensChart.tsx",
    "ui/PopulationHistogram.tsx",
    "ui/PowerTierBreakdown.tsx",
    "ui/AccessCurve.tsx",
    "ui/UtilizationDayProfiles.tsx",
    "ui/OpportunityCommuneRankBars.tsx",
  ]) {
    const src = code(rel);
    // Bám vào dấu hiệu KHÔNG mơ hồ của SQL. `/SELECT\s/i` từng khớp cả thẻ `<select>` của
    // bộ chọn khoảng bằng bàn phím trong PopulationHistogram — một cổng báo động nhầm thì
    // sớm muộn cũng bị nới ra cho qua chuyện.
    assert.doesNotMatch(src, /\bSELECT\b[\s\S]{0,400}?\bFROM\b/i,
      `${rel} chứa câu SQL — §5.2 giao SQL cho tầng dữ liệu`);
    assert.doesNotMatch(src, /read_parquet|registerParquet/,
      `${rel} chạm thẳng vào Parquet — phải đi qua tầng dữ liệu`);
  }
});

test("Q-P4-4 đi qua phiên biểu đồ và chỉ nạp MỘT lần cho mỗi phiên (§6.5 mục 39)", () => {
  const controller = code("components/atlas/LensChartController.tsx");
  assert.match(controller, /loadOpportunityCommunes/, "controller gọi qua chart-session");
  assert.doesNotMatch(controller, /fetchOpportunityCommunes/, "không gọi thẳng tầng truy vấn");

  const session = code("data/chart-session.ts");
  assert.match(session, /assertDatasetSession/, "phiên phải khoá theo bộ dữ liệu");

  const queries = code("data/queries.ts");
  // Cache Promise: lần thứ hai dùng lại, lần HỎNG bị xoá để nút Thử lại gọi thật.
  assert.match(queries, /opportunityCommuneCache \?\?=/, "kết quả thành công phải dùng lại");
  assert.match(queries, /opportunityCommuneCache = null/, "lần hỏng phải bị xoá khỏi cache");
});

test("Access Curve là CHỈ ĐỌC — không nhận và không phát intent nào (§1.4)", () => {
  const curve = code("ui/AccessCurve.tsx");
  assert.doesNotMatch(curve, /onFilterIntent|onTimeIntent|onEntityIntent/,
    "Access Curve đo Ô H3 còn bản đồ Tiếp cận tô ĐƯỜNG: phát bộ lọc từ đây là bịa một phép quy đổi");

  const router = code("components/atlas/PrimaryLensChart.tsx");
  // Chốt theo Ý ĐỊNH, không theo chuỗi JSX nguyên văn: Access Curve được nhận dữ liệu và
  // mực (CR 4.1 §C2 thêm `theme`), nhưng KHÔNG được nhận một callback nào. Chốt nguyên văn
  // biến mọi prop khai báo hợp lệ về sau thành một lần FAIL giả.
  assert.match(router, /<AccessCurve\b[^>]*\bmodel=\{accessModel\}/,
    "router phải truyền model cho Access Curve");
  assert.doesNotMatch(router, /<AccessCurve\b[^>]*on[A-Z]\w*=/,
    "router không được truyền callback nào cho Access Curve");
});

test("mỗi biểu đồ chỉ nhận đúng callback nó được phép phát (§3.3)", () => {
  const router = code("components/atlas/PrimaryLensChart.tsx");
  assert.match(router, /PopulationHistogram[\s\S]{0,120}onFilterIntent/);
  assert.match(router, /PowerTierBreakdown[\s\S]{0,120}onFilterIntent/);
  assert.match(router, /UtilizationDayProfiles[\s\S]{0,200}onTimeIntent/);
  assert.match(router, /OpportunityCommuneRankBars[\s\S]{0,120}onEntityIntent/);

  // Hồ sơ ngày KHÔNG được nhận quyền lọc, Rank KHÔNG được nhận quyền đổi giờ.
  assert.doesNotMatch(router, /UtilizationDayProfiles[\s\S]{0,200}onFilterIntent/);
  assert.doesNotMatch(router, /OpportunityCommuneRankBars[\s\S]{0,160}onFilterIntent/);
});
