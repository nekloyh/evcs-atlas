/**
 * Hợp đồng ô trống — Phase 8 §1, §6.4, và §8 điểm 1/2.
 *
 * Test ở đây kiểm LUẬT, không kiểm dữ liệu hôm nay. Bộ dữ liệu đổi thì test không được im
 * lặng biến mất cùng nó — đó là tinh thần §12 và là lý do một vài phép kiểm dưới đây dựng
 * hàng giả thay vì đọc file.
 *
 * Phần đối chiếu với SCHEMA THẬT (AC-2) thì ngược lại: nó phải đọc chính những file mà app
 * mở, vì một vị từ trỏ vào một cột không tồn tại là một `Binder Error` và một màn hình trắng.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";

import { FIELDS, FIELD_BY_ID, nullStateWarns } from "../src/fields.ts";
import {
  DETOUR_MIN_EUCLID_M,
  NULL_CONTRACTS,
  NULL_STATE_HATCH_DEG,
  NULL_STATE_LEAVES_DENOMINATOR,
  NULL_STATE_WARNS,
  VALIDITY_CONTRACTS,
  checkRowValidity,
  companionColumns,
  resolveRowNullState,
  type NullState,
  type TableId,
} from "../src/data/null-states.ts";
import { compareWithNullsLast } from "../src/data/datamode.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const P01 = path.join(ROOT, "web/public/data/p/01");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));

// ── Hình dạng hợp đồng ────────────────────────────────────────────────────────────────

describe("Phase 8 §1.2 — hình dạng hợp đồng ô trống", () => {
  test("27 hợp đồng, trải đủ 7 bảng của §0.3", () => {
    assert.equal(NULL_CONTRACTS.length, 27);
    const perTable = new Map<string, number>();
    for (const c of NULL_CONTRACTS) perTable.set(c.table, (perTable.get(c.table) ?? 0) + 1);
    // Con số của §0.3, từng bảng một. Một tổng đúng có thể che một bảng thiếu và một bảng dư.
    assert.deepEqual(Object.fromEntries(perTable), {
      grid: 4,
      stations: 9,
      station_occupancy: 8,
      roads: 1,
      commune: 2,
      poi: 2,
      provinces: 1,
    });
  });

  test("không hợp đồng nào trùng khoá (bảng, cột)", () => {
    const keys = NULL_CONTRACTS.map((c) => `${c.table}.${c.column}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("§1.1 — NOT_APPLICABLE phải đứng TRƯỚC FILTERED trong mọi hợp đồng", () => {
    // Thứ tự này KHÔNG phải sở thích: chỉ NOT_APPLICABLE bị trừ khỏi mẫu số, nên đảo hai luật
    // là đổi con số mà thanh đo vẽ ra.
    for (const c of NULL_CONTRACTS) {
      const firstFiltered = c.rules.findIndex((r) => r.state === "FILTERED");
      const lastNotApp = c.rules.map((r) => r.state).lastIndexOf("NOT_APPLICABLE");
      if (firstFiltered >= 0 && lastNotApp >= 0) {
        assert.ok(
          lastNotApp < firstFiltered,
          `${c.table}.${c.column}: FILTERED đứng trước NOT_APPLICABLE`,
        );
      }
    }
  });

  test("§1.1 Rule 0 — mọi luật khai `basis`, và `table_invariant` phải mang `verifiedBy`", () => {
    for (const c of NULL_CONTRACTS) {
      for (const r of c.rules) {
        assert.ok(
          r.basis === "row_predicate" || r.basis === "table_invariant",
          `${c.table}.${c.column}: basis lạ ${r.basis}`,
        );
        if (r.basis === "table_invariant") {
          assert.ok(
            r.verifiedBy && r.verifiedBy.length > 0,
            `${c.table}.${c.column}: tuyên bố mức bảng mà không có khoá đối chiếu`,
          );
          assert.equal(r.test, null, `${c.table}.${c.column}: tuyên bố mức bảng không có vị từ`);
        } else {
          assert.equal(
            typeof r.test,
            "function",
            `${c.table}.${c.column}: vị từ theo hàng phải có hàm kiểm`,
          );
        }
      }
    }
  });

  test("đúng BA luật là tuyên bố mức bảng, và chúng là ba cột KHÔNG có bạn đồng hành", () => {
    // Ghim danh sách: một luật mức bảng thứ tư lặng lẽ mọc lên là cách phân loại này biến
    // thành một cách bào chữa cho mọi khoảng trống (§1.1 Rule 0).
    const declared = NULL_CONTRACTS.filter(
      (c) => c.rules.some((r) => r.basis === "table_invariant") && c.rules[0]!.state !== "MISSING",
    ).map((c) => `${c.table}.${c.column}`);
    assert.deepEqual(declared.sort(), [
      "commune.quality_flag",
      "provinces.quality_flags",
      "roads.dist_station_m",
    ]);
    for (const key of declared) {
      const c = NULL_CONTRACTS.find((x) => `${x.table}.${x.column}` === key)!;
      assert.equal(c.companions.length, 0, `${key}: khai bạn đồng hành mà không dùng`);
    }
  });

  test("mọi luật đọc theo hàng đều khai đủ bạn đồng hành mà vị từ của nó cần", () => {
    // Vị từ đọc `row["x"]` mà `x` không có trong `companions` là một vị từ sẽ đọc `undefined`
    // ở bảng phẳng — chính lỗi mà `companions` sinh ra để chặn.
    for (const c of NULL_CONTRACTS) {
      for (const r of c.rules) {
        if (!r.test) continue;
        for (const m of r.when.matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) {
          const w = m[1]!;
          if (["IN", "IS", "NULL", "AND", "OR", "true", "false"].includes(w)) continue;
          if (!/^[a-z_][a-z0-9_]*$/.test(w)) continue;
          if (w === c.column) continue;
          if (!/_|^util$|^scope$|^name$/.test(w)) continue;
          if (c.companions.includes(w)) continue;
          // Chỉ cảnh báo với danh từ trông như tên cột (có gạch dưới hoặc nằm trong danh sách
          // cột một từ đã biết); câu tiếng Việt trong `when` của luật mức bảng đã bị lọc ở trên.
          assert.ok(
            !/^(n_|dist_|util|scope|ever_|has_|port_|occ_|evidence_)/.test(w),
            `${c.table}.${c.column}: vị từ nhắc \`${w}\` nhưng không khai nó là bạn đồng hành`,
          );
        }
      }
    }
  });
});

// ── AC-2: đối chiếu với SCHEMA THẬT của file đã ship ─────────────────────────────────

describe("AC-2 — mọi `when` chỉ nhắc cột CÓ THẬT trong schema đã ship", () => {
  /**
   * Schema thật, đọc từ chính manifest mà exporter dựng bằng cách soi file vừa ghi
   * (`available_columns`, `available_station_columns`, `available_road_columns`,
   * `available_commune_columns`) và từ chính hai file GeoJSON đã ship. Không danh sách nào
   * gõ tay ở đây — một danh sách gõ tay sẽ nói dối ngay lần đầu một cột đổi tên.
   */
  const m = readJson(path.join(P01, "manifest.json"));
  const poiProps = Object.keys(
    readJson(path.join(P01, "poi.geojson")).features[0].properties as Record<string, unknown>,
  );
  const communeProps: string[] = m.available_commune_columns;
  // `station_occupancy` và `provinces` không có danh sách cột trong manifest, nhưng CÓ trong
  // `null_states` (exporter chỉ phát cột nó thật sự đọc được từ frame) cộng các cột mà luật
  // dùng làm bạn đồng hành — và test dưới kiểm chính hai tập đó khớp nhau.
  const occCols = new Set([
    ...Object.keys(m.null_states.station_occupancy ?? {}),
    "util_reportable",
    "ever_active",
    "occ_status",
    "util",
  ]);

  const SCHEMA: Record<TableId, Set<string>> = {
    grid: new Set(m.available_columns as string[]),
    stations: new Set(m.available_station_columns as string[]),
    roads: new Set(m.available_road_columns as string[]),
    commune: new Set(communeProps),
    poi: new Set(poiProps),
    station_occupancy: occCols,
    provinces: new Set(Object.keys(m.null_states.provinces ?? {})),
  };

  test("cột chủ thể của mọi hợp đồng có mặt trong schema của bảng đó", () => {
    for (const c of NULL_CONTRACTS) {
      assert.ok(
        SCHEMA[c.table].has(c.column),
        `${c.table}.${c.column}: cột không có trong schema đã ship`,
      );
    }
  });

  test("mọi bạn đồng hành có mặt trong schema của bảng đó", () => {
    for (const c of NULL_CONTRACTS) {
      for (const k of c.companions) {
        assert.ok(
          SCHEMA[c.table].has(k),
          `${c.table}.${c.column}: bạn đồng hành \`${k}\` không có trong schema`,
        );
      }
    }
  });

  test("mọi cột mà hợp đồng GIÁ TRỊ ĐÁNG NGỜ nhắc tới đều có thật", () => {
    for (const v of VALIDITY_CONTRACTS) {
      assert.ok(SCHEMA[v.table].has(v.column), `${v.table}.${v.column} không có thật`);
      for (const k of v.companions) {
        assert.ok(SCHEMA[v.table].has(k), `${v.table}.${v.column}: bạn đồng hành ${k} không có thật`);
      }
      // `invalidWhen` phải phân tích được — `checkRowValidity` đọc hằng ra từ chính chuỗi này
      // thay vì chép nó lần thứ hai vào một câu `if`.
      assert.match(v.invalidWhen, /^\w+\s*=\s*'[^']+'$/, `${v.column}: invalidWhen không phân tích được`);
    }
  });

  test("mọi cột có trong `null_states` của manifest đều có một hợp đồng, và ngược lại", () => {
    // Hai chiều. Một chiều thôi thì exporter thêm cột mà TS quên vẫn xanh, hoặc TS khai một
    // cột mà exporter không bao giờ phát vẫn xanh.
    const inManifest = new Set<string>();
    for (const [tbl, cols] of Object.entries(m.null_states as Record<string, object>)) {
      for (const col of Object.keys(cols)) inManifest.add(`${tbl}.${col}`);
    }
    const inTs = new Set(NULL_CONTRACTS.map((c) => `${c.table}.${c.column}`));
    for (const k of inManifest) assert.ok(inTs.has(k), `manifest phát ${k} mà TS không khai`);
    // Chiều ngược lại chỉ áp cho cột thật sự CÓ ô trống ở tỉnh 01 — cột phủ 100 % không xuất
    // hiện trong `null_states` theo đúng luật phát của §3.1.
    const cov = m.coverage as Record<string, { cell_share: number }>;
    for (const c of NULL_CONTRACTS) {
      if (c.table !== "grid") continue;
      if (cov[c.column] && cov[c.column]!.cell_share < 1) {
        assert.ok(inManifest.has(`grid.${c.column}`), `TS khai grid.${c.column} mà manifest không phát`);
      }
    }
  });
});

