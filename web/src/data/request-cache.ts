/**
 * Sổ kép cho các loader "một khoá — một truy vấn": khử trùng lặp lúc ĐANG CHẠY, giới hạn
 * bộ nhớ lúc ĐÃ XONG. Tách khỏi `queries.ts` vì đây là chỗ duy nhất của Phase 10 có
 * lifecycle thật sự khó, và một module không chạm DuckDB thì test được bằng `node --test`
 * chứ không phải bằng grep mã nguồn.
 *
 * Vì sao HAI sổ chứ không phải một Map (bản đầu của Phase 10 dùng một, QA bác):
 *
 *  1. **Promise đang chạy không được phép bị đuổi.** Đuổi một entry đang chạy không giải
 *     phóng gì — promise vẫn sống, mảng kết quả vẫn sẽ tồn tại — nó chỉ làm lần đọc kế
 *     tiếp phát THÊM một truy vấn lên cùng một bảng. Mất cả hai đầu: vẫn tốn RAM, lại tốn
 *     thêm một lượt xếp hàng DuckDB. `inFlight` vì thế không có trần; nó tự rỗng khi
 *     promise ngã ngũ, nên bị chặn bởi số truy vấn đang bay chứ không bởi số khoá từng đọc.
 *  2. **Nhánh ngã ngũ phải so IDENTITY, không so khoá.** Với một Map chung, một truy vấn
 *     cũ bị đuổi rồi mới lỗi sẽ chạy `delete(key)` và xoá mất promise MỚI HƠN vừa được
 *     chèn cho đúng khoá đó — cache tự bắn vào chân mình đúng lúc người dùng bấm lại.
 *     Ở đây mọi nhánh ngã ngũ kiểm `inFlight.get(key) === request` trước khi chạm sổ.
 *
 * Chính sách lỗi giữ nguyên: promise lỗi KHÔNG vào sổ nhớ, nên lần đọc sau là một lần
 * thử lại thật, có chủ ý.
 */

export interface RequestCache<T> {
  /** Đọc theo khoá; `load` chỉ chạy khi khoá chưa có mặt ở cả hai sổ. */
  get(key: string, load: () => Promise<T>): Promise<T>;
  /** Chỉ để kiểm: kích thước hai sổ. Không có cửa ghi. */
  sizes(): { inFlight: number; settled: number };
  /** Xoá sạch — dùng khi đổi dataset (khoá cũ không còn nghĩa). */
  clear(): void;
}

export function makeRequestCache<T>(max: number): RequestCache<T> {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`trần cache phải là số nguyên ≥ 1, nhận ${String(max)}`);
  }
  const inFlight = new Map<string, Promise<T>>();
  const settled = new Map<string, T>();

  return {
    get(key, load) {
      // 1. Đã xong → trả ngay, và CHẠM để nó thành mới nhất (Map giữ thứ tự chèn, nên
      //    "xoá + chèn lại" là toàn bộ phần recency của LRU).
      if (settled.has(key)) {
        const value = settled.get(key)!;
        settled.delete(key);
        settled.set(key, value);
        return Promise.resolve(value);
      }
      // 2. Đang chạy → dùng chung promise. Không bao giờ đuổi nhánh này.
      const pending = inFlight.get(key);
      if (pending !== undefined) return pending;

      // 3. Chưa có → phát một lần, và chỉ nhánh của CHÍNH promise này được đụng sổ.
      const request: Promise<T> = load().then(
        (value) => {
          if (inFlight.get(key) === request) {
            inFlight.delete(key);
            settled.set(key, value);
            while (settled.size > max) {
              const oldest = settled.keys().next().value;
              if (oldest === undefined) break;
              settled.delete(oldest);
            }
          }
          return value;
        },
        (error: unknown) => {
          if (inFlight.get(key) === request) inFlight.delete(key);
          throw error;
        },
      );
      inFlight.set(key, request);
      return request;
    },

    sizes() {
      return { inFlight: inFlight.size, settled: settled.size };
    },

    clear() {
      inFlight.clear();
      settled.clear();
    },
  };
}
