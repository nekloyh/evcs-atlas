# DESIGN — EVCS Atlas (`web/`)

Contract thi công của app bản đồ. Một quy tắc một chỗ; số liệu và lý do dài ở
`DECISIONS.md`, giới hạn dữ liệu ở `HAN_CHE.md`, cột ở `docs/COT.md`.

**Số § là ĐỊA CHỈ, không phải thứ tự.** Code trỏ vào chúng 748 lượt trên 76 ký hiệu (đếm lại
bằng script ở DECISIONS §21; nó bỏ qua `DECISIONS §N` — cùng dấu, khác tài liệu). Đừng đánh số lại,
đừng tái sử dụng một số đã bỏ. Mục nào hết hiệu lực thì **giữ lại tiêu đề** và ghi nó trỏ đi
đâu — xoá hẳn sẽ biến hàng trăm dòng comment thành con trỏ chết.

---

## 0. Mục tiêu

Không gian điều tra để một người ra quyết định đi từ **câu hỏi → tín hiệu không gian →
bằng chứng → giới hạn → việc tiếp theo**. Không phải data catalogue, không phải dashboard KPI.

Mỗi phiên có đúng hai đối tượng chủ động:

1. **Câu hỏi** (*lens*): Cầu · Cung · Tiếp cận · Sử dụng · Chính sách · Bối cảnh.
2. **Đối tượng đang kiểm tra** (*selection*): một ô H3, xã/phường, trạm, đoạn đường hoặc POI.

`field` là source of truth cho renderer; **lens suy ra từ `field`**, không thành state thứ hai.
Không giao diện nào lấy danh sách cột làm điểm bắt đầu.

---

## 1. Stack

Vite · React 19 · TypeScript · Tailwind v4 (`@theme`) · zustand. deck.gl v9 qua
`MapboxOverlay` với `interleaved: true`, đặt trên MapLibre GL. DuckDB-WASM + Apache Arrow.

Thêm dependency ngoài danh sách này thì **hỏi trước** (§12).

### 1a. Hai bẫy kỹ thuật đã kiểm và đã tránh

**Không bật COOP/COEP.** Bundle `coi` của duckdb-wasm cần `SharedArrayBuffer` ⇒ cần
`Cross-Origin-Embedder-Policy: require-corp`, mà tile bản đồ **không** có
`Cross-Origin-Resource-Policy` ⇒ COEP sẽ chặn tile. Dùng bundle `eh` (đơn luồng); 4.400 dòng
là bài toán nhỏ.

**Self-host bundle duckdb-wasm** từ `node_modules` bằng `?url` của Vite, không gọi CDN — app
phải chạy được khi mất mạng, trừ tile.

### 1b. Mặt liên tục (`ContourLayer`)

Chỉ dùng cho đại lượng **CỘNG ĐƯỢC**: cộng dân số của mấy ô ra dân số của vùng; cộng
`built_frac` hay `detour_ratio` ra một con số vô nghĩa. Vì thế `FieldMeta.surface` phải
**khai từng trường**, không suy từ `kind: "numeric"`.

**1b-2.** Mặt cầu là **TRƯỜNG GIÁ TRỊ**, không phải overlay ⇒ nó dùng trục màu của trường
(§4a), không dùng họ lạnh của §4d.

---

## 2. Basemap — nền sáng

CARTO positron. Nền sáng là ràng buộc của đề bài; **chưa làm dark mode**.

### 2a. Sửa gì trên style gốc

Giữ nhãn **địa danh** (`place_*`, tên nước, tên thuỷ vực) và bỏ nhãn **rác thị giác**
(`poi_*`, `roadname_*`, `housenumber`). Nhãn giữ lại nhuộm theo mực app (§4e), viền chữ
`#f9f9f7` dày 1,6.

> Bỏ **mọi** layer `symbol` là sai và đã từng xảy ra: bản đồ Hà Nội không còn một chữ nào ở
> mọi mức phóng. Nhãn địa danh là **dữ liệu định vị**, không phải nhiễu.

**`raiseLabels()` phải chạy sau mỗi `overlay.setProps()`** và trong handler `styledata`:
`interleaved: true` chèn lớp deck lên đỉnh, nên nhãn bị choropleth nuốt nếu không nâng lại.

**2a-3.** Lớp nhà cửa 3D của basemap chỉ bật ở `m=3d`.

### 2b. Khung nhìn ban đầu

Fit theo bbox của dataset đang mở, trừ phần chrome che mất bản đồ:
`NAV_RAIL = 56 px` (trái) · `BOTTOM = 96 px` (scrubber + attribution) · `FIT_PADDING = 1,12`.

Chrome chiếm chỗ **thật**; fit vào bề rộng cửa sổ sẽ đẩy trung tâm dataset ra sau panel.

---

## 3. Layout — một rail trong luồng, ba mặt NỔI trên bản đồ

> **Đã thay bố cục "4 dải dán cạnh".** Bản đồ nay là nền liên tục; workspace, chú giải và
> inspector **nổi** lên trên nó. Lý do: bốn dải cắt bản đồ thành một ô nhỏ ở giữa, và cái
> app này bán chính là bản đồ.

| Bề mặt | Vị trí | Kích thước |
|---|---|---|
| §3a Nav rail | trái, **trong luồng** | 56 px, cao hết màn hình |
| §3b Chú giải | **nổi**, trên-trái (`top-3 left-18`) | ≤ 22 rem |
| §3c Workspace | **nổi**, dưới-phải | 320 px, thu được thành một nút |
| §8 Inspector | **nổi**, trên-phải | 360 px, cao **theo nội dung** |
| §3d Compare dock | **nổi**, cạnh phải | 360 px, cao hết cạnh, chỉ mở theo hành động |
| §3e Scrubber | đáy, **trong luồng** | cao theo nội dung |

