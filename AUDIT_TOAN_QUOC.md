# Audit — mọi chỗ giả định "chỉ có Hà Nội"

Giai đoạn 1 của việc mở rộng phạm vi ra 34 đơn vị hành chính cấp tỉnh.
**Bảng này chỉ MÔ TẢ, không sửa gì.** Cột "cách sửa" nói việc phải làm; việc đã làm tới đâu
ghi ở cột cuối.

Đọc kèm `QUYET_DINH_TOAN_QUOC.md` (chốt niên bản địa giới) và `DECISIONS.md` (các quyết
định gốc của bộ Hà Nội — audit này không lật ngược quyết định nào trong đó, nó chỉ chỉ ra
chỗ nào của chúng gắn chặt vào MỘT tỉnh).

Ký hiệu ở cột trạng thái: **✔ đã làm** · **◐ đã làm ở `vn/`, `hanoi/` giữ nguyên** ·
**○ chưa làm (lớp TÍNH TOÁN, ngoài phạm vi lần này)**.

---

## A. Lõi không gian — nơi mọi thứ khác thừa kế giả định

| file:line | loại giả định | vỡ thế nào khi có 34 tỉnh | cách sửa | tt |
|---|---|---|---|---|
| `src/hanoi/aoi.py:24` | `HANOI_MATINH = "01"` là hằng số module; `boundary()`/`buffered()`/`communes()` là `functools.cache` **không tham số** | Không có đường nào hỏi AOI của tỉnh khác. Mọi bước import `aoi` đều bị khoá phạm vi ngay lúc import, nên "chạy cho tỉnh khác" không phải chuyện đổi tham số mà là chuyện sửa 12 file. | AOI thành hàm của `province_code`; cache theo khoá đó | ◐ `vn/admin.py` |
| `src/hanoi/aoi.py:28` | `_M_PER_DEG_LON = 103_940.0` — hằng số `111.320 × cos(21°)`, khoá cứng ở vĩ độ Hà Nội | **Hằng số này là MÉT.** Ở Cà Mau (8,6°N) một độ kinh dài 110.073 m, không phải 103.940 m — sai **5,9%**. Vành đệm "5 km" thành 5,3 km; và quan trọng hơn, ngưỡng "500 m" của engine sàng lọc (`s12`) thành **529 m** ở cực Nam. Sai lệch có HỆ THỐNG và tăng dần theo vĩ độ giảm. | tính hệ số theo vĩ độ tâm của chính hình được xử lý | ◐ `vn/admin.py:m_per_deg_lon` |
| `src/hanoi/roadnet.py:28-29` | cùng hai hằng số, dùng cho toạ độ mét của đồ thị đường và mọi trọng số cạnh | mọi khoảng cách Dijkstra ở miền Nam ngắn hơn thực tế ~5,9% | như trên | ○ |
| `src/hanoi/s09_grid_features.py:59-71` | `_len_m` dùng hai hằng số trên | `road_len_*_m` sai cùng tỉ lệ | như trên | ○ |
| `src/hanoi/grid.py:62-80` | `_hanoi_candidates()`, `hanoi_cells()`, `sliver_cells()`, `buffered_cells()` — tất cả `functools.cache` không tham số | Tập ô là một singleton toàn cục. Không có "lưới của tỉnh X". | tập ô là hàm của tỉnh | ◐ `vn/n04_grid.py` |
| `src/hanoi/grid.py:49-58` | `_cells_covering` gọi `h3shape_to_cells` trên đa giác THẬT đã nới 1 km | Với Hà Nội (126 xã) thì được. Đa giác Nghệ An hợp từ 130 xã có hàng chục nghìn đỉnh và chi phí đi theo SỐ ĐỈNH, không theo diện tích. | sinh ứng viên từ đa giác đã nới **rồi đơn giản hoá** (dung sai ≪ mức nới ⇒ vẫn là tập cha) | ◐ `vn/n04_grid.py:_candidates` |

---

## B. Chiều địa giới — khoá, mã, và loại đơn vị

