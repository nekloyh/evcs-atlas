# DESIGN — EVCS Atlas

Đây là contract hiện hành cho trải nghiệm `web/`. Nó thay toàn bộ cách tổ chức cũ dựa
trên **field rail + panel liệt kê cột**. App không phải data catalogue, cũng không phải
dashboard KPI. Nó là không gian điều tra để một người ra quyết định đi từ **câu hỏi → tín
hiệu không gian → bằng chứng → giới hạn → hành động tiếp theo**.

Tài liệu này không ghi milestone hay số liệu theo tỉnh. Xem `HAN_CHE.md`, `DECISIONS.md`,
`docs/COT.md` và `store/qa/` cho nguồn dữ liệu, giới hạn và số chạy thực tế.

## 1. Mô hình công việc

Mỗi phiên BẢN ĐỒ có đúng hai đối tượng chủ động:

1. **Câu hỏi đang điều tra** (*lens*): Cầu, Cung, Tiếp cận, Sử dụng, Công bằng, hoặc Bối cảnh.
2. **Đối tượng đang kiểm tra** (*selection*): một vùng H3, xã/phường, trạm, đoạn đường hoặc POI.

Field, geometry, legend, evidence và hành động tiếp theo là hệ quả của câu hỏi. Không có
giao diện nào lấy danh sách cột làm điểm bắt đầu. `field` vẫn là state/URL source of truth
về renderer; lens được suy ra từ nó, không tạo thêm hash state.

```
chọn câu hỏi
      ↓
chọn measure hợp lệ + geometry phù hợp
      ↓
đọc pattern trên map và legend
      ↓
chọn một đối tượng bất thường/đáng kiểm tra
      ↓
inspector: bằng chứng → giới hạn → hành động kế tiếp
```

## 2. Layout desktop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ tỉnh/dataset · Bản đồ | Câu chuyện | Dữ liệu               2D | 3D          │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ WORKSPACE            │                                                      │
│ câu hỏi              │                         MAP                          │
│ measure              │                analytical surface                    │
│ context controls     │                                                      │
│                      │              ┌───────────────┐                       │
│                      │              │ INSPECTOR     │                       │
│                      │              │ selection     │                       │
│                      │              │ evidence      │                       │
│                      │              │ next action   │                       │
│                      │              └───────────────┘                       │
├──────────────────────┴──────────────────────────────────────────────────────┤
│ LEGEND: measure · unit/denominator · scale · null · scope                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Workspace (280–320 px, trái):** một side panel duy nhất, có thể collapse. Nó chỉ để đổi
  câu hỏi, measure và context cần cho câu hỏi; không hiện source block, raw column name,
  mọi field của dataset, hay dữ liệu của object.
- **Map (trung tâm):** một analytical encoding. Đây là nơi khám phá pattern, không phải nơi
  đặt một dashboard.
- **Inspector (360 px, map-anchored sheet):** chỉ mở khi selection, phủ lên cạnh phải của map
  thay vì luôn chiếm một cột layout. Ở màn hình rất rộng có thể dock nó; ở bề rộng thông
  thường, mở inspector thì workspace tự collapse. Không có tab “Ô/Xã/Trạm” cố định và không
  yêu cầu người dùng hiểu loại geometry trước khi click.
- **Legend (dải dưới map):** thuộc map đang thấy, không thuộc workspace. Khi map không có
  analytical surface, legend biến thành statement rõ ràng “đang chỉ xem context”.
- **Dock phân tích:** không mặc định mở. Nó là chế độ *compare*, không phải cột thường trực.
  Khi mở, thay một phần map ở dưới, chứa một linked view trả lời đúng câu hỏi hiện hành.

Map phải giữ vùng thao tác tối thiểu 760 × 560 px. Nếu hai panel làm vùng này nhỏ hơn, chỉ
một panel được mở. Trên màn hẹp, workspace và inspector là drawer toàn màn hình; không ép
map xuống còn vài trăm pixel. Chỉ một drawer mở cùng lúc.

## 3. Workspace: câu hỏi trước, measure sau

Workspace gồm ba tầng, theo đúng thứ tự này:

### 3.1 Câu hỏi

Sáu nút lens, mỗi nút có một câu hỏi hoàn chỉnh, không chỉ nhãn nhóm:

| Lens | Câu hỏi | Geometry mặc định | Measure mặc định khi có dữ liệu |
|---|---|---|---|
| Cầu | Nhu cầu tiềm năng tập trung ở đâu? | H3 | dân số / mật độ dân số |
| Cung | Tài sản sạc công cộng đã lắp ở đâu và quy mô nào? | điểm trạm | số cổng đã lắp |
| Tiếp cận | Phải đi xa ở đâu trên mạng đường? | đoạn đường | khoảng cách mạng đến trạm |
| Sử dụng | Trạm nào bận ở giờ nào? | điểm trạm | occupancy tại giờ đang xem |
| Công bằng | Đơn vị nào lệch khi chuẩn hoá theo dân số? | xã/phường | cổng trên 10.000 dân |
| Bối cảnh | Điều gì cần kiểm tra thêm trước khi kết luận? | geometry nguồn | không có analytical default |

Default là metadata khai báo, không được suy ra từ thứ tự mảng field. Nếu default không
khả dụng ở dataset đang mở, workspace chọn fallback khai báo và nói lý do ngắn gọn.

### 3.2 Measure

Sau khi chọn lens, chỉ hiện 2–6 measure có visual contract hoàn chỉnh. Mỗi row gồm:

- tên measure và một câu hỏi phụ;
- geometry tag rõ ràng (`H3`, `TRẠM`, `ĐƯỜNG`, `XÃ`);
- unit/denominator ngắn;
- badge coverage/caveat trước khi chọn.

Không hiện raw column name trong UI chính. Model input, exploratory composite và field không
đủ contract không nằm ở workspace; chúng chỉ xuất hiện trong evidence khi selection cần nó.
Search tìm *câu hỏi + measure*, không tìm tất cả cột.

### 3.3 Context và điều khiển có điều kiện

Context là checklist phụ dưới measure, chỉ chứa lớp giúp giải thích câu hỏi hiện hành. Ví dụ:

- Tiếp cận: trạm, ranh giới, sông/cầu, POI liên quan.
- Cung: trạng thái vận hành, ranh giới và context tìm trạm; không chồng H3 supply.
- Công bằng: ranh xã, nhãn xã; không tự bật POI.

Scrubber chỉ hiện trong Sử dụng hoặc khi inspector trạm cần profile. Nút “tắt mặt tô” là
secondary action, không đứng ngang hàng với câu hỏi.

### 3.4 Filter và compare là một phép biến đổi có scope

Không đặt histogram, scatter hay KPI vào workspace chỉ vì chúng đã có dữ liệu. Một widget chỉ
được xuất hiện khi nó trả lời câu hỏi hiện hành và action của nó rõ ràng là một trong hai loại:

- **Filter:** thay đổi tập mark. UI phải ghi predicate, số mark còn lại và có nút clear.
- **Read-only summary:** chỉ mô tả global hay viewport; không âm thầm cross-filter map.

Global/viewport là lựa chọn do người dùng thấy được, không là chi tiết implementation. Widget
viewport phải ghi “trong khung nhìn”; widget global phải ghi phạm vi dataset. Cross-filter là
opt-in, chỉ giữa nguồn có cùng định danh/thuộc tính filter đã khai. Compare dock chỉ mở từ
action cụ thể (“so sánh dân số với khoảng cách”), không được tự mở theo field.

## 4. Inspector: evidence, không phải bảng field

Selection luôn mở cùng một cấu trúc 4 tầng. Người dùng nhìn cùng chỗ, nhưng nội dung thay
theo object và lens.

1. **Identity & current answer:** tên/vị trí/scope, measure đang xem, value + unit. Hover
   chỉ cho preview tối đa ba fact; click mới pin selection và mở sheet. Không có selection
   thì inspector chỉ hướng dẫn cách chọn và không biến thành panel rỗng.
2. **Evidence thiết yếu:** tối đa ba fact có thể kiểm tra ngay, được chọn theo lens hiện
   hành; không phải toàn bộ row. Fact luôn có numerator/denominator khi cần.
3. **Giới hạn và provenance:** null meaning, coverage, scope, quality flag, nguồn. Đây là
   phần luôn nhìn thấy khi nó thay đổi cách diễn giải; không giấu dưới tooltip.
4. **Đi tiếp:** một đến hai hành động hợp lệ: đổi sang measure liên quan, phóng tới network,
   mở route/profile, hoặc chuyển lên xã. Không có CTA “đề xuất đặt trạm” vì dataset không
   tạo recommendation cuối cùng.

`Chi tiết dữ liệu` là disclosure cuối, đọc-only, để audit các field còn lại. Nó không có
radio để đổi map và không được mặc định mở.

