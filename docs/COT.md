# Từ điển cột — SINH TỰ ĐỘNG

Đừng sửa file này. Sửa `src/evcs/schema/*.py` rồi chạy:

```bash
make schema
```

`make kiem` DỪNG nếu file này trôi khỏi bản khai.

Vì sao nó được sinh chứ không được viết: cùng một sự thật từng được kể lại ở bốn nơi và
kể ra **bốn con số khác nhau** — `README` 56 · `DATA_DICTIONARY` 56 · `web/src/fields.ts`
53 · trên đĩa 61. Một tài liệu kể lại schema là một cơ hội nữa để schema trôi.

Cột `vai = định danh` cố ý KHÔNG tô màu lên bản đồ được. Cột `gộp = —` KHÔNG gộp lên bậc
thô hơn bằng bất kỳ phép nào — khoảng cách tới trạm gần nhất của một vùng không phải trung
bình khoảng cách của các ô trong nó.

### `grid_h3_r8` — 61 cột

Bảng chính: một dòng một ô lưới H3 r8 trong một tỉnh

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `h3_r8` | str | khoá | grid | — | — |  | Mã ô H3 độ phân giải 8 (~0,74 km²) |
| 2 | `province_code` | str | định danh | grid | — | — |  | Mã tỉnh VNSDI, 2 ký tự |
| 3 | `lat` | f64 | định danh | grid | độ | — |  | Vĩ độ tâm ô |
| 4 | `lng` | f64 | định danh | grid | độ | — |  | Kinh độ tâm ô |
| 5 | `area_km2` | f64 | số đo | grid | km² | cộng |  | Diện tích hình học của ô H3 |
| 6 | `area_frac` | f64 | số đo | grid | tỉ lệ, 0–1 | — |  | Phần diện tích ô nằm TRONG tỉnh. Mọi đại lượng cộng dồn chia theo tỉ lệ này. |
| 7 | `cell_state` | str | định danh | grid | — | — |  | INSIDE (area_frac ≥ 0,999) hoặc BORDER |
| 8 | `commune_code` | str | định danh | grid | — | — |  | Mã xã/phường VNSDI, 5 ký tự |
| 9 | `commune_name` | str | định danh | grid | — | — |  | Tên xã/phường có tiền tố loại đơn vị |
| 10 | `commune_area_frac` | f64 | định danh | grid | tỉ lệ, 0–1 | — |  | Phần diện tích ô thuộc xã được gán (xã chiếm nhiều nhất) |
| 11 | `population` | f64 | số đo | population | người trên ô ~0,74 km² | cộng | ✓ | Dân số dasymetric: bề mặt WorldPop 2025 R2024B neo theo `danso` từng xã của VNSDI |
| 12 | `pop_density_ppkm2` | f64 | số đo | population | người/km² | — |  | `population` chia diện tích phần ô nằm trong tỉnh. Tỉ số — không cộng được. |
| 13 | `pop_source` | str | định danh | population | — | — |  | Cột dân số neo vào đâu: ANCHORED / AREAL / UNANCHORED |
| 14 | `n_stations` | i64 | số đo | grid | trạm | cộng | ✓ | Trạm sạc công cộng trong ô |
| 15 | `n_stations_operational` | i64 | số đo | grid | trạm | cộng | ✓ | Trong đó đang vận hành |
| 16 | `n_ports` | i64 | số đo | grid | súng | cộng | ✓ | Tổng số cổng sạc |
| 17 | `power_kw_site` | f64 | số đo | grid | kW | cộng | ✓ | Tổng công suất trên trụ |
| 18 | `n_fuel` | i64 | số đo | grid | điểm | cộng | ✓ | Cây xăng |
| 19 | `n_parking_off` | i64 | số đo | grid | điểm | cộng | ✓ | Bãi đỗ ngoài đường |
| 20 | `n_parking_street` | i64 | số đo | grid | điểm | cộng | ✓ | Chỗ đỗ ven đường |
| 21 | `n_mall` | i64 | số đo | grid | điểm | cộng | ✓ | Trung tâm thương mại |
| 22 | `n_dept_store` | i64 | số đo | grid | điểm | cộng | ✓ | Cửa hàng bách hoá |
| 23 | `n_supermarket` | i64 | số đo | grid | điểm | cộng | ✓ | Siêu thị |
| 24 | `n_market` | i64 | số đo | grid | điểm | cộng | ✓ | Chợ |
| 25 | `n_apartment` | i64 | số đo | grid | toà | cộng | ✓ | Toà chung cư |
| 26 | `n_poi_total` | i64 | số đo | grid | điểm | cộng | ✓ | Tổng 8 lớp POI trong ô |
| 27 | `road_len_local_m` | f64 | số đo | grid | mét | cộng |  | Đường nội bộ, khu dân cư |
| 28 | `road_len_motorway_m` | f64 | số đo | grid | mét | cộng |  | Cao tốc |
| 29 | `road_len_primary_m` | f64 | số đo | grid | mét | cộng |  | Quốc lộ / trục chính |
| 30 | `road_len_secondary_m` | f64 | số đo | grid | mét | cộng |  | Đường liên khu vực |
| 31 | `road_len_service_m` | f64 | số đo | grid | mét | cộng |  | Đường phục vụ |
| 32 | `road_len_tertiary_m` | f64 | số đo | grid | mét | cộng |  | Đường khu vực |
| 33 | `road_len_trunk_m` | f64 | số đo | grid | mét | cộng |  | Trục xuyên tâm |
| 34 | `road_len_m` | f64 | số đo | grid | mét | cộng |  | Tổng chiều dài đường trong TOÀN ô |
| 35 | `road_len_arterial_m` | f64 | số đo | grid | mét | cộng | ✓ | Cao tốc + trục xuyên tâm + quốc lộ + liên khu vực |
| 36 | `road_len_in_province_m` | f64 | số đo | grid | mét | cộng | ✓ | Chiều dài đường CẮT ĐÚNG ranh giới tỉnh. Khác `road_len_m`, thứ đo trên toàn ô kể cả phần nằm ngoài tỉnh — hai quy ước cắt biên, hai cột, không trộn. |
| 37 | `n_poi_1km` | i64 | số đo | grid | POI trong bán kính 1 km | — |  | PHƠI NHIỄM POI quanh tâm ô — chim bay 1 km, nên các ô CHỒNG LẤN nhau và cộng vào là đếm trùng. Đây là lý do `agg` của nó là `none` chứ không phải `sum`. |
| 38 | `apartment_levels_sum` | f64 | số đo | grid | tầng | cộng | ✓ | Tổng số tầng khai báo của các toà chung cư trong ô |
| 39 | `population_wp` | f64 | số đo | population | người trên ô ~0,74 km² | cộng | ✓ | WorldPop THÔ, chưa neo. Phát riêng vì tổng `danso` toàn quốc lệch ~12% và lệch KHÔNG ĐỀU giữa các tỉnh — neo mù sẽ thổi phồng đúng những tỉnh sai nhiều nhất. |
| 40 | `tree_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích | ✓ | Cây thân gỗ |
| 41 | `shrub_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Cây bụi |
| 42 | `grass_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Cỏ |
| 43 | `crop_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích | ✓ | Đất trồng trọt |
| 44 | `built_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích | ✓ | Đất đã xây dựng |
| 45 | `bare_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Đất trống |
| 46 | `snow_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Tuyết và băng |
| 47 | `water_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích | ✓ | Mặt nước |
| 48 | `wetland_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Đất ngập nước |
| 49 | `mangrove_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Rừng ngập mặn |
| 50 | `moss_frac` | f64 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Rêu và địa y |
| 51 | `dist_station_network_m` | f64 | số đo | distance | mét, theo mạng đường ↓xấu | — |  | Dijkstra đa nguồn trên đồ thị đường OSM thật, tôn trọng đường một chiều **· null =** ô không tới được bằng đường trong bán kính neo |
| 52 | `dist_station_euclid_m` | f64 | số đo | distance | mét, đường chim bay | — |  | KHÁI NIỆM RIÊNG, không phải bản dự phòng của cột trên. Dùng cho câu hỏi về BỐ TRÍ (hai trạm có gần nhau quá không). KHÔNG được dùng để kết luận độ phủ: ở bán kính 3 km nó báo phủ nhầm 1.004/3.864 ô, và sai chỉ lệch về một phía. |
| 53 | `detour_ratio` | f64 | số đo | distance | lần ↓xấu | — |  | Đường mạng chia đường chim bay. Trung vị Hà Nội 1,47; phân vị 90 là 2,29. **· null =** khoảng cách chim bay dưới 200 m — dưới mức đó tỉ số là nhiễu |
| 54 | `dist_station_asym_m` | f64 | số đo | distance | m, |đi − về| ↓xấu | — |  | Chênh lệch giữa chiều ô→trạm và trạm→ô. Đo bất đối xứng do đường một chiều. |
| 55 | `road_access_offset_m` | f64 | số đo | distance | mét | — |  | Khoảng cách từ tâm ô tới đỉnh đồ thị neo được. Lớn nghĩa là ô xa mạng đường. |
| 56 | `network_reachable` | bool | số đo | distance | — | — |  | Ô có tới được một trạm bằng đường bộ trong bán kính neo không |
| 57 | `evidence_grade_distance` | str | số đo | distance | — | — |  | Hạng bằng chứng của khoảng cách — đánh dấu ô không tới được |
| 58 | `screen_margin_m` | f64 | số đo | screening | m, âm = chưa đủ xa ↑tốt | — |  | Khoảng cách trừ ngưỡng của loại đơn vị (Phường/Đặc khu 500 m · Xã 2.000 m) **· null =** ô không tính được khoảng cách nên rule không chạy |
| 59 | `screen_decision` | str | số đo | screening | — | — |  | DE_XUAT · DE_XUAT_NEU_CO_DC · TU_CHOI **· null =** ô không tính được khoảng cách — KHÁC với 'đã xét và từ chối' |
| 60 | `util_cell` | f64 | số đo | assemble | tỉ lệ cổng-giờ bận, 0–1 | — |  | Trung bình có trọng số SỐ CỔNG của mức sử dụng các trạm trong ô **· null =** ô không có trạm đo được — KHÔNG phải bận bằng 0 |
| 61 | `n_stations_measured` | i64 | số đo | assemble | trạm | cộng |  | Số trạm trong ô có mức sử dụng đo được — mẫu số của `util_cell` |

