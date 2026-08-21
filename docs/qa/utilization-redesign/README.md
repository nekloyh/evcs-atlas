# QA độc lập — redesign lens Sử dụng

Ngày kiểm: 2026-08-21. Phạm vi: desktop; mobile được loại theo yêu cầu. Kết luận cuối:
**PASS sau sửa** — không còn finding Critical/Major mở, production build thành công, toàn bộ
web test và `make kiem` đều pass.

## Witness

Baseline lấy từ bộ witness Phase 4.1 trước redesign:

- [Temporal gradient cũ](../phase41/w1-utilization-gradient.png)
- [Spatial station points cũ](../phase41/w8-lens-utilization.png)

After production preview đo bằng CDP (xem chi tiết trong `witness-report.json`):

- Peak (1280×800, 1440×900, 1600×1000)
- Trough (1440×900)
- Missing-heavy (1440×900)
- Known zero + selected station (1440×900)
- Selected region (1440×900)
- Disabled occupancy package (1440×900)
- Story scene E (1440×900)

Máy đo đầy đủ: [witness-report.json](witness-report.json). Script tái lập:
[run_witness.py](run_witness.py).

## Findings và fixes

### Critical

Không có.

### Major

1. `web/src/components/atlas/AtlasReadColumn.tsx:202` — biểu đồ chính từng nằm sau cấu hình
   và legend. Ở viewport 1280×800 người đọc không thấy metric chính từ màn hình mặc định.
   Fix nhỏ nhất: đặt chart ngay trong khối Câu hỏi, trước chrome cấu hình; thêm readout cực
   trị trực tiếp tại `web/src/ui/UtilizationDayProfiles.tsx:128`.

2. `web/src/fields.ts:1378` — package có occupancy bị vô hiệu hóa từng canonicalize khỏi
   lens Sử dụng. Failure: Điện Biên rơi sang field khác nên không nói được lý do disabled,
   và người đọc có thể hiểu nhầm absence thành utilization thấp. Fix: giữ shell
   `station:occ` khả dụng để hiển thị lý do, nhưng vẫn gate data layer/scrubber. Regression:
   `web/test/availability.test.ts:109`, `web/test/utilization-model.test.ts:228`.

3. `web/src/ui/UtilizationDayProfiles.tsx:128` — step-line tuyệt đối đúng công thức nhưng
   biên độ 11–36,2% chỉ chiếm khoảng 6 px/hàng; peak/trough chưa rõ hơn baseline. Fix: tăng
   stroke, thêm nhãn cao nhất/thấp nhất và marker vuông/kim cương không phụ thuộc hue; trục
   vẫn cố định 0–100%. Logic cực trị ở `web/src/viz/utilization-chart.ts:61`, test zero/null
   ở `web/test/utilization-surface.test.ts:83`.

### Minor

1. `web/src/ui/Badge.tsx:13` — glyph cảnh báo dùng màu `warn` chỉ đạt 1,74:1 trên nền.
   Fix: dùng `text-ink-2`; CDP after không còn text run nào dưới 4,5:1.

2. `web/src/components/atlas/AtlasReadColumn.tsx:190` — nút bật/tắt paint 20×20 px.
   Fix an toàn: tăng lên 24×24 px. Các ô giờ rộng khoảng 11 px là 24 cột bắt buộc trong
   chart 296 px; chúng dùng roving tabindex và bàn phím, không phải touch target (mobile
   ngoài phạm vi).

## Data-validation table

Đối chiếu trực tiếp Parquet ship bằng [validate_data.py](validate_data.py); output máy đọc:
[data-validation.json](data-validation.json).

| Gói | IN stations | Known ports | Missing-port stations | Eligible station-hours | Peak | Trough | Missing-heavy coverage | Gate |
|---|---:|---:|---:|---:|---|---|---|---|
| 01 Hà Nội | 710 | 7.785 | 19 | 112.843 | t167 · 36,18% | t51 · 11,01% | t75 · 6.342/7.785 = 81,46% | usable |
| 68 Lâm Đồng | 237 | 2.358 | 1 | 36.048 | t159 · 13,89% | t27 · 2,28% | t99 · 957/2.358 = 40,59% | usable |
| 11 Điện Biên | 39 | 209 | 1 | 2.397 raw diagnostic | t108 · 50% raw | t31 · 0% raw | 0/209 ở t0 | **disabled; không render** |

Đã xác minh bằng fixture + dữ liệu thật:

- station-hour đi qua cùng eligibility của `stationOccAt()`/`eligibleStationHour`;
  `observed_h >= 1`, IN-only, finite `occ`, `n_ports > 0`;
- missing ports không vào utilization denominator; chúng vẫn được phản ánh trong station
  coverage denominator; coverage cổng là observed installed ports / installed known ports;
- aggregate tuần và H3 r6/r7/r8 là `Σocc / Σn_ports` (ratio-of-sums), không average %;
- known zero `vn-c-hno0001`, t51 hiển thị 0%; null dùng vân và không tạo đường ở đáy;
- tổng tử/mẫu, station count và installed ports được bảo toàn qua LOD; thứ tự bin tất định;
- thang màu và trục chart cố định `[0,1]`, không nhận `t`; không có bậc 40%; không có
  overload/capacity claim;
