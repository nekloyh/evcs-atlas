# Quyết định — mở rộng phạm vi ra toàn quốc

Đi kèm `AUDIT_TOAN_QUOC.md` (bảng audit) và `DECISIONS.md` (quyết định gốc của bộ Hà Nội).
Mỗi mục dưới đây ghi **lựa chọn**, **số đo đỡ lưng nó**, và **cái đã bị loại kèm lý do**.

---

## 0. Nguồn: không cào lại gì cả

Kéo về từ hai repo đã có. Mở rộng từ 1 tỉnh ra 34 tỉnh làm **0 request mới** tới evcs.vn.
Lý do đơn giản và kiểm được: các bảng thượng nguồn **vốn đã là bảng toàn quốc**, bộ Hà Nội
chỉ lọc một phần của chúng ra.

| nguồn | quy mô toàn quốc đã có sẵn | dùng làm gì |
|---|---|---|
| `aGiang-evcs/data/interim/vnsdi/communes.parquet` | 3.321 xã · 34 tỉnh | chiều địa giới (§1) |
| `aGiang-evcs/data/interim/canonical/stations` | **19.805** trạm | lớp cung |
| `aGiang-evcs/data/interim/canonical/connectors` | — | cổng sạc |
| `aGiang-evcs/data/interim/occ/occ_station.parquet` | **19.426** trạm | mức sử dụng |
| `aGiang-evcs/data/interim/occ/occ_profile_168.parquet` | **2.742.912** dòng | nhịp 168 giờ |
| `aGiang-evcs/data/raw/osm/vietnam-latest.osm.pbf` | 325 MB, cả nước | POI + đường |
| `evcs-dataset/data/30_gold/stations/...` | 13.258 trạm, 9 nhà vận hành | **chỉ đối chiếu** (§5) |

WorldPop 2025 (`vnm_pop_*`) và ESA WorldCover (17 tile phủ cả nước) cũng đã đóng băng tại
chỗ, nhưng lần này không dùng — chúng thuộc lớp TÍNH TOÁN, ngoài phạm vi (§7).

Không có ràng buộc ToS nào bị đụng tới, nên không có gì phải hỏi ở mục này.

---

## 1. Niên bản địa giới: VNSDI 34 tỉnh / 3.321 xã, hiệu lực 16/6/2025

**Kiểm chứng bằng dữ liệu, không bằng trí nhớ.** Ba phép đếm độc lập trên chính file nguồn
cùng chỉ về cấu trúc SAU cải cách 01/7/2025:

```
3.321 dòng          = số đơn vị cấp xã chính thức sau sáp nhập
34 giá trị matinh   = số đơn vị cấp tỉnh sau sáp nhập
tiền tố tên         = 2.621 "Xã" + 687 "Phường" + 13 "Đặc khu"   (không còn quận/huyện)
ngayhieuluc         = 16/6/2025      ngayxuatban = 13/07/2025
```

Không có cấp huyện ở bất kỳ đâu trong file. Đây là cấu trúc mới, không phải cấu trúc 63 tỉnh.

### Khoá

| khái niệm | khoá | ví dụ |
|---|---|---|
| tỉnh/thành phố | `province_code` — 2 ký tự, từ `matinh` | `"01"` = Thành phố Hà Nội |
| phường/xã/đặc khu | `commune_code` — 5 ký tự, từ `maxa` | `"00004"` |

**Không bảng nào khoá bằng tên tiếng Việt.** Đo được: **246 tên xã** dùng ở nhiều hơn một
tỉnh; `"Xã Tân Tiến"` và `"Xã Tân Thành"` mỗi tên có mặt ở **7 tỉnh**.

**`commune_code[:2]` KHÔNG bằng `province_code`** — đo được **0,0%** khớp trên 3.321 dòng.
Mã xã VNSDI đánh số chạy toàn quốc, không lồng mã tỉnh. Suy mã tỉnh từ mã xã sẽ gán sai gần
như toàn bộ và im lặng, nên có một phép kiểm QA riêng canh đúng điều này.

### Loại đơn vị có BA giá trị

`PHUONG` · `XA` · `DAC_KHU`. Gói `hanoi` chỉ có hai (`startswith("Phường")` → `PHUONG`,
còn lại `XA`) — đúng ở Hà Nội vì Hà Nội không có đặc khu, sai ở 13 đơn vị trên toàn quốc.
Chỗ này không phải nhãn trang trí: ở `s12_screening` nhãn đó CHỌN ngưỡng khoảng cách
(500 m cho Phường, 2.000 m cho Xã), nên một tiền tố chuỗi đang quyết định chính sách cho
Phú Quốc, Côn Đảo, Vân Đồn…

### Đã loại, kèm lý do

* **`evcs-dataset/data/ref/vn_admin/valid_from=2025-07-01`** — ranh giới dựng từ OSM adm6.
  Chính `_admin_report.json` của nó ghi **3.930 đơn vị so với 3.321 chính thức (lệch 609)**
  và kết luận *"KHÔNG coi là danh mục HC chuẩn"*. Thêm nữa nó là dẫn xuất ODbL, ràng buộc
  phát hành khác dữ liệu nhà nước.
* **Cấu trúc 63 tỉnh trước sáp nhập** — hết hiệu lực 01/7/2025.

### Crosswalk sang cấu trúc cũ — để ĐỌC di sản, không để gán địa bàn

Cấu trúc cũ còn sống đúng **một** chỗ: khoá phân mảnh `province_code` (alpha-3 kiểu `HNO`,
`BNI`) của bảng canonical. `store/admin/crosswalk_province_legacy.parquet` dựng bằng ĐO —
đếm chéo khoá cũ với `admin_l1_code` mới trên chính 19.805 dòng đó:

```
65 mã cũ · 394 cặp (cũ → mới) · 44/65 mã cũ toả ra NHIỀU HƠN MỘT mã mới
mã "AC" là một sọt rác trải trên cả 34 tỉnh
```

Vì thế **crosswalk không phải công cụ lọc tỉnh**. Thẩm quyền gán địa bàn luôn là phép
điểm-trong-đa-giác trên VNSDI hiện hành. Kiểm được là nguồn đã làm đúng việc đó:
100% `commune_code` có trong VNSDI, và 100% `admin_l1_code` bằng `matinh` của xã tương ứng.

---

## 2. Vành đệm 5 km giữ nguyên, nhưng hệ số quy đổi thành HÀM của vĩ độ

`DECISIONS.md §2` chọn 5 km và lý do đó không đổi. Cái đổi là phép quy đổi mét → độ kinh.

Gói `hanoi` khoá cứng `111.320 × cos(21°) = 103.940 m`. Việt Nam trải từ ~8,4°N tới ~23,4°N:

| vĩ độ | 1° kinh (m) | sai số nếu dùng hằng số Hà Nội |
|---|---|---|
| 8,6°N (Cà Mau) | 110.073 | **5,9%** |
| 21,0°N (Hà Nội) | 103.940 | 0 |
| 23,4°N (Hà Giang) | 102.152 | −1,7% |

Nghe nhỏ, nhưng hằng số này là **MÉT**: ngưỡng "500 m" của engine sàng lọc trở thành
**529 m** ở cực Nam. Ở `vn/admin.py` hệ số tính theo vĩ độ tâm của chính hình được xử lý.

### Vành đệm chồng nhau — bất biến "cộng dồn phải lọc `IN`"

Ở một tỉnh, vành đệm là vùng ngoài. Ở 34 tỉnh, vành đệm của hai tỉnh kề nhau **chồng lên
nhau**, nên một trạm ở Bắc Ninh vừa là `BUFFER` của Hà Nội vừa là `IN` của Bắc Ninh.

Quy ước, và nó có phép kiểm chứ không chỉ có ghi chú:

| lớp | nhân bản sang tỉnh kề? | vì sao |
|---|---|---|
| trạm sạc | **có** (`scope='BUFFER'`) | phủ ở biên phải đúng: một trạm cách ranh giới 300 m vẫn phục vụ dân trong tỉnh |
| POI (cả hai lớp) | **không** | đây là lớp ĐẾM; nhân bản là cộng sai |
| đường | **có**, kèm cờ `in_province` | đây là lớp ĐỂ NHÌN; con đường bị cắt cụt ở ranh giới là hiện vật của cách lưu trữ, không phải sự thật về mặt đất |

Cộng dồn toàn quốc luôn lọc `scope='IN'` / `in_province = true`.

---

## 3. Không hằng số toàn quốc nào cho số dẫn xuất — tính lại từng tỉnh

`DECISIONS.md §3a` loại trạm 1-súng-AC và ghi *"71,8% số trạm nhưng 7% công suất"*.
**Đó là con số của Hà Nội.** Đo lại từ đầu trên 34 tỉnh, cùng vị từ, cùng nguồn:

| | nhỏ nhất | trung vị | lớn nhất | Hà Nội |
|---|---|---|---|---|
| tỉ lệ **số trạm** bị loại | 48,6% (Gia Lai) | 67,5% | **78,7%** (Bắc Ninh) | 71,8% |
| tỉ lệ **công suất** bị loại | 4,3% (Lâm Đồng) | 7,3% | **15,9%** (Cao Bằng) | 7,0% |

Trải 30 điểm phần trăm ở cột đầu và **3,7 lần** ở cột sau. Một hằng số 71,8% sẽ sai tới 30
điểm ở đầu kia của phân phối, và cột công suất — cột dùng để nói "loại 72% số trạm nhưng
chỉ mất 7% cung" — sai hơn hai lần ở Cao Bằng.

`vn/n10_quality.py` có một phép kiểm QA **cấm hằng số hoá**: nó FAIL nếu độ trải của tỉ lệ
này dưới 10 điểm phần trăm, tức nếu ai đó vô tình làm dữ liệu phẳng đi.

Cùng luật áp cho mọi con số dẫn xuất khác: quan hệ số trạm ↔ công suất
(`power_kw_per_station`, `ports_per_station`), mật độ trên đầu người, độ phủ POI. Tất cả
nằm trong `store/qa/provinces.parquet`, một dòng một tỉnh.

---

## 4. POI: chỉ phát ĐỘ PHỦ, không phát cơ cấu, không vào rule loại trừ

`DECISIONS.md §17` đã kết luận trên Hà Nội — POI OSM **khuyết có chọn lọc**: 35,4% dân sống
ở ô không có POI nào trong 1 km, 47,6% xã không có một cái chợ nào, và thiên lệch
Phường/Xã trải **16 lần** giữa các lớp. Ở toàn quốc điều đó chỉ nặng thêm, nên luật giữ
nguyên và không nới:

* **Cấm** dùng POI trong bất kỳ rule loại trừ nào.
* **Cấm** dùng cơ cấu / tỉ trọng giữa các lớp POI.
* Lớp POI nào cũng phải đi kèm số đo độ phủ.

Ba chỉ số phát cho **từng tỉnh**, để biết chỗ nào không được diễn giải:

| chỉ số | đọc thế nào |
|---|---|
| `share_communes_zero_poi` | phần xã/phường không có một POI nào trong OSM |
| `pop_share_communes_zero_poi` | phần **dân** sống trong những xã đó — con số quan trọng hơn |
| `poi_bias_phuong_vs_xa` | mật độ POI/km² ở Phường chia cho ở Xã. Nó **không đo mức đô thị hoá**; nó đo việc OSM vẽ nội thành kỹ hơn ngoại thành |

Cờ `POI_KHONG_DIEN_GIAI_DUOC` bật khi quá nửa số xã của tỉnh không có POI nào. Cờ đó
**không loại tỉnh** khỏi bộ dữ liệu — nó cấm đọc lớp POI của tỉnh đó như một thước đo.
Không bước nào trong pipeline đọc POI để quyết định gì.

---

## 5. Hai nguồn trạm: một nguồn CHÍNH, một nguồn ĐỐI CHIẾU — không gộp

| | `aGiang-evcs` canonical | `evcs-dataset` gold |
|---|---|---|
| số trạm | **19.805** | 13.258 |
| ảnh chụp | 2026-07-29 | 2026-07-20 |
| nhà vận hành | gần như chỉ VinFast (19.725 `VINFAST_CS` / 80 `OTHER`) | 9 nhà: V-GREEN 12.626, EBOOST 107, RABBIT-EVC 81, EV-ONE 68, CHARGE+ 27, EV-POWER 27, EVEREV 20, ETEK 1, UNKNOWN 301 |
| khoá địa giới mới | **có sẵn** (`admin_l1_code`, `commune_code`, gán bằng PIP trên VNSDI) | có `admin_l1_code` |
| telemetry 168 giờ | **có** | không |

**Chọn `aGiang` làm nguồn chính**: mới hơn, nhiều hơn, có nhịp sử dụng, và đã mang khoá địa
giới đúng niên bản.

**Không gộp hai nguồn.** Hai ảnh chụp khác ngày và hai dòng dõi khử-trùng-lặp khác nhau,
không có khoá vật lý chung — gộp là mời trùng lặp im lặng vào chính bảng cung. Thay vào đó
nguồn phụ được dùng làm **phép đo độ phủ nhà vận hành**: với mỗi trạm của nguồn phụ, tìm
trạm gần nhất trong nguồn chính; xa hơn 100 m thì tính là "chỉ có ở nguồn phụ". Kết quả
thành cờ `THIEU_NHA_VAN_HANH_KHAC` ở cấp tỉnh — một số đo về **cái bản đồ đang thiếu**,
không phải một dòng thêm vào bảng cung.

---

## 6. Chiều tỉnh KHÔNG mã hoá bằng hue — và cũng không bằng hình dạng

Ràng buộc: kênh **hue** đã đầy từ M3.5 (có số đo), kênh **hình dạng** gần cạn ở M5
(6 hình ●■◆▲✚★), **nét đứt** đã hẹn cho trạng thái vận hành trạm (M4.1), **vân** đã dành
cho overlay vùng.

**Lựa chọn: không mã hoá chiều tỉnh bằng kênh thị giác nào cả.** Tỉnh là một chiều
**PHẠM VI**, không phải một thuộc tính đọc trên bản đồ. Ba lý do, theo thứ tự sức nặng:

1. **Vị trí đã mã hoá nó rồi, và mã hoá hoàn hảo.** 34 tỉnh rời nhau về không gian theo
   đúng định nghĩa. Thêm màu hay hình cho tỉnh là **mã hoá trùng** — tốn một kênh khan
   hiếm để nói lại một điều bản đồ đã nói.
2. **34 hạng mục vượt xa sức của mọi kênh hạng mục.** Ngưỡng phân biệt được của hue là
   ~8–12 màu; hình dạng còn thấp hơn. Bảng màu 34 hạng mục là bảng màu không đọc được, dù
   có kênh trống hay không.
3. **So sánh giữa các tỉnh bằng mắt vốn đã không an toàn.** `computeClassing` chia bậc
   **phân vị trên chính dữ liệu đang nạp** (`web/src/viz/palette.ts`), nên cùng một màu
   nghĩa là giá trị khác nhau ở hai tỉnh. Từ chối mã hoá tỉnh cũng là từ chối một phép so
   sánh mà cách chia bậc không đỡ nổi.

**Thay bằng gì:**

| việc cần làm | kênh dùng |
|---|---|
| biết đang xem tỉnh nào | **văn bản** (tiêu đề + nhãn) và **khoá `tinh` trong URL** |
| ranh giới tỉnh trên bản đồ | **nét viền** của lớp bối cảnh — đã có sẵn cho ranh giới Hà Nội, chỉ đổi nguồn |
| màn hình đầu toàn quốc | đơn vị đọc là **chính tỉnh**: choropleth 34 đa giác, và khi đó **độ sáng của MỘT hue mang SỐ ĐO**, còn danh tính tỉnh vẫn do vị trí + nhãn mang. Đúng cơ chế lớp xã 126 đa giác đang chạy, chỉ đổi đơn vị |
| chuyển tỉnh | **lọc**, không phải tô: một tỉnh một lúc; tỉnh khác là bối cảnh xám không tô |

**Đánh đổi phải nói ra:** mất khả năng đặt ô của hai tỉnh cạnh nhau và phân biệt chúng bằng
mắt trong cùng một khung. Nếu sau này thật sự cần, kênh còn khả dĩ là **độ dày nét viền
ranh giới** (nhị phân: tỉnh đang chọn / không chọn) — nó không đụng hue, không đụng hình
dạng, không đụng nét đứt, không đụng vân. Nhưng nó chỉ mã hoá được **hai** trạng thái, tức
đúng bằng cái mà "lọc" đã cho, nên nó là cách nói khác của cùng một lựa chọn.

