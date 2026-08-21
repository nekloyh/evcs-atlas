# Phase 10 — Performance baseline & release audit (2026-08-21)

Đo trên bản build production (`vite build` + `vite preview :4173`), Chrome 151 headless,
GPU thật (RTX 3060, ANGLE/Vulkan), cửa sổ 1600×1000. Lưu ý harness: lần đo đầu chạy nhầm
SwiftShader (WebGL mềm) cho số pan 9 FPS / long task 110 ms mỗi khung — **artifact của
harness, không phải app**; mọi số dưới đây là trên GPU cứng.

## Baseline (prod)

| Hạng mục | Số đo |
|---|---|
| FCP | 208 ms |
| App sẵn sàng (overview + canvas) | ~1,3 s lạnh · ~250 ms ấm |
| Bundle JS (gzip) | ~930 KB (index 167 + App 267 + geojson-layer 494) + DuckDB wasm 8,1–9,3 MB (lazy) |
| Heap sau load | 55–79 MB |
| Chuyển lens (5 lens) | 9–23 ms sync; long task settle tệ nhất 206 ms |
| Tìm kiếm (mỗi phím) | 6,5 ms đầu · median 33 ms |
| Pan / zoom bản đồ | 60 FPS, khung tệ nhất 17 ms, 0 long task |
| Scrubber play (4 Hz) và drag | 60 FPS, 0 long task, +0,3 MB/5 s |
| Bật/tắt 3D | 12 ms |
| Lọc histogram (Lọc) | 11 ms |
| Story vào/ra | ~42 ms vào · ~15 ms ra · +2,2 MB/4 chu kỳ (giữ model, có chủ đích) |
| Toàn quốc: boot | 1,9 s; hover quét 34 tỉnh 60 FPS |
| Drill-down tỉnh (ấm) | 223 ms, hash giữ `tinh=19` đúng |
| Mô phỏng: click → phán quyết L6 | 418 ms, 0 long task |
| Idle | 0,0 % main thread · **0 rAF/s** — bản đồ tắt hẳn vòng render |
| **Chu kỳ 15 lần đổi lens (sau GC)** | **+20,3 MB** — cache trường không giới hạn |

## Hai claim của audit tĩnh bị số đo BÁC

1. "P0: vòng lặp styledata→moveLayer giữ full placement mỗi khung mãi mãi" — đo idle
   0 rAF/s, 0 % busy: **không xảy ra** trên build thật. Hạ xuống P2 (thêm guard rẻ tiền).
2. Re-render toàn app 4 Hz khi play + rebuild layer theo `props` — có thật về cơ chế,
   nhưng đo 60 FPS/0 long task trên máy đích: hạ P1→vá phẫu thuật, không tái kiến trúc.

## Responsive

≥1440 và 1024–1439: hai cột, không tràn ngang ở 1600/1280/1024. <1024 (900/760):
map toàn màn + bottom bar, cột đọc và tìm kiếm nằm trong sheet "Mở cột đọc" — đủ đường
vào, không tràn. Không phần tử nào rộng hơn viewport ở cả 5 bề rộng đo.

## Keyboard/focus (đo thật)

Tab order hợp lý (nav rail → search → preset chip), outline 2px solid hiện trên mọi
phần tử focus được. Các lỗ code-level nằm ở danh sách fix dưới.

## Fix ưu tiên

### P0 — RELEASE BLOCKER
- **P0-1 Không có error boundary, `boot()` không catch** (`main.tsx:68`): một exception
  render bất kỳ hoặc dynamic import hỏng ⇒ trắng màn hình vĩnh viễn, không thông điệp.

### P1 — SHOULD FIX
- **P1-1 DataMode filter: 2 query DuckDB mỗi phím, không debounce**, đứng trước hàng đợi
  query toàn app (`DataMode.tsx` onChange + effect; `datamode.ts` count+page).
- **P1-2 Cache `fieldRequests` không giới hạn** (`queries.ts:222`): +20,3 MB/15 lần đổi
  lens đo được; ~×7 ở tỉnh 30k ô. → LRU giữ 4 trường.
- **P1-3 `props` trong deps effect build layer** (`MapView.tsx:555`) và **`t` subscribe ở
  App root** (`App.tsx:532`): mọi render App = rebuild toàn stack deck; play = render cả
  cây 4 Hz. Vá phẫu thuật: bỏ `props` khỏi deps; đẩy 2 chỗ đọc `t` xuống lá.
- **P1-4 Sort bảng DỮ LIỆU không dùng được bàn phím** (`DataMode.tsx:1611` `<th onClick>`,
  không `aria-sort`).
- **P1-5 `toFixed()` in "." trong UI vi-VN** (CellPanel ×4, CommunePanel ×4,
  SimulationPanel, DataMode:1095, NationalApp:425,624): "1.85" đọc thành 1.850.
- **P1-6 Scrubber**: track không keyboard/AT (`role="slider"` + phím mũi tên), nút play
  đọc thành "▶"/"▮▮" (cần `aria-label`).
