/**
 * Sức khoẻ dữ liệu — Phase 8 §8 điểm 1, 3, 4, 7, 8.
 *
 * File này đọc DỮ LIỆU THẬT: cả 34 manifest tỉnh cộng `vn/manifest.json` đều nằm trong repo,
 * nên không có fixture nào phải bịa ra. Bốn nhóm phép kiểm:
 *
 *   1. **Bất biến số học** — mọi ô trống được phân giải, mọi mẫu số cộng đúng, năm phương
 *      trình lọc đóng kín. Chạy trên cả 34 tỉnh, không chỉ Hà Nội.
 *   2. **Chống tái phát**, mỗi ca ghim theo tên vì mỗi ca là một lỗi dự án này ĐÃ ship một lần.
 *   3. **Quét khả chuyển** — dựng quyết định của cả chín khối trên 35 manifest và chốt rằng
 *      không khối nào "hiện ra nhưng rỗng".
 *   4. **Hình dạng truy vấn và xuất dữ liệu** — không `SELECT *`, `coords` không tràn vào JS,
 *      `BigInt` không làm vỡ phép tuần tự hoá.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DATA_BLOCKS,
  columnRows,
  connectorGap,
  fullyCoveredColumns,
  gateFor,
  isNationalManifest,
} from "../src/data/data-health.ts";
import { DATA_TABLES, KEYSET_THRESHOLD_ROWS, buildWhere, tableMeta } from "../src/data/datamode.ts";
import { buildExportFilename, fileCountFor, toPlainJson } from "../src/data/export.ts";
import type { Manifest } from "../src/data/manifest.ts";
import { FIELDS } from "../src/fields.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(ROOT, "web/public/data");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));

const PROVINCE_CODES: string[] = fs
  .readdirSync(path.join(DATA, "p"))
  .filter((d) => /^\d{2}$/.test(d))
  .sort();

const PROVINCES: Array<{ code: string; m: Manifest }> = PROVINCE_CODES.map((code) => ({
  code,
  m: readJson(path.join(DATA, "p", code, "manifest.json")) as Manifest,
}));

const HANOI = PROVINCES.find((p) => p.code === "01")!.m;
const NATIONAL = readJson(path.join(DATA, "vn/manifest.json")) as Manifest;

test("bộ dữ liệu thẩm định có đủ 34 tỉnh — nếu không, mọi phép quét dưới đây nói dối", () => {
  assert.equal(PROVINCES.length, 34);
});

// ── 1. Bất biến số học, trên CẢ 34 TỈNH ──────────────────────────────────────────────

describe("§8.1 & §8.3 — bất biến của `null_states` trên cả 34 tỉnh", () => {
  test("mọi ô trống rơi vào ĐÚNG MỘT xô: Σ states = n_rows − n_present", () => {
    for (const { code, m } of PROVINCES) {
      for (const [tbl, cols] of Object.entries(m.null_states ?? {})) {
        for (const [col, d] of Object.entries(cols)) {
          const sum = Object.values(d.states).reduce((t, b) => t + b.n, 0);
          assert.equal(
            sum,
            d.n_rows - d.n_present,
            `p${code} ${tbl}.${col}: ${sum} ô đã phân giải ≠ ${d.n_rows - d.n_present} ô trống`,
          );
        }
      }
    }
  });

  test("n_rows − n_not_applicable = n_applicable, và CHỈ NOT_APPLICABLE bị trừ", () => {
    for (const { code, m } of PROVINCES) {
      for (const [tbl, cols] of Object.entries(m.null_states ?? {})) {
        for (const [col, d] of Object.entries(cols)) {
          const na = Object.values(d.states)
            .filter((b) => b.state === "NOT_APPLICABLE")
            .reduce((t, b) => t + b.n, 0);
          assert.equal(d.n_applicable, d.n_rows - na, `p${code} ${tbl}.${col}: mẫu số sai`);
          // FILTERED và NOT_MEASURED Ở LẠI mẫu số (§0.2). Nếu chúng cũng bị trừ thì mọi cột
          // sẽ tự động đọc thành 100 % và bảng này thành đồ trang trí.
          const other = Object.values(d.states)
            .filter((b) => b.state !== "NOT_APPLICABLE")
            .reduce((t, b) => t + b.n, 0);
          if (other > 0) assert.ok(d.n_applicable > d.n_present, `p${code} ${tbl}.${col}`);
        }
      }
    }
  });

  test("hai tỉ lệ khớp hai mẫu số của chính chúng", () => {
    for (const { code, m } of PROVINCES) {
      for (const [tbl, cols] of Object.entries(m.null_states ?? {})) {
        for (const [col, d] of Object.entries(cols)) {
          assert.ok(
            Math.abs(d.share_rows - d.n_present / d.n_rows) < 1e-5,
            `p${code} ${tbl}.${col}: share_rows lệch mẫu số`,
          );
          if (d.n_applicable > 0) {
            assert.ok(
              Math.abs(d.share_of_applicable - d.n_present / d.n_applicable) < 1e-5,
              `p${code} ${tbl}.${col}: share_of_applicable lệch mẫu số`,
            );
          }
        }
      }
    }
  });

  test("§1.1 Rule 0 — mọi xô khai `basis`, và `table_invariant` mang khoá đối chiếu", () => {
    for (const { code, m } of PROVINCES) {
      for (const [tbl, cols] of Object.entries(m.null_states ?? {})) {
        for (const [col, d] of Object.entries(cols)) {
          for (const [key, b] of Object.entries(d.states)) {
            assert.ok(
              ["row_predicate", "table_invariant", "residual"].includes(b.basis),
              `p${code} ${tbl}.${col}.${key}: basis lạ`,
            );
            if (b.basis === "table_invariant") {
              assert.ok(b.verified_by, `p${code} ${tbl}.${col}: mức bảng mà không đối chiếu được`);
            }
            assert.ok(b.rule && b.rule.length > 0, `p${code} ${tbl}.${col}.${key}: luật rỗng`);
          }
        }
      }
    }
  });

  /**
   * §9 — kiểm kê ô trống DƯ, ghim theo số.
   *
   * §9 của đặc tả liệt kê ba khuyết tật, đo trên Hà Nội. Máy phân giải khai báo mới cho thấy
   * §9 đo THIẾU: trên cả nước còn năm cột nữa mang ô trống không luật nào giải thích, và
   * chúng vốn bị bản trước gộp vào một xô CÓ LUẬT nên không ai nhìn thấy. Kiểm kê dưới đây
   * là bản đầy đủ, ghim theo con số — một ô dư MỚI làm đỏ test, một ô dư cũ được vá thì cũng
   * làm đỏ test và người vá phải sửa con số ở đây.
   */
  test("kiểm kê ô trống DƯ khớp đúng bản đã ghim — không cột nào mọc thêm, không cột nào biến mất", () => {
    const seen = new Map<string, number>();
    for (const { m } of PROVINCES) {
      for (const [tbl, cols] of Object.entries(m.null_states ?? {})) {
        for (const [col, d] of Object.entries(cols)) {
          for (const b of Object.values(d.states)) {
            if (b.basis !== "residual") continue;
            const k = `${tbl}.${col}`;
            seen.set(k, (seen.get(k) ?? 0) + b.n);
          }
        }
      }
    }
    assert.deepEqual(Object.fromEntries([...seen].sort()), {
      // §9-1 — `asym` cần CẢ hai chiều hữu hạn; chiều về có thể vô hạn nơi chiều đi thì không.
      "grid.dist_station_asym_m": 22,
      // §9-2 — một trạm khai số cổng mà không khai công suất (`port_config_source` là
      // TELEMETRY_BOUND, không phải UNKNOWN), lặp trên ba cột cùng nguồn.
      "stations.current_type": 7,
      "stations.power_kw_max_port": 7,
      "stations.power_kw_site": 7,
      // §9-3 — trạm `ever_active = true` mà vẫn trống. §9 chỉ nêu `weekend_ratio` ở Hà Nội;
      // trên cả nước `night_share` mắc cùng lỗi, và hai cột phân vị mắc một lỗi họ hàng.
      "station_occupancy.night_share": 2,
      "station_occupancy.weekend_ratio": 8,
      "station_occupancy.util_pctl": 7,
      "station_occupancy.util_pctl_peer": 7,
    });
  });
});

