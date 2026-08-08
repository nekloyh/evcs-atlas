/**
 * Truy vấn riêng của chế độ DỮ LIỆU — DESIGN.md §3f, thi công M4.2.
 *
 * §3f nói rõ chế độ này **không thêm khái niệm dữ liệu nào**: mọi khối đọc từ file đã ship
 * cộng manifest. Vì thế file này ngắn và chỉ có hai việc mà manifest không làm được —
 * *phân trang một bảng* và *tra một cột hạng mục theo trạm*. Không có phép tính nào ở đây;
 * phép tính sống ở `viz/occ.ts` như mọi khi.
 */

import { query, registerParquet } from "./duckdb";
import { GRID, OCCUPANCY } from "./queries";

/** Số dòng mỗi trang của bảng dữ liệu. Đủ để cuộn thấy hình dạng, đủ nhỏ để render tức thì. */
export const PAGE_SIZE = 50;

export interface GridPage {
  columns: string[];
  rows: Record<string, unknown>[];
  /** tổng số dòng SAU bộ lọc — mẫu số của "đang xem 50/4.400" */
  total: number;
}

/**
 * Một trang của bảng lưới, sắp xếp và lọc bằng SQL.
 *
 * Sắp xếp và lọc chạy trong DuckDB chứ không trong JS, và đó không phải chuyện hiệu năng
 * (4.400 dòng thì JS cũng xong): nó là chuyện **null**. `ORDER BY` của DuckDB đặt NULL ở
 * một đầu xác định và `Array.sort` của JS thì đẩy `undefined` xuống cuối bất kể chiều —
 * tức cùng một bảng sắp xuôi và sắp ngược sẽ cho hai tập "dòng đầu" không đối xứng, và
 * người đọc không có cách nào biết.
 *
 * `sort` được kiểm theo **danh sách cột thật** trước khi ghép vào SQL: nó đến từ một cú
 * bấm, nhưng cùng luật với mã H3 trong `fetchCell` — dữ liệu từ UI vẫn là dữ liệu lạ.
 */
export async function fetchGridPage(opts: {
  sort: string | null;
  desc: boolean;
  offset: number;
  filter: string;
}): Promise<GridPage> {
  await registerParquet(GRID);
  const head = await query(`SELECT * FROM read_parquet('${GRID}') LIMIT 0`);
  const columns = head.schema.fields.map((f) => f.name);

  // Lọc theo TÊN XÃ hoặc mã H3 — hai thứ duy nhất người ta gõ vào một ô tìm kiếm ở đây.
  // Escape dấu nháy đơn: tên xã tiếng Việt không có nó, nhưng "không có trong dữ liệu hôm
  // nay" chưa bao giờ là một lớp bảo vệ.
  const f = opts.filter.trim().replace(/'/g, "''");
  const where = f
    ? `WHERE lower(CAST("commune_name" AS VARCHAR)) LIKE lower('%${f}%')
          OR lower(CAST("h3_r8" AS VARCHAR)) LIKE lower('%${f}%')`
    : "";

  const countT = await query(`SELECT count(*) AS n FROM read_parquet('${GRID}') ${where}`);
  const total = Number(countT.get(0)!["n"]);

  const sort = opts.sort && columns.includes(opts.sort) ? opts.sort : null;
  const order = sort ? `ORDER BY "${sort}" ${opts.desc ? "DESC" : "ASC"} NULLS LAST` : "";
  const t = await query(
    `SELECT * FROM read_parquet('${GRID}') ${where} ${order}
     LIMIT ${PAGE_SIZE} OFFSET ${Math.max(0, Math.floor(opts.offset))}`,
  );

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < t.numRows; i++) {
    const r = t.get(i)!;
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = r[c];
    rows.push(out);
  }
  return { columns, rows, total };
}

/**
 * `station_code → shape_class` — nguồn của small multiples (§3f-5).
 *
 * Chỉ hai cột, 703 dòng. Nó được tra theo `station_code` chứ không theo chỉ số mảng vì
 * `fetchOccupancy` sắp trạm theo `station_code` còn bảng này thì DuckDB trả theo thứ tự
 * file — dựa vào hai thứ tự trùng nhau là dựa vào một sự tình cờ.
 */
export async function fetchShapeClasses(): Promise<Map<string, string>> {
  await registerParquet(OCCUPANCY);
  const t = await query(
    `SELECT station_code, shape_class FROM read_parquet('${OCCUPANCY}')`,
  );
  const codes = t.getChild("station_code")!;
  const cls = t.getChild("shape_class")!;
  const out = new Map<string, string>();
  for (let i = 0; i < t.numRows; i++) {
    const c = cls.get(i);
    // Trạm không có nhãn ⇒ KHÔNG vào map. Nó sẽ không thuộc dạng nào, và small multiples
    // đếm nó ra thay vì gán bừa vào `KHONG_XEP_LOAI` — hằng đó là một nhãn THẬT của dữ
    // liệu ("đã xét, không xếp được"), khác hẳn "chưa xét".
    if (c !== null && c !== undefined) out.set(String(codes.get(i)), String(c));
  }
  return out;
}
