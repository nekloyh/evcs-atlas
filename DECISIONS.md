# DECISIONS

Mọi lựa chọn không hiển nhiên trong bộ dữ liệu này, kèm lý do và mức độ không chắc chắn.
Số liệu trong tài liệu này là **số đo thật**, không phải ước lượng — tái lập bằng `make all`,
kiểm chéo ở [`data/qa/QA_SUMMARY.md`](data/qa/QA_SUMMARY.md).

---

## 0. Quyết định lấy nguồn cho từng lớp

Thứ tự ưu tiên đã áp dụng: **(1) lấy lại từ repo cũ → (2) ev-crawl → (3) crawl/tải mới**.

| Lớp | Quyết định | Vì sao |
|---|---|---|
| Ranh giới hành chính | **Lấy lại** — VNSDI trong `aGiang-evcs/data/interim/vnsdi/` | Nguồn chính thức, hiệu lực 16/6/2025, có `danso`+`dientich` kèm đa giác. Không cần lấy lại. §1 |
| Trạm sạc | **Lấy lại** — `aGiang-evcs/data/interim/canonical/` | Đã gộp evcs.vn + registry chính thức VinFast, đã khử trùng lặp vật lý, đã sửa toạ độ placeholder. Crawl lại bằng ev-crawl cho ra **ít hơn** và **thô hơn**. §3 |
| Cổng sạc | **Lấy lại** — cùng nguồn | Như trên |
| Occupancy / telemetry | **Lấy lại** — `aGiang-evcs/data/interim/occ/` | 18,6 triệu dòng, cửa sổ 30 ngày, đã kiểm chất lượng. ev-crawl đọc được cùng luồng Socket.IO nhưng phải quét lại từ đầu và mất 30 ngày mới có cửa sổ tương đương. §5 |
| Dân số | **Lấy lại raster, dựng lại lớp** | Raster WorldPop 2025 lấy lại; bốn bảng H3 phái sinh của repo cũ **không** dùng — dựng lại một lớp duy nhất neo VNSDI. §4 |
| Đường bộ | **Dựng lại từ PBF đã freeze** | Repo cũ chỉ có bảng H3 đã cộng dồn, không có hình học ⇒ không dựng được đồ thị định tuyến. §6 |
| POI | **Dựng lại từ PBF đã freeze** | Repo cũ lấy POI qua Overpass ngày khác với đường, và cắt biên bằng bbox nên lọt 54,2% đối tượng ngoài phạm vi. §2 |
| Lớp phủ / xây được | **Dựng lại từ WorldCover** | Repo cũ chỉ tính cho 54,4% ô Hà Nội ⇒ không phân biệt được "không xây được" với "chưa tính". §7 |
| Trạm biến áp | **Dựng lại từ PBF** | Cùng lượt quét với đường/POI, để ba lớp cùng một ảnh chụp OSM. §8 |
| Thời gian lái xe | **Dựng MỚI** (không có ở cả hai repo, không dùng ev-crawl) | §6 |
| Giá điện / OpEx | **Không đưa vào** | Không phải dữ liệu không gian; là tham số mô hình, thuộc tầng tính toán chứ không thuộc bộ dữ liệu nền. Nguồn còn nguyên ở `aGiang-evcs/data/external/opex_electricity_tariff.csv` |

### ev-crawl — vì sao cuối cùng không dùng

