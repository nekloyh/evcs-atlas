# ADR-0003 — Chưa xoá gói `hanoi`, và điều kiện để xoá

**Ngày** 2026-08-08 · **Trạng thái** ĐÃ GIẢI TOẢ · **Thay cho** ghi chú ở `src/vn/__init__.py:10-14`

> **Cập nhật 2026-08-08, cùng ngày.** Cả ba điều kiện đã xong (B1 · B3 · B4). Đo lại hôm
> nay, bộ Hà Nội và `p/01` **không còn khác nhau một file nào**, và `roads.parquet` hai bên
> có đúng cùng 5 cột. Chênh lệch duy nhất còn lại là ở bảng lưới, và cả hai chiều đều đã
> biết: `road_len_in_hanoi_m` ↔ `road_len_in_province_m` (cùng khái niệm, khác tên), cộng
> 5 cột mà `p/01` có thêm (3 lớp phủ luôn-phát, `population_wp`, `province_code`).
>
> Gói `hanoi` nay **xoá được**. Việc còn lại là di cư lối vào `/` và trỏ lại `analysis/` —
> xem "Bước còn lại" ở cuối.

## Bối cảnh

`src/vn/__init__.py` từng nêu lý do hoãn: gộp `hanoi` vào `vn` "sẽ dựng lại mọi con số đã
công bố của Hà Nội trong cùng một lần thay đổi, và không có cách nào tách 'số đổi vì sửa
đúng' khỏi 'số đổi vì lỗi mới'."

**Lý do đó đã hết hiệu lực.** ADR-0001 dựng đúng cái baseline ấy: golden phủ 801 bảng và
DỪNG khi một con số đổi. Điều kiện chờ đã được đáp ứng.

Nhưng khi chuẩn bị xoá thì lộ ra một ràng buộc khác, và nó là ràng buộc thật.

## Ràng buộc: xoá bây giờ là MẤT TÍNH NĂNG

Bộ Hà Nội ở `web/public/data/` có hai file mà không tỉnh nào có:

| file | sinh bởi | vì sao `vn/` chưa có |
|---|---|---|
| `substations.geojson` | `hanoi/s03c_osm_substation.py` | **không có bước `n` tương ứng** — lượt quét PBF thứ ba chưa được port |
| `routes_showcase.geojson` | `hanoi/web_export_roads.py` | cần `way_nodes` + `return_predecessors` để dựng lại đường đi thật; `core/roadgraph` đã bỏ cả hai vì chỉ M3-R cần |

Thêm một thứ nhỏ hơn: `s08` phát `euclid_coverage_error_by_radius`, con số đỡ lưng cho luận
điểm "chim bay báo phủ nhầm 26,0% ô". `n07` không có.

Xoá `src/hanoi/` hôm nay là bỏ lớp trạm biến áp, bỏ cặp tuyến minh hoạ, và bỏ một số đo đang
được trích dẫn. Đó không phải refactor.

## Quyết định

**Giữ `src/hanoi/` ở trạng thái ĐÓNG BĂNG.** Không sửa, không mở rộng, không thêm bước.

Ba việc phải xong trước khi xoá, theo thứ tự:

1. **Port lớp trạm biến áp** — một lượt quét `power=substation` toàn quốc, ghi
   `substations.parquet` theo tỉnh rồi `substations.geojson` cho web. Kèm hàng rào của
   `DECISIONS §8`: trạm biến áp là lớp **ĐỂ NHÌN**; `dist_substation_m`, `voltage`,
   `substation=*` và mọi cột công suất **không được khôi phục**.

   *Đo được (2026-08-08, trên chính PBF đã đóng băng):* lượt quét thứ ba toàn quốc tốn
   **107,3 s**, ra **1.387 đối tượng** (1.376 way · 2 relation · 9 node, 0 lỗi lắp
   multipolygon). Trong đó **972/1.387 CÓ tag `voltage`** và **733/1.387 có `substation=*`**
   — ở Hà Nội cám dỗ này nhỏ, ở toàn quốc nó là một cột phân hạng gần như đầy nằm sẵn
   trong nguồn. Hàng rào phải port **nguyên vẹn**, kèm `_selftest_is_substation` (15 case).

2. **Trả `return_predecessors` vào `core.roadgraph`** — và `way_nodes` là một việc KHÁC.

   *ADR này ban đầu gộp nhầm hai điều kiện.* Cặp tuyến minh hoạ CHỈ cần
   `return_predecessors`. `way_nodes` phục vụ sản phẩm thứ hai của M3-R: nhãn
   `dist_station_m` **theo đoạn đường**, thứ mà 34 tỉnh cũng đang thiếu và là nguyên nhân
   trực tiếp của một crash đã sửa ở `#tinh=01`.

   *Chi phí đã đo trên TP.HCM (1,33 triệu đỉnh):* `pred` tốn **5,3 MB, 0 giây thêm**;
   `way_nodes` dạng CSR phẳng tốn **8,7 MB** thay vì 34 MB của list-of-list. Một nguyên mẫu
   chạy bằng đúng `core.roadgraph` hiện tại **tái lập tỉnh 01 nguyên vẹn** — cùng 3 ô, cùng
   148/154/75 điểm, chiều dài polyline khớp `dist_station_network_m` tới **0,000%**.

   *Cảnh báo phạm vi:* luật chọn ô minh hoạ không khoá cứng mã H3 nào, nhưng ba bậc dân số
   1k/5k/10k là hằng số mật độ Hà Nội — đo được là **gãy ở 16/34 tỉnh** (4 tỉnh chỉ lấp
   được một bậc). Dựng cho 34 tỉnh thì phải hiệu chuẩn bậc theo phân phối trong tỉnh, hoặc
   chỉ dựng cho tỉnh 01 và nói ra điều đó.

