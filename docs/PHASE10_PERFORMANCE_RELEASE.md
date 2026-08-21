# Phase 10 — Performance, Resilience & Release Audit

Status: **PHASE 10 SPEC — APPROVED**
Type: hardening spec. Phase 10 thêm **không một trường, không một phép tổng hợp, không một
luật mã hoá nào**. Nó chạm ba thứ: chi phí render, khả năng phục hồi sau lỗi, và đường vào
bằng bàn phím.

Scope: PERFORMANCE BUDGETS · ERROR RESILIENCE · KEYBOARD/AT ACCESS · LOCALE OF NUMBERS ·
RESPONSIVE FLOOR · ACCEPTANCE TESTS. Out of scope: mọi hợp đồng dữ liệu, mã hoá thị giác,
lens, story, simulation, national — chúng được kiểm là **không đổi**, không phải được sửa.

Mọi con số dưới đây đo trên bản build production (`vite build` + `vite preview :4173`),
Chrome 151, **GPU thật** (RTX 3060, ANGLE/Vulkan), cửa sổ 1600×1000, bộ tỉnh 01
(4.400 ô r8) và bộ toàn quốc (9.813 ô r6 · 6.380 trạm). Bản đo đầy đủ:
`docs/qa/phase10/baseline.md`.

---

## 0. TIỀN ĐỀ — vì sao tài liệu này ra đời SAU bản vá

