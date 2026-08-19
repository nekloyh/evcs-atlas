/**
 * Ngưỡng miền — MỘT chỗ khai, mọi nơi đọc.
 *
 * Module này cố tình KHÔNG import gì cả. Nó được cả tầng truy vấn (`data/queries.ts`,
 * `bench.ts`), tầng model thuần (`viz/chart-models.ts`) lẫn registry trường (`fields.ts`)
 * dùng chung, mà tầng model thuần phải chạy được trong `node --test` — nơi không có
 * DuckDB-WASM và không có `?url` của Vite. Khai hằng này trong `data/queries.ts` từng kéo
 * cả bộ nạp WASM vào một test thuần và làm hỏng nó.
 *
 * §4.2 của PHASE4_VISUALIZATION.md nói thẳng: ngưỡng 2.000 m "phải được import vào chỗ
 * dựng truy vấn từ MỘT hằng, không gõ lại trong SQL và TypeScript".
 */

/**
 * Bán kính phục vụ theo mạng đường, tính bằng MÉT.
 *
 * Đây là ngưỡng QUY ĐỊNH đã đăng ký của bài toán, không phải một break rút ra từ phân bố.
 * Mọi câu "ngoài 2 km" — overlay `beyond2km`, cột `pop_beyond_2km`, gộp Q-P4-4, đường
 * hairline của Access Curve — phải đọc từ đây, nếu không một lần đổi ngưỡng sẽ tách một
 * luật thành ba luật im lặng khác nhau.
 */
export const BEYOND_2KM_M = 2000;
