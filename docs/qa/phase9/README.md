# Chứng cứ render Phase 9 — National Overview

Harness: `run_witness.py`, Chromium headless 1680×1050 qua CDP, Vite dev server cục bộ.
Kết quả máy đọc nằm ở `witness-report.json`.

| Witness | Acceptance |
|---|---|
| `at14-utilization-ranking.png` | AT-11/14: NOT COMPARABLE đặc, không có legend vân đếm trùng; 30 tỉnh xếp hạng + 4 tỉnh không so được |
| `at14-power-lower-bound.png` | AT-14: đúng hai dòng 24/96 có chip `chặn dưới` |
| `at13-drilldown.png` | AT-13: thao tác thật qua hàng ranking + CTA drill-down, reload sang đúng bundle tỉnh với hash chỉ còn `tinh` |

AT-11 dark-theme được ghi `PASS_BY_GATE`, không giả là một render có thật: `web/DESIGN.md §2`
khẳng định ứng dụng chưa có dark mode. Gate deterministic vẫn đo phép hợp thành trên nền
future-dark để token không khóa đường mở theme sau này; ảnh render thật là light theme.

AT-13 nhánh `in_store=false` là fixture-only vì artifact hiện tại có đủ 34/34 tỉnh; guard
`if (f?.properties.in_store)` được khóa bằng unit/static regression test.

Harness có fallback minh bạch qua hàng ranking + CTA nếu một Chromium không phát deck.gl
pick event. Witness lưu lần này không dùng fallback: `at13.status=PASS`, interaction là
`canvas polygon`, click thật vào Tuyên Quang và boot đúng `#tinh=08`.

Chiều về cũng nới từ “picker” sang control thật đang tồn tại ở province shell: nút nav
`Chế độ Toàn quốc`. Nó vẫn phải tạo transition `#tinh=vn` sạch và boot lại national defaults.
