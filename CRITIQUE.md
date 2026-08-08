# Trạng thái các mũi phản biện

Bảng theo dõi 13 mũi tấn công dữ liệu (**A**) và 10 lớp bản đồ (**L**). Mỗi dòng là một
tuyên bố đã được **đo**, không phải một ý kiến.

Quy ước cột **Kết quả**:

| | |
|---|---|
| ✅ **KHÔNG HỎNG** | đo rồi, nghi ngờ bị bác |
| ⚠️ **CẢNH BÁO** | có vấn đề thật nhưng chấp nhận được, đã khai báo |
| ❌ **HỎNG** | đã sửa hoặc đã bỏ trường |
| 🔒 **CHẤP NHẬN** | chủ đầu tư chốt, không đo thêm |

Số đo đầy đủ ở `data/qa/critique/*.json`; quyết định ở `DECISIONS.md`.

---

## A — Mũi tấn công dữ liệu

| | Nghi ngờ | Kết quả | Số đo quyết định | Đã làm gì | Ghi ở |
|---|---|---|---|---|---|
| **A1** | Hai quy ước cắt biên trộn trong một bảng | ❌ | 3,87% chiều dài đường nằm ngoài ranh giới, dồn vào ô biên | Lưới lọc `area_frac ≥ 0,01`; thêm `road_len_in_hanoi_m`; 78,5 người ở ô vụn **khai báo** chứ không nuốt | §2a |
| **A2** | `drive_time_station_min` là giả định trá hình | ❌ | Bỏ hẳn tag `maxspeed` → Spearman vẫn **0,9991** ⇒ **100% giả định** | Bỏ trường; bộ dữ liệu chỉ phát **mét** | §6 sđ |
| **A3** | Tâm hình học ≠ tâm dân số | ⚠️ | Lệch trung vị **171,9 m** — **không đạt** tiêu chí 150 m tôi tự đặt | Giữ, có điều kiện; trọng số dân làm nó nhỏ đi (131 m) | §12 |
| **A4** | Đồ thị đường không phải "ô tô đi được" | ❌ | 49 ô + 2 trạm neo vào đỉnh `SCC = 1` (đầu cụt một chiều) | Neo vào **SCC lớn** (+49 ô, 886/886 trạm, **0 ô xáo trộn**); lọc `access` | §14 |
| **A5** | Nhãn chiều Dijkstra có thể sai | ✅ | Phép tính **độc lập** khớp tới **2,3 × 10⁻¹³ m** | Nhãn đúng. Thêm `dist_station_asym_m` (p90 152 m, max 16.293 m) | §14 |
| **A6** | Thiên lệch chọn mẫu ở trạm hiện hữu | 🔒 | — | Chủ đầu tư chốt giữ nguyên | — |
| **A7** | VinFast chiếm gần trọn thị phần | 🔒 | 704/710 trạm là `VINFAST_CS` | **Sự thật, không phải lỗi.** Kèm luật loại trạm 1 súng AC | §3a |
| **A8** | WorldPop dasymetric có đủ tốt không | ⚠️ | ρ = 0,90 với `built_frac` — **một phần tự khẳng định** vì bản `CN` dùng built-up làm biến phụ trợ | Chấp nhận (không có nguồn khác); vòng lặp được khai báo | §5 |
| **A9** | Thiếu dữ liệu khảo sát thực địa | 🔒 | — | Chấp nhận | §9 |
| **A10** | `buildable` là ngưỡng tuỳ tiện | ❌ | Hàm số-ô **trơn**, không có vai; ngưỡng 0,05 **loại nhầm 3,3% trạm đang chạy** | Bỏ trường; phát `*_frac` thô để người dùng tự chịu trách nhiệm ngưỡng | §7 sđ |
| **A11** | Ngưỡng urban/rural do tôi bịa | ✅ | **Tôi sai.** Nhãn là ánh xạ xác định từ loại đơn vị VNSDI — 19.426/19.426 khớp | Rút lại phán quyết; đổi tên `commune_kind` (PHUONG/XA), dựng lại từ nguồn + kiểm 100% | §11 |
| **A12** | `dist_substation_m` là lớp thưa giả tạo | ❌ | 133 trạm biến áp / 3.360 km²; **một** trạm làm láng giềng gần nhất cho **236 ô** | Bỏ trường + bỏ cả lượt trích `power=substation` | §8 sđ |
| **A13** | Khoảng cách nhảy giữa hai ô kề | ✅ | Nhảy trung vị **735 m** ≈ đúng khoảng cách tâm hai ô (0,8 km) ⇒ **không phải triệu chứng** | **Ngưỡng của tôi bị bác.** Thành chỉ số, không thành cổng PASS/FAIL | §14 |

