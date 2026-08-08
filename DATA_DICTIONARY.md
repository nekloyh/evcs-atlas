# DATA DICTIONARY

Từng trường trong bộ dữ liệu cuối: **ý nghĩa · nguồn · ngày ảnh chụp · vì sao chọn bản này
thay vì các biến thể bị loại**.

Nguyên tắc xuyên suốt: **một khái niệm một trường**. Khi nguồn có nhiều biến thể của cùng một
đại lượng, chỉ đúng một bản đi vào đây; cột "Loại bản nào" ghi bản bị bỏ và lý do. Lý luận
đầy đủ ở [`DECISIONS.md`](DECISIONS.md).

## Ngày ảnh chụp của từng nguồn

| Nguồn | Ảnh chụp | Đường dẫn gốc (chỉ đọc) |
|---|---|---|
| Ranh giới + dân số hành chính VNSDI | hiệu lực **16/6/2025**, công bố 13/07/2025 | `aGiang-evcs/data/interim/vnsdi/communes.parquet` |
| OpenStreetMap (đường · POI · trạm biến áp) | PBF freeze **28/07/2026** | `aGiang-evcs/data/raw/osm/vietnam-latest.osm.pbf` |
| Trạm sạc + cổng sạc | canonical trên ảnh chụp **evcs_vn 29/07/2026** | `aGiang-evcs/data/interim/canonical/` |
| Telemetry occupancy | `evcs_vn_2026-07-29-full`, cửa sổ **30 ngày** | `aGiang-evcs/data/interim/occ/` |
| WorldPop | bản chiếu **2025**, R2024B, 100 m | `aGiang-evcs/data/raw/worldpop/vnm_pop_2025_CN_100m_R2024B_v1.tif` |
| ESA WorldCover | **2021** v200, 10 m | `aGiang-evcs/data/raw/landuse/worldcover/` |

---

## 1. `grid_h3_r8.parquet` — bảng chính

> **Bảng cột đầy đủ ở [`docs/COT.md`](docs/COT.md) — SINH TỰ ĐỘNG từ `src/evcs/schema/`.**
> Bộ Hà Nội cũ (`data/processed/`) có **56 cột**; store toàn quốc (`store/p/<mã>/`) có
> **61 cột** — chênh lệch là 3 lớp phủ luôn-bằng-0 mà bộ cũ bỏ khi rỗng, `population_wp`,
> và `road_len_in_hanoi_m` → `road_len_in_province_m`. Mục dưới đây mô tả bộ Hà Nội.

### 1. `grid_h3_r8.parquet` — bảng chính (4.400 dòng × 56 cột)

Khoá: `h3_r8`. Một dòng một ô lưới H3 độ phân giải 8 giao với ranh giới Hà Nội.

### 1.1 Định danh và hình học

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `h3_r8` | string | Mã ô H3 r8 (~0,74 km²) | dẫn xuất | r7/r9 — r8 là độ phân giải duy nhất, khớp bán kính phục vụ 3 km |
| `lat` · `lng` | float | Tâm ô | dẫn xuất | — |
| `area_km2` | float | Diện tích ô | H3 | — |
| `area_frac` | float | Phần diện tích ô **nằm trong** Hà Nội, 0–1. Ô có `area_frac` < 0,01 **không thuộc lưới** — chúng là hiện vật hình học, không phải ô biên (27 ô, mang 139,9 km đường mà chỉ 0,29 km thật nằm trong Hà Nội; 78 người; 0 trạm). Danh sách đầy đủ ở `data/qa/s02_grid.json` | VNSDI 16/6/2025 | Luật "tâm ô trong tỉnh" của repo cũ — làm tròn 0/1 gây lệch dọc biên |
| `cell_state` | string | `INSIDE` (`area_frac` ≥ 0,999, 3.904 ô) · `BORDER` (496 ô) | dẫn xuất | — |
| `commune_code` | string | Mã xã/phường **chiếm phần lớn nhất** trong ô, tính từ đa giác | VNSDI | `demand_h3.admin_l1_code` của repo cũ — nhãn ô chỉ đúng 72,9% (nợ `N-6`); nợ đó không đi theo vì lớp này dựng lại từ hình học |
| `commune_name` | string | Tên xã/phường tương ứng | VNSDI | Bản OSM `adm6` — không phải nguồn chính thức |
| `commune_area_frac` | float | Phần diện tích ô thuộc xã trên, 0–1. **Đọc kèm `commune_code`**: 573/4.400 ô có giá trị < 0,6, tức nhãn xã là "áp đảo tương đối", không phải "trọn ô" | dẫn xuất | — |

