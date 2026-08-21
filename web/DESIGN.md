# DESIGN — EVCS Atlas (`web/`)

Contract thi công của app bản đồ. Một quy tắc một chỗ; số liệu và lý do dài ở
`DECISIONS.md`, giới hạn dữ liệu ở `HAN_CHE.md`, cột ở `docs/COT.md`.

**Số § là ĐỊA CHỈ, không phải thứ tự.** Code trỏ vào chúng 830 lượt trên 86 ký hiệu (đếm lại
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
`NAV_RAIL = 56 px` (trái) · `READ_COL = READ_COL_W` (trái, chỉ trừ từ 1024 px trở lên — dưới
ngưỡng đó §3h là sheet, không chiếm bề rộng nào) · `BOTTOM = 32 px` (attribution + nút phóng
của MapLibre) · `FIT_PADDING = 1,12`.

**Chỉ trừ thứ nằm TRONG LUỒNG.** Một mặt nổi không lấy pixel nào của phần tử bản đồ, nên trừ
nó là co khung nhìn cho một cột không tồn tại; một cột trong luồng thì ngược lại, không trừ
nó là tính mức phóng cho một bề rộng rộng hơn bề rộng thật. Bảng cũ vi phạm **cả hai chiều
cùng lúc** — xem §3h, khuyết tật 1.

`BOTTOM` tụt từ **96** xuống **32** vì con số cũ gộp cả scrubber, thứ §3e chỉ dựng khi trường
đang tô là nhịp trạm. Và vì bbox Hà Nội cao hơn rộng (§3h), mỗi px trừ thừa theo CHIỀU CAO
thu nhỏ tỉnh thật, còn px trừ thừa theo bề rộng thì không.

---

## 3. Layout — MỘT cột trong luồng, MỘT mặt nổi có điều kiện

> **Đã thay ba lần.** "4 dải dán cạnh" (bốn dải cắt bản đồ thành một ô nhỏ ở giữa, và cái app
> này bán chính là bản đồ) → "ba mặt nổi" → "hai cột + hai mặt nổi" (§3g, 15/8/2026) →
> **A′** (§3h, 17/8/2026). Xem §3h cho lý do và số đo.

| Bề mặt | Vị trí | Kích thước |
|---|---|---|
| §3a Nav rail | trái, **trong luồng** | 56 px, cao hết màn hình |
| §3h Cột đọc | trái, **trong luồng**, sau rail | 320 px (340 px từ 1440), cao hết màn hình, không đóng được |
| §3b Chú giải | tiết TÍN HIỆU của §3h | cao theo nội dung |
| §3d Compare | tiết TÍN HIỆU của §3h, dưới chú giải | cao theo nội dung |
| §8 Bằng chứng | **nổi**, góc trên-phải vùng bản đồ | 320 px (340 px từ 1440), ≤ 60% chiều cao bản đồ |
| §3e Scrubber | đáy, **trong luồng** | cao theo nội dung |
| §14 Story column | thay chỗ §3h trong chế độ CÂU CHUYỆN | 400 px |

**Luật một câu, thay cho mọi luật điều phối cũ:**

> **Phạm vi quyết định LOẠI bề mặt, không phải % chiều cao.**
> Luôn đúng ⇒ trong luồng, vuông cạnh, không bóng, không đóng được.
> Chỉ đúng sau một hành động ⇒ nổi, bo `--radius-surface`, `Esc` đóng.

Hệ quả: **không còn `max-h-[44%]` / `max-h-[54%]`, không còn luật "A mở thì B đóng".** Chỉ
có một bề mặt trong luồng nên không có gì tranh chỗ với nó, và mặt nổi duy nhất tồn tại đúng
bằng `cell !== null` — nó không có cờ mở riêng để mà đồng bộ.

Màn hẹp (< 1024 px): nav rail thành **bottom navigation**; cột đọc là sheet **TRÁI** gọi từ
bottom navigation; bằng chứng là **bottom sheet**. Map chiếm toàn bộ vùng còn lại. Nút công
cụ gom nền bản đồ, reset và 2D/3D vào một popover để không làm mất chức năng trên mobile.

Mọi **tấm nổi** dùng chung vỏ `AtlasSurface`: một bán kính, một bóng, một độ mờ nền — §4e.
Cột trong luồng thì không: nền đặc, hairline, không bóng — nó không nổi trên gì cả.

### 3a. Nav rail

Chuyển mode (Bản đồ · Câu chuyện · Dữ liệu · Toàn quốc), bật/tắt lớp, nền bản đồ, 2D/3D.
Không chứa measure, không chứa dữ liệu của đối tượng.

Từ 17/8/2026 danh mục **BỐI CẢNH** (8 overlay, §4d) sống ở đây trong một **popover**, không
còn là một tab của workspace. Popover chứ không phải panel vì nó được mở, dùng, rồi đóng —
đúng luật loại bề mặt của §3h. Số lớp đang bật phải đọc được **khi popover đóng**: đó là
trạng thái duy nhất của công cụ này còn nhìn thấy từ bên ngoài, và không có nó thì bật ba lớp
rồi đóng popover là mất dấu.

Bộ chọn **nền bản đồ** chỉ có **một** bản, ở đây. Bản thứ hai từng nằm trong danh mục overlay
và dùng ba class không tồn tại trong `@theme` (`text-ink-1`, `border-cold`, `text-cold`), nên
trạng thái "đang chọn" của nó rơi về không có kiểu gì — một trạng thái vô hình.

Nút mở **cột đọc** chỉ dựng dưới 1024 px. Trên màn rộng cột không đóng được (§3h), nên một
nút bật/tắt ở đây sẽ là một điều khiển không có trạng thái nào để chuyển — đúng loại nói dối
bằng giao diện mà chính mục này cấm ở nav.

### 3b. Chú giải

Thuộc **bản đồ đang thấy**, không thuộc workspace — từ 17/8/2026 nó là nửa trên của tiết
TÍN HIỆU (§3h), không còn là một tấm nổi. Nội dung mặc định chỉ gồm: dải màu, mốc
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

### 3c. Workspace — ĐÃ BỎ (17/8/2026), trỏ tới §3h

Mục này hết hiệu lực; giữ lại tiêu đề vì code còn trỏ vào nó. Workspace là khung dựng cho
**40 measure × 6 lens**; app đang chở đúng **một** measure, nên lưới lens, danh sách measure
và ô tìm kiếm đều là chỗ trống có viền. Ba mảnh của nó đi ba đường:

- **Câu hỏi** → tiết CÂU HỎI của cột đọc (§3h). Một measure thì không có gì để chọn; thứ
  còn chọn được là **dạng hình** của nó (§15a-0).
- **Bối cảnh** → popover của nav rail (§3a). Overlay không trả lời câu hỏi nào, nó chỉ giúp
  ĐỌC câu trả lời — nên nó là công cụ, không phải một tiết của dòng đọc.
- **Khối NGUỒN ở chân workspace** → chân cột đọc (§3h).

Hai luật sống sót vì chúng nói về *registry*, không về bố cục: measure chỉ hiện khi visual
contract đủ (`map !== false`), và default của mỗi lens là **metadata khai báo** chứ không
suy từ thứ tự mảng.

Muốn dựng lại danh sách measure thì nó **không** quay về đây: nó là một tiết mới của §3h và
phải qua cổng §0 như mọi thứ khác.

### 3d. Compare

**Là nửa dưới của tiết TÍN HIỆU (§3h) từ đợt 17/8/2026** — trước đó là một tiết gấp được của
§3g, trước nữa là một tấm nổi riêng. Ba điều đổi ở đợt này:

- **Một câu duy nhất dựng: `distribution`.** Năm câu kia đều hỏi về CUNG (cổng, trạm, nhịp
  168h) hoặc về xếp hạng XÃ; với một bộ dữ liệu chỉ còn dân số thì chúng là năm bộ chuyển
  dẫn tới năm hình rỗng. Hàm `compareViewsFor()` vẫn nguyên và vẫn là chỗ duy nhất biết câu
  nào dựng được — cái bị gỡ là **bộ chuyển**, không phải cái luật.
- **Không còn tiêu đề riêng** (`bare` của `Dock`). Nó nằm dưới nhãn `TÍN HIỆU`, và hai dải
  tiêu đề chồng nhau trong 320 px không dựng thêm thứ bậc nào — chỉ dựng hai dải xám.
- **Dòng đếm "còn lại sau brush" chỉ hiện khi CÓ brush.** §13b-2 nói về một tập ĐÃ thu hẹp;
  chưa thu hẹp thì `4.400/4.400 còn lại sau brush` không sai, nó chỉ không phải một câu — và
  nó cao 48 px trong chiều đắt của bố cục này.

Luật cũ còn nguyên: đổi measure làm câu hỏi cũ hết nghĩa thì **chốt về câu dựng được**,
không đóng tấm; measure không trả lời được câu nào thì **nói ra vì sao**.

Vẫn phải ghi rõ hai biến, số mark bị loại, và cách nó liên kết với selection.

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

#### Sáu câu hỏi, và luật chung của chúng

`distribution` · `rank-communes` · `demand-access` · `access-curve` · `supply-equity` ·
`utilization-pattern`. Ba câu sau cùng thêm ngày 15/8/2026 (§3d-2 → §3d-4).

**Một câu mới chỉ được thêm khi nó vá một chỗ MÙ cụ thể**, không phải khi nó "cũng hay".
Chỗ mù phải phát biểu được thành một câu mà mọi hình đang có đều không trả lời nổi — nếu
không, tiết SO SÁNH trượt thành dashboard, thứ §0 nói app này không phải.

Ba luật hình thức, chung cho cả sáu:

1. **Một chuỗi ⇒ không legend** (§4d-2); màu dữ liệu là `c5`, mốc được gọi tên là `c7`
   (đậm hơn trong CÙNG ramp), đường tham chiếu và lưới là hairline. Chữ không mang màu dữ liệu.
2. **Đúng MỘT nhãn trực tiếp** trên hình; mọi con số khác trả lời bằng dải `Readout` khi rê.
   Một con số cạnh mọi điểm thì không con số nào được đọc.
3. **Cái bị bỏ khỏi hình phải ra chữ** — ràng buộc 1 ở tầng chữ, cùng luật §3f-4.

#### 3d-2. Đường TIẾP CẬN theo dân

"Bao nhiêu phần **DÂN** nằm trong bán kính d." Cùng cột mà histogram vẽ, nhưng đếm theo
NGƯỜI chứ không theo Ô — lưới H3 phủ đều không gian, không phủ đều dân, nên hai hình khác
nhau, và **chênh lệch giữa chúng chính là một phát biểu**.

- Mốc gọi tên là **2 km** vì đó là ngưỡng đã có trong dữ liệu (`beyond2km`, §4d) — không
  đặt thêm ngưỡng mới.
- Trục dừng ở bán kính phủ 99% dân, phần còn lại là khoảng **MỞ** kèm câu nói ra `max` —
  cùng luật §3b đã áp cho bậc cuối của legend. Ở Hà Nội `max` là 21,2 km trong khi 99% dân
  nằm trong ~5 km; vẽ hết miền thì phần có hình dạng bị ép vào 60 px đầu.
- `step-after`, không nối thẳng: giá trị của một hàm bậc thang tại `d` là bậc **đã** đạt tới.

#### 3d-3. Đường tập trung CUNG ↔ CẦU

"x% dân được phục vụ dày nhất nắm y% số cổng", kèm **Gini**. Dùng lại nguyên `lorenz()` của
§13d-A với hai vai đổi chỗ (`area` ← dân, `pop` ← cổng) — cùng phép tính, khác hai cái tên,
nên nó được **gọi lại chứ không chép lại**.

Gini đi kèm đường cong chứ không thay nó: một con số nói *lệch bao nhiêu*, đường cong nói
*lệch theo hình dạng nào*, và câu hỏi này cần cả hai. Cổng nằm ở ô **không có dân** rơi khỏi
đường cong (`lorenz` bỏ `area = 0`) nên chúng phải được đếm riêng và nói ra — đó đúng là
phần cung mà câu hỏi "cung theo cầu" không giải thích được.

Đây là **tóm tắt chỉ-đọc**: nó không lọc bản đồ.

#### 3d-4. Xếp hạng GỌI TÊN hai đầu

§13d-B đòi app gọi được tên; màu và cột không gọi tên ai. Bảng xã đầu/cuối, mỗi hàng bấm
được để mở bằng chứng của xã đó ở tiết ĐỐI TƯỢNG ngay bên trên.

- Dựng bằng **HTML**, không bằng Plot: khoá là tên tiếng Việt dài (cần cắt đuôi + `title`)
  và mỗi hàng phải bấm được — nhãn trục băng của Plot không làm được cả ba.
- **Một thang cho cả hai đầu**, và **neo ở 0**. Thang riêng cho mỗi nhóm sẽ vẽ cột dài bằng
  nhau ở cả hai bảng; neo ở `min` biến hiệu số giữa hai xã thành toàn bộ chiều dài cột.
- Đầu nào "đáng lo" do **cực tính đã khai** của trường quyết định (`polarity`), không do
  đoán. Trường không khai thì không dán nhãn nào.
- Nhóm **HOÀ** phải nói ra: 40 xã cùng bằng 0 mà bảng hiện 8 thì tám cái tên ấy là tám cái
  rút ngẫu nhiên, và thứ tự giữa chúng do `sort` quyết định chứ không do dữ liệu.

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

### 3g. Bảng THÔNG TIN — ĐÃ BỎ (17/8/2026), trỏ tới §3h

Mục này hết hiệu lực; giữ tiêu đề vì code còn trỏ vào nó. Nó đúng ở điều lớn nhất — **hai
tấm tranh một cạnh là bài toán của bố cục, không phải của luật điều phối** — và §3h chỉ áp
tiếp chính câu đó cho ba bề mặt còn lại. Cái nó chưa làm: nó **gộp** một thứ luôn đúng (so
sánh cả tập) với một thứ chỉ đúng sau một cú bấm (bằng chứng của một đối tượng) vào cùng một
vật chứa, nên bằng chứng vẫn phải có "trạng thái rỗng" và cột vẫn phải có nút thu gọn.

### 3h. Bố cục A′ — cột đọc trong luồng, bằng chứng nổi

**Số đo đặt ra luật chơi.** bbox Hà Nội `[105,289 · 20,564 · 106,020 · 21,383]` có tỉ lệ
rộng/cao **0,833** — thành phố này *cao hơn rộng*. Khung nhìn vì thế bị giới hạn bởi **chiều
cao** với mọi tỉ lệ màn hình `r > 0,833`, tức mọi màn hình thực tế. Hệ quả đảo ngược trực
giác thông thường về panel:

> **Bề rộng gần như miễn phí; chiều cao thì không.**
> Lấy 320–340 px bề rộng làm cột không làm Hà Nội nhỏ đi **một pixel** — chỉ bớt khoảng trống
> hai bên. Lấy 208 px chiều cao làm một dải đáy thì Hà Nội co còn **79%**.

Đó là lý do bố cục này đặt cột theo chiều dọc chứ không theo chiều ngang, và cũng là lý do
`CHROME.BOTTOM` tụt từ 96 xuống 32 (§2b).

**Ba khuyết tật đo được của bố cục §3g** mà A′ chữa:

1. `zoomForBbox` trừ nav rail + cột phải + đáy nhưng **không trừ chồng nổi trái** (352 px).
   Fit canh tỉnh vào giữa một hộp mà mép tây đang bị che, nên Ba Vì và Sơn Tây nằm dưới thẻ
   chú giải ngay khung hình đầu. Không sửa được bằng một phép trừ nữa: mặt nổi che một phần
   bản đồ mà hàm ấy không biết là phần nào, nên nó chỉ biết thu nhỏ, không biết dịch tâm.
2. **9 vật chứa cho 12 khối nội dung.**
3. `44%` và `54%` không đến từ nội dung nào, và vì cả hai đều nổi nên cộng lại chúng che
   **~28%** diện tích bản đồ thường trực.

**Hình học.** `rail 56` + `cột đọc READ_COL_W` + bản đồ. Bề rộng cột **suy ra** từ bề rộng
biểu đồ (`CHART_W + 2 × 12`, xem `ui/chart-size.ts`), không gõ tay ở hai chỗ — một hình rộng
344 px trong một cột 320 px tràn 48 px, và phần tràn ở mép cột thì mất luôn (§11-12).

**Sáu slot, đúng chuỗi §0** — tổng quan → lens → câu hỏi → tín hiệu → giới hạn → đi tiếp:

| tiết | chứa gì |
|---|---|
| TỔNG QUAN | 3–4 KPI lấy từ `manifest`, không gõ số trong TS |
| LENS | sáu góc nhìn controlled; lens suy ra từ field, không có state song song |
| CÂU HỎI | tên measure + tag hình học + câu đơn vị + nút tắt mặt tô + bộ CÁCH ĐỌC (§15a-0) |
| TÍN HIỆU | chú giải (§3b) rồi phân bố (§3d) — hai kênh của cùng một tập số |
| GIỚI HẠN | cách dựng, số ô khuyết đọc từ chính thang đang vẽ, badge ⚠ (§7) |
| ĐI TIẾP | câu bắc sang tầng đối tượng, và hai lớp bối cảnh mà chính câu hỏi này cần |
| *(chân cột)* | khối NGUỒN, gấp lại, `summary` luôn mang ngày xuất — ràng buộc 5 |

**Mắt xích thứ ba của §0 — bằng chứng — cố tình KHÔNG nằm trong cột.** Trong năm mắt xích,
nó là mắt xích duy nhất **chỉ tồn tại sau một hành động**, nên nó là thứ duy nhất xứng đáng
nổi. Thẻ 320–340 px, neo góc trên-phải vùng bản đồ cách 12 px, `≤ 60%` chiều cao — trần ấy không
phải để chia chiều cao với ai (không còn ai để chia), nó là trần **che khuất**: một thẻ cao
hết bản đồ sẽ giấu mất chính vùng vừa được bấm. **Không có trạng thái rỗng** — câu mời bấm
nằm ở tiết ĐI TIẾP, trong một dòng đọc, chứ không lơ lửng trong một tấm rỗng.

Ba đường đóng, cả ba đi qua đúng `selectCell(null)`: `Esc` · nút `×` · **bấm trúng khoảng
trống bản đồ**. Đường thứ ba nằm ở `onClick` gốc của deck, **không** phải một listener
`pointerdown` trên `document` — listener ấy bắt cả cú nhấn mở đầu một lượt KÉO bản đồ, nên
pan sẽ âm thầm bỏ chọn. Cổng là `info.picked`: bấm trúng một mark thì lớp của nó đã chọn đối
tượng mới rồi.

**Cột không đóng được trên màn rộng**, và đó là quyết định chứ không phải thiếu sót: nó là
chỗ duy nhất giải mã bản đồ, nên một nút đóng nó là một nút biến bản đồ thành hình trang trí.
Thứ đóng được là thứ chỉ đúng đôi lúc.

**Nhịp dọc — một thang, một cách kẻ, một cách đặt tiêu đề.** Lề tiết `px-3 py-3`; nhãn → thân
`mt-2`; hai khối trong một tiết `space-y-3`. Phân tiết chỉ bằng `border-b border-hairline`,
**không** bằng nền. Tiêu đề tiết chỉ bằng `.eyebrow`. Tiết **cuối** không kẻ vạch dưới: dưới
nó không có tiết nào để ngăn, nên vạch ấy chỉ còn là một nét chì lơ lửng.

**Số đo nghiệm thu (17/8/2026, CDP, dựng thật):**

| | 1600×1000 | 1440×900 | 1280×800 |
|---|---|---|---|
| bản đồ | 1224×1000 | 1064×900 | 904×800 |
| cột tràn | 0 px | 0 px | 0 px |
| bản đồ bị che thường trực | 0 px² | 0 px² | 0 px² |
| `elementFromPoint` trượt | 0/18 | 0/18 | 0/18 |
| tương phản chữ < 4,5:1 | 0 | 0 | 0 |
| tâm fit | `105,6545 · 20,9735` — đúng tâm bbox, cả ba |

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

**Mực:** `#0b0b0b` chính · `#52514e` phụ · `#6f6d68` mờ. Nền `#f9f9f7` (panel) trên
`#f2f3f0` (basemap), hairline `#e1e0d9`.

**Mọi mực CHỮ qua cổng 4,5:1, và cổng ấy được đo chứ không được ước lượng.** Mực mờ cũ
`#898781` cho **3,41:1** trên panel và **3,22:1** trên basemap — nó qua cổng 3:1 của *đồ hoạ*
nhưng mọi chỗ nó xuất hiện đều là chữ 10–11 px. `#6f6d68` giữ nguyên sắc ấm của họ mực và đo
được **4,90 · 4,64 · 5,17** trên `#f9f9f7` · `#f2f3f0` · `#ffffff`. Bảng đầy đủ:

| mực | trên panel | trên basemap | trên trắng |
|---|---|---|---|
| `#0b0b0b` | 18,67 | 17,67 | 19,68 |
| `#52514e` | 7,53 | 7,13 | 7,94 |
| `#6f6d68` | 4,90 | 4,64 | 5,17 |

Observable Plot nhận màu bằng chuỗi chứ không đọc được biến CSS, nên mực mờ có **một** bản
sao JS (`INK_MUTED_HEX` trong `palette.ts`) — trước 17/8/2026 nó có **tám**, và cả tám lệch
khỏi token ngay ở lần đổi đầu tiên. `HATCH_HEX` **vẫn là** `#898781` và đó không phải sót:
vân null là MARK, không phải chữ, và ΔE của nó với dải phân kỳ đã đo ở §4f trên đúng giá trị
ấy.

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

Panel cao **theo nội dung**, và từ đợt 17/8/2026 nó là **thân** của thẻ nổi BẰNG CHỨNG
(§3h): không vỏ riêng, không sheet riêng, không nút đóng riêng, không trạng thái rỗng, không
listener bàn phím. Vỏ sở hữu cả bốn thứ đó — thẻ chỉ dựng khi có selection, nên "chưa chọn
gì" không còn là một trạng thái của panel. `Chi tiết dữ liệu` là disclosure cuối, chỉ-đọc,
không mặc định mở.

**Radar bị cấm**: các trục khác đơn vị và không có chuẩn hoá sẽ tạo một điểm số thị giác giả.
Số tuyệt đối tách thành fact card có nhãn và mẫu số.

Khối **NGUỒN** xám mờ ở đáy mọi panel (ràng buộc 5, §10). Hai biến thể, hai chỗ: biến thể
**đối tượng** ở đáy thẻ bằng chứng, biến thể **cả bộ dữ liệu** ở chân cột đọc — và biến thể
thứ hai **gấp lại**, với dòng `summary` luôn mang ngày xuất. Ràng buộc 5 đòi provenance
**tra được**, không đòi nó chiếm chỗ; trải sẵn nó tốn 112 px và đã một lần sơn đè lên tiết
cuối của cột (§11-14).

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

## 11. Mười bốn bẫy đã sập một lần — đừng sập lại

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
12. **`truncate` không cắt gì nếu flex item thiếu `min-w-0`.** Mặc định `min-width: auto` cho
    phép item nở theo chữ, nên nó **đẩy chữ ra khỏi cột** thay vì cắt — và cột ở mép phải
    màn hình thì phần tràn không có chỗ nào để hiện, nó chỉ mất. Đã bắt bằng ảnh render ở bộ
    chuyển của §3d ("tổng hợp toàn datase|"), không phải bằng test.
13. **`sticky top-0` + nền ĐỤC trong một khung cuộn thấp = nội dung bị sơn đè.** Lưới lens
    của tab CÂU HỎI cao 164 px và mang `bg-panel`; khung cuộn của workspace chỉ 359 px, nên
    nó chiếm **46%** khung và phủ kín mọi thứ trượt qua dưới nó. Nạn nhân là bộ **CÁCH ĐỌC**
    của trường dân số: nút `ĐỒNG MỨC` vẫn ở trong DOM, vẫn có kích thước, `getBoundingClientRect`
    vẫn báo nó nằm trong màn hình — nhưng `elementFromPoint` tại tâm nó trả về một nút lens.
    **Vừa vô hình vừa không bấm được, mà mọi phép đo trừ ảnh chụp đều báo "ổn".** Cổng kiểm
    là `elementFromPoint`, không phải rect. Luật: phần `sticky` không được cao quá ~1/4 khung
    cuộn chứa nó; vượt thì đừng `sticky`. Kèm theo: `scrollIntoView({block:"center"})` trong
    một khung thấp cũng đẩy đầu danh sách ra khỏi màn hình — dùng `"nearest"`.
14. **Chân trang `shrink-0` trong một cột flex = nó SƠN ĐÈ nội dung, không đẩy nội dung.**
    Mặt kia của bẫy 13, và nó sập ở ĐÁY nên nó không giống bẫy 13 chút nào khi nhìn.
    Cột đọc §3h là `flex-col`: một vùng cuộn `flex-1` cộng một chân trang `shrink-0`. Khối
    NGUỒN trải ra cao **112 px**; ở 1280 × 800 nó ép vùng cuộn còn **688 px** trong khi nội
    dung bốn tiết cao **764 px**, nên tiết ĐI TIẾP trôi ra ngoài — và `elementFromPoint` tại
    tâm hai chip của nó trả về một `<td>` của chính bảng NGUỒN. Bấm không được, và ảnh chụp
    ở 1600 và 1440 đều "ổn" vì ở đó cột còn dư chỗ.
    **Luật: cổng chiều cao phải chạy ở kích thước NHỎ NHẤT được hỗ trợ, không ở kích thước
    đang mở.** Một bố cục vừa ở 1000 px không nói được gì về 800 px. Và số đo phải là
    `scrollHeight − clientHeight` của chính vùng cuộn, không phải "trông có vẻ vừa".

Và một bẫy của bố cục: container bản đồ dùng `h-full w-full`, **không** dùng chiều cao tính
bằng `calc()` trừ chrome — chrome đổi thì bản đồ lệch. Cùng lý do, một tấm nổi neo bằng
`fixed` phải tự trừ mọi thứ trong LUỒNG mà nó không biết (scrubber có hiện không, cột phải
rộng bao nhiêu); `absolute` bên trong vùng bản đồ thì không phải trừ gì cả — §3g.

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
trước khi mở app). Thứ đáng vẽ là **độ lệch khỏi kỳ vọng** — vì thế trường mặc định từng là
`commune:ports_per_10k_pop`, đơn vị xã, cực tính `high-good`.