Phase 10 khởi động như một đợt audit, không như một đợt xây: người ta đo trước, rồi mới
biết phải sửa gì. Hệ quả là bản vá đi trước bản khai — và QA Phase 10 đã mở đúng finding
cho việc đó (**10-QA-001**, BLOCKER: "không có Phase 10 Specification để đối chiếu
acceptance criteria"). Tài liệu này đóng nó, và nó **không** được viết như thể đã có sẵn
từ đầu: mỗi yêu cầu dưới đây kèm SỐ ĐO đã sinh ra nó.

Ba thứ tài liệu này cố tình làm, vì thiếu chúng chính là finding:

1. **Ngưỡng hiệu năng chính thức** (§3). Trước đó không có ngưỡng nào, nên không phép đo
   nào có thể "đạt" hay "trượt" — chỉ có thể "được báo cáo".
2. **Acceptance criteria đánh số** (§4), mỗi cái nói rõ nó được kiểm Ở ĐÂU.
3. **Bản khai nới lỏng** (§6): thứ Phase 10 CHỦ ĐÍCH không làm, kèm lý do đo được.

### 0a. Kế thừa — năm hạng mục của CR 2.1 §6, và trạng thái ở Phase 10

| # | Hạng mục kế thừa | Trạng thái |
|---|---|---|
| 1 | `scaleContract` là nhà duy nhất của thang | **Không chạm.** Phase 10 không thêm/sửa một field nào. |
| 2 | LUT là đường nội suy duy nhất | **Không chạm.** |
| 3 | Một bộ đèn dùng chung + cổng mặt trên | **Không chạm.** |
| 4 | Một miền, hai kênh | **Không chạm.** |
| 5 | Kẹp thang phải được công bố | **Không chạm.** |

Phase 10 chạm `Legend.tsx` (bỏ subscribe `view`), `MapView.tsx` (deps effect + guard
`raiseLabels`), `NationalMap.tsx` (gate reduced-motion, memo POI) và các panel (locale số).
**Không thay đổi nào trong số đó đổi một pixel màu hay một chiều cao khối** — điều kiện này
được khoá bằng bộ test `phase21-encoding` / `phase41-chart-encoding` đang có, chạy nguyên
vẹn (858/858 web tests xanh).

---

## 1. BASELINE (measured)

| Hạng mục | Số đo |
|---|---|
| FCP | 208 ms |
| App sẵn sàng (overview + canvas) | ~1,3 s lạnh · ~250 ms ấm |
| Bundle JS gzip | 167 + 267 + 494 = ~930 KB · DuckDB wasm 8,1–9,3 MB (nạp lười) |
| Heap sau load | 55–79 MB |
| Chuyển lens (5 lens) | 9–23 ms sync · long task tệ nhất 206 ms |
| Tìm kiếm mỗi phím | 6,5 ms đầu · median 33 ms |
| Pan / zoom | 60 FPS · khung tệ nhất 17 ms · 0 long task |
| Scrubber play 4 Hz + drag | 60 FPS · 0 long task · +0,3 MB/5 s |
| Bật/tắt 3D | 12 ms |
| Lọc histogram | 11 ms |
| Story vào / ra | ~42 ms / ~15 ms · +2,2 MB mỗi 4 chu kỳ (giữ model, có chủ đích) |
| Toàn quốc boot · hover 34 tỉnh | 1,9 s · 60 FPS |
| Drill-down tỉnh (ấm) | 223 ms |
| Mô phỏng: click → phán quyết L6 | 418 ms · 0 long task |
| Idle | 0,0 % main thread · **0 rAF/s** |
| 15 chu kỳ đổi lens (sau GC) | **+20,3 MB** ← đây là defect |

**Cảnh báo harness, ghi lại vì nó suýt đổi cả kết luận.** Lần đo đầu chạy nhầm
SwiftShader và cho 9 FPS khi pan, long task 110 ms mỗi khung. Đó là số của **trình đo**,
không của app. Mọi ngưỡng ở §3 chỉ có nghĩa trên GPU cứng; witness headless ở
`docs/qa/phase10/run_witness.py` **không** đo FPS và nói rõ điều đó trong báo cáo.

### 1a. Hai claim của audit tĩnh bị số đo BÁC

1. *"Vòng lặp `styledata` → `moveLayer` giữ full placement mỗi khung mãi mãi"* — idle đo
   **0 rAF/s, 0 % busy**: không xảy ra trên build thật. Hạ P0 → P2, vẫn thêm guard vì nó
   rẻ (§2, R8c).
2. *"Re-render toàn app 4 Hz khi play"* — có thật về cơ chế, nhưng 60 FPS / 0 long task
   trên máy đích. Hạ P1 → vá phẫu thuật, **không** tái kiến trúc.

---

## 2. REQUIREMENTS

Mỗi yêu cầu: **số đo sinh ra nó** → **điều phải đúng sau khi vá**.

### R1 — Không tồn tại đường nào dẫn tới màn hình trắng không thông điệp

*Đo:* trước Phase 10, `main.tsx` không có error boundary và `boot()` không có `.catch`.
Một exception render bất kỳ, hoặc một dynamic import hỏng, unmount cả app thành nền trắng
vĩnh viễn.

**R1a.** Cả **ba** shell (tỉnh, toàn quốc, proxy) phải nằm trong một error boundary.
**R1b.** `boot()` phải có nhánh catch vẽ bằng **DOM trần + inline style** — nó chạy ở thời
điểm React có thể chưa tồn tại và CSS có thể đã chết, nên nó không được phụ thuộc cả hai.
**R1c.** Thông điệp phải mang **nguyên văn** `error.message`, không phải một câu chung
chung; và phải ghi `console.error` cho người mở DevTools.
**R1d.** Boundary **không** thay các trạng thái lỗi theo surface (banner `role="alert"` của
Workspace vẫn là nơi lỗi fetch đổ về). Nó chỉ hứng thứ không surface nào hứng.

### R2 — Bộ lọc bảng DỮ LIỆU: một chuỗi cam kết cho cả ba đường ra

*Đo:* mỗi phím gõ phát **2 truy vấn DuckDB** (count + page) và xếp trước hàng đợi serial
toàn app; gõ "vinfast" = ~14 lượt quét LIKE.

**R2a.** Chuỗi lọc phải trễ **250 ms** trước khi thành chuỗi cam kết.
**R2b.** **Bảng, số đếm, và bản xuất phải đọc CÙNG một chuỗi cam kết.** Đây là điều khoản
mà bản vá đầu tiên của Phase 10 vi phạm và QA bắt được (**10-QA-004**): query dùng chuỗi
trễ trong khi nhãn đếm và `handleExport` dùng chuỗi tức thời, nên trong 250 ms giao diện
trình bày số của bộ lọc CŨ như câu trả lời cho bộ lọc VỪA GÕ, và một cú bấm Xuất trong cửa
sổ ấy ghi ra một tập khác với bảng đang nhìn. **Đó là lỗi trình bày dữ liệu, không phải
lỗi hoạt hình** — nên nó chịu cùng luật với ràng buộc 1 (`null` không bao giờ thành `0`):
một con số chỉ được in khi nó thật sự trả lời câu hỏi đang hiển thị.
**R2c.** Phép so quyết định trạng thái chờ là **"chuỗi đang GÕ" vs "chuỗi mà `data` đang
MÔ TẢ"** (`data === null || dataFilter !== filter`), không phải cờ `loading`. Khi nó bật:
số đếm **không in một con số nào** và nút Xuất khoá kèm câu giải thích.

Vì sao không phải `loading`: `loading` cũng bật khi đổi trang hoặc đổi cột sắp xếp, mà hai
thao tác ấy **không làm `total` sai đi tí nào**. Gác bằng `loading` là nói dối theo chiều
ngược lại — biến một con số đúng thành "đang lọc…". Witness kiểm cả hai chiều: trong cửa sổ
debounce số biến mất, sau khi bấm sắp xếp số vẫn còn.

### R3 — Cache trường có trần, và lifecycle của nó phải đúng

*Đo:* +20,3 MB heap sau 15 lần đổi lens ở Hà Nội (4.400 ô); tỉnh 30k ô ≈ ×7.

**R3a.** Trần **4 trường** đã ngã ngũ. Trường vừa đọc luôn được chạm lên đầu (LRU theo lần
ĐỌC, không theo lần nạp), nên trường đang tô không bao giờ bị đuổi.
**R3b.** Truy vấn **đang chạy không bao giờ bị đuổi**. Đuổi một promise đang bay không giải
phóng gì (promise vẫn sống) mà chỉ khiến lần đọc kế tiếp phát thêm một truy vấn — mất cả
hai đầu. Sổ đang-chạy vì thế **không có trần**; nó bị chặn bởi số truy vấn đang bay.
**R3c.** Nhánh ngã ngũ phải so **identity**, không so khoá. Với một Map gộp, một truy vấn
cũ lỗi sau khi bị thay sẽ `delete(key)` và bắn rụng promise MỚI của cùng khoá.
**R3d.** Promise lỗi **không** vào sổ nhớ: lần đọc sau phải là một lần thử lại thật.

R3b–R3d là finding **10-QA-005**; chúng buộc cache tách thành hai sổ, và tách ra một
module không phụ thuộc gì (`data/request-cache.ts`) đúng để kiểm được hành vi.

### R4 — Bảng DỮ LIỆU sắp xếp được bằng bàn phím

*Đo:* header là `<th onClick>` — không focus được, không có `aria-sort`.

**R4.** Mỗi ô tiêu đề sắp xếp là một `<button>` thật bên trong `<th aria-sort>`;
`aria-sort` phản ánh đúng `ascending`/`descending`/vắng mặt.

### R5 — Thanh trượt tuần dùng được bằng bàn phím và bằng AT

*Đo:* track chỉ nghe pointer; nút play đọc thành "▶"/"▮▮".

**R5a.** Track khai `role="slider"` + `tabIndex=0` + `aria-label` + `aria-valuemin/max/now`
+ `aria-valuetext` (dạng "T2 14:00", không phải một số trần).
**R5b.** Bước phím chuẩn slider: ←/→ **1 giờ**, PageUp/PageDown **24 giờ**, Home → **0**,
End → **167**. Quay vòng ở cả hai mút (tuần là một vòng).
**R5c.** Phím **không thuộc** thanh trượt phải đi tiếp — `preventDefault` vô điều kiện sẽ
giết Tab và nhốt focus.
**R5d.** Nút play có `aria-label`.

### R6 — Số thập phân đọc được ở vi-VN

*Đo:* 11 chỗ `toFixed()` in dấu chấm; "1.85" đứng cạnh "12,3%" trong CÙNG panel bị đọc
thành *một nghìn tám trăm năm mươi*.

**R6a.** Mọi số **để đọc** đi qua `formatFixed(v, digits)` — cùng số chữ số cố định, dấu
phẩy.
**R6b.** Hai loại được phép giữ dấu chấm, và chỉ hai: **toạ độ** lat/lng (chuỗi kỹ thuật
in bằng mono, quy ước `docs/COT.md`) và **dữ liệu đường SVG** (`d`, nơi dấu phẩy là cú
pháp của chính path).

### R7 — Camera phải tôn trọng `prefers-reduced-motion` ở CẢ HAI bản đồ

*Đo:* `MapView` đã gate `flyTo` đúng; `NationalMap.easeTo` thì không.

**R7.** Kill-switch CSS toàn cục **không với tới** animation camera của maplibre, nên mỗi
chỗ gọi `easeTo`/`flyTo` phải tự hỏi media query và đổi sang `jumpTo` khi người dùng xin ít
chuyển động.

### R8 — Chi phí mỗi khung không được quay lại

**R8a.** `App` **không** subscribe `t` trần ở gốc: mỗi tick play 4 Hz sẽ render cả cây.
Số theo giờ đi qua selector dẫn xuất, chỉ đổi khi con số thật đổi.
**R8b.** Effect dựng lớp của `MapView` **không** có `props` trong deps và **không** spread
`...props` vào `buildLayers`: identity của object props đổi ở mọi render App, nên để nó ở
đó là "mọi render App = dựng lại toàn stack deck". Mọi input thật được liệt kê rời.
**R8c.** `raiseLabels` no-op khi thứ tự đã đúng: `moveLayer` của maplibre KHÔNG tự no-op —
nó set `_layerOrderChanged` kể cả khi lớp đã ở cuối, kéo theo full symbol placement và một
sự kiện `styledata` mới; mà hàm này được gọi từ chính `styledata`.
**R8d.** `Legend` đọc `view` bằng `getState()` trong handler thay vì subscribe — subscribe
là re-render legend ở mọi khung pan/zoom.
**R8e.** Handler `onPickProvince` và tập POI đã lọc ở màn hình toàn quốc phải ổn định
identity (`useCallback` / `useMemo` ngoài effect): 25k icon POI re-upload mỗi lần hover đổi
tỉnh nếu không.

### R9 — Focus quay về sau khi đóng thẻ bằng chứng

*Đo:* `EvidenceCard` khôi phục focus qua selector `[role="region"][aria-label*="Bản đồ"]`,
còn `Workspace` dựng `<main aria-label="Không gian bản đồ chính">`. **Không khớp** — focus
rơi về `<body>`.

**R9.** Selector dự phòng của `EvidenceCard` và phần tử `Workspace` dựng phải khớp nhau về
cả tag lẫn `aria-label`, và phần tử ấy phải `tabIndex={-1}` để nhận được focus bằng mã.

### R10 — Sàn responsive

**R10.** Ở **760 · 900 · 1024 · 1280 · 1600** px: `document.scrollWidth` không vượt
viewport, và không phần tử nào (trừ canvas WebGL, thứ tự quản devicePixelRatio) tràn ra
ngoài. Dưới 1024 px là một cột: bản đồ toàn màn + bottom bar, cột đọc và tìm kiếm vào sheet
"Mở cột đọc".

---

## 3. NGƯỠNG HIỆU NĂNG CHÍNH THỨC

Đây là phần QA Phase 10 ghi "NOT VERIFIED — thiếu threshold trong spec". Ngưỡng đặt **có
biên trên số đo**, không đặt bằng số đo: một ngưỡng bằng đúng số đo là một tautology sẽ đỏ
ở lần chạy sau vì nhiễu.

**Giao thức đo** (bắt buộc trích dẫn khi báo cáo một con số ở đây): build production,
`vite preview`, Chrome ≥ 151, **GPU phần cứng** (`chrome://gpu` phải nói ANGLE trên driver
thật, KHÔNG SwiftShader), cửa sổ 1600×1000, bộ tỉnh 01. Truy vấn DuckDB đo riêng bằng
`/bench.html` (`src/bench.ts`, 3 lần khởi động + 15 lần tính).

| Hạng mục | Ngưỡng | Đo được | Biên |
|---|---|---|---|
| FCP | ≤ 500 ms | 208 ms | ×2,4 |
| App sẵn sàng, lạnh | ≤ 3,0 s | ~1,3 s | ×2,3 |
| Pan / zoom bản đồ | ≥ 50 FPS, 0 long task > 50 ms | 60 FPS, 0 | — |
| Scrubber play 4 Hz | ≥ 50 FPS, 0 long task > 50 ms | 60 FPS, 0 | — |
| Chuyển lens (đồng bộ) | ≤ 50 ms | 9–23 ms | ×2,2 |
| Tìm kiếm mỗi phím | ≤ 60 ms median | 33 ms | ×1,8 |
| Bật/tắt 3D · lọc histogram | ≤ 50 ms | 12 · 11 ms | ×4 |
| Toàn quốc boot | ≤ 4,0 s | 1,9 s | ×2,1 |
| Drill-down tỉnh (ấm) | ≤ 600 ms | 223 ms | ×2,7 |
| Mô phỏng click → phán quyết | ≤ 1,0 s | 418 ms | ×2,4 |
| **Idle** | **0 rAF/s** | 0 | ngưỡng CỨNG |
| Heap sau load | ≤ 150 MB | 55–79 MB | ×1,9 |
| **Rò theo số lần đổi lens** | **≤ +5 MB / 15 chu kỳ sau GC**, phẳng ở chu kỳ tiếp | trước: +20,3 MB · sau: phẳng sau lần ấm máy | — |
| Payload nạp đầu, toàn quốc | ≤ `manifest.bytes_first_load` + `provinces.geojson` | 817.876 / 817.876 B | cổng Phase 9 AT12 |
| JS gzip nạp đầu | ≤ 1,1 MB | ~930 KB | ×1,18 |

Hai ngưỡng là **CỨNG** (không có biên, trượt là fail): idle 0 rAF/s, và payload nạp đầu
toàn quốc. Cả hai đã có cổng tự động (`docs/qa/phase9/run_witness.py` AT12 cho cái sau).

**DuckDB WASM 8,1–9,3 MB gzip không nằm trong ngân sách nạp đầu** vì nó nạp lười — nó chỉ
được kéo về khi người dùng mở một surface cần truy vấn. Điều kiện của việc miễn trừ này là
"nạp lười" phải đúng, và đó là thứ AT12 của Phase 9 đang canh.

---

## 4. ACCEPTANCE CRITERIA

Mỗi tiêu chí nói rõ **nơi nó được kiểm**. Hai nơi, và chúng khác nhau về vai trò:

- `web/test/phase10-release.test.ts` + `web/test/request-cache.test.ts` — chạy trong
  `make kiem`. Rẻ, chạy mọi lần, không cần trình duyệt.
- `docs/qa/phase10/run_witness.py` — Chrome thật, tự dựng server. Đây là nơi những thứ chỉ
  tồn tại trong một cây React sống hoặc trong một media query được đo.

| Id | Tiêu chí | Kiểm ở |
|---|---|---|
| **AT10-1** | Ba shell đều trong boundary; `boot().catch` vẽ bằng DOM trần; một exception render THẬT hiện ra thành `role="alert"` mang nguyên văn thông điệp | test (cấu trúc) + **witness** (tiêm lỗi thật) |
| **AT10-1b** | Chặn module `App` ⇒ `boot()` ngã ⇒ thông điệp hiện ra, không phải màn trắng | **witness** |
| **AT10-2** | Bảng · số đếm · export đọc cùng một chuỗi cam kết; trong cửa sổ chờ không in số nào và nút Xuất khoá; settle xong mở lại; **đổi cột sắp xếp KHÔNG bật trạng thái chờ** | test + **witness** |
| **AT10-3** | Header sắp xếp focus được, Enter đổi `aria-sort` | test + **witness** |
| **AT10-4** | Dưới `prefers-reduced-motion: reduce`, app gọi `jumpTo`; mặc định gọi `easeTo` | test (cấu trúc) + **witness** (media emulation, ghi lời gọi) |
| **AT10-5** | Cache trường: >4 request đồng thời không đuổi nhau · LRU theo lần đọc · request cũ ngã không xoá entry mới · lỗi không vào sổ nhớ | **test (hành vi)** |
| **AT10-6** | Thanh trượt: focus được, ←/→/PageUp/PageDown/Home/End đúng bước và quay vòng, phím lạ đi tiếp, nút play có tên | **test (hành vi)** + witness |
| **AT10-7** | `formatFixed` giữ đúng số chữ số và dùng dấu phẩy; không panel nào còn `toFixed` trên số để đọc | **test (hành vi)** |
| **AT10-8** | App không subscribe `t` trần · `props` không trong deps layer · `raiseLabels` có guard · Legend không subscribe `view` | test (cấu trúc) |
| **AT10-9** | Selector focus-restore của `EvidenceCard` khớp phần tử `Workspace` dựng, và phần tử ấy nhận được focus | test (đối chiếu hai file) + **witness** |
| **AT10-10** | Không tràn ngang ở 760/900/1024/1280/1600 | **witness** |
| **AT10-11** | Không hồi quy: 858/858 web test · 735/735 pytest · schema khớp · golden khớp · lint 0 | `make kiem` |
| **AT10-12** | Witness Phase 9 (AT11–AT14) vẫn xanh | `docs/qa/phase9/run_witness.py` |

**Bằng chứng được version hoá** (finding 10-QA-003): `docs/qa/phase10/witness-report.json`
là báo cáo máy đọc được, đi vào Git cùng ảnh chụp `at10-*.png`. `.gitignore` được sửa để
`docs/PHASE*.md`, `docs/adr/*.md` và `docs/qa/**/*.md` không còn rơi ra ngoài Git.

---

## 5. CỔNG XÁC ĐỊNH

`make kiem` = **lint → schema → pytest → web test → golden**. Lint mới vào cổng ở Phase 10
(finding 10-QA-006) và phạm vi của nó được **khai** ở `pyproject.toml`, không để mặc định
của công cụ quyết định — xem chú thích ở đó cho từng luật được chọn và từng luật bị loại.

`golden` được **tái lập** ở Phase 10 để đóng finding 10-QA-002; quyết định và bằng chứng ở
`docs/adr/0006-tai-lap-golden-so-cai-2km-va-7-cot-phase9.md`. Sai khác là của Phase 9
(sổ cái 2 km + 7 cột mới), không phải của Phase 10, và nó được chứng minh bằng một phép
đối chứng: chênh lệch `sum` của `pop_beyond_2km_network` khớp phần dân bị xếp nhầm tới
**4 người trên 34 tỉnh**.

---

## 6. NỚI LỎNG ĐÃ KHAI — thứ Phase 10 CHỦ ĐÍCH không làm

Danh sách này tồn tại để lần sau không ai phải đoán "họ quên hay họ quyết".

| Hạng mục | Vì sao không làm |
|---|---|
| Memo partition `hexLayers`/`roadLayers` (ổn định identity `data` cho deck) | Đo 60 FPS trên GPU đích; refactor lớn trong `buildLayers`. Để dành tới khi có bằng chứng máy yếu. **Roads 160k segment là ứng viên số một** nếu bằng chứng ấy xuất hiện. |
| Gate `buildStoryModels` theo `scene !== null` | Store parse hash lúc nạp module, nên gate dễ vỡ deep-link story. Lợi đo được ≈ 0. |
| Queue-cancel cho truy vấn DuckDB đang xếp hàng | Debounce (R2) đã cắt phần lớn hàng đợi thừa. Huỷ giữa chừng là một cơ chế mới với ca biên riêng. |
| Banner khi mất WebGL context | Chưa quan sát được lần nào; boundary R1 đã chặn màn trắng. |
| Keyboard readout cho `AccessCurve` / `SupplyLorenz` (hiện hover-only) | Nợ AT thật, ghi lại. Cần một mô hình đọc-bằng-phím cho biểu đồ, không phải một bản vá một dòng. |
| Roving tabindex cho 2 nhóm `role="radio"` | Cùng lý do: là một mẫu tương tác, không phải một thuộc tính. |
| Ngưỡng lint E501 · E712 · B905 · RUF046 | Xem chú thích `pyproject.toml`. E712 đặc biệt: lời khuyên của ruff **ném** trên Series pandas. |
| `golden` phủ manifest JSON / GeoJSON | Rủi ro đã biết từ ADR-0001, chưa đóng. Defect D1 của Phase 9 sống đúng trong khoảng trống này. |
| FPS trong witness headless | SwiftShader cho số vô nghĩa (đã đo: `easeTo` 500 ms chỉ kịp 2 khung). Witness đo **lời gọi**, không đo khung; FPS chỉ đo tay theo giao thức §3. |

---

## 7. RỦI RO CÒN LẠI

1. **Ngưỡng §3 chưa có cổng tự động** trừ hai cái CỨNG. Chúng là hợp đồng đọc bằng mắt cho
   tới khi có một harness đo trên GPU thật trong CI — và CI ấy chưa tồn tại (dự án chạy
   cục bộ theo ToS nguồn).
2. **Số baseline §1 do Builder đo.** QA Phase 10 nói rõ nó không coi chúng là xác minh độc
   lập. Giao thức §3 tồn tại để bất kỳ ai cũng đo lại được; đó là mức đảm bảo hiện có.
3. **Witness chạy trên SwiftShader.** Mọi tiêu chí nó kiểm đều được chọn để không phụ thuộc
   tốc độ render. Tiêu chí nào phụ thuộc thì thuộc §3, không thuộc §4.
