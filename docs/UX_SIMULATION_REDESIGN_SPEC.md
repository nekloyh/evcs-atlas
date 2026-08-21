# UX redesign spec — Mô phỏng trạm giả định

Status: **IMPLEMENTATION-READY SPEC**  
Ngày audit: **21/08/2026**  
Phạm vi dữ liệu quan sát: `web/public/data/p/01/`  
Phạm vi thay đổi sau này: web UI/view-model; **không đổi thuật toán mô phỏng**  
Ngoài phạm vi phiên này: sửa code sản phẩm, implement UI, commit

---

## 0. Executive decision

Thiết kế hiện tại không nên được chỉnh bằng vài nhãn hoặc một lượt đổi màu. Cần thay toàn bộ
thứ tự đọc của panel theo hướng **outcome-first**:

1. gọi tên vị trí bằng xã/phường/đặc khu;
2. nói ngay quy mô cải thiện rõ rệt và phần còn trong biên sai số;
3. diễn giải kết quả L6 thành một phép kiểm khoảng cách, không dùng badge `ĐỀ XUẤT` độc lập;
4. thay ba KPI + bảng Trước/Sau bằng hai dải phân bố cùng thang và một câu định nghĩa trung vị;
5. thay danh sách năm mã H3 bằng nhóm địa danh có liên kết với bản đồ;
6. đưa trạm lân cận, calibration, mã H3, toạ độ và provenance chi tiết vào disclosure;
7. kết thúc bằng checklist bằng chứng người dùng phải kiểm tra tiếp.

Không thay phương trình, bán kính 5 km, cách phân lớp `IMPROVES` / `UNCERTAIN`, ngưỡng L6,
tập trạm đủ điều kiện, quy ước null hoặc cách tổng hợp After. Mọi thay đổi dữ liệu trong spec
này chỉ **đưa thêm dữ liệu đã có vào view-model**, không thêm nguồn và không đổi pipeline.

Quyết định bề mặt: panel mô phỏng phải dùng đúng contract của thẻ BẰNG CHỨNG — 320 px,
340 px từ 1440, tối đa 60% chiều cao vùng bản đồ — thay vì biến thể riêng 340/380 px và 75%.

---

## 1. Phạm vi audit và nguồn sự thật

Đã đọc và đối chiếu:

- `README.md`, `HAN_CHE.md`, `CONTEXT.md`, `DECISIONS.md` §6, §16, §19, §20, §22, §26;
- `docs/COT.md` cho `grid_h3_r8`, `commune`, `stations`, `station_occupancy`;
- `web/DESIGN.md`, đặc biệt §0, §3h, §4e, §7, §8, §9, §10, §11, §12;
- `docs/PHASE6_LOCAL_SIMULATION.md`, `docs/PHASE3_INSPECTOR.md`,
  `docs/PHASE10_PERFORMANCE_RELEASE.md`;
- implementation từ `SimulationPanel` qua simulation controller/engine/query, `EvidenceCard`,
  `AtlasSurface`, `MapView`, hash và NavRail;
- `web/test/simulation.test.ts`, `web/test/inspector-phase3.test.ts`,
  `web/test/phase10-release.test.ts` và witness Phase 10.

Thứ tự ưu tiên khi có xung đột:

1. `HAN_CHE.md`, schema/COT và thuật toán đang phát hành;
2. quyết định nghiệp vụ L6 trong `DECISIONS.md` và `core/screening.py`;
3. spec Phase 6 cho phép tính mô phỏng;
4. spec này cho hierarchy, copy, interaction và presentation;
5. implementation hiện tại là baseline, không phải nguồn chuẩn cho UX mới.

Production build được dựng bằng `npm run build`, sau đó chạy `vite preview` ở cổng 4173.
Ba ảnh baseline dùng Chrome 151, DPR 1. Không dùng lần chạy headless này để báo FPS; số hiệu
năng phát hành lấy từ Phase 10.

Theo chỉ dẫn mới trong phiên, **không dựng hoặc chụp baseline mobile**. Mobile wireframe và
contract bên dưới vẫn được chốt để implementer không phải tự suy; trạng thái đó chưa được
xác minh bằng render trong audit này.

---

## 2. Confirmed facts, inferences và decisions

### 2.1 Confirmed facts

| ID | Sự thật đã xác nhận | Bằng chứng |
|---|---|---|
| F01 | Mô phỏng là heuristic hình học trong 5 km, không chạy routing mới. | Phase 6 §0, §1.3–§1.5; `estimator.ts` |
| F02 | Before đọc `dist_station_network_m`; After chỉ thay khoảng cách ở ô `IMPROVES`; ô `UNCERTAIN` giữ Before trong headline. | Phase 6 §1.8; `engine.ts:219-241` |
| F03 | `IMPROVES` dùng cận trên: `dHatUpper < dOld`; `UNCERTAIN` là `dHat < dOld <= dHatUpper`. | `estimator.ts:142-151` |
| F04 | Rule L6 dùng khoảng cách chim bay tới trạm đủ điều kiện, ngưỡng Phường/Đặc khu 500 m, Xã 2.000 m; dấu `>` là chặt. | `core/screening.py`; `simulation/screening.ts` |
| F05 | Ngoại lệ chỉ áp dụng cho Xã: trên sàn 500 m, trạm gần nhất có phép đo đủ điều kiện và `util >= 0,40`, vị trí mới phải có DC. | `DECISIONS.md` §16; Phase 6 §1.9 |
| F06 | Quyết định L6 là đầu ra rule, không phải số đo và không phải quyết định đầu tư. | `CONTEXT.md`; `COT.md`; `core/screening.py` |
| F07 | `grid_h3_r8` đã phát `commune_code` và `commune_name`; `commune.geojson` đã phát tên, loại và hình học. | `docs/COT.md`; dữ liệu p/01 |
| F08 | p/01 có `commune_code` và `commune_name` trên đủ 4.400/4.400 ô; 126/126 feature commune có code, name và kind. | phép đọc Parquet/GeoJSON trong audit |
| F09 | Có thể gọi tên vị trí và nhóm ô theo xã/phường mà không đổi pipeline. | F07–F08; chỉ cần mở rộng query/view-model |
| F10 | Panel hiện dùng 18 class `slate-*`, cộng emerald/amber/rose/cyan và nhiều nền tối bán trong suốt. | `SimulationPanel.tsx`; DOM baseline |
| F11 | Vỏ `AtlasSurface` là nền sáng; việc lồng palette tối bán trong suốt tạo tương phản rất thấp. | `AtlasSurface.tsx`; số đo baseline |
| F12 | Panel mô phỏng dùng 340/380 px và `max-h-[75%]`; Evidence thường dùng 320/340 px và `max-h-[60%]`. | `EvidenceCard.tsx:200-208,275-281` |
| F13 | `font-mono` hiện áp cho provenance, khoảng cách và delta, không chỉ machine ID. | `SimulationPanel.tsx`; DOM baseline |
| F14 | Danh sách vùng hiện chỉ in H3; output cell chưa mang `commune_name` hay `population`. | `SimulationPanel.tsx:341-374`; `types.ts` |
| F15 | Trạm lân cận là một khối mở mặc định và có thể dài; baseline có 13 trạm. | DOM baseline sample |
| F16 | Nút phương pháp không có `aria-expanded`/`aria-controls`; panel chỉ có một heading `h3`. | DOM baseline report |
| F17 | Test simulation phủ tốt phép tính, rule, null, hash và provenance type; chưa có witness trình duyệt riêng cho panel. | `web/test/simulation.test.ts`; `docs/qa/` |
| F18 | Test locale Phase 10 không quét `SimulationPanel`; baseline render có `483.5 kW`. | `phase10-release.test.ts:234-252`; ảnh baseline |
| F19 | Khi candidate đổi qua hash, controller có guard bỏ kết quả request cũ nhưng không xoá/hide `result` cũ trước request mới. | `store.ts:48-65`; `use-simulation.ts:65-155` |
| F20 | Phase 10 ghi nhận click → phán quyết L6 là 418 ms, 0 long task; ngưỡng phát hành là <= 1 s. | `docs/qa/phase10/baseline.md`; Phase 10 §3 |
| F21 | Khi lớp utilization của tỉnh không dùng được, engine ép `nearestHighLoad=false`, vẫn trả kết quả rule hiện hành; UI phải nói nhánh ngoại lệ cao tải không đánh giá được. | Phase 6 F6; `simulation.test.ts:709-736` |

### 2.2 Inferences

Các mục sau là suy luận UX từ facts và render, không phải fact dữ liệu:

- Badge xanh `ĐỀ XUẤT` đứng riêng dễ bị đọc thành một chỉ dẫn hành động, trong khi code chỉ
  replay một rule khoảng cách.
- `Sàng lọc L6` không tự giải thích được câu hỏi, đầu vào hay ngưỡng cho người không biết tên
  nội bộ L6.
- Ba ô Before/After/Thay đổi và bảng bốn dải lặp cùng dữ liệu nhưng không nêu insight chính;
  người đọc phải tự biến bảng thành câu.
- “Trung vị cự ly theo dân số” không có định nghĩa nên dễ bị hiểu thành trung bình hoặc cự ly
  của một người đại diện.
- “5 ô xa trạm nhất có cải thiện” được xếp theo Before, không theo quy mô dân hay mức thay đổi;
  danh sách đó không tạo ra một hành động kiểm tra rõ ràng.
