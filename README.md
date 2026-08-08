# evcs-atlas

Tập bản đồ + bộ dữ liệu nền cho bài toán đặt trạm sạc xe điện — **34 tỉnh, toàn quốc**,
dựng lại sạch từ hai repo cũ (`legacy-evcs-dataset`, `aGiang-evcs`) theo nguyên tắc
**một khái niệm một trường**.

Hai repo cũ **chỉ được đọc**, không file nào trong đó bị sửa. Repo này không kế thừa lược đồ,
nợ kỹ thuật hay các bảng biến thể trùng lặp của chúng.

Bắt đầu là bộ Hà Nội. Hà Nội nay là mã `01` và **không có gì đặc biệt về mặt cấu trúc** —
gói `hanoi/` riêng đã bị xoá, xem [`docs/adr/0003-xoa-goi-hanoi.md`](docs/adr/0003-xoa-goi-hanoi.md).

- **Từ điển trường** → [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md)
- **Mọi quyết định không hiển nhiên** → [`DECISIONS.md`](DECISIONS.md)
- **Trạng thái 13 mũi phản biện + 10 lớp bản đồ** → [`CRITIQUE.md`](CRITIQUE.md)
- **Báo cáo kiểm chất lượng** → [`store/qa/`](store/qa/) — một JSON mỗi bước, mỗi tỉnh

---

## Bộ dữ liệu có gì

Phạm vi: **Thành phố Hà Nội** theo ranh giới hành chính VNSDI hiệu lực 16/6/2025 —
126 xã/phường, 3.359,8 km². Lưới phân tích **H3 độ phân giải 8** (~0,74 km²/ô).

| Bảng | Dòng (Hà Nội) | Nội dung |
|---|---:|---|
| `store/p/01/grid_h3_r8.parquet` | 4.400 | **Bảng chính.** Một dòng một ô lưới, **61 cột** — [`docs/COT.md`](docs/COT.md) |
| `store/p/01/commune.parquet` | 126 | Xã/phường: ranh giới, dân số, cung, mức sử dụng — 21 cột |
| `store/p/01/stations.parquet` | 939 | Trạm **công cộng** (710 IN + 229 BUFFER). Điểm sạc cá nhân 1-súng-AC đã loại — DECISIONS §3a |
| `store/p/01/connectors.parquet` | 1.602 | Cổng sạc theo chuẩn/công suất |
| `store/p/01/station_occupancy.parquet` | 703 | Mức sử dụng thật, cửa sổ telemetry 30 ngày |
| `store/p/01/station_occupancy_profile_168h.parquet` | 116.785 | Hồ sơ bận theo 168 ô (thứ × giờ) từng trạm |
| `store/p/01/substations.parquet` | 132 | Trạm biến áp OSM — lớp ĐIỂM để vẽ, không có trường dẫn xuất |

Cùng bộ ấy tồn tại cho **cả 34 tỉnh** dưới `store/p/<mã>/`, cùng một schema. Hà Nội là mã
`01` và không có gì đặc biệt về mặt cấu trúc — nó chỉ là tỉnh đầu tiên được dựng.

`store/` **907 MB**, chia hai tier: `p/` là sản phẩm, `cache/` là thứ dựng lại được từ PBF
(`make clean-cache` xoá được mà không mất sản phẩm nào).


## Ba thứ khác hẳn hai repo cũ

**1. Có khoảng cách đường bộ thật.** Hai repo cũ phát hằng số `evidence_grade.travel_time =
EUCLID_FALLBACK` trên 100% hồ sơ — mọi khoảng cách là đường chim bay. Ở đây
`dist_station_network_m` tính bằng Dijkstra đa nguồn trên đồ thị đường bộ OSM thật
(1,33 triệu đỉnh, 2,77 triệu cạnh có hướng, tôn trọng đường một chiều).

Sai số của đường chim bay đo được, **không phải suy đoán**: tỉ số đường-mạng/chim-bay trung
vị **1,47×**, phân vị 90 **2,29×**, và **696/4.400 ô** bị đường chim bay đánh giá gần hơn
thực tế **hơn 2 lần** — 1.280.464 người sống trong các ô đó.