> Cần cộng dồn chính xác theo xã thì dùng `layers/grid_cell_commune.parquet` (ma trận ô × xã
> đầy đủ), không dùng `commune_code`.

### 1.2 Dân số

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `population` | float | **Trường dân số duy nhất.** Phân bổ dasymetric: bề mặt WorldPop 2025 neo theo `danso` từng xã VNSDI | WorldPop 2025 × VNSDI 16/6/2025 | `pop` (2020 constrained, −16,9% so số chính thức, bỏ 12,3% ô có đường) · `pop_adj` (cùng lỗ hổng phủ) · `pop_2025` thô (+5,1%) · `pop_k1`/settlement (chạy trên 2020) · 4 bảng H3 phái sinh của repo cũ. Xem DECISIONS §4 |
| `pop_density_ppkm2` | float | `population / area_km2` | dẫn xuất | — |
| `pop_source` | string | `WORLDPOP2025_ANCHORED_VNSDI` (4.210 ô) · `WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE` (55 ô — 2 xã có `danso` công bố hỏng, xem DECISIONS §4b) · `ZERO_NO_WEIGHT` (135 ô không dân) | dẫn xuất | — |

### 1.3 Lớp phủ mặt đất

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `built_frac` | float | Tỉ lệ diện tích ô là mặt bằng đã xây dựng (lớp 50) | WorldCover 2021 | `built_up_frac` của repo cũ — chỉ phủ 61,3% ô Hà Nội |
| `water_frac` · `crop_frac` · `tree_frac` · `grass_frac` · `shrub_frac` · `bare_frac` · `wetland_frac` | float | Tỉ lệ các lớp phủ còn lại. Tổng 8 trường = 1,0 (kiểm `fracs_sum_to_1`) | WorldCover 2021 | — |
> **Không có trường `buildable`.** Bản trước có, dựng từ `built_frac ≥ 0,05 AND water_frac ≤ 0,50`.
> Đã bỏ vì ba lý do đo được: (1) quét ngưỡng cho hàm **trơn**, không có "vai" tự nhiên nào —
> mọi ngưỡng tuỳ tiện như nhau; (2) ngưỡng 0,05 **loại nhầm 3,3% trạm đang vận hành thật**,
> muốn giữ 99% trạm thì ngưỡng phải là 0,01 tức gần như không lọc gì; (3) ảnh nguồn là
> **2021** dùng cho **2026**, điểm mù lệch có hệ thống vào vành đai ven đô mới xây. Ai cần
> ngưỡng thì tự đặt trên các `*_frac` và tự chịu trách nhiệm về lựa chọn đó. DECISIONS §7.

### 1.4 Đường bộ

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `road_len_m` | float | Tổng chiều dài đường ô tô đi được trong ô, mét. Toàn Hà Nội **30.617 km** | OSM 28/07/2026 | `lane_m_*` (mét-làn, trộn suy đoán số làn) · `lane_obs_m_*` (mét-làn chỉ tính làn có tag) — hai biến thể cùng khái niệm, giữ số đo trực tiếp |
| `road_len_motorway_m` · `_trunk_m` · `_primary_m` · `_secondary_m` · `_tertiary_m` · `_local_m` · `_service_m` | float | Chiều dài theo cấp đường. Tổng 7 trường = `road_len_m` | OSM | — |
| `road_len_arterial_m` | float | Cộng gộp 4 cấp cao (motorway + trunk + primary + secondary), **3.109 km** | dẫn xuất |
| `road_len_in_hanoi_m` | float | `road_len_m` nhưng **cắt theo ranh giới Hà Nội**. Cột KIỂM CHỨNG, không phải cột thay thế — xem hộp bên dưới | dẫn xuất | — |

Loại đường **không** tính vào: `footway`, `path`, `cycleway`, `pedestrian`, `steps`, `track`
— ô tô không đi được, đưa vào sẽ thổi phồng khả năng tiếp cận.