| file:line | loại giả định | vỡ thế nào khi có 34 tỉnh | cách sửa | tt |
|---|---|---|---|---|
| `src/hanoi/s01_admin.py:90` | phép kiểm QA `single_province: set(province_code) == {"01"}` | Đây là một **khẳng định rằng bộ dữ liệu là của Hà Nội**, đóng dấu PASS. Chạy toàn quốc thì nó FAIL — đúng, nhưng nó nói sai chỗ hỏng. | kiểm "mọi dòng thuộc đúng tỉnh đang chạy" | ◐ `vn/n01_admin.py` |
| `src/hanoi/s06_occupancy.py:81-89` · `src/hanoi/s12_screening.py:70-74` | `commune_kind` suy bằng `commune_name.startswith("Phường")` → `PHUONG`, **còn lại là `XA`** | Hà Nội không có đặc khu nên luật hai nhánh đúng 100%. Toàn quốc có **13 đặc khu** (Phú Quốc, Côn Đảo, Vân Đồn, Cát Hải, Lý Sơn, Cô Tô, Kiên Hải, Phú Quý, Thổ Châu, Bạch Long Vĩ, Cồn Cỏ, Trường Sa, Hoàng Sa). Luật này dán nhãn `XA` cho cả 13. Ở `s12` nhãn đó CHỌN NGƯỠNG: đặc khu bị áp ngưỡng 2.000 m của Xã. Một quyết định quy hoạch do một tiền tố chuỗi quyết định. | ba nhánh `PHUONG`/`XA`/`DAC_KHU`, và lấy từ BẢNG chứ không đoán từ tên | ◐ `vn/n01_admin.py:commune_kind` |
| — (thiếu, không phải sai) | không nơi nào kiểm `commune_code[:2] == province_code` | Mã xã VNSDI **không lồng mã tỉnh** — đo được **0,0%** khớp trên 3.321 dòng. Bất kỳ ai suy mã tỉnh từ mã xã sẽ gán sai gần như toàn bộ, im lặng. | phép kiểm tường minh + cấm suy | ✔ `vn/n01_admin.py` |
| — (thiếu) | không nơi nào đo trùng tên xã | Đo được: **246 tên xã** được dùng ở nhiều hơn một tỉnh; "Xã Tân Tiến" và "Xã Tân Thành" mỗi tên có ở **7 tỉnh**. Khoá bằng tên là hỏng ngay từ dòng đầu tiên. | khoá bằng mã; đo trùng tên và để trong QA làm bằng chứng | ✔ `vn/n01_admin.py` |
| `src/hanoi/s05_stations.py:108-111` | `scope ∈ {HANOI, BUFFER, OUT}` | Vành đệm 5 km của hai tỉnh kề nhau **chồng lên nhau**. Một trạm ở Bắc Ninh là `BUFFER` của Hà Nội *và* `IN` của Bắc Ninh. Với 34 phân mảnh, cộng dồn ngây thơ sẽ đếm trùng ở mọi biên. | `scope ∈ {IN, BUFFER}` + khoá `province_code` + bất biến "cộng dồn phải lọc `IN`", có phép kiểm | ◐ `vn/n03_supply.py` |
| `src/hanoi/s06_occupancy.py:105-114` | `util_pctl_peer = f"HANOI\|{ct}"` — nhãn lớp tham chiếu khoá cứng | Lập luận của `s06` (phân vị chỉ có nghĩa trong lớp tham chiếu người đọc đang nhìn) vẫn đúng, nhưng nhãn phải nói TỈNH nào. Không có nó thì hai tỉnh bị so nhầm phân vị mà không ai thấy. | nhãn `"<province_code>\|<current_type>"` | ◐ `vn/n03_supply.py` |
| `data/interim/canonical/stations/province_code=*` (nguồn) | khoá phân mảnh là mã **63 tỉnh cũ**, alpha-3 (`HNO`, `BNI`…) | Không dùng được làm bộ lọc tỉnh: đo được **44/65** mã cũ toả ra nhiều hơn một tỉnh mới, và mã `AC` là một sọt rác trải trên **cả 34 tỉnh**. Ai lọc `province_code=HNO` để lấy Hà Nội sẽ lấy thiếu và lấy nhầm. | đọc cả bảng (4,9 MB) rồi lọc bằng hình học; phát crosswalk có đo để ĐỌC di sản | ✔ `vn/admin.py:crosswalk_legacy` |

---

## C. Ngưỡng và hằng số suy ra từ phân phối của Hà Nội