**Hai lần tôi tự bác chính mình, ghi lại vì chúng đáng đọc hơn phần còn lại:**

- **A11** — tôi kết luận `urban_rural` HỎNG vì tưởng ngưỡng do mình đặt. Audit cho thấy đó là
  nhãn **hành chính chính thức**. Phán quyết đã rút.
- **A13** — tôi đặt cổng *"dưới 1% cặp ô kề được nhảy quá 2 km"*, nó FAIL ở 6,7%, rồi đo ra
  rằng **cả hai con số đều do tôi bịa**. Đúng lỗi mà §7 đã kết án ở `buildable`.

---

## L — Lớp bản đồ

| | Lớp | Trạng thái | Kết luận quyết định |
|---|---|---|---|
| **L1** | Thiếu hụt phục vụ | ✅ dựng | Đơn vị đúng là **người-mét**, không phải mét. `notebooks/l1_*` |
| **L2** | Vùng phủ theo thời gian | ❌ đổi | Không phát isochrone theo phút — chỉ **quãng đường** (hệ quả A2) |
| **L3** | Hệ số đi vòng | ✅ giữ | Chim bay là **khái niệm riêng**, không phải bản dự phòng. Ở bán kính 1 km, chim bay báo phủ nhầm **55,1%** |
| **L4** | Áp lực cung | ❌ bỏ | Không kiểm chứng được (`util` phủ 9,9% ô) + cần 2 ngưỡng tự đặt. Khái niệm chuyển vào L6 | §15 |
| **L5** | Nghiên cứu POI | ⚠️ thu hẹp | Phân cụm **tái tạo đúng `commune_kind`** (Cramér's V 0,718). Chốt **một trường**: `n_poi_1km` (R² 0,266 → 0,313) | §17 |
| **L6** | Engine sàng lọc đơn | ✅ dựng | `screen_margin_m` + `screen_decision` ở B12. **Không phải số đo — là đầu ra của rule** | §16 |
| **L7** | Bất định | 🔒 | Chủ đầu tư chốt: dữ liệu đủ tốt thì cứ theo dữ liệu mà làm |
| **L8** | Nhịp sử dụng | ✅ đo | **Cả ba nghi ngờ của tôi đều sai.** Thủ phạm là **lệch pha**: từng trạm CV 0,619 → gộp còn 0,206, **mất 66,8% biên độ** |
| **L9** | Mạng đường nền | ✅ có | Tách thành module `roadnet` dùng chung s08 và web |
| **L10** | kW khả dụng | ❌ bỏ | Không có phần chiếm dụng thì trùng `power_kw_site`; có thì rỗng 90% bản đồ | §13 |

---

## Ba khoảng trống chặn L6 — nằm ngoài repo này

Không sửa được bằng mã. Chúng cần đầu vào từ phía chủ đầu tư.

| | Thiếu gì | Hậu quả |
|---|---|---|
| **1** | Danh sách trạm **sắp vận hành / đã cấp phép** | Rule yêu cầu xét chúng. Nguồn evcs.vn chỉ có trạm đang sống ⇒ engine sẽ **ĐỀ XUẤT ở chỗ sắp có trạm** — sai theo hướng nới lỏng |
| **2** | Tập **hồ sơ thật** (đã duyệt / bị từ chối) | Engine **không kiểm chứng được đầu-cuối**. Mọi hiệu chuẩn tới nay dùng **chính trạm đang vận hành làm đơn giả định** |
| **3** | **Văn bản** cho rule loại trừ đất đặc thù | Đo được: 4 phường lõi chính trị–lịch sử (Ba Đình · Hoàn Kiếm · Văn Miếu–QTG · Bạch Mai) có **0 trạm** dù 65k–130k dân. Nhưng **vắng mặt không chứng minh được là cấm** |

---

## Mâu thuẫn đã ghi nhận, chưa giải

Chủ đầu tư chốt *"trạm hiện tại coi như đúng"*. Nhưng chạy ngược bộ rule trên chính chúng thì
nó **từ chối 41,4 – 73,5%** (tuỳ cách giải nghĩa ba chỗ mơ hồ).

Hai điều đó không thể cùng đúng. Hoặc rule **cố ý** siết chặt hơn thực tế lịch sử, hoặc ngưỡng
chưa chuẩn. Đã chốt là triển khai theo rule và **cập nhật khi có thông tin chính thức**.