- H3, provenance tag và số calibration lặp lại tạo hierarchy kỹ thuật mạnh hơn hierarchy
  quyết định.
- Map outline có ích để định vị, nhưng thiếu liên kết hai chiều với địa danh trong panel.

### 2.3 Decisions

- Chọn hierarchy ở §8; không giữ layout bảng/KPI hiện tại.
- Gọi tên rule là **“Sàng lọc khoảng cách”**; `Quy tắc L6` là nhãn phụ.
- Không render chuỗi `ĐỀ XUẤT` hoặc `ĐỀ XUẤT NẾU CÓ DC` trong UI mới; enum nội bộ giữ nguyên.
- Khi utilization layer không dùng được, giữ kết quả rule hiện hành và thêm caveat F6; không
  tạo một phán quyết khác ở presentation layer.
- Giữ median làm supporting evidence, nhưng luôn dịch thành câu “50% dân số…”.
- Dùng hai stacked distribution bands có cùng mẫu số và cùng bốn ngưỡng; bảng số đầy đủ nằm
  trong disclosure/accessibility fallback.
- Bỏ danh sách “5 ô xa nhất”. Thay bằng nhóm commune có map focus; thiếu tên đáng tin cậy thì
  không dựng danh sách thay thế bằng ID tự đặt.
- Trạm lân cận, method, calibration, snapshot, H3 và toạ độ đều là secondary/disclosure.
- Thêm khối “Cần kiểm tra tiếp” vì đó là đầu ra hành động mà dữ liệu hiện tại còn thiếu.
- Không thêm dependency và không thêm màu mới.

---

## 3. Baseline production

### 3.1 Kịch bản tái hiện

Dataset: p/01, manifest `exported_utc = 2026-08-21T03:27:52+00:00`.  
Deep link:

```text
#tinh=01&f=population&m=2d&sim=21.05239,105.61395
```

Vị trí nằm tại `Xã Tây Phương`. Kết quả UI hiện tại:

- rule enum `DE_XUAT`, kind `XA`, margin `+1.125 m` so với ngưỡng 2 km;
- Before median 1,7 km; After ~1,4 km; delta ~−337 m;
- 12 ô, ~31.746 người thuộc `IMPROVES`;
- thêm 6 ô, ~2.947 người thuộc `UNCERTAIN`;
- 13 trạm đủ điều kiện trong 5 km;
- không có dòng NO_BASELINE/EXCLUDED trong sample này.

Các số trên là **kết quả của đúng snapshot và toạ độ baseline**, không phải hằng UI và không
được chép vào code/test fixture như con số của Hà Nội nói chung.

### 3.2 Ảnh và số đo

| Viewport | Screenshot | Panel render | Nội dung/scroller | Quan sát |
|---|---|---:|---:|---|
| 1280×800 | [baseline-1280x800.png](ux/simulation-baseline/baseline-1280x800.png) | 340×600 | 1.425/598 px | outcome theo người nằm dưới fold; title gần như biến mất |
| 1440×900 | [baseline-1440x900.png](ux/simulation-baseline/baseline-1440x900.png) | 380×675 | 1.286/673 px | rộng hơn Evidence contract; bảng dày đặc |
| 1600×1000 | [baseline-1600x1000.png](ux/simulation-baseline/baseline-1600x1000.png) | 380×750 | 1.286/748 px | vẫn che 75% chiều cao; secondary content chưa thấy |

DOM/report máy đọc: [baseline-report.json](ux/simulation-baseline/baseline-report.json).

Không có document-level horizontal scroll ở ba viewport. Scroller cũng có
`scrollWidth == clientWidth`; lỗi chính là hierarchy, clipping/truncation nội dung dài và
chiều cuộn, không phải body overflow.

### 3.3 Vấn đề quan sát được

#### Critical — contrast và theme mismatch

Phép tính contrast dùng computed CSS color đã composite qua các ancestor background:

| Nội dung | Contrast xấp xỉ | Yêu cầu |
|---|---:|---:|
| title panel trên AtlasSurface sáng | 1,03:1 | >= 4,5:1 |
| qualifier “Đầu ra của một RULE…” | 1,14:1 | >= 4,5:1 |
| nhãn `Sàng lọc L6`, median, table header | 1,60:1 | >= 4,5:1 |
| disclaimer text | 1,76:1 | >= 4,5:1 |

Nguyên nhân trực tiếp: `text-slate-*` sáng và `bg-slate-*/60` được composite lên panel sáng.
Đây là lỗi đọc được, không chỉ là khác khẩu vị.

#### Major — outcome bị chôn

Ở 1280×800, fold 598 px dừng giữa bảng phân bố. Dòng trả lời “bao nhiêu người/ô cải thiện”
nằm sau median và bảng, dù đó là job chính. Người dùng phải cuộn mới biết quy mô outcome.

#### Major — rule có hình thức của phán quyết cuối

Badge xanh `ĐỀ XUẤT`, chữ hoa và vị trí cao tạo tín hiệu quyết định mạnh; điều kiện thật chỉ
được diễn tả bằng margin và mã `(XA)`. UI không in khoảng cách tới trạm gần nhất hay ngưỡng
2 km thành hai số so được.

#### Major — Before/After không trả lời “khác ở đâu”

Ba tile và bảng bốn hàng buộc người dùng tự tính sự dịch chuyển giữa dải. Provenance lặp ở
mọi header chiếm độ nổi tương đương dữ liệu. Median không được giải nghĩa.

#### Major — danh sách vùng không có địa danh hay hành động

Năm hàng chỉ có H3 và cự ly. Không hàng nào focus bản đồ, gọi tên xã/phường hoặc cho biết quy
mô dân. Tiêu chí sắp xếp “Before xa nhất” cũng không được giải thích thành một việc tiếp theo.

#### Major — surface contract trôi

Panel rộng hơn 20–40 px và cao hơn 15 điểm phần trăm so với Evidence card. Điều này vừa che
bản đồ nhiều hơn vừa tạo một panel có nhịp riêng.

#### Minor — typography, semantics và locale

- chỉ có một `h3`; section label là `span`;
- `font-mono` dùng cho provenance và số đo;
- dùng `text-sm`, `text-xs`, `text-base`, `text-[10px]`, `text-[11px]` thay token vai trò;
- nút disclosure thiếu `aria-expanded`/`aria-controls`;
- hai button không có accessible name riêng ngoài text;
- `483.5 kW` không theo locale vi-VN;
- title dẫn bằng toạ độ thay vì địa danh.

---

## 4. Inventory UI hiện tại

| Khối | Câu hỏi đang trả lời | Field/phép tính | Provenance | Hỗ trợ quyết định? | Tên phổ thông? | Quyết định IA | Vi phạm chính |
|---|---|---|---|---|---|---|---|
| Nav trigger `Trạm giả định` | Bắt đầu thao tác nào? | `calibration.valid`, `placementMode`, `candidate` | UI state | Có | Khá rõ, tooltip dài | Primary entry | trạng thái active dùng màu riêng ngoài token |
| Header + toạ độ | Đang xem gì/ở đâu? | `result.candidate.lat/lng` | Tính toán hình học | Một phần | Toạ độ khó đọc | Primary title + locality; toạ độ secondary | title contrast 1,03; title quá kỹ thuật |
| Disclaimer banner | Phép tính không làm gì? | static copy + `rMaxM` | Phương pháp | Có, nhưng quá nổi | Tương đối | Giữ một scope line ngắn; bản đầy đủ xuống limits | palette xanh tối, contrast 1,76 |
| `Sàng lọc L6` | Rule trả gì? | `decision`, `marginM`, `kind`, `highLoadEvaluable`; haversine + thresholds | Rule | Có | Không | Primary, đổi copy/structure | badge dễ đọc sai; thiếu distance/threshold |
| Median 3 tile | Cự ly điển hình đổi bao nhiêu? | population-weighted median Before/After | Before tính toán; After ước lượng | Secondary | Không nếu không định nghĩa | Secondary trong Before/After | lặp provenance, mono, dark cards |
| Bảng bốn dải | Dân số chuyển giữa dải nào? | `before/after.popByBand`; fixed thresholds | Before tính toán; After ước lượng | Có | Có nếu trực quan hoá | Primary visualization | bảng dày; delta buộc tự diễn giải |
| Dòng `IMPROVES` | Bao nhiêu ô/người cải thiện rõ rệt? | conservative class + population sum | Ước lượng | Rất cao | “cận trên p90” không phổ thông | Hero outcome; bỏ p90 khỏi câu chính | đang dưới fold; technical criterion trong label |
| Dòng `UNCERTAIN` | Phần nào trong sai số? | uncertain class + population sum | Ước lượng | Rất cao | Khá rõ | Hero outcome line 2 | bố cục hai đầu khó đọc |
| NO_BASELINE | Phần nào không có nền so sánh? | `dOld=null`, grade NO_PATH | Không kết luận | Cao khi có | Copy rõ | Warning ngay sau outcome khi >0 | đúng nghĩa nhưng đang chung khối nhỏ |
| EXCLUDED | Phần nào không mô phỏng được? | NO_ROAD_ACCESS | Không kết luận | Cao khi có | Copy rõ | Warning ngay sau outcome khi >0 | đúng nghĩa nhưng đang chung khối nhỏ |
| Zone truncated | Có thiếu tỉnh kề? | circle vs boundary geometry | Tính toán phạm vi | Cao khi có | Copy rõ | Warning ngay sau outcome | đúng hướng, cần giữ |
| `5 ô xa...` | Ô Before xa nhất nào được cải thiện? | filter IMPROVES, sort `dOld` desc, top 5 | Ước lượng | Thấp | Không | Loại; thay group locality | H3-only, không action, mono nặng |
| Nearby stations | Trạm hiện có nào gần đây? | eligible station set, euclid <=5 km, asset + occupancy | Tính toán + telemetry | Evidence phụ | Tên trạm rõ | Collapsed secondary; nearest rule station được nhắc trong rule | 13+ row mở sẵn; chiếm chiều cao |
| Method/calibration | Tính thế nào, tin tới đâu? | validation, snapshot, pop source count | Technical provenance | Có khi audit | Khó với người phổ thông | Progressive disclosure | trigger thiếu state semantics; content quá sâu |
| Map candidate/circle/cell outlines | Vùng và ô nào liên quan? | candidate; circle; `IMPROVES`/`UNCERTAIN` | Tính toán/ước lượng | Có | Không có legend chữ | Primary spatial evidence, linked với locality | không link panel ↔ map; nét đứt/liền không giải thích |
| Loading | Đang làm gì? | `result=null` | lifecycle | Có | Khá rõ | Stable skeleton + status | panel chưa có header/focus; dấu ba chấm ASCII |
| Error | Vì sao không có kết quả? | F1/F3/F10 string | lifecycle | Có | Khá rõ | Error state trong cùng shell | dùng dark palette; “Đóng” không nói hậu quả |

