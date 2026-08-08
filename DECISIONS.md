# DECISIONS

Mọi lựa chọn **không hiển nhiên** trong bộ dữ liệu này, kèm lý do và mức độ không chắc chắn.
Đọc trước khi thêm hoặc khôi phục một trường — phần lớn mục ở đây tồn tại để lần sau không
ai đề xuất lại một thứ đã bị bác mà không biết nó bị bác vì gì.

Số **theo tỉnh** đọc ở `store/qa/<mã>/`, không đọc ở đây. Con số trong tài liệu này là số
của **tỉnh 01 (Hà Nội)** trừ khi ghi khác, và có mặt để làm bằng chứng cho một lập luận —
không phải để trích ra ngoài.

Số § **cố định**. Mã nguồn và `web/DESIGN.md` trỏ vào chúng; đừng đánh số lại.

---

## 0. Lấy nguồn cho từng lớp

Thứ tự ưu tiên đã áp dụng: **(1) lấy lại từ repo cũ → (2) ev-crawl → (3) dựng mới**.

| Lớp | Quyết định | Vì sao |
|---|---|---|
| Ranh giới hành chính | **Lấy lại** VNSDI | Nguồn nhà nước, hiệu lực 16/6/2025, có `danso`+`dientich` kèm đa giác. §1 |
| Trạm sạc · cổng | **Lấy lại** `canonical/` | Đã gộp evcs.vn + registry VinFast, đã khử trùng lặp vật lý, đã sửa toạ độ placeholder. §3 |
| Occupancy | **Lấy lại** `occ/` | 18,6 triệu dòng, cửa sổ 30 ngày. Quét lại phải chờ đủ 30 ngày mới có cửa sổ tương đương. §5 |
| Dân số | **Lấy lại raster, dựng lại lớp** | Bốn bảng H3 phái sinh của repo cũ **không** dùng — dựng một lớp duy nhất neo VNSDI. §4 |
| Đường bộ | **Dựng lại từ PBF freeze** | Repo cũ chỉ có bảng đã cộng dồn, không có hình học ⇒ không dựng được đồ thị. §6 |
| POI | **Dựng lại từ PBF freeze** | Repo cũ lấy qua Overpass ngày khác với đường, cắt biên bằng bbox nên lọt 54,2% đối tượng ngoài phạm vi. §2 |
| Lớp phủ | **Dựng lại từ WorldCover** | Repo cũ chỉ tính cho 54,4% ô ⇒ không phân biệt "không xây được" với "chưa tính". §7 |
| Trạm biến áp | **Dựng lại từ PBF** | Cùng lượt quét với đường/POI, để ba lớp cùng một ảnh chụp OSM. §8 |
| Giá điện / OpEx | **Không đưa vào** | Tham số mô hình, không phải dữ liệu không gian |

**ev-crawl — vì sao không dùng.** Công cụ tốt, nhưng ba trường nó hứa đều đã có bản mạnh
hơn: trạng thái thời gian thực (ta có 30 ngày telemetry, không phải một lát cắt), ranh giới
từ GIS.vn (bên thứ ba — VNSDI thắng, §1), thời gian lái xe qua Google Routes (§6). Bản trích
Overpass 29/07/2026 của nó không dùng vì bản từ PBF freeze phủ rộng hơn và **cùng một ảnh
chụp** với lớp đường.

---

## 1. Ranh giới: VNSDI, không phải OSM, không phải GIS.vn

**Chọn** VNSDI hiệu lực **16/6/2025**: 34 tỉnh, 3.321 xã/phường/đặc khu.

**Loại** bảng `vn_admin` của repo cũ — mọi dòng có `boundary_source = "OSM"`, và cột `code`
của bảng xã **rỗng toàn bộ** nên không join được. Loại GIS.vn — bên thứ ba, cần token.

**Đối chứng (tỉnh 01):** diện tích công bố 3.359,77 km² so với đo lại từ đa giác 3.348,92 —
lệch **0,32%**, trong sai số làm tròn. 126/126 đa giác hợp lệ, hợp thành một khối liền.

Niên bản là một **khoá**, không phải một ghi chú: xem `CONTEXT.md`.

---

## 2. Phạm vi: đa giác chính thức + vành đệm 5 km

Hai vùng tách bạch, và sự tách bạch này là bắt buộc ở quy mô 34 tỉnh:

- `boundary` = đa giác hành chính — phạm vi **báo cáo**.
- `buffer` = nới **5 km** — phạm vi **thu thập**. Đối tượng ở đây mang `scope = 'BUFFER'` và
  **không** được báo cáo là thuộc tỉnh.

**Vì sao 5 km:** bán kính phục vụ là 3.000 m, hệ số đi vòng trung vị **1,48×** ⇒ 3.000 × 1,4
= 4.200, làm tròn lên 5.000.

> **Vành đệm hai tỉnh kề nhau CHỒNG nhau.** Mọi phép cộng dồn toàn quốc **phải lọc
> `scope = 'IN'`**, nếu không trạm biên bị đếm hai lần. Đây là cái bẫy số một của việc mở
> rộng từ 1 tỉnh lên 34.

**Cắt biên bằng đa giác thật, không bằng bbox.** `n02` loại 88.063 đối tượng nằm trong hộp
bao nhưng ngoài đa giác đệm (tỉnh 01). Repo cũ cắt bằng bbox và để lọt 54,2% POI — lỗi đó
không tái diễn được vì phép lọc là hình học.

**Ô cắt biên không bị làm tròn 0/1.** Mỗi ô mang `area_frac` = phần diện tích trong tỉnh.
Luật "tâm ô nằm trong tỉnh" gây lệch có hệ thống dọc biên.

