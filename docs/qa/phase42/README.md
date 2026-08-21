# Chứng cứ render CR 4.2 — scatter bằng chứng Cầu × Tiếp cận (20/8/2026)

Chụp bằng Chromium headless 151 (`--use-angle=swiftshader --enable-unsafe-swiftshader`,
cửa sổ 1680×1050, `devicePixelRatio = 1`) trên **dev server** (`vite`, không phải bản
`preview` như phase41), qua CDP. Gói `p/01`, lens Cơ hội (`#f=screen_margin_m`).

| Ảnh | Trạng thái | Làm chứng cho |
|---|---|---|
| `w1-evidence-open-p01.png` | `#f=screen_margin_m`, bấm mở khối BẰNG CHỨNG trong phiên | AT-21, AT-16, AT-26 (một phần) |

## Đo được

- **AT-21 mặc định ĐÓNG: ĐẠT.** Lens Cơ hội mở ra với `details.open === false`, bảng xếp
  hạng xã ở khe chính, và **0 node mark** trong DOM khi còn đóng.
- **AT-12 trần DOM: ĐẠT (đo trên dữ liệu thật).** Mở ra: đúng **6 node `<path>`**, một cho
  mỗi bậc chồng, với `fill-opacity` `0,45 · 0,6975 · 0,833625 · 0,90849375 · 0,9496715625 ·
  0,972319359375` — khớp từng chữ số với `1 − 0,55^k`.
- **AT-25 mực registry: ĐẠT.** Cả 6 path đều `fill="#c77a07"` — đúng giá trị `screening` mà
  `docs/qa/phase41/lens-ink-sweep.json` ghi cho lens Cơ hội. Không đường màu thứ hai.
- **§C dòng đếm — khớp NGUYÊN VĂN bảng kỳ vọng của CR trên `p/01`:**
  `4.397 ô đang vẽ · 135 ô không người (khe =0)` và
  `3 ô chưa rõ cự ly mạng đường — nơi 9.571 người (0,11% dân đã biết) sinh sống…`
  (CR khai `4.397` / `135` / `3 ô` / `9.571 người` / `0,11%`.)
- **AT-16 nhãn X là giá trị THẬT: ĐẠT.** Trục in `=0 · 1 · 10 · 100 · 1k · 10k` + nhãn mép
  `46,2k`. Không giá trị `log1p` nào tới màn hình.
- **AT-15 đơn vị Y từ registry: ĐẠT.** Vạch `0 · 1 · 5 · 12 · 21`, câu đơn vị
  `↑ cự ly tới trạm · km, theo mạng đường` — một thang chung, một số chữ số chung.
- **AT-26 dải readout giữ chiều cao: ĐẠT.** `h-4` đo được **16 px** ở mọi vị trí thử, kể cả
  chuỗi dài nhất. Khối GIỚI HẠN ngay dưới không bị cắt khi mở.
- **AT-19 chỉ đọc dưới bàn phím: ĐẠT.** Sau một lượt `ArrowRight ×2 · ArrowUp`, `location.hash`
  không đổi (`#m=2d&f=screen_margin_m&v=…`). Vùng `aria-live` phản chiếu đúng dòng readout.
- **Vị trí đường 2 km: 30,74% chiều cao khung** — nằm đúng trong dải `17,9%–30,7%` mà CR khai
  cho cặp `log1p × sqrt`, và `p/01` là đầu trên của dải ấy.

## Ghi lại, KHÔNG phải cổng đậu/rớt (AT-28)

| Gói | ô lưới có mark (đo từ số đoạn `M` của 6 path) | CR khai |
|---|---:|---:|
| `p/01` | **1.747** | 1.773 |

Lệch 26 ô (1,5%). CR không nói quy ước làm tròn mép nào nó dùng, nên đây là một **số đo được
ghi lại**, không phải một ngưỡng bị vượt. Số ô lưới theo bậc: `759 · 361 · 204 · 150 · 108 ·
165`, tức 165 ô lưới đang ở bậc bão hoà (≥ 6 ô H3).

## KHÔNG chạy ở đợt này

AT-22 (độ trung thực của phép gộp lưới, ΔE ≤ 1,0 so với bản vẽ 4.397 mark rời), AT-23
(ΔE của mark lẻ), AT-24 (ΔE của đường 2 km với hai cực mark), AT-27 (chứng nhân cảnh).
Chúng cần bộ giải PNG + ΔE Oklab của harness phase41; **không con số ΔE nào trong CR được
tái đo ở đây.**
