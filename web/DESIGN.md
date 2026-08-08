# DESIGN — web app của evcs-atlas

**File này là nguồn sự thật cho mọi quyết định thiết kế của `web/`. Mọi session sau đọc
file này trước khi viết code.** Quyết định đã chốt thì không bàn lại; muốn đổi thì sửa ở
đây trước, kèm lý do, rồi mới sửa code.

Bối cảnh dữ liệu: [`../README.md`](../README.md) · [`../DECISIONS.md`](../DECISIONS.md) ·
[`../docs/COT.md`](../docs/COT.md) · [`../HAN_CHE.md`](../HAN_CHE.md).

> **Con số trong file này là số của tỉnh 01 (Hà Nội)** trừ khi ghi khác. Chúng có mặt để
> làm bằng chứng cho một lựa chọn thiết kế — cái ràng buộc là **hình dạng** của phân bố,
> không phải giá trị. App đọc số thật từ `manifest.json` của tỉnh đang xem; **§7c cấm gõ
> con số vào `fields.ts`**, và §11c mở rộng lệnh cấm đó sang cả câu nói về con số.

---

## 0. Mục tiêu

Một web app chạy **local** để mentor:

1. **Khám phá được dữ liệu** — lưới H3 r8, xã, trạm công cộng, hồ sơ 168 giờ, cho **một
   tỉnh mỗi lúc** (34 tỉnh), cộng một màn hình toàn quốc ở r6.
2. **Hiểu vì sao thuật toán đặt trạm (GMM) là hợp lý** — bằng cách nhìn thấy trước cấu
   trúc mà GMM sẽ nắm bắt: cầu tập trung thành cụm, cung lệch, và sai số đường chim bay
   có nguyên nhân hình học.

App **không** ship output của thuật toán (chưa có). Nó dựng nền cho việc đó — §11a.

Người dùng đích là **một người**: mentor, xem trên màn hình rộng, có người ngồi cạnh giải
thích. Không tối ưu cho mobile, không tối ưu cho người lạ tự mò.

---

## 1. Stack — đã chốt

| Vai | Chọn | Ghi chú |
|---|---|---|
| Build | **Vite + React + TypeScript** | pnpm, Node v22 |
| Bản đồ nền | **MapLibre GL JS** | style OpenFreeMap `positron` |
| Lớp dữ liệu | **deck.gl** qua `MapboxOverlay` chế độ **interleaved** | để khối 3D của ta depth-sort đúng với `fill-extrusion` nhà của basemap |
| Truy vấn | **DuckDB-WASM** đọc Parquet | không có backend |
| Biểu đồ | **Observable Plot** | histogram · scatter · heatmap 168h |
| State | **Zustand** + đồng bộ **URL hash** | mentor gửi được link về đúng một khung nhìn |
| CSS | **Tailwind v4** | cấu hình bằng `@theme` trong CSS, không có `tailwind.config.js` |

**Không thêm dependency ngoài danh sách này mà không hỏi.** Đặc biệt: không thêm thư viện
màu (culori/chroma), không thêm thư viện parse WKB (xem §5b), không thêm UI kit.

### 1b. `@deck.gl/aggregation-layers` — thêm ở M2, có hỏi, và có ràng buộc kèm theo

Mặt độ cầu liên tục (§13d-A) cần một lớp gộp. Đã hỏi và **được đồng ý thêm** gói này. Ghi
lại ràng buộc kèm theo, vì gói này có một cái bẫy đúng loại mà file này cấm ở mọi chỗ khác:

**Dùng `ContourLayer`. KHÔNG dùng `HeatmapLayer`.**