### 2a. Loại ô vụn (`core.grid.MIN_AREA_FRAC = 0,01`)

**Vấn đề.** `road_len_*`, `n_poi_*` và các `*_frac` đo trên **toàn ô**, còn `population` chỉ
đếm pixel **trong** ranh giới. Một ô nằm 99,99% ở tỉnh khác vẫn kéo toàn bộ đường và POI của
tỉnh đó vào bảng, với dân gần bằng 0.

**Đo được (tỉnh 01).** 27 ô có `area_frac < 0,01` mang **139,9 km đường**; cắt đúng theo ranh
giới thì còn **0,29 km** — **99,8%** là đường của tỉnh khác.

**Giá phải trả:** 78,5 người trên 8,83 triệu và **0 trạm sạc**. Phần dân đó không biến mất
im lặng — đo và ghi ở `store/qa/<mã>/n05_population.json`, phép kiểm tổng dân cộng lại đúng
bằng nó.

**Không cắt luôn đường/POI theo ranh giới**, vì cắt cứng sai về chức năng: con đường cách
ranh giới 200 m vẫn chở người trong ô đi sạc. Nhưng chênh lệch giữa hai quy ước phải **đo
được** — đó là việc của cột đối chứng `road_len_in_province_m`.

**Hệ quả cho người dùng: đừng chia hai trường khác quy ước cho nhau ở mức ô.** Muốn tỉ lệ
trên đầu người thì lên **cấp xã**, nơi `area_frac` không còn nghĩa.

---

## 3. Trạm sạc: gán lại địa bàn bằng hình học, một trạng thái, một công suất

**Chọn:** `canonical/stations` lọc `is_primary` + `coord_resolved`, lọc theo đa giác, rồi
loại điểm sạc cá nhân (§3a).

**1 · Lọc theo đa giác, không theo `province_code`.** Repo cũ phân vùng theo mã 63 tỉnh
**trước** sáp nhập. Lấy tỉnh bằng khoá phân vùng ấy sai theo **cả hai chiều** — đo ở tỉnh 01:

| Cách lọc | Số trạm | Dương tính giả | Âm tính giả |
|---|---:|---:|---:|
| `province_code = 'HNO'` | 2.642 | **219 (8,3%)** — thật ra ở Thanh Hoá, Phú Thọ, Hà Tĩnh… | **98 (3,9%)** trạm Hà Nội mang mã tỉnh khác |
| Điểm-trong-đa-giác VNSDI *(trước §3a)* | **2.521** | 0 | 0 |

**Nhãn xã trong bảng cũ thì ĐÚNG** — phép tính lại trùng khớp 2.521/2.521. Bước này là một
**kiểm chứng độc lập đã pass**, không phải bản vá. Thứ sai là *khoá phân vùng file*.

**2 · Một trạng thái.** `status` · `is_operational` · `official_charging_status` đều là biến
thể của `op_status`. Giá trị `AllBusy` là tín hiệu bận **thời điểm** — thuộc lớp occupancy,
không phải trạng thái vận hành. Trộn hai thứ này là lỗi phân loại, không phải trùng lặp vô hại.

**3 · Một công suất điểm.** `nameplate_power_kw` = Σ nameplate từng súng, phóng đại **1,82×**
so với công suất tủ; giữ `power_kw_site` cộng theo tủ.

**Bỏ toàn bộ vết khử trùng lặp** (`dup_group_id`, `physical_id`, `lat_raw`, `coord_fix_dist_m`…):
bộ dữ liệu chỉ giữ bản chính nên chúng không trả lời được câu hỏi nào của người dùng cuối.

### 3a. Loại điểm sạc cá nhân: `n_ports == 1` **và** `current_type == 'AC'`

Trạm thoả **cả hai** bị coi như **không tồn tại** trong toàn bộ bộ dữ liệu.

**Vì sao:** cặp (đúng một súng, súng đó là AC) nhận diện **ổ cắm lắp tại nhà**. Đó là hạ tầng
khác hẳn về ca sử dụng, về ai được dùng, và về vai trò trong bài toán đặt trạm công cộng.

Nó làm hỏng đúng trường quan trọng nhất: `dist_station_network_m` đo tới **ổ cắm trong sân
nhà người khác** và báo là "đã có trạm gần".

**Tỉ lệ bị loại KHÁC NHAU THEO TỈNH và không được hằng số hoá:** số trạm **48,6% → 78,7%**,
công suất **4,3% → 15,9%**. Ở tỉnh 01 là 71,8% số trạm / **7,0%** công suất — một tập chiếm
gần ba phần tư số trạm nhưng một phần mười bốn công suất.

**Bộ lọc theo CẤU TRÚC, không theo tên.** Tên có vẻ nhận ra được (`Tư nhân <tên người>`)
nhưng chỉ **~64%** mang tiền tố đó; phần còn lại là `NQ Tư Nhân`, `Nhượng quyền`, `HKD`, hoặc
chỉ có tên người. Cặp (1 súng, AC) đo được, tái lập được, không phụ thuộc quy ước đặt tên.

**Null thì GIỮ.** `n_ports` hoặc `current_type` khuyết thì trạm được giữ: "không biết" không
phải "biết là cá nhân". `core.supply.is_private_ac` thực thi điều này bằng cách `fillna(False)`
**từng vế** — nên "null ⇒ giữ" đúng theo cấu trúc, không nhờ một nhánh `if` nhớ được.

**Loại ở CẢ vành đệm** — một ổ cắm trong sân nhà ở tỉnh bên cạnh cũng không phục vụ công cộng.
Loại một bên thì biên có hai luật.