> ⚠️ **HAI QUY ƯỚC CẮT BIÊN trong cùng một bảng — đọc kỹ trước khi chia.**
> `road_len_*`, `n_poi_*` và các `*_frac` lớp phủ đo trên **TOÀN Ô**, kể cả phần nằm ngoài
> Hà Nội. `population` chỉ đếm pixel **TRONG** ranh giới. Giữ toàn-ô là **cố ý**: con đường
> cách ranh giới 200 m vẫn chở người trong ô đi sạc, cắt cứng là giả vờ ranh giới hành chính
> chặn được xe.
>
> Nhưng chênh lệch phải **đo được**, không được âm thầm: **3,87%** tổng chiều dài đường
> (1.180 km) nằm ngoài ranh giới, và nó dồn vào ô biên — `road_len_in_hanoi_m` cho phép
> kiểm từng ô. **Đừng chia hai trường khác quy ước cho nhau ở mức ô**; muốn tỉ lệ trên đầu
> người thì lên cấp xã, nơi `area_frac` không còn nghĩa. DECISIONS §2a.

### 1.5 Điểm quan tâm (POI)

| Trường | Kiểu | Ý nghĩa | Nguồn |
|---|---|---|---|
| `n_fuel` (323) · `n_parking_off` (509) · `n_parking_street` (67) · `n_mall` (47) · `n_dept_store` (83) · `n_supermarket` (253) · `n_market` (194) · `n_apartment` (2.482) | int | Số POI mỗi loại trong ô | OSM 28/07/2026 |
| `n_poi_total` | int | Tổng 8 loại trên — **3.958** POI trong Hà Nội | dẫn xuất |
| `apartment_levels_sum` | float | Tổng `building:levels` của các toà chung cư trong ô. Chỉ ~36% toà có tag này ⇒ là **chặn dưới** | OSM |

> Repo cũ lấy POI qua Overpass ngày khác với lớp đường và cắt biên bằng bbox, để lọt 54,2%
> đối tượng ngoài phạm vi. Bản này trích cùng lượt quét với đường và cắt bằng đa giác thật —
> **88.063** đối tượng trong bbox nhưng ngoài đa giác đã bị loại.

### 1.6 Cung hiện hữu và lưới điện

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `n_stations` | int | Số trạm trong ô (1.333 ô có ít nhất một trạm) | canonical evcs 29/07/2026 | — |
| `n_stations_operational` | int | Trong đó `op_status = OPERATIONAL` | canonical | — |
| `n_ports` | int | Tổng súng lắp đặt trong ô. Toàn Hà Nội **7.785** | canonical, tầng ASSET | `num_connectors` (tầng LIVE — số súng *đang báo cáo*, đọc thiếu ở 1.568 trạm toàn quốc) |
| `power_kw_site` | float | Tổng công suất điểm, cộng theo tủ. Toàn Hà Nội **250,4 MW** | canonical | `nameplate_power_kw` = Σ nameplate từng súng, **phóng đại 1,82×** |

> **Không có trường nào về lưới điện.** `dist_substation_m` đã bị bỏ: nó dựng từ **133** trạm
> biến áp gắn tag OSM cho cả AOI — 25,3 km²/trạm, và **một** trạm biến áp làm láng giềng gần
> nhất cho tới **236 ô**. Đó là lớp thưa giả tạo: trường trông có cơ sở kỹ thuật điện trong
> khi không có. Khả năng đấu nối lưới nằm **ngoài phạm vi** theo thống nhất với khách hàng —
> đây là ranh giới tuyên bố, không phải lỗ hổng. Bộ dữ liệu chỉ mô tả công suất **trên trụ**.
> DECISIONS §8.