Inspector và compare dock **neo cùng một chỗ** (trên-phải). Đó là có chủ ý, và điều phối bằng
một luật: chọn một đối tượng thì compare dock **đóng**, để inspector có trọn cạnh phải. Hai
tấm chồng lên nhau là lỗi, không phải một bố cục.

Màn hẹp (< 1024 px): inspector thành sheet toàn màn hình.

Mọi **tấm** nổi dùng chung một vỏ (`AtlasSurface`): một bán kính, một bóng, một độ mờ nền —
§4e. Ngoại lệ duy nhất là workspace lúc **thu gọn**: nó không còn là tấm mà là một nút, nên
nó bo tròn hoàn toàn. Hình dạng nói ra trạng thái.

### 3a. Nav rail

Chuyển mode (Bản đồ · Câu chuyện · Dữ liệu), chọn tỉnh, bật/tắt lớp, 2D/3D. Không chứa
measure, không chứa dữ liệu của đối tượng.

### 3b. Chú giải

Thuộc **bản đồ đang thấy**, không thuộc workspace. Nội dung mặc định chỉ gồm: dải màu, mốc
**giá trị thật** (không phải "bậc 1..7"), nhãn đơn vị, và ô trống. Câu đơn vị đầy đủ, luật
chia bậc, độ phủ nằm sau một `<details>`.

- Mốc đặt ở **CẠNH** bậc, căn trái — `breaks[i]` là cạnh dưới; in vào giữa ô màu là dịch cả
  thang nửa bậc.
- Thang đơn vị và số chữ số chốt **một lần cho cả dải** (§6a). Nhãn đơn vị (`km`,
  `nghìn người`, `%`) hiện ở mép phải hàng mốc — sau khi chốt thang, các mốc là số trần.
- Bậc cuối là khoảng **MỞ**: khi `max` vượt xa ngưỡng cuối, in thêm `→ max`.
- Không vẽ được (zoom thấp, tắt mặt tô) thì **nói ra**, không để dải chú giải mô tả một bản
  đồ không tồn tại.
- Đang tải thì giữ **nguyên hình dạng** thước đo bằng một khung xám cùng kích thước; nhảy
  layout đọc thành "trang bị lỗi".

### 3c. Workspace

Ba tầng, đúng thứ tự: **câu hỏi → measure → context**.

- Sáu nút lens, mỗi nút mang một câu hỏi hoàn chỉnh chứ không chỉ nhãn nhóm.
- Measure: chỉ hiện trường có visual contract đủ (`map !== false`), kèm tag hình học
  (`H3` · `TRẠM` · `ĐƯỜNG` · `XÃ`), đơn vị ngắn, và badge phủ **trước khi chọn**.
- Không hiện tên cột thô ở UI chính. Tìm kiếm tìm *câu hỏi + measure*.
- Context là checklist phụ, chỉ chứa lớp giúp giải thích câu hỏi hiện hành.
- Default của mỗi lens là **metadata khai báo**, không suy từ thứ tự mảng.

### 3d. Compare dock

Không mặc định mở. Nó là chế độ *so sánh*, mở từ một hành động cụ thể, và phải ghi rõ hai
biến, số mark bị loại, và cách nó liên kết với selection.

Một widget chỉ được xuất hiện khi hành động của nó là một trong hai loại:
**filter** (đổi tập mark — phải ghi predicate, số mark còn lại, và có nút xoá) hoặc
**tóm tắt chỉ-đọc** (không âm thầm cross-filter bản đồ).

#### 3d-1. Brush tác động lên cái gì

Brush **làm xám** mark bị loại, **không xoá** chúng khỏi bản đồ: biến mất thì người xem
không phân biệt được "bị lọc" với "không có dữ liệu".

Mark bị loại dùng `#898781` @ 0,25 — mực mờ đã có ở §4e, không phải một hex mới. Ô **null**
vẫn vẽ vân của chính nó bằng mực này, nên "không đo được" và "không đo được VÀ bị loại" vẫn
tách nhau.

Ô không có giá trị **bị loại** khi brush khoảng bật: không biết thì không khẳng định được là
"trong khoảng". Số ô bị loại vì lý do đó phải hiện ra.

### 3e. Scrubber

Chỉ có mặt khi nó **điều khiển được** thứ gì đó: lens Sử dụng, hoặc inspector trạm đang cần
hồ sơ giờ. Cao **theo nội dung** — ba hàng xếp dọc (nhãn giờ · snapshot · 168 vạch); ép
`h-14` sẽ xén mất hàng vạch, thứ duy nhất ở đây thật sự là một điều khiển.

Nhãn giờ dùng `tabular-nums` (§4e): nó đổi liên tục khi chạy.

### 3f. Chế độ DỮ LIỆU

Workspace kiểm toán riêng, **không giả làm bản đồ**: độ phủ, schema, chất lượng, xuất bản.

1. Thay toàn bộ vùng bản đồ, không mở chồng lên nó.
2. Mọi con số truy được về một cột hoặc một khoá `manifest.json` (§7c).
3. Số lớn dùng figure **tỉ lệ**, không `tabular-nums` — chúng không xếp thành cột (§4e).
4. Nói ra cái **bị loại**, không chỉ cái được giữ.
5. Lớp không dùng được (`unusable_layers`) hiện kèm **lý do**, không im lặng biến mất.

---