**Loại ở `n03`, không ở tầng hiển thị.** Mọi bước sau đọc `stations.parquet`, nên một bộ lọc
duy nhất khiến occupancy, Dijkstra, cung theo ô, `util_cell` và bảng xã tự nhất quán. Lọc ở
tầng vẽ thì bản đồ hiện 3 chấm còn `n_stations` của ô ghi 12.

**Hệ quả phải biết:** mọi số ở §5 và §6 là số **sau khi loại**. `util_cell` phủ tụt (tỉnh 01:
29,8% → **9,9%** ô) vì phần lớn ô "có trạm đo được" trước đây là ô có một ổ cắm nhà dân.
Ngược lại chất lượng đo **tăng**: `occ_status = OK` từ 45,4% lên **96,2%**. Trường không
nghèo đi; nó thôi đếm nhầm.

Phép kiểm `no_private_ac_left` ở `store/qa/<mã>/n03_supply.json` bắt lỗi nếu bộ lọc sót.

---

## 4. Dân số: một trường, WorldPop 2025 neo theo VNSDI

**Chọn:** `population` = phân bổ dasymetric — bề mặt trọng số WorldPop 2025 R2024B 100 m,
tổng kiểm soát là `danso` từng xã của VNSDI.

**Loại và vì sao — đo trên chính lưới tỉnh 01:**

| Biến thể | Tổng | Ô có dân | Ô **có đường** mà dân = 0 | Phán quyết |
|---|---:|---:|---:|---|
| `pop` (WorldPop 2020 constrained) | 7.253.590 | 85,4% | **12,3%** | Loại — thấp hơn số chính thức 16,9% |
| `pop_2025` (R2024B thô) | 9.174.190 | 99,3% | 0,3% | Giữ làm **bề mặt trọng số** |
| **`population`** | **8.831.204** | **96,5%** | 0,3% | Neo tổng theo số chính thức |

**Vì sao 2025 làm trọng số chứ không phải 2020:** mặt nạ "constrained" của bản 2020 bỏ
**12,3%** ô có đường. Dùng nó làm trọng số thì dân của những ô ấy bị đẩy sang ô khác — đúng
chỗ ven đô đang đô thị hoá, tức đúng chỗ bài toán quan tâm.

**Phát CẢ `population` lẫn `population_wp`.** Tổng `danso` toàn quốc là **113.625.653**,
trong khi dân số Việt Nam ~101 triệu — sai ~12% và **không đều** giữa các tỉnh. Neo mù sẽ
thổi phồng đúng những tỉnh sai nhiều nhất, nên bản WorldPop thô đi kèm để so được.

### 4b. Xã có số công bố hỏng — thay thế CÓ KHAI BÁO

Toàn quốc **52 xã** công bố mật độ dưới 20 người/km² trên địa bàn có nhà cửa — lỗi mất chữ
số, không phải sự thật. Ví dụ ở tỉnh 01: Phường Lĩnh Nam khai `danso = 21` trên 10,86 km²
(WorldPop: 38.609).

**Xử lý:** xã ấy **không được neo**; dùng thẳng WorldPop và đánh dấu ở `pop_source`. Cổng
phát hiện đặt rất chặt (`danso < 1.000` **và** WorldPop > 10× `danso`) để chỉ bắt lỗi hiển
nhiên.

**Đây không phải impute âm thầm** — có cờ ở mức dòng, có kiểm ở mức bảng, có ghi ở tài liệu.
Nhưng nó **là** một can thiệp: cần tuyệt đối trung thành với bản công bố thì lọc
`pop_source == 'WORLDPOP2025_ANCHORED_VNSDI'`. **Không chắc chắn: trung bình.**

Cùng cơ chế bắt `dientich_km2` hỏng — Phường Phú Lợi (TP.HCM) công bố **17.956 km²**, lớn hơn
tỉnh lớn nhất nước. Gắn cờ ở `commune.quality_flag`, **không sửa âm thầm**.

---

## 5. Occupancy: một mức bận, phân vị tính trong LỚP THAM CHIẾU

Bảng nguồn có **~15 biến thể** của cùng khái niệm "mức bận". Giữ lại:

| Khái niệm | Giữ | Loại |
|---|---|---|
| Mức sử dụng trung bình | `util` | `occ_twa`, `occ_twa_hb`, `util_hb`, `occ_p50`, `load_factor` |
| Mức sử dụng đỉnh | `util_p95` | `occ_p95`, `occ_max`, `peakiness` |
| Tỉ lệ kín chỗ | `saturation_frac` | `hours_at_full` |
| Chất lượng quan sát | `grade` + `coverage` | `n_obs`, `resolved_h`, `max_gap_h`, `unobserved_frac`… |

`util_hb` là bản co ngót của `util` — cùng đại lượng, hai ước lượng. Giữ bản **thô** vì nó
cộng với `coverage` cho người dùng đủ thông tin để tự quyết có tin hay không; bản co ngót
giấu sự thiếu chắc chắn vào trong con số.

**`occ_pctl` tính lại thành `util_pctl`, và lớp tham chiếu được PHÁT KÈM.** Bản gốc là phân
vị trên lớp toàn quốc. Bản mới xếp hạng trong `<province_code>|<current_type>` — và chính
chuỗi ấy nằm ở cột `util_pctl_peer`. Thiếu nhãn là hai tỉnh bị so nhầm mà không ai thấy;
với 34 tỉnh, khả năng đó không còn là giả thuyết.

Trạm không đủ quan sát để xếp hạng để `null`, **không** điền 0.