### 1.7 Khoảng cách tới trạm gần nhất

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `dist_station_network_m` | float | Khoảng cách **theo mạng đường** từ tâm ô tới trạm gần nhất, Dijkstra đa nguồn tôn trọng đường một chiều. Trung vị **2.323 m** · p90 **4.833 m** | OSM 28/07/2026 + trạm 29/07/2026 | `drive_time_station_min` (phút) — xem hộp bên dưới |
| `dist_station_euclid_m` | float | Khoảng cách **đường chim bay** tới trạm gần nhất. Trung vị **1.487 m** | như trên | — |
| `detour_ratio` | float | **Hệ số đi vòng** = mạng ÷ chim bay. Trung vị **1,47** · p90 **2,29** · max **36,08**. **696 ô** có tỉ số > 2. `null` ở 88 ô (1 ô không tới được + 87 ô có chim bay < 200 m, mẫu số quá nhỏ để tỉ số có nghĩa) | dẫn xuất | — |
| `dist_station_asym_m` | float | **Chênh lệch đi ↔ về** = \|d(ô→trạm) − d(trạm→ô)\|, do đường một chiều. Trung vị **0 m** · p90 **152 m** · max **16.293 m**. **182 ô** lệch > 500 m | dẫn xuất (hai lượt Dijkstra ngược chiều) | — |
| `road_access_offset_m` | float | Khoảng cách đường thẳng từ tâm ô ra điểm vào mạng đường. Đã cộng vào `dist_station_network_m` | dẫn xuất | — |
| `network_reachable` | bool | Có đường đi hợp lệ tới trạm không. **4.399/4.400** = true | dẫn xuất | — |
| `evidence_grade_distance` | string | `OSM_NETWORK` (4.399) · `UNREACHABLE_NO_ROAD_ACCESS` (1). Không còn `UNREACHABLE_NO_PATH`: 49 ô đó neo vào đỉnh cụt một chiều, đã sửa ở A4 | dẫn xuất | `EUCLID_FALLBACK` |

> **BỐN khái niệm, không phải bốn biến thể.** Dùng nhầm cái nào cũng ra một con số trông hợp lý:
>
> | Câu hỏi | Trường đúng |
> |---|---|
> | *"Ô này đã được phủ chưa? Lái bao xa?"* | `dist_station_network_m` |
> | *"Hai trạm có gần nhau quá không? Mật độ trạm?"* | `dist_station_euclid_m` |
> | *"Chỗ nào chim bay nói dối?"* | `detour_ratio` |
> | *"Chỗ nào chiều về khác chiều đi?"* | `dist_station_asym_m` |
>
> **`dist_station_asym_m` KHÔNG phải cột khoảng cách thứ hai.** Chiều về trùng chiều đi ở
> 95,7% số ô, nên phát cả `dist_from` sẽ cho hai cột gần y hệt nhau — và hai cột gần y hệt
> nhau chỉ mời người đọc chia chúng cho nhau. Trường này phát đúng **phần chênh**, tức phần
> thông tin duy nhất mà chiều về có mà chiều đi không có. Trung vị **đúng bằng 0** là giá trị
> THẬT, không phải thiếu dữ liệu: phần lớn đường Hà Nội là hai chiều.
>
> **Đừng dùng chim bay để kết luận độ phủ.** Sai số của nó chỉ lệch **về một phía** — đường
> đi thật không bao giờ ngắn hơn chim bay, đó là ràng buộc hình học. Ở bán kính 3 km, chim
> bay nói 3.864 ô đã phủ, mạng đường nói 2.860: **1.004 ô (26,0%) dương tính giả, 0 âm tính
> giả**. Bảng đầy đủ theo bán kính 1/2/3/5 km ở `data/qa/s08_traveltime.json`.
>
> **KHÔNG có trường thời gian.** Bản trước có `drive_time_station_min`, tính từ bảng 7 con số
> km/h đặt tay vì chỉ 1,1% đoạn đường có tag `maxspeed`. Kiểm độ nhạy: **bỏ hẳn tag đi thì
> Spearman vẫn 0,9991** — trường đó **100% là giả định**; và đổi bảng ±30% làm **62% ô đổi
> nhóm ngưỡng 3/5/10 phút**. Xếp hạng thì bền (ρ = 0,9964), nhưng *con số phút* thì không có
> nội dung. Mét đo trên chính hình học đường, không tham số nào. DECISIONS §6.
>
> Ô không tới được để `null`, **không** điền giá trị lớn tuỳ tiện.

### 1.8 Mức sử dụng đo được

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `util_cell` | float | Mức sử dụng của ô — trung bình có trọng số theo số cổng, trên các trạm `util_reportable` trong ô. **`null` ở ô không có trạm đo được, không phải 0** (kiểm `util_cell_null_not_zero`). Có mặt trên **437/4.400 ô** = 437/449 ô *có trạm công cộng* | telemetry 30 ngày | Repo cũ **không có lớp này**: `occ_layer = MISSING` trên 100% hồ sơ |
| `n_stations_measured` | int | Số trạm đóng góp vào `util_cell` | dẫn xuất | — |

---