| file:line | loại giả định | vỡ thế nào khi có 34 tỉnh | cách sửa | tt |
|---|---|---|---|---|
| `src/hanoi/s04_population.py:49-50` | `IMPLAUSIBLE_DANSO_MAX = 1_000` và `IMPLAUSIBLE_WP_RATIO = 10` — hiệu chuẩn theo câu "xã thưa nhất Hà Nội vẫn ~328 người/km²" | Câu neo đó chỉ đúng ở Hà Nội. Toàn quốc có **52 xã** mật độ công bố dưới 20 người/km², nhiều xã miền núi thưa thật. Ngưỡng Hà Nội vừa bỏ sót lỗi thật vừa có nguy cơ gỡ neo nhầm xã thưa thật. | ngưỡng theo phân phối trong TỈNH, và tách "lỗi nhập liệu" khỏi "thưa thật" bằng đối chiếu hình học chứ không bằng một con số | ○ (lớp tính toán) |
| — (khuyết ở thượng nguồn) | `danso` của VNSDI được `s04` dùng làm **tổng kiểm soát** của lớp dân số | Tổng `danso` toàn quốc = **113.625.653**, trong khi dân số Việt Nam ~101 triệu. Sai số ~12% và **không đều**: Hà Nội 8,73 triệu (sát thực tế) nhưng An Giang 4,99 triệu so với ~3,6 triệu cộng từ hai tỉnh cũ. Neo dasymetric vào con số này sẽ thổi phồng dân số đúng ở những tỉnh sai nhiều nhất. | không neo mù; phát cả `danso` công bố lẫn nguồn thứ hai, và ghi rõ trường nào neo vào đâu | ○ (lớp tính toán) |
| — (khuyết ở thượng nguồn) | `dientich_km2` dùng làm mẫu số mật độ | **Phường Phú Lợi (TP.HCM) công bố 17.956 km²** — lớn hơn tỉnh lớn nhất nước, và một mình nó làm diện tích TP.HCM cộng lại thành 24.718 km² thay vì 6.762 km². Mọi tỉ lệ "trên km²" của TP.HCM sai gần 4 lần. | cờ chất lượng ở cấp xã, có tên lý do, không sửa âm thầm | ✔ `vn/n01_admin.py` (`DIENTICH_CONG_BO_SAI_BAC`) |
| `src/hanoi/s07_landcover.py:44-56` | `buildable` đã bị bỏ — **đây là quyết định ĐÚNG và nó tổng quát hoá tốt** | không vỡ. Ghi vào đây để không ai "khôi phục" nó khi mở rộng. | giữ nguyên | ✔ |
| `src/hanoi/s12_screening.py:58-60` | `NGUONG_M = {"PHUONG": 500, "XA": 2000}`, `CAO_TAI = 0.40` — do khách hàng chốt | Bản thân ngưỡng là chính sách, không phải thống kê, nên nó KHÔNG phải "hiệu chuẩn theo Hà Nội". Nhưng ngưỡng 40% đã được chọn vì nó *phân biệt được ở Hà Nội* (23,4% vs 71,7%). Ở tỉnh mà mức sử dụng thấp hơn hẳn, cùng ngưỡng có thể chọn ra 0 trạm. | giữ ngưỡng chính sách; ĐO độ phân biệt của nó theo từng tỉnh và báo cáo | ○ (lớp tính toán) |
| `src/hanoi/s05_stations.py` (số dẫn xuất) | "71,8% số trạm / 7,0% công suất" được nhắc như đặc trưng của bộ dữ liệu | **Đây là con số của Hà Nội.** Đo lại trên 34 tỉnh: tỉ lệ số trạm trải **48,6% (Gia Lai) → 78,7% (Bắc Ninh)**, tỉ lệ công suất trải **4,3% (Lâm Đồng) → 15,9% (Cao Bằng)**. Nâng nó thành hằng số toàn quốc là sai tới 30 điểm phần trăm. | tính lại từ đầu cho từng tỉnh; QA có phép kiểm cấm hằng số hoá | ✔ `vn/n10_quality.py` |

---

## D. Tên file, tên bảng, và hình dạng store