**`util_denominator_ports` giữ có chủ đích.** Nó *không* cạnh tranh với `stations.n_ports`:
nó là mẫu số mà `util` đã được tính với, tức xuất xứ của `util`. Mẫu số là số cổng **lắp
đặt**, không phải số cổng đang báo cáo — trạm báo cáo thiếu sẽ hiện *thấp*, và đó là hướng
lệch an toàn.

---

## 6. Khoảng cách: dựng đồ thị OSM, phát MÉT và chỉ mét

**Chọn:** Dijkstra đa nguồn trên đồ thị đường bộ dựng từ PBF freeze, cạnh **có hướng** (tôn
trọng `oneway`, kể cả `oneway = -1`).

**Không dùng Google Routes** — hai lý do độc lập: không có key, và **kể cả có key cũng không
đủ**. Routes API tính theo cặp điểm; bộ dữ liệu cần khoảng cách từ 425.778 ô tới trạm gần
nhất. Google Routes hợp cho vài trăm tuyến minh hoạ, không hợp cho một lớp phủ toàn quốc.

### Trường thời gian đã bị BỎ HẲN

Bản đầu phát `drive_time_station_min` từ `DEFAULT_KPH` — bảng 7 con số km/h đặt tay, vì chỉ
**1,1%** đoạn có tag `maxspeed`. Kiểm độ nhạy (`analysis/a02_speed_sensitivity.py`):

| Cặp | Spearman | Đổi nhóm ngưỡng phút |
|---|---|---|
| ×0,7 vs ×1,3 | 0,9964 | **62,0%** |
| gốc vs **bỏ hẳn tag maxspeed** | **0,9991** | 0,6% |

Dòng thứ hai là lý do bỏ: bỏ hết tag `maxspeed` mà ρ vẫn 0,9991 nghĩa là 1,1% tag kia **không
đóng góp gì**. Câu trung thực không phải "98,9% dùng giả định" mà là **"100% là giả định"** —
trường ấy là một hằng số nhân của trường mét, che sau một cái tên gợi ý rằng nó đo thời gian
thật. Mét thì không có tham số nào; nó đo trên chính hình học đường.

Bỏ cùng với `DEFAULT_KPH` và `LINK_KPH`. **Không mất gì:** phân cấp đường vẫn mang thông tin
và vẫn nằm ở `road_len_<class>_m`; chỉ phép quy đổi ra phút bị bỏ.

### Hai đoạn ngoài mạng

Tâm ô → điểm vào mạng, và đỉnh đường → đúng vị trí trạm, được cộng vào theo đường thẳng. Bỏ
chúng thì khoảng cách mạng có thể ra **ngắn hơn đường chim bay** — vô lý về hình học; phép
kiểm `network_ge_euclid` bắt đúng lỗi đó trong lần dựng đầu (tỉ số nhỏ nhất 0,097).

Ba số hạng ấy — `Σ cạnh + soff + cd` — là định nghĩa đầy đủ của trường. Bỏ một là lệch.

### Vì sao Euclid không thay thế được

Tỉ số đường-mạng/chim-bay ở tỉnh 01: trung vị **1,477**, p90 2,317, max 109,6. Một hệ số bù
chung không sửa được, vì sai số lệch theo hình học đô thị (sông, cầu, đường một chiều), không
phân bố đều. **Và tỉ lệ báo phủ nhầm không phải hằng số giữa các tỉnh** — xem `HAN_CHE.md`.

Ô không tới được để **`null`**, có `evidence_grade_distance` riêng, **không** điền giá trị
lớn tuỳ tiện.

**Đồ thị dừng ở ranh giới tỉnh + vành đệm.** Một ô ở Vũng Tàu không định tuyến tới trạm ở
Sài Gòn qua Đồng Nai. Sai số bị chặn nhưng có thật — khai ở `HAN_CHE.md`.

---

## 7. Lớp phủ: phát `*_frac`, KHÔNG phát `buildable`

**Chọn:** ESA WorldCover 10 m v200 (2021), đốt chỉ số ô H3 vào chính lưới raster rồi đếm theo
lớp — phủ **100%** ô. Loại `buildable_h3`/`landuse_h3` của repo cũ: chỉ phủ 54,4% và 61,3% ô,
mà trên bảng như vậy "không xây được" không phân biệt được với "chưa tính".

### Trường `buildable` đã bị BỎ HẲN — ba lý do, xếp theo mức nghiêm trọng

**1 · Nó loại nhầm trạm đang chạy thật.** 44/1.333 ô có trạm đang vận hành bị gán
`buildable = false` (**3,3%** số trạm). Có trạm đang cắm điện nghĩa là chỗ đó xây được — không
cần bàn thêm. Muốn giữ 99% trạm thì ngưỡng phải hạ xuống 0,01, tức gần như không lọc gì.

**2 · Không có "vai" tự nhiên.** Quét ngưỡng 0 → 0,5 bước 0,01, hàm số-ô **trơn**: mỗi bước
lấy đi đều đặn 60–120 ô. 0,05 không hơn gì 0,04 hay 0,07 về cơ sở; nó chỉ là một số tròn.

**3 · Lệch niên đại có hệ thống.** Ảnh là **2021**, dùng cho **2026**. Điểm mù không ngẫu
nhiên — nó dồn vào vành đai ven đô mới xây, đúng vùng đáng quan tâm nhất.

Các `*_frac` vẫn phát bình thường. Ai cần ngưỡng thì **tự đặt và tự chịu trách nhiệm**, thay
vì thừa hưởng lựa chọn của người khác mà không biết.