`HeatmapLayer` tô theo mật độ **màn hình**: cường độ của một pixel phụ thuộc `radiusPixels`
và mức zoom, nên cùng một ô dữ liệu đổi màu khi người dùng zoom mà giá trị không đổi. Hệ
quả: **không có ngưỡng nào để in ra legend**. Điều đó đụng thẳng §3b ("legend luôn in giá
trị ngưỡng thật") và §12 ("không bịa số") — một dải màu đẹp mà không nói được nó nghĩa là
bao nhiêu người/km² thì đúng là thứ §13 gọi là trang trí.

`ContourLayer` gộp vào ô vuông `cellSize` **mét** rồi vẽ dải ở **ngưỡng do ta đặt**. Giá
trị của mỗi dải là một con số thật (người trên ô gộp), in được lên legend, và **không đổi
khi zoom đổi**. Đó là lý do duy nhất khiến gói này được nhận.

Ba ràng buộc khi dùng:

1. `cellSize` và bán kính làm mượt là **giả định khai báo**, không phải số đo — chúng phải
   hiện trong câu đơn vị của legend, cùng khuôn với "chạy thông thoáng" ở §7.
2. Dải đồng mức dùng **ramp cam** (đây là *cầu*, tức một trường giá trị), không dùng bậc
   lạnh. Nó là một cách vẽ khác của cùng trường, nên nó **không** phải overlay và **không**
   được bật cùng lúc với một choropleth khác — xem ràng buộc 2 mở rộng ở §6b.
3. Không có `ContourLayer` nào chạy khi trường đang chọn không phải trường cầu.

**Phiên bản đã ghim, và vì sao không lấy bản mới nhất** — bốn chỗ cố tình đi sau `latest`:

| Gói | Ghim | `latest` | Lý do |
|---|---|---|---|
| `vite` | 7.3.6 | 8.2.1 | `@tailwindcss/vite` mới khai peer tới `^8`, nhưng plugin React ổn định chưa theo kịp |
| `@vitejs/plugin-react` | 5.2.0 | 6.0.5 | v6 yêu cầu `vite ^8` và import `vite/internal` — với Vite 7 nó **crash lúc load config**, đã gặp thật |
| `typescript` | 5.9.3 | 7.0.2 | TS 7 là trình biên dịch viết lại bằng Go; không mang rủi ro đó vào scaffold |
| `maplibre-gl` | 5.24.0 | 6.2.0 | `@deck.gl/mapbox` 9.3 chưa khai báo hỗ trợ maplibre v6 |
| `apache-arrow` | 17.0.0 | 21.2.0 | `@duckdb/duckdb-wasm` pin `^17`; để lệch thì có **hai bản arrow** trong cây và kiểu `Table` không khớp nhau (lỗi TS thật, đã gặp) |

Nâng phiên bản thì nâng cả cụm, đừng nâng lẻ.

### 1a. Hai cái bẫy kỹ thuật đã kiểm và đã tránh

**DuckDB-WASM và COOP/COEP.** Bundle `coi` của duckdb-wasm cần `SharedArrayBuffer`, tức cần
header `Cross-Origin-Embedder-Policy: require-corp`. Đã kiểm tile của OpenFreeMap:

```
access-control-allow-origin: *          ← có CORS
(không có Cross-Origin-Resource-Policy) ← nên COEP require-corp sẽ CHẶN tile
```

⇒ **Không bật COOP/COEP.** Dùng bundle `eh` (exception-handling, đơn luồng) của
duckdb-wasm. 4.400 dòng × 52 cột là bài toán nhỏ, không cần đa luồng.

**Self-host bundle duckdb-wasm** từ `node_modules` bằng `?url` của Vite, không gọi jsDelivr
— app phải chạy được khi mất mạng (trừ tile bản đồ).

---

## 2. Basemap — nền sáng

Style: `https://tiles.openfreemap.org/styles/positron` — miễn phí, không API key.
**Đã verify** (không tin lời quảng cáo, đã tải style + giải mã tile thật của Hà Nội):

| Kiểm | Kết quả |
|---|---|
| Có lớp `building` không? | **Có** — layer `building`, `type: fill`, `minzoom: 12` |
| Có chiều cao nhà thật không? | **Có** — vector layer `building` mang `render_height`, `render_min_height`, `hide_3d`. Mẫu tile z14 Hà Nội: 5 · 12 · 19 · 77 · 129 m |
| Có tách được sông Hồng không? | **Có** — polygon `water` mang `class`; tile z12 Hà Nội: `river` 7 · `lake` 261 · `pond` 47. Line `waterway` cũng có `class = river` |
| maxzoom tile | **14** (overzoom cho z > 14) |
| Nền | `rgb(242,243,240)` = `#f2f3f0` — **đây là surface dùng để đo tương phản trong §4** |

### 2a. Sửa gì trên style gốc

1. **Tắt toàn bộ nhãn.** Xoá mọi layer `type: "symbol"` (16 layer: `waterway_line_label`,
   `water_name_*`, `highway-name-*`, `highway-shield-*`, `road_shield_us`, `airport`,
   `label_*`). Dữ liệu là nội dung, nhãn OSM là nhiễu.
2. ~~**Sông Hồng bão hoà hơn phần còn lại.**~~ **BỎ ở M1.1.** Mặt nước trả về nguyên bản
   positron `rgb(194,200,202)`; không tách `class == "river"`, không có line viền xanh.

   *Vì sao bỏ, dù lý luận cũ vẫn đúng:* sông Hồng đúng là **nguyên nhân vật lý** của con
   số quan trọng nhất (`detour_ratio` trung vị **1,474**; **15,3%** ô bị chim bay đánh giá
   gần hơn >2 lần; **1,32 triệu người** trong số đó — đo lại ở M3, xem §13d-C). Nhưng nhấn nó **toàn cục trên basemap** thì nó
   nhấn ở cả 45 bản đồ không liên quan tới câu chuyện đó — thành trang trí. Nhấn sông là
   thao tác thuộc **một cảnh cụ thể**, nên nó thuộc về cảnh "chim bay nói dối" ở M3
   (§13d-C), dựng như một lớp của cảnh, không phải như một sửa đổi vĩnh viễn của nền.
   Đây là hệ quả trực tiếp của §13: mark phải theo luận điểm, và nền bản đồ không mang
   luận điểm nào.

   **Kéo theo:** không còn layer `evcs-river-outline`, nên lớp deck.gl không còn `beforeId`
   — chúng vẽ **trên** toàn bộ basemap. M0 đặt `beforeId` chỉ để giữ nét sông nổi trên
   choropleth; hết nét sông thì hết lý do.

   **Lời hẹn đã trả ở M3 — và trả đúng hình thức đã hứa.** Sông quay lại như **một lớp của
   cảnh C** (§14b): `MapView` gọi `map.addLayer` lúc vào cảnh và `map.removeLayer` lúc ra.
   Ba tính chất khiến nó không phải là sửa nền:

   - `transformPositron` **không đổi một dòng nào**. Nó vẫn là hàm thuần "bỏ mọi layer
     `symbol`", và ở 3 cảnh còn lại cùng toàn bộ chế độ BẢN ĐỒ, mặt nước vẫn là
     `rgb(194,200,202)` nguyên bản.
   - Lớp này **không có trong tab LAYER** và không bật/tắt được — cùng hạng với
     `context-boundary` (§4d "BỐI CẢNH"), không phải overlay.
   - Nó dùng chính vector source của basemap (`water`, lọc `class == "river"`), không ship
     thêm hình học nào. *Đã kiểm tile thật:* z9 có **21** đa giác `river` (z10: 16 · z12:
     7), nên nó vẽ được ở đúng mức phóng mà cảnh C dùng.

   **Nét, không phải mảng.** Vẽ bằng layer `line` trên đa giác `water`, màu lạnh nhạt
   `#3987e5` (§4d), rộng 2px — **không** tô thêm mảng màu. §4d-1 cấm overlay dạng **vùng**
   phẳng một cách vô điều kiện; một đường viền không đụng luật đó, và nó khớp nghĩa hơn:
   thứ cảnh C nói tới là một **rào cản** — thứ mà bạn phải đi vòng — chứ không phải một
   vùng giá trị.
3. **3D.** Ở chế độ 3D thêm một layer `fill-extrusion` trên source-layer `building`, dùng
   `render_height` / `render_min_height`, lọc `hide_3d != true`, màu `#e4e4de`, opacity
   0,9. Positron gốc chỉ có fill phẳng.

### 2b. Khung nhìn ban đầu

Bounding box thật của lưới: lng `105,288 → 106,022`, lat `20,562 → 21,383`.
Center `[105,84 · 21,00]`, zoom 9,3, pitch 0, bearing 0. 3D: pitch 50.

---

## 3. Layout — 4 dải dán cạnh

**Không thẻ nổi · không bo góc · không đổ bóng.** Ranh giới giữa các vùng là **đường
hairline 1px** `#e1e0d9`, không phải khoảng trống. Bản đồ là mặt phẳng duy nhất; mọi thứ
khác dán vào cạnh nó.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ EVCS HÀ NỘI │ CÂU CHUYỆN · BẢN ĐỒ · DỮ LIỆU │                    │ 2D │ 3D │ │ 44px
├──────────────────────────────────────────────────────────────────────────────┤
│ [c1][c2][c3][c4][c5][c6][c7] [▨ null]   dân số · người trên ô ~0,74 km²      │ 40px
├───────────────────┬──────────────────────────────────────┬───────────────────┤
│ DOCK PHÂN TÍCH    │                                      │ RAIL              │
│ 360px, ẩn được    │                                      │ 320px             │
│                   │                                      │                   │
│ ── histogram ──   │              BẢN ĐỒ                  │ TRƯỜNG│LAYER│Ô     │
│ ── scatter ──     │                                      │ ┌───────────────┐ │
│ ── heatmap 168h ──│                                      │ │ (nội dung tab)│ │
│                   │                                      │ └───────────────┘ │
│                   │                                      │ ─────────────     │
│                   │                                      │ NGUỒN (neo đáy)   │
├───────────────────┴──────────────────────────────────────┴───────────────────┤
│ T2 │ T3 │ T4 │ T5 │ T6 │ T7 │ CN │            ▶ play ∞                       │ 56px
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3a. Nav (trên, 44px)

`EVCS HÀ NỘI` (wordmark, không logo) | 3 tab `CÂU CHUYỆN · BẢN ĐỒ · DỮ LIỆU` | toggle
`2D | 3D` sát phải. Tab là **chế độ toàn app**, không phải điều hướng trang:

- **CÂU CHUYỆN** — chuỗi cảnh scroll-driven, mỗi cảnh chốt một khung nhìn + một trường +
  một câu. Đây là chỗ trả lời "vì sao GMM hợp lý". **XONG ở M3 — spec đầy đủ ở §14.**
- **BẢN ĐỒ** — chế độ khám phá tự do.
- **DỮ LIỆU** — "phòng chứng cứ": KPI row + bảng phủ + bảng dữ liệu + hồ sơ occupancy.
  **XONG ở M4.2 — spec đầy đủ ở §3f**, khoá hash `d` ở §9. Ba chế độ giờ đều thật, nên
  không mục nav nào còn mang nhãn mốc.

**Quy tắc: chế độ chưa dựng phải TRÔNG như chưa dựng.** Nav ở M0/M1 là chữ tĩnh trông
bấm được nhưng bấm không làm gì — đó là **nói dối bằng giao diện**, đúng loại lỗi mà file
này cấm ở mọi chỗ khác (ràng buộc 1 cấm nói dối về null; §7a cấm báo động giả). Từ M1.1:
mỗi mục nav là `<button>` thật, mục chưa dựng mang `disabled` + mực `ink-muted/50` +
`cursor-default` + `title` nói rõ **mốc nào sẽ dựng** — cùng một khuôn với tab `Ô` bị vô
hiệu trong rail khi chưa chọn ô. Áp cho cả toggle `3D` (M5, xem §11).

### 3b. Dải legend (dưới nav, 40px)

Băng ngang liền mạch, các swatch **dán sát nhau không có gap**, giá trị breakpoint in
**ĐÈ LÊN** swatch (không phải dưới nó). Bên phải băng là **một câu đơn vị**, ví dụ
`dân số · người trên ô ~0,74 km²` hoặc `khoảng cách theo đường tới trạm gần nhất · mét`
*(ví dụ cũ dùng "phút" đã sửa — khái niệm thời gian lái bị bỏ ở M2.1(i))*. Ô null có
swatch riêng ở cuối: hình gạch chéo + chữ `không đo được`.

Mực chữ đè lên swatch đổi ở bậc 4 (xem §4c) — đã tính, không đoán.

### 3c. Rail phải (320px) — 3 tab

| Tab | Nội dung |
|---|---|
| **TRƯỜNG** | Công tắc **đơn vị đọc** `Ô H3 \| XÃ \| TẮT` ở trên cùng (§6b, nút `TẮT` thêm sau M3.5 — xem dưới), rồi danh sách **radio** (không phải checkbox) các trường của đơn vị đó, gom **6 nhóm** (§6 + SO SÁNH §13c), có ô tìm kiếm lọc theo tên trường + mô tả. Trường phủ kém mang badge ⚠ **ngay trong danh sách** (§7). |
| **LAYER** | **Checkbox** các overlay (§4d). Bật tắt tự do, nhưng không cái nào là choropleth thứ hai — overlay vùng là **vân**, không phải mảng màu (§4d-1). |
| **Ô** | Panel chi tiết **đối tượng đang chọn** — nhãn tab đổi theo nó: `Ô` / `XÃ` (M2.1-A) / `POI` (M3.5) / `TRẠM` (§8a, M4.1) — nhãn cố định sẽ nói dối về nội dung bên trong. **Thay nội dung rail tại chỗ** (không phải popup, không phải drawer thứ hai), có nút `‹ quay lại` về tab trước. Đáy panel là khối NGUỒN (§8). |

Đáy rail — ở cả 3 tab — neo cố định khối **NGUỒN**: xám mờ, chữ nhỏ, nói dữ liệu đang xem
đến từ đâu và chụp ngày nào.

### 3d. Dock trái (360px, ẩn được)

Ba biểu đồ xếp dọc, cả ba **brush được**, brush giao nhau bằng **AND** và lọc lên bản đồ:

1. **Histogram** của trường choropleth đang chọn — brush theo khoảng giá trị.
2. **Scatter** hai trường (mặc định `population` × `dist_station_network_m`) — brush 2D.
3. **Heatmap 168h** (7 thứ × 24 giờ) của occupancy — brush theo ô thời gian.

Ô bị brush loại **không biến mất** — chúng chuyển sang xám nhạt ~~`#e1e0d9` opacity 0,35~~
**`#898781` @ 0,25** (số cũ đo được ΔE 2,1 trên nền bản đồ, tức nó *biến mất thật*; sửa ở
M4 kèm phép đo, xem §4e). Xoá ô khỏi bản đồ là nói dối về mật độ.

Nút ẩn/hiện dock nằm ở mép trái của bản đồ, dạng tab dọc dán cạnh.

#### 3d-1. Brush tác động lên cái gì — cụ thể hoá lúc thi công M4 (2026-08-07)

Ba câu trên viết khi app mới có một đơn vị đọc. Nay có bốn (§6b), và ba brush **không**
cùng nói về một thứ. Cụ thể hoá, giữ nguyên tinh thần "AND, và ô bị loại không biến mất":

> Một brush là một **vị từ trên MARK**. Mọi mark của hình học đang được tô đều bị đem thử
> với mọi brush **áp dụng được**; giao bằng AND. Brush không áp dụng được cho hình học đó
> thì **không hoạt động** (không phải "trả về false"), và dock **nói ra** vì sao.

| brush | vị từ | áp dụng cho đơn vị |
|---|---|---|
| histogram 1D | giá trị của **chính trường đang tô** ∈ [lo, hi] | mọi đơn vị — nó *là* giá trị đang được tô |
| scatter 2D | `(population, dist_station_network_m)` của ô ∈ hộp | `cell` |
| cửa sổ 168h | *(xem dưới — không phải vị từ trên mark)* | — |

Nhánh "không hoạt động thì nói ra" là cùng một luật đã dùng ở §13b-1 (hex dưới ngưỡng
zoom) và §6c (mặt tô TẮT): **cái gì không vẽ thì phải nói vì sao**, vì im lặng đọc thành
"đã lọc rồi và không còn gì".

**Vì sao scatter chỉ áp cho `cell`.** Hai trục của nó là hai cột của cùng một hàng, và
`population` × `dist_station_network_m` chỉ cùng tồn tại trên một hàng của bảng ô. Ép nó
xuống trạm qua `stations.h3_r8` thì hộp sẽ gần rỗng theo định nghĩa (ô CÓ trạm thì
`dist_station_network_m` ≈ 0), tức một bộ lọc luôn trả về "không còn gì" — đúng loại
nói dối về phủ mà §13b-1 cấm.

**Cửa sổ 168h KHÔNG làm xám mark, và đây là chỗ §3d bị sửa.** Một khoảng `dow × hour` là
vị từ trên **trục thời gian**, không phải trên mark: bản đồ tại mọi thời điểm chỉ hiện
**đúng một giờ** (`t`), nên "giờ này thuộc cửa sổ hay không" là một câu trả lời chung cho
cả 939 chấm — làm xám theo nó thì hoặc xám hết, hoặc không xám cái nào. Nên cửa sổ tác
động qua đúng cái nó nói về: **nó giới hạn `t`** — scrubber lặp trong cửa sổ, và ô heatmap
ngoài cửa sổ mờ đi. Hai đường khác đã cân nhắc và loại:

| Cách | Vì sao không |
|---|---|
| Xám trạm không thoả "bận trong cửa sổ" | *"bận trong cửa sổ"* không phải cột nào cả — phải bịa một đại lượng gộp mới. §12 |
| Xám trạm theo `peak_hour`/`peak_dow` ∈ cửa sổ | hai cột này CÓ THẬT (`station_occupancy`), nhưng heatmap đang vẽ **occupancy toàn thành phố theo giờ**, không vẽ giờ đỉnh của từng trạm. Brush phải lọc theo **đại lượng mà biểu đồ đang hiện**; gán nghĩa thứ hai cho cùng một thao tác kéo là đúng lỗi "một ký hiệu hai nghĩa" mà §4d-3a vừa từ chối |

**Mark KHÔNG CÓ GIÁ TRỊ khi một brush giá trị đang bật.** Ô null không thoả được một
khoảng giá trị — không biết thì không khẳng định được là "trong khoảng". Nên nó **bị
loại**, nhưng nó giữ **vân của chính nó** (45° / 90° / chấm rỗng) và chỉ đổi **mực** sang
xám nhạt `#e1e0d9` @ 0,35. Hai kênh, hai câu: *chất liệu* nói cái ta biết tới đâu, *màu*
nói nó có được chọn không. Tô đè nó thành một ô xám trơn sẽ xoá mất câu thứ nhất.

**Dock và scrubber là đồ đạc của chế độ BẢN ĐỒ.** Trong CÂU CHUYỆN chúng không dựng —
cùng luật L3 đã ép `paintOn` (§6c): một cảnh chốt trường + khung nhìn + tập ô của nó
(§14b), nên một bộ lọc bấm được bên cạnh là **nguồn sự thật thứ hai** cho câu hỏi "cảnh
này đang cho xem những ô nào".

#### 3d-2. Biểu đồ phải ĐỌC ĐƯỢC, không chỉ CHỌN ĐƯỢC — sửa hai mục nghiệm thu, sau M4

Nghiệm thu M2 nêu "biểu đồ còn yếu" rồi hoãn; nghiệm thu M4 khai "heatmap thành phố trông
phẳng" như một hệ quả chấp nhận được. Lượt này đóng cả hai, và hoá ra chúng là **cùng một
vấn đề ở hai chỗ**: một hình mà mọi con số trong nó phải đoán thì nó là trang trí.

**(a) Dòng READOUT dưới mỗi biểu đồ — bốn hình, cùng một khuôn.** Bốn biểu đồ của app
(histogram · scatter · heatmap 168h · Lorenz) **chọn được nhưng không đọc được**: không có
cách nào biết cột kia cao bao nhiêu, ô kia bằng mấy phần trăm, đường cong đi qua đâu ở 30%
diện tích. Ba luật:

- **Một dải CỐ ĐỊNH ngay dưới hình, không phải tooltip nổi.** §3 cấm thẻ nổi một cách vô
  điều kiện, và một tooltip theo con trỏ còn che mất chính phần dữ liệu đang được hỏi.
  Dải cố định giữ nguyên chiều cao khi rỗng nên layout không giật.
- **Chưa rê thì in GỢI Ý, không in số cũ** — cùng họ với `Pending` của cột cảnh: một con số
  đứng đó mà không biết nó thuộc vị trí nào thì tệ hơn không có số.
- **Readout dùng LẠI đúng `Axis` mà brush dùng**, nên số đọc ra không thể lệch khỏi khoảng
  chọn được. Đây chính là lý do `Axis` được khai tường minh thay vì đọc `plot.scale().invert`.

Kèm theo: histogram có **mốc trung vị** (vai "đường tham chiếu" của §4d-2 — hairline, không
mang màu dữ liệu), và cả histogram lẫn scatter **in ra số mark không có chỗ trên trục**
(ô null / ô thiếu một trục). Chúng không được vẽ ở 0 — nhưng im lặng về chúng thì hình
trông như nói về toàn bộ dữ liệu.

**(b) Hồ sơ biên 24 giờ, dán ngay dưới heatmap — cách sửa "trông phẳng" mà KHÔNG đổi thang.**

Heatmap 168h dùng **chung phép chia bậc** với chấm trạm (§8a luật 1), nhưng tầng thành phố
chỉ chạy 11%–36% của thang ấy nên nó tiêu 2–3 bậc trong 7. Hai cách sửa, và một cách sai:

| | làm gì | giá |
|---|---|---|
| ✗ | cấp thang riêng cho heatmap | rẻ về tương phản, **đắt về nghĩa**: cùng một màu cam nói hai điều khác nhau ở hai chỗ trên cùng một màn hình, và toàn bộ giá trị của "một ô heatmap và một chấm bản đồ cùng màu thì cùng nghĩa" mất sạch |
| ✓ | giữ nguyên màu, chuyển biến thiên sang **kênh VỊ TRÍ** | kênh đó đang trống, và nó là kênh mạnh nhất cho so sánh định lượng |

Đây là **cùng một lập luận** app đã dùng hai lần trước đó: danh tính overlay từ hình học chứ
không từ hue (§4d-1), và trạng thái trạm từ nét chứ không từ màu (§4d-3a). Khi một kênh đã
bị trưng dụng cho một nghĩa, thứ cần nói thêm phải tìm kênh khác — không được giành lại kênh cũ.

Hình: 24 cột, **chung trục giờ với heatmap ngay trên** (cùng lề, nhập từ một chỗ chứ không
chép), đường trung bình 7 thứ + dải thấp nhất–cao nhất. Trục y **bắt đầu từ 0** — cắt gốc sẽ
phóng đại nhịp ngày, đúng cái tội mà hình này được dựng ra để tránh theo chiều ngược lại.
Số đo nó cho đọc được mà heatmap thì không: **đỉnh 23h 33% ↔ đáy 3h 12% (2,7×)**, chênh lệch
giữa các thứ tại một giờ tối đa 15%.

*Cùng bẫy, lần thứ hai, ở chỗ khác:* small multiples của §3f-5 cũng dùng chung thang y và
bản đầu cao 34 px — năm hình trông phẳng như nhau vì thang bị kéo lên bởi dạng cao nhất.
Cách sửa **không phải** cấp thang riêng (§3f-5 cấm, và cấm đúng) mà là cho kênh vị trí thêm
chỗ: 62 px cho dải 0–48% ⇒ một chênh lệch 5 điểm phần trăm vẫn còn ~6 px.

### 3e. Scrubber (đáy, 56px)

168 giờ chia **7 khối thứ**, mỗi khối 24 vạch giờ. Nhãn `T2 T3 T4 T5 T6 T7 CN`
(dữ liệu gốc `dow = 0` là **Thứ Hai** — xem `docs/COT.md`). Play **lặp vô hạn**,
tốc độ mặc định 4 giờ/giây. Vị trí hiện tại đồng bộ hai chiều với heatmap 168h ở dock.

Scrubber chỉ tác động lên các lớp **có chiều thời gian** (occupancy trạm). Nó **không**
đổi choropleth ô — `util_cell` là trung bình 30 ngày, không có chiều 168h.

**Kênh thị giác của scrubber — chốt 2026-08-07, thi công M4.** Câu trên nói scrubber "tác
động lên lớp trạm" nhưng suốt M0–M3 không nói *bằng kênh nào* — mà mọi kênh khả dĩ đều
vướng luật: overlay không được mang thang giá trị (§4d), ramp cam chỉ dành cho trường
đang tô (ràng buộc 2). Lối ra là cùng cánh cửa `commune`/`road` đã đi: **trường ảo
`station:occ`** (nhóm SO SÁNH, §13c-1) với **đơn vị đọc `station`** (§6b). Khi chọn nó:
hex/xã/đường không vẽ, 939 chấm trạm tô ramp tuần tự theo `occ / n_ports` tại giờ `t`,
scrubber điều khiển `t` — lúc đó trạm **là** trường, không phải overlay, nên không luật
nào bị phá; vẫn một ramp một legend. Khi trường đang chọn KHÔNG phải `station:occ`,
scrubber vẫn chạy nhưng hiện chú thích `chỉ tác động khi chọn trường nhịp trạm` kèm nút
chuyển nhanh sang trường đó — một bước, không bắt người xem tự tìm.

**Cửa sổ 168h của dock giới hạn `t`** — §3d-1. Khi có brush cửa sổ, play lặp **trong cửa
sổ** thay vì trên cả 168 giờ, và phần scrubber ngoài cửa sổ mờ đi. Đây là toàn bộ tác
động của brush thứ ba, và nó đi qua đúng khoá `t` chứ không đẻ thêm trạng thái nào: một
khái niệm ("đang xem giờ nào") vẫn chỉ có một nguồn sự thật.

**`t` là chỉ số 0–167, không phải cặp `(dow, hour)`.** `t = dow × 24 + hour`, `dow = 0` là
Thứ Hai. Một số thì không có trạng thái sai nào biểu diễn được (cặp thì `dow=9` biểu diễn
được và phải viết luật cấm) — cùng lập luận đã dùng cho khoá `s` ở §9a.

### 3f. Chế độ DỮ LIỆU — spec chốt 2026-08-07, **XONG ở M4.2**

Với một mentor đang đánh giá *phương pháp*, trang "dữ liệu này đáng tin tới đâu" thuyết
phục hơn mọi hiệu ứng — đây là table-view twin của cả app (mọi giá trị phải đọc được
ngoài tooltip) và là chỗ các quyết định lọc/phủ trở thành thứ nhìn thấy được. Không có
bản đồ. Năm khối, từ trên xuống:

1. **KPI row** — hàng stat tile: số trạm công cộng · tổng cổng · tổng MW · % trạm báo
   cáo đủ chuẩn · số điểm sạc cá nhân đã loại. **Mọi số đọc từ `manifest.json`, không gõ
   tay số nào** (§7c). Số trạm/`occ_status_ok`/`private_ac_dropped` đã có trong manifest;
   tổng cổng và MW thì chưa — `web_export` **đã ghi thêm khối `totals`** ở M4.2 (tính lúc
   export, đúng luật ràng buộc 4). Con số cá nhân-đã-loại đứng ở đây là chủ ý: bản đồ này
   không vẽ 2.408 điểm sạc, im lặng về điều đó là nói dối về cung.
   **Thêm ở M4.2, không có trong spec gốc:** mỗi tổng đi kèm **số hàng khuyết của chính cột
   đó** — 19/710 trạm Hà Nội khuyết `n_ports`, 19 khuyết `power_kw_site`. Một phép cộng
   trên cột có null là một **chặn dưới**, không phải một số đo; in tổng mà im lặng về mẫu
   số là đúng loại nói dối mà ràng buộc 1 cấm trên bản đồ, chỉ khác là bằng chữ.
2. **Bảng phủ đủ cột lưới** (số hiện hành của §6 — đọc từ `manifest.coverage`, tự đổi theo
   dữ liệu) — mỗi dòng một cột của `grid`, meter ngang cùng-ramp cho
   `cell_share`/`pop_share` (meter là track cùng họ màu, không phải bar chart mỗi dòng
   một hue), badge ⚠ đúng quy tắc §7. Đây là bản đầy đủ của thứ rail chỉ hé ra.
3. **Bảng dữ liệu** sort/filter được — bản đọc phẳng của bảng chính, kèm link
   `docs/COT.md`.
4. **Stacked bar ngang connectors** — TYPE2 · CCS2 · UNKNOWN. `UNKNOWN` vẽ **vân xám**,
   không phải bậc màu thứ ba: "không khớp registry" là vắng thông tin, cùng khái niệm
   với ô null (ràng buộc 1), không phải một chuẩn phích thứ ba.
5. **Small multiples 5 dạng `shape_class`** — 5 sparkline hồ sơ ngày xếp dọc, **cùng
   thang y** (khác thang là mời so sánh sai), **một màu c5** cho cả 5 (§4d-2: một chuỗi
   một màu; danh tính nằm ở **vị trí + nhãn tiếng Việt**, không tiêu hue — 5 hue cho 5
   dạng là đúng anti-pattern "categorical khi câu chuyện là hình dạng"). Nhãn dịch:
   `DEM_TROI` → đêm trội · `HAI_DINH` → hai đỉnh · `BAN_NGAY_PHANG` → ban ngày phẳng ·
   `THAT_THUONG` → thất thường · `KHONG_XEP_LOAI` → không xếp loại.

Chế độ này không thêm khái niệm dữ liệu nào — mọi khối đọc từ file đã ship + manifest.
Vì thế nó rẻ, và vì thế nó xếp sau M4 chứ không tranh chỗ của dock/scrubber.

---

## 4. Màu — đã tính, không đoán

Phương pháp và các ngưỡng lấy từ skill `dataviz`. **Mọi số dưới đây là kết quả chạy
`scripts/validate_palette.js`, không phải cảm nhận.** ΔE là khoảng cách Euclid trong
OKLab ×100; mô phỏng mù màu dùng Machado–Oliveira–Fernandes 2009 ở severity 1,0.

Surface dùng để đo: **`#f2f3f0`** — nền thật của positron, không phải nền chart mặc định
của skill.

### 4a. Ramp choropleth — CAM tuần tự, 7 bậc

```
c1 #e7997e   c2 #dd7c58   c3 #d35c2d   c4 #b94918   c5 #9b380b   c6 #7e2a03   c7 #601e01
```

Dẫn xuất: giữ nguyên **profile L và C của ramp blue 100→700 đã được ghi trong
`palette.md`**, xoay hue sang hue của slot cam `#eb6834` (OKLCH h = 40,6°), rồi lấy 7 bậc
cách đều L từ 0,764 xuống 0,339. Đây là "snap-to-passing" trên ramp có sẵn, không phải
màu bịa.

**Vì sao cam chứ không phải blue mặc định của skill:** ràng buộc "mọi overlay dùng chung
một họ màu **lạnh**" chiếm mất hue lạnh. Nếu ramp chính cũng lạnh thì overlay và giá trị
tranh nhau cùng một trục màu. Cam ↔ lạnh là cặp còn nguyên vẹn nhất dưới deuteranopia
(deuteranope lẫn đỏ–lục, không lẫn lam–cam).

Kết quả validator (`--ordinal --mode light --surface "#f2f3f0"`):

```
[PASS] Lightness monotone     steps read light→dark
[PASS] Adjacent ΔL            all gaps >= 0.06        (ΔL = 0,071)
[PASS] Light-end contrast     #e7997e at 2.04:1 vs surface
[PASS] Single hue             hue spread 1°
→ ALL CHECKS PASS
```

**Một sai lệch có chủ ý so với đề bài, đã đo:** đề bài nói "thấp = gần trắng". Bậc gần
trắng thật (`#f9d7cb`, L 0,90) chỉ đạt **1,21:1** so với nền positron — dưới sàn 2:1, và
trên nền có nhà/đường/nước lẫn lộn nó sẽ đọc thành **"không có ô ở đây"**. Điều đó đụng
thẳng ràng buộc 1 (null ≠ thấp). Nên bậc thấp nhất được nâng lên `#e7997e` (2,04:1) — vẫn
là "nhạt", nhưng là một ô **được tô** một cách không thể nhầm. Muốn đổi lại thì phải chấp
nhận đánh đổi này một cách có ý thức.

### 4b. Ô null — gạch chéo xám trung tính

Không tô màu nhạt. Ô null vẽ **texture gạch chéo 45°**, nét `#898781` (muted ink của
palette) rộng 1px, bước 5px, trên nền trong suốt để basemap lộ ra.

| Cặp | normal ΔE | deuteranopia | protanopia |
|---|---:|---:|---:|
| hatch ↔ nền basemap | 33,9 | 33,9 | 34,1 |
| c1 (thấp nhất) ↔ hatch | 16,3 | 15,2 | 10,0 |
| c2 ↔ hatch | 14,0 | 11,2 | **6,4** |
| c7 (cao nhất) ↔ hatch | 30,4 | 28,7 | 34,0 |

Cặp yếu nhất là c2 ↔ hatch dưới protanopia (6,4 — trong dải sàn 6–8). **Mitigation là
texture chứ không phải hue**: gạch chéo là kênh mã hoá thứ hai, đúng như thiết kế của
ràng buộc 1. Một ô null và một ô giá trị thấp không bao giờ chỉ khác nhau ở màu.

Áp dụng cho: `util_cell` (**3.990 ô**), `dist_station_network_m` (50 ô) và `detour_ratio`
(137 ô). Danh sách này đổi theo dữ liệu — số hiện hành luôn ở `manifest.coverage`, đừng
trích số ở đây làm số đo (§7c).

### 4c. Mực chữ đè lên swatch legend

Đã đo tương phản từng bậc; điểm đổi mực là **bậc 4**:

| bậc | hex | vs surface | vs `#0b0b0b` | vs `#ffffff` | mực chọn |
|---|---|---:|---:|---:|---|
| c1 | `#e7997e` | 2,04 | **8,67** | 2,27 | `#0b0b0b` |
| c2 | `#dd7c58` | 2,66 | **6,65** | 2,96 | `#0b0b0b` |
| c3 | `#d35c2d` | 3,53 | **5,00** | 3,93 | `#0b0b0b` |
| c4 | `#b94918` | 4,68 | 3,78 | **5,21** | `#ffffff` |
| c5 | `#9b380b` | 6,36 | 2,78 | **7,08** | `#ffffff` |
| c6 | `#7e2a03` | 8,49 | 2,08 | **9,46** | `#ffffff` |
| c7 | `#601e01` | 11,20 | 1,58 | **12,47** | `#ffffff` |

Mọi ô đều ≥ 4,5:1 — đạt ngưỡng chữ thường của WCAG, không chỉ ngưỡng chữ lớn.

### 4d. Overlay — một họ màu lạnh duy nhất

Ba bậc, lấy nguyên văn từ ramp blue đã ghi trong `palette.md`:

| Vai | hex | bậc | vs surface |
|---|---|---|---:|
| overlay nhạt | `#3987e5` | blue-400 | 3,27 |
| overlay vừa | `#1c5cab` | blue-550 | 5,95 |
| overlay đậm | `#0d366b` | blue-700 | 8,90 |

`node scripts/validate_palette.js "#3987e5,#1c5cab,#0d366b" --ordinal … → ALL CHECKS PASS`
(blue-250 `#86b6ef` đã bị loại: 1,89:1, dưới sàn.)

**Danh tính overlay đến từ HÌNH HỌC, không từ hue** — điểm/đường/vùng, mỗi overlay một
hình khác nhau. Đó là lý do một họ màu duy nhất là đủ và là lý do overlay không bao giờ
biến thành choropleth thứ hai.

Tách biệt so với ramp cam — **cặp yếu nhất trên toàn bộ 21 cặp (7 bậc cam × 3 bậc lạnh) là
15,9** (c1 ↔ blue-400 dưới protanopia), tức trên sàn 15 của normal-vision. Không có cặp nào
lẫn. Overlay vs hatch: yếu nhất 15,9.

**Alpha.** Overlay dạng **điểm và đường** giữ opacity đầy đủ + vòng viền 2px màu surface
(`#f2f3f0`) để tách khỏi ô bên dưới — nét mảnh ở alpha 0,5 thì biến mất, đó là lỗi chứ
không phải nhất quán.

### 4d-1. Overlay dạng VÙNG là VÂN, không phải mảng màu — sửa ở M2

~~Alpha `~0,5` cho overlay dạng vùng (fill).~~ **BỎ.** Overlay vùng vẽ bằng **gạch chéo
135°** (nghiêng ngược với vân null 45°), nét màu `#1c5cab` (lạnh vừa), cộng một đường biên
1px cùng màu. Không có mảng màu phẳng nào.

*Vì sao đổi — một va chạm có thật, không phải giả định.* §6a quy tắc 5 nói trường **hạng
mục** tô bằng chính ba bậc lạnh của §4d, vì thứ tự ở đó không có nghĩa. Nhưng §4d cũng cấp
ba bậc lạnh đó cho overlay. Khi một trường hạng mục đang tô (`evidence_grade_distance`,
lạnh, phẳng) mà một overlay **fill** bật lên (cũng lạnh, cũng phẳng, alpha 0,5), người xem
gặp hai mảng lạnh chồng nhau và **không có cách nào biết mảng nào là trường**. Đó đúng là
"overlay biến thành choropleth thứ hai" — thứ §4d tự nhận là không thể xảy ra vì "danh
tính đến từ hình học". Lập luận đó hở ở đúng một chỗ: khi overlay **cũng là vùng** thì hình
học không còn phân biệt được gì.

*Vì sao chọn vân chứ không chọn cách khác.* Ba đường thoát, chọn đường thứ ba:

| Cách | Vì sao không |
|---|---|
| Cấp cho overlay vùng một hue riêng | phá quy tắc "một họ màu lạnh duy nhất" và mở lại cuộc đua hue với ramp cam |
| Tự tắt overlay fill khi trường là hạng mục | UI đổi trạng thái do một lựa chọn không liên quan — khó đoán, và giấu mất một lớp người dùng đã bật |
| **Vân thay mảng màu** | §4b đã dùng chính lập luận này cho ô null: *"mitigation là texture chứ không phải hue"*. Áp cùng một nguyên tắc ở đây là nhất quán, không phải ngoại lệ mới |

*Đây là luật vô điều kiện*, không phải luật chỉ chạy khi trường là hạng mục. Luật có điều
kiện thì phải nhớ điều kiện; luật vô điều kiện thì nhìn là biết. Câu §4d được nâng cấp:

> **Danh tính overlay đến từ HÌNH HỌC và CHẤT LIỆU.** Điểm · đường · vùng-gạch-chéo. Không
> overlay nào là một mảng màu phẳng, nên không overlay nào đọc được như một trường.

Ba vân trong app phân biệt bằng **góc và màu**, không chỉ một trong hai: null = 45° xám
`#898781`; overlay vùng = 135° lạnh `#1c5cab`. Hai vân chéo nhau thì chỗ chồng nhau thành
lưới caro — vẫn đọc ra được là "hai thứ cùng ở đây", đúng ý.

~~Overlay dự kiến (M2+): trạm sạc (điểm) · ranh giới xã (đường) · vùng ngoài 5 phút lái
(vùng-vân) · vùng `buildable` (vùng-vân) · trạm biến áp OSM (điểm, kèm cảnh báo n=133 —
**chưa ship được**…).~~ **DANH SÁCH ĐÃ DỌN Ở M5** — nó viết từ M1 và ba trong năm mục đã
lỗi thời theo ba kiểu khác nhau, nên để nguyên là để ba lời hứa sai nằm trong nguồn sự thật:

| mục cũ | thực tế | vì sao lỗi thời |
|---|---|---|
| trạm sạc (điểm) | **ĐÃ SHIP ở M2** | — |
| ranh giới xã (đường) | **ĐÃ SHIP ở M2** | — |
| vùng ngoài 5 phút lái | **ĐÃ SHIP ở M2, tên `beyond2km`** | khái niệm PHÚT bị bỏ ở M2.1(i); thước nay là MÉT, ngưỡng 2 km |
| vùng `buildable` | **KHÔNG CÒN ĐỐI TƯỢNG** | cột `buildable` và `not_buildable_reason` bị bỏ ở M2.1(i). Dựng overlay này là bịa hình học cho một khái niệm không còn tồn tại — §12 |
| trạm biến áp OSM (điểm) | **ĐÃ SHIP ở M5** | `web_export` giờ xuất toạ độ; số đo mới ở dưới |

**Danh sách overlay hiện hành — 8 cái, và đây là toàn bộ:** trạm sạc (điểm tròn) · ranh
giới xã (đường) · `beyond2km` (vùng-vân 135°) · 4 nhóm POI (vuông ■ · thoi ◆ · tam giác ▲ ·
chữ thập ✚, §4d-4) · **trạm biến áp OSM (sao ★, M5)**.

**Cảnh báo n nhỏ của trạm biến áp — ĐO LẠI ở M5, không chép số cũ.** Con số 133 trong câu
gạch trên đến từ A12, chạy trên `data/raw/osm_hanoi_power.parquet` — một file **không còn
tồn tại** (bị xoá cùng lúc `dist_substation_m` bị bỏ ở M2.1). Trích lại từ chính PBF freeze
28/07/2026 bằng `s03c` cho **132**, và chênh lệch 1 có nguyên nhân đọc được chứ không phải
nhiễu: bước mới **dedup node ⊂ đa giác cùng nhóm** (cùng luật s03b, §11 M3.5) và đúng 1 node
nằm trong khuôn viên của chính nó. Tức 133 là 132 thực thể đếm thành 133 mark. Số hiện hành
luôn đọc từ `manifest.source_metrics.osm_substations`, không trích số ở đây làm số đo (§7c).

**Overlay không được mang thang GIÁ TRỊ.** Bán kính chấm trạm không tỉ lệ với `n_ports`.
Mã hoá giá trị bằng kích thước là dựng một kênh dữ liệu thứ hai — tức đúng cái ràng buộc 2
cấm, chỉ khác là bằng diện tích thay vì bằng màu.

**Nhưng co theo MỨC PHÓNG thì được, và không cần bàn lại** — làm rõ ở M2.1 vì câu trên
từng bị chính tôi đọc thành "bán kính phải là hằng số tuyệt đối". Hai thứ khác hẳn nhau:

| | mã hoá cái gì | có phải kênh dữ liệu không |
|---|---|---|
| bán kính theo `n_ports` | **giá trị của mark** | có ⇒ **cấm** |
| bán kính theo zoom | **mật độ mark trên màn hình** | không — mọi mark co cùng nhau, không mark nào nói gì khác mark nào |

Ở zoom 9,3 có 939 chấm 9 px chen nhau: đặc/rỗng không phân biệt nổi, và chấm vành đệm rải
khắp vùng trắng làm mất hình dáng Hà Nội. Đó là lỗi ĐỌC, và cách sửa đúng là co mark lại
chứ không phải bỏ một nửa dữ liệu.

### 4d-2. BIỂU ĐỒ dùng đúng bảng màu này — chốt ở M3

M3 vẽ biểu đồ đầu tiên của app (đường Lorenz — cảnh `von-cuc` ở §14b, spec mark ở §13d).
Trước khi có cái thứ hai, chốt luật,
vì đây đúng là chỗ một palette thứ hai hay mọc ra: thư viện chart nào cũng có màu mặc định
của nó, và "chart thì khác bản đồ mà" nghe rất hợp lý.

**Không có palette riêng cho chart.** Biểu đồ ăn đúng §4a (ramp cam) · §4d (họ lạnh) ·
§4e (chrome & mực), không thêm hex nào. Lý do không phải là gọn: mọi hex ở §4 đã qua
`validate_palette.js` **trên surface `#f2f3f0`**, và một màu mới sẽ phải đo lại toàn bộ —
21 cặp, deuteranopia + protanopia, mực chữ §4c. Cùng lập luận đã dùng để chọn "đảo thứ tự
gán màu" thay vì một ramp phân kỳ (M2.1-B).

Bốn vai, và mỗi vai lấy màu từ đúng một chỗ:

| Vai trong chart | Lấy từ | Ghi chú |
|---|---|---|
| Một chuỗi dữ liệu | `c5 #9b380b` (§4a) | **Một** chuỗi thì không có legend — tiêu đề đã gọi tên nó |
| Đường/mức **tham chiếu** | hairline `#e1e0d9` (§4e) | Không phải chuỗi thứ hai, nên không được mang màu dữ liệu |
| Điểm được **gọi tên** | `c7 #601e01` + vòng viền 2px màu surface | Nhấn bằng **độ đậm trong cùng ramp**, không bằng hue thứ hai |
| Trục · lưới · nhãn · số | mực §4e (`#52514e` · `#898781`) | Chữ **không bao giờ** mang màu dữ liệu |

**Cực tính của M2.1-B áp cho chart y như bản đồ:** đậm = chỗ cần can thiệp. Đường Lorenz
cong về phía "vón cục" thì phần được tô đậm là phần nói lên sự vón cục, không phải phần
lớn nhất.

**Không dùng màu mặc định của Observable Plot.** Khai màu tường minh ở mọi mark; Plot không
biết gì về surface positron và bảng mặc định của nó là một họ hue khác hẳn.

### 4d-3. Trạng thái vận hành = NÉT, thiếu quan sát = VÂN — chốt 2026-08-07

Hai mục nhỏ, cùng một nguyên tắc đã có (danh tính từ hình học/chất liệu, không tiêu hue):

**(a) Trạm MAINTENANCE / OUT_OF_SERVICE — viền ĐỨT NÉT, toggle riêng trong tab LAYER**
(**XONG ở M4.1**, cùng lượt panel TRẠM). Trạng thái là *state*, không phải series: cấp cho
nó một hue mới là phá "một họ màu lạnh duy nhất" (§4d), còn mượn `#fab219` là dùng màu
cảnh báo cho một series — cả hai đều là anti-pattern. Nét đứt trên viền chấm là kênh còn
trống, đọc được ở mọi cỡ chấm, và không đụng hệ màu nào. Chi tiết trạng thái cụ thể
(bảo trì hay ngừng hẳn) nằm ở panel TRẠM (§8a), không cố nhét hai bậc trạng thái vào
hai kiểu nét — một kiểu nét, một nghĩa: "không vận hành bình thường".

*Ba chi tiết chốt lúc thi công (M4.1), cả ba đến từ dữ liệu hoặc từ ảnh render:*

- **`UNKNOWN` (5/939) KHÔNG mang vòng.** Viền đứt là một *khẳng định* ("trạm này không
  chạy bình thường"), còn `UNKNOWN` nghĩa là nguồn **không nói gì**. Vẽ nét đứt cho nó là
  biến "không biết" thành "biết là hỏng" — cùng lỗi mà ràng buộc 1 cấm, chỉ khác kênh.
  Panel TRẠM nói ra bằng chữ, chỗ đúng của một sự thật không có ký hiệu riêng.
- **Vòng là `IconLayer`, không phải viền của `ScatterplotLayer`** — deck không có nét đứt
  cho viền chấm, và một vòng "gần đứt" ghép từ nhiều cung là dựng một lớp hình học mới cho
  một thứ vốn chỉ là texture. Cùng thủ pháp atlas mà M5 dùng cho sao 5 cánh.
- **Số gạch cố định (6), độ dài gạch SUY RA từ chu vi** — không đặt độ dài rồi để chu vi
  tự chia. Bản đầu làm ngược lại và ảnh render bắt được: một độ dài cố định gần như không
  bao giờ chia hết chu vi, nên gạch cuối bị cắt cụt và vòng có một chỗ dày bất thường mà
  mắt đọc thành "có gì đó ở hướng đó".

**(b) Ô thiếu quan sát trong heatmap 168h — VÂN XÁM, không tô nhạt** (dock §3d và
mini-heatmap §8a, thi công M4). `occ` của một ô giờ chỉ đáng tin khi `observed_h` đủ
(`docs/COT.md`: "đọc `occ` kèm trường này"). Tô nhạt ô thiếu quan sát là để nó đọc
thành "vắng khách" — đúng cái nói dối mà ràng buộc 1 cấm trên bản đồ, chỉ khác trục:
đây là **ràng buộc 1 mở rộng sang chiều thời gian**. Ngưỡng `observed_h` chốt lúc thi
công M4 từ phân bố thật (không đặt tay ở đây) và in vào câu đơn vị của heatmap.

**Ngưỡng đã ĐO — `OBSERVED_H_MIN = 1 h`, chốt lúc thi công M4 (2026-08-07).**
Đo trên chính `station_occupancy_profile_168h.parquet` (116.785 dòng · 703 trạm). Cách
đo, và vì sao không phải một phân vị của `observed_h`:

`observed_h` chạy 0,08 → **5,0 h** (một ô giờ của tuần lặp lại 4–5 lần trong cửa sổ 30
ngày), trung vị 4,0 — phân bố dồn cục ở đỉnh, nên phân vị của nó không có "chỗ gãy" nào để
cắt. Câu hỏi đúng không phải "ô nào ít quan sát" mà **"từ đâu thì nhiễu lấy mẫu thôi lấn
át biến thiên thật"**. Nên đo trên phần dư `occ / n_ports` sau khi trừ trung bình của
chính trạm tại **cùng giờ** (bỏ nhịp ngày đi), rồi khớp

```
var(t) = a + b/t        a = 0,005454  (biến thiên THẬT, sd 0,0739)
                        b = 0,003205  (nhiễu LẤY MẪU)
⇒ t* = b/a = 0,588 h    ← chỗ nhiễu lấy mẫu ĐÚNG BẰNG biến thiên thật
```

| `observed_h` | sd nhiễu lấy mẫu | so với sd thật |
|---:|---:|---:|
| 0,5 h | 0,080 | **108%** |
| **1 h** | 0,057 | 77% |
| 2 h | 0,040 | 54% |
| 5 h | 0,025 | 34% |

**Chốt 1 h**, tức lượng tử tự nhiên đầu tiên trên `t*`: `observed_h` đếm bằng **giờ**, nên
dưới 1 h nghĩa là ô giờ đó **chưa từng được quan sát trọn một giờ** — một câu phát biểu
được, không phải một hằng số tròn chọn cho đẹp. Ở đó nhiễu còn 0,057 ≈ 0,4 bậc của ramp 7
bậc trên thang 0–1, tức chưa đủ để đổi màu một chấm.

Hệ quả đo được, và chúng phải hiện ra chứ không im lặng:

- **2.468/116.785 dòng (2,11%)** rớt ngưỡng; cộng **1.319 ô giờ vắng hẳn dòng** ⇒ **3,21%**
  của 118.104 ô giờ (703 × 168).
- **236/939 trạm không có hồ sơ 168h nào** và **13 trạm nữa thiếu `n_ports`** (mẫu số
  của §13c-1) ⇒ chúng **luôn** là chấm rỗng, ở mọi giờ.
- Trên bản đồ: mỗi giờ có **522–690 chấm tô được / 939**, tức **249–417 chấm rỗng**. Ít
  quan sát nhất là **Thứ Năm 3h** (`t=75`, 417 rỗng), đầy nhất là **Thứ Bảy 16h**.
- Ở tầng **thành phố** (heatmap dock), cùng ngưỡng ấy **không ô nào rớt**: `observed_h`
  trung bình có trọng số cổng trên cả 9.878 cổng lắp đặt chạy **2,04 → 3,89 h**. Luật vẫn
  chạy chứ không bị bỏ — nó chỉ không nổ trên ảnh chụp này, và **câu đơn vị của heatmap
  nói ra điều đó** thay vì để một ô vân không bao giờ xuất hiện thành một lời hứa suông.

### 4d-4. Bốn nhóm POI — danh tính từ HÌNH DẠNG, và vì sao không phải từ hue — chốt M3.5

M3.5 thêm 4 overlay POI (§11) — lần đầu tiên **nhiều nhóm cùng hình học** bật đồng thời.
Quy tắc "danh tính từ hình học" (§4d) hở ở đúng chỗ đó: 4 nhóm đều là điểm-và-vùng, hình
học không phân biệt được gì nữa. Hai đường ra, và đường thứ nhất đã bị **đo chết**:

**Hue mới cho từng nhóm — ĐÃ THỬ VÀ LOẠI, bằng validator chứ không bằng cảm nhận.** Chạy
`validate_palette.js` (skill dataviz) trên surface `#f2f3f0` cho 4 hue lạnh ứng viên
(aqua `#1baf7a` · green `#008300` · violet `#4a3aa7` · magenta `#e87ba4`) đối chiếu chéo
với ramp cam 7 bậc + họ lạnh §4d + xám hatch:

| cặp chết | ΔE | vì sao chết |
|---|---:|---|
| aqua ↔ c1 `#e7997e` | **0,6** (deutan) | deuteranope lẫn đỏ–lục: mọi hue lục sập vào ramp cam |
| green ↔ c3/c4 | 3,0–3,3 (deutan) | cùng cơ chế |
| violet ↔ blue-550 `#1c5cab` | **9,0** (normal) | người thường cũng lẫn với overlay sẵn có — dưới sàn 15 |
| magenta ↔ c1/c2 | 10,3–10,6 (normal) | magenta nhạt đọc thành bậc cam nhạt |

Đây không phải chọn hue chưa khéo: dưới deuteranopia màu sập về trục lam↔vàng, ramp cam
chiếm trọn phía vàng ở **mọi** độ sáng, họ lạnh §4d chiếm phía lam — **kênh hue đã đầy**.
Chính lập luận "cam ↔ lạnh là cặp còn nguyên vẹn nhất" của §4a nói trước điều này; giờ có
số đo.

**Chốt: danh tính nhóm từ HÌNH DẠNG mark, màu ở lại họ lạnh.** Kênh hình dạng còn trống —
chấm tròn đã là trạm sạc, nên 4 nhóm POI lấy 4 hình khác:

| nhóm | hình | có polygon (đặc) | chỉ-điểm (rỗng) |
|---|---|---|---|
| Chung cư / nhà ở tập thể | vuông ■ | đặc + viền surface 2px | rỗng viền 2px |
| Trung tâm thương mại | thoi ◆ | như trên | như trên |
| Công cộng, khu vui chơi | tam giác ▲ | như trên | như trên |
| Bệnh viện, trường học | chữ thập ✚ | như trên | như trên |

- **Một màu duy nhất `#1c5cab`** (lạnh vừa, 5,95:1) cho cả 4 nhóm — trạm giữ `#0d366b`
  đặc / `#1c5cab` rỗng nhưng là **tròn**, nên không lẫn. Không hex mới nào phải đo lại.
- **Đặc ↔ rỗng mang đúng nghĩa đã có ở lớp trạm** (đầy đủ ↔ thiếu một tư cách): mark đặc =
  "hình học thật có trong dữ liệu", mark rỗng = "chỉ biết vị trí, **không biết cạnh ở
  đâu**". Đó là cách P4 (§11 M3.5) hiện ra ở mọi mức zoom, kể cả khi polygon còn dưới 1 px.
- **Polygon 2D**: viền **2 px đặc** `#1c5cab` (cạnh phải nhìn rõ) + fill **vân 135°** cùng
  màu — §4d-1 vô điều kiện, không mảng phẳng nào, kể cả ở cỡ toà nhà. Mark hình dạng của
  nhóm đặt tại **tâm polygon**, vì vân + viền không nói được nhóm.
- **Mặt tô vẫn thắng**: cả 4 nhóm tiêu mực bằng nét, vân và mark nhỏ — không mảng đặc nào,
  không hue nào phía cam.

Kích thước mark: **hằng số theo mức zoom** (co theo zoom được — M2.1-F6), không bao giờ
theo sức chứa/diện tích/giá trị nào (§4d-1).

#### Sổ cái KÊNH HÌNH DẠNG — mở ở M5, vì kênh này cũng đang cạn

M3.5 đã đo chết kênh hue và chuyển danh tính sang hình dạng. Hệ quả không ai ghi lúc đó:
**hình dạng giờ là tài nguyên khan hiếm thứ hai**, và nó không có validator nào canh. Sổ cái
này là chỗ nhìn một cái là biết còn gì — cùng vai `palette.md` giữ cho màu.

| hình | lớp | biến thể | mốc |
|---|---|---|---|
| ● tròn | trạm sạc | đặc = HANOI · rỗng = BUFFER | M2 |
| ■ vuông | POI chung cư | đặc = có polygon · rỗng = chỉ-điểm | M3.5 |
| ◆ thoi | POI TTTM | như trên | M3.5 |
| ▲ tam giác | POI công cộng | như trên | M3.5 |
| ✚ chữ thập | POI bệnh viện/trường học | như trên | M3.5 |
| **★ sao 5 cánh** | **trạm biến áp OSM** | **không có biến thể** | **M5** |

**Vì sao SAO chứ không phải hình nào khác — chọn theo khoảng cách bóng ngoài, không theo
khẩu vị.** Bốn ứng viên, ba bị loại vì cùng một lỗi: chúng chỉ khác một mark đã dùng ở
**góc quay**, mà góc quay là thứ mắt đọc sau cùng ở cỡ 8–12 px.

| ứng viên | láng giềng gần nhất | vì sao loại |
|---|---|---|
| ✕ chữ X | ✚ chữ thập | đúng cùng hình, xoay 45° — y hệt quan hệ ■↔◆, nhưng ■/◆ là mảng đặc lớn còn ✚/✕ là bốn thanh mảnh: chỗ nào cũng "một nét đi qua tâm", nên bóng ngoài gần trùng |
| ▼ tam giác ngược | ▲ tam giác | cùng hình, xoay 180° |
| ⬟ ngũ giác · ⬢ lục giác | ● tròn | càng nhiều cạnh càng tròn; ở 10 px là một chấm. Lục giác còn đụng chính hình của ô H3 |
| **★ sao 5 cánh** | — | khác **mọi** mark đã dùng ở ít nhất một đặc trưng MẠNH: lõm (khác ●■◆▲), 5 cánh chứ không 4 (khác ✚), và đối xứng bậc lẻ (chỉ ▲ cũng lẻ, nhưng ▲ lồi) |

Ba ràng buộc kèm theo, để lựa chọn này không mở cửa sau cho thứ khác:

- **Độ lõm phải đủ sâu để sống sót sau vòng viền.** `inner = 0,42 × outer`. Nông hơn thì
  vòng viền 2 px lấp khe và bóng ngoài trở về gần một ngũ giác — tức trở về **chấm tròn**,
  tức trở thành trạm sạc. Con số này ở `viz/substation-icon.ts` kèm chính câu đó.
- **Không có cặp đặc/rỗng, và đó là quyết định.** Ở hai lớp kia cặp này mã hoá một *tư cách
  thứ hai* (thuộc Hà Nội hay không · có polygon hay không). Lớp trạm biến áp cố ý chỉ nói
  **một** điều (§11 M5), nên nó không được mượn một kênh đang mang nghĩa ở chỗ khác: một
  ngôi sao rỗng sẽ đọc thành "trạm biến áp mà ta không biết gì đó về nó", và không có "gì
  đó" nào cả. Một biến thể: đặc + vòng viền 2 px màu surface, đúng công thức §4d cho overlay
  dạng điểm.
- **Màu `#0d366b`** (lạnh đậm, 8,90:1) — hex đã có ở §4d, không màu mới nào phải đo lại.
  Trùng màu thân với chấm trạm sạc là **đúng luật**, không phải va chạm: §4d nói danh tính
  đến từ hình dạng chứ không từ hue, và §4d-4 đã đo rằng kênh hue không còn chỗ để cấp
  riêng.

**Kênh hình dạng còn lại bao nhiêu:** rất ít. Overlay thứ 9 sẽ phải hoặc chấp nhận một cặp
chỉ khác nhau ở góc quay (và đo xem có đọc được không, bằng ảnh render chứ không bằng lập
luận), hoặc mở một kênh thứ ba — mà kênh **nét đứt** **đã bị M4.1 tiêu** cho trạng thái vận
hành của trạm (§4d-3a) và kênh **vân** đã dành cho overlay vùng. Đây là một va chạm thật sắp
tới, không phải chuyện chọn icon; chỗ đúng để quyết định nó là ở đây, trước khi thi công.

*Cập nhật sau M4.1:* sổ cái này giờ có **9 overlay** trong tab LAYER, và `station_status`
là cái đầu tiên **không tiêu một hình dạng nào** — nó là một *chú thích trên mark đã có*,
không phải một mark mới. Đó là lối thoát đáng nhớ cho overlay thứ 10: hỏi trước xem thứ
định thêm có phải một đối tượng mới, hay chỉ là một trạng thái của đối tượng đã vẽ.

### 4e. Chrome & mực

| Vai | hex |
|---|---|
| Nền panel (rail, dock, nav, legend) | `#f9f9f7` |
| Nền bản đồ (positron) | `#f2f3f0` |
| Hairline ngăn vùng | `#e1e0d9` |
| Mực chính | `#0b0b0b` |
| Mực phụ | `#52514e` |
| Mực mờ (nhãn, khối NGUỒN) | `#898781` |
| ~~Ô bị brush loại~~ | ~~`#e1e0d9` @ 0,35~~ — **SỬA ở M4, xem dưới** |
| Ô bị brush loại | **`#898781` @ 0,25** |
| Trạng thái cảnh báo ⚠ | `#fab219` (status/warning — **luôn kèm icon + chữ**, không bao giờ chỉ màu) |

**Ô bị brush loại: `#e1e0d9` @ 0,35 → `#898781` @ 0,25 — sửa ở M4, và ảnh render là thứ
bắt được.** Con số cũ được viết ở §3d từ M0, trước khi có brush nào để nhìn. Ảnh chụp thật
đầu tiên (verify #3 của M4) cho thấy ô bị loại **biến mất hẳn** vào nền — tức nó phá đúng
câu mà chính §3d dựng nó ra để giữ: *"ô bị brush loại không biến mất; xoá ô khỏi bản đồ là
nói dối về mật độ"*. Đo lại bằng cùng phương pháp §4 (ΔE OKLab ×100, hợp thành trên surface
positron `#f2f3f0`):

| màu bị loại | hợp thành | ΔE ↔ nền | ΔE ↔ c1 |
|---|---|---:|---:|
| `#e1e0d9` @ 0,35 *(cũ)* | `rgb(236,236,232)` | **2,1** | 18,0 |
| `#e1e0d9` @ 1,0 | `rgb(225,224,217)` | 5,7 | 14,7 |
| **`#898781` @ 0,25** *(mới)* | `rgb(216,216,212)` | **8,1** | 12,9 |
| `#898781` @ 0,35 | `rgb(205,205,201)` | 11,5 | 10,6 |

Sàn "phân biệt được" của §4b là **6–8**, nên 2,1 không có cửa nào — và `#e1e0d9` **ở bất
kỳ alpha nào** cũng không tới sàn (tối đa 5,7 ở opacity đầy). Gốc của lỗi: `#e1e0d9` là
hairline được chọn để đọc trên **nền panel `#f9f9f7`**, còn ô bị loại nằm trên **nền bản
đồ `#f2f3f0`** — hai surface khác nhau, và §4 nói ngay từ đầu rằng surface là thứ phải đo
trên đó.

**Không hex mới:** `#898781` chính là mực mờ đã có ở bảng trên. Chọn alpha **0,25** chứ
không phải 0,35: ở 0,35 hai khoảng cách bắt kịp nhau (11,5 ↔ 10,6), tức ô bị loại xa nền
đúng bằng nó xa bậc ramp nhạt nhất, và nó bắt đầu **tranh** với dữ liệu. Ở 0,25 nó vẫn là
"có một ô ở đây" (8,1 trên sàn) mà vẫn lùi hẳn sau c1 (12,9). Ô bị loại **mà không có giá
trị** vẽ vân của chính nó bằng mực này — ΔE 25,8 so với vân null mực đặc, nên "không đo
được" và "không đo được VÀ bị loại" vẫn tách nhau (§3d-1).

Chữ: `system-ui, -apple-system, "Segoe UI", sans-serif`. `tabular-nums` chỉ cho cột số
thẳng hàng (bảng, tick trục), không cho số lớn đứng một mình.

**Chưa làm dark mode.** Nền sáng là ràng buộc của đề bài; một dark mode đúng phải chọn lại
từng bậc trên surface tối và validate lại, không phải lật màu. Chưa đến lúc.

---

## 5. Dữ liệu — `make web`

### 5a. Ship gì

`uv run python -m vn n11_web_export` ghi **một gói cho mỗi tỉnh** vào
`web/public/data/p/<mã>/`, cộng một gói toàn quốc ở `vn/`:

| File | Cách xử lý | Vì sao không phải copy nguyên |
|---|---|---|
| `grid_h3_r8.parquet` | copy | — |
| `stations` · `connectors` · `station_occupancy` · `..._profile_168h` | copy | — |
| `commune.geojson` | **convert `geometry_wkb` → GeoJSON trong Python** | §5b |
| `admin_boundary.geojson` | copy | — |
| `roads.parquet` | lọc bỏ SERVICE, đơn giản hoá **~10 m**, toạ độ giải mã sẵn (không WKB), kèm `dist_station_m` theo đoạn | lớp ĐỂ NHÌN. Số đỉnh sau khi đơn giản hoá **không còn khớp `node_ids`** ⇒ vĩnh viễn không dựng đồ thị từ nó được — `docs/adr/0005` |
| `poi.geojson` | WKB → GeoJSON; Polygon cho POI có hình, Point cho POI chỉ-điểm; toạ độ làm tròn 6 chữ số (~0,11 m, không bỏ đỉnh nào) | §5b |
| `routes_showcase.geojson` | 3 cặp đường minh hoạ (đường thật ↔ chim bay), luật chọn cố định | dựng **chỉ cho tỉnh 01** (`n14.SHOWCASE_PROVINCES`) — nó cần cây Dijkstra một-nguồn, không phải sản phẩm của mọi tỉnh |
| `substations.geojson` | **Point và chỉ Point** — đa giác đã nén thành tâm ngay ở `n13`. Properties: `osm_type` · `osm_id` · `name`. **Không cột nào khác** | `DECISIONS §8` |
| `manifest.json` | sinh mới: `files`, `available_*_columns`, `coverage`, `unusable_layers`, `story_enabled` | mọi cổng của UI đọc từ đây — §7, 11b-4 |

Đo được: gói tỉnh 01 là **7,7 MB**; cả 34 tỉnh là **161 MB**, gói toàn quốc **15 MB**. Ba
file to nhất của một gói — `poi.geojson` (3,0 MB), `roads.parquet` (2,8 MB), `grid` (0,96 MB)
— và hai file đầu **nạp LƯỜI**: chỉ tải khi một nhóm POI hoặc lớp đường được bật. Phần lớn
phiên xem không trả chi phí đó.

**Gói của tỉnh 01 còn được ghi thêm một bản KHÔNG tiền tố** ở ngay `web/public/data/`, để URL
không có `#tinh=` vẫn chạy. Đó là một bản sao có chủ ý, không phải rác: nó giữ `/` là một
trang chạy được mà không cần một nhánh "tỉnh mặc định" trong mã đọc đường dẫn.


### 5b. Hai quyết định về dữ liệu

**KHÔNG ship `grid_h3_r8.geojson` (8,3 MB).** Chỉ cần cột `h3_r8`; `H3HexagonLayer` của
deck.gl tự dựng đa giác từ mã H3. GeoJSON đó là bản GIS cho QGIS, không phải cho web.
Ship nó là chở 8,3 MB hình học mà client tự sinh được trong vài chục ms.

**Convert `geometry_wkb` → GeoJSON trong Python, không trong browser.** Chỉ 126 đa giác,
làm một lần lúc build. Đổi lại: phía web không phải thêm dependency parse WKB. Đây là chỗ
duy nhất trong pipeline mà web-export **biến đổi** dữ liệu chứ không copy — và nó không tạo
khái niệm mới, chỉ đổi mã hoá hình học.

### 5c. Truy vấn

DuckDB-WASM đọc Parquet qua HTTP range request (`registerFileURL` + `httpfs`), không tải
hết file vào RAM. Với 4.400 dòng thì tải hết cũng được — nhưng file 168h có 363.518 dòng,
ở đó range request mới đáng.

Mọi truy vấn viết bằng SQL, không tự viết layer ORM. Truy vấn nào chạy > 1 lần thì đặt tên
và để trong `src/data/queries.ts`.

---

## 6. Năm nhóm trường — bản đồ hoá đủ mọi cột lưới

Mọi cột của `grid_h3_r8.parquet` chia hết vào năm nhóm, không bỏ sót cột nào. **Số cột
không gõ ở đây** — nó suy ra từ `src/evcs/schema/grid.py` và đi vào UI qua
`web/src/data/columns.generated.ts`; xem `docs/COT.md`.

| | Nhóm | Cột | Choropleth được |
|---|---|---:|---|
| 1 | **CẦU** — ai cần sạc | 12 | `population` · `pop_density_ppkm2` · `n_apartment` · `apartment_levels_sum` ⚠ · `n_poi_total` · `n_mall` · `n_dept_store` · `n_supermarket` · `n_market` · `n_parking_off` · `n_parking_street` · `n_fuel` |
| 2 | **ĐẤT** — đặt được không | 10 | `built_frac` · `water_frac` · `crop_frac` · `tree_frac` · `grass_frac` · `shrub_frac` · `bare_frac` · `wetland_frac` · `area_km2` · `area_frac` |
| 3 | **ĐƯỜNG** — xe tới được không | 10 | `road_len_m` · `road_len_in_hanoi_m` · `road_len_arterial_m` · `road_len_motorway_m` · `_trunk_m` · `_primary_m` · `_secondary_m` · `_tertiary_m` · `_local_m` · `_service_m` |
| 4 | **CUNG** — đã có gì | 4 | `n_stations` · `n_stations_operational` · `n_ports` · `power_kw_site` |
| 5 | **TIẾP CẬN & SỬ DỤNG** — hiện trạng tốt tới đâu | 9 | `dist_station_network_m` ⚠ · `dist_station_euclid_m` · `detour_ratio` ⚠ · `dist_station_asym_m` · `road_access_offset_m` · `util_cell` ⚠ · `n_stations_measured` · `network_reachable` (bool) · `evidence_grade_distance` (hạng mục) |
| — | **ĐỊNH DANH & XUẤT XỨ** — không bản đồ hoá | 8 | `h3_r8` · `lat` · `lng` · `cell_state` · `commune_code` · `commune_name` · `commune_area_frac` · `pop_source` |

`12 + 10 + 10 + 4 + 9 + 8 = 53` ✓
Bản đồ hoá được: **43 số + 1 bool + 1 hạng mục = 45**. 8 cột còn lại là định danh/xuất xứ,
chúng chỉ xuất hiện trong **panel Ô** và khối **NGUỒN** — tô màu chúng lên bản đồ là vô nghĩa.

Ô tìm kiếm trong tab TRƯỜNG lọc trên **tên cột + nhãn tiếng Việt + mô tả một câu**, không
chỉ tên cột.

**Nhóm ĐƯỜNG mang một ghi chú cố định trong rail** (từ M3): *«biến mô hình — xem lớp
MẠNG ĐƯỜNG để đọc bằng mắt»*. Mười trường `road_len_*` là input của thuật toán, không
phải cách đọc mạng lưới: gộp một mạng **tuyến tính** vào đa giác xoá mất đúng thứ làm
mạng là mạng — tính kết nối. Hai ô cùng 5 km đường, một ô là ngõ cụt cạnh sông, một ô
là nút giao, choropleth nói chúng giống hệt nhau. Cách đọc đúng là đơn vị `road` (§6b).

**Nhóm thứ 6, SO SÁNH (§13c), không phá phép cộng trên.** Bảng này chia hết **mọi cột lưới**;
SO SÁNH là nhóm của **cách đọc**, không phải của cột. `detour_ratio` và
`dist_station_asym_m` vẫn được đếm trong 9 cột của nhóm 5 ở trên, nhưng trong rail chúng
nằm dưới SO SÁNH — vì câu chúng nói là một so sánh, không phải một mức. Bốn trường SO SÁNH
còn lại là **đại lượng phái sinh**, không có cột nào của riêng chúng (§13c-1) — trường
thứ tư là `station:occ`, thêm 2026-08-07 cho scrubber M4 (§3e).

**Trường của xã là một danh sách riêng** (§6b), không cộng vào các nhóm trên: chúng thuộc
`commune.parquet`, một bảng khác, một đơn vị đọc khác.

### 6a. Cách chia bậc (classing)

Một ramp cho 41 phân bố rất khác nhau — nhiều trường lệch mạnh về 0 (`n_mall` có p90 = 0).
Quy tắc, không phải cảm tính:

1. Mặc định **7 bậc phân vị** trên các giá trị **không null**.
2. **Nếu ≥ 5% giá trị là đúng 0**, bậc 1 là tập `{0}` riêng, 6 bậc còn lại chia phân vị
   trên các giá trị > 0. Gộp "0" với "ít" là xoá mất khác biệt duy nhất đáng kể ở các
   trường POI.
3. **Ngưỡng trùng nhau thì gộp bậc, và hiện đúng số bậc còn lại.** Không bao giờ độn cho
   đủ 7 bậc giả. Nếu `n_mall` chỉ đỡ được 3 bậc thì legend hiện 3 swatch — đó là sự thật
   về trường đó.
4. Trường bool: 2 bậc, dùng c2 và c6.
5. Trường hạng mục (`evidence_grade_distance` — `not_buildable_reason` đã bị bỏ ở M2.1):
   **không** dùng
   ramp tuần tự. Dùng các bậc lạnh của §4d + hatch cho null, vì thứ tự ở đây không có
   nghĩa. Đây là ngoại lệ duy nhất, và nó không vi phạm ràng buộc 2 vì vẫn chỉ **một**
   trường được tô mỗi lúc.

   **Va chạm với §4d, đã xử ở M2:** trường hạng mục và overlay dùng chung ba bậc lạnh.
   Chừng nào overlay là điểm/đường thì hình học phân biệt được; khi overlay là **vùng** thì
   không. Nên overlay vùng đổi sang **vân gạch chéo 135°** — §4d-1. Trường hạng mục giữ
   nguyên **mảng màu phẳng**, và đó là dấu hiệu phân biệt: *phẳng = trường, vân = overlay.*

Legend luôn in **giá trị ngưỡng thật**, không in `bậc 1..7`.

---

## 6b. ĐƠN VỊ ĐỌC — hai họ trường, và vì sao ràng buộc 2 vẫn đứng

M2 thêm 126 đa giác xã như một mặt tô được (§13d-B). Điều đó tạo ra **đơn vị đọc thứ hai**,
và câu hỏi thật là: có phá ràng buộc 2 không?

**Không — nếu phát biểu nó cho đúng.** Ràng buộc 2 không nói "đúng một lớp hình học"; nó
nói **đúng một trường được tô mỗi lúc**. Cách mở rộng, chốt ở đây:

> Mỗi trường mang một **đơn vị đọc** (`cell` hoặc `commune`). State vẫn giữ **một** `field`
> (một chuỗi, không phải mảng). Trường đang chọn **quyết định luôn hình học nào được tô** —
> và hình học kia **không được tô**, không phải "tô mờ đi".

Hệ quả, và đây là phần phải giữ:

| Trường đang chọn | Ô H3 | Đa giác xã | Mạng đường *(M3-R)* | Chấm trạm *(M4)* |
|---|---|---|---|---|
| đơn vị `cell` | **được tô** theo ramp | chỉ có thể là **đường viền** (overlay, họ lạnh) | không vẽ (chỉ nét basemap) | chỉ có thể là **overlay** (chấm, họ lạnh) |
| đơn vị `commune` | **không vẽ** | **được tô** theo ramp | không vẽ (chỉ nét basemap) | chỉ có thể là **overlay** |
| đơn vị `road` *(M3-R)* | **không vẽ** | chỉ có thể là **đường viền** | **được tô** theo ramp | chỉ có thể là **overlay** |
| đơn vị `station` *(M4)* | **không vẽ** | chỉ có thể là **đường viền** | không vẽ | **được tô** theo ramp (`station:occ` tại giờ `t`, §3e) |

Đơn vị `road` (thêm ở M3) và đơn vị `station` (thêm 2026-08-07 cho scrubber M4) đi qua
đúng cùng cánh cửa mà `commune` đã mở: khi trường của đơn vị đó được chọn, hình học đó
**là** trường — mọi hình học khác không được tô. Không có ngoại lệ mới nào; bảng trên chỉ
thêm dòng theo luật đã có. Hai điều riêng của `station`:

- Khi `f=station:occ`, overlay `stations` trong tab LAYER **tự thay bằng lớp trường** —
  không bao giờ vẽ chấm hai lần (một lạnh một ramp) cho cùng một trạm.
- **Ràng buộc 1 mở rộng sang chiều thời gian:** trạm thiếu quan sát tại ô giờ `t`
  (`observed_h` dưới ngưỡng, §4d-3b) vẽ **chấm rỗng viền xám `#898781`**, không tô bậc
  nhạt — "chưa quan sát đủ" không được đọc thành "vắng khách".
- **Không có ngưỡng zoom, cùng lý do với `road`** (§13b-1 chỉ ràng buộc ô H3). Ngưỡng
  `HEX_MIN_ZOOM` tồn tại vì một ô r8 rộng 9 px ở z9,3 là **texture**: mắt phải phân biệt
  *bậc màu ở 4.400 vị trí lát kín*, mà mọi vị trí đều có mark nên vị trí không mang tin.
  939 chấm trạm là **mark rời**: bề rộng của chúng do ta đặt (§4d-1 cho co theo zoom), và
  cái mắt đọc là **chỗ nào có chấm và chấm đó đậm cỡ nào** — hình dáng của tập chấm chính
  là phát biểu, và ở zoom thấp mới nhìn thấy được nó. Cùng một lập luận §13b-2 đã dùng để
  gỡ ngưỡng cho hex ĐÃ LỌC, và §6b đã dùng cho đường.

**Công tắc đơn vị trong rail KHÔNG mở rộng thành 4 vị trí.** `road` và `station` mỗi đơn
vị chỉ có 1–2 trường, không đáng một vị trí công tắc; chúng nằm trong nhóm liên quan
(ĐƯỜNG, SO SÁNH) như các dòng radio thường, mang ghi chú đơn vị ngay trong nhãn. Công
tắc `Ô H3 | XÃ` tiếp tục chỉ lọc hai họ lớn — nó là bộ lọc danh sách, không phải bản đồ
của mọi đơn vị đọc.

Có đúng một ramp, một legend, một câu đơn vị tại mọi thời điểm. Người xem không bao giờ
phải hỏi "hai lớp màu này lớp nào là dữ liệu". Ràng buộc 2 nguyên vẹn — thứ được nới là
giả định ngầm rằng H3 là mặt tô duy nhất, và §13a-1 đã chỉ ra giả định đó là sai ngay từ
đầu.

**Vì sao không gộp hai họ vào một danh sách phẳng.** Cùng một cái tên có hai nghĩa khác
nhau ở hai đơn vị: `population` của ô là "người trên 0,74 km²", của xã là "người trên
2–70 km²" — cùng nhãn, khác đại lượng, và không so sánh được với nhau. Trộn chúng trong
một danh sách là mời người dùng so hai con số không cùng đơn vị. Nên rail tách bằng **một
công tắc hai vị trí `Ô H3 | XÃ` ngay trên đầu danh sách**: đơn vị đọc là một lựa chọn hiện
ra được, không phải một thuộc tính ẩn của từng dòng.

**Hash.** Trường của xã mang tiền tố trong khoá `f`: `f=commune:population`. Tên trần vẫn
là trường của ô (`f=population`), nên link do M1 sinh ra vẫn mở đúng. Từ M3 thêm tiền tố
`road:` (`f=road:dist_station_m`), từ M4 thêm `station:` (`f=station:occ`) — cùng quy
tắc, cùng bộ kiểm từng-khoá. **Giờ `t` KHÔNG nằm trong tên trường**: nó đã có khoá `t`
riêng của scrubber (§9) — nhét t vào tên trường là hai nguồn sự thật cho cùng một thứ,
đúng lỗi mà §9a vừa cấm với `f`/`v`/`l` trong cảnh.

**`ContourLayer` không phải một đơn vị đọc riêng** *(câu này viết khi mới có hai đơn vị;
nay bốn, luật không đổi)*. Nó là cách vẽ khác của một trường `cell`
đã có (§1b). Khi nó bật, ô H3 không vẽ — cùng luật với bảng trên, vì cùng một lý do.

**POI (M3.5) KHÔNG phải đơn vị đọc thứ 5 — nó là 4 OVERLAY.** Câu hỏi đặt ra thật ở M3.5,
và trả lời bằng chính định nghĩa của mục này. Đơn vị đọc tồn tại để trả lời *"hình học nào
đang mang RAMP"* — mà POI **không có trường giá trị nào để tô**: nhóm là danh tính của
thực thể, không phải một đại lượng trên một mặt phủ. Nếu ép thành trường hạng mục
`poi:category` thì ba thứ gãy cùng lúc: (1) theo bảng trên, chọn nó nghĩa là hex/xã
**không vẽ** — mất đúng cái nền (cầu, cung, khoảng cách) mà POI cần đứng lên để nói được
điều gì; câu của POI bẩm sinh là một câu overlay: *"thực thể này đứng Ở ĐÂU so với trường
đang xem"*; (2) 4 nhóm thành 4 mảng lạnh phẳng (§6a-5) — tái diễn nguyên văn va chạm mà
§4d-1 đã phải xử; (3) radio một-trường không cho bật/tắt từng nhóm, mà yêu cầu là 4 công
tắc độc lập. Ràng buộc 2 đứng nguyên vì overlay không tô trường nào — màu và hình của
chúng chốt ở **§4d-4**.

### 6c. Nút `TẮT` — mặt tô là một lựa chọn hiện/ẩn được, chốt sau M3.5

M3.5 đưa vào 4 overlay POI mật độ cao (6.633 mark, §11). Ảnh chụp render thật (verify #1
của M3.5) cho thấy khi nhìn cả 4 nhóm ở nội đô, mặt tô cam đậm vẫn *thắng* — đúng luật
§4d-4 — nhưng nó cũng làm mark POI khó phân biệt bằng mắt hơn so với trên nền trơn. Nhu
cầu thật: mentor muốn nhìn overlay (POI, trạm, ranh giới) trên một nền sạch, không phải
đổi trường đang xem.

**Chốt: thêm nút thứ ba `TẮT` cạnh `Ô H3 | XÃ`** (rail, tab TRƯỜNG, §3c). Bấm nó **không
đổi `field`** — trường đang chọn giữ nguyên, chỉ phần mặt tô (hex/xã/đường/mặt liên tục)
của nó ngừng vẽ. Bấm lại `Ô H3` hay `XÃ` thì mặt tô bật lại ngay, vẫn đúng trường cũ.

**Vì sao không phá ràng buộc 2.** Ràng buộc 2 nói *"đúng một trường được TÔ mỗi lúc"* —
đó là một giới hạn TRÊN (không bao giờ hai), không phải một cam kết rằng luôn phải có
đúng một. Không có gì được tô là một trạng thái đã tồn tại từ M2 (`renderPlan` trả
`paint: "none"` khi hex dưới ngưỡng zoom và trường không có mặt liên tục) — nút này chỉ
cấp thêm MỘT LÝ DO nữa để rơi vào đúng trạng thái đó, lần này do người dùng chọn thay vì
do zoom ép buộc. Overlay, viền BỐI CẢNH, viền đối tượng đang chọn — mọi lớp không phải
mặt tô — không đổi.

**Vì sao không phải một trường "none" giả.** Cách khác là thêm một `FieldMeta` giả không
có cột, không có ramp, để "chọn" nó qua radio hiện có. Bị loại: nó buộc mọi chỗ đọc
`FIELD_BY_ID.get(field)` (legend, panel, badge, hash) phải xử lý một trường không thật —
đúng loại trạng thái giả mà §9a đã tránh cho khoá `s` bằng cách không tách hai khoá. Một
cờ boolean độc lập với `field` thì không trường giả nào cần tồn tại.

**Legend nói ra, không im lặng.** Dải legend (§3b) đổi thành một câu "Mặt tô đang TẮT —
chỉ còn nền và overlay" + nút bật lại — cùng khuôn với thông báo "quá nhỏ để đọc" đã có ở
§13b-1, vì cùng nguyên tắc: bản đồ không vẽ gì phải luôn nói RÕ VÌ SAO, không được để một
dải trống đọc thành "không có dữ liệu".

**Hash — khoá `p`, chốt cùng luật với `l`.** Mặc định `true` (đang tô); chỉ ghi `p=0` khi
tắt, không ghi `p=1` khi bật — cùng khuôn "không ghi trạng thái mặc định" của khoá `l`
rỗng. Trong chế độ CÂU CHUYỆN, khoá `p` **không đọc và không ghi** — đúng luật §9a đã áp
cho `f`/`v`/`l`: một cảnh luôn tô đúng một trường của nó (L3), nên `paintOn` bị ép `true`
mỗi khi vào cảnh, kể cả khi người xem vừa bấm TẮT trước đó.

---

## 7. Badge phủ ⚠ — số nào, nghĩa gì

Ràng buộc 4: trường phủ kém phải có badge ⚠ **kèm %**, **ngay trong rail**, thấy được
**trước khi bấm**. Nhưng "phủ" có hai nghĩa khác nhau và trộn chúng là nói dối:

- **⚠ phủ ô** — bao nhiêu trong 4.400 ô có giá trị không null.
- **⚠ nguồn** — nguồn thượng nguồn khuyết tới mức nào, kể cả khi cột không có null.

Badge phải nói rõ đang nói nghĩa nào. Đã đo trực tiếp trên `grid_h3_r8.parquet`:

| Trường | Badge trong rail | Số đo |
|---|---|---|
| `util_cell` | **⚠ 9,9% ô · 27,9% dân** | 437/4.400 ô. Nhưng mẫu số đúng không phải toàn lưới: chỉ **449** ô có trạm công cộng, và **437/449 = 97,3%** trong số đó đo được. Trường này không *đo kém*, nó chỉ *tồn tại ở nơi có trạm*. Badge vẫn phải có ⚠ — với một ô chưa có trạm thì mức sử dụng tương lai là "không biết" thật, đúng nghĩa §7a. |
| `apartment_levels_sum` | **⚠ nguồn 41%** | Cột 100% không-null nhưng **lệch 0 nặng**: chỉ 168 ô có giá trị > 0, và trong 253 ô *có* chung cư thì chỉ **66,4%** có tổng tầng > 0. Gốc: chỉ **41,2%** toà chung cư trong OSM có tag `building:levels` (1.051/2.551 trên bản trích Hà Nội). Là **chặn dưới**, không phải số đo. |
| `dist_station_network_m` | **⚠ 98,8% ô** | Cùng 51 ô null. **Không** mang cảnh báo maxspeed — mét không phụ thuộc bảng tốc độ giả định. Đây là trường dùng khi cần số cứng. |
| `n_ports` · `power_kw_site` | *(ghi chú, không ⚠)* | Tầng **ASSET** (lắp đặt), không phải LIVE. `connectors.count_total` = 8.823 ≠ `n_ports` = 7.785 và **không nên** bằng nhau. |

### 7a. Cái gì KHÔNG được mang ⚠

~~`not_buildable_reason`~~ **cột này đã bị bỏ ở M2.1**, nên hiện KHÔNG cột nào
khai `nullMeans`. Quy tắc vẫn đứng và vẫn có test — nó chỉ đang chờ trường tiếp theo
thuộc loại "biết là không". `util_pctl` trong `station_occupancy` vẫn là ví dụ sống:
null là "không đủ hạng GOOD để xếp phân vị", một trạng thái có nghĩa.

**Quy tắc chung: ⚠ chỉ dành cho "không biết", không dành cho "biết là không".**

### 7a-1. Một trường, HAI loại null — mở rộng ở M3

`nullMeans` là cờ **cấp trường**: bật nó thì ⚠ tắt cho toàn bộ ô null của trường đó. Đủ
dùng khi một trường chỉ có một loại null. `detour_ratio` không như vậy:

| nhóm | n | vì sao null | §7a xếp loại |
|---|---:|---|---|
| `network_reachable = false` | **50** | không có đường đi hợp lệ | **"không biết"** ⇒ có ⚠ |
| reachable nhưng vẫn null | **86** | `dist_station_euclid_m < 200 m` (`DETOUR_MIN_EUCLID_M`) | **"biết là không áp dụng"** ⇒ KHÔNG ⚠ |

**Vì sao 86 ô đó không tính được, và vì sao gán `= 1` là bịa số.** Dưới 200 m, tử số
`dist_station_network_m` bị `road_access_offset_m` chi phối — quãng thẳng từ tâm ô ra tới
mặt đường. Tỉ số ở cỡ đó đo **độ lệch của tâm ô so với lưới đường**, không đo hình học
sông/cầu mà trường này nói về. Ô cách trạm 40 m mà đường đi 300 m có tỉ số thật là 7,5;
ghi 1 vào đó là khẳng định "đi thẳng được" trong khi có thể không. `n07` từ chối tính là
**đúng** — cái sai nằm ở chỗ web gộp hai loại null vào một ký hiệu.

**Vì sao gộp là lỗi nặng, không phải lỗi thẩm mỹ.** 86 ô đó là ô **sát trạm nhất thành
phố** — nhóm được phục vụ tốt nhất. 50 ô kia là ô **không tới được** — nhóm tệ nhất. Cho
chúng cùng một vân xám là đặt hai đầu đối lập của thang phục vụ vào một ký hiệu, ngay trên
bản đồ mà cảnh C sẽ dùng để nói "chim bay nói dối ở 696 ô".

**Cách xử — `FieldMeta.nullSplit`:**

| | vân | ⚠ |
|---|---|---|
| không biết | 45° xám *(§4b, nguyên trạng)* | có |
| không áp dụng | **90° xám, nét DỌC** | không |

Góc là kênh phân biệt đã dùng ở §4d-1 (45° null ↔ 135° overlay); thêm 90° là mở rộng cùng
từ vựng. **Cùng màu xám** vì cùng nghĩa "vắng giá trị"; **khác góc** vì khác nguyên nhân.

**Mẫu số của ⚠ đổi theo.** Badge hỏi *"trong những ô mà câu hỏi CÓ NGHĨA, bao nhiêu ô trả
lời được"*, nên nhóm "không áp dụng" bị trừ khỏi mẫu số: `4.264/4.314 = 98,8%`, không phải
`4.264/4.400 = 96,9%`. Con số bị trừ được **nói ra** trong câu giải thích, để nó không
trông như mâu thuẫn với tổng số ô ở khối NGUỒN.

Số đo lấy **lúc chạy** (§13c-1), không từ `manifest.coverage` — manifest chỉ biết tổng số
null, không biết bao nhiêu trong đó là "không áp dụng".

### 7b. Một điểm cần nói với mentor

Đề bài ban đầu ghi `util_cell ⚠46%` và cho tới trước bộ lọc §3a của `DECISIONS.md` con số
đó có thật ở **tầng trạm**: `occ_status = OK` ở 1.130/2.491 trạm = 45,4%. Sau khi loại
**2.408 điểm sạc cá nhân** (1 súng, AC — ổ cắm lắp tại nhà) thì tỉ lệ đó thành **96,2%**
(676/703 trạm).

Đây là điều đáng nói nhất với mentor, vì nó đảo ngược một kết luận: telemetry **không** kém.
Nó chỉ đang được đo trên một tập mà 72% là ổ cắm nhà dân — thứ vốn không báo cáo đều và cũng
không phải đối tượng của bài toán. Bỏ chúng ra thì chất lượng đo tăng vọt (45,4% → 96,2%)
trong khi độ phủ theo ô giảm mạnh (29,8% → 9,9%). Hai chiều ngược nhau, cùng một nguyên nhân:

> `util_cell` trước đây phủ rộng vì **đếm nhầm**, chứ không vì đo tốt.

Ba tầng, ba mẫu số, không được trộn — rail hiện số **tầng ô** (vì rail chọn trường của bảng
ô), panel chi tiết trạm sẽ hiện số **tầng trạm**:

| Tầng | Số | Nghĩa |
|---|---|---|
| trạm | **96,2%** | trạm công cộng báo cáo đủ chuẩn |
| ô có trạm | **97,3%** | 437/449 ô có trạm thì đo được |
| toàn lưới | **9,9%** | 437/4.400 — phần lớn ô Hà Nội chưa có trạm công cộng nào |

---

### 7c. Badge sống ở đâu — schema `manifest.json` (M1)

Ràng buộc 4 nói số phủ tính lúc export. Cụ thể hoá: `n11_web_export` ghi ba khối, và
`fields.ts` **chỉ giữ câu chữ**, không giữ con số nào.

| Khối trong manifest | Nội dung | Ai dùng |
|---|---|---|
| `coverage[col]` | `n_present` · `cell_share` · `pop_share` cho **cả 52 cột** | badge ⚠ phủ ô |
| `source_metrics` | `apartment_levels_tagged` (tag `building:levels` trên POI chung cư) · `osm_substations` (số trạm biến áp OSM) · `road_maxspeed_tagged` (đoạn đường có tag `maxspeed`) | badge ⚠ nguồn + cảnh báo chạy thông thoáng |
| `categories[col]` | số đếm từng giá trị + `n_null` của 4 cột hạng mục | thứ tự bậc màu (§6a-5) và các số trong ngoặc ở §8 |

**Badge ⚠ phủ ô là một quy tắc, không phải một danh sách gõ tay:** hiện khi
`coverage[col].cell_share < 1` **và** trường đó không được đánh dấu "null có nghĩa"
(§7a). Cột nào tương lai bị khuyết thì badge tự mọc.

**Vì sao con số của `apartment_levels_sum` đổi 36% → 41,2%:** 36% là ước lượng thượng
nguồn thô. Bản trích Hà Nội đo được thật: 1.051/2.551 toà. Ràng buộc 4 nói badge phải
theo dữ liệu, nên số đo thắng số ước lượng — và nó sẽ tự đổi khi ảnh chụp OSM đổi.

## 8. Khối NGUỒN trong panel Ô

Ràng buộc 5: **xám mờ (`#898781`), ở đáy panel, luôn có mặt, không ồn.** Chữ 11px, không
viền, không icon, không màu. Provenance là thứ phải tra được chứ không phải thứ phải nhìn.

Nội dung, theo đúng thứ tự:

```
NGUỒN
Dân số      WORLDPOP2025_ANCHORED_VNSDI          ← pop_source
Khoảng cách OSM_NETWORK                          ← evidence_grade_distance
Sử dụng     OK · 3 trạm đo được                  ← occ_status (gộp từ các trạm trong ô)
Ranh giới   VNSDI 16/6/2025 · Xã X (78% diện tích ô)   ← commune_*, commune_area_frac
Ảnh chụp    OSM 28/07/2026 · trạm 29/07/2026 · telemetry 30 ngày
```

Ba giá trị cần dịch sang câu người đọc được, không để nguyên hằng số:

| Hằng | Hiện trong panel |
|---|---|
| `WORLDPOP2025_UNANCHORED_OFFICIAL_IMPLAUSIBLE` | `WorldPop không neo — số công bố của xã này không hợp lý (55 ô)` |
| `ZERO_NO_WEIGHT` | `không dân — bề mặt WorldPop bằng 0 (154 ô)` |
| `UNREACHABLE_NO_PATH` / `UNREACHABLE_NO_ROAD_ACCESS` | `không tới được bằng đường bộ trong bán kính neo 2 km` |

`occ_status` là trường của **trạm**, không phải của ô. Trong panel ô nó được gộp: hiện
trạng thái xấu nhất trong các trạm thuộc ô + số trạm đóng góp vào `util_cell`
(`n_stations_measured`). Khi ô không có trạm đo được thì dòng đó ghi
`không đo được — không có trạm báo cáo đủ chuẩn`, **không** ghi `0`.

Phép gộp cần hai thứ §8 chưa nói, chốt ở M1:

- **Thứ tự "xấu dần"** — `OK` → `THIEU_PEER` → `THIEU_COVERAGE`. `THIEU_COVERAGE` xấu
  nhất vì nó đánh vào chính `util` (không quan sát đủ cửa sổ 30 ngày); `THIEU_PEER` chỉ
  đánh vào `util_pctl` (không đủ trạm cùng loại để xếp phân vị), `util` vẫn dùng được.
- **Join** — `station_occupancy.station_code` ← `stations.station_code`, gộp theo
  `stations.h3_r8`. Chỉ tính trạm có bản ghi occupancy.
- Hai hằng còn lại cũng dịch, cùng lý do với ba hằng ở bảng trên: `THIEU_COVERAGE` →
  `thiếu quan sát`, `THIEU_PEER` → `thiếu lớp tham chiếu`. `OK` giữ nguyên — nó đã đọc
  được.

Dòng `commune_area_frac` chỉ hiện phần trăm khi < 0,999 — 600/4.400 ô có giá trị < 0,6,
tức nhãn xã ở đó là "áp đảo tương đối" chứ không phải "trọn ô".

### 8a. Panel TRẠM — chốt 2026-08-07, **XONG ở M4.1**

`station_occupancy` là bảng giàu nhất của bộ dữ liệu (`util_p95` · `saturation_frac` ·
`duty_cycle` · `shape_class` · `peak_hour` · `night_share`…) mà tới M3 **không có chỗ nào
hiển thị** ngoài phép gộp `util_cell` — cùng loại lỗi "tính xong rồi ném đi" đã bắt hai
lần (§13e, M3-R). Sửa: click chấm trạm → panel TRẠM trong rail, **cùng khuôn panel Ô/XÃ**
(thay nội dung tại chỗ, `‹ quay lại`, NGUỒN neo đáy), hash `c=station:<mã evcs>` — cùng
cơ chế một-khoá của M2.1-A, kiểm hình dạng theo tiền tố như hai loại kia.

Cấu trúc, từ trên xuống — theo đúng thứ tự "một con số → vài con số → hình → chữ":

1. **Hero number `util`** — số lớn, **proportional figures, không `tabular-nums`**
   (§4e đã cấm tabular cho số đứng một mình; nhắc lại ở đây vì hero number là chỗ dễ
   phạm nhất). Kèm câu đơn vị "tỉ lệ cổng-giờ bận, 30 ngày".
2. **Ba stat tile:** `util_p95` (đỉnh) · `saturation_frac` (kín toàn bộ cổng — con số
   kể chuyện được: "9,8% thời gian người đến phải chờ") · `duty_cycle`.
3. **Mini-heatmap 7×24** của chính trạm — ramp cam §4a, ô thiếu quan sát vẽ vân xám
   (§4d-3b), cùng bộ ký hiệu với heatmap dock để hai hình đọc bằng một từ vựng.
4. **Dòng dịch `shape_class` + `peak_hour`** — nhãn tiếng Việt của §3f-5, ví dụ
   "đêm trội · đỉnh 21h Thứ Sáu". Hằng số dịch sang câu người đọc được, đúng luật §8.
5. **NGUỒN**: `occ_status` của trạm + cửa sổ quan sát + `coverage`. Đây là chỗ hiện
   con số **96,2% tầng trạm** mà §7b yêu cầu — panel trạm nói số tầng trạm, rail nói
   số tầng ô, không trộn mẫu số.

Trạm `MAINTENANCE`/`OUT_OF_SERVICE` ghi rõ trạng thái ở đầu panel bằng chữ (viền đứt
trên bản đồ chỉ nói "không bình thường", §4d-3a — panel mới là chỗ nói cụ thể).

---

## 9. State & URL hash

Zustand làm store, một `subscribe` đồng bộ ra `location.hash`. Hash là **serialization của
state**, không phải router.

```
#f=population&m=2d&v=105.84,21.00,9.3,0,0&l=stations,communes&c=8841430921fffff&t=48&b=pop:120-4400
```

| Khoá | Nghĩa |
|---|---|
| `f` | trường choropleth (đúng một). Tên trần = trường của **ô**; tiền tố `commune:` = trường của **xã**; tiền tố `road:` = trường của **mạng đường** (M3-R); tiền tố `station:` = trường của **trạm** (M4, §3e) — §6b |
| `m` | `2d` / `3d`. **`3d` thành giá trị hợp lệ từ M3.5** — trước đó bị bỏ qua như khoá hỏng vì bật nó không vẽ gì khác đi (nói dối bằng UI, §3a); giờ nó bật fill-extrusion + khối POI + pitch 50 nên nó là một trạng thái thật |
| `v` | lng,lat,zoom,pitch,bearing |
| `l` | overlay đang bật, phân tách bằng dấu phẩy. **M3.5 thêm 4 ID nhóm POI**: `poi_apartment` · `poi_mall` · `poi_public` · `poi_edu_health` — dùng lại khoá `l` chứ không đẻ khoá mới, vì POI **là** overlay (§6b): một khái niệm một khoá, và bộ kiểm sẵn có (bỏ từng ID lạ, thứ tự chuẩn hoá) áp luôn không cần luật mới. **M5 thêm `substations`** đi qua đúng cánh cửa đó: một ID nữa, không khoá mới, không luật mới — và vì bộ kiểm là một QUY TẮC chứ không phải một danh sách gõ tay, nó áp cho ID mới mà không phải sửa gì. **M4.3 thêm một bậc kiểm thứ hai:** ID hợp lệ nhưng **không dựng được trên bộ đang mở** (`data/overlays.ts`) cũng bị bỏ ở đây — một công tắc bật lên mà bản đồ không đổi gì là §3a, và nó vỡ im lặng hơn cả một ID sai |
| `c` | **đối tượng** đang chọn — `h3_r8` (ô), `commune:<mã 5 số>` (xã, M2.1-A), `station:<station_id>` (trạm, M4.1 — §8a), hoặc `poi:<n\|w\|r><osm_id>` (POI, M3.5 — ví dụ `poi:w123456`; chữ đầu là loại đối tượng OSM, để ID node và way không giẫm nhau). Đúng MỘT, vì rail chỉ có một vùng chi tiết. **Mã trạm là `station_id` (`vn-c-ac000091`) chứ không phải `station_code`** — quyết định lúc thi công M4.1, và nó đến từ dữ liệu: 6/939 `station_code` chứa dấu cách, dấu phẩy và dấu tiếng Việt (`CONGDONG-Anh Chiến, Thường Tín`), mà dấu phẩy là ký tự phân cách của khoá `l` và `serializeHash` cố ý không encode nó. `station_id` là slug ASCII, duy nhất trên cả 939 trạm. Cả hai đều là "mã evcs"; chọn cái đi qua được một URL nguyên vẹn |
| `s` | **cảnh CÂU CHUYỆN đang mở** — M3, xem §9a. Có mặt = đang ở chế độ CÂU CHUYỆN. **Bị bỏ hoàn toàn khi `manifest.story_enabled === false`** (M4.3): bốn cảnh được VIẾT cho Hà Nội — chúng gọi tên hai xã cụ thể và bay tới toạ độ cầu Nhật Tân — nên trên một tỉnh khác chúng không sai *dữ liệu*, chúng sai *chỗ*. Khoá biến mất y như một slug lạ, ở `parseScene`, tức cả boot lẫn `hashchange` đều đi qua một cổng. Khoá một cái nút không khoá một khoá hash |
| `d` | **chế độ DỮ LIỆU đang mở** — M4.2, §3f. Chỉ `d=1` là hợp lệ, cùng luật với `p`. **`s` và `d` loại trừ nhau:** chiều RA không bao giờ ghi cả hai, chiều VÀO đọc `s` trước rồi bỏ `d`. Vì sao không nhét vào `s` như §9a đã làm với cảnh: luật một-khoá của `s` nói về *cảnh nào bên trong câu chuyện*, và trang dữ liệu không có cảnh nào để mang — nhét nó vào sẽ bắt `parseScene` trả về một thứ không phải cảnh, tức làm hỏng đúng cái kiểu đã dựng lên để giữ luật đó. **Khác `s` ở một chỗ nữa:** trong chế độ DỮ LIỆU thì `f`/`v`/`l`/`t`/`b` **vẫn ghi**, vì một cảnh *sở hữu* trường và khung nhìn của nó còn trang dữ liệu chỉ *đỗ* bản đồ lại — bấm về BẢN ĐỒ phải trả người xem về đúng chỗ họ rời đi (luật bàn giao L2, §14a) |
| `p` | mặt tô có đang vẽ không — **thêm sau M3.5, nút `TẮT` cạnh Ô H3 \| XÃ (§6c)**. Mặc định `true`; chỉ ghi `p=0` khi tắt. Không đọc/ghi trong CÂU CHUYỆN — cùng luật với `f`/`v`/`l` (§9a) |
| `t` | **vị trí scrubber**, số nguyên 0–167 = `dow × 24 + hour`, `dow = 0` là Thứ Hai (§3e). Khoá THẬT từ M4 |
| `b` | **các brush đang hoạt động** — cú pháp ở §9b. Khoá THẬT từ M4 |

Đọc hash lúc boot; ghi hash có debounce 250ms. Hash không hợp lệ thì bỏ qua **từng khoá
một** và về mặc định của khoá đó, không reset cả app.

### 9b. Khoá `b` — cú pháp cho ba loại brush, chốt lúc thi công M4 (2026-08-07)

Trước M4, `t` và `b` chỉ là khoá **giữ nguyên khi ghi lại** (`KEPT_FOR_LATER`): chép
nguyên văn ra, không đọc, không kiểm. Đủ để một link do M4 sinh ra không bị bản M3 xén
mất, nhưng nó **không phải** một khoá — chuỗi rác trong `b` cũng sống sót y như một brush
thật. M4 nâng cả hai lên khoá thật, đi qua **đúng bộ kiểm từng-khoá** mà `p` đã dùng ở
M3.5: hỏng thì bỏ **riêng nó**, không kéo theo khoá nào khác.

`b` cần đủ cho **ba hình dạng khác hẳn nhau**, nên ví dụ cũ `b=pop:120-4400` không dùng
được: nó chỉ tả nổi loại thứ nhất, và `-` làm phân cách khoảng thì gãy ngay ở trường có
giá trị âm (`screen_margin_m` âm là "chưa đủ xa" — một nửa số ô).

```
b = <mệnh đề>[,<mệnh đề>…]        phân cách bằng dấu phẩy, như khoá `l`
```

| loại | cú pháp | ví dụ |
|---|---|---|
| histogram 1D | `h:<trường>:<lo>..<hi>` | `h:population:120..4400` · `h:commune:population:0..9e4` |
| scatter 2D | `s:<trục x>:<lo>..<hi>:<trục y>:<lo>..<hi>` | `s:population:120..4400:dist_station_network_m:0..2500` |
| cửa sổ 168h | `w:<dow0>..<dow1>:<giờ0>..<giờ1>` | `w:0..4:7..19` (T2–T6, 7h–19h) |

Bốn quyết định về ký tự, mỗi cái có lý do:

1. **`..` làm phân cách khoảng**, không phải `-` — số âm. `h:screen_margin_m:-2000..500`
   đọc được; `-2000-500` thì không có cách nào tách đúng.
2. **`:` làm phân cách phần**, dùng lại đúng ký tự mà `f`/`c` đã dùng, và `serializeHash`
   đã bỏ percent-encode cho nó. `.` và `,` cũng không bị `URLSearchParams` encode, nên cả
   ba loại đọc được bằng mắt trong thanh địa chỉ — mà "mentor gửi link cho nhau" là lý do
   §1 chọn hash ngay từ đầu.
3. **Tên trường có thể chứa `:`** (`commune:population`, §6b). Mệnh đề `h` vì thế phân
   tích theo **vị trí hai đầu**: token đầu là loại, token cuối là khoảng, **tất cả ở
   giữa** ghép lại bằng `:` là tên trường. Không có trạng thái mơ hồ nào.
4. **Hai trục của `s` là trường của Ô** (tên trần, không tiền tố), nên nó phân tích được
   theo vị trí với đúng 5 token. Đó không phải giới hạn cho tiện: §3d-1 đã chốt scatter
   chỉ áp cho đơn vị `cell`, vì hai trục phải là hai cột của **cùng một hàng**.

Kiểm và bỏ, ở bậc **mệnh đề** — cùng luật "bỏ từng ID lạ" mà khoá `l` đã dùng, chỉ sâu
hơn một bậc: một mệnh đề hỏng không được phép xoá hai brush còn lại.

| bỏ mệnh đề khi | ví dụ |
|---|---|
| loại lạ | `x:population:1..2` |
| trường không có thật | `h:khong_co_that:1..2` |
| trục scatter không phải trường của Ô | `s:commune:population:…` |
| biên không phải số hữu hạn | `h:population:abc..2` |
| `lo > hi` | `h:population:5..1` |
| `dow` ngoài 0–6, `hour` ngoài 0–23 | `w:0..9:7..19` |

Còn lại: **một brush mỗi loại** (state giữ ba ô, không phải một mảng — hai brush histogram
cùng lúc là một trạng thái không có nghĩa), mệnh đề **sau thắng** khi trùng loại; và
`serializeHash` ghi theo **thứ tự chuẩn hoá `h` → `s` → `w`**, không theo thứ tự người
dùng kéo, cùng lý do đã ghi cho `l`: một trạng thái phải cho đúng một chuỗi.

Biên số ghi **làm tròn 4 chữ số thập phân** rồi bỏ số 0 thừa. Vòng ghi ↔ đọc vì thế hội
tụ ngay ở lần thứ hai — điều kiện để listener `hashchange` không lặp vô hạn (§9a).

**`b` và `t` trong chế độ CÂU CHUYỆN: không đọc, không ghi** — dock và scrubber không dựng
ở đó (§3d-1), nên ghi chúng ra là ghi trạng thái của một bộ điều khiển không tồn tại.
Cùng luật §9a đã áp cho `f`/`v`/`l` và §6c cho `p`.

### 9a. Khoá `s` — chế độ CÂU CHUYỆN, chốt ở M3

§9 trước M3 **không có khoá nào cho "đang ở chế độ nào"**: `m` là `2d`/`3d`, tức là camera,
không phải chế độ app. Mentor không gửi được link tới một cảnh — mà "gửi được link về đúng
một khung nhìn" là lý do §1 chọn hash làm serialization ngay từ đầu.

**Một khoá, không hai.** Đường hiển nhiên là hai khoá (`app=story` + `s=<cảnh>`). Bỏ, vì
cùng lý do đã bỏ hai khoá cho ô/xã ở M2.1-A: hai khoá thì hai trạng thái sai **biểu diễn
được** — `app=story` mà không có cảnh nào, và `app=map` mà vẫn mang một cảnh — nên ta sẽ
phải viết luật cấm chúng. Một khoá thì trạng thái sai không tồn tại:

> `s` có mặt và hợp lệ ⇒ chế độ **CÂU CHUYỆN**, ở đúng cảnh đó.
> `s` vắng hoặc hỏng ⇒ chế độ **BẢN ĐỒ**.

Cảnh hỏng bị bỏ như mọi khoá hỏng khác (§9), và bỏ nó **chính là** về BẢN ĐỒ — không cần
một nhánh riêng nào cho lỗi.

**Định danh cảnh là SLUG, không phải chữ cái.** §13d gọi chúng A/B/C, nhưng `#s=c` không
nói gì với người nhận link, và chữ cái **gãy khi chèn cảnh**: thêm một cảnh vào giữa thì
mọi link cũ trỏ sai cảnh mà vẫn hợp lệ — loại lỗi tệ nhất, vì nó im lặng. Slug không có
tính chất đó.

| `s` | cảnh | luận điểm §13d |
|---|---|---|
| `von-cuc` | A | cầu vón cục |
| `cung-lech` | B | cung lệch khỏi cầu |
| `di-vong` | C | thước đo phải theo mạng |
| `chua-biet` | D | ba điều ta không biết |

**Khi `s` có mặt, `f` · `v` · `l` KHÔNG được ghi và KHÔNG được đọc.** Cảnh là thứ quyết
định ba khoá đó (§14b), nên ghi chúng ra là ghi hai nguồn sự thật cho cùng một thứ: một
link `#s=di-vong&f=population` tự mâu thuẫn, và không có câu trả lời đúng nào cho việc nên
tin bên nào. Link tới một cảnh vì thế ngắn và đọc được: `#s=di-vong&m=2d`.

`c` **vẫn ghi** — nó là thứ người xem chọn *bên trong* một cảnh (cảnh B mở panel XÃ), không
phải thứ cảnh áp đặt. `t`/`b` giữ nguyên như cũ.

**NHỊP trong cảnh cũng không có khoá** (§14d, M3.1): một cảnh là đơn vị mà mentor gửi đi, và
`#s=di-vong` phải mở ra cảnh đó **từ đầu**. Ai muốn gửi riêng nhịp kết thì thứ đáng gửi là
trường của nhịp đó ở chế độ BẢN ĐỒ — nơi nó bấm được và soi được — và luật L2 đã cho làm
đúng thế bằng một nút.

**Hai chiều, không một chiều — sửa ở M2 (nợ M0/M1).** M0/M1 chỉ đọc hash **một lần lúc
boot**, nên sửa tay thanh địa chỉ hoặc bấm Back không có tác dụng gì. Câu mở đầu §9 nói
hash là *serialization của state*; một serialization chỉ đọc được một lần thì là tham số
khởi động, không phải serialization. Nên: nghe `hashchange` và nạp ngược vào store, dùng
đúng bộ kiểm của `readHash` (khoá hỏng bỏ từng khoá).

Hai cái bẫy phải tránh khi nối vòng này:

1. **Vòng lặp ghi ↔ đọc.** Store ghi hash ⇒ `hashchange` bắn ⇒ nạp vào store ⇒ ghi tiếp.
   Chặn bằng cách so chuỗi: nếu hash mới bằng đúng chuỗi ta vừa ghi thì bỏ qua.
2. **`replaceState` không tạo mục lịch sử.** M1 dùng `replaceState` để mỗi lần pan không
   thành một bước Back — quyết định đó **giữ**. Hệ quả trung thực: Back đưa về trạng thái
   *trước khi mở app*, không đi ngược từng thao tác. Cái được sửa ở đây là "sửa tay URL và
   Back **có tác dụng**", không phải "mỗi thao tác là một bước lịch sử".

---

## 10. Năm ràng buộc — nhắc lại, và chỗ chúng sống trong code

| # | Ràng buộc | Thực thi ở đâu |
|---|---|---|
| 1 | **null ≠ 0.** Ô null tô gạch chéo xám, không bao giờ tô màu nhạt | §4b. Hàm màu chỉ có một đường vào; giá trị `null`/`undefined`/`NaN` trả về texture, không bao giờ rơi vào ramp. Không dùng `?? 0` ở bất kỳ đâu trên đường dữ liệu → màu. |
| 2 | **Đúng một trường choropleth mỗi lúc** | §3c + **§6b**. State chứa `field: FieldId` (một chuỗi, không phải mảng). Trường mang **đơn vị đọc** (`cell`/`commune`/`road`/`station`) và đơn vị đó quyết định hình học nào được tô — hình học kia **không vẽ**, nên vẫn chỉ một ramp một legend. Overlay ở khoá khác (`layers: Set`), không overlay nào là mảng màu phẳng (**§4d-1**) và không overlay nào mã hoá giá trị bằng màu **hay bằng kích thước**. |
| 3 | **Không ship `grid_h3_r8.geojson`** | §5b. `n11_web_export` không đụng tới file đó. `H3HexagonLayer` dựng đa giác từ `h3_r8`. |
| 4 | **Trường phủ kém có badge ⚠ + % ngay trong rail** | §7. Bảng phủ tính **tại thời điểm export** và ghi vào `manifest.json` — không hardcode trong TS, để khi dữ liệu đổi thì badge đổi theo. |
| 5 | **Panel Ô có khối NGUỒN xám mờ ở đáy** | §8. |

---

## 11. Trạng thái, và những cái bẫy đã sập một lần

### 11a. Đã dựng gì

| | ship | ghi chú |
|---|---|---|
| nền · basemap sáng · lớp lưới | ✅ | §2, §3 |
| rail · chọn trường · panel Ô · hash | ✅ | §6, §9 |
| lớp XÃ · lớp TRẠM · overlay | ✅ | đơn vị đọc §6b |
| bốn cảnh CÂU CHUYỆN | ✅ | §14 |
| lớp POI 4 nhóm + `m=3d` | ✅ | khối 3D là **POI của ta**, không phải nhà cửa basemap |
| dock 3 biểu đồ + scrubber 168 h | ✅ | §3f |
| overlay trạm biến áp OSM | ✅ | `pickable: false` — lớp bối cảnh, `DECISIONS §8` |
| panel TRẠM + trạng thái vận hành | ✅ | nét đứt mang `op_status` |
| chế độ DỮ LIỆU (`d=1`) | ✅ | không có bản đồ nào trong đó (§3f) |
| Hoàng Sa · Trường Sa có nhãn | ✅ | luật đọc từ `commune_kind = DAC_KHU` |
| màn hình toàn quốc (r6, 34 tỉnh) | ✅ | `src/national/`, `docs/adr/0004` |
| **nạp output GMM** | ❌ | **mục duy nhất còn mở**, và bị chặn **ngoài repo**: thuật toán chưa có kết quả để nạp |

Ba thứ từng nằm trong lộ trình và **đã chết cùng trường của chúng**, không phải bị hoãn:
vùng `buildable` (cột bị bỏ, `DECISIONS §7`), ngưỡng theo **phút** (khái niệm bị bỏ,
`DECISIONS §6`), và mặt độ cầu trên BẢN ĐỒ (rời sang cảnh A — xem 11c).

### 11b. Mười bẫy đã sập một lần — đừng sập lại

Sắp theo mức độ **im lặng**: bẫy càng không ném lỗi thì càng đắt.

**1 · `INITIAL_VIEW` phải dùng từ vựng MapLibre (`center`), không phải `longitude`/`latitude`
kiểu deck.gl.** MapLibre lặng lẽ bỏ qua khoá lạ ⇒ bản đồ về `[0,0]` giữa Đại Tây Dương, cả
màn hình một màu xanh xám của lớp `water`, **không một lỗi nào** trong console. Triệu chứng
trông y hệt "style hỏng".

**2 · `m.isStyleLoaded()` là cổng SAI để thêm layer.** `styledata` bắn ba lần và cả ba lần
`isStyleLoaded()` trả `false`; sau đó nó không bắn nữa còn style thì ít lâu sau mới "loaded".
**Cửa sổ mà hai điều kiện cùng đúng không bao giờ tồn tại** — `addLayer` không hề chạy, console
**sạch trơn**, và triệu chứng trông y hệt "dữ liệu không có". Điều kiện đúng là **source có
mặt trong style** (`m.getSource("openmaptiles")`), đúng ngay khi style spec được phân tích.

**3 · `characterSet: "auto"` là bắt buộc cho mọi `TextLayer`.** Tập ký tự mặc định là **ASCII**,
nên atlas không có `Đ` `ặ` `à` và nhãn render ra `c khu Ho ng Sa` — mỗi chữ có dấu bị nuốt
**lặng lẽ, không một cảnh báo nào**. Ảnh render bắt được, test không. Một bản đồ tiếng Việt
không được phép có mặc định đó.

**4 · Một trường khai `bắt buộc` trong kiểu `Manifest` mà dữ liệu không có ⇒ màn hình trắng,
và `tsc` im.** Manifest tỉnh không có khối `source_metrics`; kiểu khai nó bắt buộc nên TS cho
qua cả sáu chỗ `m.source_metrics.x`. *Bài học mang được sang chỗ khác:* **`optional` là một
công cụ tìm lỗi, không phải một lời xin lỗi** — đổi kiểu cho khớp dữ liệu rồi để trình biên
dịch liệt kê hậu quả, nhanh hơn mọi cách đọc mã.

**5 · Hai bộ dữ liệu đặt tên khác nhau cho cùng một khái niệm.** Bộ cũ ghi `scope = 'HANOI'`,
store toàn quốc ghi `'IN'`; điều kiện `=== "HANOI"` cho `false` ở khắp nơi ⇒ **mọi trạm của
mọi tỉnh** vẽ thành chấm rỗng "vành đệm". Cách sửa neo vào `BUFFER` (`isInScope`) — hằng số
**duy nhất mang cùng nghĩa ở cả hai bộ**, và một bộ thứ ba đặt tên `PROVINCE` sẽ chạy đúng mà
không phải sửa gì.

**6 · `interleaved: true` ⇒ mọi lớp deck phải khai `depthCompare`.** Thiếu nó, icon POI biến
mất hẳn sau các khối nhà ở `m=3d`. Đo bằng A/B trên cùng một hash: trước — 5 icon mất sạch sau
các tháp; sau — đủ 5. Cái giá đã chấp nhận: icon của POI có polygon cũng mất depth test nên
xuyên qua khối cao đứng chắn — đúng lập luận đã chốt, **lớp icon là chú thích, không phải một
vật thể trong cảnh 3D**.

**7 · Khoá một cái NÚT không khoá một khoá HASH.** `#tinh=04&s=von-cuc` mở được cảnh CÂU CHUYỆN
dù nav đã khoá, và văn Hà Nội in đè lên bản đồ Cao Bằng. Cách sửa: cờ module trong `scenes.ts`,
`parseScene` trả `null` khi tắt ⇒ khoá `s` biến mất **y như một slug lạ** (luật 1 của §9),
không cần nhánh lỗi mới.

**8 · BA cổng "có cột không", và chúng KHÁC nhau.** `gcol()` hỏi *một cột cố định của lưới*;
`cellFields()` hỏi *một trường có dựng được không* (chặn `selectExpr()` nhả biểu thức riêng ra
nguyên văn — đúng chỗ đã bị quên hai lần); `columnsOf()` hỏi *cột của một bảng bất kỳ* bằng
cách đọc footer parquet (`LIMIT 0`). Gộp chúng lại sẽ phải bịa một cái tên chung cho ba câu
hỏi khác nhau. Manifest chỉ liệt cột của **LƯỚI** — nó không biết gì về bảng trạm.

**9 · `deps` không đi qua `dataPath()` sẽ đọc dữ liệu của tỉnh khác và trả về một con số trông
hợp lý.** `util_pctl_cell` có `deps` là `stations.parquet`; ở chế độ tỉnh nó đọc bảng trạm của
Hà Nội. Không ném lỗi, không rỗng — chỉ sai.

**10 · Fragment shader không truy cập được `project.*`.** Module `project` của deck.gl chỉ để
lại `#define MODULE_PROJECT` trong FS, không mang theo uniform block. `devicePixelRatio` của
lớp gạch chéo vì thế đi vào bằng `#define` tính từ JS (`src/viz/hatch-extension.ts`).

**Và một bẫy của bố cục, không của thư viện:** container bản đồ dùng `h-full w-full`, **không**
`absolute inset-0`. `maplibre-gl.css` đặt `.maplibregl-map { position: relative }` và được
import **sau** Tailwind ⇒ cùng độ ưu tiên thì nó thắng, container tụt về chiều cao 0, canvas
kẹt ở `1600×300`.

### 11c. Bốn quyết định chốt trong lúc dựng, không suy ra được từ §3–§9

**Mặt độ cầu rời khỏi BẢN ĐỒ, ở lại trong cảnh A.** Ở z9,3, mặt gộp 3 km với `opacity 0.85`
phủ kín thành phố thành một khối cam — nó nuốt mạng đường, nuốt ranh giới, và **lấp mất những
lỗ hổng**, mà lỗ hổng là một nửa nội dung của trường dân số. Vành nhạt nhất còn loang ra ngoài
ranh giới: sản phẩm của phép làm mượt, không phải người thật. Nó **ở lại** trong cảnh A vì ở
đó nó **là luận điểm** (§13d-A), không phải một cách tô — cùng khuôn với `bridges`/`routes`:
**cảnh sở hữu mark của nó**. Cờ đi qua `PlanInput.inStory`, và **cả hai** chỗ gọi `renderPlan`
phải truyền nó — `Legend` cũng gọi hàm này, thiếu cờ ở đó cho một dải chú giải nói về một bản
đồ khác.

**Nhãn quần đảo là *chrome của bản đồ*, không phải overlay.** Không có trong tab LAYER, không
tắt được — cùng vai với đường khung ranh giới BỐI CẢNH: một cái tên địa lý không phải một biến.
Luật đọc từ `commune_kind = DAC_KHU`, **không** từ danh sách tên gõ trong TS: 13 đặc khu ở 11
tỉnh, và danh sách gõ tay sẽ lệch khỏi niên bản địa giới ngay lần sáp nhập sau. Neo ở **tâm
bbox của cả cụm**, không phải trọng tâm mảnh lớn nhất — đặt tên lên đảo lớn nhất là gọi tên
*một hòn đảo*, không phải cả quần đảo.

**`FieldMeta.coverageNote` nhận HÀM của manifest, không phải chuỗi hằng.** Câu cũ của
`util_cell` ghi *"thưa về DIỆN TÍCH, không thưa về NGƯỜI"*; sau bộ lọc điểm sạc cá nhân câu đó
**sai**, và sai âm thầm vì là hằng. §7c đã cấm gõ *con số* vào `fields.ts` — chỗ này cho thấy
phải cấm cả **câu nói về con số** khi câu đó thay đổi theo dữ liệu.

**Khối dựng được nhưng không đáng tin thì NÓI ra, không ẩn.** Small multiples ở Cao Bằng vẫn
vẽ được — từ **3/30 trạm**. Cảnh báo `unusable_layers` in **TRƯỚC** hình, không sau. Ngưỡng
đọc từ manifest chứ không đặt lại trong TS — một ngưỡng thứ hai sẽ trôi khỏi ngưỡng thật.
Ngược lại, cột không dựng được thì **bỏ hẳn cột và nói lý do một lần**: một meter dài 0 px đọc
thành "0% dân", đúng cái ràng buộc 1 cấm.

---

## 13. Đánh giá lại — vì sao thảm hex không kể được chuyện

Viết sau khi M1 chạy thật và nhìn thấy kết quả. **Đây là chỗ sửa quyết định, kèm lý do**,
theo đúng §12. Quyết định ở §3–§9 vẫn đứng; cái bị sửa là **lộ trình** và **giả định ngầm
rằng H3 là đơn vị hiển thị mặc định**.

### 13a. Chẩn đoán — bốn nguyên nhân

1. **H3 r8 là đơn vị LƯU TRỮ, bị dùng nhầm làm đơn vị ĐỌC.** Ở zoom 9,3 (115,9 m/px) một
   ô r8 rộng **~9 px**. 4.400 mark 9px không phải bản đồ, đó là texture — mắt không phân
   đoạn được 4,4 nghìn vật thể thành nhóm. Ta trả giá độ phân giải cao mà không nhận lại
   thông tin nào.
2. **Choropleth trả lời "ở đây giá trị bao nhiêu" — không ai hỏi câu đó.** Câu mentor hỏi
   là: cầu tụ ở đâu · cung lệch chỗ nào · vì sao GMM hợp lý. Cả ba là **quan hệ**, mà
   choropleth một trường về nguyên lý không biểu đạt được quan hệ.
3. **Ràng buộc 2 phục vụ M1 nhưng chặn việc kể chuyện.** Mọi phát biểu đáng nói là tổ hợp
   ≥ 2 trường. Bắt người xem bật/tắt rồi tự nhớ khung hình là giao cho họ việc trí nhớ
   làm việc không làm nổi. **Ràng buộc 2 không sai** — cách thoát ở §13c.
4. **Không có kỳ vọng để so.** `12.187 người` không có nghĩa; `gấp 3 lần mức số cổng ở đó
   phục vụ nổi` mới có nghĩa. Ta đang vẽ **mức**, thứ đáng vẽ là **độ lệch khỏi kỳ vọng**.

### 13b. Hex vẫn dùng, nhưng chỉ ở nơi nó xứng đáng

Hex là **phát biểu** khi nó ít và có chọn lọc; là **giấy dán tường** khi nó phủ kín cả
lưới. Quy tắc: hex dùng khi (a) zoom sâu để soi một vị trí cụ thể, hoặc (b) đã lọc còn vài
trăm ô mang một tính chất — ví dụ "696 ô bị chim bay nói dối". Ở zoom thấp, cầu vẽ bằng
**mặt liên tục**, không bằng hex. Và **màn hình đầu tiên không được là thảm hex**.

### 13b-1. Cụ thể hoá ở M2 — ngưỡng `HEX_MIN_ZOOM = 11`

**Con số đến từ phép đo, không từ cảm giác.** §13a-1 đo được: ở zoom 9,3 một ô r8 rộng
**~9 px**. Mỗi bậc zoom nhân đôi, nên bề rộng ô ở zoom `z` là `9 × 2^(z − 9,3)` px:

| zoom | bề rộng ô | đọc được không |
|---:|---:|---|
| 9,3 | 9 px | không — đây là texture, đúng chẩn đoán §13a-1 |
| 10 | 15 px | chưa — nhỏ hơn một ký tự |
| **11** | **29 px** | **được** — một mark có hình dạng, chỉ tay vào được, bấm trúng được |
| 12 | 59 px | rộng rãi |

29 px là chỗ ô lục giác thôi là hạt và bắt đầu là **vật thể**. Chọn 11.

**Dưới ngưỡng thì làm gì?** Không vẽ hex, và **nói ra vì sao** — dải legend thay bằng một
câu cùng một nút `phóng tới z11`. Ba đường khác đều bị loại:

| Cách | Vì sao không |
|---|---|
| Cứ vẽ thảm hex | đúng thứ §13b vừa cấm |
| Gộp lên H3 r6 | bịa một đại lượng không có trong dữ liệu, và trung bình-của-trung-bình sai với mọi trường đã chuẩn hoá theo diện tích. §12 |
| Vẽ nhưng để trống, không giải thích | bản đồ rỗng đọc thành "không có dữ liệu ở đây" — đúng loại nói dối mà ràng buộc 1 cấm, chỉ khác là nói dối về *phủ* thay vì về *giá trị* |

Trường **đơn vị xã** (§6b) không có ngưỡng này: 126 đa giác ở zoom 9,3 rộng hàng trăm px.
Đó chính là lý do xã là từ vựng của zoom thấp còn ô là từ vựng của zoom sâu.

### 13b-2. Hex ĐÃ LỌC không chịu ngưỡng zoom — cụ thể hoá ở M3

§13b viết ra hai điều kiện, và M2 chỉ dựng điều kiện (a):

> hex dùng khi (a) zoom sâu để soi một vị trí cụ thể, **hoặc (b) đã lọc còn vài trăm ô mang
> một tính chất — ví dụ "696 ô bị chim bay nói dối"**.

`HEX_MIN_ZOOM` thực thi (a) và **chặn luôn (b)**, nên cảnh C — cảnh mà §13b lấy làm ví dụ
cho chính điều kiện (b) — không dựng được. Đây là chỗ luật đi trước hiện thực rồi bị quên,
không phải chỗ đổi quyết định.

Sửa: `renderPlan` nhận thêm `filtered: boolean`. Khi `filtered` là true thì ngưỡng zoom
không áp dụng.

**Vì sao ~700 hạt 9 px không phải là thứ §13a-1 vừa cấm.** Hai thứ khác hẳn nhau, và cái
khác nhau là **cái mắt phải làm**:

| | phải đọc gì | 4,4 nghìn mark có nói được không |
|---|---|---|
| thảm hex phủ kín | *giá trị của từng ô* — 7 bậc màu × 4.400 vị trí | không: mắt không phân đoạn 4,4 nghìn vật thể, và mọi ô đều có mark nên **vị trí không mang tin** |
| tập đã lọc | *có mark hay không, và ở đâu* — **một** bậc thông tin | có: 696/4.400 ô có mark, nên bản thân **hình dáng của tập mark** là phát biểu |

Tập đã lọc không nhờ vào việc phân biệt bậc màu, nên nó không cần ô rộng 29 px. Nó nhờ vào
việc các ô **tụ lại thành hình** — mà ở zoom thấp hình đó mới nhìn thấy được. Ở z11 màn
hình chỉ chứa một góc thành phố và mối liên hệ với sông Hồng biến mất khỏi khung.

**Ràng buộc kèm theo, để (b) không thành cửa sau cho thảm hex:**

1. Chỉ **cảnh CÂU CHUYỆN** đặt `filtered` — chế độ BẢN ĐỒ không có bộ lọc nào ở M3, và
   brush của M4 (§3d) *làm mờ* ô bị loại chứ không xoá chúng, nên nó không sinh ra tập đã lọc.
2. Cảnh phải **in ra số ô còn lại**. Một tập không đếm được thì người xem không biết mình
   đang nhìn một phần hay toàn bộ — đúng loại nói dối về phủ mà §13b-1 vừa cấm ở nhánh
   "vẽ nhưng để trống".
3. Ô **không** thuộc tập lọc thì không vẽ gì cả, kể cả vân null: chúng không phải "không
   biết", chúng là "biết, và không thoả điều kiện". Đây là §7a ở dạng hình học.

**Màn hình đầu tiên đổi:** trường mặc định từ `population` (ô) sang **`commune:population`
(xã)**. Cùng khái niệm, đổi đơn vị đọc. Ở zoom 9,3 mentor thấy 126 mảng gọi được tên thay
vì 4,4 nghìn hạt 9 px — và không cần biết luật nào ở trên để thấy điều đó.

### 13c. Cách thoát cho ràng buộc 2 — nhóm trường thứ 6: SO SÁNH

Trường phái sinh **vẫn là một trường tô mỗi lúc**, nên ràng buộc 2 còn nguyên vẹn. Chỉ là
danh sách trường thôi không còn bằng danh sách CỘT nữa: nó gồm cả đại lượng tính ra.

| Trường SO SÁNH | Nói được điều gì mà cột thô không nói được |
|---|---|
| `detour_ratio` (**đã ship ở M1.1**) | đường chim bay sai bao nhiêu lần ở ô này |
| cổng trên 10k dân | cung so với cầu, cùng một con số |
| dân số ngoài 5 phút lái | cầu **không** được phục vụ — đối tượng của bài toán |
| util so với trung vị cùng loại | trạm này bận bất thường hay bình thường |
| nhịp trạm tại giờ `t` (`station:occ`, M4) | thành phố "thở" thế nào theo 168 giờ — cấu trúc thời gian mà mô hình cầu phải nắm bắt |

Đổi từ **mức** sang **độ lệch** là đổi từ "dữ liệu" sang "phát biểu", gần như không tốn code.

### 13c-1. Sáu trường SO SÁNH — định nghĩa chính xác (năm chốt ở M2, `station:occ` thêm 2026-08-07 cho M4)

§12 cấm bịa số, nên mỗi trường phái sinh phải truy được về **cột thật**. Bảng này là hợp
đồng đó; SQL trong `queries.ts` phải khớp từng dòng.

| id | đơn vị đọc | công thức | cột nguồn |
|---|---|---|---|
| `detour_ratio` | ô | *(cột sẵn có, chuyển nhóm)* | `grid.detour_ratio` |
| `dist_station_asym_m` | ô | *(cột sẵn có, chuyển nhóm)* `\|đi − về\|` — hai lượt Dijkstra ngược chiều nhau ở B8 | `grid.dist_station_asym_m` |
| `commune:ports_per_10k_pop` | xã | *(cột sẵn có)* `1e4 × n_ports / population`, tính ở B11. **Trường mở app** (M2.1-C) | `commune.ports_per_10k_pop` |
| `pop_beyond_2km` | ô | `dist_station_network_m IS NULL → NULL`; `> 2000 → population`; ngược lại `→ 0` | `grid.dist_station_network_m` · `grid.population` |
| `util_pctl_cell` | ô | trung bình có trọng số cổng của `util_pctl` trên các trạm trong ô có phân vị | `station_occupancy.util_pctl` · `.util_denominator_ports` ← `stations.h3_r8` |
| `station:occ` *(M4)* | **trạm** (§6b) | `occ / n_ports` tại `(dow, hour) = t` của scrubber; `observed_h` dưới ngưỡng §4d-3b → **không tô** (chấm rỗng viền xám), không phải 0 | `profile_168h.occ` · `.observed_h` · `stations.n_ports` |

**`station:occ` — vì sao mẫu số là `n_ports` (ASSET) chứ không phải `util_denominator_ports`.**
Trường này trả lời "trạm đang đầy tới đâu so với những gì **lắp đặt**" — cùng mẫu số với
mọi con số cung của app (`n_ports`, §7). Dùng mẫu số LIVE là trộn hai tầng mà
`DECISIONS §5` cấm trộn. Hệ quả trung thực: trạm báo cáo thiếu sẽ hiện *thấp*, và ô
giờ thiếu quan sát đã bị chặn riêng bằng `observed_h` nên cái "thấp giả" nguy hiểm nhất
không lọt qua đường màu.

**Mẫu số vắng thì trường vắng — đo lúc thi công M4.** `n_ports` null ở **26/939 trạm**
(13 trong số đó *có* hồ sơ 168h). Không có mẫu số thì không có tỉ số, và ràng buộc 1 nói
thẳng phải làm gì: chấm **rỗng**, y như ô giờ thiếu quan sát — **không** `?? 0`, **không**
mượn `util_denominator_ports` làm mẫu số thay thế. Mượn mẫu số khác là trả lời một câu
hỏi khác rồi dán nhãn của câu hỏi này lên, tức đúng thứ đoạn trên vừa cấm. Ba đường vào
cùng một chấm rỗng — thiếu hồ sơ · thiếu quan sát ở giờ `t` · thiếu `n_ports` — và cả ba
đều là "không biết", nên chúng đúng là **một** ký hiệu.

**`pop_beyond_2km` — vì sao `0` ở đây KHÔNG phá ràng buộc 1.** Ô có trạm trong 2 km
có **0 người ngoài 2 km** — đó là "biết là không", một phát biểu đúng, đúng nghĩa §7a. Ô
không tới được bằng đường bộ thì để `null`: ta không biết xa bao nhiêu, nên không được nói
là 0. Hai trạng thái khác nhau và chúng phải nhìn khác nhau — và chúng có, vì 0 rơi vào bậc
`{0}` riêng của §6a quy tắc 2 (≥5% giá trị đúng 0), còn null vẽ gạch chéo.

**`util_pctl_cell` — vì sao dùng phân vị chứ không tự tính "so với trung vị".** `util_pctl`
đã là *vị trí trong nhóm cùng loại* (`util_pctl_peer` = `HANOI|AC` · `|DC` · `|MIXED`),
tính lại trong phạm vi Hà Nội ở B6. `0,5` **chính là** trung vị nhóm. Tự dựng một phép chia
cho trung vị là tạo khái niệm thứ hai cho cùng một thứ — đúng loại trùng lặp mà cả bộ dữ
liệu này được dựng để tránh. Một khái niệm, một trường.

**Ramp tuần tự cho một đại lượng có tâm.** `util_pctl_cell` (tâm 0,5) và `detour_ratio`
(tâm 1) là đại lượng "lệch khỏi kỳ vọng", mà §4 chưa có ramp phân kỳ nào đã validate. Không
bịa một cái ở đây: dùng ramp cam tuần tự, và để legend in **ngưỡng thật** — mắt đọc được
chỗ 0,5 hay 1,0 rơi vào bậc nào. `detour_ratio` đã ship theo đúng cách này ở M1.1 và nó
hoạt động. Ramp phân kỳ là quyết định riêng, cần đo lại toàn bộ §4, và chưa đến lúc.

**Phủ của trường phái sinh không có trong `manifest.coverage`** — chúng không phải cột.
Tính **lúc chạy** từ chính mảng giá trị vừa nạp. Đó không phải vi phạm §7c: §7c cấm *gõ
tay* con số, và số đo lúc chạy còn bám dữ liệu sát hơn số đo lúc export. Phủ theo **dân**
cần `population` từng ô, nên truy vấn của trường ô luôn kèm cột đó.

### 13d. Ba luận điểm phải chứng minh, và mark của từng cái

Mentor không cần xem 45 trường. Họ cần ba câu trả lời để đánh giá phương pháp:

| # | Luận điểm | Vì sao nó quyết định | Mark |
|---|---|---|---|
| A | **Cầu vón cục, không đều** | nếu cầu phân bố đều thì GMM là công cụ SAI — đây là tiền đề của phương pháp, phải chứng minh chứ không giả định | mặt độ / đường đồng mức + một đường Lorenz "x% diện tích chứa y% dân" |
| B | **Cung lệch khỏi cầu** | nếu không lệch thì không có bài toán | 126 đa giác xã (`ports_per_10k_pop`, `dist_station_m_pop_weighted`) — **gọi tên** 2–3 xã cụ thể, không lặp lại choropleth (xem M3-Q2) |
| C | **Thước đo phải theo mạng đường** | vì sao không dùng k-means Euclid cho xong | mạng đường tô theo khoảng-cách-tới-trạm (đơn vị `road`, M3-R) + cầu + cặp đường minh hoạ; **696 ô** > 2× (**1.315.068 người**) là con số của cảnh — mark đổi ở quyết định 2026-08-07, xem khối M3 trong §11 |

Ghép lại chính là luận điểm của cả app: **cầu vón cục ⇒ mô hình hỗn hợp; cục có biên mềm
và chồng lấn ⇒ Gaussian chứ không phải cụm cứng; khoảng cách phải theo mạng ⇒ không dùng
Euclid được.**

**Spec đường Lorenz (cảnh A) — chốt 2026-08-07.** Luận điểm A cần một CON SỐ nhắc lại
được, và Lorenz là hình thức đúng vì nó vẽ *độ tập trung* — bản đồ mặt độ nói "cầu tụ Ở
ĐÂU", Lorenz nói "tụ ĐẬM ĐẶC cỡ nào"; hai mark bổ sung, không trùng:

- **Một đường** c5 `#9b380b` (một chuỗi ⇒ không legend, §4d-2) — tích luỹ dân theo diện
  tích, ô sắp xếp theo mật độ.
- **Đường chéo 45°** = "nếu dân rải đều", nét liền mảnh **mực mờ `#898781`**. Một sai
  lệch có chủ ý so với vai "tham chiếu = hairline `#e1e0d9`" của §4d-2, ghi lý do tại
  chỗ: đường chéo Lorenz không phải gridline — nó là một *phát biểu* (phân bố đều tuyệt
  đối) mà người xem phải so được với đường dữ liệu; `#e1e0d9` trên nền panel `#f9f9f7`
  gần như tàng hình, đủ cho lưới nhưng không đủ cho một đường mang nghĩa. Mực mờ vẫn là
  mực (§4e), không phải màu dữ liệu — bốn vai của §4d-2 không thêm vai nào.
- **Direct-label đúng MỘT điểm** — "x% diện tích chứa y% dân" tại điểm cong gắt nhất,
  chấm c7 + viền surface 2px (đúng vai "điểm được gọi tên" §4d-2). Không số nào khác
  trên đường — nhãn ở mọi điểm là anti-pattern đã ghi.
- **Tính LÚC CHẠY** từ `population` + `area_km2`, không precompute — §13c-1 đã cho phép
  số đo lúc chạy, và §14b đã bắt buộc điều này cho mọi con số trong cảnh.

### 13e. Lỗi dữ liệu đã sửa cùng lúc — `detour_ratio`

`s08_traveltime.py` tính tỉ số đi vòng cho **từng ô**, dùng nó để ra thống kê (trung vị
1,477 · p90 2,317 · max 109,6 · 726/4.400 ô > 2×), ghi vào `data/qa/s08_traveltime.json`
rồi **ném mảng đi**. Tức bức ảnh thuyết phục nhất của bộ dữ liệu — cái mà §2a gọi là "con
số quan trọng nhất" — không vẽ được, dù đã tính xong.

Sửa: giữ lại thành cột `detour_ratio` trong `traveltime_cell.parquet` ⇒ `grid_h3_r8.parquet`.

~~**Vì sao là `detour_ratio` chứ không phải `dist_station_euclid_m`:**~~ **VIẾT LẠI ở M3.**

*Lập luận cũ:* `DECISIONS §6` đã loại khoảng cách chim bay như một **biến thể** của
"khoảng cách tới trạm", nên ship lại nó là phá nguyên tắc một-khái-niệm-một-trường; chỉ
ship tỉ số, vì tỉ số là *sai số của cách đo đã bị loại*, một khái niệm mới. Một cột, không
phải hai.

*Vì sao lập luận đó không còn đứng:* nó đúng khi bộ dữ liệu có **một** cách đo khoảng cách.
Tầng dữ liệu giờ ship **cả ba**, và ba cột đó không cạnh tranh nhau — chúng là một **bộ ba
khép kín**, trong đó cột thứ ba là thương của hai cột đầu:

| cột | trả lời | |
|---|---|---|
| `dist_station_network_m` | xe đi thật bao xa | tử số |
| `dist_station_euclid_m` | chim bay bao xa | mẫu số |
| `detour_ratio` | chim bay sai bao nhiêu lần | **thương** |

Bỏ mẫu số đi thì thương trở thành một con số **không kiểm chứng được**: người xem thấy
"2,3 lần" mà không có cách nào biết 2,3 lần của cái gì. Nguyên tắc một-khái-niệm-một-trường
cấm hai cột **cùng trả lời một câu hỏi**; nó không cấm ba cột mà cột này là phép chia của
hai cột kia.

**Và đây là chỗ nó mở khoá M3.** Cảnh chủ lực đã định từ đầu là *"vòng tròn chim bay morph
sang đường đồng khoảng cách thật"*. Cảnh đó cần **cả hai** bán kính để morph giữa chúng —
tức nó cần đúng cột mà §13e cũ đã cấm. Suốt từ M1.1 tới M2, cảnh chủ lực của M3 **không
dựng được**, và không ai phát hiện ra vì chưa ai bắt đầu M3.

*(Từ "isochrone" trong ghi chép cũ giờ phải đọc là **isodistance** — đường đồng khoảng
cách theo mạng. Tầng dữ liệu đã bỏ hẳn thời gian lái, xem M2.1(i).)*

**Và cảnh morph đó vẫn KHÔNG dựng ở M3 — vì dữ liệu không đỡ được nó, không phải vì hết
giờ.** Đoạn trên nói `dist_station_euclid_m` "mở khoá" cảnh chủ lực. Kiểm lại lúc bắt tay
vào dựng thì lập luận đó hở một chỗ:

> Cả hai cột đo khoảng cách tới **trạm GẦN NHẤT**, không tới một trạm được chỉ định.

Một đường đồng khoảng cách phải là *quỹ tích các điểm cách **một** nguồn đúng r mét*. Với
cột "tới trạm gần nhất" thì `dist_station_network_m <= r` cho ra **hợp của mọi đĩa**, tức
vùng phủ — không phải một đường quanh một trạm, nên không có gì để morph từ vòng tròn sang.
Dựng "đường đồng khoảng cách" từ nó là đặt tên một khái niệm cho một đại lượng khác. Muốn
làm thật thì phải chạy lại Dijkstra một-nguồn ở `n07` và ship trường khoảng cách riêng của
trạm đó — việc của tầng dữ liệu, không phải việc của `web/`.

**Cái thay thế mạnh hơn, và nó đã có sẵn:** `n07` đã đo **sai số phủ của chim bay theo bán
kính**, so đúng hai cột đó trên đúng cùng tập ô. Ở bán kính 3 km (tỉnh 01), chim bay nói
3.864 ô đã phủ còn mạng đường nói **2.878** — **986 ô báo phủ nhầm, 25,5%**. Tỉ lệ này
**không phải hằng số giữa các tỉnh** (`HAN_CHE.md`), nên cảnh C đo lại lúc chạy. Đó chính là điều mà cảnh morph
định nói bằng hình, nói bằng một con số đo được, trên hình học thật chứ không trên một mặt
nội suy. Cảnh C in con số đó, **đo lại lúc chạy** từ hai cột đã ship (§14b-C).

---

## 14. Chế độ CÂU CHUYỆN — bốn cảnh, chốt ở M3

Hiện thực hoá trực tiếp §13d. Ba luận điểm + một cảnh tự khai giới hạn; số cảnh = 4 đã chốt
ở §11. §9a lo phần hash; mục này lo phần **cảnh chốt state gì**.

### 14a. Luật — một store, không phải hai

Cám dỗ hiển nhiên là cho chế độ CÂU CHUYỆN một state riêng, để nó không "làm bẩn" state của
BẢN ĐỒ. Bỏ, vì hai lý do và lý do thứ hai mới là lý do thật:

1. Hai store thì có hai `field`, và ràng buộc 2 nói "**đúng một** trường được tô mỗi lúc" —
   một bất biến đếm trên toàn app, không đếm trên từng chế độ.
2. **Chỗ giá trị nhất của cả chế độ này là lúc thoát ra khỏi nó.** Mentor xem cảnh C, thấy
   696 ô dọc sông, và muốn bấm vào một ô. Nếu thoát ra là về màn hình mặc định thì cảnh vừa
   xem trở thành một đoạn phim: xem xong, mất. Với một store thì thoát ra là **đứng nguyên
   tại chỗ vừa xem**, chỉ khác là rail hiện ra và mọi thứ bấm được.

Ba luật, và chúng là thứ có test:

> **L1 — Cảnh GHI ĐÈ, không sở hữu.** Vào một cảnh thì cảnh đó đặt `field`, `view`, `layers`
> vào **chính** store dùng chung. Không có bản sao nào.
>
> **L2 — Thoát ra BẢN ĐỒ không đặt lại gì cả.** Bỏ `s` đi là xong; `field`/`view`/`layers`/`c`
> giữ nguyên giá trị cảnh cuối để lại. Đó là bàn giao, không phải rò rỉ.
>
> **L3 — Ràng buộc 2 đứng nguyên.** Mỗi cảnh khai **một** `field` (một chuỗi). Cảnh không có
> đường nào đặt hai trường, và bộ lọc của cảnh C lọc *ô của một trường*, không thêm trường
> thứ hai.

**Người xem vẫn lái được bản đồ trong cảnh.** Bản đồ là cùng một bản đồ; kéo và phóng vẫn
chạy. Cái không xảy ra là **ghi khung nhìn đã kéo vào hash** — §9a đã cấm ghi `v` khi có
`s`. Nên link tới một cảnh mở ra **cảnh đó**, không mở ra chỗ người gửi lỡ tay kéo tới. Vào
lại một cảnh thì camera bay về khung nhìn của cảnh.

### 14b. Bốn cảnh — mỗi cảnh chốt gì

| `s` | trường (`field`) | khung nhìn | overlay | mark riêng của cảnh |
|---|---|---|---|---|
| `von-cuc` | `population` (ô) | z9,3 toàn thành phố | — | mặt độ liên tục (§1b) + **đường Lorenz** |
| `cung-lech` | `commune:ports_per_10k_pop` | bay tới từng xã được gọi tên | `stations` | panel XÃ mở sẵn (`c=commune:…`) |
| `di-vong` | **HAI NHỊP** (§14d) — `road:dist_station_m`, rồi `detour_ratio` | z9,3 toàn thành phố | — | nhịp 1: mạng đường tô theo khoảng cách + **cầu lớn** + **3 cặp tuyến** + **sông Hồng** (§2a) · nhịp 2: hex **đã lọc** `>2` (§13b-2) |
| `chua-biet` | `commune:ports_per_10k_pop` | z9,3 toàn thành phố | — | không có mark mới |

Ba điều đọc ra được từ bảng này, và cả ba đều có chủ ý:

- **Cảnh A không cần luật mới.** `population` có `surface: true` và z9,3 < `HEX_MIN_ZOOM`,
  nên `renderPlan` đã trả `surface` từ M2. Cảnh chỉ *đặt state*; nó không dạy bản đồ vẽ gì.
- **Cảnh B không lặp lại choropleth** (chốt ở §11): `ports_per_10k_pop` **chính là** trường
  mở app, nên khi tới cảnh B thì bản đồ đã ở đó rồi. Việc của cảnh là **gọi tên** — bay tới
  Phường Ba Đình (65.023 dân, **0 cổng**) và Phường Tây Mỗ (230,7 cổng/10k = **49× trung
  vị**), mở panel XÃ của từng nơi. Một con số trừu tượng thành hai cái tên nhắc lại được.
- **Cảnh D quay về khung nhìn mở app.** Nó đóng vòng ("đây là chỗ bạn bước vào") và để lại
  một state hợp lệ, quen thuộc cho L2 bàn giao.

**Mọi con số trong cả bốn cảnh đo LÚC CHẠY** từ cột đã ship — không hằng số nào trong TSX.
Cùng luật §7c/§13c-1, và ở đây nó gắt hơn: một câu chuyện là chỗ dễ nhất để một con số cũ
sống sót qua ba lần đổi dữ liệu mà không ai thấy, vì không ai đọc lại nó.

### 14c. Cuộn — cột cảnh THAY rail, không thêm dải thứ năm

Cột 400px ở **bên phải**, đúng chỗ rail đứng, và nó **thay** rail chứ không đứng cạnh:

- Trong cảnh không có bộ chọn trường — **cảnh chọn trường**. Một rail radio bên cạnh một
  cảnh đang áp đặt trường là hai thứ tranh nhau cùng một state, ngay trên màn hình.
- Dải trái 360px (§3d, dock M4) **không đụng tới**, nên M4 vẫn còn nguyên chỗ.
- 400px chứ không phải 320px của rail: cảnh A có một biểu đồ, và 320px trừ padding còn
  quá hẹp cho một trục có nhãn.

Dải legend (§3b) **ở lại** — nó mô tả trường mà cảnh vừa chốt, nên nó vẫn nói đúng. Đó cũng
là phép kiểm rẻ nhất cho L1: nếu legend trong một cảnh nói sai trường thì cảnh đã đặt state
sai.

**Chuyển cảnh bằng `IntersectionObserver`**, không bằng nghe `scroll`: trình duyệt đã biết
phần tử nào đang trong khung, và tự tính lại từ `scrollTop` là chép lại việc đó chậm hơn.
Không thêm dependency (§1). Mỗi cảnh là một khối cao bằng cột; cảnh cắt qua giữa cột là cảnh
đang hoạt động.

### 14d. NHỊP — một cảnh có thể có nhiều hơn một khung hình, chốt ở M3.1

Cảnh C phải nói **hai** thứ, và §11 đã tách vai chúng dứt khoát: mạng đường là *nguyên nhân
nhìn thấy được*, 696 ô `> 2` là *hậu quả đo được*. Nhét cả hai vào một khung hình thì hoặc
mất một cái, hoặc có hai mặt tô cùng lúc — mà cái thứ hai là phá thẳng ràng buộc 2.

> **Một cảnh là một DÃY NHỊP.** Mỗi nhịp chốt một `field` (và do đó một mặt tô), cộng các
> mark riêng của nó. Phần lớn cảnh có đúng một nhịp. Nhịp ĐẦU là mặc định khi vào cảnh.

Ràng buộc 2 nguyên vẹn: nhịp đổi **giá trị** của `field`, không đổi **số lượng** trường —
vẫn một chuỗi, vẫn một mặt tô. Đây cũng đúng cơ chế mà cảnh B đã dùng để bay giữa hai xã;
khác chỗ ở đó thứ đổi là khung nhìn, còn ở đây là trường.

**Nhịp KHÔNG vào hash**, và đó là quyết định chứ không phải thiếu sót. Ba lý do, lý do thứ
ba là lý do thật:

1. Một cảnh là đơn vị mà mentor gửi đi; `#s=di-vong` phải mở ra cảnh đó **từ đầu**, đúng
   như tên gọi. Link tới giữa cảnh là một khái niệm không ai xin.
2. Nó cùng hạng với "cảnh B đang bay tới xã nào" — cũng là một bước bên trong cảnh, cũng
   không có khoá riêng.
3. Nếu ai đó thật sự muốn gửi *cái nhịp kết*, thứ đáng gửi không phải một nhịp mà là **trường
   của nó ở chế độ BẢN ĐỒ** — nơi nó bấm được, lọc được, soi được. Luật L2 đã cho làm đúng
   điều đó bằng một nút. Thêm khoá `beat` là dựng một đường thứ hai tới cùng một chỗ, dở hơn.

**Ngưỡng "cầu lớn" là một giả định khai báo.** Dữ liệu có 4.154 đoạn `bridge`, trung vị
**16 m** — phần lớn là cống và cầu vượt bộ hành. Kẻ đậm tất cả thì ở zoom toàn thành phố
chúng thành một lớp chấm đen phủ khắp tỉnh và nuốt mất chính cái ramp mà cảnh đang cho xem
*(đã render và nhìn thấy, không phải lo xa)*. Bộ dữ liệu **không có cờ "qua sông Hồng"**,
nên ta không được vẽ như thể có; cái đo được là chiều dài, và nó tách hai nhóm rất sạch
(p90 = 90 m · p99 = 1.146 m · max = 4.475 m). Ngưỡng **1 km** giữ **48 đoạn**, rơi đúng vào
các nút vượt sông. Cùng hạng với `cellSize` của mặt độ cầu (§1b), nên nó phải hiện ra trong
câu chữ của cảnh — và câu chữ nói đúng thứ nó chọn: **"cầu dài hơn 1 km"**, KHÔNG phải "cầu
qua sông Hồng" (đoạn dài nhất nằm ở phía tây và không bắc qua sông Hồng).

**Tên cầu là chữ biên tập, không phải dữ liệu.** §11 (M3-R) đã ghi chỗ hở: bản trích OSM
không mang cột `name`. Chọn cách "biên tập trong web" thì phải trả giá của nó, và giá là:
tên chỉ được đặt ở chỗ nó không thể sai. Nên chúng nằm trong **panel dưới dạng câu**, không
dán làm nhãn trên bản đồ — dán nhãn là khẳng định một toạ độ mà ta không neo được vào đâu.
Bản đồ kẻ đậm 48 đoạn; điều đó thì dữ liệu nói được.

## 12. Nguyên tắc làm việc

- **Thay đổi tối thiểu.** Không thêm abstraction chưa cần.
- **Không thêm dependency** ngoài §1 mà không hỏi.
- **Không bịa số.** Mọi con số trong UI phải truy được về một cột trong
  `store/p/<mã>/`. Không có cột thì không hiện — đặc biệt là kVA lưới điện.
- **Logic thuần tuý thì có test, không verify bằng mắt.** Ảnh chụp chứng minh được *một
  phân bố cụ thể*, không chứng minh được *một quy tắc*. Chia bậc (§6a) là hàm thuần, nhiều
  nhánh ⇒ `web/test/*.test.ts`, chạy bằng `pnpm test`. Dùng `node:test` + `node:assert`
  có sẵn trong Node 22 (type-stripping bật mặc định từ 22.18) — **không thêm dependency
  nào**, đúng §1. Render thật vẫn bắt buộc, nhưng cho thứ chỉ render mới thấy.
- **Không có `?? 0`** trên đường từ dữ liệu tới màu. Đó là cách ràng buộc 1 bị phá.
- Đổi quyết định thì **sửa file này trước**, kèm lý do.