## 2. `commune.parquet` — xã/phường (126 dòng)

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `commune_code` | string | Mã xã VNSDI (`maxa`) | VNSDI 16/6/2025 | — |
| `commune_name` · `province_code` · `province_name` | string | Tên xã · `01` · Thành phố Hà Nội | VNSDI | — |
| `area_km2` | float | Diện tích **công bố**. Tổng 3.359,77 km² | VNSDI | Diện tích đo lại từ đa giác (3.348,92 km², lệch 0,32%) — đối chứng nằm ở `data/qa/s01_admin.json`, không nhân thành cột thứ hai |
| `valid_from` | string | Ngày hiệu lực của đơn vị hành chính | VNSDI | — |
| `population` | float | **Dân số thực dùng trong bộ dữ liệu.** Bằng `danso` công bố ở 124 xã; ở 2 xã có số công bố hỏng là tổng WorldPop | VNSDI / WorldPop | Số công bố thô cho 2 xã hỏng — ghi trong `data/qa/s04_population.json` |
| `pop_source` | string | Nói rõ dòng nào là số công bố, dòng nào là thay thế | dẫn xuất | — |
| `pop_density_ppkm2` | float | `population / area_km2` | dẫn xuất | — |
| `n_stations` · `n_ports` · `power_kw_site` | int/float | Cung trong xã | canonical 29/07/2026 | — |
| `ports_per_10k_pop` | float | Số súng trên 10.000 dân. Trung vị **6,9** | dẫn xuất | — |
| `util_mean_port_weighted` | float | Mức sử dụng trung bình có trọng số cổng | telemetry | — |
| `dist_station_m_pop_weighted` | float | Khoảng cách theo đường tới trạm gần nhất, trung bình **có trọng số dân số** — nên nó nói về *người dân* của xã, không về *diện tích* xã | dẫn xuất | Trung bình không trọng số — sẽ để ô rỗng lấn át ô đông dân |
| `geometry_wkb` | binary | Đa giác xã, WKB, EPSG:4326 | VNSDI | Đa giác OSM `adm6` |

---

## 3. `stations.parquet` — trạm sạc công cộng (939 dòng)

`scope = 'HANOI'` (710) hoặc `'BUFFER'` (229, trong vành đệm 5 km — **không** thuộc Hà Nội,
có mặt để tính phủ đúng cho ô sát biên).

**Bảng này chỉ có trạm CÔNG CỘNG.** Trạm thoả `n_ports == 1` **và** `current_type == 'AC'`
— ổ cắm lắp tại nhà — bị loại hoàn toàn: **2.408 trạm** trong vùng (71,8% số trạm Hà Nội,
nhưng chỉ 7,0% công suất). Vì bộ lọc chạy ở B5, mọi trường dẫn xuất trong tài liệu này
(`n_stations`, `n_ports`, `power_kw_site`, `dist_station_network_m`, `dist_station_euclid_m`,
`detour_ratio`, `util_cell`, và các cột theo xã) là số **sau khi loại**. Lý do: DECISIONS §3a.

