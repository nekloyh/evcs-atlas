/**
 * Tư cách của một trạm: **trong phạm vi đang xem** hay chỉ ở **vành đệm 5 km**.
 *
 * ── Vì sao một file riêng cho một hàm ba dòng ─────────────────────────────────────────
 *
 * Cùng lý do đã tách `h3.ts` ra khỏi `queries.ts`, và lý do đó là một ràng buộc thật chứ
 * không phải sở thích: `queries.ts` kéo theo `duckdb.ts`, mà file đó `import` các
 * `.wasm?url` của Vite — thứ `node --test` **không giải được**. Logic thuần nằm trong
 * `queries.ts` vì thế là logic **không test được**, và §12 nói logic thuần thì phải có test.
 *
 * Đây đúng là loại logic phải có test: nó là một **quy tắc** trên một hằng số của dữ liệu,
 * và nó vừa sai một lần theo kiểu tệ nhất — sai mà không nổ.
 *
 * ── Mốc neo vào `BUFFER`, không neo vào tên phạm vi ───────────────────────────────────
 *
 * Điều kiện cũ là `scope === "HANOI"`. Bộ Hà Nội ghi `HANOI`, còn store toàn quốc ghi
 * `IN` — nên ở **mọi tỉnh**, mọi trạm rơi vào nhánh "vành đệm": cả 30 chấm của Cao Bằng vẽ
 * thành chấm RỖNG và panel TRẠM ghi sai tư cách từng cái. Không lỗi nào, chỉ một bản đồ nói
 * dối bằng đúng cái kênh (§4d: đặc ↔ rỗng) mà nó dựng ra để nói thật.
 *
 * `BUFFER` là hằng số duy nhất mang **cùng một nghĩa ở cả hai bộ** và có định nghĩa hẹp
 * (vành đệm 5 km ngoài ranh giới). Hỏi "có phải vành đệm không" thì đúng ở mọi bộ; hỏi "có
 * phải Hà Nội không" thì đúng ở đúng một bộ. Một bộ thứ ba đặt tên `PROVINCE` sẽ chạy đúng
 * mà không phải sửa dòng nào ở đây.
 */

/** Giá trị `scope` của vành đệm — hằng số DUY NHẤT giống nhau ở cả hai bộ dữ liệu. */
export const BUFFER_SCOPE = "BUFFER";

/** Trạm này thuộc phạm vi đang xem (Hà Nội ở bộ gốc, tỉnh ở store toàn quốc)? */
export function isInScope(scope: string): boolean {
  return scope !== BUFFER_SCOPE;
}
