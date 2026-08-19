/**
 * Phase 4 — §4.2 bảo toàn cộng tính của Q-P4-4, và §6.2 mục 16–18.
 *
 * `population_total = within_2km + beyond_2km + distance_unknown` là bất biến mà cả thanh
 * xếp hạng lẫn câu "chặn dưới" dựa vào. Ba nhánh `FILTER` của SQL phải PHỦ KÍN và KHÔNG
 * CHỒNG nhau; một giá trị cự ly `NaN` rơi khỏi cả ba mà tổng vẫn ra một số trông bình
 * thường — nên bất biến này phải được kiểm bằng phép cộng, không bằng mắt.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildOpportunityCommuneRank, type OpportunityCommuneRow } from "../src/viz/chart-models";

/** Một xã dựng từ các mảnh dân số — luôn thoả bảo toàn theo cách dựng. */
function commune(
  code: string,
  parts: { within: number; beyond: number; unknown: number; missingCells?: number },
): OpportunityCommuneRow {
  const { within, beyond, unknown, missingCells = 0 } = parts;
  return {
    commune_code: code,
    commune_name: `Xã ${code}`,
    n_cells: 10,
    n_population_missing: missingCells,
    n_distance_unknown: unknown > 0 ? 1 : 0,
    population_total: within + beyond + unknown,
    population_measured: within + beyond,
    population_within_2km: within,
    population_beyond_2km: beyond,
    population_distance_unknown: unknown,
  };
}

/** Đúng phép kiểm mà bộ nạp chạy trên dữ liệu thật (`assertPopulationConservation`). */
function conserved(r: OpportunityCommuneRow): boolean {
  if (r.population_total === null || r.n_population_missing > 0) return true;
  const parts = r.population_within_2km + r.population_beyond_2km + r.population_distance_unknown;
  return Math.abs(parts - r.population_total) <= 0.5;
}

test("bảo toàn dân số giữ được trên mọi tổ hợp mảnh", () => {
  const rows = [
    commune("C1", { within: 2000, beyond: 8000, unknown: 0 }),
    commune("C2", { within: 0, beyond: 0, unknown: 5000 }),
    commune("C3", { within: 1234.5, beyond: 0, unknown: 765.5 }),
    commune("C4", { within: 0, beyond: 0, unknown: 0 }),
  ];
  for (const r of rows) assert.ok(conserved(r), `xã ${r.commune_code} phải thoả bảo toàn`);
});

test("một mảnh rơi khỏi cả ba nhóm bị BẮT, không lọt im lặng", () => {
  // Mô phỏng đúng hậu quả của một cự ly `NaN`: 500 người không vào nhóm nào.
  const broken: OpportunityCommuneRow = {
    ...commune("C5", { within: 1000, beyond: 2000, unknown: 0 }),
    population_total: 3500,
  };
  assert.equal(conserved(broken), false);
});

test("xã có dân số KHUYẾT được miễn kiểm, không bị báo động nhầm", () => {
  const partial: OpportunityCommuneRow = {
    ...commune("C6", { within: 100, beyond: 100, unknown: 0, missingCells: 3 }),
    population_total: 500,
  };
  assert.equal(conserved(partial), true, "khuyết dân số ⇒ tổng vốn không cộng lại được");
});

// ── §6.2 mục 17–18: null hạng, chặn dưới, và hạng đồng ──────────────────────

test("xã có dân nhưng KHÔNG đo được cự ly nào thì hạng là NULL, không phải 0", () => {
  const rows = [
    commune("A", { within: 0, beyond: 900, unknown: 0 }),
    // Toàn bộ dân chưa rõ cự ly ⇒ không có chặn dưới nào để xếp hạng.
    commune("B", { within: 0, beyond: 0, unknown: 4000 }),
  ];
  const model = buildOpportunityCommuneRank(rows);

  assert.equal(model.topRanks.length, 1, "chỉ xã A xếp được hạng");
  assert.equal(model.topRanks[0]!.communeCode, "A");
  assert.equal(model.nMissingRank, 1, "xã B phải được ĐẾM RA, không biến mất");
});

test("xã khuyết MỘT PHẦN cự ly vẫn có chặn dưới, kèm số dân chưa rõ đứng cạnh", () => {
  const rows = [commune("A", { within: 1000, beyond: 3000, unknown: 6000 })];
  const model = buildOpportunityCommuneRank(rows);
  const row = model.topRanks[0]!;

  assert.equal(row.rankValue, 3000, "chặn dưới là dân ĐÃ XÁC NHẬN ngoài 2 km");
  assert.equal(row.populationDistanceUnknown, 6000, "phần chưa rõ không bị gộp vào hai bên");
  assert.ok(row.distanceCoveragePct < 100, "phủ cự ly phải nói ra là chưa đủ");
  assert.equal(row.rankValue! < row.populationDistanceUnknown, true,
    "chặn dưới nhỏ hơn phần chưa biết — đúng lý do KHÔNG được gọi nó là tổng dân thiếu phục vụ");
});

test("xã dân số bằng 0 có hạng 0, khác hẳn hạng NULL", () => {
  const rows = [
    commune("A", { within: 0, beyond: 500, unknown: 0 }),
    commune("Z", { within: 0, beyond: 0, unknown: 0 }),
  ];
  const model = buildOpportunityCommuneRank(rows);
  const zero = model.topRanks.find((r) => r.communeCode === "Z");
  assert.ok(zero, "xã không dân vẫn xếp hạng được");
  assert.equal(zero.rankValue, 0);
  assert.equal(model.nMissingRank, 0);
});

test("hạng ĐỒNG hiển thị cùng số, và mã xã không bao giờ thành thứ hạng", () => {
  const rows = [
    commune("C1", { within: 0, beyond: 6000, unknown: 0 }),
    commune("C2", { within: 0, beyond: 6000, unknown: 0 }),
    commune("C3", { within: 0, beyond: 1000, unknown: 0 }),
  ];
  const model = buildOpportunityCommuneRank(rows);
  assert.equal(model.topRanks[0]!.rank, 1);
  assert.equal(model.topRanks[1]!.rank, 1, "cùng giá trị ⇒ CÙNG hạng");
  assert.equal(model.topRanks[0]!.tieCount, 2);
  assert.equal(model.topRanks[2]!.rank, 3, "hạng thi đấu: sau hai đồng hạng 1 là hạng 3");
});