---

## 7. Phạm vi: toàn bộ lớp của bộ Hà Nội, cho cả 34 tỉnh

Lượt đầu cố ý dừng ở DATA + VISUAL DATA. Lượt sau dựng nốt lớp TÍNH TOÁN, nên store toàn
quốc giờ có **đúng bộ lớp** mà bộ Hà Nội có:

| lớp | bước | ghi chú |
|---|---|---|
| địa giới (tỉnh · xã · crosswalk · ranh giới) | `n01_admin` | |
| POI đếm-cầu (8 lớp) · POI visual (4 nhóm, giữ đa giác) · đường | `n02_osm` | hai lượt quét PBF cho cả nước |
| trạm · cổng · mức sử dụng · nhịp 168 giờ | `n03_supply` | |
| khung lưới H3 + nhãn xã + cung/POI/đường theo ô | `n04_grid` | |
| **dân số dasymetric** | `n05_population` | phát cả bản KHÔNG neo — xem dưới |
| **lớp phủ WorldCover** | `n06_landcover` | đọc theo dải, bộ nhớ bị chặn |
| **khoảng cách theo mạng đường (Dijkstra)** | `n07_distance` | đồ thị theo tỉnh có vành đệm |
| **engine sàng lọc** | `n08_screening` | đặc khu dùng ngưỡng của Phường |
| ghép thành `grid_h3_r8.parquet` + `commune.parquet` | `n09_assemble` | |

### Đối chứng bắt buộc: `vn/` chạy cho Hà Nội ra ĐÚNG số của `hanoi/`

Hai đường mã hoàn toàn khác nhau, cùng đầu vào. Toàn bộ bảng ở `AUDIT_TOAN_QUOC.md` §F;
điểm chính: dân số **8.831.125,9** trùng khít, `built_frac` 0,1804 trùng, sàng lọc
**1.782 / 358 / 2.260** trùng, khoảng cách trung vị lệch **0,2 m**. Chỗ duy nhất lệch là
8 đỉnh đồ thị trên 1,33 triệu, và nguyên nhân đã truy được: `vn` đệm theo vĩ độ tâm THẬT
của Hà Nội (~20,97°) còn `hanoi` khoá cứng 21,0°.

### Hai vết hỏng của VNSDI: ĐO, không sửa

**Vết 1 — `danso` sai bậc ở từng xã.** Luật bắt lỗi chuyển hẳn về `n01_admin` (52 xã có mật
độ công bố dưới 20 người/km²), và `n05_population` chỉ **đọc cờ**: xã bị gắn cờ thì KHÔNG
được neo, dùng thẳng WorldPop và đánh dấu ở `pop_source`. Một luật, một chỗ.

**Vết 2 — tổng `danso` toàn quốc lệch ~12% và lệch KHÔNG ĐỀU** (113.625.653 so với ~101
triệu). Đây không phải lỗi ở một xã nên không ngưỡng nào bắt được. Cách xử lý là **phát cả
ba**, không chọn hộ ai:

| cột | nghĩa |
|---|---|
| `population` | neo theo `danso` — số PHẢI đối chiếu được với văn bản nhà nước |
| `population_wp` | WorldPop thô, không neo — số ĐỘC LẬP với văn bản |
| `anchor_ratio` (theo xã) · `vnsdi_anchor_ratio` (theo tỉnh) | `danso / worldpop`. >1 nghĩa là số công bố cao hơn bề mặt WorldPop |

Không có phép kiểm PASS/FAIL nào cho `anchor_ratio`, và đó là chủ ý: nó đo một tính chất
của con số CÔNG BỐ, không đo một lỗi của pipeline. Đặt ngưỡng rồi tự phán là hỏng chính là
lỗi mà `DECISIONS §7` đã kết án ở trường `buildable`.

**Mật độ chia cho diện tích ĐO TỪ ĐA GIÁC**, không phải diện tích công bố — vì mật độ là
đại lượng TÍNH nên mẫu số của nó phải là số ĐO. Phường Phú Lợi (TP.HCM) công bố 17.956 km²
là bằng chứng đủ: chia cho số công bố sẽ cho mật độ 6 người/km² giữa lòng thành phố.

### Hai lỗi đã bắt được khi chạy toàn quốc, và cả hai chỉ lộ ra ở quy mô 34 tỉnh

**1. Luật "neo vào SCC lớn nhất" vứt 1,38 triệu người ở TP.HCM.**
Sau sáp nhập, TP.HCM = Sài Gòn + Bình Dương + Bà Rịa–Vũng Tàu, mà **Đồng Nai nằm chen
giữa** — lãnh thổ tỉnh **không liền mạch theo đường bộ** trong vành đệm 5 km của chính nó.
SCC lớn nhất là phần Sài Gòn; toàn bộ Vũng Tàu / Phú Mỹ / Bà Rịa rơi ra ngoài: **3.368 ô
mang 1,38 triệu người** bị gắn "không tới được", mỗi ô cách đỉnh SCC-lớn trung vị **31,8 km**
trong khi chính chúng có trung bình 2,5 km đường; 134/881 trạm không neo được.

Luật đúng là luật GỐC chứ không phải cách viết gọn của nó: `DECISIONS §14` nói về đỉnh có
`SCC = 1` — vào được, không ra được. `roadgraph.MIN_SCC_NODES = 100` giết đúng loại đó.
Sau khi sửa: TP.HCM **881/881** trạm neo được, ô tới được **60,5% → 92,9%**.
Hà Nội gần như không đổi (4.399 → 4.397 ô, trung vị 2.322,8 → 2.322,1 m) — hai ô rơi vào
một mạng đường cô lập gần hơn, và đó là câu trả lời đúng hơn cho chính hai ô đó.