> **Đình chỉ từ 17/8/2026, không bác bỏ.** Luật này giả định có nhiều measure để mà chọn giữa
> chúng; app đang chở đúng một, nên "chọn cái không phải MỨC" không còn là một lựa chọn.
> `FIRST_FIELD = population` là màn hình đầu tiên, và nó **khác** `DEFAULT_FIELD` — hai hằng,
> hai việc: một là *mở ra thấy gì*, một là *rơi về đâu khi trường không dựng được trên bộ
> đang mở*. Trộn chúng làm một thì hoặc cột đọc thiếu tiết CÁCH ĐỌC (§3h) mà không có đường
> nào tới được nó, hoặc tỉnh không có cột `population` mở ra là một `Binder Error`.
> Dựng lại danh sách measure thì luật này sống lại nguyên văn.

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

**14b.** **Bảy** cảnh, và thứ tự của chúng là thứ tự của lập luận: *cầu trông thế nào →
cung ở đâu → được phép đo khoảng cách bằng gì → ai bị bỏ ngoài bán kính → mạng bận lúc nào
→ ta đã chọn loại bỏ cái gì → ta vẫn chưa nói được gì.*

| cảnh | lens | nói gì |
|---|---|---|
| `von-cuc` | CẦU | cầu dồn lại, và **số vùng dày là thuộc tính của lát cắt** chứ không của thành phố |
| `cung-lech` | CUNG | cung dồn chặt hơn cầu, và dồn ở **chỗ khác** |
| `di-vong` | TIẾP CẬN | đường chim bay sai **về một phía duy nhất**, và có nguyên nhân hình học |
| `ngoai-2km` | CƠ HỘI | ai ở ngoài bán kính phục vụ, và khoảng trống ấy **không có chủ** |
| `nhip-tuan` | VẬN HÀNH | phụ tải không phẳng — và mọi câu ở đó là của **một nhà vận hành** |
| `mot-quyet-dinh` | CUNG | con số lớn nhất trong kho **là một luật ta viết**, không phải một số đo |
| `chua-biet` | — | ba giới hạn: cảnh này không chứng minh gì, nó nói ta tin được tới đâu |