### `commune` — 21 cột

Một dòng một xã/phường/đặc khu trong một tỉnh

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `commune_code` | str | khoá | admin | — | — |  | Mã VNSDI 5 ký tự |
| 2 | `commune_name` | str | định danh | admin | — | — |  | Tên có tiền tố loại đơn vị — KHÔNG dùng làm khoá: 246 tên dùng ở nhiều tỉnh |
| 3 | `commune_kind` | str | định danh | admin | — | — |  | PHUONG · XA · DAC_KHU. BA nhánh — ở engine sàng lọc nhãn này CHỌN NGƯỠNG. |
| 4 | `province_code` | str | định danh | admin | — | — |  | Mã tỉnh 2 ký tự |
| 5 | `province_name` | str | định danh | admin | — | — |  |  |
| 6 | `area_km2` | f64 | số đo | admin | km² | cộng |  | Diện tích CÔNG BỐ của VNSDI. Có vết hỏng đo được — Phường Phú Lợi công bố 17.956 km², lớn hơn tỉnh lớn nhất nước. Dùng làm mẫu số thì phải xem `quality_flag` trước. |
| 7 | `valid_from` | str | định danh | admin | — | — |  | Niên bản địa giới hiệu lực |
| 8 | `published` | str | định danh | admin | — | — |  | Ngày VNSDI xuất bản |
| 9 | `area_km2_geom` | f64 | số đo | admin | km² | cộng |  | Diện tích ĐO từ đa giác. Lệch quá 25% so với công bố thì có cờ. |
| 10 | `quality_flag` | str | định danh | admin | — | — |  | Cờ chất lượng ngăn bằng `\|` — ĐÁNH DẤU, không sửa âm thầm **· null =** không phát hiện vết hỏng nào ở số công bố của xã này |
| 11 | `population` | f64 | số đo | population | người trên toàn xã | cộng |  | Dân số dasymetric, đã neo theo `danso` công bố trừ khi xã bị gắn cờ |
| 12 | `population_wp` | f64 | số đo | population | người | cộng |  | WorldPop THÔ, chưa neo — để đối chiếu, không để thay thế |
| 13 | `anchor_ratio` | f64 | số đo | population | lần | — |  | `danso` công bố chia tổng WorldPop của xã. Xa 1 là hai nguồn BẤT ĐỒNG — đây là số đo của độ bất đồng, không phải của sai số. |
| 14 | `pop_source` | str | định danh | population | — | — |  | Dân số neo vào đâu: ANCHORED / AREAL / UNANCHORED |
| 15 | `pop_density_ppkm2` | f64 | số đo | population | người/km² | — |  | Tỉ số — không cộng được. Mẫu số là diện tích công bố. |
| 16 | `n_stations` | i64 | số đo | supply | trạm | cộng |  | Trạm CÔNG CỘNG có tâm trong xã (đã loại điểm sạc cá nhân 1-súng-AC) |
| 17 | `n_ports` | i64 | số đo | supply | súng | cộng |  | Tổng cổng sạc |
| 18 | `power_kw_site` | f64 | số đo | supply | kW | cộng |  | Tổng công suất trụ |
| 19 | `ports_per_10k_pop` | f64 | số đo | supply | súng trên 10.000 dân ↑tốt | — |  | Phép chia của hai số đo. Trường mặc định của màn hình đầu. **· null =** xã không có dân trong bản đồ dân số — mẫu số bằng 0 |
| 20 | `util_mean_port_weighted` | f64 | số đo | occupancy | tỉ lệ cổng-giờ bận, 0–1 | — |  | Trung bình trọng số SỐ CỔNG — trạm 30 cổng nói nhiều hơn trạm 2 cổng **· null =** xã không có trạm nào đo được — KHÔNG phải bận bằng 0 |
| 21 | `dist_station_m_pop_weighted` | f64 | số đo | distance | mét theo mạng đường, trọng số dân ↓xấu | — |  | Trọng số DÂN chứ không phải diện tích: câu hỏi là 'người ở đây phải đi bao xa', không phải 'đất ở đây cách bao xa'. **· null =** không ô nào trong xã tới được trạm bằng đường bộ |
