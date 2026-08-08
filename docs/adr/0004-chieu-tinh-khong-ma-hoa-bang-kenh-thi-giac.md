# ADR-0004 — Chiều TỈNH không mã hoá bằng kênh thị giác nào

**Ngày** 2026-08-07 · **Trạng thái** chấp nhận

## Bối cảnh

Bộ dữ liệu có 34 tỉnh. Câu hỏi tự nhiên là "tô màu theo tỉnh thế nào" — và câu trả lời đúng
là **không tô**.

Bốn kênh thị giác đều đã có chủ, và ba trong bốn có số đo:

| kênh | đã dành cho | trạng thái |
|---|---|---|
| **hue** | số đo (ramp cam) + overlay | ĐẦY — xem bảng dưới |
| **hình dạng** | 6 mark ● ■ ◆ ▲ ✚ ★ | gần cạn |
| **nét đứt** | trạng thái vận hành trạm | đã hẹn |
| **vân** | overlay vùng, và null hai loại | đã dành |

Kênh hue đầy là một **phép đo, không phải cảm nhận**. Bốn hue ứng viên đều chết vì đụng
một màu đang dùng (ΔE, sàn an toàn là 15):

| ứng viên | đụng | ΔE |
|---|---|---|
| aqua | c1 (deuteranopia) | **0,6** |
| green | c3 / c4 (deuteranopia) | 3,0–3,3 |
| violet | blue-550 (thị giác thường) | 9,0 |
| magenta | c1 / c2 (thị giác thường) | 10,3–10,6 |

## Quyết định

**Tỉnh là một chiều PHẠM VI, không phải một thuộc tính đọc trên bản đồ.** Ba lý do, theo
thứ tự sức nặng:

1. **Vị trí đã mã hoá nó rồi, và mã hoá hoàn hảo.** 34 tỉnh rời nhau về không gian theo
   đúng định nghĩa. Thêm màu cho tỉnh là **mã hoá trùng** — tốn một kênh khan hiếm để nói
   lại một điều bản đồ đã nói.
2. **34 hạng mục vượt xa sức của mọi kênh hạng mục.** Ngưỡng phân biệt của hue là ~8–12
   màu; hình dạng còn thấp hơn. Bảng màu 34 hạng mục là bảng màu không đọc được, dù có
   kênh trống hay không.
3. **So sánh giữa các tỉnh bằng mắt vốn đã không an toàn.** `computeClassing` chia bậc
   **phân vị trên chính dữ liệu đang nạp**, nên cùng một màu nghĩa là giá trị khác nhau ở
   hai tỉnh. Từ chối mã hoá tỉnh cũng là từ chối một phép so sánh mà cách chia bậc không
   đỡ nổi.

## Thay bằng gì

| việc cần làm | kênh dùng |
|---|---|
| biết đang xem tỉnh nào | **văn bản** (tiêu đề + nhãn) và **khoá `tinh` trong URL** |
| ranh giới tỉnh | **nét viền** của lớp bối cảnh |
| màn hình toàn quốc | đơn vị đọc là **chính tỉnh**: choropleth 34 đa giác, và khi đó **độ sáng của MỘT hue mang SỐ ĐO**, còn danh tính tỉnh vẫn do vị trí + nhãn mang |
| chuyển tỉnh | **lọc**, không phải tô: một tỉnh một lúc, tỉnh khác là bối cảnh xám |

## Hệ quả

Mất khả năng đặt ô của hai tỉnh cạnh nhau và phân biệt bằng màu. Đó là mất một thứ **vốn đã
không an toàn** (lý do 3), nên giá phải trả thấp hơn vẻ ngoài.

Và nó ràng buộc mọi lớp thêm sau này: lớp POI, lớp trạm biến áp, bất cứ chiều hạng mục mới
nào đều **không còn hue để dùng**. Kênh tiếp theo phải là vân, cao độ, hoặc một lần vẽ riêng
— không phải một màu nữa.