Cảnh cuối không chứng minh gì và đó là chỗ của nó: bỏ nó đi thì câu chuyện kết thúc bằng
sáu khẳng định mà không có chỗ nào nói ta tin được tới đâu.

Một cảnh có thể có nhiều **nhịp** (`beat`), mỗi nhịp là một khung hình. Nhịp vào hash dưới
dạng hậu tố: `#s=di-vong.hau-qua` (Phase 7 §1.7). Nhịp ĐẦU không phát hậu tố.

**14b-1. Một cảnh là CẤU HÌNH, không phải mã.** Từ Phase 7, một cảnh là một `SceneSpec`
khai báo (`story/spec.ts`) và một trình dựng chung đi qua nó (`story/StorySurface.tsx`).
Ba luật đi kèm, cả ba đều có test gác:

* **Không literal số nào trong `story/` chạm tới màn hình.** Mỗi con số là một `MetricRef`
  trỏ vào một builder mà Map Workspace **cũng** gọi được. Ngoại lệ duy nhất là hằng số
  chính sách đã đăng ký (`domain-thresholds.ts`), và mỗi cái render kèm chữ *giả định*.
* **Không mã xã nào viết vào mã nguồn.** Cảnh khai một `SubjectSpec` ("xã đông dân nhất mà
  không có cổng nào") và nó phân giải trên gói đang mở — một câu về một LUẬT, đúng ở mọi
  tỉnh và mọi niên bản địa giới.
* **Khe không phân giải được thì CÂU BIẾN MẤT.** Không `?? 0`, không dấu "—" đứng chỗ một
  luận điểm. Đó là cách hai luận điểm còn thiếu dữ liệu (nhãn đồng hồ của nhịp tuần, phản
  thực của luật loại trừ) vắng mặt thay vì được đoán.

**14b-2. Cảnh nào MỞ ĐƯỢC là câu hỏi về NĂNG LỰC, không về mã tỉnh.** Mỗi cảnh khai
`requires`; cảnh trượt điều kiện thì **vắng mặt**, không bị làm mờ — một bước chết trong
một chuỗi là một ngõ cụt. Slug của nó cũng rơi khỏi `parseScene`, đúng như một slug lạ.

**14c.** Cột cảnh **THAY** workspace, không đứng cạnh nó. Story mode cũng ẩn inspector nổi và
compare dock: cảnh sở hữu câu hỏi, khung nhìn và selection, nên hai mặt nổi ấy sẽ tranh
quyền điều khiển với nó.

---

## 14bis. Thẻ MÔ PHỎNG — cùng một mặt nổi, không phải một hệ riêng

Đợt 21/8/2026 (`docs/UX_SIMULATION_REDESIGN_SPEC.md`). Bốn quyết định, và cả bốn đều là
**bỏ** một biến thể chứ không thêm một hệ.

**14bis-a. Cùng hợp đồng bề mặt với thẻ BẰNG CHỨNG.** `w-[320px] max-h-[60%]`, từ 1440 là
`w-[340px]` — đúng §3h, không phải một biến thể riêng. Bản cũ dùng 340/380 px và
`max-h-[75%]`: rộng hơn 20–40 px và cao hơn **15 điểm phần trăm**, nên nó vừa che thêm bản
đồ vừa đọc thành một tấm có nhịp riêng. Đo lại sau khi sửa: **320×480 px trên bản đồ 800 px
= đúng 60,0%**.

**14bis-b. Vỏ sáng thì nội dung phải sáng.** Panel cũ có 18 lớp `slate-*` cộng
emerald/amber/rose/cyan và nhiều nền tối bán trong suốt, lồng trong `AtlasSurface` NỀN SÁNG.
Hệ quả đo được trên **nền đã composite**, không phải ước lượng: tiêu đề **1,03:1**, dòng
qualifier 1,14:1, nhãn tiết 1,60:1, disclaimer 1,76:1 — cả bốn dưới cổng 4,5:1 của §4e.
Không phải khác khẩu vị: đó là chữ không đọc được. Nay panel chỉ dùng `bg-panel`/`bg-basemap`,
`text-ink`/`ink-2`/`ink-muted`, `border-hairline` và thang chữ sáu vai trò; witness đo
**0/197 chuỗi dưới 4,5:1**.

**14bis-c. Thứ tự đọc là OUTCOME-FIRST, và đó là một phép đo chứ không phải khẩu vị.** Ở
1280×800 fold của panel là 426 px. Bản cũ đặt câu "bao nhiêu người/ô cải thiện" SAU trung vị
và một bảng bốn dải, nên đúng câu trả lời chính nằm dưới fold. Thứ tự nay: danh tính →
outcome theo NGƯỜI → phần chưa kết luận → sàng lọc khoảng cách → phân bố Trước/Sau → khu vực
→ cần kiểm tra tiếp → ba disclosure. Witness khoá: outcome và toàn bộ thẻ sàng lọc phải nằm
trong khung nhìn đầu tiên ở cả ba viewport.

**14bis-d. Ba KPI + bảng đổi thành HAI DẢI cùng mẫu số.** Ba ô Before/Sau/Δ và bảng bốn hàng
lặp cùng một tập số mà không nêu ra sự dịch chuyển; người đọc phải tự biến bảng thành câu.
Nay là hai thanh xếp chồng dùng **đúng cùng một mẫu số** (tổng dân của tập ô có nền so sánh),
bốn bậc lấy từ ramp tuần tự `accessibility` đã đăng ký — **không một hex mới nào** — cộng một
câu dịch nghĩa trung vị ("50% dân số… không quá X") và bảng số đầy đủ trong disclosure.
NO_BASELINE/EXCLUDED nằm NGOÀI thanh và được nói riêng: kéo "không biết" vào một dải cự ly là
biến nó thành một câu trả lời.

**Hai thứ KHÔNG đổi.** Thuật toán mô phỏng (Phase 6 §1) không bị chạm; và xuất xứ giữ đúng tư
cách — Trước `TÍNH TOÁN`, Sau `ƯỚC LƯỢNG`, sàng lọc `QUY TẮC`, một tag mỗi tiết chứ không lặp
ở từng cột như bản cũ.

**Điều chỉnh QA vòng 2.1 (21/8/2026).** Panel mô phỏng giữ bề rộng 320/340 px nhưng được
nới trần dọc từ 60% lên 72% trên desktop theo chỉ dẫn QA; thẻ BẰNG CHỨNG vẫn giữ hợp đồng
60%. V1/V2 dùng lớp phủ nhẹ từ ramp đã đăng ký, V4 dùng ramp `utilization` và tách chú giải
khỏi segmented bar. Không có hex/ramp mới; icon + chữ + số vẫn là encoding chính.

**14bis-e. QA typography & màu vòng 2.1b (21/8/2026) — sắc thuộc về PHÁN QUYẾT, không thuộc
về ô số.** Ba việc, đo trên ảnh render 1920×1080/1200 (chi tiết + số đo ở
`docs/UX_SIMULATION_DECISION_CONTEXT_SPEC.md` §14bis):

1. **Ba vai trò chữ tách khỏi một `.eyebrow`.** Tiêu đề tiết, nhãn ô hero và tag xuất xứ đo
   được **cùng một** `10px/600/0,8px/#6f6d68`. Nay: tiêu đề 600·0,08em·`ink-2` · nhãn ô hero
   giữ `.eyebrow` · tag xuất xứ 500·0,06em·`ink-muted`. Không cỡ chữ nào tăng.
2. **Một ramp cho một phán quyết, ba bậc cho ba vai trò** (nét = bậc 4, wash = **cùng** bậc 4
   ở 9%, chữ + icon = bậc 6). Bản trước lấy nét bậc 4 + wash bậc 2: ở `demand` hai bậc lệch
   21° hue, nên KHÔNG ĐẠT là nét ĐỎ trên nền CAM. `KHÔNG KẾT LUẬN ĐƯỢC` và **hai ô hero**
   bỏ hẳn sắc — ô hero từng mượn sắc ĐẠT, nên một vị trí KHÔNG ĐẠT dựng ô xanh lá "0 người"
   dưới banner đỏ. Phân cấp ô hero nay: đặc/mực = đã đo · đứt/mực mờ = trong biên sai số.
3. **Nhịp cột và ngắt dòng.** Chú giải dải + dòng Δ dùng chung một lưới bốn cột neo vào thân
   bar (trước lệch tới 124 px); số và đơn vị không còn bị chẻ qua hai dòng; hai ô hero dùng
   chung một strut nên dòng ghi chú trùng nhau (trước lệch 4 px).

Tương phản sau đợt: **0/523 chuỗi dưới 4,5:1**, thấp nhất 4,64:1 (`ink-muted` trên
`bg-basemap`), đo trên nền đã composite ở cả năm viewport.

---

## 15. P1 Demand — năm representation thử nghiệm

`hex` · `density` · `intensity` · `bivariate` · `hybrid`.

Đây là **UI của phiên**, **chưa vào hash** (§9): chúng còn đang được đánh giá, và một link
tái lập được một representation chưa qua review là một lời hứa mà bộ dữ liệu chưa giữ được.

Nhãn trên màn hình gọi tên **dạng hình**, không gọi tên lớp deck.gl: `Ô H3` · `ĐỒNG MỨC` ·
`BẢN ĐỒ NHIỆT` · `CẦU × CUNG` · `ĐỒNG MỨC + TRẠM`. `DENSITY`/`INTENSITY` là tên trong mã
nguồn; không ai nhìn `DENSITY` mà đoán ra bản đồ đồng mức, nên hai cách đọc mạnh nhất của
trường dân số nằm ngay trước mắt mà vẫn coi như không có.

`density` là đồng mức **tô dải** (isopleth), không phải đường viền trần: `ContourLayer` nhận
`threshold` dạng `[min, max]` nên nó tô kín khoảng giữa hai ngưỡng. Cố ý — trên nền sáng của
một thành phố dày, đường viền trần chồng nhau thành nhiễu và không mang được thang màu, mà
thang màu chính là thứ làm hình này **đọc được định lượng**, khác hẳn bản đồ nhiệt bên cạnh.

### 15a-0. Bộ chọn ở đâu — tiết CÂU HỎI

Ba chỗ trong ba đợt, và đường đi nói ra nó là gì:

1. giữa **danh sách measure** (§3c) — nơi nó bị lưới lens sơn đè (§11-13) và suốt một thời
   gian dài là **không tồn tại đối với người dùng**;
2. trong **chú giải** (§3b), ngay trên dải màu — 15/8/2026;
3. trong tiết **CÂU HỎI** của cột đọc (§3h) — 17/8/2026.

Bước 2 → 3 không phải đổi ý mà là đi hết một câu. Năm dạng hình ấy **không** phải năm cách
trang trí một mặt tô: chúng là năm câu hỏi hơi khác nhau về cùng một dữ liệu (`hex` hỏi *ô
này bao nhiêu*, `density` hỏi *vùng nào dày*, `intensity` hỏi *đâu nóng*, `bivariate` hỏi
*cầu có gặp cung không*). Chọn giữa chúng là chọn **câu hỏi**, không phải chọn thang màu —
nên chỗ của nó là tiết CÂU HỎI, đứng ngay dưới tên measure, và thang màu của lựa chọn ấy
nằm ở tiết ngay sau. Thứ tự trên-dưới vẫn giữ nguyên nghĩa cũ: cách đọc đứng **trên** thang
của cách đọc đó, vì `density` gộp lên ô 3 km nên nó đọc theo ngưỡng khác hẳn `hex`.

Nó **không** mang nhãn tiết riêng và **không** kẻ vạch riêng: nó nằm trong một tiết đã có
tên, và một tiêu đề cấp hai cho một nhóm nút đã tự gọi tên mình là chrome thừa. Dòng duy
nhất trên nó nói thứ mà nhãn các nút không nói được — *cùng dân số, khác dạng hình*.

Trạng thái ĐANG CHỌN nói bằng **ba** kênh: nền `bg-basemap`, chữ đậm + mực chính, và một nét
`--color-select` 2 px ở cạnh trái ô. Kênh thứ ba không thừa — nền chênh nền cột đúng 0,05 độ
sáng tương đối, tức một gợi ý chứ không phải một tín hiệu, và trong lưới 2 × 3 mắt phải quét
cả sáu ô mới thấy ô nào sẫm hơn.

Điều kiện hiện nút là **một hàm** (`hasDemandRepresentations`) — xem đoạn dưới.

Điều kiện hiện nút là **một hàm** (`hasDemandRepresentations`), không phải một biểu thức chép
ba lần ở `MapView` · `Legend` · `FloatingLegend`. Bất đồng giữa ba bản chép cho ra đúng loại
lỗi tệ nhất: một chú giải mô tả một mặt tô không có trên bản đồ.

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

---

## 16. Lens SỬ DỤNG — bảy hồ sơ ngày + Vùng tải

Nguồn sự thật: [`docs/UX_UTILIZATION_VISUALIZATION_SPEC.md`](../docs/UX_UTILIZATION_VISUALIZATION_SPEC.md)
(audit 21/8/2026). Mục này ghi **hợp đồng đang chạy** và nói rõ nó thay phần nào ở trên;
không mục nào ở trên bị xoá hay đánh số lại.

### 16a. Nó thay gì

| Đã bị thay | Bằng | Vì sao |
|---|---|---|
| `Heatmap168` + `HourProfile` (§13c-1, §3e) | `UtilizationDayProfiles` — 7 hàng × 24 ô, step-line, trục **tuyệt đối 0–100%** | 168 ô gộp của Hà Nội chỉ chiếm 11,0–36,2% của thang; trough→peak chỉ ΔE **13,08**, và aggregate chỉ chạm **3/7 bậc** suốt tuần. Nhịp thì có thật (**25,18 điểm %**, 3,29×) — sai ở KÊNH, không ở dữ liệu. |
| Thang phân vị theo gói (`buildFieldScale(allOccValues)`) | `utilizationScale()` — bảy khoảng **tuyệt đối** `0·5·10·20·35·55·75%`, biến đổi `sqrt` | Phân vị đứng yên trong một phiên nhưng đổi nghĩa giữa hai TỈNH: bậc 4 ở Hà Nội là 25,8%, ở Lâm Đồng là 10%. Vùng tải hỏi "vùng nào bận hơn", và câu ấy không trả lời được bằng một thang chỉ so được trong một gói. |
| Chấm trạm là đơn vị đọc duy nhất | Mặc định **Vùng tải** (H3 r6/r7/r8 theo zoom), chấm trạm ở `z ≥ 13` | Ở z8 Hà Nội **98,45%** trạm bị chấm khác che, z10 còn 72,68%. Mắt đọc ra mật độ trạm, không đọc ra tỉ lệ cổng bận. |
| Nhãn đồng hồ (`T2 08:00`, `đêm/sáng/trưa/tối`) | **Ô giờ 0…23** + câu công bố | Ba manifest đang ship chưa phát `snapshots.occupancy_hour_tz`. Đỉnh `t=167` đọc theo giờ địa phương là 23:00, theo UTC là 06:00 — hai câu chuyện khác hẳn. |

**Pixel màu của lens này ĐỔI so với bản trước.** Đó là migration có chủ ý (spec §23.3):
`sc=g|binned` vẫn parse, giá trị thô và chú giải giữ nguyên nghĩa, nhưng ngưỡng phân vị cũ
**không** được tái sử dụng âm thầm.

### 16b. Một cửa cho mọi phép gộp

Mọi station-hour đi qua **`eligibleStationHour()`** (`viz/occ.ts`) → `stationOccAt()`.
Trước đó cùng bộ điều kiện được chép ở ba chỗ, và một bản đã trôi: `shapeDayProfiles`
không kiểm `inScope`, nên trạm BUFFER lọt vào mẫu số của small multiples. Nay:

```text
utilization(g,t) = Σ occ(s,t) / Σ n_ports(s)   trên s ∈ IN, đủ gate
```

**Ratio-of-sums, không có fallback.** Trung bình các tỉ lệ lệch tới 4,18 điểm % ở Hà Nội,
4,45 ở Lâm Đồng, và **đổi dấu** ở Điện Biên. `null` khi mẫu số bằng 0 — không bao giờ là 0.

Coverage đi thành **hai** số (cổng và trạm), vì chúng trả lời hai câu và ở Hà Nội chúng
lệch thật: trung vị 96,48% theo trạm nhưng 99,74% theo cổng.

### 16c. Ba kênh, ba nghĩa — không chồng lấn

| Trạng thái | Ký hiệu | KHÔNG dùng |
|---|---|---|
| có giá trị | fill theo thang tuyệt đối | — |
| không contributor ở ô giờ này | **vân xám 45°** — cùng chất liệu với ô null của lưới | một bậc màu nhạt |
| coverage cổng < 50% | **nét đứt** quanh vùng, fill giữ nguyên | opacity (sẽ làm vùng dữ liệu mỏng trông như vùng tải THẤP) |
| đang chọn | hai lượt nét `SELECT_PASSES` | — |

Ngưỡng 50% là **sàn cảnh báo** kế thừa data-health, không phải giấy chứng nhận: phần trên
nó tuyệt đối không được gọi là "đủ coverage" (spec §24-3). **40% của sàng lọc không có vị
trí nào trên thang này.**

### 16d. Ngôn ngữ

Màu đậm = **tỉ lệ cổng bận cao hơn**. Bộ dữ liệu không có hàng đợi, thời gian chờ, SLA hay
ngưỡng năng lực theo vùng/giờ, nên **không chỗ nào được nói "quá tải"** — chữ ấy chỉ xuất
hiện trong câu phủ định, và `utilization-surface.test.ts` khoá luật đó bằng cách bắt mọi
lần nhắc phải nằm trong tầm phủ của một phủ định.

### 16e. Sai khác CÓ CHỦ Ý so với wireframe của spec

§19.1 vẽ segmented control `[Vùng tải] [Trạm]` ở góc phải **bản đồ**. Bản chạy đặt nó
trong **cột đọc**, đúng khe mà `DemandModes` đã chiếm: cùng một loại điều khiển ("cùng dữ
liệu, khác dạng hình") thì phải ở cùng một chỗ, và §3 chốt chrome dán vào cạnh chứ không
nổi trên bản đồ.

### 16f. Vòng đời — vì sao scrub không tốn gì

Membership H3 và thống kê đủ (`Σocc`, `Σn_ports`, contributors, observed-hour) được
**precompute một lần cho mỗi gói** ở 3 mức × 168 giờ (`buildUtilRegions`, nhớ theo tham
chiếu gói). Đổi `t` chỉ là một phép tra mảng. Đo trên gói `p/01`, 168 bước scrub thật:
**0 request mới · 0 long task · commit p95 0,3 ms**
(`docs/qa/utilization-redesign/witness-report.json`).

`t` được đăng ký ở LÁ (`UtilizationLegendNote`), không ở `App` và không ở cột đọc.