**Khoảng trống còn lại, khai báo rõ:** ô ở Vũng Tàu giờ định tuyến tới trạm ở Vũng Tàu,
không tới trạm ở Sài Gòn qua Đồng Nai. Đường qua Đồng Nai có thật nhưng đồ thị của tỉnh
không chứa nó. Hết hẳn thì phải dựng đồ thị trên tỉnh + các tỉnh kề — một quyết định về chi
phí I/O, không phải một lỗi còn ẩn.

**2. Cờ chất lượng đầu tiên tôi thêm đã đo sai thứ.**
Bản đầu: "dưới 90% **Ô** tới được thì gắn cờ" — bắn ở **23/34** tỉnh. Truy ra thì nó không
đo mạng đường: 8.558 ô không tới được của Khánh Hoà là **Đặc khu Trường Sa**, của Đà Nẵng
là **Hoàng Sa**. Cờ đó thực chất đo *"bao nhiêu phần đa giác tỉnh là biển và núi"*.

Cùng dữ liệu, tính theo **DÂN**: 0,1–0,9% ở hầu hết tỉnh. Ngưỡng đổi sang
`MAX_POP_UNREACHABLE = 0,02` và cờ đổi tên thành `DAN_KHONG_TOI_DUOC_BANG_DUONG`, còn
**9/34** tỉnh — Cà Mau 10,7%, Cao Bằng 8,6%, Điện Biên 6,9%, Sơn La 4,1%. `%ô tới được`
vẫn phát ra như **bối cảnh**, nhưng nó không còn quyết định cờ nào.

Bài học chung của cả hai: *một ngưỡng đặt theo trực giác trên một tỉnh sẽ bắn nhầm ở 34
tỉnh, và cách phát hiện là nhìn xem CÁI GÌ bị bắn — không phải nhìn xem bao nhiêu cái.*

### Cái giá phải trả

`road_graph.parquet` (node_ids + toạ độ nguyên, cần cho Dijkstra) làm `store/p/` tăng từ
88 MB lên ~714 MB. Nó KHÔNG được ship cho web — web vẫn chỉ nhận bản hiển thị đã đơn giản
hoá. Giữ nó lại sau khi `n07` chạy xong là có chủ ý: chạy lại Dijkstra không phải quét lại
file PBF 325 MB.

## 8. Loại trừ tỉnh là quyết định có người ký, không phải bước làm sạch

`vn/n10_quality.py` chỉ **ĐỀ NGHỊ**, ghi ra `store/qa/exclusions.json` kèm số đo. Không bước
nào đọc file đó để bỏ tỉnh. Ngưỡng đặt tên, có lý do:

| ngưỡng | giá trị | lý do |
|---|---|---|
| `MIN_STATIONS` | 30 | dưới mức này không nói được gì ở cấp xã — một tỉnh 100+ xã mà 20 trạm thì mọi bản đồ theo xã là mảng trắng có vài chấm |
| `MIN_OCC_MEASURED_SHARE` | 0,50 | dưới một nửa số trạm đo được `util` thì lớp sử dụng là suy đoán, không phải quan sát |
| `POI_ZERO_COMMUNE_MAX` | 0,50 | quá nửa số xã không có POI ⇒ lớp POI không đọc được (**không** loại tỉnh, chỉ cấm diễn giải) |

### Quyết định 2026-08-07 (chủ dự án): GIỮ tỉnh, TẮT lớp

Bốn tỉnh chạm ngưỡng: **Điện Biên 0,0%** số trạm có `util` đọc được · **Sơn La 4,7%** ·
**Cao Bằng 10,0%** · **Lai Châu 16,7%** (Lai Châu còn chạm cả ngưỡng số trạm: 24 < 30).
Ngưỡng giữ nguyên 30 trạm / 50% đo được.

Không tỉnh nào bị loại. Thay vào đó, manifest của bốn tỉnh đó khai
`unusable_layers: [{layer: "occupancy", …}]`, và giao diện **ẩn hẳn** mọi trường mức sử dụng
cùng thanh scrubber. Lý do: lớp cung/POI/đường của chúng vẫn đo đúng — Sơn La có 64 trạm,
540 cổng, 17,6 MW — nên loại cả tỉnh là vứt dữ liệu tốt vì một lớp hỏng.

Đây là loại khuyết KHÁC với `missing_layers`, và khác ở chỗ nguy hiểm hơn: cột `util` **có
tồn tại**, truy vấn **chạy được**, và trả về gần như toàn null. Một bản đồ mức sử dụng gần
trống trông giống *"mức sử dụng thấp"* chứ không giống *"không đo được"*. Cột không tồn tại
thì nổ ngay và ai cũng thấy; cột tồn tại mà rỗng thì im lặng và người đọc tự bịa ra nghĩa.

**Kiểm được, đã chạy:** `#tinh=11` (Điện Biên) → không có scrubber, danh sách trường xã còn
6 (mất `util_mean_port_weighted`), 0 lỗi console. `#tinh=79` (TP.HCM) → có scrubber, trường
mức sử dụng phủ **89% xã · 91,7% dân**. Bộ Hà Nội gốc → 8 trường xã, phủ 93,7%, y như trước.

---

## 9. Hình dạng store