Và sai số đó **chỉ lệch về một phía**: đường đi thật không bao giờ ngắn hơn chim bay. Ở bán
kính phục vụ 3 km, chim bay nói **3.864** ô đã được phủ, mạng đường nói **2.879** —
**985 ô (25,5%) là dương tính giả**, không một ô nào là âm tính giả. Vì thế bộ dữ liệu
vẫn phát `dist_station_euclid_m` (nó là khái niệm riêng, dùng cho câu hỏi về **bố trí** —
hai trạm có gần nhau quá không) nhưng **không được dùng nó để kết luận độ phủ**.

**2. Dân số neo vào số chính thức.** Một trường `population` duy nhất: bề mặt WorldPop 2025
R2024B neo theo `danso` từng xã của VNSDI. Không còn `pop_2020`/`pop_adj`/`pop_2025`/`pop_k1`
song song như repo cũ.

**3. Occupancy đã vào được lớp ô.** Repo cũ có 18,6 triệu dòng telemetry nhưng
`evidence_grade.occ_layer = MISSING` trên 100% hồ sơ, Panel C rỗng. Ở đây `util_cell` có mặt
trên **437/4.400 ô** — tức 437/449 ô *có trạm công cộng*; ô không có trạm đo được là `null`,
**không phải 0**.

## Năm hạn chế phải đọc cùng số liệu

**(a) "Trạm" ở đây nghĩa là trạm CÔNG CỘNG.** Trạm có đúng một súng và súng đó là AC — ổ cắm
lắp tại nhà — bị loại khỏi bộ dữ liệu: **2.408 trạm** trong vùng, tức **71,8%** số trạm Hà
Nội, nhưng chỉ **7,0%** công suất. Giữ chúng lại thì `dist_station_network_m` sẽ đo tới ổ cắm
trong sân nhà người khác và báo là "đã có trạm gần". Lý do đầy đủ, bộ lọc, và các con số bị
ảnh hưởng: DECISIONS §3a.

**(b) Chỉ có MÉT, không có PHÚT — và đó là quyết định, không phải thiếu sót.** Bộ dữ liệu
**không phát trường thời gian lái nào**. Bản trước có `drive_time_station_min`, tính từ bảng
7 con số km/h đặt tay theo cấp đường vì chỉ **1,1%** đoạn đường OSM có tag `maxspeed`. Kiểm
độ nhạy cho thấy **bỏ hẳn tag đi thì Spearman vẫn 0,9991** — tức trường đó **100% là giả
định**, không phải 98,9%; và đổi bảng ±30% làm **62% ô đổi nhóm ngưỡng 3/5/10 phút**. Mét
thì không có tham số nào: nó đo trên chính hình học đường. DECISIONS §6.

**(c) Không có lớp lưới điện, theo phạm vi đã thống nhất với khách hàng.** Bộ dữ liệu chỉ mô
tả công suất **trên trụ** (`power_kw_site`, `power_kw_max_port`, `connectors.power_kw`). Khả
năng đấu nối lưới — trạm biến áp, kVA khả dụng — nằm **ngoài phạm vi**; đây là ranh giới
tuyên bố, không phải lỗ hổng. DECISIONS §8.

**(d) Không có trường `buildable`.** Bản trước có, dựng từ hai ngưỡng lớp phủ đặt tay. Quét
ngưỡng cho thấy hàm **trơn, không có "vai"** nào — mọi ngưỡng tuỳ tiện như nhau — và ngưỡng
đang dùng **loại nhầm 3,3% trạm đang vận hành thật**. Cộng thêm ảnh nguồn là **2021** dùng
cho **2026**, điểm mù lệch có hệ thống vào đúng vành đai ven đô mới xây. Các trường `*_frac`
vẫn phát bình thường; ai muốn đặt ngưỡng thì tự đặt và tự chịu trách nhiệm. DECISIONS §7.