> §7 là bài học được viện dẫn ở §15 và §13: một ngưỡng tự đặt trên một hàm trơn, rồi tự phán
> là "không xây được", là loại trường bộ dữ liệu này từ chối phát.

---

## 8. Lưới điện: NGOÀI PHẠM VI. Trạm biến áp là lớp ĐỂ NHÌN.

`dist_substation_m` đã bị bỏ, và **không có trường thay thế**.

**Đo được (tỉnh 01):** 132 trạm biến áp có tag OSM cho cả AOI = **25,3 km²/trạm**. Một trạm
làm láng giềng gần nhất cho tới **236 ô**; 5 trạm đông nhất phủ **18,6%** lưới; 9 trạm không
phục vụ ô nào. Đó là "lớp thưa giả tạo": trường không đo *khoảng cách tới lưới điện* mà đo
*khoảng cách tới điểm gần nhất trong một mẫu mà OSM tình cờ có tag*.

**Quyết định phạm vi (thống nhất với khách hàng):** khả năng đấu nối lưới — trạm biến áp,
kVA khả dụng, công suất trạm — nằm **ngoài phạm vi**. Bộ dữ liệu chỉ mô tả công suất **trên
trụ**: `power_kw_site`, `power_kw_max_port`, `connectors.power_kw`.

Đây là **ranh giới tuyên bố**, không phải lỗ hổng. Lỗ hổng làm người đọc mất niềm tin khi
phát hiện; ranh giới tuyên bố cho người đọc biết chính xác họ đang cầm cái gì.

**Không tạo trường kVA.** EVN không công bố. Trường không có nguồn thì không tồn tại trong bộ
dữ liệu — không có cột `null` để ai đó điền bừa sau này.

### Web vẽ VỊ TRÍ trạm biến áp, và điều đó KHÔNG đảo quyết định trên

`n13_substation` phát `substations.parquet` — **bảy cột**: `osm_type`, `osm_id`, `name`,
`lat`, `lng`, `province_code`, `scope`. Không `voltage`, không `substation=*`, không công
suất, không khoảng cách. Bản đồ không vẽ bán kính phục vụ nào.

**Vì sao n nhỏ giết TRƯỜNG mà không giết LỚP:** một **trường** phát một giá trị cho mọi ô,
nên mẫu thưa bịa ra sự khác biệt giữa những ô mà thực ra ta không biết gì. Một **lớp điểm**
chỉ khẳng định đúng những điểm nó vẽ, và chỗ trống được nói thẳng bằng cảnh báo n nhỏ hiện
*trước khi* người xem bật lớp.

**Cám dỗ ở quy mô toàn quốc, đo lại từ PBF:** trong 1.387 đối tượng `power=substation` thô,
**972 (70,1%) CÓ** tag `voltage` và 733 có `substation=*`. Thêm một cột là một dòng ba từ. Vì thế hàng rào là `core.osm.SUBSTATION_CAM`
+ test (`tests/test_core_osm.py`) + một phép kiểm chạy ở bước, chứ không phải mục này.

---

## 9. Cố ý KHÔNG đưa vào

| Không đưa | Vì sao |
|---|---|
| Cao độ / độ dốc | Chưa yêu cầu nào của bài toán dùng tới. Thêm vào là thêm nợ |
| Mật độ xe điện đăng ký | Không có nguồn chính thức |
| Trạng thái pháp lý đất | Không có nguồn. Repo cũ phát `UNKNOWN` trên 100% hồ sơ |
| Chỗ đỗ / diện tích / PCCC / lối vào | Chỉ có bằng khảo sát thực địa. Chưa khảo sát nào được thực hiện |
| Mét-làn đường | Biến thể của chiều dài, có trộn suy đoán số làn. Giữ chiều dài — số đo trực tiếp |
| Trạm đổi pin (BSS) | Bài toán là sạc ô tô. Trạm đổi pin phục vụ xe máy — khác loại nhu cầu |
| Điểm số / xếp hạng vị trí | **Đây là bộ dữ liệu nền, không phải kết quả mô hình.** Ngoại lệ có kiểm soát: §16 |

---

## 10. Điều còn mở

1. **Ảnh chụp lệch ngày.** VNSDI 16/6/2025 · PBF OSM 28/07/2026 · trạm + telemetry
   `evcs_vn_2026-07-29-full` · WorldCover **2021** · WorldPop chiếu 2025. Không lớp nào cũ hơn
   1 năm **ngoại trừ WorldCover**.
2. **Cung gần như thuần một nhà mạng** (tỉnh 01: 704/710 VinFast). Mọi kết luận về "mức sử
   dụng mạng lưới" là kết luận về mạng V-GREEN, không phải về thị trường.
3. **Ba khoảng trống chặn L6, nằm ngoài repo** — không sửa được bằng mã: (a) không có danh
   sách trạm sắp vận hành / đã cấp phép; (b) không có tập hồ sơ thật để kiểm chứng engine
   đầu-cuối; (c) không có văn bản pháp lý cho rule loại trừ đất đặc thù.
4. **Mâu thuẫn chưa giải:** chủ đầu tư chốt "trạm hiện tại coi như đúng", nhưng bộ rule §16
   từ chối 41,4–73,5% chính các trạm đó.

---

## 11. `commune_kind` thay `urban_rural`

**Nghi ngờ ban đầu:** nhãn `urban_rural` kế thừa từ repo cũ, nghi là một ngưỡng mật độ do ai
đó đặt.