## 4. Màu — đã tính, không đoán

Mọi hex đi qua `scripts/validate_palette.js` của skill dataviz trên nền `#f2f3f0`. Đừng sửa
bằng mắt.

### 4a. Ramp choropleth

Bảy ramp tuần tự, chọn theo `AnalysisTheme`; `themeFor()` là **cửa duy nhất** từ trường sang
ramp. Ramp cam là theme `exploration` (mặc định).

`polarity` khai từng trường: `high-good` **đảo** thứ tự gán màu để **đậm luôn là chỗ cần can
thiệp** ở mọi bản đồ. Không suy hộ — "nhiều đường trong ô" không tốt cũng không xấu.

#### 4a-1. Cổng đo của ramp — đo trên MÀU VẼ RA, không trên hex trần

Ô hex tô ở **alpha 217/255**, nên thứ mắt đọc là hợp thành trên nền `#f2f3f0`. Bốn cổng, tất
cả chạy ở `test/ramp_gate.test.ts`:

1. **ΔE ≥ 8 với NỀN.** Bậc thấp nhất phải tách khỏi nền, nếu không "giá trị thấp" đọc y như
   "không có ô" — đúng thứ §4b bỏ hẳn một cơ chế để tránh.
2. **ΔE ≥ 8 với MỰC BỊ-LOẠI** (`#898781` @ 0,25). Thiếu nó thì ô **được giữ** và ô **bị
   loại** cùng màu, và §3d-1 gãy.
3. **ΔL kề ≥ 0,06**, L đơn điệu giảm.
4. **Mực đè swatch ≥ 4,5:1** (§4c), và `rgb` phải khớp `hex`, `series` phải là bậc 4.

> Sáu ramp CARTO chưa từng qua cổng nào — chỉ ramp cam gốc đã đo. Bậc 1 của
> `urban-context` cho **ΔE 1,5** với nền, `supply` **2,4**; bốn ramp có bậc nhạt đụng mực
> bị-loại (`accessibility` **4,0**). Sửa bằng cách **giữ nguyên đường cong sắc, chỉ dời dải
> L** rồi lấy mẫu lại 7 bậc trên chính đường cong ấy — không sắc mới nào được đẻ ra.
> `exploration` bị KẸP để không bị làm sáng lên: nó vốn đã đạt. Số đo ở DECISIONS §24.

### 4b. Ô null — gạch chéo xám

Ô không có giá trị vẽ **vân 45°** xám trung tính, **không bao giờ** tô bậc màu nhạt. Hàm màu
chỉ có một đường vào; `null`/`undefined`/`NaN` trả về texture. **Không `?? 0`** ở bất kỳ đâu
trên đường dữ liệu → màu (ràng buộc 1, §10).

### 4c. Mực chữ đè swatch

Mực của nhãn đổi theo độ sáng của swatch dưới nó, lấy từ cùng bảng ramp — không phải một
màu cố định.

### 4d. Overlay — một họ màu lạnh duy nhất

Overlay (trạm, POI, ranh giới, tuyến) dùng ba bậc lạnh dùng chung. **Không overlay nào mã
hoá giá trị** bằng màu hay bằng kích thước — làm thế là ramp thứ hai (ràng buộc 2, §10).

#### 4d-1. Overlay dạng VÙNG là VÂN, không phải mảng màu

Trường hạng mục (§6a-5) và overlay dùng chung ba bậc lạnh. Khi overlay là **vùng**, hình học
không phân biệt được nữa ⇒ overlay vùng đổi sang **vân 135°**. Trường hạng mục giữ **mảng
màu phẳng**. Dấu hiệu phân biệt: *phẳng = trường, vân = overlay.*

#### 4d-2. Biểu đồ dùng đúng bảng màu này

Histogram, scatter, heatmap lấy màu từ cùng `Scale` và cùng theme mà bản đồ dùng. Biểu đồ và
bản đồ **không được** nói hai màu cho cùng một giá trị.

#### 4d-3. Trạng thái vận hành = NÉT, thiếu quan sát = VÂN

Trạng thái trạm mã hoá bằng **nét viền**, không bằng hue — hue đã thuộc về trường đang tô.
Trạm chưa đủ giờ quan sát vẽ **chấm rỗng**, không tô bậc nhạt: "chưa biết" không được đọc
thành "vắng khách".

#### 4d-4. Bốn nhóm POI — danh tính từ HÌNH DẠNG

`square` · `diamond` · `triangle` · `cross`. Không phải từ hue, vì kênh hue đã đầy. Kênh
**hình dạng** cũng đang cạn — thêm một nhóm nữa thì phải mở sổ cái này ra trước.

### 4e. Chrome, mực và chữ

**Mực:** `#0b0b0b` chính · `#52514e` phụ · `#898781` mờ. Nền `#f9f9f7` (panel) trên
`#f2f3f0` (basemap), hairline `#e1e0d9`.

**Đang chọn là ký hiệu VÔ SẮC** (`#0b0b0b` lõi + casing trắng, 1,5/4 px, vẽ hai lượt). Nó là
trạng thái UI, không phải giá trị của trường, nên phải đọc được trên **cả bảy** ramp cùng
lúc. Mọi màu có sắc độ đều thua ở đâu đó; tương phản vô sắc đến từ **độ sáng**, thứ không
ramp nào chiếm được cả hai đầu.

**Mặt nổi:** một bán kính (`--radius-surface` 10 px), một bóng (`--shadow-float`, dài và
loãng), một độ mờ nền. Bóng ngắn và đục vẽ ra một viền xám quanh tấm.