---

## 5. User jobs

Theo đúng thứ tự người dùng cần hoàn thành:

1. Xác định vị trí giả định đang nằm ở xã/phường nào và phạm vi nào được tính.
2. Biết vị trí có qua bước sàng lọc khoảng cách hay không, dựa trên khoảng cách nào, ngưỡng
   nào và điều kiện ngoại lệ nào.
3. Biết quy mô ước lượng cải thiện rõ rệt theo người và ô.
4. Tách phần cải thiện rõ khỏi phần còn trong biên sai số và phần không thể ước lượng.
5. So sánh phân bố cự ly Before/After bằng cùng ngưỡng.
6. Xác định các xã/phường liên quan trên bản đồ, không phải đọc mã máy.
7. Hiểu kết quả không chứng minh được điều gì.
8. Biết bằng chứng thực địa/nguồn dữ liệu nào phải kiểm tra tiếp.
9. Chia sẻ/reload đúng cùng candidate bằng hash mà không lẫn kết quả cũ.

---

## 6. Non-goals và claim bị cấm

### 6.1 Non-goals

- Không đổi estimator, calibration, bán kính 5 km, band, percentile hoặc class boundary.
- Không chạy routing client/server cho candidate.
- Không thêm nhiều candidate, portfolio, score hay xếp hạng vị trí.
- Không thêm input số cổng, công suất hoặc cấu hình trạm giả định.
- Không ghi kết quả vào field registry, lens, export hoặc dataset.
- Không thêm reverse geocoder, nguồn địa danh mới hay dependency.
- Không biến UI redesign thành thay đổi screening policy.

### 6.2 Claim dữ liệu không hỗ trợ

UI không được khẳng định hoặc hàm ý:

- tuyến lái thật hoặc thời gian lái tới candidate;
- nhu cầu xe điện, mức sử dụng hoặc doanh thu tương lai của candidate;
- candidate làm **giảm tải** một trạm hiện hữu;
- vị trí là **tối ưu**;
- kết quả rule là **đề xuất đầu tư**;
- khả năng đấu nối điện, pháp lý đất, chỗ đỗ, PCCC, lối vào hoặc khả năng xây dựng;
- đã xét các trạm đang xây/được cấp phép;
- phần trăm coverage dựng từ khoảng cách chim bay.

Các từ khóa trên chỉ được xuất hiện trong khối giải thích claim bị cấm hoặc non-goal; không
được xuất hiện trong outcome, CTA, badge hoặc map label.

---

## 7. Data and claim contract

### 7.1 Bốn loại claim trình bày

| Nhãn UI | Dùng cho | Không dùng cho | Cách hiển thị |
|---|---|---|---|
| `TÍNH TOÁN` | Before aggregates; candidate-to-station euclid; zone membership | rule decision; After | một tag nhỏ ở cấp section, không lặp ở từng cột |
| `ƯỚC LƯỢNG` | After, delta, class, người/ô thuộc `IMPROVES` hoặc `UNCERTAIN`, locality aggregates | Before | một tag ở outcome và Before/After; số khoảng cách/dân số ước lượng có tiền tố `~` |
| `QUY TẮC` | trạng thái L6 và margin/condition khi trình bày như một rule | population/distance distribution | tag nhỏ cạnh “Quy tắc L6”; không dùng từ `RULE` trên UI |
| `ĐO TRONG 30 NGÀY` | `util` của trạm hiện hữu kèm window/grade/reportability | candidate | chỉ ở header của evidence trạm; không thành badge toàn panel |

Locality, station name, asset và snapshot là **dữ liệu nguồn**, dùng câu nhãn rõ thay vì thêm
một hàng badge nữa.

`TÍNH TOÁN` không có nghĩa là quan sát trực tiếp: Before distance là Dijkstra trên OSM và
`population` là bề mặt dasymetric đã neo. Disclosure phải nói rõ nền dân số này.

### 7.2 Hợp đồng từng claim

| Claim UI | Input/phép tính | Class | Điều kiện render |
|---|---|---|---|
| `Xã/Phường/Đặc khu {name}` | commune feature chứa P; fallback commune của candidate cell | dữ liệu nguồn | name không null/non-empty |
| “~P người trong C ô cải thiện rõ rệt” | sum `population`, count cells where `cls=IMPROVES` | ước lượng | luôn render success; zero có copy riêng |
| “~P người trong C ô còn trong biên sai số” | `cls=UNCERTAIN` | ước lượng | render khi C>0; copy zero ở state no-impact |
| Before band/median | published `dist_station_network_m` + `population` | tính toán | chỉ cells có baseline và weight dương |
| After band/median | substitute `dAfter` only for IMPROVES; uncertain keeps dOld | ước lượng | cùng included set với Before |
| Rule status | `d_rule`, kind, nearest high-load evidence, fixed thresholds | rule | closed table §12 |
| Rule margin | `d_rule - threshold(kind)` | rule context | finite distance + known kind |
| Locality rows | group result cells by commune code/name | ước lượng | ít nhất một group có name đáng tin cậy |
| Nearby stations | eligible set S, euclid <=5 km, sorted distance | calculated/source | disclosure; empty copy if zero |
| NO_BASELINE | `dOld=null`, grade NO_PATH | không kết luận | count>0; never included in Before/After |
| EXCLUDED | `dOld=null`, grade NO_ROAD_ACCESS | không kết luận | count>0; never included in Before/After |
| zone clipped | `zoneTruncatedAt(...)` | calculated limitation | true only |
| flagged population | `pop_source != anchored` count | provenance limitation | count>0 |

### 7.3 Thuật toán và aggregation bất biến

Giữ nguyên, có property test:

```text
Z = cells có haversine(centroid, P) <= 5.000 m

IMPROVES  <=> dHatUpper < dOld
UNCERTAIN <=> dHat < dOld <= dHatUpper
UNCHANGED <=> dHat >= dOld

After headline distance = dAfter chỉ khi IMPROVES; mọi class khác giữ dOld.
```

- Không biến `null` thành 0.
- Không cho estimator điền NO_BASELINE.
- Không gộp UNCERTAIN vào headline improved.
- Không thay ngưỡng bốn band `<=1 km`, `1–2 km`, `2–5 km`, `>5 km`.
- Không đổi `population` sang `population_wp`.
- Không cộng ô ngoài package hoặc ngoài 5 km.

### 7.4 View-model additions, không đổi pipeline

Mở rộng output ở web layer:

```ts
interface CandidateContext {
  communeCode: string | null;
  communeName: string | null;
  provinceName: string | null;
}

interface ScreeningEvidence {
  distanceM: number | null;
  thresholdM: number | null;
  marginM: number | null;
  kind: CommuneKind | null;
  nearestStationCode: string | null;
  nearestStationName: string | null;
  nearestUtil: number | null;
  nearestUtilReportable: boolean;
  nearestGrade: string | null;
  nearestHighLoad: boolean;
  highLoadEvaluable: boolean;
  exceptionFloorM: 500;
  highLoadThreshold: 0.40;
}

interface SimulationAreaSummary {
  communeCode: string;
  communeName: string;
  improved: { cells: number; population: number };
  uncertain: { cells: number; population: number };
  h3s: string[]; // map focus only; never primary copy
}
```

Nguồn:

- thêm `commune_name` vào query `grid_h3_r8` hiện tại;
- trả code/name từ commune resolver hiện tại;
- lấy province name từ manifest đã nạp;
- giữ population/code/name trong một pass engine đang chạy;
- giữ nearest station/occupancy mà engine đã tìm để replay rule.

Không thêm query, file public hoặc pipeline step.

### 7.5 Locality trust rule

`commune_name` được dùng khi:

1. không null/rỗng;
2. đi cùng `commune_code` hợp lệ;
3. code/name của grid không mâu thuẫn với feature commune cùng code.

Nếu một số cell thiếu tên, chúng vẫn ở aggregate toàn vùng nhưng không được đưa vào locality
list; disclosure nói số ô thiếu tên. Nếu tất cả group thiếu tên, bỏ hẳn section locality.
Không tạo nhãn “Vùng 1”, không reverse-geocode và không hiện H3 thay thế ở cấp primary.