| file:line | loại giả định | vỡ thế nào khi có 34 tỉnh | cách sửa | tt |
|---|---|---|---|---|
| `src/hanoi/paths.py:30-33` | `RAW`/`PROCESSED`/`LAYERS`/`QA` là **bốn thư mục phẳng** | Store một-người-thuê. Không chỗ nào đặt được tỉnh thứ hai mà không ghi đè tỉnh thứ nhất. | `store/p/<province_code>/…` + `store/admin/` dùng chung | ✔ `vn/paths.py` |
| `data/raw/osm_hanoi_roads.parquet`, `osm_hanoi_poi.parquet`, `vnsdi_hanoi_communes.parquet`, `worldpop2025_hanoi_window.tif` | **tên file mang tên tỉnh**, đọc bằng chuỗi cứng ở `s09:82`, `s09:125`, `roadnet.py:49` | Đổi tỉnh phải đổi hằng chuỗi ở 3 file. Tệ hơn: hai tỉnh không cùng tồn tại được. | tên file không mang tỉnh; tỉnh nằm ở đường dẫn | ✔ `vn/` |
| `src/hanoi/s03_osm_extract.py:105` | quét file PBF 325 MB **một lần cho một tỉnh** (156 s) | 34 tỉnh × 2 lượt = **68 lượt giải mã cùng một file**, ~3 giờ chỉ để đọc lại. | quét **hai lượt cho cả nước**, mỗi đối tượng rơi thẳng vào phân mảnh của nó qua cây R 34 đa giác | ✔ `vn/n02_osm.py` |
| `src/hanoi/s10_assemble.py:44` | cổng chặn `want = set(grid.hanoi_cells())` | tập ô toàn cục; không ghép được bảng của tỉnh B | cổng chặn theo tỉnh đang chạy | ◐ (`vn/n04_grid.py` giữ bất biến tương đương) |
| `src/hanoi/s11_summary.py:46,93` | `scope == "HANOI"`; tiêu đề QA "bộ dữ liệu Hà Nội" | như mục scope ở phần B | — | ◐ |
| `Makefile:17-35` | không có tham số nào | không chạy được "một tỉnh" hay "N tỉnh" | CLI có `--tinh`, có resume | ✔ `python -m vn` |
| — (thiếu) | **không có resume** — `make all` là tất-cả-hoặc-không-gì | Ở một tỉnh (4 phút) thì không sao. Ở 34 tỉnh, đứt ở tỉnh thứ 19 nghĩa là mất toàn bộ. | state theo cặp (bước, tỉnh) + vân tay đầu vào; xoá sản phẩm hoặc đổi logic ⇒ tự hết hạn | ✔ `vn/runner.py` |

---

## E. Web — `web/src/`

