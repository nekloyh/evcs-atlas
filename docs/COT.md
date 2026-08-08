# Từ điển cột — SINH TỰ ĐỘNG

Đừng sửa file này. Sửa `src/evcs/schema/*.py` rồi chạy:

```bash
make schema
```

`make kiem` DỪNG nếu file này trôi khỏi bản khai.

Vì sao nó được sinh chứ không được viết: cùng một sự thật từng được kể lại ở bốn nơi và
kể ra **bốn con số khác nhau** — `README` 56 · `DATA_DICTIONARY` (đã xoá) 56 · `web/src/fields.ts`
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

### `stations` — 26 cột

Trạm sạc CÔNG CỘNG trong tỉnh và vành đệm 5 km. Điểm sạc cá nhân 1-súng-AC đã loại.

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `station_id` | str | khoá | supply | — | — |  | Slug ASCII — khoá dùng ở URL |
| 2 | `station_code` | str | định danh | supply | — | — |  | Mã của nguồn. **KHÔNG dùng ở URL**: đo được 6/939 mã chứa dấu cách, dấu phẩy và dấu tiếng Việt, mà dấu phẩy là ký tự phân cách của khoá hash. |
| 3 | `lat` | f64 | định danh | supply | độ | — |  |  |
| 4 | `lng` | f64 | định danh | supply | độ | — |  |  |
| 5 | `name` | str | định danh | supply | — | — |  |  |
| 6 | `address` | str | định danh | supply | — | — |  |  |
| 7 | `operator` | str | định danh | supply | — | — |  | Hà Nội: 704/710 là VinFast |
| 8 | `station_type` | str | định danh | supply | — | — |  |  |
| 9 | `vehicle_class` | str | định danh | supply | — | — |  |  |
| 10 | `op_status` | str | số đo | supply | — | — |  | OPERATIONAL · MAINTENANCE · OUT_OF_SERVICE · UNKNOWN. Hai giá trị đầu là 'đủ tư cách phục vụ'. |
| 11 | `access` | str | số đo | supply | — | — |  | PUBLIC · RESTRICTED · UNKNOWN. RESTRICTED bị loại khỏi nguồn Dijkstra. |
| 12 | `current_type` | str | số đo | supply | — | — |  | AC · DC · MIXED |
| 13 | `n_ports` | i64 | số đo | supply | súng | cộng |  |  |
| 14 | `n_guns_imputed` | i64 | số đo | supply | súng | cộng |  | Phần số súng do SUY RA chứ không do nguồn khai — mẫu số của mọi tỉ lệ theo cổng |
| 15 | `power_kw_max_port` | f64 | số đo | supply | kW | — |  | Cổng mạnh nhất tại trạm |
| 16 | `power_kw_site` | f64 | số đo | supply | kW | cộng |  | Tổng công suất trên trụ |
| 17 | `port_config_source` | str | định danh | supply | — | — |  | Cấu hình cổng lấy từ đâu |
| 18 | `verified_official` | bool | số đo | supply | — | — |  | Khớp danh mục chính thức |
| 19 | `freshness` | f64 | số đo | supply | 0–1 | — |  | Độ mới của bản ghi. Nhỏ là mới. |
| 20 | `has_timeseries` | bool | số đo | supply | — | — |  | Có telemetry để tính mức sử dụng không |
| 21 | `province_code` | str | định danh | supply | — | — |  |  |
| 22 | `commune_code` | str | định danh | supply | — | — |  | Gán lại bằng HÌNH HỌC, không tin nhãn nguồn |
| 23 | `commune_name` | str | định danh | supply | — | — |  |  |
| 24 | `scope` | str | số đo | supply | — | — |  | IN (trong ranh giới) · BUFFER (trong vành đệm 5 km). Vành đệm hai tỉnh kề nhau CHỒNG nhau ⇒ **mọi phép cộng dồn toàn quốc phải lọc IN**. |
| 25 | `h3_r8` | str | định danh | supply | — | — |  | Ô chứa trạm — khoá nối trạm ↔ lưới |
| 26 | `commune_kind` | str | định danh | supply | — | — |  | PHUONG · XA · DAC_KHU |

### `connectors` — 9 cột

Một dòng một cấu hình cổng của một trạm

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `connector_id` | str | khoá | supply | — | — |  |  |
| 2 | `station_id` | str | định danh | supply | — | — |  |  |
| 3 | `station_code` | str | định danh | supply | — | — |  |  |
| 4 | `connector_standard` | str | số đo | supply | — | — |  | CCS2 · TYPE2 · UNKNOWN |
| 5 | `current_type` | str | số đo | supply | — | — |  | AC · DC |
| 6 | `power_kw` | f64 | số đo | supply | kW | — |  | Công suất định mức MỘT cổng |
| 7 | `vehicle_class` | str | định danh | supply | — | — |  |  |
| 8 | `count_total` | i64 | số đo | supply | cổng | cộng |  | Số cổng cùng cấu hình |
| 9 | `province_code` | str | định danh | supply | — | — |  |  |

### `station_occupancy` — 25 cột