| Trường | Kiểu | Ý nghĩa | Nguồn | Loại bản nào |
|---|---|---|---|---|
| `station_id` | string | Khoá. Chỉ bản chính của mỗi trạm vật lý (`is_primary`), lọc theo **đa giác VNSDI** chứ không theo khoá phân vùng `province_code` cũ (khoá đó cho 8,3% dương tính giả + 3,9% âm tính giả — DECISIONS §3) | canonical | Toàn bộ vết dedup (`dup_group_id`, `physical_id`, `dup_method`, `dup_dist_m`, `n_dup_members`) |
| `station_code` | string | Mã nguồn evcs.vn, ví dụ `C.HNO0461`. Khoá join sang occupancy | evcs.vn | — |
| `lat` · `lng` | float | Toạ độ đã giải quyết. Chỉ giữ trạm `coord_resolved` | canonical | `lat_raw`/`lng_raw`/`coord_fix_dist_m` — trong dữ liệu Hà Nội `coord_src` bằng `evcs` ở 100% dòng nên chúng là cột hằng số |
| `name` · `address` · `operator` | string | Nhãn. 933/939 trạm operator `VinFast` | evcs.vn / registry | — |
| `station_type` | string | `VINFAST_CS` (704 ở Hà Nội) · `OTHER` (6) | canonical | — |
| `vehicle_class` | string | `CAR` · `UNKNOWN` · `UNVERIFIED` | canonical | — |
| `op_status` | string | **Trạng thái vận hành duy nhất**: `OPERATIONAL` (1.981) · `MAINTENANCE` (503) · `OUT_OF_SERVICE` (32) · `UNKNOWN` (5) | canonical | `status` thô (`Available`/`AllBusy`/…— `AllBusy` là tín hiệu bận thời điểm, thuộc lớp occupancy) · `is_operational` (bool) · `official_charging_status` (registry) |
| `access` | string | `PUBLIC` (2.499) · `RESTRICTED` (17) · `UNKNOWN` (5) | canonical | `is_public` — bool trùng nghĩa |
| `current_type` | string | Tầng ASSET: `AC` · `DC` · `MIXED` | canonical | Bản suy từ `connectors` (tầng LIVE, trôi sau P7) |
| `n_ports` | int | **Số súng lắp đặt** = hợp của registry, evcs `totalEvse`, cực đại telemetry — cả ba là chặn dưới | canonical, tầng ASSET | `num_connectors` (LIVE, đọc thiếu ở 1.568 trạm) |
| `n_guns_imputed` | int | `1` ở 26 trạm không giải được cấu hình; `null` ở phần còn lại | canonical | — |
| `power_kw_max_port` | float | Công suất súng nhanh nhất tại trạm (kW) | canonical | — |
| `power_kw_site` | float | **Công suất điểm**, cộng theo tủ | canonical | `nameplate_power_kw` (Σ từng súng, phóng đại 1,82×) · `total_power_kw` (LIVE) |
| `port_config_source` | string | `OFFICIAL` (3.293) · `EVCS_LIVE` (27) · `UNKNOWN` (26) · `TELEMETRY_BOUND` (1) | canonical | `config_resolved` (bool suy được từ trường này) |
| `verified_official` | bool | Có khớp registry chính thức VinFast không. 99,76% ở Hà Nội | canonical | `match_method`/`official_store_id`/`match_dist_m`/`match_name_sim` — vết đối sánh |
| `freshness` | float | Tuổi bản ghi tính theo ngày kể từ lần quan sát cuối; trung vị 0,08 | canonical | `confidence` — gần như hằng số 1,0 |
| `has_timeseries` | bool | Có telemetry không. 98,8% ở Hà Nội | canonical | — |
| `commune_code` · `commune_name` | string | Tính lại bằng **điểm-trong-đa-giác** trên VNSDI hiện hành — trùng khớp 100% với nhãn của repo cũ, tức đây là phép kiểm chứng đã pass. `null` với trạm `scope = BUFFER` | VNSDI | — |
| `scope` | string | `HANOI` · `BUFFER` | dẫn xuất | — |
| `h3_r8` | string | Ô lưới chứa trạm | dẫn xuất | — |

## 4. `connectors.parquet` — cổng sạc (1.602 dòng)

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `connector_id` | string | Khoá |
| `station_id` · `station_code` | string | Khoá ngoại về `stations` |
| `connector_standard` | string | `TYPE2` (2.814) · `CCS2` (1.164) · `UNKNOWN` (31). `UNKNOWN` khi registry không khớp — **không có fallback** cho chuẩn phích |
| `current_type` | string | `AC` / `DC`. Trạm chỉ có evcs dùng fallback bậc 25 kW |
| `power_kw` | float | Công suất mỗi cổng |
| `vehicle_class` | string | Loại xe phục vụ |
| `count_total` | int | Số cổng của dòng này. Tổng **8.823** |

> `count_total` là tầng **LIVE** (đang báo cáo) — nó **không** khớp `stations.n_ports` (tầng
> ASSET, lắp đặt) và không nên khớp. Cần số súng lắp đặt thì dùng `n_ports`.

## 5. `station_occupancy.parquet` — mức sử dụng (703 dòng)

Cửa sổ **30 ngày**, ảnh chụp `evcs_vn_2026-07-29-full`. Phủ 703/710 trạm Hà Nội (99,0%).