```
store/
  _state.json                              resume: một bản ghi cho mỗi cặp (bước, tỉnh)
  admin/
    provinces.parquet                      34 dòng · khoá province_code
    communes.parquet                       3.321 dòng · khoá commune_code · có quality_flag
    crosswalk_province_legacy.parquet       65 mã cũ → 34 mã mới, có cờ legacy_is_ambiguous
    boundary/<province_code>.geojson        ranh giới + vành đệm 5 km
  p/<province_code>/
    grid_cell.parquet                      khung lưới H3 r8 + nhãn xã + cung/POI theo ô
    grid_cell_commune.parquet              ma trận ô × xã (phần diện tích)
    stations.parquet                       scope ∈ {IN, BUFFER}
    connectors.parquet
    station_occupancy.parquet              util_pctl tính lại TRONG TỈNH
    station_occupancy_profile_168h.parquet
    poi_demand.parquet                     taxonomy 8 lớp — lớp ĐẾM, không nhân bản
    poi_visual.parquet                     4 nhóm, giữ đa giác — lớp ĐỂ NHÌN
    poi_commune.parquet                    POI theo xã, MỌI xã có mặt kể cả xã 0 POI
    roads.parquet                          hình học hiển thị + cờ in_province
  qa/
    n01_admin.json · n02_osm.json · n10_quality.json · n11_web_export.json
    <province_code>/n03_supply.json · n04_grid.json
    provinces.parquet                      bảng thống kê theo tỉnh
    exclusions.json                        ĐỀ NGHỊ loại trừ

web/public/data/
  provinces.parquet · provinces.geojson    chỉ mục 34 tỉnh — NGÂN SÁCH TẢI LẦN ĐẦU
  p/<province_code>/…                      tên file GIỐNG HỆT bộ Hà Nội + manifest.json
  <bộ Hà Nội cũ>                           KHÔNG đụng tới
```

### Ngân sách đã ĐO

| | giá trị |
|---|---|
| tải lần đầu (chỉ mục 34 tỉnh) | **0,32 MB** |
| một tỉnh — nhỏ nhất / trung vị / lớn nhất | **1,31 / 2,85 / 7,04 MB** (Huế / — / TP.HCM) |
| toàn bộ store cho web | 103,9 MB |
| store nguồn (`store/p/`) | 88 MB |
| p95 truy vấn DuckDB-WASM | xem bảng dưới |

p95 đo trong Chrome headless, bundle `eh` **đơn luồng** (đúng bundle app dùng), HTTP range
request trên chính file đã xuất, 15 lần/truy vấn sau 3 lần khởi động — `web/bench.html`:

| truy vấn | p95 nhỏ nhất | p95 lớn nhất |
|---|---|---|
| quét cả lưới cho một trường (đổi trường) | 2 ms | **9 ms** (Lâm Đồng, 29.763 ô) |
| gộp toàn lưới (bảng phủ) | 1 ms | 3 ms |
| một ô (panel Ô) | 3 ms | 9 ms |
| quét hồ sơ 168 giờ (scrubber) | 2 ms | **23 ms** (bộ Hà Nội gốc) |
| quét mạng đường (lớp M3-R) | 5 ms | **35 ms** (bộ Hà Nội gốc) |

Không truy vấn nào chạm 40 ms. Nút cổ chai của app không nằm ở DuckDB.

**Một bẫy đo, ghi lại để không ai mắc lại:** bản đo đầu tiên chạy năm truy vấn bằng
`Promise.all` và cho ra năm cột **bằng nhau tới từng mili giây** (45–53 ms ở mọi tỉnh).
Bundle này chạy MỘT worker, nên năm truy vấn song song xếp hàng và mỗi cái đo được tổng
thời gian của cả năm. Dấu hiệu nhận ra: các con số quá giống nhau trong khi khối lượng việc
chênh nhau hàng chục lần.

---

## 10. Web: shim, không phải UI mới

| việc | chỗ sửa |
|---|---|
| chọn tỉnh | khoá hash `tinh` — `web/src/data/province.ts` |
| đường dẫn dữ liệu | `dataPath()` bọc các hằng của `queries.ts`; **không hàm nào đổi chữ ký** |
| cột vắng | `manifest.available_columns` → `setAvailableColumns()` → `fieldsOfUnit()` lọc, và `gcol()` phát `NULL` trong SQL thay vì tên cột không tồn tại |
| khung nhìn ban đầu | `setInitialViewFromBbox()` từ bbox tỉnh, gọi TRƯỚC khi `store.ts` nạp (import động trong `main.tsx`) |
| lớp chỉ có ở Hà Nội | `substations.geojson`, `routes_showcase.geojson` → tập rỗng ở chế độ tỉnh, **vẫn nổ** ở bộ Hà Nội gốc |
| chế độ CÂU CHUYỆN | tắt khi `manifest.story_enabled === false` — hiện như "chưa dựng" (§3a), không bay tới một xã không tồn tại |
| `tinh` sống sót mỗi lần ghi hash | `serializeHash` chép lại từ `prev` — nếu không, thao tác đầu tiên xoá nó khỏi URL |

Đổi tỉnh là **tải lại trang**. Ba thứ bị khoá theo tỉnh từ lúc boot và không rút lại sạch
được: file đã đăng ký với DuckDB, manifest đã cache, và bậc màu phân vị tính trên chính dữ
liệu đang nạp. ~1 giây đổi lấy việc không có trạng thái nào của tỉnh A rò sang tỉnh B.

**Kiểm được, đã chạy:**

* `#tinh=96` → tiêu đề "EVCS · Tỉnh Cà Mau", khung nhìn `104,7580 / 8,8358 / z6,40`, canvas
  vẽ, **0 lỗi console**, danh sách trường ô còn **15/37** (đúng số cột có mặt).
