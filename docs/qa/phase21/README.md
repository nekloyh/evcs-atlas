# Chứng cứ render Phase 2.1 — đợt vá QA 20/8/2026

Chụp bằng Chromium 151 headless (`--use-angle=swiftshader --enable-unsafe-swiftshader`,
cửa sổ 1680×1050) trên bản build production (`pnpm build` + `vite preview`), qua CDP.
Harness: một phiên duy nhất cho w2→w5→w3→w6 (đổi state bằng `location.hash` NGAY TRONG
phiên — không reload), nên các cặp ảnh là bằng chứng update-trigger chứ không phải hai
lần nạp trang.

| Ảnh | Trạng thái (hash) | Làm chứng cho |
|---|---|---|
| `w2-province-3d-binned.png` | `#m=3d&f=population` | tiêu chí 9/11 (một phần): 3D bậc + dòng khai chiều cao "cùng trường · thang căn bậc hai · trần p99" + dòng `▲ 44 ô vượt trần cao độ` |
| `w5-province-3d-field-switched.png` | đổi hash trong phiên → `f=dist_station_network_m` | tiêu chí 13 (một phần): đổi trường trong phiên, bản đồ vẽ lại — 17,1 % pixel vùng bản đồ đổi (L1 > 8) |
| `w3-province-3d-gradient.png` | thêm `&sc=g` trong phiên | tiêu chí 11: legend gradient in `≥ 9 km` (không in `max`) + `▲ 44 ô vượt trần · lớn nhất 21,2` + chip vân `không đo được (3 ô)` NGOÀI dải; toggle trong phiên đổi 14,0 % pixel vùng bản đồ |
| `w6-province-2d-gradient.png` | `#f=dist_station_network_m&sc=g` | đầu nhạt gradient trên nền bản đồ (anchor tái neo ≥ 2,0:1) |
| `w7-national-3d.png` | `#tinh=vn&m=3d&f=c:population` | QA 2.1-002: legend toàn quốc in "liên tục theo thang căn bậc hai · trần p99 · 99 ô vượt trần cao bằng trần · ô không đo được giữ phẳng" — không còn "{n} bậc (mã hoá trùng)" |
| `witness-report.json` | — | các phép kiểm text DOM (9/9 true) |

## Chưa đo được ở đợt này (khai, không giấu)

- **Tiêu chí 9 định lượng** (L1 mặt trên lit-vs-unlit < ½ khoảng cách bậc, đo từng pixel
  mặt trên): cần rig phân vùng mặt trên như bộ M-national; ảnh ở đây chỉ là chứng cứ
  định tính (khối đặc, không lộ nền xuyên mặt).
- **Tiêu chí 10** (khối cao nhất ≈ 1–1,5 lần bề ngang ô r8 ở pitch 50°): `MAX_ELEV_R8_M
  = 1.800` vẫn là giá trị tạm theo đúng câu chữ của spec §4 ("finalized by the render
  gate, not by this document").
- **Tiêu chí 12 định lượng** (ΔE hợp thành vân null vs bậc gradient nhạt nhất trên ảnh
  render): mới có chứng cứ định tính ở w3/w6.
- **Tiêu chí 14** (story pixel-identical pre/post): không có bộ ảnh baseline pre-CR để
  so; bất biến được giữ bằng scene pin `sc` binned + toàn bộ test story xanh.
- **Tiêu chí 15** (đếm recompute deck.gl + FPS scrubber): chưa có counter/harness.