| Trường | Kiểu | Ý nghĩa | Loại bản nào |
|---|---|---|---|
| `station_code` | string | Khoá, join về `stations` | — |
| `util` | float | **Mức sử dụng duy nhất** — tỉ lệ cổng-giờ bận, 0–1. Trung bình 0,155 · trung vị 0,111 | `occ_twa`, `occ_twa_hb`, `util_hb` (bản co ngót), `occ_p50`, `load_factor` |
| `util_p95` | float | Mức sử dụng phân vị 95 (đỉnh) | `occ_p95`, `occ_max`, `peakiness` |
| `saturation_frac` | float | Tỉ lệ thời gian **kín toàn bộ cổng**. Trung bình 0,098 | `hours_at_full` (cùng đại lượng, đơn vị giờ) |
| `duty_cycle` | float | Tỉ lệ thời gian có ít nhất một cổng bận | `idle_ratio` (= 1 − duty_cycle) |
| `grade` | string | `GOOD` (1.134) · `PARTIAL` (572) · `INSUFFICIENT` (785) | — |
| `coverage` | float | Tỉ lệ cửa sổ 30 ngày thật sự quan sát được. Trung bình 0,558 | `n_obs`, `resolved_h`, `max_gap_h`, `unobserved_frac`, `in_window_frac`, `n_cells_observed`, `n_hours_observed` |
| `obs_days` | float | Số ngày có quan sát | — |
| `util_reportable` | bool | `util` có đủ điều kiện công bố không | — |
| `occ_status` | string | `OK` (676) · `THIEU_COVERAGE` (23) · `THIEU_PEER` (4) | — |
| `util_denominator_ports` | float | **Mẫu số mà `util` đã được tính với.** *Không* phải cách đếm cổng thứ hai — số súng lắp đặt là `stations.n_ports`. Giữ để `util` kiểm chứng được | — |
| `util_pctl` | float | Phân vị của `util` **trong Hà Nội**, theo `current_type`. Chỉ tính cho 676 trạm `grade = GOOD`; còn lại `null`, **không** điền 0 | `occ_pctl` — phân vị trên lớp tham chiếu **toàn quốc**, vô nghĩa trong bộ dữ liệu chỉ có Hà Nội |
| `util_pctl_peer` | string | Lớp tham chiếu đã dùng, dạng `HANOI\|<current_type>` | — |
| `shape_class` | string | Dạng hồ sơ ngày: `DEM_TROI` (674) · `HAI_DINH` (431) · `BAN_NGAY_PHANG` (263) · `THAT_THUONG` (189) · `KHONG_XEP_LOAI` (934) | — |
| `peak_hour` · `peak_dow` | int | Giờ (0–23) và thứ (0 = Thứ Hai) bận nhất | — |
| `night_share` · `weekend_ratio` | float | Tỉ trọng đêm · tỉ số cuối tuần/ngày thường | — |
| `ever_active` | bool | Có bao giờ ghi nhận cổng bận không | — |
| `commune_kind` | string | **Loại đơn vị hành chính** chứa trạm: `PHUONG` (288) · `XA` (415). Dựng lại từ tiền tố `commune_name` của VNSDI, **không** phải ước lượng mật độ | `urban_rural` của repo cũ — cùng nội dung, nhưng tên tiếng Anh gợi ý sai rằng đây là một ước lượng |
| `current_type` | string | Chép từ `stations` để dùng làm lớp tham chiếu | — |
| `window_start_utc` · `window_end_utc` · `snapshot_id` | string | Cửa sổ quan sát và định danh ảnh chụp | — |

## 6. `station_occupancy_profile_168h.parquet` — hồ sơ tuần (116.785 dòng)

Khoá `(station_code, dow, hour)`, tối đa 168 dòng/trạm.

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `dow` · `hour` | int | Thứ (0 = Thứ Hai) · giờ (0–23) |
| `occ` | float | Số cổng bận trung bình ở ô thời gian đó |
| `observed_h` | float | Số giờ thật sự quan sát được — **đọc `occ` kèm trường này**, ô ít quan sát thì `occ` không đáng tin |
| `n_obs` | int | Số lần lấy mẫu |

## 7. File GeoJSON

| File | Nội dung |
|---|---|
| `grid_h3_r8.geojson` | Toàn bộ 4.400 ô, mọi thuộc tính của bảng chính. Mở thẳng bằng QGIS |
| `admin_boundary.geojson` | Hai feature: `kind = "boundary"` (ranh giới chính thức) và `kind = "buffer"` (vành đệm 5 km) |

## 8. `data/processed/layers/` — phân rã theo nguồn

`admin_commune` · `grid_cell` · `grid_cell_commune` · `population_cell` · `population_commune`
· `landcover_cell` · `road_cell` · `poi_cell` · `supply_cell` · `traveltime_cell`.