---

## 8. Information architecture

### 8.1 Thứ tự binding

1. **Header** — tên feature; locality; scope line; nút xóa.
2. **Outcome** — câu người/ô rõ rệt + câu uncertainty; tag `ƯỚC LƯỢNG` một lần.
3. **Khoảng chưa kết luận** — chỉ khi NO_BASELINE, EXCLUDED, clipped hoặc pop-source warning.
4. **Sàng lọc khoảng cách** — natural-language status + distance, threshold, margin/exception.
5. **Before/After** — two-row distribution + median plain-language.
6. **Khu vực liên quan** — grouped locality, map-linked; chỉ khi có name tin cậy.
7. **Cần kiểm tra tiếp** — checklist evidence ngoài dataset.
8. **Evidence phụ** — trạm hiện hữu collapsed.
9. **Phương pháp, provenance và giới hạn** — collapsed.
10. **Chi tiết vị trí** — coordinates, H3, calibration version, snapshot; collapsed cuối.

### 8.2 Primary/secondary/removal

| Primary | Secondary/disclosure | Loại khỏi UI mặc định |
|---|---|---|
| outcome theo người/ô | median | badge enum `ĐỀ XUẤT` |
| uncertainty riêng | trạm lân cận | bảng provenance lặp ở từng cột |
| rule bằng điều kiện | calibration stats | danh sách top-5 H3 |
| distribution Before/After | H3/toạ độ | 3 KPI Before/Sau/Delta |
| locality map link | port/power của trạm context | cụm technical tags ở header |
| next evidence | source/snapshot | p90 trong copy outcome |

### 8.3 Above-the-fold contract

Ở 1280×800, với Evidence max-height 480 px, các phần sau phải nhìn thấy mà không cuộn:

- header/locality/scope;
- toàn bộ outcome hai câu;
- mọi warning “chưa kết luận” đang active;
- natural-language screening status và ba số distance/threshold/margin.

Before/After có thể bắt đầu ở cuối fold; outcome không được nằm dưới visualization.

---

## 9. ASCII wireframes

### 9.1 Desktop — 320/340 px, max 60% map height

```text
┌──────────────────────────────────────┐
│ MÔ PHỎNG TRẠM GIẢ ĐỊNH           [×]│
│ Xã Tây Phương · Thành phố Hà Nội    │
│ Ước lượng hình học trong 5 km;       │
│ không phải định tuyến.               │
├──────────────────────────────────────┤
│ ƯỚC LƯỢNG                            │
│ ~31.746 người trong 12 ô được rút    │
│ ngắn cự ly rõ rệt.                   │
│ ~2.947 người trong 6 ô khác có thể   │
│ cải thiện, nhưng còn trong sai số.   │
├──────────────────────────────────────┤
│ SÀNG LỌC KHOẢNG CÁCH · QUY TẮC L6   │
│ Qua bước sàng lọc khoảng cách.       │
│ Trạm gần nhất     3,1 km chim bay    │
│ Ngưỡng của Xã    >2,0 km             │
│ Cao hơn ngưỡng    1,1 km             │
│ Đây không phải quyết định đầu tư.    │
├──────────────────────────────────────┤
│ TRƯỚC / SAU                          │
│ Trước [██████|████████|████|·]       │
│ Sau   [████████|██████████|██|·]     │
│        ≤1    1–2     2–5     >5 km   │
│ Trước: 50% dân số ... không quá 1,7.│
│ Sau: ước lượng ... không quá ~1,4.   │
├──────────────────────────────────────┤
│ KHU VỰC LIÊN QUAN                    │
│ Xã Tây Phương  ~... người      [↗]  │
│ Xã Thạch Thất   ~... người      [↗]  │
│                         Xem tất cả   │
├──────────────────────────────────────┤
│ CẦN KIỂM TRA TIẾP                    │
│ □ tuyến đường thật và lối vào        │
│ □ điện, đất, chỗ đỗ, PCCC            │
│ □ trạm đang xây/cấp phép             │
├──────────────────────────────────────┤
│ ▸ Trạm hiện hữu trong 5 km (13)      │
│ ▸ Phương pháp và giới hạn            │
│ ▸ Chi tiết vị trí                    │
└──────────────────────────────────────┘
```

### 9.2 Mobile — spec only, chưa baseline trong audit này

```text
┌──────────────────────────────────────┐
│             ━━━━━                    │
│ Mô phỏng trạm giả định           [×]│  sticky <= 56 px
├──────────────────────────────────────┤
│ Xã Tây Phương · Hà Nội              │
│ Ước lượng hình học trong 5 km...     │
│                                      │
│ ~31.746 người / 12 ô rõ rệt          │
│ ~2.947 người / 6 ô còn sai số        │
│                                      │
│ Sàng lọc khoảng cách                 │
│ Qua · 3,1 km > 2,0 km                │
│                                      │
│ Trước / Sau                          │
│ [stacked bands full width]           │
│ [median plain-language]              │
│                                      │
│ Khu vực · Cần kiểm tra · disclosures │
└──────────────────────────────────────┘
           bottom sheet <= 85vh
```

Mobile giữ cùng content order/copy. Không dùng ba cột KPI; không dùng horizontal table; mọi
row locality có target tối thiểu 44×44 px.

---

## 10. Copy deck tiếng Việt

Placeholder dùng `{...}`; implementer không tự viết biến thể khác.

### 10.1 Entry và placement

| State/control | Copy exact |
|---|---|
| Nav idle accessible name | `Đặt vị trí trạm giả định` |
| Nav idle tooltip | `Bấm rồi chọn một vị trí trên bản đồ để ước lượng thay đổi cự ly.` |
| Placement mode accessible name | `Đang chọn vị trí trạm giả định` |
| Placement instruction | `Bấm một điểm trong tỉnh để mô phỏng. Nhấn Esc để hủy.` |
| Candidate active nav tooltip | `Chọn lại vị trí trạm giả định` |
| Header delete button | `Xóa vị trí giả định` |
| Candidate replace mode | `Bấm vị trí mới trên bản đồ. Nhấn Esc để giữ vị trí hiện tại.` |

Khi candidate đang active, nav trigger vào replace mode; nó không xóa candidate. Xóa chỉ qua
nút có nhãn rõ trong panel.

### 10.2 Header

| Condition | Copy exact |
|---|---|
| locality known | `Mô phỏng trạm giả định` / `{commune_name} · {province_name}` |
| province known, locality unknown | `Mô phỏng trạm giả định` / `Vị trí trong {province_name}` |
| scope line | `Ước lượng hình học trong phạm vi 5 km; không phải định tuyến.` |

Không in toạ độ/H3 trong heading.

### 10.3 Loading và query failure

| State | Copy exact |
|---|---|
| initial/replacement loading | `Đang tính kết quả cho vị trí này…` |
| loading detail | `Đang đọc các ô trong phạm vi 5 km và đối chiếu trạm hiện hữu.` |
| F10 | `Không đọc được dữ liệu quanh vị trí này.` |
| F10 action | `Thử lại` |
| F10 secondary action | `Xóa vị trí` |

Trong loading, không hiển thị bất kỳ số nào của candidate trước. Shell và header giữ kích
thước; outcome dùng skeleton đúng hình dạng.

### 10.4 Outcome success states

| State | Copy exact |
|---|---|
| improved>0, uncertain>0 | `Ước tính ~{improved_population} người trong {improved_cells} ô được rút ngắn cự ly rõ rệt. ~{uncertain_population} người trong {uncertain_cells} ô khác có thể cải thiện, nhưng còn trong biên sai số.` |
| improved>0, uncertain=0 | `Ước tính ~{improved_population} người trong {improved_cells} ô được rút ngắn cự ly rõ rệt. Không có ô nào nằm trong nhóm có thể cải thiện nhưng còn trong biên sai số.` |
| improved=0, uncertain>0 | `Chưa có ô nào được xếp vào nhóm cải thiện rõ rệt. ~{uncertain_population} người trong {uncertain_cells} ô có thể cải thiện, nhưng kết quả còn trong biên sai số.` |
| improved=0, uncertain=0 | `Không có ô nào trong phạm vi 5 km được ước tính rút ngắn cự ly ở vị trí này.` |
| no positive population median | `Không có dân số dương trong các ô đủ điều kiện so sánh; không tính được trung vị theo dân số.` |

`improved_cells`/`uncertain_cells` là integer; population và mọi distance After có `~`.

### 10.5 Khoảng chưa kết luận

| Condition | Copy exact |
|---|---|
| NO_BASELINE | `{cells} ô, tương ứng {population} người, hiện không tới được trạm nào trong đồ thị đường đã phát hành; không có nền để ước lượng thay đổi.` |
| EXCLUDED | `{cells} ô, tương ứng {population} người, không có đường được neo trong phạm vi 2 km; các ô này bị loại khỏi mô phỏng.` |
| zone truncated | `Phạm vi 5 km chạm ranh giới gói dữ liệu; các ô phía tỉnh bên cạnh không được tính.` |
| flagged population | `{cells} ô trong phạm vi dùng bề mặt dân số chưa neo được vào số công bố VNSDI; tổng dân số mang thêm bất định của nguồn này.` |

Heading của block: `Phần chưa thể kết luận`.

### 10.6 Rule states