**(e) Cung gần như thuần một nhà mạng.** 704/710 trạm Hà Nội là `VINFAST_CS`. Mọi kết
luận về "mức sử dụng mạng lưới" là kết luận về mạng V-GREEN, không phải về thị trường.

Thêm hai điều nhỏ hơn nhưng thật: **2/126 xã có `danso` công bố hỏng** (21 và 54 người trên
địa bàn đô thị hàng chục km²) — đã thay bằng WorldPop **có khai báo** ở `pop_source`, chi
tiết trong `data/qa/s04_population.json`; và **1/4.400 ô không tới được** bằng đường bộ
trong bán kính neo 2 km (32.171 người), đánh dấu ở `evidence_grade_distance`.

## Tái lập từ đầu

```bash
cd ~/Work/internVSF/evcs-atlas
make vn           # cả 34 tỉnh (~20 phút, nặng nhất là 3 lượt quét PBF toàn quốc)
make vn TINH=01   # chỉ Hà Nội
```

Cần hai repo cũ ở `~/Work/internVSF/{aGiang-evcs,evcs-dataset}`; đặt `EVCS_AGIANG_REPO` nếu
chúng ở chỗ khác. Pipeline chỉ ĐỌC từ đó — `assert_sources()` dừng sớm nếu thiếu nguồn.

Resume theo cặp (bước, tỉnh): đứt ở tỉnh thứ 19 thì lần sau bắt đầu từ tỉnh thứ 19. Xem
`make vn-plan` để biết cặp nào sẽ chạy và vì sao.

| Bước | Việc |
|---|---|
| `n01_admin` | Địa giới 34 tỉnh / 3.321 xã + crosswalk + ranh giới từng tỉnh |
| `n02_osm` | Hai lượt quét PBF → đường (nhìn + tính) · POI đếm-cầu · POI visual |
| `n13_substation` | Lượt quét thứ ba → trạm biến áp, lớp ĐIỂM để vẽ |
| `n03_supply` | Trạm + cổng + mức sử dụng + nhịp 168 giờ |
| `n04_grid` | Lưới H3 r8 + nhãn xã + cung/POI/đường theo ô |
| `n05_population` | Dân số dasymetric neo VNSDI, kèm bản KHÔNG neo |
| `n06_landcover` | ESA WorldCover → 11 tỉ lệ lớp phủ, đọc theo dải |
| `n07_distance` | Dijkstra đa nguồn (mét, không phút) + nhãn đường theo đoạn |
| `n08_screening` | Engine sàng lọc — đặc khu dùng ngưỡng của Phường |
| `n09_assemble` | Ghép thành `grid_h3_r8.parquet` + `commune.parquet` |
| `n10_quality` | Bảng thống kê theo tỉnh + cờ chất lượng + đề nghị loại trừ |
| `n11_web_export` | Xuất cho web theo tỉnh + bản không tiền tố của tỉnh 01 |
| `n12_national` | Lớp gộp CẢ NƯỚC (H3 r6) |
| `n14_showcase` | Cặp tuyến minh hoạ cho cảnh CÂU CHUYỆN — chỉ tỉnh 01 |

## Đọc thử

```python
import pyarrow.parquet as pq
g = pq.read_table("store/p/01/grid_h3_r8.parquet").to_pandas()   # 01 = Hà Nội

# dân số ngoài 2 km đường tới trạm gần nhất
far = g[g.dist_station_network_m > 2000]
print(f"{far.population.sum():,.0f} người ({far.population.sum()/g.population.sum():.1%})")

# ô đông dân, chưa có trạm, xa trạm nhất — xếp theo NGƯỜI-KM (gánh nặng thật)
cand = g[g.n_stations == 0].assign(nguoi_km=lambda d: d.population * d.dist_station_network_m / 1000)
print(cand.nlargest(10, "nguoi_km")[["h3_r8", "commune_name", "population",
                                     "dist_station_network_m", "nguoi_km"]])

# chỗ nào đường chim bay nói dối nhiều nhất (sông Hồng, nút chỉ có cầu)
print(g.nlargest(5, "detour_ratio")[["commune_name", "dist_station_euclid_m",
                                     "dist_station_network_m", "detour_ratio"]])
```

