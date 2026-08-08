/**
 * Cổng chặn CẤU TRÚC cho chiều tỉnh: không được có đường dẫn dữ liệu trần trong mã.
 *
 * Bối cảnh: `AUDIT_TOAN_QUOC.md §E` đã bắt đúng lỗi này một lần ở `duckdb.ts` — khoá đăng ký
 * là tên file trần, nên đổi tỉnh xong `registerParquet("grid_h3_r8.parquet")` thấy tên đã
 * đăng ký và **im lặng dùng lại file của tỉnh trước**. Bản đồ đổi tiêu đề mà không đổi số.
 *
 * Lỗi ấy đã sửa, nhưng ba đường dẫn trần vẫn sống sót ở `fields.ts` (`:663`, `:673-674`,
 * `:815`) và chúng chỉ chưa nổ vì MAY: trường mang chúng là trường dẫn xuất, nên
 * `fieldAvailable()` lọc nó ra trước khi SQL chạy. Một manifest tỉnh liệt kê
 * `util_pctl_cell`, hoặc một tỉnh không có `available_columns`, là bản đồ vẽ dữ liệu Hà Nội
 * dưới tiêu đề tỉnh khác.
 *
 * Test này đọc CHÍNH MÃ NGUỒN thay vì gọi hàm, vì thứ cần chặn là "ai đó gõ một chuỗi", chứ
 * không phải "một hàm trả về sai". Cùng kiểu với phép kiểm không-gõ-tay-phần-trăm ở
 * `fields.test.ts`.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = new URL("../src", import.meta.url).pathname;

/** `province.ts` được phép: nó là nơi ĐỊNH NGHĨA `dataPath`. */
const MIEN_TRU_FILE = new Set(["data/province.ts"]);

/**
 * Đường dẫn cố ý KHÔNG mang tiền tố tỉnh.
 *
 * Cây `vn/` là lớp gộp TOÀN QUỐC — nó không thuộc tỉnh nào, nên cho nó đi qua `dataPath()`
 * sẽ là sai chứ không phải đúng. `provinces.geojson` là chỉ mục 34 tỉnh, cùng lý do.
 */
function laToanQuoc(p: string): boolean {
  return p.startsWith("vn/") || p.endsWith("provinces.geojson");
}

function moiFileNguon(dir: string, tien_to = ""): string[] {
  const out: string[] = [];
  for (const ten of readdirSync(dir)) {
    const p = join(dir, ten);
    const rel = tien_to ? `${tien_to}/${ten}` : ten;
    if (statSync(p).isDirectory()) out.push(...moiFileNguon(p, rel));
    else if (/\.(ts|tsx)$/.test(ten)) out.push(rel);
  }
  return out;
}

const FILES = moiFileNguon(SRC).filter((f) => !MIEN_TRU_FILE.has(f));

/** Bỏ comment khối và comment dòng — docstring nhắc tên file là chuyện bình thường. */
function boComment(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function viPham(duoi: string): string[] {
  const re = new RegExp(`(["'])([A-Za-z0-9_./-]+\\.${duoi})\\1`, "g");
  const pham: string[] = [];
  for (const f of FILES) {
    const src = boComment(readFileSync(join(SRC, f), "utf8"));
    for (const m of src.matchAll(re)) {
      const ten = m[2] ?? "";
      if (laToanQuoc(ten)) continue;
      const truoc = src.slice(Math.max(0, m.index! - 9), m.index!);
      if (truoc.endsWith("dataPath(")) continue;
      // `manifest.files["commune.geojson"]` và `"x.geojson" in m.files` là tra KHOÁ trên
      // một bảng, không phải đường dẫn để fetch.
      if (truoc.endsWith("[")) continue;
      const sau = src.slice(m.index! + m[0].length, m.index! + m[0].length + 4);
      if (sau.startsWith(" in ")) continue;
      pham.push(`${f}: ${ten}`);
    }
  }
  return pham;
}

test("mọi đường dẫn .parquet đều đi qua dataPath()", () => {
  const pham = viPham("parquet");
  assert.deepEqual(pham, [], `parquet không đi qua dataPath():\n  ${pham.join("\n  ")}`);
});

test("mọi đường dẫn .geojson đều đi qua dataPath()", () => {
  const pham = viPham("geojson");
  assert.deepEqual(pham, [], `geojson không đi qua dataPath():\n  ${pham.join("\n  ")}`);
});

test("read_parquet chỉ nhận biến nội suy, không nhận tên file cứng", () => {
  const pham: string[] = [];
  for (const f of FILES) {
    const src = boComment(readFileSync(join(SRC, f), "utf8"));
    for (const m of src.matchAll(/read_parquet\(\s*(["'])([^"'`]*)\1/g)) {
      // `read_parquet('${GRID}')` là đúng — hằng đã qua `dataPath`. Chỉ chặn chuỗi cứng.
      const arg = m[2] ?? "";
      if (arg.includes("${")) continue;
      pham.push(`${f}: read_parquet('${arg}')`);
    }
  }
  assert.deepEqual(pham, [], `read_parquet nhận tên file cứng:\n  ${pham.join("\n  ")}`);
});