| Presentation state | Headline exact |
|---|---|
| base pass | `Qua bước sàng lọc khoảng cách theo quy tắc L6.` |
| base fail | `Không qua bước sàng lọc khoảng cách theo quy tắc L6.` |
| conditional DC | `Qua bước sàng lọc có điều kiện: vị trí mới phải có sạc DC.` |
| unknown distance/kind | `Chưa tính được kết quả sàng lọc khoảng cách.` |
| fail, high-load layer unusable in exception range | `Không qua bước sàng lọc khoảng cách theo dữ liệu hiện có.` |

Supporting labels:

```text
Khoảng cách tới trạm đủ điều kiện gần nhất: {distance} km đường chim bay
Ngưỡng của {kind_label}: lớn hơn {threshold} km
{Cao hơn|Thấp hơn} ngưỡng: {abs_margin} km
```

Strict equality copy:

```text
Khoảng cách bằng ngưỡng, nhưng quy tắc yêu cầu phải lớn hơn ngưỡng.
```

Conditional details:

```text
Vị trí nằm trên sàn ngoại lệ 0,5 km nhưng chưa vượt ngưỡng 2 km của Xã.
Trạm gần nhất có mức sử dụng đo đủ điều kiện từ 40% trở lên.
Quy tắc chỉ cho qua nhánh này khi vị trí mới có sạc DC.
```

Unknown-nearest-util convention:

```text
Ngoại lệ không được kích hoạt vì trạm gần nhất không có phép đo đủ điều kiện. Điều này không
chứng minh trạm đang có mức sử dụng thấp.
```

Whole-layer unusable caveat, chỉ khi candidate nằm trong nhánh Xã 0,5–2 km:

```text
Nhánh ngoại lệ cao tải chưa đánh giá được vì lớp mức sử dụng của tỉnh này không dùng được.
Kết quả trên giữ theo quy ước của rule hiện hành; không được hiểu là trạm đang có mức sử dụng thấp.
```

Footer luôn hiện:

```text
Đây là kết quả của một quy tắc khoảng cách, không phải số đo và không phải quyết định đầu tư.
```

### 10.7 Before/After

Heading: `Cự ly tới trạm gần nhất: Trước và Sau`.

Median copy:

```text
Trước: 50% dân số trong vùng cách trạm gần nhất không quá {before_median}.
Sau: ước lượng 50% dân số trong vùng cách trạm gần nhất không quá ~{after_median}.
```

Qualifier:

```text
“Sau” chỉ thay các ô cải thiện rõ rệt; ô còn trong biên sai số giữ cự ly Trước.
```

Disclosure trigger: `Xem số người theo từng dải cự ly`.

### 10.8 Locality

Heading: `Khu vực liên quan`.

Row accessible name:

```text
Xem {commune_name} trên bản đồ: ước tính ~{improved_population} người cải thiện rõ rệt,
~{uncertain_population} người còn trong biên sai số.
```

Missing-name disclosure:

```text
{cells} ô chưa có địa danh đủ tin cậy để liệt kê; các ô vẫn được tính trong tổng toàn vùng.
```

Không có locality section nếu mọi row thiếu name.

### 10.9 Evidence tiếp theo

Heading: `Cần kiểm tra tiếp`.

Copy exact:

1. `Kiểm tra tuyến đường lái thực tế, cầu/sông/đường một chiều và lối xe vào vị trí.`
2. `Đối chiếu trạm đang xây hoặc đã được cấp phép; bộ dữ liệu hiện không có danh sách này.`
3. `Khảo sát khả năng đấu nối điện, pháp lý đất, chỗ đỗ, PCCC và điều kiện tiếp cận.`
4. `Xác nhận lại trạng thái và ngày dữ liệu của các trạm hiện hữu lân cận.`

Đây là checklist đọc, không phải checkbox được lưu.

### 10.10 Secondary disclosures

| Trigger | Summary/header copy |
|---|---|
| Nearby stations | `Trạm hiện hữu trong 5 km ({count})` |
| No nearby station | `Không có trạm đủ điều kiện nào trong phạm vi 5 km.` |
| Method | `Phương pháp và giới hạn` |
| Technical location | `Chi tiết vị trí` |

Method body:

```text
Với mỗi ô trong phạm vi 5 km, cự ly tới vị trí giả định được ước lượng bằng khoảng cách chim
bay nhân hệ số đi vòng theo dải cự ly và các ô lân cận. Hệ số được hiệu chuẩn riêng cho tỉnh.
Trên {validation_n} ô kiểm chứng của tỉnh, {within_20pct}% ước lượng nằm trong ±20%; cận trên
còn bị vượt ở khoảng {upper_miss}%. Dưới 1 km, sai số lớn hơn nên cự ly từng ô chỉ hiện dưới
dạng khoảng. Ô không có cự ly nền không được điền giá trị thay thế.

Dân số là bề mặt WorldPop 2025 đã neo theo số công bố VNSDI khi nguồn cho phép. Dữ liệu trạm
chốt ngày {manifest_date}; mạng trạm hoặc nguồn dân số đổi thì kết quả đổi.
```

Claims absent body:

```text
Kết quả không cho biết tuyến lái thật, nhu cầu hay mức sử dụng tương lai của vị trí mới, hiệu
quả tài chính, khả năng đấu nối điện hoặc điều kiện xây dựng tại chỗ.
```

Technical location body:

```text
Toạ độ: {lat5}, {lng5}
Ô H3 r8: {h3}
Hiệu chuẩn mô phỏng: v{version}
Ngày xuất gói dữ liệu: {manifest_date}
```

Toạ độ/H3 dùng JetBrains Mono; mọi số đo khác dùng Be Vietnam Pro.

### 10.11 Disabled/admission states

| Condition | Copy exact | UI behavior |
|---|---|---|
| calibration absent/invalid | `Chưa đủ dữ liệu hiệu chuẩn để mô phỏng ở tỉnh này.` | trigger không dựng; nếu route cũ tới state này, thông báo trong read column, không mở empty panel |
| outside province/grid | `Vị trí nằm ngoài phạm vi gói dữ liệu tỉnh.` | giữ placement mode để chọn lại; không giữ marker/result |
| no road access candidate | `Không có đường được neo trong phạm vi 2 km quanh ô này; không thể mô phỏng vị trí.` | giữ placement mode để chọn lại |
| malformed hash | không có copy | bỏ riêng `sim`; app boot bình thường |
| national/proxy | không có copy | trigger và candidate absent; bỏ riêng `sim` |

---

## 11. Before/After visualization contract

### 11.1 Form

Hai stacked horizontal bands, cùng chiều rộng và cùng thứ tự:

```text
Trước  [ <=1 km | 1–2 km | 2–5 km | >5 km ]
Sau    [ <=1 km | 1–2 km | 2–5 km | >5 km ]
```

Không dùng ba KPI cards. Không dùng một table làm hình primary.

### 11.2 Domain và denominator

- Cả hai hàng dùng đúng cùng tập population có baseline.
- Tổng chiều dài mỗi hàng là cùng tổng population included; NO_BASELINE/EXCLUDED nằm ngoài
  bar và được nói riêng.
- Band thresholds binding: `<=1000`, `(1000,2000]`, `(2000,5000]`, `>5000` mét.
- `UNCERTAIN` giữ Before trong hàng After.
- Không chuẩn hoá từng bar theo một denominator khác.
- Segment zero có chiều rộng 0 nhưng vẫn có row trong accessible table.

### 11.3 Encoding

- Dùng một ramp tuần tự đã đăng ký cho distance; không thêm hex.
- Thứ tự sáng → đậm phải nhất quán với “xa hơn”; nếu theme contract không hỗ trợ, dùng bốn
  mức neutral token + border/pattern, không hard-code màu.
- Before/After phân biệt bằng row label và tag provenance, không chỉ hue.
- Segment có separator hairline; không dùng gradient.
- Legend bốn band luôn hiện, đơn vị `km` một lần.

### 11.4 Exact values và accessibility

- Primary chart không in số trên segment quá hẹp.
- Ngay dưới chart có median plain-language §10.7.
- Disclosure `Xem số người theo từng dải cự ly` dựng HTML table với bốn row, hai cột và delta.
- Accessible summary của figure đọc cả four-band Before/After totals.
- Không có thông tin hover-only. Nếu có readout hover/focus, cùng nội dung phải vào được bằng
  bàn phím; implementation không được kế thừa khoản nợ hover-only của chart cũ.
- Delta After là ước lượng và dùng locale vi-VN; không dùng dấu `+` như một màu “tốt”.

---

## 12. Rule presentation contract

### 12.1 Presentation state machine

| Điều kiện | Presentation state | Copy |
|---|---|---|
| `distance=null` hoặc `kind=null` | `NOT_COMPUTABLE` | chưa tính được |
| `distance > threshold(kind)` | `BASE_PASS` | qua bước sàng lọc |
| kind Xã, `500 < distance <= 2000`, high-load evidence usable và nearestHighLoad | `CONDITIONAL_DC` | qua có điều kiện DC |
| kind Xã, trong exception range, whole layer unusable | `BASE_FAIL_EXCEPTION_UNAVAILABLE` | không qua theo dữ liệu hiện có + caveat F6 |
| mọi ca còn lại | `BASE_FAIL` | không qua |

`BASE_FAIL_EXCEPTION_UNAVAILABLE` vẫn ánh xạ từ engine `TU_CHOI`; nó không thay kết quả rule.
State riêng chỉ bắt buộc caveat F6 xuất hiện và cấm suy diễn missing utilization thành tải thấp.
View-model resolver phải có unit test độc lập.

