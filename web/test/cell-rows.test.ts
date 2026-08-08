/**
 * Test cho quy tắc "dòng nào được hiện trong panel Ô" — DESIGN.md ràng buộc 1 + ràng buộc 5.
 *
 * Vì sao có file này, rất cụ thể: chỗ này **đã sai một lần**. Panel duyệt toàn bộ `FIELDS`
 * rồi đọc `row[f.id]`, nên 8 trường XÃ + 2 trường phái sinh rơi vào `undefined` và in ra
 * "không đo được" — mười dòng nói "không biết" về những giá trị biết rõ. Ảnh chụp đã bắt
 * được nó, nhưng ảnh chụp chỉ chứng minh MỘT ô; quy tắc thì cần assert (§12).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { panelRows } from "../src/ui/cell-rows.ts";
import { FIELDS, FIELD_BY_ID, COMMUNE_PREFIX, type FieldMeta } from "../src/fields.ts";
import type { CellRow } from "../src/data/queries.ts";
import {
  cellIdOf,
  communeCodeOf,
  parseSelection,
  serializeSelection,
} from "../src/data/h3.ts";

/** Hàng như `fetchCell` trả về: mọi cột của ô + biểu thức của trường phái sinh. */
function fullRow(over: Partial<CellRow> = {}): CellRow {
  const row: CellRow = { h3_r8: "88415cb4e9fffff", commune_code: "00004", commune_name: "Phường X" };
  for (const f of FIELDS) if (f.readAs === "cell") row[f.column] = 1;
  return { ...row, ...over };
}

// ── Bất biến trung tâm ─────────────────────────────────────────────────────────

test("KHÔNG dòng nào mang `undefined` — đó là điều kiện để không có lời nói dối nào", () => {
  for (const r of panelRows(FIELDS, fullRow())) {
    assert.notEqual(r.value, undefined, `${r.field.id} lọt undefined`);
  }
});

test("hàng thiếu cột nào thì dòng đó BIẾN MẤT, không thành “không đo được”", () => {
  const row = fullRow();
  delete row["util_cell"];
  const ids = panelRows(FIELDS, row).map((r) => r.field.id);
  assert.ok(!ids.includes("util_cell"));
  // nhưng các dòng khác không bị kéo theo
  assert.ok(ids.includes("population"));
});

test("cột CÓ MẶT mà mang null thì VẪN hiện — đó là “không đo được” đúng nghĩa", () => {
  const rows = panelRows(FIELDS, fullRow({ util_cell: null }));
  const r = rows.find((x) => x.field.id === "util_cell");
  assert.ok(r, "dòng phải còn");
  assert.equal(r!.value, null);
});

// ── §6b: trường của XÃ không thuộc panel Ô ─────────────────────────────────────

test("mọi trường của XÃ bị loại khỏi panel Ô", () => {
  const rows = panelRows(FIELDS, fullRow());
  assert.equal(rows.filter((r) => r.field.readAs === "commune").length, 0);
  assert.equal(rows.filter((r) => r.field.id.startsWith(COMMUNE_PREFIX)).length, 0);
});

test("trường XÃ bị loại KỂ CẢ khi tên cột của nó trùng một cột thật của ô", () => {
  // `commune:population` có `column === "population"`, mà `population` LÀ cột của ô.
  // Lọc theo `column in row` một mình sẽ cho nó lọt và hiện dân số của Ô dưới nhãn
  // "Dân số xã" — nên phép lọc phải xét `readAs` TRƯỚC.
  const commune = FIELD_BY_ID.get(`${COMMUNE_PREFIX}population`)!;
  assert.equal(commune.column, "population");
  assert.equal(panelRows([commune], fullRow()).length, 0);
});

// ── §13c-1: trường phái sinh phải CÓ MẶT, vì chúng tính được ───────────────────

test("trường phái sinh có mặt khi hàng mang giá trị đã tính sẵn", () => {
  const ids = panelRows(FIELDS, fullRow()).map((r) => r.field.id);
  for (const id of ["pop_beyond_2km", "util_pctl_cell"]) {
    assert.ok(ids.includes(id), `${id} phải có trong panel — nó tính được`);
  }
});

test("mọi trường của Ô đều có mặt khi hàng đầy đủ — không sót trường nào", () => {
  const expected = FIELDS.filter((f) => f.readAs === "cell").map((f) => f.id);
  const got = panelRows(FIELDS, fullRow()).map((r) => r.field.id);
  assert.deepEqual(got, expected);
});

// ── Giữ nguyên thứ tự khai báo ─────────────────────────────────────────────────

test("thứ tự dòng theo thứ tự truyền vào, không bị xáo", () => {
  const three = FIELDS.filter((f) => f.readAs === "cell").slice(0, 3);
  assert.deepEqual(
    panelRows(three, fullRow()).map((r) => r.field.id),
    three.map((f) => f.id),
  );
});

test("hàng rỗng cho ra không dòng nào, không nổ", () => {
  assert.deepEqual(panelRows(FIELDS, {}), []);
});

test("nhóm không còn dòng nào thì trả mảng rỗng — panel dựa vào đó để bỏ tiêu đề", () => {
  const communeOnly: FieldMeta[] = FIELDS.filter((f) => f.readAs === "commune");
  assert.deepEqual(panelRows(communeOnly, fullRow()), []);
});

// ── Nhận dạng lựa chọn — hai loại, một khoá (M2.1-A) ───────────────────────────

test("parseSelection phân biệt ô với xã, và từ chối thứ không phải cả hai", () => {
  assert.deepEqual(parseSelection("88415cb637fffff"), { kind: "cell", id: "88415cb637fffff" });
  assert.deepEqual(parseSelection("commune:00004"), { kind: "commune", code: "00004" });
  for (const bad of [null, "", "xyz", "commune:1", "88415CB637FFFFF"]) {
    assert.equal(parseSelection(bad), null, String(bad));
  }
});

test("serializeSelection là nghịch đảo đúng của parseSelection", () => {
  for (const raw of ["88415cb637fffff", "commune:00004"]) {
    assert.equal(serializeSelection(parseSelection(raw)!), raw);
  }
});

test("cellIdOf / communeCodeOf loại trừ nhau — không bao giờ cùng khác null", () => {
  for (const raw of ["88415cb637fffff", "commune:00004", "hỏng", null]) {
    const a = cellIdOf(raw);
    const b = communeCodeOf(raw);
    assert.ok(a === null || b === null, `${raw}: chọn cả hai cùng lúc là trạng thái sai`);
  }
});