## Giấy phép & bảo mật

Kế thừa ràng buộc của nguồn: dữ liệu OSM là **ODbL**; trạm sạc từ evcs.vn bị **giới hạn ToS**;
WorldPop **CC-BY**; ranh giới VNSDI là dữ liệu nhà nước. **Không publish** khi chưa có sign-off.
Không có API key hay secret nào trong repo — mọi khoá đọc qua biến môi trường.

## Toàn quốc — 34 tỉnh

Bộ dữ liệu Hà Nội ở trên **không đổi**. Gói `vn/` là một tầng riêng, ghi vào `store/`,
tham số hoá theo tỉnh và resume được:

```
make vn                 # cả 34 tỉnh (~9 phút, nặng nhất là 2 lượt quét PBF toàn quốc)
make vn TINH=01         # một tỉnh
make vn TINH=01,79,48   # vài tỉnh
make vn-plan            # in kế hoạch: cặp (bước, tỉnh) nào chạy, cặp nào bỏ qua và vì sao
make vn-web             # chỉ xuất lại store cho web (34 bộ theo tỉnh)
make vn-quocgia         # chỉ dựng lại lớp gộp TOÀN QUỐC + 4 file GeoJSON POI (~2 giây)
```

Cả 34 tỉnh có **đúng bộ 61 cột của Hà Nội** — một schema duy nhất giữa 34 phân mảnh. Chỗ
khác duy nhất là `road_len_in_hanoi_m` → `road_len_in_province_m`. Manifest từng tỉnh vẫn
khai `available_columns` và `unusable_layers`, nên giao diện không bao giờ hỏi một cột
không tồn tại và không vẽ một lớp không đọc được (ví dụ: mức sử dụng ở tỉnh dưới 50% số
trạm đo được).

### Ba đường vào dữ liệu

| URL | thấy gì | tải lần đầu |
|---|---|---|
| `/` | bộ **Hà Nội** đầy đủ, có CÂU CHUYỆN | như cũ |
| `#tinh=79` | **một tỉnh** — lưới r8 thật, 61 cột, mọi lớp của bậc tỉnh | 4,35 MB (trung vị) |
| `#tinh=vn` | **cả nước một màn hình** — 34 tỉnh + lưới gộp H3 r6 | 0,52 MB |

Màn hình `#tinh=vn` có hai đơn vị đọc (TỈNH và Ô GỘP ~36 km²), chỉ chở **số đo và phép chia
của hai số đo** — không lớp tính toán nào gộp lên bậc đó. Bấm một tỉnh là mở bộ dữ liệu của
tỉnh đó. Xem `src/vn/n12_national.py` cho lý do chọn bậc r6 (đo được: r5 → 1.753 ô ·
**r6 → 9.813** · r7 → 62.219).

### Bốn nhóm POI, xuất riêng ra GeoJSON

`make vn-quocgia` ghi `web/public/data/vn/poi/<nhóm>.geojson`, **toàn quốc, một file một
nhóm**. Mỗi feature có `geometry` là **đa giác nếu OSM có** (85%) và **điểm nếu không**, còn
`lat`/`lng` thì **luôn** nằm trong `properties` — bên đọc chỉ cần một chấm thì không phải tự
tính trọng tâm. `has_polygon` nói ra loại hình học của từng cái.

| file | nhóm | số điểm | có đa giác | dung lượng |
|---|---|---|---|---|
| `apartment.geojson` | chung cư, nhà ở tập thể | 5.962 | 5.766 | 3,3 MB |
| `mall.geojson` | trung tâm thương mại | 1.377 | 238 | 0,5 MB |
| `public.geojson` | công cộng, khu vui chơi | 7.014 | 6.327 | 4,1 MB |
| `edu_health.geojson` | bệnh viện, trường học | 10.867 | 9.141 | 5,9 MB |

Đọc trước khi sửa:

| file | nội dung |
|---|---|
| `CONTEXT.md` | **từ vựng của dự án** — nghĩa của những từ dễ trượt, và ba từ không dùng |
| `docs/adr/` | quyết định KIẾN TRÚC, kèm điều kiện để lật lại |
| `AUDIT_TOAN_QUOC.md` | mọi chỗ giả định "chỉ có Hà Nội": file:line, vỡ thế nào, cách sửa |
| `QUYET_DINH_TOAN_QUOC.md` | niên bản địa giới đã chốt, crosswalk, ngân sách, và vì sao chiều tỉnh không dùng kênh màu |
| `store/qa/provinces.parquet` | bảng thống kê theo tỉnh + cờ chất lượng |
| `store/qa/exclusions.json` | tỉnh ĐỀ NGHỊ loại khỏi phân tích, kèm lý do đo được |

---

## Hình dạng codebase

Ba gói, và ranh giới giữa chúng là ranh giới về **quyền đọc đĩa** (`docs/adr/0002`):

```
src/evcs/core/      nguyên hàm miền — THUẦN, không IO. Test không cần store.
src/evcs/schema/    khai 61 cột của bảng chính. Một chỗ, mọi thứ khác suy ra.
src/evcs/pipeline/  Dataset · Step · DAG · resume · audit. Chỗ DUY NHẤT đọc/ghi đĩa.
src/vn/             12 bước ETL + registry dataset của pipeline toàn quốc.
golden/             vân tay 801 bảng sản phẩm — cổng chặn của mọi đợt refactor.
```

Một bước ETL khai **đọc gì / ghi gì bằng TÊN dataset**, không bằng đường dẫn. Đường dẫn,
vân tay resume, thứ tự chạy và phép kiểm "thượng nguồn đã có chưa" đều suy ra:

```bash
make kiem              # schema + 171 test Python + 271 test web + golden
uv run python -m vn --do-thi          # in DAG suy từ reads/writes
uv run python -m vn all --tinh 01 --soi   # chạy VÀ đo bản khai reads có đúng không
```

`--soi` ghi lại file mà mỗi bước **thật sự mở** rồi đối chiếu với bản khai. Đây là chỗ bản
cũ hỏng: 7/12 bước đọc file mà không khai, nên chạy lại một bước thượng nguồn để lại bước
hạ nguồn ở trạng thái "đã xong" với dữ liệu cũ.

Đo được trên chính store này — chạm `store/admin/communes.parquet` (đầu ra của `n01`) rồi
`make vn-plan`:

```
n03_supply  34 tỉnh   n05_population  34 tỉnh   n08_screening  34 tỉnh
n09_assemble 34 tỉnh  n10_quality      1        n11_web_export  1
```

Đúng 6 bước đọc bảng đó, không thừa không thiếu. `n02`/`n04`/`n06`/`n07`/`n12` không đọc nó
nên không hết hạn. Ở bản cũ, **bốn bước đầu sẽ không hết hạn** vì chúng không khai bảng ấy
là nguồn.

### Thêm một nguồn dữ liệu mới

1. thêm một dòng `Dataset(...)` ở `src/vn/datasets.py`
2. thêm cột mới vào `src/evcs/schema/grid.py` (nếu nó vào bảng chính)
3. viết bước, khai `reads=(...)` / `writes=(...)`
4. `make schema` sinh lại khai báo TypeScript · `make kiem` nói còn thiếu gì

Bước 4 là chỗ vòng ETL→viz khép lại: cột có dữ liệu mà chưa có mục trong danh mục trường
thì test **DỪNG** và nói tên cột, thay vì để nó nằm im trong parquet và không ai biết.

### Hai tier trong store

```
store/p/<code>/       252 MB  sản phẩm + bảng trung gian — ship, backup
store/cache/<code>/   603 MB  road_graph — dựng lại từ PBF, KHÔNG ship, KHÔNG backup
```

Web mở một tỉnh bằng khoá hash `tinh`: `#tinh=79`. Không có khoá đó thì mở đúng bộ Hà Nội
cũ, không đổi một hành vi nào. Đo p95 truy vấn DuckDB-WASM: `pnpm dev` rồi mở `/bench.html`.