// ── Phân giải theo hàng ───────────────────────────────────────────────────────────────

describe("Phase 8 §1.1 — phân giải trạng thái theo hàng", () => {
  test("grid: bốn cột nullable phân giải đúng trạng thái", () => {
    assert.equal(
      resolveRowNullState("grid", "dist_station_network_m", {
        evidence_grade_distance: "UNREACHABLE_NO_PATH",
      }).state,
      "NOT_APPLICABLE",
    );
    assert.equal(
      resolveRowNullState("grid", "dist_station_network_m", {
        evidence_grade_distance: "OSM_NETWORK",
      }).state,
      "MISSING",
    );
    assert.equal(
      resolveRowNullState("grid", "util_cell", { n_stations: 0, n_stations_measured: 0 }).state,
      "NOT_APPLICABLE",
    );
    assert.equal(
      resolveRowNullState("grid", "util_cell", { n_stations: 2, n_stations_measured: 0 }).state,
      "NOT_MEASURED",
    );
  });

  test("§1.1 — ô KHÔNG TỚI ĐƯỢC mà chim bay ngắn vẫn là NOT_APPLICABLE, không phải FILTERED", () => {
    // Thứ tự quyết định, kiểm bằng một hàng thoả CẢ HAI vị từ. Đảo thứ tự là đẩy hàng này vào
    // mẫu số thay vì trừ nó ra.
    const both = {
      dist_station_euclid_m: 50,
      evidence_grade_distance: "UNREACHABLE_NO_ROAD_ACCESS",
    };
    assert.equal(resolveRowNullState("grid", "detour_ratio", both).state, "NOT_APPLICABLE");
    assert.equal(
      resolveRowNullState("grid", "detour_ratio", {
        dist_station_euclid_m: 150,
        evidence_grade_distance: "OSM_NETWORK",
      }).state,
      "FILTERED",
    );
    assert.equal(
      resolveRowNullState("grid", "detour_ratio", {
        dist_station_euclid_m: DETOUR_MIN_EUCLID_M,
        evidence_grade_distance: "OSM_NETWORK",
      }).state,
      "MISSING",
    );
  });

  test("chim bay TRỐNG không được đọc thành 0 rồi dán nhãn ĐÃ LỌC", () => {
    // `?? 0` ở bản trước biến mọi ô thiếu chim bay thành `0 < 200` ⇒ FILTERED.
    const r = resolveRowNullState("grid", "detour_ratio", {
      dist_station_euclid_m: null,
      evidence_grade_distance: "OSM_NETWORK",
    });
    assert.equal(r.state, "MISSING");
    assert.equal(r.residual, true);
  });

  test("stations & occupancy phân giải đúng", () => {
    assert.equal(
      resolveRowNullState("stations", "commune_name", { scope: "BUFFER" }).state,
      "NOT_APPLICABLE",
    );
    assert.equal(
      resolveRowNullState("stations", "commune_name", { scope: "IN" }).state,
      "MISSING",
    );
    assert.equal(
      resolveRowNullState("stations", "n_guns_imputed", { port_config_source: "OFFICIAL" }).state,
      "NOT_APPLICABLE",
    );
    assert.equal(
      resolveRowNullState("station_occupancy", "util", { util_reportable: false }).state,
      "NOT_MEASURED",
    );
    assert.equal(
      resolveRowNullState("station_occupancy", "util_pctl", { util: null, occ_status: "OK" }).state,
      "NOT_APPLICABLE",
    );
    assert.equal(
      resolveRowNullState("station_occupancy", "util_pctl", {
        util: 0.45,
        occ_status: "THIEU_COVERAGE",
      }).state,
      "FILTERED",
    );
  });

  test("commune.util_mean_port_weighted tách hai nhánh theo `n_stations`", () => {
    assert.equal(
      resolveRowNullState("commune", "util_mean_port_weighted", { n_stations: 0 }).state,
      "NOT_APPLICABLE",
    );
    assert.equal(
      resolveRowNullState("commune", "util_mean_port_weighted", { n_stations: 3 }).state,
      "NOT_MEASURED",
    );
  });

  test("§1.1 Rule 0 — THIẾU cột bạn đồng hành thì TỪ CHỐI phân giải, không đoán", () => {
    // Đây là lỗi 8-QA-008: bảng phẳng giấu `n_stations` đi thì mọi ô trống `util_cell` đọc
    // thành "ô không có trạm" — một trạng thái suy ra từ dữ liệu VẮNG MẶT.
    const r = resolveRowNullState("grid", "util_cell", {});
    assert.equal(r.basis, "unresolved");
    assert.match(r.label, /chưa phân giải/);
    assert.ok(r.explain.includes("n_stations"));
    assert.notEqual(r.label, "ô không có trạm sạc");

    const s = resolveRowNullState("stations", "commune_code", {});
    assert.equal(s.basis, "unresolved");
    assert.notEqual(s.state, "NOT_APPLICABLE");
  });

  test("hàng không luật nào giải thích ⇒ MISSING và ĐÁNH DẤU là khuyết tật", () => {
    const r = resolveRowNullState("station_occupancy", "weekend_ratio", { ever_active: true });
    assert.equal(r.state, "MISSING");
    assert.equal(r.residual, true);
  });
});