- **P1-7 NationalMap `easeTo` bỏ qua prefers-reduced-motion** (`NationalMap.tsx:456`)
  trong khi MapView đã gate đúng.

### P2 — OPTIONAL (làm nếu rẻ)
- Guard `raiseLabels` (so thứ tự trước khi `moveLayer`) — bảo hiểm 1 dòng cho vòng lặp lý thuyết.
- `useCallback` `onPickProvince` + memo POI `shown` ngoài effect (NationalApp/NationalMap).
- `EMPTY_CELLS` hằng module cho SearchBar (App.tsx:320).
- EvidenceCard focus-restore: `main` Workspace cần `role="region" tabIndex={-1}` khớp selector.
- Gate `buildStoryModels` theo `scene !== null` (App.tsx:364).
- Legend bỏ subscribe `view`, đọc `getState()` trong handler (4 chỗ).
- Memo partition hexLayers/roadLayers (ổn định identity `data` cho deck) — vô hình trên GPU
  mạnh, đáng làm cho máy yếu; roads 160k segment là ứng viên số một.
- WebGL context-loss → banner lỗi có sẵn; hover-only readout (AccessCurve/SupplyLorenz);
  MiniHeatmap click-only; `role="radio"` thiếu arrow-key (2 nhóm); title cho tên xã dài
  (OpportunityCommuneRankBars); cache `fetchDetourStats`.

### Không làm gì (đã kiểm, sạch)
Kết nối DuckDB (1 conn/query, finally đóng); search index build 1 lần; story/sim không rò
timer; empty/loading/error state đầy đủ theo surface; `lang="vi"`; focus-visible toàn cục;
LOD toàn quốc có hysteresis; drill-down reload sạch listener; presets `fmt()` cũ đã hết bug.

---

## Đã cài (cùng ngày) và số kiểm sau vá

**P0-1** `AppErrorBoundary` (mới, `src/AppErrorBoundary.tsx`) bọc cả ba app + `boot().catch`
ghi thông điệp DOM trần vào `#root` — inline style có chủ đích để sống sót cả khi CSS chết.

**P1-1** DataMode filter debounce 250 ms (`debouncedFilter`). Kiểm: gõ xong 150 ms bảng còn
"4.400 / 4.400" (chưa bắn query), sau settle "0 / 4.400 dòng khớp bộ lọc".
**P1-2** `fetchField` LRU 4 trường. Kiểm 3 batch × 15 lần đổi lens: +56,6 → +57,6 → +58,0 MB
(cộng dồn, sau GC) — phần lớn là buffer pool DuckDB-WASM ấm máy MỘT LẦN rồi phẳng
(+1,4 MB cho 30 lần đổi tiếp theo); LRU chặn phần mảng JS từng giữ vô hạn theo số trường.
**P1-3** Bỏ `props` khỏi deps effect build layer (liệt kê rời `analyticalCells/Stations`);
App không còn subscribe `t` trần — `occDrawnCount` thành selector `useShallow`,
`selectedValue` thành selector. Kiểm: play 60 FPS, số "trạm" trong legend vẫn đổi theo giờ
(35→26), test 4b sửa regex nhận `s.t`.
**P1-4** Sort bảng = `<button>` trong `<th>` + `aria-sort`. Kiểm: focus + Enter đổi
`aria-sort="ascending"`.
**P1-5** `formatFixed()` (vi-VN) thay 11 chỗ `toFixed` ở CellPanel/CommunePanel/DataMode/
NationalApp; toạ độ mono giữ dấu chấm theo quy ước.
**P1-6** Scrubber: track `role="slider"` + ←/→/PageUp/PageDown/Home/End, nút play có
`aria-label`. Kiểm: focus track, 3×ArrowRight → "T2 11:00"→"T2 14:00", `aria-valuenow=14`.
**P1-7** NationalMap tilt: `jumpTo({pitch})` khi reduced-motion.

**P2 đã làm:** guard `raiseLabels` (so đuôi thứ tự trước khi moveLayer); `useCallback`
`pickProvince` + memo `shownPoi` (NationalApp/NationalMap); `EMPTY_CELLS` (App); Workspace
`<main tabIndex={-1}>` + selector focus-restore của EvidenceCard sửa khớp; Legend bỏ
subscribe `view` (đọc `getState()` trong 4 handler); `title` cho tên xã ở RankBars.

**P2 chủ đích KHÔNG làm:** gate `buildStoryModels` theo scene (store parse hash lúc nạp
module — gate dễ vỡ deep-link story, lợi đo được ~0); memo partition hexLayers/roads (đo
60 FPS trên GPU đích, refactor lớn trong `buildLayers` — để khi có bằng chứng máy yếu);
WebGL context-loss banner; keyboard readout cho AccessCurve/SupplyLorenz; roving tabindex
2 nhóm radio; queue-cancel cho query DuckDB đang xếp hàng.

**Trạng thái cổng:** tsc ✓ · test 832/832 ✓ · build ✓ · national boot + drill-down ✓
(probe "FAIL" trong verify.mjs là lỗi harness: đổi `#tinh` không reload trang).