* `#tinh=96&f=population` (cột không tồn tại) → **không nổ**; rơi về trường mặc định, và
  state được sửa theo nên hash không còn nói dối.
* Đường dẫn không có `tinh` → tiêu đề "EVCS Hà Nội", khung nhìn `105,8400 / 21,0000 / z9,30`
  — **đúng như trước, không đổi một hành vi nào**.

---

## 11. Màn hình CẢ NƯỚC XEM MỘT LẦN — `#tinh=vn`

Đến hết §10, store toàn quốc là **34 bộ dữ liệu rời**, mỗi bộ mở được một mình. Không bộ
nào trả lời được câu hỏi đầu tiên mà bất kỳ ai mở app cũng hỏi: *"cả nước trông ra sao"*.
Bộ chọn tỉnh cho **đi tới** một tỉnh; nó không cho **thấy** 34 tỉnh. Trả lời câu đó bằng dữ
liệu đang có nghĩa là tải 34 file lưới (158 MB) rồi tự cộng trong trình duyệt — đó không
phải một màn hình, đó là một lần build.

`n12_national` làm phép cộng đó **một lần, lúc build**.

### Bậc lưới: r6, và con số quyết định là số ô ở mỗi bậc

Lưới r8 toàn quốc có **417.185 ô duy nhất**. Ở mức phóng cả nước một ô r8 rộng **0,3 px** —
10 MB tải về để vẽ ra nhiễu. Đo trên chính dữ liệu này:

| bậc | số ô toàn quốc | bề rộng ô | rộng ở z5 | rộng ở z8 |
|---|---|---|---|---|
| r5 | 1.753 | ~15 km | ~6 px | ~48 px |
| **r6** | **9.813** | **~6,4 km** | **~2,6 px** | **~21 px** |
| r7 | 62.219 | ~2,4 km | ~1,3 px | ~8 px |

r5 đọc rõ ở đúng một mức phóng rồi hết (cả Hà Nội còn ~13 ô). r7 vẫn là nhiễu ở chính mức
phóng mà lớp này sinh ra để phục vụ. **r6 phục vụ được cả hai đầu** của quãng phóng mà màn
hình này sống trong đó: ở z5 thảm ô đọc như một mặt mật độ, ở z8 từng ô là vật thể chỉ tay
vào được. Chi tiết sâu hơn r6 không thuộc về màn hình này — nó thuộc về màn hình tỉnh, nơi
lưới r8 thật đã có sẵn.

### Cái gì cộng được, cái gì không

Đại lượng **quảng tính** (người, trạm, cổng, kW, mét đường, số POI) cộng thẳng qua các phân
mảnh, và **đó là đúng** dù 8.568 ô r8 nằm trong hai tỉnh: mỗi phân mảnh giữ phần ô nằm
trong tỉnh của nó, và n05 neo dân số theo tổng kiểm soát của chính tỉnh đó cho phần đó. Đo
được: **113.732.608 so với 113.625.653 công bố, lệch 0,09%**.

Cái **không** cộng thẳng được: `area_km2` là diện tích ô ĐẦY ĐỦ, phải nhân `area_frac`
trước (335.017 km² so với 333.530 km² hình học, lệch 0,44%). Và `*_frac` là **cường tính** —
tính lại bằng trung bình có trọng số diện tích, cộng vào là vô nghĩa.

Ba phép kiểm chặn lỗi gộp sai bậc, và cả ba PASS: trạm r6 = trạm theo tỉnh = bảng trạm
(6.380/6.380/6.380) · cổng r6 = cổng theo tỉnh (55.960) · không mã trạm nào trùng.

### Khung nhìn mặc định fit theo DÂN, không theo lãnh thổ

bbox lãnh thổ trải **102,1–117,8°E** vì Đặc khu Trường Sa đẩy mép đông ra thêm 7,7 độ. Fit
theo nó thì mở màn hình ra là thấy hai phần ba Biển Đông. `view_bbox` = bbox chứa **99,5%
dân** → `103,01 / 8,89 / 109,31 / 23,05`. Cắt theo dân chứ không theo một danh sách đặc khu
gõ tay: Trường Sa và Hoàng Sa rơi ra vì chúng gần như không có dân, và luật đó tự đúng khi
địa giới đổi. **Đảo vẫn được vẽ** — chỉ là chúng không quyết định khung hình đầu tiên.

### Ràng buộc §6 vẫn nguyên: hue chở SỐ ĐO, không chở danh tính tỉnh

Choropleth ở đây tô 34 đa giác theo **một đại lượng đo được**, đúng vai hue vẫn chở ở mọi
choropleth khác của app. Cái §6 cấm — và ở đây không làm — là cho 34 tỉnh 34 màu để phân
biệt **danh tính**. Danh tính tỉnh vẫn do **vị trí** mã hoá, nhãn vẫn là CHỮ, chọn tỉnh vẫn
là một `<select>`.

### Một lỗi đã bắt được: legend áp cực tính, bản đồ thì không

Bản đầu của `NationalMap` tô bằng `colorFor()`. Hàm đó đi thẳng qua `scaleColors` và
**không biết gì về cực tính**, trong khi legend gọi `rampFor(scale, polarity)`. Với trường
`high-good` (cổng trên 10 nghìn dân, số trạm, trạm đo được mức sử dụng) **legend đảo thang
còn bản đồ thì không** — hai thứ nói ngược nhau về cùng một tỉnh, và không có lỗi nào để
nhìn thấy. Sửa: bản đồ dùng đúng `rampFor` mà legend dùng.

