# ADR-0003 — Chưa xoá gói `hanoi`, và điều kiện để xoá

**Ngày** 2026-08-08 · **Trạng thái** chấp nhận · **Thay cho** ghi chú ở `src/vn/__init__.py:10-14`

## Bối cảnh

`src/vn/__init__.py` từng nêu lý do hoãn: gộp `hanoi` vào `vn` "sẽ dựng lại mọi con số đã
công bố của Hà Nội trong cùng một lần thay đổi, và không có cách nào tách 'số đổi vì sửa
đúng' khỏi 'số đổi vì lỗi mới'."

**Lý do đó đã hết hiệu lực.** ADR-0001 dựng đúng cái baseline ấy: golden phủ 801 bảng và
DỪNG khi một con số đổi. Điều kiện chờ đã được đáp ứng.

Nhưng khi chuẩn bị xoá thì lộ ra một ràng buộc khác, và nó là ràng buộc thật.

## Ràng buộc: xoá bây giờ là MẤT TÍNH NĂNG

Bộ Hà Nội ở `web/public/data/` có hai file mà không tỉnh nào có:

| file | sinh bởi | vì sao `vn/` chưa có |
|---|---|---|
| `substations.geojson` | `hanoi/s03c_osm_substation.py` | **không có bước `n` tương ứng** — lượt quét PBF thứ ba chưa được port |
| `routes_showcase.geojson` | `hanoi/web_export_roads.py` | cần `way_nodes` + `return_predecessors` để dựng lại đường đi thật; `core/roadgraph` đã bỏ cả hai vì chỉ M3-R cần |

Thêm một thứ nhỏ hơn: `s08` phát `euclid_coverage_error_by_radius`, con số đỡ lưng cho luận
điểm "chim bay báo phủ nhầm 26,0% ô". `n07` không có.

Xoá `src/hanoi/` hôm nay là bỏ lớp trạm biến áp, bỏ cặp tuyến minh hoạ, và bỏ một số đo đang
được trích dẫn. Đó không phải refactor.

## Quyết định

**Giữ `src/hanoi/` ở trạng thái ĐÓNG BĂNG.** Không sửa, không mở rộng, không thêm bước.

Ba việc phải xong trước khi xoá, theo thứ tự:

1. **Port lớp trạm biến áp** — một bước `n` quét `power=substation` toàn quốc, ghi
   `substations.geojson` theo tỉnh. Kèm ghi chú của `DECISIONS §8`: trạm biến áp là lớp
   **ĐỂ NHÌN**, `dist_substation_m` đã bị bỏ và không được khôi phục (133 trạm/3.360 km²,
   một trạm làm láng giềng gần nhất cho 236 ô).
2. **Trả `way_nodes` + `return_predecessors` vào `core.roadgraph`** — hai thứ này bị bỏ vì
   "chỉ M3-R cần", mà M3-R là thứ đang phải port.
3. **Đưa `euclid_coverage_error_by_radius` vào `n07`.**

Chỉ khi ba việc xong và golden vẫn xanh thì `src/hanoi/`, `data/`, và các lối vào không
tiền tố ở web mới được gỡ.

## Nợ vẫn còn tính lãi

Ghi rõ để không ai đọc ADR này thành "đã ổn":

* `analysis/` (21 script) và ba mục ở `AUDIT §A` (`roadnet.py:28-29`, `s09:59-71`) vẫn dùng
  hằng mét/độ khoá ở vĩ độ 21°. Ở `hanoi/` chúng đúng; nếu ai copy sang chỗ khác thì không.
* `web/src/fields.ts` giữ **hai** trường cho cùng một khái niệm (`road_len_in_hanoi_m` và
  `road_len_in_province_m`) và dựa vào `fieldAvailable` cho đúng một cái hiện. Test
  `columns.test.ts` khai nó ở `CHI_CO_O_BO_HA_NOI` — dòng đó biến mất cùng gói `hanoi`.
* Mỗi tuần trôi qua, hai đường mã có thể trôi thêm. Golden bắt được khi CHẠY LẠI, nhưng
  không ai chạy lại `hanoi/` thường xuyên.
