# ADR-0002 — `evcs.core` không được đọc đĩa

**Ngày** 2026-08-08 · **Trạng thái** chấp nhận

## Bối cảnh

Gói `hanoi` khoá mình vào một tỉnh không phải vì thiếu tham số, mà vì **hình dạng**:
`aoi.py` vừa dựng hình học vừa đọc parquet, và `boundary()`/`buffered()`/`communes()` là
`functools.cache` **không tham số**. Tập ô là một singleton toàn cục. Nên "chạy cho tỉnh
khác" không phải chuyện đổi một tham số mà là chuyện sửa 12 file.

Cùng nguyên nhân sinh ra chuyện khác: vì không có chỗ nào cho nguyên hàm thuần sống, mỗi
call site tự dựng lại. Đo được: **12 định nghĩa "mét trên một độ kinh" với 4 giá trị khác
nhau**, 5 bản `commune_kind` (3 bản dán nhãn `XA` cho 13 đặc khu), 2 bản dựng lưới, 3 bản
dựng đồ thị đường.

## Quyết định

Ba tầng, và ranh giới giữa chúng là ranh giới về **quyền đọc đĩa**:

```
evcs.core     nguyên hàm miền — THUẦN, không IO
evcs.schema   khai cột của bảng phát hành
evcs.pipeline bước ETL — chỗ DUY NHẤT được đọc/ghi đĩa
```

Chiều gọi một chiều: `pipeline` → `core`, `schema`. `core` không gọi ai.

## Vì sao ranh giới là "đọc đĩa", không phải "logic nghiệp vụ"

Vì nó **kiểm được**, còn "logic nghiệp vụ" thì không. Một hàm không chạm đĩa thì test nó
không cần store, không cần nguồn, không cần đợi. 98 test của `core` chạy trong 0,43 giây.

Và nó chặn đúng cái đã hỏng: hàm vừa tính vừa đọc là hàm bị khoá vào *một* bộ dữ liệu, vì
nó phải biết đọc *ở đâu*.

## Hệ quả

Tích cực: `analysis/` và `notebooks/` import được `evcs.core` mà không kéo theo store.
`analysis/_graph.py` — thứ tự nhận "dựng lại ĐÚNG như s08" nhưng đã trôi mất bộ lọc `access`
và neo SCC — nay có một chỗ đúng để import.

Cái giá: một số hàm phải nhận thêm tham số mà trước đây tự lấy. `core.roadgraph.build` nhận
`(ways, m_lat, m_lon)` thay vì `(province_code, ways)`; người gọi phải tự giải hệ số. Đó là
interface đúng — hệ số mét/độ là một sự thật về vĩ độ, không phải về tỉnh.

Bẫy còn lại: `vn/admin.py` vẫn re-export `m_per_deg_lon`/`buffer_degrees`/`area_km2` từ
`core.geo` cho tương thích. Chúng là bí danh, không phải bản cài đặt thứ hai — nhưng chúng
làm chiều phụ thuộc trông mập mờ hơn thực tế. Bỏ được khi mọi call site đã gọi thẳng `core`.