Mức sử dụng đo được trên cửa sổ telemetry 30 ngày, một dòng một trạm

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `station_code` | str | khoá | occupancy | — | — |  |  |
| 2 | `util` | f64 | số đo | occupancy | tỉ lệ cổng-giờ bận, 0–1 ↓xấu | — |  | Mẫu số là số cổng LẮP ĐẶT, không phải số cổng đang báo cáo |
| 3 | `util_p95` | f64 | số đo | occupancy | 0–1 | — |  | Phân vị 95 của mức bận theo giờ |
| 4 | `saturation_frac` | f64 | số đo | occupancy | 0–1 | — |  | Phần thời gian mọi cổng đều bận |
| 5 | `duty_cycle` | f64 | số đo | occupancy | 0–1 | — |  |  |
| 6 | `grade` | str | số đo | occupancy | — | — |  | GOOD · PARTIAL · INSUFFICIENT — hạng bằng chứng của phép đo, không phải của trạm |
| 7 | `coverage` | f64 | số đo | occupancy | 0–1 | — |  | Phần cửa sổ có quan sát |
| 8 | `obs_days` | f64 | số đo | occupancy | ngày | — |  |  |
| 9 | `util_reportable` | bool | số đo | occupancy | — | — |  | Đủ điều kiện để TRÍCH RA NGOÀI |
| 10 | `occ_status` | str | số đo | occupancy | — | — |  | Cổng thật của `util_pctl` — KHÔNG phải `grade` |
| 11 | `shape_class` | str | số đo | occupancy | — | — |  | DEM_TROI · HAI_DINH · BAN_NGAY_PHANG · THAT_THUONG · KHONG_XEP_LOAI |
| 12 | `peak_hour` | i64 | số đo | occupancy | giờ 0–23 | — |  |  |
| 13 | `peak_dow` | i64 | số đo | occupancy | thứ 0–6 | — |  |  |
| 14 | `night_share` | f64 | số đo | occupancy | 0–1 | — |  |  |
| 15 | `weekend_ratio` | f64 | số đo | occupancy | lần | — |  |  |
| 16 | `util_denominator_ports` | f64 | số đo | occupancy | cổng | — |  | Mẫu số của `util` |
| 17 | `ever_active` | bool | số đo | occupancy | — | — |  |  |
| 18 | `province_code` | str | định danh | occupancy | — | — |  |  |
| 19 | `current_type` | str | định danh | occupancy | — | — |  |  |
| 20 | `commune_kind` | str | định danh | occupancy | — | — |  |  |
| 21 | `util_pctl` | f64 | số đo | occupancy | phân vị trong nhóm cùng loại, 0–100 | — |  |  **· null =** trạm chưa đủ quan sát để xếp hạng — KHÔNG phải xếp hạng thấp |
| 22 | `util_pctl_peer` | str | định danh | occupancy | — | — |  | Lớp tham chiếu của phân vị, dạng `<province_code>\|<current_type>` (ví dụ `01\|AC`). Phân vị chỉ có nghĩa TRONG lớp này; thiếu nhãn là hai tỉnh bị so nhầm mà không ai thấy. |
| 23 | `window_start_utc` | str | định danh | occupancy | — | — |  |  |
| 24 | `window_end_utc` | str | định danh | occupancy | — | — |  |  |
| 25 | `snapshot_id` | str | định danh | occupancy | — | — |  |  |

### `station_occupancy_profile_168h` — 7 cột

Hồ sơ bận theo 168 ô (thứ × giờ) từng trạm — 2,74 triệu dòng toàn quốc

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `station_code` | str | khoá | occupancy | — | — |  |  |
| 2 | `dow` | i8 | định danh | occupancy | thứ 0–6 | — |  |  |
| 3 | `hour` | i8 | định danh | occupancy | giờ 0–23 | — |  |  |
| 4 | `occ` | f64 | số đo | occupancy | cổng bận | — |  |  **· null =** ô giờ này không có quan sát nào |
| 5 | `observed_h` | f64 | số đo | occupancy | giờ | — |  | Số giờ quan sát rơi vào ô này. Dưới 1 h thì KHÔNG tô — ngưỡng suy từ khớp `var(t) = a + b/t`, xem `web/DESIGN.md`. |
| 6 | `n_obs` | i32 | số đo | occupancy | mẫu | cộng |  |  |
| 7 | `province_code` | str | định danh | occupancy | — | — |  |  |

### `substations` — 7 cột

Trạm biến áp OSM — lớp ĐIỂM để vẽ. Bảy cột, và bảy là con số có ý nghĩa.

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `osm_type` | str | định danh | substation | — | — |  | node · way · relation |
| 2 | `osm_id` | i64 | khoá | substation | — | — |  | `orig_id()` với area — KHÔNG phải id tổng hợp của osmium |
| 3 | `name` | str | định danh | substation | — | — |  |  **· null =** OSM không đặt tên |
| 4 | `lat` | f64 | định danh | substation | độ | — |  | TÂM đa giác nếu OSM vẽ bằng đa giác |
| 5 | `lng` | f64 | định danh | substation | độ | — |  |  |
| 6 | `province_code` | str | định danh | substation | — | — |  |  |
| 7 | `scope` | str | số đo | substation | — | — |  | IN · BUFFER — lớp bối cảnh, không cộng dồn ở đâu |