| file:line | loại giả định | vỡ thế nào khi có 34 tỉnh | cách sửa | tt |
|---|---|---|---|---|
| `web/src/map/positron.ts:12-17` | `INITIAL_VIEW.center = [105.84, 21.0]`, `zoom: 9.3` — bbox lưới Hà Nội | Mở tỉnh nào cũng bay về Hà Nội. `zoom 9.3` cũng chỉ hợp với một tỉnh cỡ 3.400 km²; Nghệ An (16.486 km²) tràn khung, Bắc Ninh lọt thỏm. | khung nhìn ban đầu đọc từ bbox tỉnh trong `provinces.parquet`; zoom suy từ bề rộng bbox | ✔ shim |
| `web/src/data/duckdb.ts:41-55` | `registered` là `Set<string>` khoá bằng **tên file trần**; URL dựng từ `data/${name}` | Đây là **lỗi đúng nghĩa**, không phải bất tiện: đổi tỉnh xong, `registerParquet("grid_h3_r8.parquet")` thấy tên đã đăng ký và **im lặng dùng lại file của tỉnh trước**. Bản đồ đổi tiêu đề mà không đổi dữ liệu. | khoá đăng ký = đường dẫn đầy đủ có tỉnh | ✔ shim |
| `web/src/data/queries.ts:10-13,296,440,473` | hằng `GRID`/`STATIONS`/`OCCUPANCY`/`ROADS`/… là tên file trần dưới `data/` | API dữ liệu một-người-thuê | thêm một lớp phân giải đường dẫn theo tỉnh, **giữ nguyên chữ ký hàm** | ✔ shim |
| `web/src/fields.ts` (45 trường) | mọi trường giả định cột của nó có mặt trong `grid_h3_r8.parquet` | Tỉnh dựng không có lớp TÍNH TOÁN thiếu `population`, `built_frac`, `dist_station_*`, `screen_decision`… ⇒ `SELECT` cột không tồn tại ⇒ **DuckDB ném lỗi, màn hình trắng**. Đây là chỗ web "vỡ" thật sự. | manifest từng tỉnh khai cột nào CÓ; rail lọc trường theo đó và nói ra trường vắng vì sao | ✔ shim |
| `web/src/state/hash.ts:49-174` | 9 khoá `s m c f v l p t b` — **không có khoá tỉnh** | Không gửi được link tới một tỉnh. Với 34 tỉnh đây là khoá quan trọng nhất còn thiếu. | thêm khoá `tinh`, đọc trước mọi khoá khác | ✔ shim |
| `web/src/viz/palette.ts:165-190` | `computeClassing` chia bậc **phân vị trên chính dữ liệu đang nạp** | Không lỗi, nhưng có bẫy diễn giải: cùng một màu nghĩa là giá trị khác nhau ở hai tỉnh. So sánh giữa các tỉnh bằng mắt sẽ sai. | giữ nguyên cách chia; legend phải nói bậc tính trên tỉnh nào — và **không** dùng kênh màu để mã hoá tỉnh (xem ghi chú cuối) | ✔ (ghi chú) |
| `web/index.html:6` | `<title>EVCS Hà Nội</title>` | nhãn sai ở mọi tỉnh khác | tiêu đề theo tỉnh | ✔ shim |
| `web/src/ui/CellPanel.tsx:65` · `CommunePanel.tsx:50` · `queries.ts:243,487` · `story/bodies.tsx:154,198,205` · `fields.ts:667,841` | câu chữ và mẫu số **"126 xã"**, "không thuộc Hà Nội" | Số 126 là của Hà Nội; toàn quốc từ 38 (Lai Châu) tới 168 (TP.HCM) xã một tỉnh. | mẫu số đọc từ dữ liệu đã nạp, câu chữ dùng tên tỉnh | ✔ shim (một phần — xem "còn lại") |
| `web/src/story/scenes.ts:118-124,139` | cảnh CÂU CHUYỆN khoá cứng `code: "00004"`, `"00634"`, toạ độ bay, `EUCLID_COVERAGE_RADIUS_M` | Cảnh là một bài kể **về Hà Nội** — đúng như thiết kế. Nhưng nó phải TẮT ở tỉnh khác, không phải bay tới một xã không tồn tại. | cảnh gắn với tỉnh; tỉnh khác thì chế độ CÂU CHUYỆN không mở | ✔ shim |

---

## F. Lớp TÍNH TOÁN — ĐÃ dựng cho cả 34 tỉnh

Bốn bước dưới đây **vỡ về quy mô**, không chỉ về tham số. Đây là chỗ vỡ và chỗ đã sửa:

| bước Hà Nội | vỡ thế nào ở quy mô toàn quốc | bước `vn/` tương ứng | cách sửa |
|---|---|---|---|
| `s04_population` | ngưỡng bắt `danso` hỏng hiệu chuẩn theo Hà Nội; và tổng `danso` toàn quốc lệch ~12% **không đều** | `n05_population` | cờ `danso` hỏng chuyển hẳn về `n01_admin` (một luật một chỗ); phát **cả** `population` (neo) lẫn `population_wp` (WorldPop thô) kèm `anchor_ratio` |
| `s07_landcover` | `s07:68-70` đọc NGUYÊN cửa sổ bbox AOI; bbox một tỉnh lớn là **~4,8 tỉ pixel**, mảng chỉ số ô đi kèm còn nặng gấp bốn | `n06_landcover` | đọc theo **dải ngang** 2.048 hàng, chỉ đốt ô giao với dải (lọc qua cây R), chỉ số ô dùng `uint16` kèm phép kiểm chặn tràn |
| `s08_traveltime` + `roadnet` | một đồ thị cho cả AOI; và `roadnet.py:28-29` khoá cứng mét/độ ở vĩ độ 21° | `n07_distance` + `roadgraph` | đồ thị **theo tỉnh có vành đệm**; hệ số mét/độ là hàm của vĩ độ tâm tỉnh |
| `s12_screening` | nhãn `PHUONG`/`XA` chọn ngưỡng, và luật hai nhánh dán `XA` cho 13 đặc khu | `n08_screening` | ngưỡng đọc từ `commune_kind` ba nhánh; **đặc khu dùng ngưỡng của Phường**, và đó là một SUY LUẬN nên nó được đếm riêng ở `stats.n_o_dac_khu` |