**Viền là cấu trúc, phải nhỏ giọng.** Ranh xã `[255,255,255,90]` @ 0,75 px. Ranh trắng đục
1 px biến bản đồ thành trang tô màu.

**Chữ:** **Be Vietnam Pro** (400/500/600) cho mọi thứ; **JetBrains Mono** chỉ cho **định danh
máy** (mã xã, `h3_r8`, mã trạm, khoá hash). Không dùng mono cho số đo — đổi face giữa dòng
làm một con số trông như một mã. Tự chủ qua `@fontsource`, không CDN.

**Thang chữ — sáu vai trò, không phải mười ba cỡ.** Tên nói VAI TRÒ; nếu token tên là
`text-sm` thì lần sau vẫn chọn bằng mắt.

| token | px | dùng cho |
|---|---|---|
| `text-note` | 10 | nhãn, chú thích, mốc trên thước đo |
| `text-body` | 11 | thân panel |
| `text-title` | 12 | tiêu đề một tấm |
| `text-heading` | 14 | tên đối tượng đang xét |
| `text-display` | 18 | tiêu đề trong story |
| `text-readout` | 24 | MỘT con số đang được đọc |

Mỗi bậc mang `line-height` + `letter-spacing` riêng, giãn chữ **siết dần** khi cỡ tăng: ở
10 px dấu thanh tiếng Việt cần chỗ thở, ở 24 px cùng lượng giãn ấy làm chữ rời ra. Nhãn viết
HOA (`.eyebrow`) giãn 0,08em — chữ hoa không có phần trên/dưới dòng để mắt bám vào.

**`tabular-nums` chỉ cho CỘT số thẳng hàng** (bảng, tick trục, nhãn đổi liên tục), **không**
cho số lớn đứng một mình: nó cho mọi chữ số bề rộng của số `0`, nên ở cỡ lớn đọc thành lỏng lẻo.

**Chuyển động:** một token duy nhất — `--dur: 180ms`, `--ease: cubic-bezier(0.2,0,0,1)` —
cắm vào `--default-transition-*` của Tailwind. Không gõ `duration-*` ở từng chỗ, vì
`prefers-reduced-motion` chỉ tắt được tất cả khi mọi transition đi qua một cửa.

**Tiêu điểm bàn phím** nhìn thấy được trên **mọi** control (`:focus-visible` toàn cục,
outline 2 px `--color-ring`), không chỉ trên control dựng bằng `<Button>`.

---

### 4f. Bảng PHÂN KỲ — trường có MỐC

Trường khai `diverge` (§6a-6) bỏ ramp tuần tự và dùng **hai cánh 3 bậc quanh một mốc**:

- **Cánh can thiệp** giữ **sắc của theme** — cảnh nào vẫn ra màu cảnh đó. Ba bậc lấy mẫu
  chính đường cong sắc ấy tại **L 0,73 / 0,575 / 0,42**; bậc nhạt sẵn có của ramp không dùng
  được (`#fff8db` của `screening` chỉ **1,04:1** với nền — vô hình).
- **Cánh còn lại** là **xám-lam dùng chung**, dừng ở **L 0,58** trong khi cánh can thiệp
  xuống 0,42 ⇒ **§4b còn nguyên: thứ sẫm nhất vẫn là chỗ cần can thiệp.** Chroma bị kẹp hai
  đầu: nhạt sắc quá thì đụng vân null §4b, đậm sắc quá thì đụng họ lạnh §4d.
- **Mốc là một nét mực 1 px** ở đường nối hai bậc giáp mốc, cộng nhãn mốc in đậm. Đổi sắc
  chỉ nói "khác", nét mới nói "đây là ranh".
- **`polarity` không áp lên thang phân kỳ** — bảng màu đã tự nói phía nào cần can thiệp.
  Một trường không được khai cả hai.

Cổng đo khác cổng tuần tự ở ba chỗ: mỗi **cánh** phải là ramp tuần tự hợp lệ; **cặp giáp
mốc** phải qua cổng **hạng mục** (ΔE ≥ 15 thường, ≥ 6 mù màu) vì nhầm nó là lật quyết định
chứ không phải lệch một bậc; và mọi bậc phải tách khỏi ba thứ **không phải dữ liệu** (nền,
vân null, mực bị-loại).

**Chỉ 4/7 theme dựng được cánh, và đó là kết quả đo** — `supply`, `utilization`,
`accessibility` để `null` kèm số đo tại chỗ. Trường phân kỳ trỏ vào một cảnh không có cánh
sẽ **lặng lẽ rơi về thang tuần tự**; `test/diverging.test.ts` chặn.

## 5. Dữ liệu — `make web`

### 5a. Ship gì

`uv run python -m vn n11_web_export` ghi một gói cho **mỗi tỉnh** vào
`web/public/data/p/<mã>/`, cộng một gói toàn quốc ở `vn/`.

Copy nguyên: `grid_h3_r8.parquet` · `stations` · `connectors` · `station_occupancy` ·
`..._profile_168h` · `admin_boundary.geojson`. Biến đổi: `commune.geojson` và `poi.geojson`
(WKB → GeoJSON trong Python, §5b); `roads.parquet` (bỏ SERVICE, đơn giản hoá ~10 m, toạ độ
giải mã sẵn). `manifest.json` sinh mới — mọi cổng của UI đọc từ đây (§7c).

`routes_showcase.geojson` chỉ dựng cho **một tỉnh**: nó cần cây Dijkstra một-nguồn, không
phải sản phẩm của mọi tỉnh. UI phải chịu được việc nó **vắng**.