Header inspector giữ hai action quan trọng bất kể scroll: đóng selection và một action chính
theo object (ví dụ “xem nhịp 168 giờ” hoặc “soi trên mạng đường”). Action không có data thì
disabled kèm lý do, không biến mất sau khi người dùng đã chọn object.

### 4.1 Nội dung evidence theo selection

| Object | Evidence chính | Không được làm |
|---|---|---|
| H3 | measure hiện hành, dân số/distance khi liên quan, xã chứa nó, quality/null | radar, score nhiều trục, danh sách mọi cột |
| Xã/phường | numerator + denominator, metric chuẩn hoá, population/quality flag | coi ranh xã là pattern cầu tự nhiên |
| Trạm | asset (ports/power/status), occupancy/profile khi có, scope/coverage | dùng telemetry null để nói trạm rảnh/hỏng |
| Đoạn đường | network distance, reachable state, route/bridge context nếu có | chuyển mét thành phút hoặc vẽ line như area |
| POI | type, source geometry, OSM completeness caveat | biến POI thành bằng chứng cầu hoặc buildability |

Radar bị cấm trong inspector: các trục khác đơn vị và normalisation không có contract sẽ tạo
một điểm số thị giác giả. Các số tuyệt đối tách thành fact cards có label và denominator.

## 5. Geometry và visual contract

Geometry phải khớp hiện tượng:

- point: asset trạm, trạng thái trạm, POI/context;
- line: network distance, route, bridge/barrier;
- polygon xã: công bằng, rule, metric đã chuẩn hoá;
- H3: trường không gian aggregate có chủ ý, không phải ranh địa lý thật.

Mỗi measure được map hoá phải khai: câu hỏi, measure/denominator, geometry, scope, zero/null/
N/A, suy luận được phép và bị cấm, legend/tooltip, evidence trong inspector, next action và
fallback khi dữ liệu không khả dụng. Thiếu một mục thì chỉ được ở detail disclosure hoặc
model layer.

Một map có một analytical encoding. Context không mang ramp thứ hai. Nếu Supply mã hoá ports
bằng màu, radius giữ cố định; nếu mã hoá bằng size, phải có size legend thật và không thêm
color scale cạnh tranh. Không dùng composite score làm landing/default map.

## 6. Câu chữ và giới hạn dữ liệu

- `0`, `null` và không áp dụng là ba trạng thái tách biệt ở map, legend, inspector, filter
  và copy. Không dùng `?? 0` cho value semantics.
- Khoảng cách mạng là **mét**, không phải phút lái xe. Euclidean là bố trí, không là coverage.
- POI/landcover/substation là context trừ khi contract khác được chứng minh. OSM vắng không
  có nghĩa hoạt động hay nhu cầu vắng.
- `screen_*` là output phụ thuộc rule; nó giúp kiểm tra rule chứ không quyết định cuối.
- Không hard-code số theo tỉnh trong TSX/CSS/copy. Số đến từ data/manifest hoặc phép tính từ
  cột ship; ngưỡng chính sách phải được nêu tên là ngưỡng.

## 7. Các mode

- **Bản đồ:** workspace + map + inspector; mode mặc định cho điều tra.
- **Câu chuyện:** narrative sở hữu question/view/selection; thay workspace bằng narrative
  column, nhưng inspector vẫn có thể mở evidence của một object story chọn.
- **Dữ liệu:** audit workspace riêng: coverage, schema, quality, exports. Không giả là map.
- **Compare dock:** linked visualization tạm thời, được mở bởi hành động từ workspace hoặc
  inspector. Nó phải ghi rõ hai biến, sample bị loại và selection linkage.

## 8. Kiến trúc state và kiểm thử

- `field` là source of truth cho lens, geometry, renderer và legend; selection độc lập.
- Registry phải khai lens, default/fallback, visual contract status và geometry; không suy
  lens/default từ thứ tự hoặc `group` cũ.
- Hash chỉ serialise map-valid field và selection hợp lệ; link tái lập được map + inspector
  meaningfully.
- Mọi thay đổi layout phải có test cho: lens default/fallback, unavailable data, deep link,
  selection/object transition, null rendering, inspector action và responsive drawer state.
- Trước khi ship: typecheck, test, build và review ảnh ở overview/mid/inspection zoom cho
  từng lens. Review xác nhận map–legend–inspector cùng nói một measure.

Một trải nghiệm hoàn thành khi người xem trả lời được: **Tôi đang hỏi gì? Bản đồ này đo gì
trên geometry nào? Tôi có thể tin đến đâu? Cần kiểm tra gì tiếp theo?**