### Ngân sách đã ĐO

| | |
|---|---|
| tải lần đầu (lưới r6 + bảng 34 tỉnh) | **0,52 MB** |
| trạm sạc (nạp lười, 6.380 trạm) | 0,27 MB |
| POI dạng chấm (nạp lười, 25.220 điểm) | 0,78 MB |
| 4 file GeoJSON POI (bàn giao dữ liệu, web không tải) | 13,8 MB |
| dựng lại cả lớp này | ~2 giây |

Hạ độ chính xác trước khi ghi kéo lưới từ 1,04 MB xuống **0,46 MB**: không cột nào mang
tới 15 chữ số có nghĩa (dân số là kết quả neo dasymetric, tỉ lệ lớp phủ đọc từ raster 10 m,
toạ độ là tâm ô tính lại được), nên float64 ở đây là **chở nhiễu đã nén** — và zstd không
nén được nhiễu.

---

## 12. Bốn nhóm POI xuất riêng ra GeoJSON

`web/public/data/vn/poi/<nhóm>.geojson`, toàn quốc, một file một nhóm — đúng bốn nhóm mà
`data/poi.ts` đã chốt và màn hình tỉnh đang vẽ.

| nhóm | tag | số điểm | có đa giác | dung lượng |
|---|---|---|---|---|
| `apartment` | `building=apartments`, `residential=apartments` | 5.962 | 5.766 (96,7%) | 3,3 MB |
| `mall` | `shop=mall`, `shop=department_store` | 1.377 | 238 (17,3%) | 0,5 MB |
| `public` | `leisure=park·playground·garden`, `amenity=community_centre` | 7.014 | 6.327 (90,2%) | 4,1 MB |
| `edu_health` | `amenity=hospital·school·university·college` | 10.867 | 9.141 (84,1%) | 5,9 MB |

**Hình học: đa giác khi có, điểm khi không, và `lat`/`lng` thì LUÔN có.** 85% đối tượng là
`way`/`relation` nên có đa giác thật; 3.748 cái là `node` và OSM chỉ cho một điểm. Tách hai
loại ra hai file thì bên đọc phải hợp hai file để trả lời một câu hỏi; bỏ đa giác thì mất
hình dạng (một trung tâm thương mại 4 ha đọc thành một chấm). Nên gộp một file, `geometry`
mang loại tốt nhất sẵn có, `properties.lat`/`lng` luôn mang điểm đại diện, và `has_polygon`
nói ra loại nào — để một phép đếm trên tập này không im lặng trộn "toà nhà 4 ha" với "một
điểm ai đó đánh dấu".

**Bản đồ cả nước KHÔNG đọc bốn file này** — nó đọc `vn/poi.parquet` (0,78 MB, chỉ toạ độ +
thuộc tính). Ở mức phóng cả nước một đa giác 4 ha vẽ ra đúng bằng một chấm, nên chở hình
học là trả 13,8 MB cho một hình dạng không hiện lên pixel nào. Cùng một tập đối tượng, cùng
số đếm — khác ở chỗ file nào trả lời được câu hỏi nào.

**Ràng buộc §4 vẫn nguyên.** Bốn file này là dữ liệu quan sát được, không phải một cơ cấu.
Rail của màn hình toàn quốc có khối `ĐỌC POI THẾ NÀO` chỉ thẳng sang trường **Xã KHÔNG có
POI nào** (4% → 56% giữa các tỉnh): ở tỉnh phủ kém, một ô ít POI nghĩa là **chưa ai vẽ**,
không nghĩa là chỗ đó vắng.

---

## 13. Ô H3 dưới `HEX_MIN_ZOOM`: vẫn VẼ, chỉ nói là đọc thô

Lỗi người dùng báo: *"khi hiện H3 thì ngoài dân số các trường kia đều phải zoom gần thì
layer mới hiện"*. Đo được và đúng như mô tả.

Nguyên nhân: `renderPlan` chỉ cho vẽ hex dưới z11 khi trường có cờ `surface: true`, mà
**đúng một trường trong 45 trường có cờ đó** (`population`). Cờ `surface` trả lời câu *"trường
này có gộp mượt được không"*; nó đã bị đọc thành *"trường này có được vẽ ở zoom thấp
không"* — hai câu hỏi khác nhau, và câu thứ hai không có lý do gì để phân biệt trường. Hậu
quả: mở một tỉnh ở khung nhìn mặc định (dưới z11) thì dân số hiện, còn chung cư · POI · trạm
trong ô · đường trong ô đều là **bản đồ trắng**.

Quyết định 2026-08-07 đã chọn hex-thay-vì-mặt ở zoom thấp cho `population` vì *"thà đọc khó
từng bậc màu còn hơn không thấy đường, ranh giới và các lỗ hổng"*. Lý lẽ đó không có chỗ nào
phụ thuộc `hasSurface` — nó áp cho mọi trường của ô.

Sửa: trên **BẢN ĐỒ**, mọi trường của ô vẽ hex ở mọi mức phóng. Phần đúng của §13a-1 được giữ
bằng cờ `Plan.coarse` — legend hiện `đọc thô · ô ~N px`, bấm được để phóng tới z11. Trong
một **CẢNH** thì luật cũ nguyên vẹn: cảnh chốt khung nhìn của chính nó, nên "quá xa để đọc" ở
đó là lựa chọn của người viết cảnh chứ không phải chỗ người xem tình cờ dừng lại.

Đổi ở một hàm thuần, ba test được viết lại quanh luật mới, **255/255 test PASS**.