> `roads.parquet` là lớp **ĐỂ NHÌN**. Sau khi đơn giản hoá, số đỉnh không còn khớp
> `node_ids` ⇒ **vĩnh viễn không dựng đồ thị từ nó được**.

Hai file to nhất (`poi.geojson`, `roads.parquet`) **nạp LƯỜI** — chỉ tải khi lớp tương ứng
được bật. Gói tỉnh 01 còn được ghi thêm một bản không tiền tố ở `web/public/data/`, để URL
không có `#tinh=` vẫn chạy.

### 5b. Hai quyết định về dữ liệu

**Không ship `grid_h3_r8.geojson`** (ràng buộc 3, §10): chỉ cần cột `h3_r8`;
`H3HexagonLayer` tự dựng đa giác. Ship nó là chở 8,3 MB hình học mà client tự sinh được.

**Convert WKB → GeoJSON trong Python**, không trong browser: làm một lần lúc build, và phía
web không phải thêm dependency parse WKB. Đây là chỗ **duy nhất** web-export biến đổi dữ
liệu chứ không copy.

### 5c. Truy vấn

DuckDB-WASM đọc Parquet qua HTTP range request, không tải hết vào RAM — đáng kể với file
168h. Mọi truy vấn viết bằng SQL, không tự dựng ORM; truy vấn chạy hơn một lần thì đặt tên
và để trong `src/data/queries.ts`.

---

## 6. Trường — sáu nhóm, một hợp đồng thị giác

Sáu nhóm: `cau` · `dat` · `duong` · `cung` · `tiepcan` · `sosanh` (§13c).

**`VisualContract`** là interface mà `FieldMeta` kế thừa: `unit` · `polarity` · `surface` ·
`map`. Khai bằng bảng, **không** suy bằng hàm — nguồn sự thật phải bám dữ liệu, và ngày thêm
một loại bản đồ mới thì thêm một thành viên vào interface là trình biên dịch tự liệt kê ra
những trường còn thiếu.

`map: false` = có giá trị để inspect hoặc làm input mô hình, nhưng không đủ hợp đồng để
thành trường bản đồ.

### 6a. Cách chia bậc

1. Mặc định **7 bậc phân vị** trên giá trị không null.
2. **Nếu ≥ 5% giá trị đúng bằng 0**, bậc 1 là tập `{0}` riêng, 6 bậc còn lại chia phân vị
   trên giá trị > 0. Gộp "0" với "ít" là xoá khác biệt duy nhất đáng kể ở các trường POI.
3. **Ngưỡng trùng thì gộp bậc, và hiện đúng số bậc còn lại.** Không bao giờ độn cho đủ 7 bậc
   giả — trường chỉ đỡ được 3 bậc thì chú giải hiện 3 swatch, đó là sự thật về trường đó.
4. Trường bool: 2 bậc.
5. Trường **hạng mục**: không dùng ramp tuần tự — dùng bậc lạnh của §4d (thứ tự ở đây không
   có nghĩa) + vân cho null. Ngoại lệ duy nhất, và không vi phạm ràng buộc 2 vì vẫn chỉ một
   trường được tô mỗi lúc.
6. Trường khai `diverge` (§4f) chia **hai phía quanh mốc**: phân vị tính **riêng trong từng
   phía**, 3 bậc mỗi phía, và mốc được **ghim làm một ngưỡng thật** — không ghim thì ranh
   giới rơi vào giữa một bậc. Quy tắc 2 **không** áp ở đây: 0 của quy tắc 2 là *vắng mặt*,
   0 của mốc là *ranh giới*, và nó đã là một ngưỡng rồi. Hệ quả phải nói ra ở chú giải: hai
   phía **không cùng mật độ** đơn vị trên mỗi bậc. Một phía rỗng ⇒ rơi về thang tuần tự.

**Mặt độ cầu** chia bậc theo **trọng số** (mỗi dải chứa xấp xỉ cùng một lượng NGƯỜI), không
theo số ô: bản đồ ấy trả lời "người ở đâu", còn chia đều theo ô là trả lời "diện tích ở đâu".

**Đơn vị và số chữ số** (`src/units.ts`) chốt **một lần cho cả dải**: thang lấy theo `max`,
số chữ số lấy theo **đầu lớn của dãy ngưỡng**, rồi chỉ nâng riêng nhãn nào bị trùng. Để mỗi
ngưỡng tự chọn thì một dải mang hai đơn vị (`600` cạnh `1 ng`).

`UnitKind` là danh sách **đóng**: đơn vị mới phải khai, không được đẻ ra cách viết thứ N.
`unit.note` là **copy** — nó không làm khoá của bất cứ thứ gì.

### 6b. ĐƠN VỊ ĐỌC — bốn họ trường

`readAs` ∈ `cell` · `commune` · `road` · `station`, và nó quyết định **hình học nào được
tô**; hình học kia không vẽ. Nhờ vậy ràng buộc 2 vẫn đứng: vẫn chỉ một ramp, một chú giải.

Trường của xã mang tiền tố `commune:`, của đường `road:`, của trạm `station:`; trường của ô
là tên trần. `column` là tên dữ liệu thật, **không** mang tiền tố — cùng một cột tồn tại được
ở hai đơn vị mà không đụng nhau.

### 6c. Nút `TẮT`

Mặt tô là một lựa chọn hiện/ẩn được. Tắt rồi thì chú giải **nói ra** điều đó và cho bật lại,
chứ không mô tả một mặt tô không còn trên bản đồ.

---

## 7. Badge ⚠ — số nào, nghĩa gì