### `grid_h3_r6` — 30 cột

Lưới gộp toàn quốc cho màn hình CẢ NƯỚC XEM MỘT LẦN

| # | cột | kiểu | vai | lớp | đơn vị | gộp | cả nước | nghĩa |
|--:|---|---|---|---|---|---|:-:|---|
| 1 | `h3_r6` | str | khoá | national | — | — |  | Mã ô H3 r6, ~36 km² |
| 2 | `province_code` | str | định danh | national | — | — |  | Tỉnh CHỦ của ô — tỉnh chiếm nhiều ô r8 nhất trong ô gộp này |
| 3 | `n_provinces` | i32 | định danh | national | tỉnh | — |  | Số tỉnh mà ô gộp chạm vào. Lớn hơn 1 nghĩa là ô nằm vắt qua biên. |
| 4 | `n_cells_r8` | i32 | định danh | national | ô | — |  | Số ô r8 gộp vào — MẪU SỐ của mọi tỉ số ở bậc này, và nó KHÔNG đều giữa các ô |
| 5 | `lat` | f32 | định danh | national | độ | — |  | Vĩ độ tâm ô gộp |
| 6 | `lng` | f32 | định danh | national | độ | — |  | Kinh độ tâm ô gộp |
| 7 | `area_km2` | f32 | định danh | national | km² | — |  | Diện tích phần ô gộp nằm trong lãnh thổ đã dựng — không phải 36 km² tròn |
| 8 | `population` | f32 | số đo | population | người trên ô ~0,74 km² | cộng |  | Dân số dasymetric: bề mặt WorldPop 2025 R2024B neo theo `danso` từng xã của VNSDI |
| 9 | `n_stations` | i32 | số đo | grid | trạm | cộng |  | Trạm sạc công cộng trong ô |
| 10 | `n_stations_operational` | i32 | số đo | grid | trạm | cộng |  | Trong đó đang vận hành |
| 11 | `n_ports` | i32 | số đo | grid | súng | cộng |  | Tổng số cổng sạc |
| 12 | `power_kw_site` | f32 | số đo | grid | kW | cộng |  | Tổng công suất trên trụ |
| 13 | `n_fuel` | i32 | số đo | grid | điểm | cộng |  | Cây xăng |
| 14 | `n_parking_off` | i32 | số đo | grid | điểm | cộng |  | Bãi đỗ ngoài đường |
| 15 | `n_parking_street` | i32 | số đo | grid | điểm | cộng |  | Chỗ đỗ ven đường |
| 16 | `n_mall` | i32 | số đo | grid | điểm | cộng |  | Trung tâm thương mại |
| 17 | `n_dept_store` | i32 | số đo | grid | điểm | cộng |  | Cửa hàng bách hoá |
| 18 | `n_supermarket` | i32 | số đo | grid | điểm | cộng |  | Siêu thị |
| 19 | `n_market` | i32 | số đo | grid | điểm | cộng |  | Chợ |
| 20 | `n_apartment` | i32 | số đo | grid | toà | cộng |  | Toà chung cư |
| 21 | `n_poi_total` | i32 | số đo | grid | điểm | cộng |  | Tổng 8 lớp POI trong ô |
| 22 | `road_len_arterial_m` | f32 | số đo | grid | mét | cộng |  | Cao tốc + trục xuyên tâm + quốc lộ + liên khu vực |
| 23 | `road_len_in_province_m` | f32 | số đo | grid | mét | cộng |  | Chiều dài đường CẮT ĐÚNG ranh giới tỉnh. Khác `road_len_m`, thứ đo trên toàn ô kể cả phần nằm ngoài tỉnh — hai quy ước cắt biên, hai cột, không trộn. |
| 24 | `apartment_levels_sum` | f32 | số đo | grid | tầng | cộng |  | Tổng số tầng khai báo của các toà chung cư trong ô |
| 25 | `population_wp` | f32 | số đo | population | người trên ô ~0,74 km² | cộng |  | WorldPop THÔ, chưa neo. Phát riêng vì tổng `danso` toàn quốc lệch ~12% và lệch KHÔNG ĐỀU giữa các tỉnh — neo mù sẽ thổi phồng đúng những tỉnh sai nhiều nhất. |
| 26 | `tree_frac` | f32 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Cây thân gỗ |
| 27 | `crop_frac` | f32 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Đất trồng trọt |
| 28 | `built_frac` | f32 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Đất đã xây dựng |
| 29 | `water_frac` | f32 | số đo | landcover | tỉ lệ, 0–1 | TB theo diện tích |  | Mặt nước |
| 30 | `pop_density_ppkm2` | f32 | số đo | national | người/km² | — |  | `population` gộp chia `area_km2` gộp. TÍNH LẠI, không phải trung bình của các tỉ số con — trung bình của tỉ số không phải tỉ số của trung bình. |

