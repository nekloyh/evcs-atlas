# Bộ dữ liệu này KHÔNG nói được gì

Đọc trước mỗi lần trích một con số ra ngoài repo.

Mọi con số **theo tỉnh** ở `store/qa/`. File này chỉ nói LUẬT và những chỗ luật ấy bị giới
hạn. Con số cụ thể trong đây là ví dụ của tỉnh `01`, đo lúc chạy gần nhất — muốn số hiện
hành thì đọc `store/qa/`, đừng trích từ đây.

---

## Bảy giới hạn phải đọc cùng số liệu

**1 · "Trạm" nghĩa là trạm CÔNG CỘNG.** Trạm có đúng một súng và súng đó là AC — ổ cắm lắp
tại nhà — **không tồn tại** trong bộ dữ liệu. Bộ lọc theo CẤU TRÚC, không theo tên (chỉ
~64% mang tiền tố "Tư nhân").

Tỉ lệ bị loại **khác nhau theo tỉnh và không được hằng số hoá**: số trạm **48,6% → 78,7%**,
công suất **4,3% → 15,9%**. Ở Hà Nội là 71,8% số trạm / 7,0% công suất — đó là con số của
Hà Nội, không phải của cả nước.

**2 · Chỉ có MÉT, không có PHÚT.** Bộ dữ liệu không phát trường thời gian lái nào. Bỏ hẳn
tag `maxspeed` đi thì Spearman vẫn **0,9991** ⇒ trường thời gian là **100% giả định**, và
đổi bảng tốc độ ±30% làm **62% ô đổi nhóm ngưỡng** phút. → `DECISIONS.md`

**3 · Đường chim bay KHÔNG dùng để kết luận độ phủ.** `dist_station_euclid_m` là một khái
niệm riêng (dùng cho câu hỏi về **bố trí**), không phải bản dự phòng của khoảng cách mạng.

Sai số chỉ lệch **về một phía** — đường thật không bao giờ ngắn hơn chim bay — nên mọi
chênh lệch là dương tính giả, không có âm tính giả. Và tỉ lệ báo phủ nhầm ở 3 km **không
phải hằng số**: Hà Nội **25,5%**, TP.HCM 33,4%, Cà Mau **61,0%**. Đọc từ
`store/qa/<mã>/n07_distance.json`.

**4 · Không có lớp lưới điện.** Chỉ mô tả công suất **trên trụ**. Trạm biến áp là lớp **ĐỂ
NHÌN** — toạ độ và chỉ toạ độ. Không có `dist_substation_m`, không có cấp điện áp, không
có bán kính phục vụ, và cả ba **không được khôi phục**.

Cám dỗ lớn ở quy mô toàn quốc, đo lại từ PBF: trong **1.387** đối tượng `power=substation`
thô, **972 (70,1%) CÓ tag `voltage`** và 733 có `substation=*`. Thêm một cột là một dòng ba
từ. Hàng rào là `core.osm.SUBSTATION_CAM` + test (`tests/test_core_osm.py`) + một phép kiểm
chạy ở bước — không phải một câu trong tài liệu.

*(1.387 là số đối tượng thô; bảng phát ra có **1.384** sau khi gộp 3 node trùng nằm trong
chính đa giác của nó, và **1.380** mang `scope = IN` — 4 đối tượng còn lại nằm ngoài lãnh
thổ, trong vành đệm của tỉnh biên giới. Ba con số, ba phép đếm khác nhau; đừng sửa cái này
cho khớp cái kia.)*

**5 · Không có trường `buildable`.** Quét ngưỡng cho thấy hàm số-ô **trơn, không có vai** —
mọi ngưỡng tuỳ tiện như nhau — và ngưỡng từng dùng **loại nhầm 3,3% trạm đang vận hành
thật**. Ảnh lớp phủ là **2021** dùng cho 2026, điểm mù lệch có hệ thống vào đúng vành đai
ven đô mới xây. Các `*_frac` vẫn phát; ai đặt ngưỡng thì tự chịu trách nhiệm.

**6 · Cung gần như thuần một nhà mạng.** Hà Nội: **704/710** trạm là VinFast. Mọi kết luận
về "mức sử dụng mạng lưới" là kết luận về mạng V-GREEN, **không phải về thị trường**.

**7 · POI không dùng để từ chối một chỗ.** POI chỉ phát **ĐỘ PHỦ**, không phát cơ cấu, và
**không vào rule loại trừ nào**. Lý do đo được: **73,3% ô** có 0 POI trong bán kính 1 km,
và những ô đó chứa **35,6% dân số**. Thiên lệch giữa các lớp lên tới 16 lần. Một lớp khuyết
như thế nói về **độ phủ của OpenStreetMap**, không nói về nhu cầu.