### 12.2 Numbers shown

Luôn hiện khi có:

1. `distanceM` — khoảng cách chim bay từ P tới trạm đủ điều kiện gần nhất;
2. `thresholdM` — policy threshold theo kind;
3. `abs(marginM)` + direction;
4. exception floor/high-load threshold chỉ trong nhánh liên quan.

Không chỉ in margin. Kind hiển thị `Phường`, `Xã`, `Đặc khu`, không in enum uppercase.

### 12.3 Nearest station evidence

Rule card gọi tên đúng một nearest eligible station. Link `Xem trong danh sách trạm` mở
disclosure và scroll/focus đúng row; nó không đổi EntitySelection vì selection sẽ xóa
candidate.

Nếu occupancy thiếu:

- không gọi trạm là thấp tải;
- nói rule convention “không có phép đo đủ điều kiện”;
- giữ util null, không in 0%.

### 12.4 Visual language

- Status dùng icon + text + border token; không dùng một green/red badge đứng một mình.
- `QUY TẮC` là eyebrow nhỏ, không mono.
- Không dùng `ĐỀ XUẤT`, `TỪ CHỐI` làm status text primary.
- Footer disclaimer luôn visible trong rule section.

---

## 13. Null, uncertainty và provenance contract

### 13.1 Closed null table

| Null/condition | Nghĩa | UI | Aggregate |
|---|---|---|---|
| `dOld=null`, NO_PATH | không có baseline network | warning NO_BASELINE; không có After/delta | exclude, count+population riêng |
| `dOld=null`, NO_ROAD_ACCESS | không có road anchor | warning EXCLUDED | exclude, count+population riêng |
| `detour_ratio=null`, e<200 m | ratio là nhiễu | dùng near measured band nếu calibration có | theo estimator hiện tại |
| near calibration null | không có estimate near | không claim improvement; không in số | giữ Before |
| `population=null/<=0` | không có weight dương | không biến 0; median có thể null | weight 0 |
| `util=null` | không có phép đo | `Chưa có phép đo đủ điều kiện` | never high-load |
| `kind=null` | không có threshold | rule not computable | decision UI null |
| `commune_name=null` | không có địa danh tin cậy | không dựng locality row | vẫn ở regional total |

### 13.2 Uncertainty hierarchy

1. `IMPROVES` — conservative class; headline chính.
2. `UNCERTAIN` — câu thứ hai, không gộp headline và không dùng cùng visual weight.
3. `NO_BASELINE`/`EXCLUDED` — warning “chưa kết luận”, không gọi là unchanged.
4. zone/package/pop-source limitations — warning theo điều kiện.

Không dùng một badge “độ tin cậy” tổng hợp; các loại bất định khác nghĩa.

### 13.3 Provenance density

- Một provenance tag mỗi section, không lặp trong mỗi header/table cell.
- Tag không dùng JetBrains Mono.
- Method disclosure định nghĩa các tag một lần.
- Technical IDs chỉ xuất hiện ở cuối panel.
- Mọi After/delta exact-value vẫn có `~` kể cả khi section đã mang tag.

---

## 14. Interaction, selection, hash và focus contract

### 14.1 Candidate lifecycle

```text
IDLE --nav--> PLACING --map click--> LOADING --> READY
  ^               | Esc                | error      |
  |               v                    v            |
  +------------ IDLE/READY <--------- ERROR         |

READY --nav--> REPLACING --map click--> LOADING(new)
  ^                    | Esc
  +--------------------+
```

- PLACING Esc về IDLE.
- REPLACING Esc giữ candidate/result hiện tại.
- Map click mới thay candidate atomically; không cần xóa trước.
- Nút Xóa là đường duy nhất xóa từ panel.
- Chỉ một candidate tồn tại.

### 14.2 Result coherence

State phải gắn `requestId` hoặc candidate key vào result. Binding invariant:

```text
render numeric result only when result.candidateKey === currentCandidateKey
```

Khi candidate đổi:

- giữ shell/header mới;
- hide mọi số cũ và hiện loading skeleton;
- abort query nếu API hỗ trợ; nếu không, bỏ completion bằng request identity;
- một request cũ không được clear/error request mới.

### 14.3 EntitySelection

- Candidate không thêm vào `EntitySelection`.
- Chọn station/cell/commune thật xóa candidate theo single-attention rule.
- Locality row trong simulation **không** gọi `selectEntity`; nó chỉ map-focus/highlight trong
  simulation store, nếu không candidate sẽ bị xóa.
- Map-focus locality giữ panel, field, lens và hash candidate.
- Bấm empty map khi READY không xóa candidate; empty-map close chỉ áp cho Entity Inspector.

### 14.4 Map link

- Hover/focus locality row: tăng nét các H3 thuộc group bằng existing neutral selection pass.
- Activate row: fit bounds của group với padding tính theo Evidence card; tôn trọng
  `prefers-reduced-motion`.
- Esc sau map focus đưa focus về row, không xóa candidate.
- IMPROVES dùng nét liền; UNCERTAIN nét đứt; panel có một key chữ nhỏ cạnh locality heading.
- Không thêm hue, OverlayId hoặc field.

### 14.5 Hash

- Giữ wire format `sim=<lat5>,<lng5>`.
- Parser kiểm từng khoá; `sim` hỏng bị bỏ riêng.
- Serializer không ghi `sim` ở national/proxy/story surface không hỗ trợ.
- `selection` và candidate không được serialize cùng nhau; state resolver giữ interaction mới
  nhất và xóa nhánh còn lại trước flush 250 ms.
- Reload cùng package + candidate cho deep-equal result.
- Hash candidate đổi phải vào LOADING, không render result candidate cũ.
- Không thêm locality/map-focus vào hash; đó là transient inspection state.

### 14.6 Focus

- Nav trigger là focus origin của placement.
- Candidate do user đặt: khi identity + outcome sẵn sàng, reset simulation scroller và focus
  heading `h1` (`tabIndex=-1`).
- Candidate từ initial hash: không steal focus; `aria-live=polite` báo một câu khi ready.
- Replacement không focus heading cho tới khi result mới ready; không announce dữ liệu cũ.
- Nút xóa, Esc và query-error close trả focus về trigger nếu còn; fallback map main.
- Disclosure dùng native `<details>/<summary>`; state có accessible name mặc định. Nếu dùng
  button, bắt buộc `aria-expanded` + `aria-controls`.
- Esc đóng nested popover trước; `<details>` inline không cài listener riêng.

---

## 15. Accessibility

- Thẻ là `<aside aria-labelledby=...>`; có đúng một `h1` cho feature và `h2` cho section.
- Outcome wrapper có `role=status`, `aria-live=polite`, `aria-atomic=true`; chỉ announce khi
  READY/ERROR đổi, không announce mỗi hover locality.
- Mọi text nhỏ đạt WCAG AA 4,5:1 trên **background composite thật**.
- Status rule không phụ thuộc màu: icon + headline + condition text.
- Chart có figure label, direct legend và HTML data table; không hover-only.
- Nét liền/đứt của map được giải thích bằng text; không chỉ color.
- Focus ring dùng global 2 px `--color-ring`; không override bằng emerald/amber ring.
- Touch target mobile >=44 px; desktop close/summary >=24 px.
- Be Vietnam Pro cho copy và số; JetBrains Mono chỉ cho H3, toạ độ, station code/hash.
- Số đọc dùng locale vi-VN; toạ độ kỹ thuật giữ dấu chấm.
- Reduced motion: locality focus dùng `jumpTo` khi media query reduce.
- Loading giữ hình dạng; không dùng animation pulse khi reduced motion.
- Error/admission messages vào `role=alert` nhưng không lặp announce.

---

## 16. Performance và query lifecycle

### 16.1 Query budget

- Cold first placement: tối đa hai request DuckDB đang có — zone grid + occupancy summary.
- Warm placement trong cùng dataset: đúng một zone query; occupancy dùng cache.
- Không query thêm để lấy locality; `commune.geojson` đã nạp và `commune_name` đi cùng zone
  query hiện tại.
- Chỉ select các cột cần; thêm đúng `commune_name`, không `SELECT *`.
- `Z <= ~107` cells; grouping locality thực hiện trong cùng O(Z) pass.
- Nearby stations chỉ mount rows khi disclosure mở; header count luôn có sẵn.

### 16.2 Timing budget

- Binding release gate: map click → READY/ERROR <= 1.000 ms trên protocol Phase 10.
- Warm target: <=300 ms; báo p50/p95 riêng, không biến target thành claim nếu chưa đo.
- 0 long task >50 ms trong placement.
- IDLE giữ 0 rAF/s; không thêm animation loop cho candidate outline.

### 16.3 Concurrency/cache

- Mỗi request có identity; completion chỉ commit nếu còn current.
- Failure không cache; retry là request thật.
- Occupancy cache keyed theo dataset path/session; dataset đổi không tái dùng map cũ.
- Candidate change không tạo thêm full-grid field request và không chạm LRU field cache.
- Error F10 clear map result layers của request hỏng nhưng giữ vị trí/CTA retry theo copy mới;
  không giữ outline cũ.

### 16.4 Render cost

- Outcome/view-model dùng memo/pure selectors; không subscribe state không liên quan.
- Region highlight chỉ đổi simulation layers, không mutate active field.
- Dùng existing layer stack and `SELECT_PASSES`; layer IDs unique.
- Collapsed method/stations không render heavy child trees.