**Audit A11 bác chính giả thuyết đó.** VNSDI có `tenxa` với tiền tố là **loại hình đơn vị
hành chính** theo quy định (toàn quốc: Xã 2.621 · Phường 687 · Đặc khu 13). Bảng chéo trên
**19.426/19.426** trạm toàn quốc: `PHUONG` → urban, `DAC_KHU` → urban, `XA` → rural — **không
một ô nào lệch khỏi đường chéo**. Không có ngưỡng mật độ ở bất kỳ khâu nào.

**Quyết định.** Giữ nội dung, **đổi tên** thành `commune_kind` với **ba** giá trị `PHUONG` /
`XA` / `DAC_KHU` — dùng đúng từ của nguồn. "urban/rural" là thứ đã gợi ý sai rằng đây là một
ước lượng. Trường được **dựng lại** từ nguồn trong repo, không chép nhãn cũ.

**Đọc kèm, vì nó là sự thật chứ không phải lỗi:** ranh giới "Xã" tụt sau mức đô thị hoá thực
tế. Theo DEGURBA, **1.298/1.734** trạm nằm trong đơn vị "Xã" thực ra toạ lạc ở vùng mật độ đô
thị. Đó chính là vành đai chuyển đổi.

---

## 12. Tâm hình học được giữ — và đây là con số phải nói kèm

Mọi khoảng cách đo từ **tâm hình học** của lục giác r8. Dân trong ô không rải đều nên tâm ấy
lệch khỏi *tâm dân số* (`analysis/a03_tam_o.py`):

| | |
|---|---|
| độ lệch trung vị | **171,9 m** |
| trung bình **có trọng số dân** | **131,0 m** |
| so với khoảng cách tới trạm, trung vị | 7,5 % |

**Tôi đã tự đặt tiêu chí bỏ qua là "trung vị < 150 m", và phép đo KHÔNG đạt.** Ghi lại điều
đó thay vì lặng lẽ đổi tiêu chí cho vừa kết quả.

Giữ vì ba lý do, xếp theo sức nặng:

1. **Chủ đầu tư đã chốt** rằng trọng số dân số giảm vai trò ở các bước sau — sai số này đi
   vào kết quả qua đúng con đường ấy.
2. **Trọng số dân làm nó nhỏ đi** (131 vs 171,9 m): ô lệch nhiều là ô ven đô thưa dân.
3. **Sửa nó tạo một vòng lặp:** tâm dân số lấy từ WorldPop, mà WorldPop constrained dùng
   built-up làm biến phụ trợ. Neo khoảng cách vào tâm dân số là để một **ước lượng** quyết
   định điểm đo của một **số đo**.

**Không được dùng để** khẳng định về một ô ĐƠN LẺ ở vành đai ven đô khi chênh lệch cần phân
biệt nhỏ hơn ~300 m. Ở mức xã trở lên thì sai số này trung hoà.

---

## 13. L10 (kW khả dụng): bỏ, vì nó không phải khái niệm mới

Khái niệm chỉ có nghĩa nếu = công suất lắp đặt × (1 − chiếm dụng). Nó rơi vào đúng một trong
hai nhánh, cả hai đều không nên tồn tại:

- **Không có phần chiếm dụng** ⇒ chính là `power_kw_site` cuộn về ô — **trùng một trường đã
  có**, phạm nguyên tắc *một khái niệm một trường*.
- **Có phần chiếm dụng** ⇒ cần `util`, thứ phủ ~10% ô. Lớp sẽ rỗng trên hơn 90% bản đồ, và
  một lớp bản đồ rỗng 90% thì **tệ hơn là không có**.

Không có mã nào phải gỡ — L10 chưa từng được dựng. Mục này tồn tại để lần sau không ai đề
xuất lại nó mà không biết nó bị bác vì gì.

Cần một lớp về công suất thì hãy hỏi câu khác: **cơ cấu** công suất (tỉ lệ DC/AC, kW trên đầu
người) là khái niệm riêng và không trùng trường nào đang có.

---

## 14. Hai sửa lỗi ở điểm neo, và một trường mới

### A5 — nhãn đúng, nên không đổi trường chính

Dijkstra đa nguồn chạy trên đồ thị **đảo chiều**; trên hàng triệu cạnh có hướng không ai xác
minh được bằng mắt là nó đo chiều nào. Kiểm bằng một phép tính không chia giả định nào —
Dijkstra một nguồn từ chính đỉnh neo, trên đồ thị **gốc**, min qua các đỉnh-trạm:

```
lệch tối đa giữa phép độc lập và trường đang phát :  2,3 × 10⁻¹³ m
```

Nhãn đúng: trường đo **ô → trạm**, đúng chiều xe đi sạc.

**Không phát cột `dist_from`.** Chiều về trùng chiều đi ở 95,7% số ô. Hai cột gần y hệt nhau
không thêm thông tin, nhưng **mời người đọc chia chúng cho nhau** và tạo ra một tỉ số không
ai định nghĩa. Thay vào đó phát đúng phần chênh: **`dist_station_asym_m`**.

**Không dùng khứ hồi làm trường chính:** trung vị khứ hồi = 0,999 × 2 × một chiều, Spearman
0,9965. Đổi lấy việc phải viết lại mọi ngưỡng tuyệt đối × 2 là một vụ trao đổi tồi.

### A4 — điểm neo phải là nơi xe ĐI TIẾP ĐƯỢC

Điểm vào mạng trước đây chọn bằng "đỉnh gần nhất về hình học", không hỏi xe có đi tiếp được
không. **49 ô và 2 trạm neo trúng đỉnh có SCC = 1** — đầu cụt của đường một chiều, vào được
nhưng không ra được, và hai trạm đó cách đường 31,7 m chứ không hẻo lánh gì.