- cả ba manifest thật đều thiếu `occupancy_hour_tz`, nên UI chỉ gọi “ô giờ” và công bố
  “múi giờ chưa được công bố”, không bịa nhãn đồng hồ.

`buffer_profile_rows_excluded = 0` trong ba package đang ship vì profile không chứa dòng
BUFFER khớp; fixture regression riêng chứng minh BUFFER bị loại khỏi tử, mẫu và coverage.

## Acceptance matrix

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| Metric hiểu được từ default | PASS | title nói “tỉ lệ cổng bận”; extrema, trục 0–100%, công thức, coverage và disclaimer đều hiện trong fold |
| Peak/trough và so ngày | PASS | readout trực tiếp + 7 step profiles + marker hình học; chart không autoscale |
| Chart/map/scrubber sync | PASS | keyboard t51→t52 đổi hash và accessible value; encoding lệch x=0 px, y=-0,01 px |
| Spatial overview | PASS | H3 region mặc định, ratio-of-sums; không density heatmap; r6/r7/r8 chỉ đổi đơn vị gộp |
| Region context | PASS | inspector witness: 5,9/92 cổng, 11/11 trạm, coverage cổng/trạm và danh sách contributor |
| Missing ≠ zero | PASS | known-zero station 0% + hollow selected ring; missing regions/stations dùng hatch/hollow |
| Disabled package | PASS | lý do manifest hiện rõ; không có utilization fill/scale/region control |
| Tooltip/legend/inspector | PASS | cùng utilization ratio, x/y ports, n stations, coverage, unknown-timezone disclosure |
| Keyboard/AT | PASS | 168 named hour cells, roving tabindex, arrow navigation, `aria-pressed`, focus-visible |
| Contrast/motion | PASS | 0 text run dưới 4,5:1; no animation/blink; selection/null không dựa riêng hue |
| Story/hash/selection/national/simulation | PASS | story witness + regression/full suite pass |
| Mobile | N/A | loại khỏi phạm vi theo yêu cầu |

Ở 1280×800 chỉ phần đầu của bảy hàng nằm trong vùng cuộn của cột đọc, nhưng câu trả lời
peak/trough và metric chính vẫn thấy ngay; toàn bộ chart xem bằng cuộn cột. 1440×900 và
1600×1000 hiển thị đủ bảy hàng. Đây là giới hạn desktop-height còn lại, không phải mobile.

## Performance, query và bundle

- Scrub 168 bước thật: 168 giá trị `t` riêng biệt, `resourceDelta = 0`, long task = 0,
  synchronous commit p50/p95 = 0,2/0,3 ms.
- Frame p95 = 103,9 ms trên headless SwiftShader là software rendering, được ghi lại nhưng
  không so với budget GPU. Cổng code/store→React/deck là commit p95 0,3 ms.
- Unit lifecycle chứng minh temporal model, region index và inspector vùng dùng RAM, không
  gọi DuckDB; index/model không có `t` trong dependency.
- Final App chunk: 782,85 kB raw / 246,76 kB gzip. So với build đầu phiên trước các fix
  (781,46 / 246,41 kB): +1,39 kB raw / +0,35 kB gzip; không bất thường.

## Accessibility checks

- Text contrast: CDP computed-style scan ở mọi state/viewport, 0 failure dưới 4,5:1.
- Graphic channels: value = vertical position/fixed fill scale; selected = guide + square;
  peak/trough = square/diamond; missing = hatch/hollow; low coverage = dashed outline.
- Accessible value/name gồm ngày, ô giờ, utilization hoặc “chưa đủ quan sát”, numerator,
  denominator, port coverage và số trạm.
- Arrow Left/Right đổi giờ, Up/Down đổi ngày; Home/End; Tab không bị chặn. Focus-visible
  outline có mặt. Không transition, blink, pulse hoặc strobe; reduced-motion không cần nhánh.
- Mobile/touch không kiểm theo thay đổi phạm vi.

## Commands/results

| Command | Result |
|---|---|
| occupancy/chart/render/query/story test hẹp | PASS · 10/10 files |
| `npm run typecheck` | PASS |
| `npm run build` | PASS · Vite 4.173 modules |
| `npm test` | PASS · 69/69 files |
| `make kiem` | PASS · Ruff, schema, 769 pytest, 982 web tests, 829 golden tables |
| `git diff --check` | PASS |
| production CDP witness | PASS · `failures: []` |

Lần `make kiem` đầu trong sandbox bị uv cache lock `EROFS`; chạy lại ngoài sandbox pass.
Không tạo commit.

## Chưa kiểm được / bất định

- Không có timezone authoritative trong manifest; không suy luận `Asia/Ho_Chi_Minh` dù
  môi trường máy đang ở múi giờ đó.
- Không có congestion/overload threshold được domain-owner phê duyệt; UI chỉ nói utilization
  cao/thấp tương đối và luôn phủ định việc màu đậm tự đồng nghĩa quá tải.
- Không có GPU trace phần cứng trong môi trường CDP; frame timing SwiftShader không dùng để
  kết luận. Commit timing, query lifecycle, resource count và long-task count đã kiểm.
- Loading được quan sát trong quá trình cold load và tự resolve; error UI không được ép bằng
  fault injection vì không có fixture production an toàn. Disabled-state đã kiểm đầy đủ.
