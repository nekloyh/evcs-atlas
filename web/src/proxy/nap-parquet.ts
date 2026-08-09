/**
 * Đọc một file PARQUET người dùng thả vào — bằng DuckDB-WASM đã có sẵn trong bundle.
 *
 * ── VÌ SAO DUCKDB, KHI CẢ CHẾ ĐỘ PROXY ĐƯỢC DỰNG ĐỂ TRÁNH NÓ ─────────────────────────
 *
 * `data.ts` nói rõ chế độ này KHÔNG đi qua DuckDB, và điều đó vẫn đúng: lý do ở đó là
 * **đường ĐỌC** — một `SELECT` phải khai tên cột, mà tập ở đây đổi cột mỗi lần chạy lại
 * notebook. Ở đây DuckDB không đóng vai engine truy vấn; nó đóng vai **bộ giải mã
 * parquet**, đúng một câu `SELECT *`, một lần, rồi trả về mảng JS và biến mất. Không cột
 * nào bị khai tên, không truy vấn nào chạy về sau.
 *
 * Đổi lại là không phải thêm dependency: một parquet reader thuần JS là ~300 KB nữa cho
 * một việc mà thứ đã nằm trong bundle làm được. Và nó nạp ĐỘNG — người chỉ thả GeoJSON
 * không phải tải WASM.
 *
 * ── FILE VÀO RAM, KHÔNG LÊN MẠNG ─────────────────────────────────────────────────────
 *
 * `registerFileBuffer` (không phải `registerFileURL` như `data/duckdb.ts` dùng cho file
 * trong `public/`): byte đi thẳng từ `File` của trình duyệt vào worker. Không request nào
 * rời máy, và `dropFile` ở `finally` trả lại RAM ngay khi đọc xong — giữ nguyên một buffer
 * 200 MB trong worker suốt phiên là cách chắc chắn nhất để tab chết ở tập thứ ba.
 */

import { gom, tuHang, type KetQuaNap } from "./nap";

/** Tên file trong VFS của DuckDB. Chỉ sống trong đúng một lời gọi, nên chỉ cần không trùng. */
let dem = 0;

export async function docParquet(file: File): Promise<KetQuaNap> {
  const { getDb } = await import("../data/duckdb");
  const db = await getDb();
  const ten = `nap-${++dem}.parquet`;
  await db.registerFileBuffer(ten, new Uint8Array(await file.arrayBuffer()));
  const conn = await db.connect();
  let hang: Record<string, unknown>[];
  try {
    // `parquet_scan` với tham số hoá được: tên file do CHÍNH module này đặt (`nap-N.parquet`),
    // không phải tên người dùng — không có đường nào để một dấu nháy trong tên file đi vào
    // câu SQL này.
    const tbl = await conn.query(`SELECT * FROM parquet_scan('${ten}')`);
    hang = tbl.toArray().map((r) => r.toJSON() as Record<string, unknown>);
  } catch (e) {
    throw new Error(
      `Không đọc được ${file.name} như một file Parquet` +
        `${e instanceof Error && e.message ? ` — ${e.message.split("\n")[0]}` : ""}`,
    );
  } finally {
    await conn.close();
    await db.dropFile(ten);
  }
  if (!hang.length) throw new Error(`${file.name} hợp lệ nhưng KHÔNG có dòng nào.`);
  return gom(hang.map(tuHang), hang.length);
}
