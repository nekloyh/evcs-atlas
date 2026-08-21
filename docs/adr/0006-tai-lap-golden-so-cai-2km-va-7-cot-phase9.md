# ADR-0006 — Tái lập golden cho sổ cái 2 km và 7 cột mới của Phase 9

**Ngày** 2026-08-21 · **Trạng thái** chấp nhận · **Đóng** finding 10-QA-002

## Bối cảnh

`make kiem` fail ở cổng `golden` với **12 sai khác** trên đúng một bảng, `qa/provinces
.parquet`. QA Phase 10 xếp nó là BLOCKER và đòi trả lời một câu duy nhất trước khi làm gì
khác: **output nào đúng — bản đang có trên đĩa, hay bản đã ký trong `golden/baseline.json`?**

Sai khác không đến từ Phase 10 (phase này không chạm một dòng Python nào — xem diff). Nó
là dấu vết của Phase 9, và ADR-0001 nói rõ đường xử lý: "đổi kết quả thì phải là một quyết
định có người ký". Tài liệu này là chữ ký ấy.

## Sai khác, và nó tương ứng với điều gì trong `PHASE9_NATIONAL_OVERVIEW.md`

| Sai khác | Điều khoản Phase 9 |
|---|---|
| `n_cols` 47 → 54 | §1.2 + §2.2 + §2.3 |
| Thêm `n_ports_missing` · `power_missing` · `share_power_missing` | §1.2 — chip công bố "chặn dưới" cho tỉnh có tỉ lệ nameplate null > 10% |
| Thêm `urban_km2` · `power_kw_per_urban_km2` | §2.2 (item N5) — mẫu số đô thị dựng trong pipeline, công thức `area_eff` |
| Thêm `population_within_2km` · `population_access_within_2km` | §2.3 phương án (a) — dùng lại hằng `BEYOND_2KM_M` đã đăng ký |
| `pop_beyond_2km_network` và `share_pop_beyond_2km` đổi giá trị | §1.4 **D2** — vá sổ cái, không phải diễn giải lại |

## Bằng chứng: sai khác đúng bằng phần dân bị D2 xếp nhầm

D2: `n10` cũ tính `pop_beyond_2km_network` bằng `dist > 2000` trên một cột mà **không tới
được = NaN**. Mọi phép so với NaN cho `False`, nên dân không tới được bằng đường bộ rơi vào
phía **"trong 2 km"** — đúng phía sai nhất có thể. Định nghĩa mới là
`¬network_reachable ∨ dist > 2000`.

Đo lại trên 34 gói `store/p/<mã>/grid_h3_r8.parquet`:

```
beyond CŨ  (dist > 2000 trên cột có NaN)   65.974.551
beyond MỚI (¬reachable ∨ dist > 2000)      67.332.881
chênh                                       1.358.330
```

Sai khác của golden ở `sum` là **1.358.326** — lệch 4 người trên 34 tỉnh, đúng bằng sai số
làm tròn của `int()` từng tỉnh. Nghĩa là: **toàn bộ** thay đổi giá trị của hai cột này là
phần dân bị xếp nhầm, không lẫn một thay đổi nào khác.

Bốn phép kiểm sổ cái khác, chạy trên bảng đang có:

- `population_within_2km + pop_beyond_2km_network − population_grid`: lệch tối đa **1,9
  người** trên 34 tỉnh (hai lần `int()` ở hai phía). Sổ cái khớp.
- `share_pop_beyond_2km + population_access_within_2km = 1` — sai số **0,0** ở cả 34 dòng.
- `share_pop_unreachable`: cao nhất **0,1066** (p96), p04 **0,0863** — trùng khít con số
  §1.4 công bố (10,66 pp và 8,63 pp) cho mức hụt của cột cũ.
- `urban_km2`: sàn **30,08 km²** (p04), tổng toàn quốc **10.565 km²** — trùng khít §2.2.

Không cột nào trong 7 cột mới có null ở bất kỳ tỉnh nào (34/34 có lớp tính toán).

## Quyết định

**Bản trên đĩa đúng. Golden được ghi lại.** `uv run python -m golden.capture --ghi`, và
ADR này là phần "nói vì sao" mà ADR-0001 đòi.

Bản baseline cũ ghi lại một sổ cái **đã biết là hỏng**; giữ nó là bắt mọi lần chạy
`make kiem` sau này phải bỏ qua 12 dòng đỏ, và một cổng chặn mà người ta quen bỏ qua thì
đã chết rồi.

## Một chỗ spec nói không khớp số đo (ghi lại, không sửa dữ liệu)

§2.2 viết "KPI spans ~163 kW/km² (p04) → ~377 (p37, p01)". Mút trên đúng (p01 = 377,05).
Mút dưới **không phải** p04: p04 = 162,84 nhưng **cực tiểu thật là p96 = 71,42**. Đây là
lỗi diễn giải trong câu văn của spec, không phải lỗi dữ liệu — công thức, mẫu số và luật
null đều khớp. Ghi lại ở đây để lần sau không ai "sửa dữ liệu cho khớp tài liệu".

## Hệ quả

Rủi ro đã biết của ADR-0001 vẫn nguyên: golden chỉ phủ parquet. `provinces.json` — thứ
web thật sự đọc, và là nơi defect D1 (`_x`/`_y`) sống — **không** nằm trong vân tay. Việc
mở rộng `golden/capture.py` sang manifest/JSON đã xuất vẫn là nợ để ngỏ, không phải phần
của quyết định này.