// ── Ngữ nghĩa trạng thái ──────────────────────────────────────────────────────────────

describe("Phase 8 §0.2 & §6.4 — ngữ nghĩa và mã hoá thị giác của bốn trạng thái", () => {
  const STATES: NullState[] = ["MISSING", "NOT_APPLICABLE", "NOT_MEASURED", "FILTERED"];

  test("đúng MỘT trạng thái rời khỏi mẫu số", () => {
    const leaving = STATES.filter((s) => NULL_STATE_LEAVES_DENOMINATOR[s]);
    assert.deepEqual(leaving, ["NOT_APPLICABLE"]);
  });

  test("chỉ MISSING và NOT_MEASURED đeo ⚠ — hai trạng thái nghĩa là *ta không biết*", () => {
    assert.deepEqual(STATES.filter((s) => NULL_STATE_WARNS[s]).sort(), [
      "MISSING",
      "NOT_MEASURED",
    ]);
  });

  test("§6.4 — bốn góc vân phân biệt được, cách nhau ít nhất 45°", () => {
    assert.deepEqual(NULL_STATE_HATCH_DEG, {
      FILTERED: 0,
      MISSING: 45,
      NOT_APPLICABLE: 90,
      NOT_MEASURED: 135,
    });
    const angles = STATES.map((s) => NULL_STATE_HATCH_DEG[s]).sort((a, b) => a - b);
    assert.equal(new Set(angles).size, 4);
    for (let i = 1; i < angles.length; i++) {
      assert.ok(angles[i]! - angles[i - 1]! >= 45, "hai góc vân gần nhau dưới 45°");
    }
    // Không góc nào là 180° — 180° và 0° vẽ ra CÙNG một mặt vân.
    for (const a of angles) assert.ok(a < 180, `góc ${a}° trùng mặt với ${a - 180}°`);
  });
});