---

## 17. Design-token và layout contract

- Panel desktop dùng class y hệt Evidence card: `w-[320px] max-h-[60%]`, từ 1440
  `w-[340px]`.
- Dùng `AtlasSurface`, `AtlasSurfaceHeader/Body` hoặc cùng spacing token; không tự dựng palette.
- Không có `slate-*`, `emerald-*`, `amber-*`, `rose-*`, `cyan-*` trong simulation component.
- Dùng `bg-panel`, `bg-basemap`, `text-ink`, `text-ink-2`, `text-ink-muted`, `border-hairline`,
  `text-note/body/title/heading/readout`.
- Padding section `px-3 py-3`; section gap `space-y-3`; separator hairline, không dùng một nền
  khác cho mọi section.
- Không dùng `text-[Npx]`, `text-xs`, `text-sm`, `text-base`.
- Không thêm shadow/border radius; AtlasSurface sở hữu cả hai.
- One hero readout only; không dựng ba dark tiles.
- Scroller `scrollWidth <= clientWidth + 1`; long station name truncate + `title`, metadata
  wrap trong width.

---

## 18. Danh sách file dự kiến sửa

Phiên audit này chỉ thêm spec, baseline assets và một ngoại lệ `.gitignore` hẹp để spec không
bị rule `*.md` bỏ qua; không file sản phẩm nào được sửa. Khi implement, phạm vi dự kiến:

| File | Thay đổi |
|---|---|
| `web/DESIGN.md` | ghi contract simulation surface/copy hierarchy, trước TSX |
| `docs/PHASE6_LOCAL_SIMULATION.md` | thay UI §3 bằng spec này; thuật toán giữ nguyên |
| `web/src/ui/SimulationPanel.tsx` | IA, copy, token, disclosures, focus/status |
| `web/src/ui/SimulationDistribution.tsx` *(nếu tách)* | pure Before/After figure + accessible table |
| `web/src/components/atlas/EvidenceCard.tsx` | dùng đúng width/height, heading/focus origin cho candidate |
| `web/src/components/atlas/NavRail.tsx` | idle/placing/replacing semantics và copy |
| `web/src/simulation/types.ts` | candidate context, screening evidence, area summaries, request state |
| `web/src/simulation/admissions.ts` | trả commune code/name/kind thay vì kind đơn |
| `web/src/simulation/zone-query.ts` | select/parse `commune_name` |
| `web/src/simulation/engine.ts` | giữ nearest rule evidence; group locality trong pass hiện có |
| `web/src/simulation/store.ts` | request/candidate key, replacing/map-focus state |
| `web/src/simulation/use-simulation.ts` | loading coherence, stale-request guard, retry lifecycle |
| `web/src/map/MapView.tsx` | locality hover/focus, giữ neutral passes/reduced motion |
| `web/src/state/hash.ts` | chỉ nếu cần enforce selection/candidate mutual exclusion; wire format không đổi |
| `web/test/simulation.test.ts` | data/claim/rule state/null/hash/property tests |
| `web/test/simulation-panel.test.ts` *(mới nếu cần)* | pure presenter/copy/markup tests |
| `web/test/phase10-release.test.ts` | đưa SimulationPanel vào locale/token/focus guards |
| `docs/qa/simulation/run_witness.py` *(mới)* | production browser witness 3 desktop + responsive implementation |

Không dự kiến sửa `src/evcs/`, schema, calibration pipeline hoặc `web/public/data`.

---

## 19. Migration plan

### M0 — chốt documentation

1. cập nhật `web/DESIGN.md` và Phase 6 UI contract;
2. ghi rõ spec này supersede Phase 6 §3 về presentation, không supersede §1–§2;
3. khóa copy deck bằng test.

### M1 — mở rộng pure view-model

1. thêm `commune_name` vào zone query;
2. trả candidate context và screening evidence;
3. group locality trong engine pass;
4. thêm presentation-state resolver cho rule;
5. chạy toàn bộ test T1–T23 cũ; output số cũ deep-equal trừ field mới.

### M2 — lifecycle coherence

1. thêm candidate/request key;
2. hide result cũ khi candidate đổi;
3. implement PLACING/REPLACING/RETRY;
4. giữ hash format; thêm test same-document hash change.

### M3 — panel shell và outcome

1. đưa candidate vào đúng Evidence shell 320/340/60%;
2. thay toàn bộ slate palette bằng token;
3. dựng header/outcome/warnings/rule theo copy deck;
4. hoàn thiện focus/live region.

### M4 — visualization và locality

1. dựng stacked band + accessible table;
2. locality group + map focus;
3. nearby/method/technical disclosures;
4. next-evidence checklist.

### M5 — QA

1. unit/typecheck/build;
2. browser witness ở ba desktop baseline;
3. responsive witness sau implementation, kể cả mobile contract chưa audit trong phiên này;
4. performance Phase 10 protocol;
5. copy/forbidden-claim audit.

Không cần data migration, feature flag hay dual-read.

---

## 20. Test plan

### 20.1 Pure/data tests

- Giữ nguyên T1–T23 và property `After <= Before`.
- `commune_name` query null-preserving; không `?? "Ô H3"`.
- candidate resolver PIP success/fallback/mismatch/null.
- locality aggregation: sum group bằng global improved/uncertain cho named cells; missing-name
  cells counted separately; H3 never label fallback.
- screening evidence distance/threshold/margin parity với existing decision.
- presentation state table §12, gồm equality, unknown kind, layer unusable, nearest util null.
- rule copy không gọi missing util là 0/thấp.
- Before/After chart denominator equality; uncertain unchanged.
- NO_BASELINE/EXCLUDED excluded from chart and surfaced counts.
- every estimated distance/population formatter has `~`; locale vi-VN.

### 20.2 Component/structure tests

- no `slate-|emerald-|amber-|rose-|cyan-` in simulation UI.
- no arbitrary/text-size utility outside six tokens.
- only technical details use mono.
- one `h1`; section headings ordered; disclosures have semantic expanded state.
- no visible `ĐỀ XUẤT`/`TỪ CHỐI` enum strings.
- no H3/coordinates before `Chi tiết vị trí`.
- exact copy states render from pure presenter.
- SimulationPanel added to Phase 10 locale scan.
- no raw row iteration or `SELECT *`.

### 20.3 Browser witness

Fixture/deep link: baseline coordinate in §3.1, but assertions derive expected numbers from
result/data fixture rather than hard-code province constants.

At 1280×800, 1440×900, 1600×1000:

- screenshot;
- panel rect 320/340 and <=60% height;
- `document.scrollWidth <= viewport`, panel scroller no horizontal overflow;
- automated computed contrast audit >=4,5:1;
- outcome + rule rect nằm trong first panel viewport;
- locality name visible; H3 absent until disclosure;
- chart two rows share bounds and total;
- disclosure keyboard open/close state;
- locality focus highlights map and preserves candidate;
- Esc/close focus restoration;
- initial hash does not steal focus;
- candidate hash replacement never displays old candidate numbers under new header;
- F1/F3/F10 and null warnings render đúng copy.

Mobile witness là acceptance của implementation, không phải baseline đã hoàn thành ở phiên
audit này: 760×900 hoặc viewport đã được owner chọn, bottom sheet <=85vh, no horizontal
overflow, target 44 px, same content order.

### 20.4 Performance

- measure cold/warm placement p50/p95;
- assert <=1 s release gate, 0 long task;
- query counter: cold <=2, warm=1;
- rapid three placements: only final request commits;
- repeat 15 placements after GC: no unbounded growth;
- idle 0 rAF/s.

### 20.5 Regression

- Inspector Phase 3 focus/selection tests xanh;
- Phase 10 release/witness xanh;
- `npm run typecheck`, focused tests, full web tests, build;
- `make kiem` trước khi phát hành theo repo contract.

---

## 21. Measurable acceptance criteria

| ID | Tiêu chí |
|---|---|
| UX-SIM-01 | Ở ba desktop viewport, panel đúng 320/340 px và chiều cao <=60% map. |
| UX-SIM-02 | Mọi text panel đạt contrast >=4,5:1 trên composite background. |
| UX-SIM-03 | Không class màu slate/emerald/amber/rose/cyan hoặc arbitrary text size trong simulation UI. |
| UX-SIM-04 | 1280×800 nhìn thấy toàn bộ outcome, active warnings và rule status/conditions không cuộn. |
| UX-SIM-05 | Primary outcome luôn tách improved và uncertain; NO_BASELINE/EXCLUDED không bị gộp. |
| UX-SIM-06 | Rule UI in distance, threshold, margin/exception và disclaimer; không render badge `ĐỀ XUẤT`. |
| UX-SIM-07 | Median luôn có câu “50% dân số… không quá X”; không chỉ hiện thuật ngữ. |
| UX-SIM-08 | Before/After dùng đúng bốn band, cùng denominator; uncertain giữ Before. |
| UX-SIM-09 | Primary locality dùng commune name; H3 chỉ có trong technical disclosure. |
| UX-SIM-10 | Locality row focus/click link map mà không tạo EntitySelection hoặc xóa candidate. |
| UX-SIM-11 | Nearby stations/method/technical đóng mặc định; nearest rule station mở đúng row. |
| UX-SIM-12 | Candidate replacement/hash change không có một frame nào gắn result cũ với candidate mới. |
| UX-SIM-13 | Invalid `sim` bỏ riêng; reload same hash cho deep-equal result; national/proxy không dựng feature. |
| UX-SIM-14 | User placement focus heading khi ready; initial hash không steal; close trả focus đúng origin/fallback. |
| UX-SIM-15 | Locale vi-VN cho mọi số đọc; dấu chấm chỉ còn ở toạ độ/SVG path. |
| UX-SIM-16 | Cold placement <=2 query, warm=1; ready/error <=1 s; 0 long task >50 ms. |
| UX-SIM-17 | `scrollWidth <= clientWidth+1` cho body và panel; long station metadata wrap/truncate đúng. |
| UX-SIM-18 | Exact copy deck có test cho success, zero, uncertainty, null, F1/F2/F3/F10 và rule states. |
| UX-SIM-19 | Không có field/claim về route thật, time, candidate utilization/revenue/load relief, score hoặc buildability. |
| UX-SIM-20 | Thuật toán/aggregate properties và toàn bộ T1–T23 cũ không đổi. |