describe("§8.3 — số học của khối ĐÃ LOẠI", () => {
  test("`trước − đã loại = còn lại` đóng kín cho MỌI dòng kiểu `removal`, ở cả 34 tỉnh", () => {
    for (const { code, m } of PROVINCES) {
      const f = m.filters!;
      assert.equal(Object.keys(f).length, 5, `p${code}: không đủ năm dòng`);
      const removals = Object.entries(f).filter(([, v]) => v.kind === "removal");
      assert.equal(removals.length, 4, `p${code}: số phép lọc THẬT không phải 4`);
      for (const [k, v] of removals) {
        assert.notEqual(v.removed, null, `p${code} ${k}: phép lọc mà không khai số đã loại`);
        assert.equal(v.before - v.removed!, v.after, `p${code} ${k}: phương trình không đóng`);
        assert.ok(v.removed! >= 0, `p${code} ${k}: "đã loại" âm — đây không phải một phép loại`);
      }
    }
  });

  test("dòng POI khai mình là HAI TẬP, không phải một phép loại — và bốn con số của nó thật", () => {
    // Ép POI vào khuôn phép lọc cho ra `removed` ÂM ở Cao Bằng (nhu cầu 123 > trực quan 84):
    // phương trình vẫn "đóng kín" nhưng con số nó khẳng định thì vô nghĩa. Bất biến đúng là
    // hai tập giao nhau một phần, và cả bốn phần đều đếm được.
    for (const { code, m } of PROVINCES) {
      const p = m.filters!["poi_demand_vs_visual"]!;
      assert.equal(p.kind, "two_sets", `p${code}`);
      assert.equal(p.removed, null, `p${code}: hai tập mà lại khai một hiệu`);
      assert.equal(p.n_both! + p.n_visual_only!, p.n_visual!, `p${code}: phân hoạch trực quan sai`);
      assert.equal(p.n_both! + p.n_demand_only!, p.n_demand!, `p${code}: phân hoạch nhu cầu sai`);
      assert.ok(p.n_visual! > 0 && p.n_demand! > 0, `p${code}: một tập rỗng — đọc trượt file?`);
    }
    const h = HANOI.filters!["poi_demand_vs_visual"]!;
    assert.equal(h.n_visual, 5896);
    assert.equal(h.n_demand, 3919);
    // Và hai tập KHÔNG lồng nhau — bằng chứng cho chính quyết định mô hình ở trên.
    const cb = PROVINCES.find((p) => p.code === "04")!.m.filters!["poi_demand_vs_visual"]!;
    assert.ok(cb.n_demand! > cb.n_visual!, "Cao Bằng: tập nhu cầu LỚN HƠN tập trực quan");
    assert.ok(cb.n_visual_only! > 0 && cb.n_demand_only! > 0, "hai tập phải giao nhau một phần");
  });

  test("AC-8 — đường bộ Hà Nội: 240 215 − 124 284 = 115 931", () => {
    const rw = HANOI.filters!["road_ways"]!;
    assert.equal(rw.before, 240215);
    assert.equal(rw.removed, 124284);
    assert.equal(rw.after, 115931);
  });

  test("AC-7 — tỉ lệ điểm sạc cá nhân dựng lại từ 1 811/2 521, KHÔNG phải từ 939", () => {
    const p = HANOI.filters!["private_ac_charge_points"]!;
    assert.equal(p.before, 2521);
    assert.equal(p.removed, 1811);
    assert.equal(p.after, 710);
    assert.ok(Math.abs(p.share_removed_stations! - 1811 / 2521) < 1e-4);
    // Con số mà mẫu số SAI sẽ cho — chốt lại để không ai vô tình quay về nó.
    assert.ok(Math.abs(p.share_removed_stations! - 1811 / 939) > 0.05);
    assert.equal(p.after, HANOI.totals!.in_scope.n_stations);
    assert.ok(p.denominator.length > 0, "mỗi phép lọc phải NÊU TÊN mẫu số của nó");
  });


});