Đã đọc `README.md` và `draft.md` của [`luythoangduy/ev-crawl`](https://github.com/luythoangduy/ev-crawl).
Công cụ tốt và đúng phạm vi Hà Nội, nhưng ba trường nó cung cấp đều đã có bản mạnh hơn:

| Trường ev-crawl hứa | Trạng thái |
|---|---|
| Trạng thái trạm thời gian thực (Socket.IO) | Đã có, **dài hơn nhiều**: lớp occupancy là 30 ngày telemetry chứ không phải một lát cắt tức thời |
| Ranh giới hành chính từ GIS.vn (`vn2000.vn`) | **Bị loại** — đây là dịch vụ GIS bên thứ ba, không phải nguồn nhà nước. Yêu cầu của dự án là ranh giới chính thức ⇒ VNSDI thắng. §1 |
| Thời gian lái xe thật (Google Routes API v2) | **Bị chặn bởi hạ tầng, và kể cả có key cũng không đủ** — xem §6 |
| Mật độ dân số / cao độ / độ dốc quanh trạm | Mật độ dân số đã có ở độ phân giải cao hơn (ô 0,74 km² thay vì bán kính quanh trạm). Cao độ/độ dốc **không đưa vào** — chưa có yêu cầu nào của bài toán dùng tới, thêm vào là thêm nợ |

Thư mục `cache/` của ev-crawl chứa 22 file trích Overpass ngày 29/07/2026 (~72 MB). Không
dùng: bản trích từ PBF đã freeze phủ rộng hơn và cùng ảnh chụp với lớp đường. **Độ không chắc
chắn: thấp** — đã đối chứng số POI (bản mới 4.300 trong AOI so với 3.760 của repo cũ).

---

## 1. Ranh giới hành chính: VNSDI, không phải OSM, không phải GIS.vn

**Chọn:** `aGiang-evcs/data/interim/vnsdi/communes.parquet`, lọc `matinh = '01'` → 126
xã/phường, hiệu lực **16/6/2025**, công bố 13/07/2025.

**Loại:**

- `aGiang-evcs/data/ref/vn_admin/valid_from=2025-07-01/` — mọi dòng có `boundary_source = "OSM"`.
  OSM không phải nguồn chính thức. Thêm nữa cột `code` của bảng xã/phường **rỗng toàn bộ**
  (kiểu `null`), nên không join được theo mã.
- GIS.vn (`vn2000.vn`) qua ev-crawl — bên thứ ba, cần token, và cấp ranh giới "trước/sau sáp
  nhập" mà VNSDI đã cấp chính thức.

**Đối chứng đã chạy:** tổng diện tích công bố 3.359,77 km² so với đo lại từ đa giác 3.348,92
km² — lệch **0,32%**, nằm trong sai số làm tròn của bản công bố. Đa giác của cả 126 xã đều
hợp lệ (`geom_valid = True`), hợp thành **một** đa giác liền, không rời mảnh.

---

## 2. Phạm vi: đa giác chính thức + vành đệm 5 km, không phải hình tròn 25 km

**Chọn:** hai vùng tách bạch.

- `boundary` = đa giác hành chính. Đây là phạm vi **báo cáo**: một ô chỉ vào bộ dữ liệu nếu
  đa giác ô giao với đa giác này.
- `buffer` = `boundary` nới **5 km**. Đây là phạm vi **thu thập**: trạm, đường, trạm biến áp
  được lấy tới đây, nhưng không đối tượng nào trong vành đệm được báo cáo là "thuộc Hà Nội"
  (`stations.scope = 'BUFFER'`).

**Vì sao 5 km:** bán kính phục vụ của tầng chấm điểm là R = 3.000 m. Một ô sát biên có thể
được phục vụ bởi trạm ngoài tỉnh trong bán kính đó, và đường đi thật dài hơn đường chim bay —
hệ số đi vòng đo được ở đây là **1,48× trung vị**. 3.000 × 1,4 = 4.200 m, làm tròn lên 5.000.
Kết quả: **229 trạm** nằm trong vành đệm (826 trước bộ lọc §3a), đúng số lẽ ra bị mất nếu
cắt cứng theo biên.

**Loại:** AOI hình tròn 25 km + vành 5 km quanh trung tâm của repo cũ. Hình tròn không khớp
hình dạng Hà Nội (kéo dài 91 km theo trục bắc-nam): nó vừa cắt mất phần Ba Vì/Ứng Hoà, vừa
ôm vào phần Bắc Ninh/Hưng Yên không thuộc phạm vi.

**Cắt biên bằng đa giác thật, không bằng bbox.** Bước `s03` loại **88.063** đối tượng nằm
trong hộp bao nhưng ngoài đa giác đệm. Repo cũ cắt bằng bbox và để lọt 54,2% POI ngoài phạm
vi (lỗi `E-DQ7a`/`E-DQ11`) — lỗi đó không thể tái diễn ở đây vì phép lọc là hình học.

**Ô cắt biên không bị làm tròn 0/1.** Mỗi ô mang `area_frac` = phần diện tích nằm trong Hà
Nội. 523/4.427 ô là ô biên. Ở quy mô một thành phố, tỉ lệ chu vi/diện tích đủ cao để luật
"tâm ô nằm trong tỉnh" của repo cũ gây lệch có hệ thống dọc biên.

---

## 3. Trạm sạc: gán lại địa bàn bằng hình học, một trạng thái, một công suất

**Chọn:** `canonical/stations` lọc `is_primary = True` và `coord_resolved = True`, lọc theo
đa giác, rồi **loại điểm sạc cá nhân** (§3a). Kết quả **710 trạm** trong Hà Nội + **229**
trong vành đệm.

**Bốn việc làm khác repo cũ:**

0. **Loại điểm sạc cá nhân tại nhà** — xem §3a ngay dưới.
1. **Lọc theo đa giác, không theo `province_code`.** Repo cũ phân vùng file theo mã 63 tỉnh
   *trước* sáp nhập (`province_code=HNO`). Lấy Hà Nội bằng khoá phân vùng đó **sai theo cả
   hai chiều** — đo trực tiếp:

   | Cách lọc | Số trạm | Dương tính giả | Âm tính giả |
   |---|---:|---:|---:|
   | `province_code = 'HNO'` (+ primary + coord) | 2.642 | **219 (8,3%)** — thật ra ở Thanh Hoá 35 · Phú Thọ 31 · Hà Tĩnh 29 · Hải Phòng 18… | **98 (3,9%)** trạm Hà Nội mang mã phân vùng tỉnh khác |
   | Điểm-trong-đa-giác VNSDI *(bản này, **trước** bộ lọc §3a)* | **2.521** | 0 | 0 |

   **Nhãn xã trong bảng cũ thì ĐÚNG.** Repo cũ đã enrich `commune_code` từ chính ranh giới
   VNSDI (`E-DQ3`), và phép tính lại ở đây trùng khớp **2.521/2.521 = 100%**. Nói cách khác
   bước gán lại này là một phép **kiểm chứng độc lập đã pass**, không phải một bản vá.
   Thứ sai là **khoá phân vùng file**, không phải cột nhãn.

   > Con số **72,9%** trong nợ `N-6` của repo cũ là về nhãn hành chính của **ô lưới**
   > (`demand_h3.admin_l1_code`), **không** phải về trạm. Bộ dữ liệu này dựng lại nhãn ô từ
   > đa giác VNSDI ở bước `s02` nên nợ đó không đi theo — nhưng đừng trích số 72,9% cho lớp
   > trạm, nó không nói về lớp trạm.
2. **Một trạng thái.** `status` (thô evcs) · `is_operational` (bool) · `official_charging_status`
   (registry) đều là biến thể của `op_status` → chỉ giữ `op_status`. Giá trị `AllBusy` của
   `status` là tín hiệu bận **thời điểm**, thuộc lớp occupancy chứ không phải trạng thái vận
   hành — trộn hai thứ này là lỗi phân loại, không phải trùng lặp vô hại.
3. **Một công suất điểm.** `nameplate_power_kw` = Σ nameplate **từng súng**, phóng đại
   **1,82×** so với công suất tủ (đo bởi repo cũ, `E-DQ4`); giữ `site_power_kw` cộng theo tủ.

**Bỏ toàn bộ vết khử trùng lặp** (`dup_group_id`, `physical_id`, `dup_method`, `dup_dist_m`,
`n_dup_members`, `lat_raw`, `lng_raw`, `coord_fix_dist_m`): bộ dữ liệu này chỉ giữ bản chính,
nên các cột đó không trả lời được câu hỏi nào của người dùng cuối. Trong dữ liệu Hà Nội
`coord_src` bằng `'evcs'` ở **100%** dòng và `coord_fix_dist_m` bằng 0 ở 100% dòng — chúng
là cột hằng số.

### 3a. Loại điểm sạc cá nhân: `n_ports == 1` **và** `current_type == 'AC'`

**Chọn:** trạm thoả cả hai điều kiện đó bị loại khỏi `stations.parquet`, tức bị coi như
**không tồn tại** trong toàn bộ bộ dữ liệu. Đo trên vùng AOI: **2.408 trạm bị loại**
(1.811 trong Hà Nội, 597 trong vành đệm), còn lại **710 + 229**.

**Vì sao:** cặp (đúng một súng, súng đó là AC) nhận diện **ổ cắm lắp tại nhà** — chủ xe sạc
xe của chính mình qua đêm. Đó là hạ tầng khác hẳn về ca sử dụng, về ai được dùng, và về vai
trò trong bài toán đặt trạm công cộng. Ba con số nói vì sao trộn chúng vào làm hỏng mọi
thống kê cung:

| | Phần bị loại chiếm |
|---|---:|
| số **trạm** Hà Nội | **71,8%** |
| số **cổng** Hà Nội | 18,9% |
| **công suất** Hà Nội | **7,0%** |

Một tập chiếm 71,8% số trạm nhưng 7,0% công suất kéo mọi đại lượng "theo trạm" về phía nó
mà gần như không mang theo năng lực sạc. Cụ thể nó làm hỏng đúng trường quan trọng nhất:
`dist_station_network_m` đo tới **ổ cắm trong sân nhà người khác** và báo là "đã có trạm gần".

**Bộ lọc theo cấu trúc, không theo tên.** Tên có vẻ nhận ra được (`Tư nhân <tên người>`)
nhưng chỉ **~64%** mang tiền tố đó; phần còn lại là `NQ Tư Nhân`, `Nhượng quyền`, `HKD`,
hoặc chỉ có tên người. Cặp (1 súng, AC) đo được, tái lập được, và không phụ thuộc quy ước
đặt tên của nguồn.

**Null thì GIỮ.** `n_ports` khuyết (217 dòng) hoặc `current_type` khuyết (220 dòng) thì trạm
được giữ lại: "không biết" không phải "biết là cá nhân". Cùng nguyên tắc với `null ≠ 0` ở
§4b và với quy tắc badge ⚠ của web (`web/DESIGN.md` §7a).

**Loại ở CẢ vành đệm.** Trạm `BUFFER` có mặt để tính phủ đúng ở biên; một ổ cắm trong sân
nhà ở Bắc Ninh cũng không phục vụ công cộng, y hệt một ổ cắm ở Hà Nội. Loại một bên thì biên
Hà Nội có hai luật.

**Loại ở B5, không ở tầng hiển thị.** Mọi bước sau đọc `stations.parquet`, nên một bộ lọc
duy nhất ở B5 khiến B6 (occupancy), B8 (Dijkstra), B9 (cung theo ô), B10 (`util_cell`) và
B11 (theo xã) tự nhất quán. Lọc ở tầng vẽ thì bản đồ hiện 3 chấm còn `n_stations` của ô ghi
12 — hai con số cùng tên nói hai chuyện khác nhau.

**Hệ quả phải biết, không được giấu:** mọi số ở §6 và ở `DATA_DICTIONARY.md` là số **sau khi
loại**. Thay đổi lớn nhất là `util_cell` — phủ tụt từ 29,8% ô xuống **9,9% ô**, vì phần lớn
ô "có trạm đo được" trước đây là ô có một ổ cắm nhà dân. Ngược lại chất lượng đo **tăng**:
`occ_status = OK` từ 45,4% lên **96,2%** số trạm. Trường không nghèo đi; nó thôi đếm nhầm.

Phép kiểm `no_private_ac_left` trong `data/qa/s05_stations.json` bắt lỗi nếu bộ lọc sót.

---

## 4. Dân số: một trường, WorldPop 2025 neo theo VNSDI

**Chọn:** `population` = phân bổ dasymetric — bề mặt trọng số WorldPop 2025 R2024B 100 m,
tổng kiểm soát là `danso` từng xã của VNSDI.

**Loại và vì sao — đo trên chính lưới Hà Nội, không phải lý luận:**

| Biến thể | Tổng trên Hà Nội | Ô có dân | Ô **có đường** mà dân = 0 | Phán quyết |
|---|---:|---:|---:|---|
| `pop` (WorldPop 2020 constrained) | 7.253.590 | 85,4% | **12,3%** | Loại — thấp hơn số chính thức **16,9%** |
| `pop_adj` (2020 + vá dasymetric) | 7.253.185 | 85,8% | 11,7% | Loại — cùng lỗ hổng phủ như trên |
| `pop_2025` (R2024B thô) | 9.174.190 | 99,3% | 0,3% | Giữ làm **bề mặt trọng số** |
| `pop_k1` / lớp settlement | — | — | — | Loại — chạy trên `pop` thô 2020, kế thừa lỗ hổng |
| **`population` (bản này)** | **8.831.204** | **96,5%** | 0,3% | Neo tổng theo số chính thức |

Số chính thức VNSDI cho Hà Nội là **8.732.930**. Bản 2020 lệch **−16,9%**; bản 2025 thô lệch
**+5,1%**. Neo theo `danso` khử phần lệch đó và làm cho **tổng từng xã đúng bằng số công bố**,
trong khi phân bố bên trong xã vẫn theo bề mặt raster.

**Vì sao chọn 2025 làm trọng số chứ không phải 2020:** mặt nạ "constrained" của bản 2020 bỏ
**12,3%** ô có đường ở Hà Nội. Dùng nó làm trọng số thì dân của những ô ấy bị đẩy sang ô khác
— đúng chỗ ven đô đang đô thị hoá, tức đúng chỗ bài toán đặt trạm quan tâm.

### 4b. Hai xã có số công bố hỏng — thay thế CÓ KHAI BÁO

Bản công bố VNSDI có lỗi nhập liệu ở **2/126 xã**:

| Xã | `danso` công bố | Diện tích | WorldPop 2025 trong xã |
|---|---:|---:|---:|
| Phường Lĩnh Nam | **21** | 10,86 km² | 38.609 |
| Xã Ứng Thiên | **54** | 38,40 km² | 59.741 |

Xã thưa dân nhất Hà Nội có thật là Xã Ba Vì với 328 người/km². Hai con số trên tương ứng 1,9
và 1,4 người/km² trên địa bàn có nhà cửa — đây là lỗi mất chữ số, không phải sự thật.

**Xử lý:** hai xã này **không được neo**; dùng thẳng WorldPop và đánh dấu ở
`pop_source = 'WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE'`. Cổng phát hiện đặt rất chặt
(`danso < 1.000` **và** WorldPop > 10× `danso`) để chỉ bắt lỗi hiển nhiên. Hệ quả: tổng bộ dữ
liệu là **8.831.204** = 8.732.930 − 75 + 98.349, ghi nguyên trong
`data/qa/s04_population.json` và kiểm bởi
`total_matches_official_plus_declared_substitutions`.

**Đây không phải impute âm thầm** — nó có cờ ở mức dòng, có kiểm ở mức bảng, có ghi ở tài
liệu. Nhưng nó **là** một can thiệp: nếu bạn cần tuyệt đối trung thành với bản công bố, lọc
`pop_source == 'WORLDPOP2025_ANCHORED_VNSDI'`. **Độ không chắc chắn: trung bình** — bản chất
lỗi thì chắc chắn, giá trị thay thế thì chỉ chính xác bằng WorldPop (±5% ở mức thành phố).

---

## 5. Occupancy: một mức bận, phân vị tính lại trong phạm vi Hà Nội

Bảng nguồn có **~15 biến thể** của cùng khái niệm "mức bận". Giữ lại:

| Khái niệm | Trường giữ | Trường loại |
|---|---|---|
| Mức sử dụng trung bình | `util` | `occ_twa`, `occ_twa_hb`, `util_hb`, `occ_p50`, `load_factor` |
| Mức sử dụng đỉnh | `util_p95` | `occ_p95`, `occ_max`, `peakiness` |
| Tỉ lệ thời gian kín chỗ | `saturation_frac` | `hours_at_full` |
| Chất lượng quan sát | `grade` + `coverage` | `n_obs`, `resolved_h`, `max_gap_h`, `unobserved_frac`, `in_window_frac`, `n_cells_observed`, `n_hours_observed` |

`util_hb` là bản co ngót (shrinkage) của `util` — cùng đại lượng, hai ước lượng. Giữ bản thô
`util` vì nó cộng với `coverage` cho người dùng đủ thông tin để tự quyết có tin hay không;
bản co ngót giấu sự thiếu chắc chắn vào trong con số.

**`occ_pctl` tính lại thành `util_pctl`.** Bản gốc là phân vị trên lớp tham chiếu **toàn
quốc** — vô nghĩa trong một bộ dữ liệu không bao giờ nhìn ra ngoài Hà Nội. Bản mới xếp hạng
trong Hà Nội theo `current_type`, chỉ trên **676** trạm có `grade = GOOD`; 27 trạm còn lại
để `null` vì độ phủ quan sát không đủ, **không** điền 0.

> Trước bộ lọc §3a hai con số này là 1.130 và 1.361 — tức **quá nửa** bảng không xếp hạng
> được. Sau khi loại ổ cắm nhà dân thì tỉ lệ đảo hẳn: **96,2%** trạm còn lại đạt
> `occ_status = OK` (trước: 45,4%). Telemetry vốn không tệ; nó chỉ đang được đo trên một
> tập trạm mà phần lớn không phải trạm công cộng.

**`util_denominator_ports` giữ lại có chủ đích.** Nó *không* cạnh tranh với `stations.n_ports`
(số súng lắp đặt theo registry): nó là mẫu số mà `util` đã được tính với, tức là xuất xứ của
`util`. Đổi tên để không ai nhầm nó là một cách đếm cổng thứ hai.

---

## 6. Thời gian lái xe: dựng đồ thị OSM, không dùng Google Routes

> ⚠️ **ĐÃ THAY THẾ.** Trường thời gian sau đó bị **bỏ hẳn** — xem [§6 (sửa đổi)](#6-sửa-đổi--bỏ-hẳn-trường-thời-gian-chỉ-phát-mét) ở cuối file. Mục này giữ lại để thấy lý luận ban đầu và vì sao nó không đứng được.

**Chọn:** Dijkstra đa nguồn trên đồ thị đường bộ dựng từ file PBF đã freeze — 1.334.688 đỉnh,
2.773.510 cạnh **có hướng** (tôn trọng `oneway`, kể cả `oneway = -1`).

**Vì sao không dùng Google Routes API như ev-crawl đề xuất — hai lý do độc lập:**

1. **Không có `GOOGLE_MAPS_API_KEY`** trong môi trường (đã kiểm; cũng không có `.env`).
2. **Kể cả có key cũng không đủ.** Routes API tính theo từng cặp điểm. Bộ dữ liệu cần khoảng
   cách từ **4.427 ô** tới trạm gần nhất trong **3.291 trạm** — ma trận 14,5 triệu phần tử.
   Ở đơn giá Routes Preferred (`TRAFFIC_ON_POLYLINE`, mức ev-crawl dùng) đây là chi phí không
   biện minh được cho một lớp nền, và phải trả lại mỗi lần dữ liệu trạm đổi.
   Google Routes hợp cho **vài trăm tuyến minh hoạ**, không hợp cho một lớp phủ toàn thành phố.

**Đánh đổi đã chấp nhận:** mất giao thông thời gian thực. Kết quả là **free-flow**.

**Giả định tốc độ — khai báo, không giấu.** Chỉ **2.685/240.212 đoạn (1,1%)** có tag
`maxspeed`. Phần còn lại dùng bảng theo cấp đường (km/h): `MOTORWAY 80 · TRUNK 60 · PRIMARY 45
· SECONDARY 40 · TERTIARY 35 · LOCAL 25 · SERVICE 15`, nhánh `*_link` 30. Bảng đặt thấp hơn
tốc độ thiết kế để phản ánh điều kiện nội đô Hà Nội. **Độ không chắc chắn: cao** với trường
thời gian, **thấp** với trường khoảng cách.

Vì lý do đó bộ dữ liệu xuất **cả hai**: `dist_station_network_m` (số cứng, không phụ thuộc
bảng tốc độ) và `drive_time_station_min` (phụ thuộc). Đây **không** phải hai biến thể của một
khái niệm — một cái là mét, một cái là phút, và chúng đi trên **hai đường khác nhau**: đường
ngắn nhất theo mét không phải đường nhanh nhất theo phút.

**Hai đoạn ngoài mạng đường** — từ tâm ô tới điểm vào mạng, và từ đỉnh đường tới đúng vị trí
trạm — được cộng vào theo đường thẳng, quy đổi thời gian ở tốc độ `SERVICE` (15 km/h, chậm
nhất trong bảng) để không thổi phồng khả năng tiếp cận. Bỏ hai đoạn này thì khoảng cách mạng
có thể ra **ngắn hơn đường chim bay** — vô lý về hình học; phép kiểm `network_ge_euclid` bắt
đúng lỗi đó trong lần dựng đầu (tỉ số nhỏ nhất 0,097) và sau khi sửa là 1,001.

**Kết quả đo được — vì sao Euclid không thay thế được:** tỉ số đường-mạng/chim-bay trung vị
**1,477**, phân vị 90 **2,317**, lớn nhất **109,6**. **726/4.427 ô (16,4%)** bị đường chim
bay đánh giá gần hơn thực tế hơn 2 lần — **1.625.284 người** sống trong các ô đó.

> Các số này **giảm** so với bản trước §3a (trung vị 1,575 · 1.057 ô · 2,52 triệu người), và
> giảm là đúng: bỏ 2.408 ổ cắm nhà dân làm tập trạm thưa đi, nhưng những trạm còn lại nằm ở
> nơi có đường, nên tỉ số đi vòng bớt bị thổi bởi các ổ cắm trong ngõ cụt. Luận điểm không
> đổi — nó chỉ còn được chống bởi các trạm thật.

Một hệ số bù chung không sửa được điều này vì sai số
lệch theo hình học đô thị (sông, cầu, đường một chiều), không phân bố đều.

**51/4.427 ô không tới được** (32.171 người): hoặc không có đường trong bán kính neo 2 km,
hoặc không có lối đi hợp lệ. Đánh dấu ở `evidence_grade_travel_time`, để `null` ở hai trường
số — **không** điền giá trị lớn tuỳ tiện.

---

## 7. Lớp phủ và `buildable`: dựng lại toàn bộ, một cờ một lý do

> ⚠️ **ĐÃ THAY THẾ.** `buildable` sau đó bị **bỏ hẳn** — xem [§7 (sửa đổi)](#7-sửa-đổi--bỏ-trường-buildable) ở cuối file.

**Chọn:** ESA WorldCover 10 m v200 (2021), đốt chỉ số ô H3 vào chính lưới raster rồi đếm theo
lớp. Phủ **4.427/4.427 ô**, trung vị 10.083 pixel/ô.

**Loại:** `buildable_h3`/`landuse_h3` của repo cũ — chỉ phủ **54,4%** và **61,3%** ô Hà Nội
vì chỉ tính cho tập ứng viên. Trên bảng như vậy, ô thiếu giá trị không phân biệt được "không
xây được" với "chưa tính" — một sự nhập nhằng không sửa được ở phía người dùng.

**Một cờ, một lý do.** Repo cũ có `exclusion_flags` + `penalty_flags` + `penalty` chồng nhau.
Ở đây: `buildable` (bool) + `not_buildable_reason` (một chuỗi, `null` khi xây được).
Luật: `WATER` nếu tỉ lệ mặt nước > 50%; `NOT_BUILT_UP` nếu tỉ lệ đã xây dựng < 5%. Kết quả
**2.961 xây được**, 1.321 `NOT_BUILT_UP`, 145 `WATER`.

Hai ngưỡng này là **lựa chọn thiết kế, không phải hằng số vật lý**. Chúng nằm ở đầu
`s07_landcover.py` để chỉnh và chạy lại trong 2 giây. **Độ không chắc chắn: trung bình** —
ảnh nền là năm 2021, ven đô Hà Nội đã đổi nhiều từ đó.

---

## 8. Lưới điện: giữ trường, nói thẳng nó gần như trống

> ⚠️ **ĐÃ THAY THẾ.** `dist_substation_m` sau đó bị **bỏ hẳn**, lưới điện ra khỏi phạm vi — xem [§8 (sửa đổi)](#8-sửa-đổi--lưới-điện-ngoài-phạm-vi) ở cuối file.

`dist_substation_m` tính từ **133** đối tượng `power = substation` trong OSM cho cả Hà Nội +
vành đệm. Con số này quá thấp so với thực tế lưới điện một thành phố 8,8 triệu dân.

**Giữ trường** vì khoảng cách tới trạm biến áp *đã biết* vẫn là chặn dưới có ích, và **ghi
thẳng vào README** rằng nó không dùng được để kết luận về khả năng đấu nối.

**Không tạo trường kVA.** EVN không công bố dữ liệu công suất khả dụng. Repo cũ phát mã
`F_LUOI_DIEN` trên 100% hồ sơ vì đúng lý do này. Trường không có nguồn thì không tồn tại
trong bộ dữ liệu — không có cột `null` để ai đó điền bừa sau này.

---

## 9. Những gì cố ý KHÔNG đưa vào

| Không đưa | Vì sao |
|---|---|
| Cao độ / độ dốc (ev-crawl có) | Chưa có yêu cầu nào của bài toán dùng tới. Thêm vào là thêm nợ bảo trì |
| Mật độ xe điện đăng ký | Không có nguồn chính thức. ev-crawl cũng để `null` vì lý do này |
| Trạng thái pháp lý đất | Không có nguồn. Repo cũ phát `land_legal_status = UNKNOWN` trên 100% hồ sơ |
| Chỗ đỗ / diện tích / PCCC / lối vào | Chỉ có được bằng khảo sát thực địa. Chưa khảo sát nào được thực hiện |
| Điểm số / xếp hạng vị trí | **Đây là bộ dữ liệu nền, không phải kết quả mô hình.** ⚠️ **Có một ngoại lệ có kiểm soát từ §16:** `screen_decision`/`screen_margin_m` là đầu ra của một BỘ RULE do chủ đầu tư cung cấp, không phải điểm số do ta chấm. Chúng đổi khi *quy định* đổi, không khi *Hà Nội* đổi, và được đánh dấu rõ như vậy |
| Mét-làn đường (`lane_m`, `lane_obs_m`) | Biến thể của chiều dài đường, có trộn suy đoán số làn. Giữ chiều dài — số đo trực tiếp |
| Trạm đổi pin (BSS) | Bài toán là sạc ô tô điện. Trạm đổi pin phục vụ xe máy — khác loại nhu cầu |

---

## 10. Điều còn mở

1. **Ảnh chụp lệch ngày.** Ranh giới VNSDI hiệu lực 16/6/2025; PBF OSM chốt 28/07/2026; trạm
   sạc + telemetry chốt `evcs_vn_2026-07-29-full`; WorldCover là 2021; WorldPop là bản chiếu
   2025. Không lớp nào cũ hơn 1 năm ngoại trừ WorldCover.
2. **Cung gần như thuần một nhà mạng** — 704/710 trạm là `VINFAST_CS`. Mọi kết luận về
   "mức sử dụng mạng lưới" là kết luận về mạng V-GREEN.
3. ~~`urban_rural` chưa kiểm lại độc lập~~ — **ĐÃ ĐÓNG.** Audit A11 cho thấy nhãn là ánh
   xạ xác định từ loại đơn vị hành chính VNSDI (19.426/19.426 khớp, không một ô lệch). Trường
   đã được **dựng lại từ nguồn trong repo** và đổi tên `commune_kind`. Xem §11.
4. ~~`buildable` chưa xét sở hữu đất~~ — **ĐÃ ĐÓNG:** trường đã bị bỏ hẳn ở §7 (sửa đổi).
5. **Ba khoảng trống chặn L6, nằm ngoài repo** — không sửa được bằng mã: (a) không có danh
   sách trạm sắp vận hành / đã cấp phép; (b) không có tập hồ sơ thật để kiểm chứng engine
   đầu-cuối; (c) không có văn bản pháp lý cho rule loại trừ đất đặc thù. Xem `CRITIQUE.md`.
6. **Mâu thuẫn chưa giải:** chủ đầu tư chốt "trạm hiện tại coi như đúng", nhưng bộ rule §16
   từ chối 41,4–73,5% chính các trạm đó. Triển khai theo rule, cập nhật khi có thông tin
   chính thức.


---

## §2a — Loại ô vụn khỏi lưới báo cáo (`grid.MIN_AREA_FRAC = 0,01`)

**Vấn đề.** Một ô H3 chỉ cần *giao* với đa giác Hà Nội là vào lưới, kể cả khi phần giao chỉ
vài trăm m². Nhưng `road_len_*`, `n_poi_*` và các `*_frac` lớp phủ đo trên **toàn ô**, còn
`population` chỉ đếm pixel **trong** ranh giới. Nên một ô nằm 99,99% ở tỉnh khác vẫn kéo
theo toàn bộ đường và POI của tỉnh đó vào bảng Hà Nội, với dân số gần bằng 0.

**Đo được.** 27 ô có `area_frac < 0,01` mang **139,9 km đường**; cắt đúng theo ranh giới thì
còn **0,29 km** — tức **99,8%** là đường của tỉnh khác. Ô cực đoan nhất, `88415dd859fffff`,
có `area_frac = 0,000054` (0,005% ô nằm trong Hà Nội) nhưng mang 5.874 m đường.

**Quyết định.** Bỏ chúng khỏi lưới báo cáo. Giá phải trả: **78,5 người** trên 8,83 triệu
(0,0009%) và **0 trạm sạc**. Phần dân đó **không** biến mất im lặng — nó được đo, ghi ở
`data/qa/s04_population.json` (`population_in_excluded_sliver_cells`), và phép kiểm tổng dân
số ở B10 cộng lại đúng bằng con số đó.

**Vì sao không cắt luôn đường/POI theo ranh giới cho nhất quán.** Vì cắt cứng **sai về chức
năng**: con đường cách ranh giới 200 m vẫn chở người trong ô đi sạc. Ranh giới hành chính
không chặn được xe. Nhưng chênh lệch giữa hai quy ước phải **đo được** chứ không âm thầm —
đó là việc của cột kiểm chứng `road_len_in_hanoi_m` (3,87% tổng chiều dài nằm ngoài ranh
giới, và nó dồn vào ô biên).

**Hệ quả cho người dùng.** **Đừng chia hai trường khác quy ước cho nhau ở mức ô.** Trước khi
bỏ 27 ô này, 147/289 ô biên có dân bị lệch `road_len_m / population` quá 20% (trung vị −21%,
p10 −83%), trong khi ô `INSIDE` lệch 0,0%. Muốn tỉ lệ trên đầu người thì lên **cấp xã**, nơi
`area_frac` không còn nghĩa.

---

## §6 (sửa đổi) — Bỏ hẳn trường thời gian, chỉ phát mét

Bản trước phát `drive_time_station_min`, tính từ `DEFAULT_KPH` — bảng 7 con số km/h đặt tay
theo cấp đường, vì chỉ **2.685/240.212 đoạn (1,1%)** có tag `maxspeed`.

**Kiểm độ nhạy đã chạy** (`analysis/a02_speed_sensitivity.py`), sáu kịch bản:

| Cặp | Spearman | Đổi nhóm 3/5/10 phút (thô) | …sau khi chuẩn hoá trung vị |
|---|---|---|---|
| ×0,7 vs ×1,3 | **0,9964** | 62,0% | 3,5% |
| gốc vs bảng phẳng 30 km/h | 0,9697 | 21,0% | 14,0% |
| gốc vs **bỏ hẳn tag maxspeed** | **0,9991** | 0,6% | 1,1% |

**Ba kết luận, và chỉ kết luận thứ ba là lý do bỏ trường:**

1. *Xếp hạng* theo thời gian **bền** — ρ = 0,9964 giữa hai bảng cách nhau gần gấp đôi.
2. *Ngưỡng phút tuyệt đối* **không bền** — 62% ô đổi nhóm. "Trong vòng 5 phút" không phải
   một phát biểu có nội dung.
3. Bỏ hẳn tag `maxspeed` đi thì ρ vẫn **0,9991**. Nghĩa là 1,1% tag kia **không đóng góp gì**;
   câu trung thực không phải "98,9% dùng giả định" mà là **"100% là giả định"**.

Điểm 3 làm trường này thành một **hằng số nhân của trường mét, che sau một cái tên gợi ý
rằng nó đo thời gian thật**. Mà mét thì không có tham số nào — nó đo trên chính hình học
đường. Nên trường thời gian bị bỏ, cùng với `DEFAULT_KPH` và `LINK_KPH`.

**Cái không mất đi:** phân cấp đường vẫn mang thông tin (bảng phẳng làm rơi top-200 xuống
0,83). Nó vẫn nằm ở `road_len_<class>_m`. Chỉ có phép quy đổi ra phút là bị bỏ.

---

## §7 (sửa đổi) — Bỏ trường `buildable`

Bản trước: `buildable = built_frac ≥ 0,05 AND water_frac ≤ 0,50`. Ba lý do bỏ, xếp theo mức
nghiêm trọng:

**1. Nó loại nhầm trạm đang chạy thật.** 44/1.333 ô có trạm sạc đang vận hành bị gán
`buildable = false` (3,3% số trạm, 3,8% số cổng). Có trạm đang cắm điện nghĩa là chỗ đó xây
được — không cần bàn thêm. Muốn giữ 99% trạm thì ngưỡng phải hạ xuống **0,01**, tức gần như
không lọc gì.

**2. Không có "vai" tự nhiên.** Quét ngưỡng 0 → 0,5 bước 0,01, hàm `n_buildable` **trơn**:
4.282 → 2.961 → 2.362 → 1.469 ở các mốc 0 / 0,05 / 0,10 / 0,20, mỗi bước lấy đi đều đặn
60–120 ô. 0,05 không hơn gì 0,04 hay 0,07 về cơ sở; nó chỉ là một con số tròn.

**3. Lệch niên đại có hệ thống.** Ảnh ESA WorldCover là **2021**, dùng cho Hà Nội **2026**.
Phép kiểm tự mâu thuẫn: **77/1.333 ô có trạm (5,8%)** bị gắn không-xây-được. Điểm mù không
ngẫu nhiên — nó dồn vào vành đai ven đô mới xây, đúng vùng đáng quan tâm nhất.

Các trường `*_frac` vẫn phát bình thường. Ai cần ngưỡng thì tự đặt và **tự chịu trách nhiệm
về lựa chọn đó** — thay vì thừa hưởng một lựa chọn của người khác mà không biết.

---

## §8 (sửa đổi) — Lưới điện ngoài phạm vi

`dist_substation_m` đã bị bỏ, và **không có trường thay thế**.

**Đo được:** 133 trạm biến áp gắn tag OSM cho cả AOI = **25,3 km²/trạm**. Một trạm biến áp
làm láng giềng gần nhất cho tới **236 ô**; 5 trạm đông nhất phủ **18,6%** lưới; 9 trạm không
phục vụ ô nào. Đó là dạng "lớp thưa giả tạo": trường không đo *khoảng cách tới lưới điện* mà
đo *khoảng cách tới điểm gần nhất trong một mẫu 133 điểm mà OSM tình cờ có tag*.

**Quyết định phạm vi (thống nhất với khách hàng):** khả năng đấu nối lưới — trạm biến áp,
kVA khả dụng, công suất trạm — nằm **ngoài phạm vi** bài toán. Bộ dữ liệu chỉ mô tả công
suất **trên trụ**: `power_kw_site`, `power_kw_max_port`, `connectors.power_kw`.

Đây là **ranh giới tuyên bố**, không phải lỗ hổng. Hai thứ đó khác nhau: lỗ hổng làm người
đọc mất niềm tin khi phát hiện; ranh giới tuyên bố cho người đọc biết chính xác họ đang cầm
cái gì.

**Bổ sung 2026-08-07 — web app vẽ VỊ TRÍ trạm biến áp, và điều đó KHÔNG đảo quyết định
trên.** `web/` ship một overlay điểm (`s03c_osm_substation.py` → `substations.geojson`,
xem `web/DESIGN.md` §11 M5). Ba điều giữ nguyên: không có trường `dist_substation_m`,
không có cột công suất/cấp điện áp nào (bước trích **cố ý không đọc** tag `substation=*`
và `voltage=*`), và bản đồ không vẽ bán kính phục vụ nào.

Vì sao n nhỏ giết trường mà không giết lớp: một **trường** phát một giá trị cho cả 4.400 ô,
nên mẫu 132 điểm bịa ra sự khác biệt giữa những ô mà thực ra ta không biết gì — đó chính là
"lớp thưa giả tạo" đo được ở trên. Một **lớp điểm** chỉ khẳng định đúng 132 điểm nó vẽ, và
chỗ trống của nó được nói thẳng ra bằng cảnh báo n nhỏ hiện trong giao diện *trước khi*
người xem bật lớp. Số đo lại từ PBF freeze 28/07/2026 là **132**, không phải 133: con số cũ
đếm một node nằm trong khuôn viên đa giác của chính nó thành hai đối tượng.

---

## §11 — `commune_kind` thay `urban_rural`

**Nghi ngờ ban đầu:** nhãn `urban_rural` kế thừa từ repo cũ, chưa ai kiểm lại; nghi nó là
một ngưỡng mật độ dân do ai đó đặt.

**Audit đã chạy, ba bước:**

1. **Nguồn pháp lý.** VNSDI (dữ liệu nhà nước, hiệu lực 16/6/2025) có `tenxa` với tiền tố là
   **loại hình đơn vị hành chính** theo quy định: toàn quốc Xã 2.621 · Phường 687 · Đặc khu
   13. Hà Nội: Xã 75 · Phường 51.
2. **Phép chuyển đổi của repo cũ.** Bảng chéo `commune_kind` × `urban_rural` trên **toàn bộ
   19.426 trạm toàn quốc**: `PHUONG` → urban (8.931), `DAC_KHU` → urban (104), `XA` → rural
   (10.339). **Không một ô nào lệch khỏi đường chéo.**
3. **Kết luận.** Không có ngưỡng mật độ ở bất kỳ khâu nào. Nhãn này là phân loại hành chính
   chính thức, mã hoá lại sang tiếng Anh.

**Quyết định.** Giữ nguyên nội dung, **đổi tên** thành `commune_kind` với giá trị `PHUONG` /
`XA` — dùng đúng từ của nguồn. Tên tiếng Anh "urban/rural" là thứ đã gợi ý sai rằng đây là
một ước lượng. Trường được **dựng lại** từ `commune_name` trong chính repo (chứ không chép
nhãn cũ), và B6 có phép kiểm `commune_kind_matches_inherited_label` đối chiếu 100% với nhãn
kế thừa.

**Ghi chú nên đọc kèm, vì nó là sự thật về Hà Nội chứ không phải lỗi:** ranh giới hành chính
"Xã" ở Hà Nội tụt sau mức đô thị hoá thực tế. Theo chuẩn DEGURBA (UN Statistical Commission
thông qua 3/2020: đô thị đặc ≥ 1.500 người/km², bán đặc ≥ 300), **1.298/1.734 trạm nằm trong
đơn vị "Xã" thực ra toạ lạc ở vùng mật độ đô thị**. Đó chính là vành đai chuyển đổi.

---

## §12 — A3: tâm hình học được giữ, và đây là con số phải nói kèm

**Quyết định: giữ tâm hình học làm điểm neo. Chấp nhận có điều kiện, không phải vì sai số
nhỏ.**

Mọi khoảng cách đo từ tâm hình học của lục giác r8. Dân trong ô không rải đều, nên tâm ấy
lệch khỏi *tâm dân số*. Đo bằng chính raster WorldPop 100 m mà `s04` dùng
(`analysis/a03_tam_o.py`, 4.313 ô có dân):

| | |
|---|---|
| độ lệch trung vị | **171,9 m** |
| p90 · max | 320,2 m · 524,4 m |
| **trung bình có trọng số dân** | **131,0 m** |
| so với khoảng cách tới trạm, trung vị | **7,5 %** |
| số ô lệch quá 20 % khoảng cách của chính nó | 481 ô — **1.305.379 người** |

**Tôi đã tự đặt tiêu chí bỏ qua là "trung vị < 150 m", và phép đo KHÔNG đạt (171,9 m).**
Ghi lại điều đó thay vì lặng lẽ đổi tiêu chí cho vừa kết quả.

Giữ vì ba lý do, xếp theo sức nặng:

1. **Chủ đầu tư đã chốt** rằng trọng số dân số sẽ giảm vai trò trong các bước sau. Sai số này
   đi vào kết quả qua đúng con đường ấy.
2. **Trọng số dân làm nó nhỏ đi**, không lớn lên: 131 m so với 171,9 m. Ô lệch nhiều là ô ven
   đô thưa dân — nơi dân dồn về một mép; ô đông dân thì dân trải đều nên tâm gần trùng.
3. **Sửa nó kéo theo một vòng lặp:** tâm dân số lấy từ WorldPop, mà WorldPop `CN` là bản
   *constrained* dùng built-up làm biến phụ trợ (§ A8). Neo khoảng cách vào tâm dân số là để
   một ước lượng quyết định điểm đo của một số đo — đúng loại vòng lặp bộ dữ liệu này đang
   tránh.

**Không được dùng bộ dữ liệu để làm gì:** khẳng định về một ô ĐƠN LẺ ở vành đai ven đô khi
chênh lệch cần phân biệt nhỏ hơn ~300 m. Ở mức xã trở lên thì sai số này trung hoà.

---

## §13 — L10 (kW khả dụng): bỏ, vì nó không phải khái niệm mới

**Quyết định: không dựng lớp "kW khả dụng".**

Khái niệm chỉ có nghĩa nếu = công suất lắp đặt × (1 − mức chiếm dụng). Rà lại thì nó rơi vào
đúng một trong hai nhánh, và cả hai đều không nên tồn tại:

- **Không có phần chiếm dụng** ⇒ nó chính là `power_kw_site` cuộn về ô — **trùng một trường
  đã có**, phạm nguyên tắc *một khái niệm một trường*.
- **Có phần chiếm dụng** ⇒ cần `util`, thứ chỉ phủ **9,9 % ô / 27,9 % dân**. Lớp sẽ rỗng trên
  hơn 90 % bản đồ, và một lớp bản đồ rỗng 90 % thì tệ hơn là không có.

Không có mã nào phải gỡ: L10 chưa từng được dựng. Mục này tồn tại để lần sau không ai đề xuất
lại nó mà không biết nó đã bị bác vì lý do gì.

Nếu sau này cần một lớp về công suất, hãy đặt câu hỏi khác — **cơ cấu** công suất (tỉ lệ
DC/AC, kW trên đầu người) là khái niệm riêng và không trùng trường nào đang có.

---

## §14 — A4/A5: hai sửa lỗi ở điểm neo, và một trường mới

### A5 — nhãn đúng, nên không đổi trường chính

`dist_station_network_m` chạy Dijkstra đa nguồn trên đồ thị **đảo chiều**. Trên 2,77 triệu
cạnh có hướng, không ai xác minh được bằng mắt là nó đo chiều nào. Kiểm bằng một phép tính
**không chia giả định nào** với `s08` — Dijkstra một nguồn từ chính đỉnh neo của ô, trên đồ
thị **gốc**, min qua các đỉnh-trạm — trên 50 ô (25 ô lệch nhất + 25 ô ngẫu nhiên):

```
lệch tối đa giữa phép độc lập và trường đang phát :  2,3 × 10⁻¹³ m
```

Nhãn đúng: trường đo **ô → trạm**, đúng chiều xe đi sạc.

**Bất đối xứng thì có thật nhưng hẹp:** trung vị 0 m, p90 152 m, **max 16.293 m**, 182 ô lệch
quá 500 m.

**Không phát cột `dist_from`.** Chiều về trùng chiều đi ở 95,7% số ô. Hai cột khoảng cách
gần y hệt nhau không thêm thông tin, nhưng **mời người đọc chia chúng cho nhau** và tạo ra
một tỉ số không ai định nghĩa. Thay vào đó phát đúng phần chênh: **`dist_station_asym_m`**.

**Không dùng khứ hồi làm trường chính.** Đo được là nó gần như không thêm gì: trung vị khứ
hồi = **0,999 × 2 ×** một chiều, Spearman 0,9965, top-200 thiếu hụt trùng 97,5%. Đổi lấy
việc phải viết lại mọi ngưỡng tuyệt đối × 2 là một vụ trao đổi tồi.

### A4 — điểm neo phải là nơi xe ĐI TIẾP ĐƯỢC

Điểm vào mạng trước đây chọn bằng "đỉnh gần nhất về hình học", không hỏi xe có đi tiếp được
không. **49 ô và 2 trạm neo trúng đỉnh có `SCC = 1`** — đầu cụt của đường một chiều, vào được
nhưng không ra được. Hai trạm đó là `C.HNO0528` và `C.HNO0529`, cùng một toạ độ, cách đường
31,7 m — không phải chỗ hẻo lánh nào cả.

Nay chỉ neo vào đỉnh thuộc **thành phần liên thông mạnh lớn nhất**:

| | trước | sau |
|---|---|---|
| ô tới được | 4.350 | **4.399** |
| trạm neo được | 884/886 | **886/886** |
| **ô đổi quá 500 m** | — | **0** |
| độ lệch neo thêm, trung vị | — | **0,0 m** |

Không đánh đổi gì: nó không dời điểm neo của ô vốn đã đúng, chỉ dời của ô vốn neo vào chỗ
chết. Phép kiểm `all_anchors_in_giant_scc` canh nó không quay lại.

**Lọc `access`.** Bỏ đoạn có `access` ∈ {private, no, customers, residents, delivery, permit}
— 2.014/240.212 đoạn. `destination` KHÔNG bị chặn: nó nghĩa là được vào nếu điểm đến nằm
trong, mà trạm sạc chính là điểm đến. Đổi 22 ô quá 500 m. Lọc không phải vì nó đổi nhiều, mà
vì phương án kia buộc ta bảo vệ câu *"ta cố ý dẫn đường qua lối đã ghi rõ là cấm"*.

Con số 0,838% cần đọc đúng: **không phải đường cấm hiếm, mà là OSM Việt Nam gần như không
gắn thẻ này.** Đây là hạn chế dữ liệu, không phải kết quả đo về thực địa.

### A4 — hai thứ CỐ Ý không làm

**Không bỏ cấp SERVICE.** Đổi 227 ô (5,3%), Spearman rơi còn 0,977. Và nhiều trạm nằm trong
bãi xe, tới được bằng chính đường service.

**Không hạn chế xuống "chỉ đường lớn".** Giả thuyết ban đầu là ô tô chỉ đi được đường lớn.
Đo: **886/886 trạm neo được ở cả bốn kịch bản** — trạm đúng là đều nằm cạnh đường lớn. Nhưng
**ô là nơi người ở, và người ở trong ngõ**: cắt xuống chỉ đường lớn làm **39,1% số ô** đổi
khoảng cách quá 500 m và Spearman rơi còn **0,831**. Đó là mô hình hoá một Hà Nội mà không ai
lái được xe về đến nhà.

**Lỗ còn để hở, khai báo:** `service=driveway|parking_aisle` không tách được vì `s03` không
trích thẻ phụ `service`. Muốn tách phải quét lại PBF. Không làm, vì ta đã quyết không bỏ cấp
SERVICE — nên phép tách chỉ phục vụ một giả thuyết không dùng tới.

### A13 — liên tục không gian: chỉ số, KHÔNG phải cổng PASS/FAIL

Bản đầu tôi đặt phép kiểm *"dưới 1% cặp ô kề được nhảy quá 2 km"*, rồi nó FAIL ở 6,7%. **Cả
hai con số đều do tôi bịa.** Hai ô r8 kề cách tâm ~0,8 km, nên nhảy trung vị 735 m là ĐÚNG về
hình học, không phải triệu chứng. Một ngưỡng tự đặt rồi tự phán là hỏng thì chính là lỗi §7
đã kết án ở trường `buildable`.

Chỗ nhảy phải được **giải thích**, không phải **đếm** (`analysis/a13_lien_tuc_khong_gian.py`):

| | |
|---|---|
| cặp nhảy lớn có `detour_ratio` > 2 | **75,2%** |
| đi vòng trung vị: cặp nhảy vs cặp thường | **2,43× vs 1,62×** |
| đối chứng mặt nước (sông/hồ) | 7,2% vs 5,9% — **chỉ 1,23×, yếu** |
| **chưa giải thích được** | **107 cặp = 0,86%** tổng số cặp kề |

Đối chứng "sông Hồng" mà tôi kỳ vọng hoá ra **yếu**; bằng chứng mạnh đến từ `detour_ratio`.
107 cặp còn lại có offset neo trung vị **187,9 m** so với 61,6 m toàn cục — tức ngay cả phần
dư cũng có nguyên nhân khả dĩ.

Lớp lỗi mà A13 vốn định bắt đã có phép kiểm **trực tiếp và không cần ngưỡng nào**:
`all_anchors_in_giant_scc`.

---

## §15 — L4 (áp lực cung): không thành cột của lưới

**Quyết định: không phát `supply_pressure` trong `grid_h3_r8`.**

Khái niệm thì đúng — khoảng cách trả lời *"gần đây có trạm không"*, áp lực cung trả lời
*"cái trạm đó có đủ to không"*. Một ô cách trạm 300 m với 2 cổng cho 20.000 dân đang được
bản đồ khoảng cách chấm là tốt, và đó là một câu nói dối.

Nhưng nó **không thành cột được**, vì hai lý do:

1. **Không kiểm chứng được.** Thứ duy nhất xác nhận được "áp lực cao" là mức sử dụng thật,
   mà `util_cell` chỉ phủ **9,9% ô / 27,9% dân**. Trên 90% bản đồ, cột này sẽ là một suy luận
   không ai kiểm được — đúng loại trường mà §7 vừa xoá.
2. **Nó cần hai ngưỡng tự đặt** (bán kính phục vụ, và mẫu số cổng-hay-kW) mà không có vai tự
   nhiên nào để neo vào. Xem lại bài học §7.

**Khái niệm không chết, nó đổi chỗ.** Engine sàng lọc đơn (L6) xử lý **một toạ độ mỗi lần** —
ở đó tính cung/cầu quanh đúng điểm đang xét là chuyện rẻ, và ngưỡng trở thành **tham số của
một quyết định cụ thể có người ký**, chứ không phải một cột phát cho mọi người dùng tương lai
tưởng là sự thật.

---

## §16 — L6: engine sàng lọc thành một lớp bản đồ (B12)

**Quyết định: dựng bộ rule khách hàng cung cấp thành hai cột, `screen_margin_m` và
`screen_decision`, và ĐÁNH DẤU RÕ chúng không phải số đo.**

Mọi cột khác trong `grid_h3_r8` mô tả Hà Nội và chỉ đổi khi Hà Nội đổi. Hai cột này đổi khi
**quy định** đổi. Trộn chúng vào một phân tích mô tả là lỗi loại nặng.

### Ba chỗ mơ hồ trong rule, và lựa chọn

| | Chọn | Vì sao |
|---|---|---|
| khoảng cách | **chim bay** | khách hàng chốt. Đo được: chim bay từ chối thêm **130/660** trạm (19,7%) so với mạng đường, và mọi lệch đều một chiều |
| cao tải 40% | **`util` trung bình cả cửa sổ 30 ngày** | đọc theo nghĩa đen của "40% thời gian chiếm dụng"; và nó PHÂN BIỆT ĐƯỢC (148 trạm = 23,4%) trong khi đỉnh khung giờ thì không (453 trạm = 71,7%) |
| "phải có DC" | **trạm XIN phải có DC** | ảnh hưởng nhỏ (5–10/660) nên chọn theo thiết kế: chỉ DC mới thật sự chia tải, và đó là điều kiện **người nộp đơn kiểm soát được** |

### Kết quả

`DE_XUAT` 1.782 ô · `DE_XUAT_NEU_CO_DC` 358 · `TU_CHOI` 2.260 (48,6% được đề xuất).
Phường 72% đề xuất · Xã 36% — đúng ý đồ của ngưỡng chặt hơn ở Xã.

### BA khoảng trống phải khai báo, không được để trong ghi chú cuối trang

1. **Bộ rule từ chối 41,4 – 73,5% trạm ĐANG VẬN HÀNH.** Khách hàng đã chốt "trạm hiện tại coi
   như đúng", nên đây không phải lỗi cần sửa — nhưng nó có nghĩa rule **cấm phần lớn cấu hình
   hiện tại của Hà Nội**. Hoặc đó là ý đồ (siết densification), hoặc ngưỡng chưa chuẩn.
   Ghi lại để lần sau không ai ngạc nhiên.

2. **Không có trạm "sắp vận hành".** Rule yêu cầu xét cả trạm đang xây / đã cấp phép. Nguồn
   evcs.vn chỉ phát trạm đang sống; khách hàng xác nhận chưa có danh sách. Khoảng trống này
   **lệch về một phía**: engine sẽ ĐỀ XUẤT đúng những chỗ sắp có trạm.

3. **Không tồn tại tập đơn thật.** Không có hồ sơ nào được duyệt hay bị từ chối để kiểm chứng
   đầu-cuối. Mọi hiệu chuẩn tới nay dùng **chính trạm đang vận hành làm đơn giả định** — đó là
   tập duy nhất có bằng chứng thực địa, nhưng nó không phải tập đơn.

---

## §17 — POI: dùng làm chỉ báo CÓ/KHÔNG, không làm thước đo mật độ

Nghiên cứu ở `notebooks/poi_chat_luong.ipynb`. Kết luận đổi cách bộ dữ liệu này được phép nói
về POI.

### Khuyết ĐÃ CHỨNG MINH, không phải suy đoán

| | |
|---|---|
| POI trên 1.000 dân | 2,34 |
| ô không có POI nào trong 1 km | **72,4%** |
| **dân sống ở những ô đó** | **3.124.090 = 35,4%** |
| ô > 5.000 người/km² mà 0 POI trong 1 km | 105 ô — 585.636 người |
| **xã/phường không có một cái CHỢ nào** | **60/126 = 47,6%** — 3,5 triệu dân |

Ở Việt Nam, gần một nửa số xã/phường không có chợ là điều **không thể đúng**. Đây là bằng
chứng trực tiếp, không cần nguồn ngoài.

### Thiên lệch KHÁC NHAU GIỮA CÁC LỚP — và đây mới là phát hiện quan trọng

Tỉ lệ POI/1000 dân của Phường so với Xã, theo từng lớp:

```
cây xăng  1,14×   trường học 1,24×   …   ngân hàng 16,6×   ăn uống 18,2×
```

Trải **16 lần**. Không có lý do thực địa nào giải thích được — cây xăng và quán ăn đều phục
vụ người ở cả hai nơi. Lý do nằm ở cách chúng ĐƯỢC VẼ: cây xăng to, thấy trên ảnh vệ tinh, ít
— vẽ hết được. Quán ăn nhỏ, nhiều, chỉ thấy khi có người đi bộ qua với điện thoại.

**Hệ quả: tỉ trọng thành phần KHÔNG chữa được thiên lệch này.** §L5 §3 chuyển từ số đếm sang
tỉ trọng để khử thiên lệch mật độ — đúng một nửa. Khi mỗi lớp lệch một mức khác nhau thì
chính **cơ cấu** cũng méo, và không phép biến đổi nào (kể cả CLR) chữa được.

Điều này giải thích ở tầng sâu hơn vì sao phân cụm POI ra đúng `commune_kind`. Và nó giải
thích vì sao **cây xăng** là chỉ báo dương mạnh nhất cho `util`: nó là lớp **ít méo nhất**.

### Nhưng quan hệ POI → nhu cầu KHÔNG phải hiện vật

| Nhóm trạm | ΔR² khi thêm POI | Spearman | p |
|---|---|---|---|
| vùng vẽ **KỸ** | +0,050 | +0,081 | 0,152 *(không có ý nghĩa)* |
| vùng vẽ **THƯA** | +0,026 | **+0,237** | **1,75 × 10⁻⁵** |

Nếu quan hệ là hiện vật của công sức vẽ, nó phải mạnh nhất ở nơi vẽ kỹ. Nó làm **ngược lại**.
POI đang hoạt động như **chỉ báo có/không về tính đô thị**, không phải thước đo mật độ nhu cầu.

### Luật dùng POI trong bộ dữ liệu này

| ✅ | ❌ |
|---|---|
| `n_poi_1km` như biến liên tục thô | cơ cấu / tỉ trọng giữa các lớp |
| ưu tiên lớp ít méo: cây xăng, trường học | lớp méo nặng: ăn uống, ngân hàng |
| vẽ kèm bản đồ độ phủ | vẽ mật độ POI một mình — nó vẽ **công sức lập bản đồ** |

**POI không đủ tư cách tham gia bất kỳ rule loại trừ nào của L6.** Một đơn ở vùng vẽ thưa sẽ
luôn trông "vắng POI", mà 35,4% dân Hà Nội sống ở vùng đó. Dùng POI để từ chối đơn là từ chối
theo **mức độ được vẽ bản đồ**, không theo thực địa.
