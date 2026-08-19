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

/**
 * Hệ số đi vòng kể từ đâu thì "đường chim bay nói dối" — **giả định khai báo**.
 *
 * `> 2` = "đường thật dài hơn hai lần đường thẳng". Cùng ngưỡng mà `s08` dùng cho
 * `cells_where_euclid_understates_gt_2x`, nên con số trên màn hình và con số trong
 * `data/qa/s08_traveltime.json` nói về **cùng một tập ô**. Hai chỗ nói về cùng một tập thì
 * phải cùng một định nghĩa, và định nghĩa đó phải ở một chỗ.
 */
export const DETOUR_THRESHOLD = 2;

/**
 * Bán kính đo sai số phủ của đường chim bay, tính bằng MÉT — **giả định khai báo**.
 *
 * Khác `BEYOND_2KM_M`: cái kia là bán kính PHỤC VỤ (chính sách), cái này là bán kính để
 * **so hai thước đo với nhau**. Trùng hai số lại thì "một phần tư số ô mà chim bay gọi là
 * đã phủ thì không phủ" biến thành một câu về chính sách, mà nó là một câu về hình học.
 */
export const EUCLID_COVERAGE_RADIUS_M = 3000;

/**
 * Cầu dài bao nhiêu thì đáng kẻ đậm, tính bằng MÉT — **giả định khai báo**.
 *
 * Dữ liệu KHÔNG có cờ "bắc qua sông Hồng", nên ta không được vẽ như thể có. Thứ đo được là
 * **chiều dài**, và câu chữ phải nói đúng thứ bộ lọc này chọn: *"cầu dài hơn 1 km"*, KHÔNG
 * phải *"cầu qua sông Hồng"* — đoạn dài nhất trong gói nằm ở phía tây và không bắc qua
 * sông Hồng nào.
 */
export const MAJOR_BRIDGE_MIN_M = 1000;

/**
 * Bao nhiêu bậc phóng LÙI so với phép khớp khung của điều hướng — **giả định khai báo**.
 *
 * Điều hướng (Phase 5) muốn đối tượng **lấp đầy** khung: nó trả lời "cho tôi xem cái này".
 * Một cảnh muốn đối tượng **đọc được giữa vùng quanh nó**: nó trả lời "nhìn xem cái này
 * khác chỗ quanh nó thế nào". 1,5 bậc đưa một phường 2,45 km từ ~87% bề ngang bản đồ
 * xuống ~31%.
 */
export const SCENE_CONTEXT_ZOOM_OUT = 1.5;

/**
 * Các lát cắt mật độ mà phép quét cấu trúc dùng — **giả định khai báo**.
 *
 * Chính bộ bốn số này là luận điểm: số vùng dày rời nhau đi từ 92 xuống 1 trên **cùng một
 * trường**, nên "có mấy vùng" là thuộc tính của LÁT CẮT chứ không của thành phố. Một lát
 * cắt đơn sẽ giấu mất điều đó.
 */
export const DENSITY_QUANTILES = [0.9, 0.95, 0.975, 0.99] as const;