// ── 2. CHỐNG TÁI PHÁT — mỗi ca là một lỗi đã ship một lần ────────────────────────────

describe("§8.4 — bảy ca chống tái phát, ghim theo tên", () => {
  test("util_cell: 9,93 % của toàn lưới VÀ 97,33 % của phần áp dụng, cả hai đều phát ra", () => {
    const d = HANOI.null_states!["grid"]!["util_cell"]!;
    assert.ok(Math.abs(d.share_rows - 0.099318) < 1e-4, "mẫu số thô mất tích");
    assert.ok(Math.abs(d.share_of_applicable - 0.973274) < 1e-4, "mẫu số thật sai");
    assert.equal(d.n_applicable, 449);
    assert.equal(d.states["NOT_APPLICABLE"]!.n, 3951);
    assert.equal(d.states["NOT_MEASURED"]!.n, 12);
    // Và cả hai phải tới được tầng UI qua cùng một hàng.
    const row = columnRows(HANOI, "grid").find((r) => r.column === "util_cell")!;
    assert.ok(Math.abs(row.shareRows - 0.099318) < 1e-4);
    assert.ok(Math.abs(row.shareApplicable - 0.973274) < 1e-4);
  });

  test("n_guns_imputed: 97,2 % trống và KHÔNG cảnh báo", () => {
    const row = columnRows(HANOI, "stations").find((r) => r.column === "n_guns_imputed")!;
    assert.equal(row.warns, false, "cột khoẻ mạnh nhất trong gói mà lại đeo ⚠");
    assert.equal(row.nUnknown, 0);
    assert.equal(row.shareApplicable, 1);
    assert.ok(row.shareRows < 0.03, "mẫu số thô phải cho thấy 2,8 % — con số gây hiểu lầm");
  });

  test("commune.quality_flag: 98,4 % trống và KHÔNG cảnh báo", () => {
    const row = columnRows(HANOI, "commune").find((r) => r.column === "quality_flag")!;
    assert.equal(row.warns, false);
    assert.equal(row.shareApplicable, 1);
    assert.equal(row.buckets[0]!.basis, "table_invariant");
    assert.ok(row.buckets[0]!.verifiedBy, "tuyên bố mức bảng phải đối chiếu được");
  });

  test("Khánh Hoà (56): ba mẫu số cùng một cột, và chỉ MỘT trong ba đáng báo động", () => {
    const kh = PROVINCES.find((p) => p.code === "56")!.m;
    const d = kh.null_states!["grid"]!["dist_station_network_m"]!;
    assert.ok(d.share_rows < 0.4, `phủ ô ${d.share_rows} — đáng báo động, và đúng`);
    assert.ok(d.share_of_applicable > 0.999, "phủ trên phần áp dụng phải gần như tuyệt đối");
    assert.ok(d.pop_share! > 0.98, `phủ theo dân ${d.pop_share} — phần dân còn nguyên`);
    // Bài học của cả pha, ghim thành một bất đẳng thức.
    assert.ok(d.pop_share! - d.share_rows > 0.5, "phủ ô và phủ dân phải KỂ HAI CÂU KHÁC NHAU");
  });

  test("snow_frac & moss_frac: hằng số ở cả 34 tỉnh dù phủ 100 %", () => {
    for (const { code, m } of PROVINCES) {
      assert.ok("snow_frac" in m.degenerate_columns!, `p${code}: snow_frac không bị bắt`);
      assert.ok("moss_frac" in m.degenerate_columns!, `p${code}: moss_frac không bị bắt`);
      assert.equal(m.coverage["snow_frac"]!.cell_share, 1, `p${code}: và nó PHỦ 100 %`);
      // Không bộ đếm ô trống nào chạm được tới nó — đó chính là lý do khối này tồn tại.
      assert.equal(m.null_states!["grid"]!["snow_frac"], undefined);
    }
    // Kiểu giữ nguyên là SỐ, không bị đẩy thành chuỗi (`np.int64` không phải `int`).
    for (const v of Object.values(HANOI.degenerate_columns!)) {
      assert.equal(typeof v, "number", "cột hằng nguyên bị stringify");
    }
  });

  test("ZERO_NO_WEIGHT hiện ra, và nó KHÔNG tới được từ bất kỳ số đo ô trống nào", () => {
    const z = HANOI.invalid_values!["grid.population@zero_no_weight"]!;
    assert.equal(z.n, 135);
    assert.ok(z.share_rows! > 0.03);
    // Cột `population` phủ 100 %: đó chính là lý do một bảng sức khoẻ chỉ đếm null mù với nó.
    assert.equal(HANOI.coverage["population"]!.cell_share, 1);
    assert.equal(HANOI.null_states!["grid"]!["population"], undefined);
    // Trên cả nước nó lớn hơn TỔNG mọi ô trống trong gói cộng lại.
    let zeroNational = 0;
    let blanksNational = 0;
    for (const { m } of PROVINCES) {
      zeroNational += m.invalid_values?.["grid.population@zero_no_weight"]?.n ?? 0;
      for (const cols of Object.values(m.null_states ?? {})) {
        for (const d of Object.values(cols)) blanksNational += d.n_rows - d.n_present;
      }
    }
    assert.ok(zeroNational > 100000, `chỉ ${zeroNational} ô ZERO_NO_WEIGHT trên cả nước?`);
    assert.ok(
      zeroNational > blanksNational * 0.1,
      "quy mô của ZERO_NO_WEIGHT phải so được với toàn bộ ô trống của gói",
    );
  });

  test("detour_ratio tách 87 / 3 đúng tại hằng 200 m, và hằng ĐI KÈM số đếm", () => {
    const d = HANOI.null_states!["grid"]!["detour_ratio"]!;
    assert.equal(d.states["FILTERED"]!.n, 87);
    assert.equal(d.states["NOT_APPLICABLE"]!.n, 3);
    assert.equal(d.states["FILTERED"]!.threshold!.name, "DETOUR_MIN_EUCLID_M");
    assert.equal(d.states["FILTERED"]!.threshold!.value, 200);
    assert.match(d.states["FILTERED"]!.threshold!.source, /roadgraph\.py/);
  });
});