Badge phủ là một **quy tắc chạy trên số đo** (`share < 1`), không phải danh sách gõ tay.
Giới hạn dữ liệu **luôn nhìn thấy được** khi nó đổi cách diễn giải — không giấu dưới tooltip.

### 7a. Cái gì KHÔNG được mang ⚠

⚠ chỉ dành cho **"không biết"**, không dành cho **"biết là không"**. Trường tự khai
`nullMeans` thì badge bị chặn.

**Một trường có thể có HAI loại null**, và gộp chúng vào một vân là sai: `nullSplit` chia
theo một cột bool sẵn có — **vân 45°** = "không biết" (có ⚠), **vân 90°** = "câu hỏi không
áp dụng" (không ⚠). Hai vân cùng màu xám vì cùng nghĩa "vắng giá trị", khác góc vì khác
**nguyên nhân**.

### 7b. Một điểm cần nói với mentor

Phủ kém **không** đồng nghĩa dữ liệu tồi. Một số trường chỉ tồn tại ở nơi có trạm; câu
"9,9% ô" đọc một mình thành "đo kém", mà sự thật là "chỉ tồn tại ở nơi có trạm".

### 7c. Badge sống ở đâu

Con số đến từ `manifest.json` (đo lúc export) **hoặc** từ số đo lúc chạy; câu chữ đến từ
`FieldMeta`. **Không gõ phần trăm vào TS** — dữ liệu đổi thì badge phải đổi theo.

---

## 8. Inspector — bằng chứng, không phải bảng field

Bốn tầng, cùng một cấu trúc cho mọi loại đối tượng:

1. **Danh tính + câu trả lời hiện tại** — tên/vị trí, measure đang xem, giá trị + đơn vị.
2. **Bằng chứng thiết yếu** — tối đa ba fact kiểm được ngay, chọn theo lens; có tử số/mẫu số
   khi cần. Không phải toàn bộ row.
3. **Giới hạn và xuất xứ** — nghĩa của null, độ phủ, phạm vi, cờ chất lượng, nguồn.
4. **Đi tiếp** — một tới hai hành động hợp lệ. **Không** có CTA "đề xuất đặt trạm": bộ dữ
   liệu không tạo khuyến nghị cuối cùng.

Panel cao **theo nội dung**. `Chi tiết dữ liệu` là disclosure cuối, chỉ-đọc, không mặc định mở.

**Radar bị cấm**: các trục khác đơn vị và không có chuẩn hoá sẽ tạo một điểm số thị giác giả.
Số tuyệt đối tách thành fact card có nhãn và mẫu số.

Khối **NGUỒN** xám mờ ở đáy mọi panel (ràng buộc 5, §10).

### 8a. Panel TRẠM

Thứ tự **"một con số → vài con số → hình → chữ"**:

1. **Số hero `util`** — số lớn, figure tỉ lệ, **không** `tabular-nums` (§4e). Kèm câu đơn vị.
2. **Ba stat tile** — đây mới là cột số thẳng hàng, và chúng dùng `tabular-nums`.
3. **Mini-heatmap 7×24** — cùng thang màu với chấm trạm trên bản đồ.
4. **Dòng dịch nghĩa** hình dạng nhịp + giờ đỉnh, bằng chữ.
5. **Khối NGUỒN**.

---

## 9. State & URL hash

Hash là serialize hai chiều của state. Mười một khoá:

`f` trường · `c` selection · `v` khung nhìn · `m` mode 2D/3D · `t` giờ scrubber ·
`l` lớp · `p` bật/tắt mặt tô · `b` brush · `s` cảnh câu chuyện · `d` chế độ dữ liệu ·
`tinh` tỉnh.

**Mỗi khoá đi qua bộ kiểm RIÊNG của nó**: khoá hỏng thì bỏ **một mình nó**, không kéo theo
khoá nào khác. Hash chỉ serialize trường map-hoá được và selection hợp lệ.

### 9a. Khoá `s` — chế độ CÂU CHUYỆN

`s` mở một cảnh; khoá một cái **nút** không khoá một khoá hash — `#tinh=04&s=…` vẫn mở được
cảnh dù nút vào story đang ẩn ở tỉnh đó, nên cổng phải đặt ở tầng đọc hash.

### 9b. Khoá `b` — ba loại brush

```
b = <mệnh đề>[,<mệnh đề>…]
```

Ba hình dạng khác hẳn nhau (khoảng một chiều · hộp hai chiều · cửa sổ thứ×giờ) nên một cú
pháp `tên:lo-lo` không đủ.

**9b-3.** Phân tách theo **hai đầu**: token đầu là loại, token cuối là khoảng, tất cả ở giữa
ghép lại là tên trường. Dùng `-` làm phân cách khoảng sẽ gãy ngay ở trường có giá trị âm
(`screen_margin_m` âm là "chưa đủ xa" — một nửa số ô).

---

## 10. Năm ràng buộc

| # | Ràng buộc | Thực thi ở đâu |
|---|---|---|
| 1 | **null ≠ 0** — ô null vẽ vân xám, không bao giờ tô bậc nhạt | §4b. Một đường vào duy nhất cho hàm màu. Không `?? 0` trên đường dữ liệu → màu |
| 2 | **Đúng một trường choropleth mỗi lúc** | §6b + §3c. State chứa `field` là một chuỗi, không phải mảng. Overlay ở khoá khác và không mã hoá giá trị (§4d) |
| 3 | **Không ship `grid_h3_r8.geojson`** | §5b |
| 4 | **Trường phủ kém có badge ⚠ + %** | §7. Số đo tại thời điểm export, ghi vào `manifest.json` |
| 5 | **Panel có khối NGUỒN ở đáy** | §8 |

