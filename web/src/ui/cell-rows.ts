/**
 * Dòng nào được hiện trong panel Ô — DESIGN.md §3c, ràng buộc 1, ràng buộc 5.
 *
 * Tách thành hàm THUẦN vì đây chính là chỗ vừa sai: panel duyệt **toàn bộ** `FIELDS` rồi
 * đọc `row[f.id]`, nên 8 trường XÃ và 2 trường phái sinh — không phải cột của bảng ô —
 * đều rơi vào nhánh `undefined` và in ra **"không đo được"**. Mười dòng nói "không biết"
 * về những giá trị biết rõ.
 *
 * Nguyên tắc, ngắn gọn:
 *
 * > **Không bao giờ in "không đo được" cho một giá trị biết được.**
 * > Hoặc tính ra, hoặc đừng dựng dòng đó.
 *
 * Ba loại, ba cách xử:
 *
 * | loại | có trong hàng không | xử |
 * |---|---|---|
 * | cột thô của bảng ô | có | hiện; `null` ở đây là "không đo được" **thật** |
 * | trường phái sinh (`expr`) | có — `fetchCell` chọn kèm biểu thức | hiện |
 * | trường của XÃ | không | **bỏ hẳn** — sai đơn vị đọc, hỏi nhầm bảng |
 *
 * Vì sao trường XÃ bị bỏ chứ không tra theo `commune_code`: chúng là số của **xã**, không
 * của **ô**. Đặt "dân số xã 65.023" giữa danh sách toàn số của ô là mời người đọc so hai
 * đại lượng khác mẫu số — đúng cái §6b tách chúng bằng công tắc để tránh. Muốn xem số của
 * xã thì bấm vào xã (panel XÃ, M2.1-A).
 */

import type { FieldMeta } from "../fields";
import type { CellRow } from "../data/queries";
import type { CellValue } from "../viz/palette";

export interface PanelRow {
  field: FieldMeta;
  /** `null` = không đo được THẬT. Không bao giờ `undefined` — dòng đó đã bị loại. */
  value: CellValue;
}

/**
 * Lọc + gắn giá trị. Bất biến: **không `PanelRow` nào có `value === undefined`**.
 *
 * Kiểm bằng `f.column in row` chứ không bằng `row[f.column] !== undefined`: một cột tồn
 * tại và mang `null` phải được HIỆN (đó là "không đo được" đúng nghĩa), còn một cột không
 * tồn tại thì phải BIẾN MẤT. Hai thứ đó chỉ phân biệt được bằng `in`.
 */
export function panelRows(fields: FieldMeta[], row: CellRow): PanelRow[] {
  const out: PanelRow[] = [];
  for (const f of fields) {
    if (f.readAs !== "cell") continue;
    if (!(f.column in row)) continue;
    out.push({ field: f, value: row[f.column] ?? null });
  }
  return out;
}
