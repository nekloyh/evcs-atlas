# Chứng cứ Phase 10 — hiệu năng, phục hồi, bàn phím

Spec: `docs/PHASE10_PERFORMANCE_RELEASE.md`. Bản đo hiệu năng: `baseline.md`.
Kết quả máy đọc: `witness-report.json`.

```
uv run python docs/qa/phase10/run_witness.py
```

Harness **tự dựng** Vite ở `127.0.0.1:5174` rồi tự dọn — khác Phase 9, nơi witness đòi một
`pnpm dev` mở sẵn ở cửa sổ khác. Đổi vì finding 10-QA-003 đòi bằng chứng tái lập được sau
một lần checkout sạch, và "nhớ mở server trước" là đúng cái bước con người quên.
`EVCS_APP=<url>` để trỏ vào một server có sẵn.

| Witness | Acceptance |
|---|---|
| — (chỉ số) | AT10-1: tiêm một exception RENDER thật vào một cây React thật; boundary trả về `role="alert"` mang nguyên văn `error.message` |
| — (chỉ số) | AT10-1b: chặn module `/src/App.tsx` ⇒ `boot()` ngã ⇒ thông điệp DOM trần hiện ra, không phải màn trắng |
| `at10-2-pending.png` · `at10-2-settled.png` | AT10-2: `4.400 dòng` → gõ "vinfast" → `đang lọc…` + 6 nút Xuất khoá → `0 / 4.400 dòng khớp bộ lọc` + mở lại. Và bấm sắp xếp: số **vẫn còn** (đổi cột không làm `total` sai, nên không được bật trạng thái chờ) |
| — (chỉ số) | AT10-3: `<th button>` focus được, Enter đổi `aria-sort` → `ascending` |
| `at10-4-national-3d.png` | AT10-4: dưới `prefers-reduced-motion: reduce` app gọi `jumpTo({pitch:50})`; mặc định gọi `easeTo({pitch:50})` |
| `at10-6-scrubber-end.png` | AT10-6: track focus được, 11 → 14 sau 3×→, Home → `T2 00:00`, ← từ Home quay vòng về `CN 23:00` (167), End → 167 |
| — (chỉ số) | AT10-9: `main[aria-label="Không gian bản đồ chính"]` tồn tại, `tabIndex=-1`, nhận được focus |
| `at10-10-{route}-w{760,900,1024,1280,1600}.png` | AT10-10: `scrollWidth == viewport` và 0 phần tử tràn ở cả năm bề rộng |

## Hai phép đo đã bị chính số đo BÁC, và cái thay chúng

**AT10-4 không đếm khung hình.** Bản đầu đo số lần `requestAnimationFrame` trong 700 ms sau
cú bấm 3D, giả định `easeTo(500 ms)` sẽ quay nhiều khung hơn `jumpTo`. Dưới SwiftShader
headless số đo là **reduced 7 · normal 2** — ngược dấu, vì `easeTo` chỉ kịp 2 khung còn
nhiễu nền là 7. Phép đo hiện tại ghi thẳng **lời gọi nào được phát**, bằng cách vá
prototype của `maplibre-gl` từ ngoài (`web/test/witness-probe.tsx`). Không có cửa hậu nào
được mở trong `src/`.

**AT10-1 không chạy trong `node --test`.** `getDerivedStateFromError` là hàm tĩnh và kiểm
được bằng grep, nhưng "boundary có thật sự vẽ ra thông điệp không" thì cần một cây React.
`node --test` bóc kiểu cho `.ts` mà không dịch JSX của `.tsx`, nên phép tiêm lỗi thật chỉ
sống được ở đây.

## Bẫy harness đã ghi lại

- **`Page.navigate` tới một URL chỉ khác phần `#` KHÔNG tải lại trang.** `#tinh` được đọc
  một lần lúc nạp module (`data/province.ts`), nên thiếu reload là mọi phép đo sau đó đo
  nhầm màn hình. `goto()` ghé `about:blank` trước để ép một document mới. (`Page.reload`
  ngay sau `Page.navigate` thì đua với chính lượt navigate và trả *"Not attached to an
  active page"*.)
- **`Input.dispatchKeyEvent` cần `text` để kích hoạt `<button>`.** Không có nó, Enter là
  một keyDown "thô" và AT10-3 báo FAIL giả.
- **JS qua `Runtime.evaluate` là JS trần**: `import("react-dom/client")` ném *"Failed to
  resolve module specifier"*. Chỉ module đi qua bộ biến đổi của Vite mới giải được
  specifier trần — nên dụng cụ đo là một file ở `web/test/`, không phải một chuỗi.
- **Trang có nhiều `[role=slider]`.** Phải nhắm `aria-label="Giờ trong tuần"`; cái kia là
  thanh giờ trong ngày (max 23) và sẽ cho một bộ số trông rất hợp lý mà sai màn hình.

## Không đo ở đây

FPS, long task và heap. Witness chạy SwiftShader; số render của nó vô nghĩa (baseline ghi
lại chính lần đo hỏng ấy: 9 FPS pan / 110 ms mỗi khung — artifact của harness). Ngưỡng hiệu
năng và giao thức đo tay nằm ở `PHASE10_PERFORMANCE_RELEASE.md §3`.
