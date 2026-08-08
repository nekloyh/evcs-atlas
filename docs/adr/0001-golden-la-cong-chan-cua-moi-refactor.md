# ADR-0001 — Golden fingerprint là cổng chặn của mọi đợt refactor

**Ngày** 2026-08-08 · **Trạng thái** chấp nhận

## Bối cảnh

`AUDIT_TOAN_QUOC.md §F` làm một phép đối chứng rất mạnh: chạy `vn/` cho tỉnh 01 rồi so 12
chỉ số với bộ `hanoi/`. Hai đường mã hoàn toàn khác nhau, cùng đầu vào, số trùng khít.

Nhưng nó là một bảng Markdown. Nó đúng tại thời điểm ai đó gõ nó, và không có gì bảo nó
còn đúng sau lần sửa tiếp theo. Bốn vết trôi giữa `hanoi/` và `vn/` đã đo được, và **không
vết nào bị phát hiện lúc xảy ra** — chúng chỉ lộ ra khi có người ngồi đọc hai file cạnh nhau:

* `s02_grid.py:116` thiếu `abs()` ở phép kiểm bất biến ⇒ PASS với trôi âm bất kỳ
* `s08:165` ngưỡng reachable `> 0.99` vs `n07:190` `> 0.95`
* `scope` phát `HANOI` ở một bên, `IN` ở bên kia — nhãn lệch rò vào 9 consumer
* `s07` chỉ phát cột `*_frac` khi `sum > 0` ⇒ schema đổi theo dữ liệu

Một đợt refactor kiến trúc mà không có cách phân biệt "số đổi vì sửa đúng" khỏi "số đổi vì
lỗi mới" thì không được phép bắt đầu.

## Quyết định

`golden/` chụp **vân tay bất biến theo thứ tự** của mọi bảng sản phẩm — 801 bảng, gồm cả
`store/` lẫn `web/public/data/`. Mỗi cột có: số dòng, số null, tổng, tổng bình phương, min,
max, trung vị (số) hoặc băm tập giá trị duy nhất (chuỗi). Khoá có băm riêng.

`make golden` DỪNG nếu một con số nào đổi.

**Đổi cấu trúc mã thì được. Đổi kết quả thì phải là một quyết định có người ký** — nghĩa là
chạy `make golden-ghi` một cách cố ý, kèm commit nói vì sao.

## Ba chi tiết làm nó dùng được

1. **Bất biến theo thứ tự dòng.** Mọi thống kê tính trên giá trị đã `np.sort`. Đổi thứ tự
   merge, đổi kiểu groupby, đổi số phân mảnh — vân tay không đổi.
2. **Cộng dồn theo thứ tự đã sắp.** Không có bước này, nhiễu dấu phẩy động của phép cộng
   báo động giả ở mọi lần chạy.
3. **12 chữ số có nghĩa.** Đủ chặt để bắt một ô đổi nhóm (~1e-4 tương đối), đủ lỏng để bỏ
   qua bit cuối.

## Hệ quả

Tích cực: §2 (tách `evcs.core`) chạy lại 239 cặp (bước, tỉnh) và chứng minh được 0 thay đổi.
§4 (schema) cũng vậy. Không đợt nào phải dựa vào "tôi đọc kỹ rồi".

Cái giá: mỗi lần xác minh tốn một lần chạy pipeline (~12 phút cho 34 tỉnh, ~17 phút nếu
phải quét lại PBF). Đó là giá đúng — nó rẻ hơn hẳn một con số sai lọt ra ngoài.

Rủi ro còn lại: golden chỉ phủ **parquet**. Manifest JSON, GeoJSON và báo cáo QA không có
trong đó. Một thay đổi chỉ chạm chúng sẽ đi qua cổng — như bản sửa `missing_layers` ở §4 đã
đi qua. Muốn phủ thì mở rộng `golden/capture.py`.