describe("§2.1 — đối soát súng/cổng đứng trên CÙNG một phạm vi", () => {
  test("Hà Nội: 8 823 súng so với 9 878 cổng (IN+BUFFER) — thiếu 1 055", () => {
    const g = connectorGap(HANOI)!;
    assert.equal(g.nGuns, 8823);
    assert.equal(g.nPorts, 9878);
    assert.equal(g.gap, 1055);
    assert.equal(g.scope, "IN+BUFFER");
    // Mẫu số SAI (`in_scope.n_ports` = 7 785) lật DẤU của khoảng chênh. Ghim lại để không quay về.
    assert.notEqual(g.nPorts, HANOI.totals!.in_scope.n_ports);
    assert.equal(g.nStationsWithoutConnectors, 28, "§2.1 buộc nói ra 28 trạm không có connector");
  });

  test("mọi tỉnh: vế LIVE và vế ASSET cùng phạm vi, và số trạm thiếu connector nói ra được", () => {
    for (const { code, m } of PROVINCES) {
      const g = connectorGap(m)!;
      assert.equal(g.nPorts, m.totals!.all.n_ports, `p${code}`);
      assert.ok(g.nStationsWithoutConnectors >= 0, `p${code}`);
      assert.ok(g.nStationsWithConnectors <= g.nStationsTotal, `p${code}`);
    }
  });

  test("AC-20 — từ vựng chuẩn phích đọc từ dữ liệu, và tổng khớp `n_guns`", () => {
    for (const { code, m } of PROVINCES) {
      const c = m.totals!.connectors;
      const sum = Object.values(c.by_standard).reduce((t, v) => t + v.n_guns, 0);
      assert.equal(sum, c.n_guns, `p${code}: tổng theo chuẩn ≠ n_guns — mẫu số của % sẽ sai`);
    }
  });
});