// ── Hợp đồng giá trị đáng ngờ ─────────────────────────────────────────────────────────

describe("Phase 8 §1.3 & §1.4 — giá trị CÓ MẶT mang nhãn", () => {
  test("ba hợp đồng, và `ZERO_NO_WEIGHT` KHÔNG được đếm là INVALID", () => {
    assert.equal(VALIDITY_CONTRACTS.length, 3);
    const zero = VALIDITY_CONTRACTS.find((v) => v.invalidWhen.includes("ZERO_NO_WEIGHT"))!;
    assert.equal(zero.isInvalid, false);
    assert.equal(VALIDITY_CONTRACTS.filter((v) => v.isInvalid).length, 2);
  });

  test("dân số công bố không hợp lý là INVALID; ZERO_NO_WEIGHT có nhãn nhưng không INVALID", () => {
    const bad = checkRowValidity("grid", "population", {
      pop_source: "WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE",
    });
    assert.equal(bad.isInvalid, true);
    assert.equal(bad.isLabelled, true);

    const zero = checkRowValidity("grid", "population", { pop_source: "ZERO_NO_WEIGHT" });
    assert.equal(zero.isInvalid, false);
    assert.equal(zero.isLabelled, true, "ZERO_NO_WEIGHT phải HIỆN RA, chỉ là không đỏ");

    assert.equal(
      checkRowValidity("grid", "population", { pop_source: "WORLDPOP2025_ANCHORED_VNSDI" })
        .isLabelled,
      false,
    );
    assert.equal(
      checkRowValidity("commune", "population", { quality_flag: "DANSO_CONG_BO_QUA_THAP" })
        .isInvalid,
      true,
    );
  });

  test("AC-20 — từ vựng lạ KHÔNG làm gì vỡ và KHÔNG bị gán nhãn bừa", () => {
    // `VNSDI_AREAL_FALLBACK` tồn tại ở cấp toàn quốc nhưng không có ở Hà Nội.
    const r = checkRowValidity("grid", "population", { pop_source: "VNSDI_AREAL_FALLBACK" });
    assert.equal(r.isInvalid, false);
    assert.equal(r.isLabelled, false);
  });

  test("thiếu cột bạn đồng hành ⇒ không kết luận gì", () => {
    assert.equal(checkRowValidity("grid", "population", {}).isLabelled, false);
  });
});