---

## 11. Mười một bẫy đã sập một lần — đừng sập lại

1. `INITIAL_VIEW` phải dùng từ vựng MapLibre (`center`), không phải `longitude`/`latitude`.
2. **`m.isStyleLoaded()` là cổng SAI để THÊM layer.** Cửa sổ mà hai điều kiện cùng đúng có
   thể không bao giờ tồn tại ⇒ `addLayer` không chạy, console **sạch trơn**, triệu chứng
   trông y hệt "dữ liệu không có". Điều kiện đúng là **source đã có**.
   Nó vẫn là cổng ĐÚNG cho việc **sắp xếp lại** layer đã có (`raiseLabels`, §2a) — nhưng chỉ
   vì lời gọi đó được **lặp lại** sau mỗi `setProps`: bỏ lỡ một lượt thì lượt sau vá được.
   Một lời gọi duy nhất sau cổng này là bug.
3. **`characterSet: "auto"` là bắt buộc cho mọi `TextLayer`.** Mặc định là ASCII, và chữ
   tiếng Việt rơi mất **lặng lẽ, không một cảnh báo**. Ảnh render bắt được, test thì không.
4. Một trường khai **bắt buộc** trong kiểu `Manifest` mà dữ liệu không có ⇒ màn hình trắng.
5. **Hai bộ dữ liệu đặt tên khác nhau cho cùng một khái niệm.** Chỉ dùng khoá mang cùng
   nghĩa ở mọi bộ; một bộ thứ ba đặt tên khác sẽ chạy đúng mà sai.
6. **`interleaved: true` ⇒ mọi lớp deck phải khai `depthCompare`.** Thiếu nó, icon biến mất
   sau khối 3D.
7. Khoá một cái **nút** không khoá một khoá **hash** (§9a).
8. **BA cổng "có cột không" và chúng KHÁC nhau** — cột cố định của lưới, cột theo tỉnh, và
   cột của bảng khác. Dùng nhầm cổng thì trường biến mất im lặng.
9. **`deps` không đi qua `dataPath()`** sẽ đọc dữ liệu của **tỉnh khác** và trả về một con số
   trông rất hợp lý.
10. Fragment shader không truy cập được `project.*` của deck.gl.
11. **`prop: cond ? fn : undefined` GIẾT một lớp deck.gl.** Khoá có mặt mang `undefined` được
    coi là **đã khai**, nên nó đè mất mặc định và lớp chết lúc dựng
    (`accessor "getElevation" is not a function`). `getElevation: is3d ? f : undefined` đã
    làm **toàn bộ ô H3 biến mất ở chế độ 2D** — tức mọi bản đồ chính của app — và console chỉ
    ghi ba dòng chìm giữa log khởi động. Luôn đưa hàm vào; `extruded: false` đã tắt nó rồi.

Và một bẫy của bố cục: container bản đồ dùng `h-full w-full`, **không** dùng chiều cao tính
bằng `calc()` trừ chrome — chrome đổi thì bản đồ lệch.

---

## 12. Nguyên tắc làm việc

- **Thay đổi tối thiểu.** Không thêm abstraction chưa cần.
- **Không thêm dependency** ngoài §1 mà không hỏi.
- **Không bịa số.** Mọi con số trong UI truy được về một cột trong `store/p/<mã>/`. Không có
  cột thì không hiện.
- **Không hard-code số theo tỉnh** trong TSX/CSS/copy. Ngưỡng chính sách phải được **gọi tên
  là ngưỡng**.
- **Logic thuần thì có test, không verify bằng mắt.** Ảnh chụp chứng minh được *một phân bố
  cụ thể*, không chứng minh được *một quy tắc*. Dùng `node:test` + `node:assert` — không thêm
  dependency. Render thật vẫn bắt buộc, nhưng cho thứ chỉ render mới thấy.
- **Không `?? 0`** trên đường từ dữ liệu tới màu. Đó là cách ràng buộc 1 bị phá.
- Trước khi ship: typecheck · test · build · xem ảnh ở ba mức phóng cho từng lens, xác nhận
  **bản đồ – chú giải – inspector cùng nói một measure**.
- Đổi quyết định thì **sửa file này trước**, kèm lý do.

---

## 13. Vì sao thảm hex không tự kể được chuyện

**13a-1.** Ở zoom 9,3 một ô r8 rộng **~9 px**. Ở kích thước đó thảm hex là **texture**: thấy
được hình dáng chung, không đọc được từng bậc màu.

**13a-4.** Màn hình đầu tiên không được là một **MỨC** ("người ở giữa" là thứ mentor đã biết
trước khi mở app). Thứ đáng vẽ là **độ lệch khỏi kỳ vọng** — vì thế trường mặc định là
`commune:ports_per_10k_pop`, đơn vị xã, cực tính `high-good`.

### 13b. Hex vẫn dùng, nhưng chỉ ở nơi nó xứng đáng

**13b-1.** `HEX_MIN_ZOOM = 11`. Dưới ngưỡng, hình phạt là **nói ra rằng đang đọc thô** kèm
nút phóng, chứ không im lặng vẽ texture.

**13b-2.** Hex **đã lọc** không chịu ngưỡng zoom: một tập đã thu hẹp là vài chục hình nhận ra
được, không phải 4.400 ô. Và tập đã thu hẹp phải **đếm được**.

### 13c. Nhóm SO SÁNH