---

## 22. Bất định còn lại

1. Audit chỉ đo locality completeness ở p/01. Schema toàn quốc có `commune_name`, nhưng chưa
   quét 34 package để xác nhận 100% non-null/matching code.
2. Commune là mức địa danh tin cậy hiện có; repo không có street/locality reverse-geocoding.
   Không thể hứa tên đường hoặc khu dân cư nhỏ hơn xã/phường.
3. Mobile wireframe chưa được render theo chỉ dẫn bỏ mobile baseline; exact viewport mục tiêu
   cho acceptance nên được owner chốt khi implement.
4. Lần screenshot headless không dùng để xác nhận GPU/FPS. Performance 418 ms là số Phase 10
   đã ghi; redesign mới phải đo lại theo cùng protocol.
5. Chưa có nghiên cứu người dùng định lượng để so stacked bands với slope chart. Stacked bands
   được chọn vì panel hẹp, denominator bằng nhau và câu hỏi là phân bố; implementer không tự đổi
   form nếu không có bằng chứng usability mới.
6. Chưa xác nhận `commune_name` đủ hữu ích cho mọi candidate sát ranh commune. Contract giữ
   code/name + PIP/fallback và không tạo độ chính xác giả.

---

## 23bis. Điều chỉnh trong lúc implement (21/8/2026)

Spec được thực thi gần như nguyên vẹn. Bảy chỗ dưới đây phải điều chỉnh, và mỗi chỗ đều
kiểm được lại từ repo hoặc từ một phép đo trong trình duyệt.

| # | Spec nói | Đã làm | Vì sao |
|---|---|---|---|
| 1 | §7.2 hàng claim ghi `Xã/Phường/Đặc khu {name}` | Chỉ in `{commune_name}`, không ghép tiền tố | `docs/COT.md` #9: `commune_name` ĐÃ mang tiền tố loại đơn vị. Đọc p/01: `"Xã Tây Phương"`, `"Phường Đại Mỗ"`. Ghép thêm sẽ ra "Xã Xã Tây Phương". §10.2 vốn đã viết đúng; §7.2 là chỗ mô tả, không phải copy deck. |
| 2 | §12.2 hàng thứ ba là `{Cao hơn\|Thấp hơn} ngưỡng` | Thêm nhánh thứ ba `Bằng ngưỡng` khi `marginM = 0` | Bảng chỉ khoá hai hướng, nhưng `d = threshold` là một ca THẬT (spec có riêng câu equality ở §10.6) và nó không có hướng nào. Nhãn trung tính + câu equality; không bịa một hướng. |
| 3 | §7.1/§12.4 tag `QUY TẮC` cạnh nhãn phụ `Quy tắc L6` | Gộp thành một eyebrow `QUY TẮC L6` | Ảnh render 1280×800: hai dòng sát nhau đọc thành "QUY TẮC" rồi "Quy tắc L6" — một lời lặp chiếm đúng chỗ trên fold mà ba con số cần (§8.3). Tag vẫn dựng từ `SIM_TAG_LABEL[result.screening.tag]`, không viết tay. |
| 4 | §8.1-1 scope line nằm trong Header | Header ghim `h1` + địa danh; scope line là dòng đầu của vùng cuộn | Ghim ba khối làm phần header cố định chiếm ~16% trần 480 px. Scope line vẫn nhìn thấy không cần cuộn, nên §8.3 vẫn đạt — witness đo cả ba viewport. |
| 5 | §10.8 hàng địa danh hiện dân cải thiện | Hiện dân cải thiện; nếu bằng 0 thì hiện dân trong sai số kèm nhãn | Witness 1280×800: hai xã chỉ có ô UNCERTAIN in ra `~0 người`. Đúng con số, sai câu chuyện — hàng ấy có mặt vì có dân trong sai số. `aria-label` vẫn nói cả hai lớp đúng §10.8. |
| 6 | §11.4 "không dùng dấu `+` như một màu tốt" | Cột thay đổi in `~thêm N` / `~bớt N` / `0` | Bỏ dấu thì mất luôn hướng; chữ giữ hướng mà không mượn một quy ước "tốt/xấu" nào. |
| 7 | §9.2, §20.3 mobile | **BỎ theo chỉ dẫn trong phiên implement** | Bottom sheet vẫn dùng chung component và cùng thứ tự nội dung, và `max-h-[85vh]` đã đặt theo §9.2; nhưng KHÔNG có phép đo mobile nào trong đợt này. Đây là hạng mục để lại cho QA. |

**Hai lỗi tiềm ẩn phát hiện khi viết test, đã vá cùng đợt** (cả hai đều là lỗi TRƯỢT LẶNG,
không phải lỗi ném):

1. `isPointInGeoJson` chỉ nhận nhánh feature khi object khai `type: "Feature"`. Kiểu
   `CommuneFeature` mà `admissions.ts` công bố lại là `{properties, geometry}` — đúng hình
   dạng bị trả `false`. Dữ liệu thật có `type` nên production không sao, nhưng PIP sẽ trượt
   lặng với bất kỳ caller nào tuân theo đúng kiểu đã khai, rồi rơi xuống fallback theo mã ô
   mà không ai thấy. Nay nhận cả object có `.geometry`.
2. `simulationAreaBbox` gác `cellToBoundary` bằng `try/catch`. Đo được: h3-js **không ném**
   cho một chuỗi bất kỳ — nó trả một đa giác vô nghĩa (một chuỗi tiếng Việt cho hộp bao
   lng −34,8…145,6). Nay gác bằng `isValidCell`.

**Ba hành vi vòng đời đổi theo §10.1/§10.3/§10.11**, ghi lại vì chúng đổi thao tác quen tay:
nút ở nav rail khi đã có vị trí nay vào chế độ ĐỔI (không xoá); F10 GIỮ vị trí để "Thử lại"
có thứ để thử; F1/F3 giữ chế độ đặt để chọn lại ngay.

**Một chỗ spec để ngỏ, đã chốt**: §10.8 không nói thứ tự hàng địa danh. Chọn dân cải thiện
giảm dần → dân trong sai số giảm dần → tên theo đối chiếu tiếng Việt → mã, để `runSimulation`
còn tất định (T20).

---

## 23. Self-review gate của spec

- [x] Mọi claim thuật toán truy được về code/docs/data.
- [x] Copy cho mọi state chính, null, rule và failure đã chốt.
- [x] Interaction, selection, hash, focus và query lifecycle có state/invariant cụ thể.
- [x] Không thay thuật toán để phục vụ hình thức.
- [x] Null không thành 0; NO_BASELINE/EXCLUDED/UNCERTAIN không gộp.
- [x] H3/toạ độ/provenance kỹ thuật xuống progressive disclosure.
- [x] Không sửa code sản phẩm hoặc tạo commit trong phiên spec.
- [x] Baseline desktop đã dựng thật; mobile baseline được ghi rõ là skipped theo chỉ dẫn.

---

## 23ter. Vòng 2.1 ghi đè một phần IA của spec này (21/8/2026)

`docs/UX_SIMULATION_DECISION_CONTEXT_SPEC.md` (vòng 2.1) đã được implement. Các điểm của
spec này bị ghi đè CÓ CHỦ ĐÍCH — không xoá, không đánh số lại, chỉ ghi chú tại đây:

- **§8.1 (IA)**: thứ tự tiết mới là V1 Banner sàng lọc → V2 Hero tiles → Phần chưa thể kết
  luận → V3 Trước/Sau + delta → V4 Bối cảnh mạng trạm 5 km → 5 disclosure. "Khu vực liên
  quan" và "Cần kiểm tra tiếp" chuyển từ section chính xuống disclosure (đảo ngược có khai
  báo, vòng 2.1 §0.3).
- **UX-SIM-11**: ba disclosure → NĂM disclosure, vẫn đóng mặc định.
- **§12 thẻ sàng lọc dạng dl ba facts**: thay bằng banner §6.1 vòng 2.1 (badge phép kiểm +
  dòng cự ly ba-số-một-đơn-vị). `rulePresentation()` GIỮ NGUYÊN trong presenter (test parity
  vòng 1 vẫn chạy trên nó); UI nay render `ruleBanner()`.
- **Nút "Xem trong danh sách trạm"** cạnh trạm gần nhất của rule: bỏ — V4 đã gọi tên trạm
  gần nhất kèm cự ly và mức tải; disclosure danh sách trạm vẫn còn.
- Copy outcome §10.4 giữ nguyên ở `aria-live` (sr-only); hiển thị chuyển sang hero tiles.