// ── 3. QUÉT KHẢ CHUYỂN — 34 tỉnh + toàn quốc ─────────────────────────────────────────

describe("§8.8 & AC-18/AC-19 — quét khả chuyển trên 35 manifest", () => {
  const ALL: Array<{ label: string; m: Manifest }> = [
    ...PROVINCES.map((p) => ({ label: `p${p.code}`, m: p.m })),
    { label: "vn", m: NATIONAL },
  ];

  test("AC-18 — mọi khối quyết định được trên cả 35 manifest, không nhánh riêng cho tỉnh nào", () => {
    for (const { label, m } of ALL) {
      for (const b of DATA_BLOCKS) {
        const g = gateFor(b, m);
        assert.ok(typeof g.render === "boolean", `${label}/${b}: cổng không quyết định được`);
      }
    }
  });

  test("AC-18 — hai tỉnh khó nhất dựng đủ mọi khối", () => {
    // Điện Biên (11): 0 % telemetry, 4 cờ, lớp occupancy bị chặn.
    // Khánh Hoà (56): 66 % số ô không tới được bằng đường.
    for (const code of ["11", "56"]) {
      const m = PROVINCES.find((p) => p.code === code)!.m;
      for (const b of DATA_BLOCKS) {
        assert.equal(gateFor(b, m).render, true, `p${code}/${b} không dựng được`);
      }
      assert.ok(columnRows(m, "grid").length > 0, `p${code}: không cột nào phân giải`);
    }
    const dienBien = PROVINCES.find((p) => p.code === "11")!.m;
    assert.ok(
      (dienBien.unusable_layers ?? []).some((u) => u.layer === "occupancy"),
      "Điện Biên phải mang cổng chặn lớp occupancy, và khối 9 phải nêu lý do",
    );
  });

  test("AC-19 — ở chế độ toàn quốc, khối theo cột VẮNG MẶT kèm lý do, không rỗng", () => {
    assert.equal(isNationalManifest(NATIONAL), true);
    // Đúng những khối mà `vn/manifest.json` không có nguồn.
    for (const b of ["coverage", "nullStates", "suspect", "filters", "connectors", "table"] as const) {
      const g = gateFor(b, NATIONAL);
      assert.equal(g.render, false, `${b} tự nhận dựng được trên manifest không có dữ liệu`);
      if (!g.render) {
        assert.ok(g.reason.length > 20, `${b}: lý do quá ngắn để đọc được`);
        assert.ok(g.missing.length > 0, `${b}: không nêu khoá nào vắng`);
      }
    }
  });

  test("AC-19 — KHÔNG khối nào dựng ra một tuyên bố trên dữ liệu vắng mặt", () => {
    // Đây là lỗi cụ thể: khối KHOẢNG TRỐNG từng in "Bảng grid có 100 % độ phủ trên toàn bộ
    // các cột" khi manifest không hề có `null_states`. Bất biến: dựng ⇒ CÓ nguồn.
    for (const { label, m } of ALL) {
      if (gateFor("nullStates", m).render) {
        assert.ok(Object.keys(m.null_states ?? {}).length > 0, `${label}: dựng mà không nguồn`);
      }
      if (gateFor("coverage", m).render) {
        assert.ok(Object.keys(m.coverage ?? {}).length > 0, `${label}: dựng mà không nguồn`);
      }
      if (gateFor("provenance", m).render) assert.ok(m.vintage, `${label}: dựng mà không niên bản`);
      if (gateFor("kpi", m).render) assert.ok(m.totals?.in_scope, `${label}`);
    }
  });

  test("AC-18 — mỗi tỉnh phân giải được MỌI cột của MỌI bảng, không ném", () => {
    for (const { code, m } of PROVINCES) {
      for (const tbl of Object.keys(m.null_states ?? {})) {
        const rows = columnRows(m, tbl);
        assert.equal(rows.length, Object.keys(m.null_states![tbl]!).length, `p${code}/${tbl}`);
        // §2.3 — xếp theo `MISSING + NOT_MEASURED` giảm dần.
        for (let i = 1; i < rows.length; i++) {
          assert.ok(rows[i - 1]!.nUnknown >= rows[i]!.nUnknown, `p${code}/${tbl}: sai thứ tự`);
        }
      }
    }
  });

  test("§2.2 — 57 cột lưới phủ 100 % vẫn ĐẾM ĐƯỢC, không biến mất khỏi màn hình", () => {
    const clean = fullyCoveredColumns(HANOI);
    assert.equal(clean.length, 57, `${clean.length} cột sạch, đặc tả §0.5 nói 57`);
    assert.equal(Object.keys(HANOI.coverage).length, 61);
    assert.ok(clean.includes("snow_frac"), "cột phủ 100 % mà vô dụng vẫn phải đếm được");
    for (const { code, m } of PROVINCES) {
      assert.ok(fullyCoveredColumns(m).length > 0, `p${code}: không cột sạch nào?`);
    }
  });

  test("§9-8 — khoá chưa đo hiện ra là CHƯA ĐO ở cả 34 tỉnh, kèm hệ quả", () => {
    for (const { code, m } of PROVINCES) {
      const nm = m.not_measured ?? {};
      assert.ok(nm["quality.n_only_in_secondary"], `p${code}: §9-8 không được khai`);
      assert.match(nm["quality.n_only_in_secondary"]!.consequence, /THIEU_NHA_VAN_HANH_KHAC/);
      // Và khoá đó thật sự còn null — nếu thượng nguồn chạy phép đo, khối tự biến mất.
      const q = m.quality as Record<string, unknown> | undefined;
      assert.equal(q?.["n_only_in_secondary"] ?? null, null, `p${code}`);
    }
  });
});