// ── Bạn đồng hành ─────────────────────────────────────────────────────────────────────

describe("companionColumns — thứ giữ Rule 0 có hiệu lực ở tầng UI", () => {
  test("mỗi bảng trả đúng hợp các cột mà luật của nó cần", () => {
    assert.deepEqual(companionColumns("grid" as TableId).sort(), [
      "dist_station_euclid_m",
      "evidence_grade_distance",
      "n_stations",
      "n_stations_measured",
      "pop_source",
    ]);
    assert.deepEqual(companionColumns("stations" as TableId).sort(), [
      "has_timeseries",
      "port_config_source",
      "scope",
    ]);
    assert.deepEqual(companionColumns("roads" as TableId), []);
  });
});

// ── §5.1 — ô trống ở CUỐI theo cả hai chiều ──────────────────────────────────────────

describe("Phase 8 §5.1 — sắp xếp trong JS phải khớp NULLS LAST của DuckDB", () => {
  test("ô trống ở CUỐI theo cả chiều xuôi lẫn chiều ngược", () => {
    // Lý do sắp xếp sống trong SQL là NULL, không phải tốc độ. Hai bảng GeoJSON buộc phải sắp
    // trong JS, nên phép so của chúng phải sao lại đúng ngữ nghĩa ấy — nếu không thì hai bảng
    // trong cùng một màn hình trả lời "dòng đầu là gì" theo hai luật khác nhau.
    const vals = [3, null, 1, undefined, 2];
    const asc = [...vals].sort((a, b) => compareWithNullsLast(a, b, false));
    const dsc = [...vals].sort((a, b) => compareWithNullsLast(a, b, true));
    assert.deepEqual(asc.slice(0, 3), [1, 2, 3]);
    assert.deepEqual(dsc.slice(0, 3), [3, 2, 1]);
    for (const arr of [asc, dsc]) {
      assert.ok(arr[3] === null || arr[3] === undefined);
      assert.ok(arr[4] === null || arr[4] === undefined);
    }
  });

  test("chuỗi so theo tiếng Việt, và ô trống vẫn ở cuối", () => {
    const vals = ["Đà Nẵng", null, "An Giang", "Bắc Ninh"];
    const asc = [...vals].sort((a, b) => compareWithNullsLast(a, b, false));
    assert.equal(asc[0], "An Giang");
    assert.equal(asc[3], null);
    const dsc = [...vals].sort((a, b) => compareWithNullsLast(a, b, true));
    assert.equal(dsc[0], "Đà Nẵng");
    assert.equal(dsc[3], null);
  });
});