Một chỗ nữa phải tách, và nó không nằm trong danh sách audit ban đầu vì nó chỉ lộ ra khi
dựng: **lớp ĐỂ NHÌN và lớp ĐỂ TÍNH của mạng đường phải là hai file.** `roads.parquet` đơn
giản hoá ~10 m để web tải nổi; sau khi đơn giản hoá thì số đỉnh không còn khớp `node_ids`
và nó vĩnh viễn không dựng được đồ thị. `road_graph.parquet` giữ `node_ids` + toạ độ nguyên.

### Đối chứng: `vn/` chạy cho Hà Nội phải ra ĐÚNG số của `hanoi/`

Đây là phép kiểm mạnh nhất có được — cùng đầu vào, hai đường mã hoàn toàn khác nhau:

| | `hanoi/` | `vn/` (tỉnh 01) |
|---|---|---|
| dân số tổng | 8.831.125,9 | **8.831.125,9** |
| ô có dân | 4.265 | **4.265** |
| `built_frac` trung bình | 0,1804 | **0,1804** |
| `water_frac` trung bình | 0,0556 | **0,0556** |
| trạm neo được | 886/886 | **886/886** |
| ô tới được bằng đường | 4.399 | **4.399** |
| khoảng cách trung vị | 2.322,8 m | **2.322,6 m** |
| `detour_ratio` trung vị | 1,474 | **1,474** |
| ô có `detour_ratio` > 2 | 696 | **696** |
| sàng lọc ĐỀ XUẤT / nếu-có-DC / TỪ CHỐI | 1.782 / 358 / 2.260 | **1.782 / 358 / 2.260** |
| ô đo được `util` | 437 | **437** |
| dân ngoài 2 km theo đường | 2.557.260 | **2.557.260** |

Chỗ DUY NHẤT lệch: **1.327.220 đỉnh đồ thị so với 1.327.212** (8 đỉnh, 0,0006%). Nguyên
nhân đã truy: `vn` đệm ranh giới theo vĩ độ **tâm thật** của Hà Nội (~20,97°) còn `hanoi`
khoá cứng 21,0°, nên vành đệm lệch vài chục mét và nhặt thêm 8 đỉnh ở rìa. Khoảng cách
trung vị vì thế lệch 0,2 m — dưới hẳn sai số của chính hình học OSM.

## G. Ràng buộc đã kiểm, không vi phạm

* **Nguồn evcs.vn — không tăng cường độ crawl, không đổi cách lấy.** Không cần hỏi:
  bảng canonical trong `aGiang-evcs` (19.805 trạm) và telemetry `occ_*` (19.426 trạm,
  hồ sơ 168 giờ 2,74 triệu dòng) **đã là bảng toàn quốc từ đầu** — bộ Hà Nội chỉ lọc một
  phần của nó ra. File PBF, WorldPop, WorldCover cũng đã đóng băng tại chỗ. Mở rộng phạm vi
  ra 34 tỉnh làm **0 request mới**.
* **POI không vào rule loại trừ, không làm cơ cấu.** `vn/n10_quality.py` chỉ phát chỉ số
  ĐỘ PHỦ theo tỉnh và một cờ `POI_KHONG_DIEN_GIAI_DUOC`; cờ đó **không loại tỉnh** và không
  bước nào đọc POI để quyết định gì.
* **Kênh màu hue vẫn để nguyên cho overlay.** Chiều tỉnh **không** mã hoá bằng hue —
  xem `QUYET_DINH_TOAN_QUOC.md` §6 để biết kênh nào được dùng thay và đánh đổi là gì.
* **Web hiện tại chạy được suốt.** `src/hanoi/` không bị sửa một dòng nào; `data/` và
  `web/public/data/` giữ nguyên. `vn/` ghi vào `store/`, một cây thư mục khác.