// ── 4. HÌNH DẠNG TRUY VẤN & XUẤT DỮ LIỆU ─────────────────────────────────────────────

describe("§8.7 & AC-16 — hình dạng truy vấn", () => {
  /** Bỏ chú thích trước khi quét: docstring của chính hai file này NHẮC tới `SELECT *`. */
  const stripComments = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const SRC = ["src/data/datamode.ts", "src/data/export.ts"].map((f) => ({
    f,
    text: fs.readFileSync(path.join(ROOT, "web", f), "utf-8"),
    code: stripComments(fs.readFileSync(path.join(ROOT, "web", f), "utf-8")),
  }));

  test("AC-16 — không truy vấn nào ở workspace DỮ LIỆU chiếu `SELECT *`", () => {
    for (const { f, code } of SRC) {
      const hits = [...code.matchAll(/SELECT\s+\*/gi)];
      for (const m of hits) {
        const before = code.slice(Math.max(0, m.index - 40), m.index);
        // `DESCRIBE SELECT *` KHÔNG vật chất hoá dòng nào — nó là câu trả lời đúng cho câu hỏi
        // "bảng có cột gì", và nó là ngoại lệ DUY NHẤT được phép.
        assert.match(before, /DESCRIBE\s+$/, `${f}: SELECT * trần ở "${code.slice(m.index, m.index + 60)}"`);
      }
      // Và mọi truy vấn phân trang/xuất phải chiếu danh sách cột dựng sẵn.
      if (f.endsWith("datamode.ts")) assert.match(code, /const select = fetched\.map/);
    }
  });

  test("AC-16 — `coords` bị chặn khỏi bảng phẳng, và chỉ GeoJSON mới hỏi tới nó", () => {
    assert.deepEqual(tableMeta("roads").geometryColumns, ["coords"]);
    for (const t of DATA_TABLES) {
      if (t.id === "roads") continue;
      assert.deepEqual(t.geometryColumns, [], `${t.id} khai cột hình học lạ`);
    }
    const exp = SRC.find((s) => s.f.endsWith("export.ts"))!.code;
    assert.match(exp, /format === "geojson"[\s\S]{0,200}coords/, "coords phải chỉ vào qua GeoJSON");
  });

  test("mệnh đề WHERE chỉ dựng từ cột CÓ THẬT, và nháy đơn bị nhân đôi", () => {
    const meta = tableMeta("grid");
    const w = buildWhere(meta, "Ba Đình", ["commune_name", "h3_r8"]);
    assert.match(w, /commune_name/);
    assert.match(w, /h3_r8/);
    // Cột không có trong schema thì rơi khỏi mệnh đề thay vì gây Binder Error.
    assert.equal(buildWhere(meta, "x", ["h3_r8"]).includes("commune_name"), false);
    assert.equal(buildWhere(meta, "", ["commune_name"]), "");
    assert.match(buildWhere(meta, "O'Brien", ["commune_name"]), /O''Brien/);
  });

  test("§5.2 luật 5 — ngưỡng keyset đã khai, và bảng đường bộ vượt nó", () => {
    assert.equal(KEYSET_THRESHOLD_ROWS, 10_000);
    assert.ok(HANOI.files["roads.parquet"]!.rows! > KEYSET_THRESHOLD_ROWS);
    assert.ok(HANOI.files["grid_h3_r8.parquet"]!.rows! < KEYSET_THRESHOLD_ROWS);
  });
});