// ── §1.2 — `nullSplit` là HÌNH CHIẾU của `NullContract`, không phải hệ thứ hai ────────

describe("Phase 8 §1.2 — hai hệ mô tả ô trống phải nói CÙNG một điều", () => {
  const m = readJson(path.join(P01, "manifest.json"));

  test("mọi `nullSplit` trỏ tới một hợp đồng CÓ THẬT, và trạng thái của nó khớp hợp đồng", () => {
    const splits = FIELDS.filter((f) => f.nullSplit);
    assert.ok(splits.length > 0, "không còn trường nào khai nullSplit — cập nhật test này");
    for (const f of splits) {
      const sp = f.nullSplit!;
      const [table, column] = sp.projects.split(".") as [TableId, string];
      const contract = NULL_CONTRACTS.find((c) => c.table === table && c.column === column);
      assert.ok(contract, `${f.id}: chiếu tới ${sp.projects} mà không có hợp đồng nào`);
      const states = new Set(contract!.rules.map((r) => r.state));
      // Hai nhánh của phép chiếu phải là hai trạng thái mà hợp đồng thật sự phát ra.
      for (const b of [sp.whenTrue, sp.whenFalse]) {
        assert.ok(
          states.has(b.state),
          `${f.id}: nhánh khai ${b.state} nhưng hợp đồng ${sp.projects} không có trạng thái đó`,
        );
      }
      assert.notEqual(sp.whenTrue.state, sp.whenFalse.state, `${f.id}: hai nhánh cùng trạng thái`);
    }
  });

  test("`detour_ratio`: hai nhánh khớp ĐÚNG hai xô của manifest, đúng chiều", () => {
    // Đây là phép kiểm mà bản trước không có, và bản trước SAI ở đúng chỗ này: nó trừ nhóm
    // `network_reachable = true` (87 ô sát trạm) khỏi mẫu số và gắn ⚠ cho nhóm `false` (3 ô
    // không tới được) — đảo NGƯỢC cả hai so với §0.2. Hệ quả là rail đọc 99,9 % trong khi
    // khối KHOẢNG TRỐNG đọc 98,0 % cho cùng một cột.
    const sp = FIELD_BY_ID.get("detour_ratio")!.nullSplit!;
    const d = m.null_states.grid.detour_ratio;

    // `network_reachable = true` ∧ trống ⇒ chim bay < 200 m ⇒ LUẬT CỦA TA gỡ ⇒ FILTERED.
    assert.equal(sp.whenTrue.state, "FILTERED");
    assert.equal(sp.whenFalse.state, "NOT_APPLICABLE");
    assert.equal(d.states["FILTERED"].n, 87);
    assert.equal(d.states["NOT_APPLICABLE"].n, 3);

    // Và hệ quả về mẫu số: CHỈ nhóm NOT_APPLICABLE rời ra.
    assert.equal(NULL_STATE_LEAVES_DENOMINATOR[sp.whenFalse.state], true);
    assert.equal(NULL_STATE_LEAVES_DENOMINATOR[sp.whenTrue.state], false);
    assert.equal(d.n_applicable, d.n_rows - 3);
    assert.notEqual(d.n_applicable, d.n_rows - 87, "trừ nhầm nhánh — lỗi cũ đã quay lại");

    // Không nhánh nào đeo ⚠, nên cột này không được có badge nào.
    assert.equal(NULL_STATE_WARNS[sp.whenTrue.state], false);
    assert.equal(NULL_STATE_WARNS[sp.whenFalse.state], false);
    assert.equal(nullStateWarns(m as never, "grid", "detour_ratio"), false);
  });

  test("`nullStateWarns` đọc từ số đếm đã ship, không từ một chuỗi gõ tay (AC-3)", () => {
    // Cột mà mọi ô trống là "biết là không" ⇒ không ⚠.
    assert.equal(nullStateWarns(m as never, "stations", "n_guns_imputed"), false);
    assert.equal(nullStateWarns(m as never, "commune", "quality_flag"), false);
    // Cột mà nguồn không khai ⇒ vẫn là "không biết" ⇒ CÓ ⚠.
    assert.equal(nullStateWarns(m as never, "stations", "n_ports"), true);
    assert.equal(nullStateWarns(m as never, "poi", "levels"), true);
    // Cột phủ 100 % không có mặt trong `null_states`; trả `undefined` để chỗ gọi giữ hành vi cũ.
    assert.equal(nullStateWarns(m as never, "grid", "population"), undefined);
  });

  test("§6.4 — góc vân của bản đồ và của chú giải lấy từ CÙNG một bảng", () => {
    const mapView = fs.readFileSync(path.join(ROOT, "web/src/map/MapView.tsx"), "utf-8");
    const legend = fs.readFileSync(path.join(ROOT, "web/src/ui/Legend.tsx"), "utf-8");
    for (const src of [mapView, legend]) {
      assert.match(src, /NULL_STATE_HATCH_DEG/, "góc vân bị gõ lại thay vì đọc từ bảng");
    }
    // Và không nơi nào còn gõ cứng một góc null.
    assert.equal(/new HatchExtension\(\{ angle: (0|45|90) \}\)/.test(mapView), false);
  });
});
