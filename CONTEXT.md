# Từ vựng của dự án

Danh sách này chốt NGHĨA của những từ dễ trượt. Nó không mô tả code; nó nói mỗi từ trỏ vào
cái gì, để hai người (hoặc một người và một tác nhân) không dùng cùng một từ cho hai thứ.

Quyết định phương pháp ở [`DECISIONS.md`](DECISIONS.md); quyết định kiến trúc ở
[`docs/adr/`](docs/adr/).

---

## Đơn vị không gian

**Ô** — một ô lưới H3 độ phân giải 8, ~0,74 km². Khoá `h3_r8`. Đơn vị đọc mặc định.

**Ô gộp** — ô H3 r6, ~36 km². Chỉ tồn tại ở màn hình CẢ NƯỚC. Nó chở **số đo và phép chia
của hai số đo**, không chở lớp tính toán nào.

**Xã** — đơn vị hành chính cấp hai (phường / xã / đặc khu), khoá `commune_code` 5 ký tự.
`commune_code[:2]` **KHÔNG** bằng `province_code` — đo được 0,0% khớp trên 3.321 dòng.

**Tỉnh** — đơn vị cấp một, khoá `province_code` 2 ký tự. 34 tỉnh, niên bản VNSDI hiệu lực
16/6/2025. Cấu trúc 63 tỉnh cũ chỉ còn sống ở khoá phân mảnh của nguồn di sản.

**Ranh giới** (`boundary`) — đa giác hành chính CHÍNH THỨC. Phạm vi **BÁO CÁO**.

**Vành đệm** (`buffer`) — ranh giới nới 5 km. Phạm vi **THU THẬP**. Không đối tượng nào
trong vành đệm được báo cáo như thuộc tỉnh.

**scope** — `IN` (trong ranh giới) hoặc `BUFFER` (trong vành đệm, ngoài ranh giới). Vành đệm
hai tỉnh kề nhau **chồng lên nhau**, nên cộng dồn toàn quốc **phải lọc `IN`**.

---

## Cung

**Trạm** — trạm sạc **CÔNG CỘNG**. Trạm có đúng một súng và súng đó là AC (ổ cắm lắp tại
nhà) **không tồn tại** trong bộ dữ liệu. Tỉ lệ bị loại khác nhau theo tỉnh: 48,6% (Gia Lai)
→ 78,7% (Bắc Ninh) theo số trạm. **Không hằng số toàn quốc nào** cho con số này.

**Cổng** (`n_ports`) — số súng sạc. Khác **trạm**: một trạm có 1–30 cổng.

**Mức sử dụng** (`util`) — tỉ lệ cổng-giờ bận, đo từ telemetry 30 ngày. Ô không có trạm đo
được là `null`, **không phải 0**.

**Lớp tham chiếu** (`util_pctl_peer`) — `"<province_code>|<current_type>"`. Phân vị chỉ có
nghĩa trong lớp tham chiếu người đọc đang nhìn.

---

## Khoảng cách

**Khoảng cách mạng** (`dist_station_network_m`) — Dijkstra đa nguồn trên đồ thị đường OSM
thật, tôn trọng đường một chiều. Đơn vị **MÉT**. Bộ dữ liệu **không phát trường thời gian
lái nào** — đó là quyết định, không phải thiếu sót.

**Khoảng cách chim bay** (`dist_station_euclid_m`) — **khái niệm riêng**, không phải bản dự
phòng. Dùng cho câu hỏi về **bố trí**. **Không được dùng để kết luận độ phủ**: ở bán kính
3 km nó báo phủ nhầm 1.004/3.864 ô, và sai chỉ lệch về một phía.

**Hệ số đi vòng** (`detour_ratio`) — mạng chia chim bay. Trung vị Hà Nội 1,47.

---

## Sàng lọc

**Engine sàng lọc** — bài toán **KHÔNG** phải "gợi ý chỗ đặt trạm". Một đơn nộp tại một toạ
độ đi qua engine, engine trả ĐỀ XUẤT hoặc TỪ CHỐI, cấp trên ký cuối.

**`screen_decision`** — **đầu ra của một RULE**, không phải một số đo. Đừng đọc nó như đọc
`population`. `null` nghĩa là "không tính được khoảng cách", **khác** `TU_CHOI`.

---

## Kiến trúc

Từ vựng dưới đây dùng đúng nghĩa của kỹ năng `codebase-design`, không thay bằng "component",
"service", "API" hay "boundary".

**module** — thứ có interface và implementation. **interface** — mọi điều người gọi phải
biết để dùng đúng: chữ ký, bất biến, ràng buộc thứ tự, chế độ lỗi. **seam** — chỗ đổi được
hành vi mà không phải sửa tại chỗ đó. **deep** — nhiều hành vi sau một interface nhỏ.
**leverage** — cái người gọi được. **locality** — cái người bảo trì được.

**Dataset** — một bảng có **TÊN**, không phải một đường dẫn. Đường dẫn suy ra từ `tier` và
tỉnh đang chạy.

**tier** — `source` (chỉ đọc, ngoài store) · `product` (sản phẩm, ship) · `interim` (bảng
trung gian) · `cache` (dựng lại được, không ship, không backup) · `qa` · `web`.

**Step** — một bước ETL. Khai `reads`/`writes` bằng **tên dataset**. Thứ tự chạy, vân tay
resume, và phép kiểm "thượng nguồn đã có chưa" đều **suy ra** từ đó.

**vân tay** (fingerprint) — `version` của bước + `(kích thước, mtime)` của mọi dataset nó
đọc. Đổi nguồn hoặc đổi logic ⇒ kết quả cũ hết hạn.

**golden** — vân tay bất biến-theo-thứ-tự của mọi bảng sản phẩm. Cổng chặn của mọi đợt
refactor: đổi cấu trúc mã thì được, đổi kết quả thì phải là quyết định có người ký.

---

## Ba từ KHÔNG dùng

**"buildable"** — trường đã bị bỏ. Quét ngưỡng cho thấy hàm trơn, không có vai; ngưỡng đang
dùng loại nhầm 3,3% trạm đang vận hành thật. Đừng khôi phục. `DECISIONS.md` §7.

**"drive time" / "phút"** — bộ dữ liệu chỉ phát MÉT. Bỏ hẳn tag `maxspeed` thì Spearman vẫn
0,9991 ⇒ trường thời gian là 100% giả định. `DECISIONS.md` §6.

**"urban/rural"** — dùng `commune_kind` (`PHUONG` · `XA` · `DAC_KHU`). BA nhánh, không phải
hai: 13 đặc khu, và ở engine sàng lọc nhãn ấy CHỌN NGƯỠNG CHÍNH SÁCH.