Nay chỉ neo vào đỉnh thuộc **thành phần liên thông mạnh lớn nhất**
(`core.roadgraph.MIN_SCC_NODES`). Không đánh đổi gì: **0 ô** đổi quá 500 m, độ lệch neo thêm
trung vị **0,0 m** — nó không dời điểm neo của ô vốn đã đúng, chỉ dời của ô vốn neo vào chỗ
chết. Phép kiểm `all_anchors_in_giant_scc` canh nó không quay lại.

**Lọc `access`** ∈ {private, no, customers, residents, delivery, permit}. `destination`
**KHÔNG** bị chặn: nó nghĩa là được vào nếu điểm đến nằm trong, mà trạm sạc chính là điểm
đến. Lọc không phải vì nó đổi nhiều (22 ô), mà vì phương án kia buộc ta bảo vệ câu *"ta cố ý
dẫn đường qua lối đã ghi rõ là cấm"*.

Tỉ lệ đoạn bị chặn ~0,8% cần đọc đúng: **không phải đường cấm hiếm, mà là OSM Việt Nam gần
như không gắn thẻ này.** Hạn chế dữ liệu, không phải kết quả đo về thực địa.

### Hai thứ CỐ Ý không làm

**Không bỏ cấp SERVICE** — đổi 227 ô (5,3%), Spearman rơi còn 0,977, và nhiều trạm nằm trong
bãi xe chỉ tới được bằng chính đường service.

**Không hạn chế xuống "chỉ đường lớn".** Giả thuyết ban đầu là ô tô chỉ đi được đường lớn.
Đo: 886/886 trạm neo được ở cả bốn kịch bản — trạm đúng là đều nằm cạnh đường lớn. Nhưng **ô
là nơi người ở, và người ở trong ngõ**: cắt xuống chỉ đường lớn làm **39,1% số ô** đổi quá
500 m và Spearman rơi còn **0,831**. Đó là mô hình hoá một thành phố mà không ai lái được xe
về đến nhà.

### A13 — liên tục không gian: chỉ số, KHÔNG phải cổng PASS/FAIL

Bản đầu đặt phép kiểm *"dưới 1% cặp ô kề nhảy quá 2 km"*, rồi nó FAIL ở 6,7%. **Cả hai con số
đều do người viết bịa.** Hai ô r8 kề cách tâm ~0,8 km, nên nhảy trung vị 735 m là ĐÚNG về
hình học. Một ngưỡng tự đặt rồi tự phán là hỏng thì chính là lỗi §7 đã kết án.

Chỗ nhảy phải được **giải thích**, không phải **đếm**: 75,2% cặp nhảy lớn có `detour_ratio`
> 2 (đi vòng trung vị 2,43× so với 1,62× ở cặp thường). Đối chứng mặt nước mà người viết kỳ
vọng hoá ra **yếu** (1,23×). Còn **0,86%** cặp chưa giải thích được.

Lớp lỗi mà A13 định bắt đã có phép kiểm trực tiếp và không cần ngưỡng nào:
`all_anchors_in_giant_scc`.

---

## 15. L4 (áp lực cung): không thành cột của lưới

Khái niệm thì đúng — khoảng cách trả lời *"gần đây có trạm không"*, áp lực cung trả lời *"cái
trạm đó có đủ to không"*. Một ô cách trạm 300 m với 2 cổng cho 20.000 dân đang được bản đồ
khoảng cách chấm là tốt, và đó là một câu nói dối.

Nhưng nó **không thành cột được**:

1. **Không kiểm chứng được.** Thứ duy nhất xác nhận "áp lực cao" là mức sử dụng thật, mà
   `util_cell` phủ ~10% ô. Trên 90% bản đồ nó sẽ là một suy luận không ai kiểm được — đúng
   loại trường §7 vừa xoá.
2. **Cần hai ngưỡng tự đặt** (bán kính phục vụ, mẫu số cổng-hay-kW) không có vai tự nhiên nào
   để neo vào.

**Khái niệm không chết, nó đổi chỗ.** Engine sàng lọc (§16) xử lý **một toạ độ mỗi lần** — ở
đó ngưỡng trở thành **tham số của một quyết định cụ thể có người ký**, chứ không phải một cột
phát cho mọi người dùng tương lai tưởng là sự thật.

---

## 16. L6: engine sàng lọc thành hai cột, ĐÁNH DẤU RÕ không phải số đo

Mọi cột khác trong `grid_h3_r8` mô tả **địa bàn** và chỉ đổi khi địa bàn đổi. `screen_margin_m`
và `screen_decision` đổi khi **quy định** đổi. Trộn chúng vào một phân tích mô tả là lỗi loại
nặng.

### Ba chỗ mơ hồ trong rule, và lựa chọn

| | Chọn | Vì sao |
|---|---|---|
| khoảng cách | **chim bay** | khách hàng chốt. Đo được: chim bay từ chối thêm **19,7%** trạm so với mạng đường, và mọi lệch đều một chiều |
| cao tải 40% | **`util` trung bình cả cửa sổ** | đọc theo nghĩa đen; và nó PHÂN BIỆT ĐƯỢC (23,4% trạm) trong khi đỉnh khung giờ thì không (71,7%) |
| "phải có DC" | **trạm XIN phải có DC** | ảnh hưởng nhỏ nên chọn theo thiết kế: chỉ DC mới thật sự chia tải, và đó là điều kiện **người nộp đơn kiểm soát được** |

Ngưỡng ở `core.screening`: `NGUONG_M`, `NGUONG_DAC_KHU`, `CAO_TAI`. Một chỗ, không rải.