---

## Vòng hai — vá theo QA Phase 10 (2026-08-21)

QA đọc bản trên và trả **FAIL**: 2 BLOCKER, 3 HIGH, 1 MEDIUM. Phần dưới là những gì đổi,
và điều quan trọng nhất: **hai finding bác chính bản vá vòng một**, không phải bác bản đo.

### 10-QA-001 · thiếu spec — ĐÓNG
`docs/PHASE10_PERFORMANCE_RELEASE.md`: yêu cầu R1–R10, **ngưỡng hiệu năng chính thức** (§3,
với giao thức đo), acceptance AT10-1…AT10-12, và bản khai nới lỏng. Trước đó không có ngưỡng
nào, nên không phép đo nào có thể "đạt" — chỉ có thể "được báo cáo".
`.gitignore` bỏ liệt kê từng-file (dừng ở PHASE5) sang `docs/PHASE*.md` + `docs/adr/*.md` +
`docs/qa/**/*.md`: spec của Phase 6→10 đã nằm ngoài Git suốt 5 phase.

### 10-QA-002 · golden fail 12 sai khác — ĐÓNG
Sai khác là của **Phase 9**, không phải Phase 10 (phase này không chạm một dòng Python).
Chứng minh chứ không tuyên bố: chênh `sum` của `pop_beyond_2km_network` là 1.358.326, còn
phần dân bị defect D2 xếp nhầm sang "trong 2 km", đo lại trên 34 gói r8, là **1.358.330** —
lệch 4 người, đúng bằng sai số `int()` từng tỉnh. Ba phép kiểm sổ cái khác cũng khớp
(`within + beyond = grid` lệch 1,9 người; `share_beyond + access = 1` sai số 0,0;
`share_pop_unreach` p96 = 0,1066 trùng khít §1.4 của spec Phase 9). Golden ghi lại;
quyết định ký ở `docs/adr/0006-…`.

Một chỗ spec Phase 9 nói không khớp số đo, ghi lại chứ không sửa dữ liệu: §2.2 viết KPI
`power_kw_per_urban_km2` trải "~163 (p04) → ~377". Mút trên đúng; mút dưới thật là
**p96 = 71,42**, p04 = 162,84.

### 10-QA-004 · bộ lọc nói hai giọng — ĐÓNG (bản vá vòng một SAI)
Vòng một chỉ đổi đường **bảng** sang chuỗi trễ; nhãn đếm và `handleExport` vẫn đọc ô gõ tức
thời. Trong 250 ms đó giao diện in số của bộ lọc CŨ như câu trả lời cho chuỗi VỪA GÕ, và
một cú bấm Xuất ghi ra một tập khác với bảng đang nhìn. Nay **một** `committedFilter` cho cả
ba đường ra; khi `filter !== committedFilter || loading` thì số đếm nói "đang lọc…" (không
in số nào) và 6 nút Xuất khoá. Đo trên Chrome: xem `witness-report.json` `at10_2`.

### 10-QA-005 · lifecycle LRU — ĐÓNG (bản vá vòng một SAI)
Một Map gộp cho cả "đang chạy" lẫn "đã xong" có hai lỗi: LRU đuổi được một promise **đang
bay** (không giải phóng gì, chỉ tốn thêm một truy vấn), và `catch` xoá theo **khoá** nên một
truy vấn cũ ngã sau khi bị thay sẽ bắn rụng promise mới hơn. Tách thành `data/request-cache
.ts` — hai sổ, nhánh ngã ngũ so identity — và vì module ấy không phụ thuộc gì, 8 ca của nó
test được thật bằng `node --test` thay vì bằng grep.

### 10-QA-003 · không có acceptance test — ĐÓNG
`web/test/phase10-release.test.ts` (18 ca) + `web/test/request-cache.test.ts` (8 ca) → web
test 832 → **858**. Witness Chrome `docs/qa/phase10/run_witness.py` **tự dựng server**, ghi
`witness-report.json` + 9 ảnh, tất cả vào Git.

### 10-QA-006 · lint 282 lỗi — ĐÓNG
Nguyên nhân gốc: `pyproject.toml` chỉ khai `line-length`, nên tập luật thực thi là **mặc
định của ruff 0.16 — 415 luật**, và nó đổi theo mỗi lần nâng công cụ. Nay tập luật và phạm
vi được khai (`E4·E9·F·I·RUF100`; `.ipynb` là sản phẩm dựng ra nên loại; notebook nguồn bỏ
E402/F821 vì `display` do IPython tiêm). 66 → **0**, và `make kiem` gọi `make lint` trước
mọi thứ khác. Bằng chứng đợt sửa không đổi hành vi: 735/735 pytest và **golden đúng 12 sai
khác cũ, không hơn một dòng**.

### Chốt cổng
`make kiem` = lint ✓ · schema ✓ · pytest 735 ✓ · web test 858 ✓ · golden 829/829 ✓.
Witness Phase 10: PASS. Witness Phase 9 (AT11–AT14): PASS, `at13.status=PASS` click canvas
thật vào Lào Cai.
