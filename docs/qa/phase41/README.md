# Chứng cứ render Phase 4.1 — CR biểu đồ theo hợp đồng encoding (20/8/2026)

Chụp bằng Chromium headless (`--use-angle=swiftshader --enable-unsafe-swiftshader`,
cửa sổ 1680×1050, `devicePixelRatio = 1`) trên bản build production (`npm run build` +
`vite preview`), qua CDP. Một phiên duy nhất; state đổi bằng `location.hash` NGAY TRONG
PHIÊN, nên các cặp ảnh là bằng chứng update-trigger chứ không phải hai lần nạp trang.

Số đo lấy từ **pixel của ảnh render** (PNG giải mã bằng `zlib`, ΔE Oklab ×100 — cùng công
thức với `oklabDeltaE` trong `viz/palette.ts`), không lấy từ việc gọi lại hàm màu.

| Ảnh | Trạng thái (hash) | Làm chứng cho |
|---|---|---|
| `w1-utilization-gradient.png` | `#f=station:occ&sc=g` | tiêu chí 9 (gradient) và 12 |
| `w2-utilization-binned.png` | đổi `sc=binned` trong phiên | tiêu chí 9 (bậc) |
| `w3-legend-hour-0.png` / `w3-legend-hour-100.png` | `t=0` → `t=100` trong phiên | hồi quy QA 4.1-001 |
| `w4-station-panel-hatch-gradient.png` | chọn trạm qua ô tìm kiếm, `sc=g` | tiêu chí 10 |
| `w5-story-*.png` | `#s=nhip-tuan` · `cung-lech` · `di-vong` | tiêu chí 11 |
| `w6-classing-note.png` | mở khối “Đơn vị và cách chia bậc” | hồi quy QA 4.1-001 (đơn vị tập chia bậc) |
| `w7-demand-hex.png` / `w7-demand-density.png` | `#f=population`, bấm ĐỒNG MỨC trong phiên | hồi quy QA 4.1-006 |
| `w8-lens-*.png` + `lens-ink-sweep.json` | 5 lens, đổi `f` trong phiên | §C2 blast radius |
| `witness-report.json` | — | toàn bộ số đo |

## Kết quả

- **Tiêu chí 9 — cùng giá trị, cùng màu (gradient): ĐẠT.** Đo **cả 168 ô**, không ô nào bị
  cuộn khuất. ΔE lớn nhất **0,636**; p95 0,503; trung vị 0,307; **0 ô vượt sàn 1,0**. Miền
  thang là `[0, 1]` tuyến tính không cắt trần (mốc legend in `0 … 100 %`), nên
  `position(v) = v` — dải legend được lấy mẫu tại đúng hoành độ ấy.
- **Tiêu chí 9 — chế độ bậc: ĐẠT.** 3 màu ô của heatmap, cả 3 đều có mặt trong tập 13 màu
  swatch của legend (ΔE < 0,5). Không có đường màu thứ hai.
- **Tiêu chí 10 — vân phân biệt được: ĐẠT.** Trạm “Tòa HPC Landmark 105” (1 ô vân, 167 ô
  tô). Vân **hợp thành** (trung bình pixel của ô, không phải `HATCH_HEX`)
  `rgb(235,5 235,5 232,8)` vs ô gradient **nhạt nhất được vẽ** `rgb(213,6 160,7 221,8)`:
  **ΔE 19,45** ≥ sàn §4b = 6. Đây là phép đo còn nợ từ tc12 của CR 2.1, nay đo ở chế độ
  gradient.
  *Không áp dụng nửa “theme tối”*: `index.css` không có `prefers-color-scheme` và không có
  biến thể tối cho mặt panel; ba style **nền bản đồ** (`voyager`/`positron`/`dark`) chỉ đổi
  bản đồ, không đổi mặt cột đọc nơi heatmap sống.
- **Tiêu chí 11 — chứng nhân cảnh: ĐẠT.** Cả ba cảnh: heatmap có mặt nhưng **không ô nào
  mang màu giá trị** (đường `scale={null}`), và không cảnh nào mở `sc=g`.
- **Tiêu chí 12 — ghi lại, không phải cổng đậu/rớt.** 168 ô hợp thành nằm trong
  **11,0 %–36,2 %** của thang dùng chung `[0, 1]` — khớp con số “11–36 %” mà spec khai. Đây
  là thuộc tính của quyết định thang-dùng-chung đã đóng băng (§1.5), giảm nhẹ bằng
  `HourProfile`; CR này không được biến nó thành cổng.