3. **Đưa `euclid_coverage_error_by_radius` vào `n07`.** ~16 dòng, không cần đọc thêm dữ
   liệu nào (`eu`, `dist_m`, `reachable` đã nằm sẵn trong bộ nhớ).

   *Và nó đã lộ ra một chỗ tài liệu nói sai:* `README.md:49-50` và `DATA_DICTIONARY.md:144`
   viết **2.860 / 1.004 / 26,0%**, trong khi QA json và cả ba file parquet đều cho
   **2.879 / 985 / 25,49%**. Web thì không đọc QA json — `fetchDetourStats` tính lại lúc
   chạy nên màn hình đang hiện 25,5%. Tài liệu và màn hình đang bất đồng.
   **Con số này KHÔNG phải hằng số toàn quốc** (tỉ lệ báo phủ nhầm ở 3 km trải rộng giữa
   các tỉnh) — cùng luật với `QUYET_DINH §3`.

Chỉ khi ba việc xong và golden vẫn xanh thì `src/hanoi/`, `data/`, và các lối vào không
tiền tố ở web mới được gỡ.

### Trạng thái ba việc — XONG cả ba

| | việc | kết quả đo được |
|---|---|---|
| 1 | trạm biến áp | 1.384 đối tượng toàn quốc · tỉnh 01 ra **132 = 98 IN + 34 BUFFER**, trùng khít cả 4 số đếm của bộ Hà Nội |
| 2 | `return_predecessors` + `way_nodes` | dựng lại tuyến khớp `dist_station_network_m` **0,000000000 m** trên 500 ô · `dist_station_m` theo đoạn nay có ở cả 34 tỉnh |
| 3 | `euclid_coverage_error_by_radius` | có ở 34 tỉnh; và nó chứng minh con số KHÔNG phải hằng số — **25,5% (Hà Nội) → 61,0% (Cà Mau)** |

Cặp tuyến minh hoạ dựng cho **tỉnh 01** (`SHOWCASE_PROVINCES`), theo quyết định của chủ dự
án. Lý do không phải chi phí mà là luật chọn ô: ba bậc dân số 1k/5k/10k là hằng số mật độ
Hà Nội và **16/34 tỉnh không đủ ô lấp cả ba**.

### Bước còn lại để xoá

* **B5** dọn nốt khối `manifest` và các hằng số gõ tay còn lại ở web
* **B6** đổi lối vào `/` — redirect sang `#tinh=01`, hoặc xuất thêm một bản không tiền tố
* **B7** trỏ `analysis/` (21 script) và `notebooks/` sang `store/` và `evcs.core`
  — `tests/test_analysis_imports.py` là danh sách việc, và sau B8 nó là cổng
* **B8** xoá `src/hanoi/` + `data/` + bộ web không tiền tố, MỘT lần

Golden sẽ báo **12 khoá BIẾN MẤT, 0 dòng ĐỔI SỐ** ở B8. Bất kỳ dòng ĐỔI SỐ nào ở bước ấy
nghĩa là bộ Hà Nội và `p/01` chưa thật sự tương đương, và phải dừng lại.

### Đã làm trước, vì cổng chặn nói dối đúng lúc cần nó nhất

Trước khi port bất cứ thứ gì, bốn chỗ sau đã được vá (2026-08-08) — không chỗ nào đổi một
con số nào của golden:

* `tests/test_analysis_imports.py` — `make kiem` từng **mù** với `analysis/` và
  `notebooks/`, nên xoá gói `hanoi` sẽ cho kiem XANH trong khi hàng chục script đã chết.
* `fieldAvailable` lọc được trường của **ĐƯỜNG và TRẠM**, không chỉ của Ô và XÃ. Đây là
  một crash ĐANG SỐNG: `road:dist_station_m` luôn hiện trong rail ở mọi tỉnh.
* `formatNumber(undefined)` trả `—` thay vì ném `TypeError`.
* Chế độ CÂU CHUYỆN có **hai cổng**: biên tập (`n11`, "văn cảnh viết cho tỉnh này chưa")
  và dữ liệu (`storyDataReady`, "dữ liệu đỡ nổi không"). Hệ quả cố ý: cảnh **tắt** ở
  `#tinh=01` cho tới khi việc (2) xong, rồi **tự bật lại**.

## Nợ vẫn còn tính lãi

Ghi rõ để không ai đọc ADR này thành "đã ổn":

* `analysis/` (21 script) và ba mục ở `AUDIT §A` (`roadnet.py:28-29`, `s09:59-71`) vẫn dùng
  hằng mét/độ khoá ở vĩ độ 21°. Ở `hanoi/` chúng đúng; nếu ai copy sang chỗ khác thì không.
* `web/src/fields.ts` giữ **hai** trường cho cùng một khái niệm (`road_len_in_hanoi_m` và
  `road_len_in_province_m`) và dựa vào `fieldAvailable` cho đúng một cái hiện. Test
  `columns.test.ts` khai nó ở `CHI_CO_O_BO_HA_NOI` — dòng đó biến mất cùng gói `hanoi`.
* Mỗi tuần trôi qua, hai đường mã có thể trôi thêm. Golden bắt được khi CHẠY LẠI, nhưng
  không ai chạy lại `hanoi/` thường xuyên.