Đây là **đầu vào** của `grid_h3_r8.parquet`, giữ để truy vết từng trường về đúng bước sinh ra
nó. Chúng không mang khái niệm nào mới, nên không vi phạm nguyên tắc một-khái-niệm-một-trường:
mọi cột ở đây hoặc xuất hiện nguyên vẹn trong bảng chính, hoặc là cột kiểm chất lượng của
bước đó (`n_px_10m`, `commune_coverage`).

Ngoại lệ có ích: `grid_cell_commune.parquet` giữ **ma trận ô × xã đầy đủ** (6.257 cặp) — dùng
nó khi cần cộng dồn theo xã cho đúng, thay vì nhãn áp đảo `commune_code`.

## 9. `data/raw/` — bản trích phạm vi Hà Nội của nguồn thượng nguồn

`vnsdi_hanoi_communes.parquet` · `worldpop2025_hanoi_window.tif` · `osm_hanoi_roads.parquet`
(240.212 đoạn, có hình học — cần cho đồ thị định tuyến) · `osm_hanoi_poi.parquet`.

Có mặt để bộ dữ liệu **đứng độc lập** sau lần build đầu: chạy lại `make layers` không cần hai
repo cũ và không cần quét lại file PBF 325 MB.

---

## 1.10 Sàng lọc đơn xin đặt trạm (B12)

| Trường | Kiểu | Ý nghĩa | Nguồn |
|---|---|---|---|
| `screen_margin_m` | float | Khoảng cách **chim bay** tới trạm gần nhất **trừ** ngưỡng của loại đơn vị. Dương = đủ xa | dẫn xuất |
| `screen_decision` | string | `DE_XUAT` (1.782 ô) · `DE_XUAT_NEU_CO_DC` (358) · `TU_CHOI` (2.260) | dẫn xuất |

> **⚠ Hai trường này là ĐẦU RA CỦA MỘT BỘ RULE, không phải số đo về thành phố.**
> Mọi trường khác trong bảng mô tả Hà Nội và chỉ đổi khi Hà Nội đổi. Hai trường này đổi khi
> **quy định** đổi. Đừng trộn chúng vào một phân tích mô tả.
>
> Rule: Phường > 500 m · Xã > 2.000 m · ngoại lệ hạ Xã xuống 500 m khi trạm gần nhất có
> `util` ≥ 0,40 và người nộp đơn mang trụ DC.
>
> **Ba con số phải đọc kèm:**
> 1. Chạy ngược trên 660 trạm **đang vận hành**, bộ rule từ chối **41,4 – 73,5%** trong số đó.
> 2. Nguồn **không có** trạm "sắp vận hành" — engine sẽ ĐỀ XUẤT ở cả chỗ sắp có trạm.
> 3. **Không tồn tại tập đơn thật** để kiểm chứng đầu-cuối. Mọi hiệu chuẩn dùng chính trạm
>    đang vận hành làm đơn giả định.

## 1.11 POI trong bán kính

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `n_poi_1km` | int | Số POI trong bán kính **1 km chim bay** quanh tâm ô |

> **Khác `n_poi_total` ở KHÁI NIỆM.** `n_poi_total` là **kiểm kê** (ô này chứa gì);
> `n_poi_1km` là **phơi nhiễm** (quanh điểm này có gì). Đo được là phơi nhiễm mới dự báo được
> nhu cầu: trên 632 trạm có `util` tin cậy, thêm nó đưa R² từ **0,266 lên 0,313** — hơn cả
> khối 18 lớp cơ cấu POI (0,303) và hơn bán kính theo mạng đường.
>
> **Chim bay chứ không phải mạng đường, và đó là kết quả ĐO.** Ở mọi bán kính dưới 1,5 km,
> chim bay dự báo tốt hơn. POI không tác động như **điểm đến người ta lái xe tới**, mà như
> **chỉ báo tính chất khu vực** — thứ lan theo không gian, không theo mạng đường.
>
> **⚠ Số 0 phần lớn nghĩa là "chưa được vẽ", không phải "không có gì".** 72,4% ô có đúng 0
> POI trong 1 km, và **35,4% dân Hà Nội** sống ở những ô đó. 47,6% xã/phường không có một cái
> chợ nào trong OSM. Xem `notebooks/poi_chat_luong.ipynb`.