- **Hồi quy QA 4.1-001 — legend đếm theo giờ: ĐẠT.** Swatch chấm rỗng đọc **(35 trạm)** ở
  `t=0` và **(71 trạm)** ở `t=100` — đổi theo giờ, đúng bất biến ở `viz/occ.ts:105–109`.
  Câu chia bậc đọc **“7 bậc · bậc đầu là 0 riêng (17.483 trạm-giờ) · còn lại chia đều theo
  số trạm-giờ”** — gọi đúng tên tập chia bậc. Badge phủ cả tuần (690/710 trạm) đứng cạnh mà
  không lẫn với số theo giờ: đúng hai câu hỏi khác nhau. Khối GIỚI HẠN đọc **“35/710 trạm
  không có giá trị”**, cùng một tập với swatch ngay trên nó — trước khi vá, hai dòng cách
  nhau ba centimet nói ngược nhau (“không trạm nào khuyết” bên dưới “35 trạm”).
- **Hồi quy QA 4.1-006 — mực đi theo representation đang bật: ĐẠT.** Cùng một phiên, lens
  Cầu: cột histogram `#b74817` (theme `exploration`) ở cách đọc `hex`, đổi sang `#e5521c`
  (theme `demand`) ngay khi bấm ĐỒNG MỨC — cùng câu trả lời với `ThemeReadout` trong cùng
  cột, thay vì ghim `"hex"` như bản trước.

- **§C2 blast radius — cả 5 lens sơn đúng mực registry: ĐẠT.** Đo mực THẬT trong cột đọc:
  Cầu `#b74817` (exploration) · Cung `#1f8376` (supply) · Tiếp cận `#2e63b8` (accessibility)
  · Sử dụng `#9c45ab` (utilization) · Cơ hội `#c77a07` (screening). Không lens nào mất mực.

## Ba bẫy đã sập trong lúc dựng harness (ghi lại để lần sau khỏi mất buổi)

1. **Cột đọc CUỘN được** (`clientHeight 699` / `scrollHeight 1128`): nửa dưới heatmap nằm
   ngoài khung, và đo pixel ở đó cho ra **màu nền** chứ không phải màu ô — trông y hệt một
   lỗi mã hoá. Harness nay cuộn vào giữa rồi dùng `elementFromPoint` làm cổng kiểm hiển thị,
   chứ không tin `getBoundingClientRect`. Cùng họ với bẫy đã ghi ở M-đồng-mức.
2. **Lưới nút bấm ≠ lưới rect của Plot**: nút phủ dùng `cellX = M.left + hour/24 × PLOT_W`,
   còn Plot dùng band scale có padding — hai lưới lệch dần tới ~10 px ở cột 23, tức hơn nửa
   ô. Ghép ô với giá trị phải theo **CHỈ SỐ dữ liệu** (cả hai đều render theo thứ tự `cells`),
   không theo toạ độ. Ghép theo toạ độ cho ra “ô 36,2 % màu trắng”.
3. **Bảng kỳ vọng của phép đo cũng phải truy về registry.** Lần quét lens đầu tiên gõ tay
   `#33903c` cho `screening` và báo lens Cơ hội **0 hit** — nghe y hệt một lỗi mã. Sự thật:
   `screening` là **hổ phách `#c77a07`**, còn `#33903c` là `urban-context`. Số mong đợi phải
   in ra từ `seriesColorForTheme`, không gõ lại — đúng cùng một luật mà §C2 áp cho mã.

## Chưa đo được ở đợt này (khai, không giấu)

- **Tiêu chí 4 (identity `===`)**: không có harness DOM để render `App` và so hai prop bằng
  `===`. Bộ test chốt bằng cấu trúc (đúng MỘT chỗ gọi `applyScaleMode(occClassing…)`, nhánh
  `station:occ` trả thẳng `utilizationScale`) cộng một phép đo chứng minh mối nguy là thật
  (`applyScaleMode` trả object mới khi đổi chế độ). Xem `test/phase41-chart-encoding.test.ts`.
- **Đếm recompute deck.gl / FPS scrubber**: chưa có counter — như đã khai ở phase21.