describe("§4.4 & AC-13 — xuất dữ liệu chở theo xuất xứ", () => {
  test("tên file mang mã tỉnh, tên bảng và NGÀY XUẤT GÓI", () => {
    assert.equal(buildExportFilename("01", "grid", "2026-08-19T17:00:00Z", "csv"), "evcs_01_grid_20260819.csv");
    assert.equal(
      buildExportFilename("56", "stations", "2026-08-20T00:00:00Z", "parquet"),
      "evcs_56_stations_20260820.parquet",
    );
  });

  test("định dạng KHÔNG có chỗ nhúng thì lưu hai file; định dạng có chỗ thì một", () => {
    // Parquet lưu một file vì xuất xứ đi vào KV metadata của chính nó — không phải vì nó
    // được miễn chở xuất xứ.
    assert.equal(fileCountFor("json"), 1);
    assert.equal(fileCountFor("geojson"), 1);
    assert.equal(fileCountFor("parquet"), 1);
    assert.equal(fileCountFor("csv"), 2);
    assert.equal(fileCountFor("arrow"), 2);
    assert.equal(fileCountFor("ndjson"), 2);
  });

  test("Parquet NHÚNG xuất xứ qua KV_METADATA — không im lặng ship trần", () => {
    const exp = fs.readFileSync(path.join(ROOT, "web/src/data/export.ts"), "utf-8");
    assert.match(exp, /FORMAT PARQUET[\s\S]{0,120}KV_METADATA/);
  });

  test("`_meta` khai cả tử số lẫn mẫu số, cả cột hiện lẫn cột ẩn, cả bộ lọc pipeline", () => {
    const exp = fs.readFileSync(path.join(ROOT, "web/src/data/export.ts"), "utf-8");
    for (const k of [
      "exported_rows",
      "total_rows",
      "columns_hidden",
      "pipeline_filters",
      "analysis_filter",
      "filter_applied",
    ]) {
      assert.match(exp, new RegExp(`${k}[?]?:`), `_meta thiếu khoá ${k}`);
    }
  });

  test("`toPlainJson` gỡ BigInt — ba định dạng JSON hỏng trên MỌI bảng nếu không có nó", () => {
    assert.equal(toPlainJson(42n), 42);
    assert.equal(toPlainJson(-7n), -7);
    // Trên 2^53 thì `Number()` mất chính xác, nên đổi sang chuỗi thay vì nói dối lặng lẽ.
    assert.equal(toPlainJson(9007199254740993n), "9007199254740993");
    assert.equal(toPlainJson(null), null);
    assert.equal(toPlainJson(undefined), null);
    assert.deepEqual(toPlainJson([1n, 2n]), [1, 2]);
    // Và kết quả phải thật sự tuần tự hoá được — đó mới là điều đang kiểm.
    assert.doesNotThrow(() =>
      JSON.stringify(toPlainJson({ osm_id: 1234567890n, n: [1n, { k: 2n }] })),
    );
    assert.equal(
      JSON.stringify(toPlainJson({ osm_id: 1234567890n })),
      '{"osm_id":1234567890}',
    );
  });
});

// ── Kế thừa: `nullMeans` đã nghỉ hưu (AC-3) ──────────────────────────────────────────

describe("AC-3 — `nullMeans` không còn gán trạng thái ở bất kỳ đâu", () => {
  test("không trường nào trong FIELD_REGISTRY còn mang `nullMeans`", () => {
    for (const f of FIELDS) {
      assert.equal(
        (f as unknown as { nullMeans?: string }).nullMeans,
        undefined,
        `Trường ${f.id} còn chứa nullMeans`,
      );
    }
  });

  test("`FieldMeta` không còn khai trường đó", () => {
    const src = fs.readFileSync(path.join(ROOT, "web/src/fields.ts"), "utf-8");
    const iface = src.slice(src.indexOf("interface FieldMeta"), src.indexOf("interface FieldMeta") + 2000);
    assert.equal(/^\s*nullMeans\?:/m.test(iface), false);
  });
});
