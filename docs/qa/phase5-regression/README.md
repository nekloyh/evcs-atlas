# Chứng cứ render — vá CO-1 · CO-2 (đợt hồi quy Phase 5, 20/8/2026)

Hai lỗi TỒN ĐỌNG phát hiện trong đợt re-QA Phase 5 sau các CR 2.1 · 4.1 · 4.2. Không lỗi
nào do các CR gây ra (đợt QA đối chiếu `fff9d49` xác nhận cả hai có từ trước), nên chúng
không đổi phán quyết **PHASE 5 REGRESSION PASS**; chúng được vá riêng.

Chụp bằng Chromium 151 headless (`--use-angle=swiftshader --enable-unsafe-swiftshader`,
cửa sổ 1680×1050, `devicePixelRatio = 1`) trên bản build production (`vite build` +
`vite preview`), qua CDP. Số đo lấy từ pixel của ảnh PNG giải mã bằng `zlib`, ΔE Oklab ×100
— cùng công thức với `oklabDeltaE` trong `viz/palette.ts`. Vùng đo là khung canvas đã cắt
bỏ dải phải nơi thẻ Bằng chứng sống (832.032 pixel).

## CO-1 — ký hiệu ĐANG CHỌN bị khối 3D nuốt

`map/MapView.tsx`. Cả năm hình học vẽ nét chọn ở cao độ 0 trong khi lớp dữ liệu đùn khối,
nên khối của chính đối tượng được chọn che luôn nét đánh dấu nó — ở đúng mức phóng mà điều
hướng của Phase 5 bay tới (ô 13,5 · trạm 14,5, pitch 50).

**Phép đo: số pixel đổi giữa hai lượt render bật/tắt lựa chọn, cùng khung nhìn.**

| Trường hợp | Trước vá | Sau vá |
|---|---:|---:|
| Ô · 3D · bậc | **0** | **1.432** |
| Ô · 3D · gradient | **0** ¹ | **1.432** |
| Ô · 2D · gradient (đối chứng) | 2.130 | 2.124 |

¹ lượt đo đầu cho 3.209 vì ảnh chụp rơi vào lúc camera còn EASE tới khung nhìn mới — mọi
cạnh lục giác dịch một pixel. Harness nay HÂM khung nhìn 7 s trước khi mở cặp đo; đo lại
cho 0. Ghi lại vì đây là cái bẫy đắt nhất của buổi: một nét rộng 1,5 px chìm nghỉm trong
21 % pixel "đổi" nếu camera chưa đứng yên.

Trạm không đo được bằng phép diff toàn khung: bấm chọn một trạm làm bố cục dịch cả lưới
(159.119 pixel đổi, giống hệt nhau ở 2D lẫn 3D, và **y hệt nhau trước/sau vá**). Bằng chứng
của trạm là ảnh: `w1-station-3d-pre.png` không có nét nào; `w2-station-3d-post.png` có vòng
chọn đọc rõ trên mặt khối.

**Cách vá.** Một hằng dùng chung `SELECT_PARAMS_3D = { depthCompare: "always",
depthWriteEnabled: false }` áp cho cả năm hình học trong 3D — "đang chọn" là một TRẠNG THÁI
giao diện, và một trạng thái không đọc được thì bằng không có; dữ liệu vẫn che dữ liệu.
Từ vựng là của deck.gl 9 / luma.gl 9: `depthTest: false` của đời trước không nổ, nó bị bỏ
qua — đúng kiểu hỏng im lặng, nên có một test cấm chữ đó quay lại.

Riêng **Ô** — hình học duy nhất tự nó đùn lên — nét chọn còn LEO LÊN mặt trên khối của
chính nó, qua `elevationFor(row.value, scale, MAX_ELEV_R8_M)`, tức đúng hàm và đúng miền mà
`getElevation` của lớp giá trị dùng (CR 2.1 §4: một miền, hai kênh). Vẽ ở chân khối thì
trong khung nghiêng nét nằm lệch hẳn khỏi mặt đang sáng và người xem đọc ra một ô KHÁC đang
được chọn — tệ hơn cả không vẽ gì. Xem `w3-cell-3d-post.png`.

2D không đổi một byte hành vi nào: `selectParams` là object rỗng ở đó. Chênh 6 pixel của
dòng đối chứng là khử răng cưa giữa nét của `H3HexagonLayer` và nét của `PathLayer` —
đổi lớp là bắt buộc, `H3HexagonLayer` không nhận toạ độ có cao độ và `stroked` của nó chỉ
có tác dụng khi `extruded: false`.

## CO-2 — hash khẳng định `sc=g` trong lúc bản đồ vẽ BẬC

`App.tsx`. `store.scaleMode` là SỞ THÍCH của người dùng và nó phải sống sót qua một trường
không gradient được. Nhưng hash là "một link mở ra đúng bức tranh ấy" (CR 2.1 §2), nên nó
phải ghi chế độ ĐÃ CHỐT — `scale.mode`, kết quả của `applyScaleMode` dưới hợp đồng của
trường đang mở cộng cổng `gradientAvailability`.

| Bước | `f` | `sc` trước vá | `sc` sau vá | nút Gradient |
|---|---|---|---|---|
| boot | `population` | — | — | bật được |
| bật Gradient | `population` | `g` | `g` | bật được |
| sang lens CUNG | `station:ports` | **`g`** ← nói dối | **—** | **mờ, có lý do** |
| quay lại lens CẦU | `population` | `g` | **`g`** ← sở thích còn nguyên | bật được |

Thang chưa dựng xong thì giữ nguyên chế độ được yêu cầu: nếu không, mỗi lần đổi trường hash
sẽ rụng `sc` rồi mọc lại, đẩy thêm một mục lịch sử cho một khoảnh khắc không ai nhìn thấy.

## Phase 5 sau khi vá

Preset · tìm kiếm · FlyTo · độc lập trạng thái đo lại trên bản đã vá, không mục nào đổi:
biên `demand-top-decile` vẫn `4450.090733270904..46232.44099893726`; tìm "ba dinh" → bay từ
zoom 9,4 tới 14,6 và chọn `commune:00004` trong lúc preset đang bật; bỏ preset không đụng
`sc`, `c` hay khung nhìn. `node --test`: **804/804 đạt** (5 test mới ở
`web/test/selection-3d.test.ts`).