Nhóm thứ sáu gom theo **cách đọc**, không theo bảng: một trường ở đây có thể là cột thật hoặc
đại lượng tính ra. Điểm chung là cả nhóm vẽ **độ lệch khỏi một kỳ vọng**, không vẽ **mức**.

**13c-1.** Trường phái sinh khai `expr` (bảng ô có bí danh `g`); `expr` cần bảng ngoài thì
**bắt buộc** khai `deps`, và `deps` phải đi qua `dataPath()` (§11-9).

### 13d. Ba luận điểm phải chứng minh

Mỗi luận điểm phải có **mark** của riêng nó trên bản đồ, không chỉ một câu trong panel: cầu
tập trung ở đâu · cung lệch khỏi cầu ở đâu · đi vòng làm khoảng cách thật khác khoảng cách
chim bay ở đâu.

### 13e. `detour_ratio` — hai loại null trong một trường

Ô **sát trạm** (nhóm được phục vụ tốt nhất) và ô **không tới được** (nhóm tệ nhất) đều cho
null. Gộp chúng vào một vân xám là để hai nhóm ngược nhau đeo cùng một ký hiệu — đây là ca
đã sinh ra `nullSplit` (§7a).

---

## 14. Chế độ CÂU CHUYỆN

**14a.** **Một store, không phải hai.** Cảnh câu chuyện ghi vào cùng state mà chế độ bản đồ
dùng; không dựng một bản sao state riêng cho story.

**14b.** **Bốn** cảnh cho **ba** luận điểm — và sự lệch ấy là có chủ ý. Ba cảnh đầu
(`von-cuc` · `cung-lech` · `di-vong`) mỗi cảnh chứng minh đúng một luận điểm của §13d, khai
sẵn trường và mark của nó. Cảnh thứ tư (`chua-biet`, *"Ba điều ta không biết"*) không chứng
minh gì — nó nói **giới hạn**. Bỏ nó đi thì câu chuyện kết thúc bằng ba khẳng định mà không
có chỗ nào nói ta tin được tới đâu.

Một cảnh có thể có nhiều **nhịp** (`beat`), mỗi nhịp là một khung hình.

**14c.** Cột cảnh **THAY** workspace, không đứng cạnh nó. Story mode cũng ẩn inspector nổi và
compare dock: cảnh sở hữu câu hỏi, khung nhìn và selection, nên hai mặt nổi ấy sẽ tranh
quyền điều khiển với nó.

---

## 15. P1 Demand — năm representation thử nghiệm

`hex` · `density` · `intensity` · `bivariate` · `hybrid`.

Đây là **UI của phiên**, **chưa vào hash** (§9): chúng còn đang được đánh giá, và một link
tái lập được một representation chưa qua review là một lời hứa mà bộ dữ liệu chưa giữ được.

### 15a. Điểm nhìn SỞ HỮU representation

Quan hệ một chiều, và trước đây nó bị lật:

1. `m=2d|3d` là trạng thái **ngoài**. Đổi nó **chỉ** bằng nút 2D/3D ở nav rail.
2. Mỗi representation khai mình thuộc điểm nhìn nào (`REPRESENTATION_VIEWPOINT`). Bộ chọn
   chỉ hiện đúng nhóm của điểm nhìn đang mở.
3. Đổi điểm nhìn thì representation **tự chốt** về mặc định của nhóm mới nếu nó lạc nhóm.

Tiêu chí phân nhóm là **độ cao có phải một kênh mã hoá đang chạy không**, không phải "trông
có vẻ 3D". `hex` thuộc **cả hai** vì nó đi theo `mode`: phẳng ở 2D, dựng khối ở 3D, cùng một
thang màu.

> **`extrusion` đã bị xoá, không phải chuyển nhóm.** Nó ép cứng `is3d = true` bất kể `mode`,
> nên chọn nó ở 2D cho ra khối hex trên camera pitch 0 — UI nói 2D, bản đồ vẽ 3D. Sửa cái ép
> cứng ấy thì nó dựng **đúng cùng bộ lớp** với `hex` ở 3D. Chỗ khác duy nhất còn lại là một
> lỗi: nó đi vòng qua cổng `plan.paint`, nên vẫn vẽ hex dưới `HEX_MIN_ZOOM` (§13a-1).
>
> Hệ quả phải nói ra chứ không giấu: **điểm nhìn 3D hiện chỉ còn một cách đọc.**

**15c.** Representation nào mã hoá bằng **kích thước** thì kích thước đó phải được **khai rõ
ở chú giải** (`hybrid`: chấm = √ số cổng). Không có legend kích thước thật thì không được
dùng kích thước để mã hoá — §4d.

### 15b. Ma trận bivariate

Ngưỡng của **cả hai trục** dựng một lần bằng `bivariateAxes(cells)`; bản đồ và chú giải đọc
đúng bộ ấy. Chú giải chỉ vẽ ô màu cho nhóm **thật sự có ô**, và in **ngưỡng thật** chứ không
in "3 nhóm/trục".

> Phân vị ba không dùng được cho trục thưa: `n_ports` có 90,0% ô bằng 0 nên phân vị 1/3 và
> 2/3 **đều bằng 0**, nhóm giữa **không ô nào rơi vào được**, và chú giải vẫn hứa đủ 9 ô
> màu — 3 trong đó không thể xuất hiện. Nay trục nào có ≥5% số 0 thì {0} là nhóm riêng
> (§6a-2) và phần dương chia đôi ở trung vị của chính nó. 9/9 ô màu tới được.
>
> Việc này **không** chữa chuyện bivariate cần cả hai trục có cấu trúc không gian, mà cung
> thì không (Moran I = 0,19). Đó là việc của bước sau.