### Ba khoảng trống phải khai báo — không để trong ghi chú cuối trang

1. **Rule từ chối 41,4–73,5% trạm ĐANG VẬN HÀNH.** Khách hàng đã chốt "trạm hiện tại coi như
   đúng", nên đây không phải lỗi cần sửa — nhưng nó có nghĩa rule **cấm phần lớn cấu hình
   hiện tại**. Hoặc đó là ý đồ (siết densification), hoặc ngưỡng chưa chuẩn.
2. **Không có trạm "sắp vận hành".** Rule yêu cầu xét cả trạm đang xây / đã cấp phép; nguồn
   chỉ phát trạm đang sống. Khoảng trống này **lệch về một phía**: engine sẽ ĐỀ XUẤT đúng
   những chỗ sắp có trạm.
3. **Không tồn tại tập đơn thật.** Mọi hiệu chuẩn tới nay dùng **chính trạm đang vận hành làm
   đơn giả định** — tập duy nhất có bằng chứng thực địa, nhưng nó không phải tập đơn.

---

## 17. POI: chỉ báo CÓ/KHÔNG, không phải thước đo mật độ

### Khuyết ĐÃ CHỨNG MINH, không phải suy đoán

Ở tỉnh 01: **72,4%** ô không có POI nào trong 1 km, và **35,4%** dân sống ở những ô đó.
**60/126 xã/phường không có một cái CHỢ nào.** Ở Việt Nam, gần một nửa số xã không có chợ là
điều **không thể đúng** — bằng chứng trực tiếp, không cần nguồn ngoài.

### Thiên lệch KHÁC NHAU GIỮA CÁC LỚP — đây mới là phát hiện quan trọng

Tỉ lệ POI/1000 dân của Phường so với Xã, theo lớp: cây xăng **1,14×** · trường học 1,24× …
ngân hàng 16,6× · ăn uống **18,2×**. Trải **16 lần**.

Không có lý do thực địa nào giải thích được. Lý do nằm ở cách chúng ĐƯỢC VẼ: cây xăng to,
thấy trên ảnh vệ tinh, ít — vẽ hết được. Quán ăn nhỏ, nhiều, chỉ thấy khi có người đi bộ qua
với điện thoại.

**Hệ quả: tỉ trọng thành phần KHÔNG chữa được thiên lệch này.** Chuyển từ số đếm sang tỉ
trọng khử được thiên lệch *mật độ* — đúng một nửa. Khi mỗi lớp lệch một mức khác nhau thì
chính **cơ cấu** cũng méo, và không phép biến đổi nào (kể cả CLR) chữa được.

Nó cũng giải thích vì sao **cây xăng** là chỉ báo dương mạnh nhất cho `util`: nó là lớp **ít
méo nhất**.

### Nhưng quan hệ POI → nhu cầu KHÔNG phải hiện vật

| Nhóm trạm | ΔR² khi thêm POI | Spearman | p |
|---|---|---|---|
| vùng vẽ **KỸ** | +0,050 | +0,081 | 0,152 *(không có ý nghĩa)* |
| vùng vẽ **THƯA** | +0,026 | **+0,237** | **1,75 × 10⁻⁵** |

Nếu quan hệ là hiện vật của công sức vẽ, nó phải mạnh nhất ở nơi vẽ **kỹ**. Nó làm **ngược
lại**. POI hoạt động như chỉ báo có/không về **tính đô thị**, không phải thước đo mật độ nhu cầu.

### Luật dùng POI

| ✅ | ❌ |
|---|---|
| `n_poi_1km` như biến liên tục thô | cơ cấu / tỉ trọng giữa các lớp |
| ưu tiên lớp ít méo: cây xăng, trường học | lớp méo nặng: ăn uống, ngân hàng |
| vẽ kèm bản đồ độ phủ | vẽ mật độ POI một mình — nó vẽ **công sức lập bản đồ** |

**POI không đủ tư cách tham gia bất kỳ rule loại trừ nào của §16.** Một đơn ở vùng vẽ thưa sẽ
luôn trông "vắng POI", mà hơn một phần ba dân sống ở vùng đó. Dùng POI để từ chối đơn là từ
chối theo **mức độ được vẽ bản đồ**, không theo thực địa.

---

## 18. Hai nguồn trạm: một CHÍNH, một ĐỐI CHIẾU — không gộp

| | `aGiang-evcs` canonical | `evcs-dataset` gold |
|---|---|---|
| số trạm | **19.805** | 13.258 |
| ảnh chụp | 2026-07-29 | 2026-07-20 |
| nhà vận hành | gần như chỉ VinFast (19.725 / 80 khác) | 9 nhà: V-GREEN 12.626, EBOOST 107, RABBIT-EVC 81… |
| telemetry 168 giờ | **có** | không |

**Chọn `aGiang` làm nguồn chính**: mới hơn, nhiều hơn, có nhịp sử dụng, đã mang khoá địa giới
đúng niên bản.

**Không gộp.** Hai ảnh chụp khác ngày, hai dòng dõi khử-trùng-lặp khác nhau, không có khoá
vật lý chung — gộp là mời trùng lặp im lặng vào chính bảng cung.

Thay vào đó nguồn phụ thành **phép đo độ phủ nhà vận hành**: với mỗi trạm của nguồn phụ, tìm
trạm gần nhất trong nguồn chính; xa hơn 100 m thì tính là "chỉ có ở nguồn phụ". Kết quả thành
cờ `THIEU_NHA_VAN_HANH_KHAC` ở cấp tỉnh — một số đo về **cái bản đồ đang thiếu**, không phải
một dòng thêm vào bảng cung.