---

## Bốn chỗ null CÓ NGHĨA — đừng đọc thành 0

| trường | null nghĩa là | KHÔNG phải |
|---|---|---|
| `util_cell` | ô không có trạm nào đo được | bận bằng 0 |
| `screen_decision` | không tính được khoảng cách | đã xét và từ chối |
| `detour_ratio` | chim bay dưới 200 m — dưới đó tỉ số là nhiễu | không đi vòng |
| `roads.dist_station_m` | đoạn không nằm trong mạng xe công chúng đi được | sát trạm |

`docs/COT.md` khai nghĩa null cho từng cột, sinh tự động từ schema.

## Ô không tới được — có thật, phải xử lý

`evidence_grade_distance` ở tỉnh 01 hôm nay: `OSM_NETWORK` 4.397 · `UNREACHABLE_NO_PATH`
**2** · `UNREACHABLE_NO_ROAD_ACCESS` **1**.

Ba ô đó có `dist_station_network_m` là null và `network_reachable` là false. Bất kỳ phép
cộng dồn nào cũng phải quyết định làm gì với chúng — mặc định của pandas là bỏ qua, và bỏ
qua trong im lặng là một quyết định chưa ai ký.

## Đồ thị đường dừng ở ranh giới tỉnh + vành đệm

Một ô ở Vũng Tàu định tuyến tới trạm ở Vũng Tàu, **không** tới trạm ở Sài Gòn qua Đồng Nai
— đường ấy có thật về vật lý nhưng đồ thị của tỉnh không chứa nó. Sai số bị chặn (trạm gần
nhất theo đường gần như luôn cùng phía) nhưng nó **có thật**. → `evcs/core/roadgraph.py`

## Bốn tỉnh có lớp mức sử dụng KHÔNG đọc được

`share_stations_measured` trải **0,0% → 96,9%**. Dưới 50%, `n10_quality` gắn cờ
`KHONG_DO_DUOC_SU_DUNG` và `n11` tắt lớp ở giao diện — **giữ tỉnh, tắt lớp**, không loại
tỉnh. Danh sách ở `store/qa/exclusions.json`.

Đây là dạng hỏng nguy hiểm hơn cột vắng: cột CÓ, truy vấn CHẠY, và trả về gần như toàn
null. Một bản đồ mức sử dụng gần trống trông giống "mức sử dụng thấp" chứ không giống
"không đo được".

## Hai vết hỏng của nguồn — ĐO, không sửa

* **`danso` sai bậc ở từng xã** — 52 xã toàn quốc công bố mật độ dưới 20 người/km². Xã bị
  gắn cờ thì **không được neo**, dùng thẳng WorldPop, và ghi ở `pop_source`.
* **`dientich_km2` sai bậc** — Phường Phú Lợi (TP.HCM) công bố **17.956 km²**, lớn hơn tỉnh
  lớn nhất nước.

Cả hai gắn cờ ở `commune.quality_flag`, **không sửa âm thầm**.

Và một vết ở tầng cao hơn: tổng `danso` toàn quốc là **113.625.653**, trong khi dân số Việt
Nam ~101 triệu. Sai ~12% và **không đều** giữa các tỉnh. Vì thế bộ dữ liệu phát **cả**
`population` (đã neo) lẫn `population_wp` (WorldPop thô) — neo mù sẽ thổi phồng đúng những
tỉnh sai nhiều nhất.

---

## Mười ba mũi phản biện đã chạy

Kết luận ở `data/qa/critique/*.json`, tái lập bằng `analysis/a01`…`a20`. Ba mũi đáng nhớ vì
chúng **bác chính giả thuyết của người viết**:

* **A11** — nhãn urban/rural tưởng do người viết bịa, hoá ra là ánh xạ xác định từ loại đơn
  vị VNSDI (19.426/19.426 khớp). Phán quyết đã rút; trường đổi tên thành `commune_kind` với
  **ba** giá trị `PHUONG` / `XA` / `DAC_KHU`.
* **A13** — ngưỡng "dưới 1% cặp ô kề nhảy quá 2 km" FAIL ở 6,7%, rồi đo ra rằng **cả ngưỡng
  lẫn tỉ lệ kỳ vọng đều do người viết bịa**. Nhảy trung vị 735 m ≈ đúng khoảng cách tâm hai
  ô r8. Thành chỉ số, không thành cổng PASS/FAIL.
* **A5** — nhãn chiều Dijkstra nghi sai; phép tính độc lập khớp tới **2,3 × 10⁻¹³ m**.
