# ADR-0005 — Store có hai tier: sản phẩm và cache

**Ngày** 2026-08-08 · **Trạng thái** chấp nhận

## Bối cảnh

`road_graph.parquet` giữ `node_ids` + toạ độ **nguyên** — thứ duy nhất dựng được đồ thị
đường bộ. Lớp ĐỂ NHÌN (`roads.parquet`) đã đơn giản hoá ~10 m nên số đỉnh không còn khớp
`node_ids` và vĩnh viễn không dựng đồ thị được. Hai lớp là hai file, và đó là một quyết
định chứ không phải một sự trùng lặp.

Cái giá: ở 34 tỉnh, `road_graph` chiếm **603 MB trên 883 MB** store — hai phần ba dung
lượng nằm ở một loại file **không ship cho web** và **dựng lại được từ PBF**.

Giữ nó lại sau khi bước khoảng cách chạy xong là có chủ ý: chạy lại Dijkstra không phải
quét lại file PBF 325 MB. Nhưng nó phải nằm ở một tier **có tên**.

## Quyết định

```
store/
  admin/          địa giới dùng chung — sản phẩm, toàn cục
  p/<mã>/         sản phẩm + bảng trung gian của một tỉnh      280 MB
  cache/<mã>/     dựng lại được: đồ thị đường bộ                603 MB
  qa/             báo cáo chất lượng
  _state.json     trạng thái resume
```

Tier khai ở cấp `Dataset` (`src/vn/datasets.py`), không ở cấp thư mục — nên
`Roots.dir_for()` là chỗ DUY NHẤT biết tier nào đi đâu.

`make clean-cache` xoá `store/cache/` mà không mất một sản phẩm nào.

## Vì sao đây là một quyết định, không phải một sự sắp xếp

"Xoá cache" phải là **một lệnh**, không phải một cuộc rà soát bằng mắt. Không có tier, câu
hỏi "file nào an toàn để xoá" chỉ trả lời được bằng cách đọc mã của 14 bước.

Và nó là một ràng buộc về **scale**, không về gọn gàng: ở 34 tỉnh 883 MB còn chịu được;
thêm MỘT trục nữa — độ phân giải r9, hoặc một cửa sổ telemetry thứ hai — là nó nhân lên mà
không ai chọn. Tier làm cho việc nhân lên đó thành một con số có tên trong `du -sh`.

## Hệ quả

Bước nào ghi vào tier `cache` phải nói ra điều đó (`ShardWriter(..., tier="cache")`), và
bước nào đọc nó phải chấp nhận rằng nó **có thể không có mặt** — dựng lại là một lần quét
PBF, không phải một lỗi.

`n02_osm` sinh `road_graph`; `n04_grid` và `n07_distance` đọc nó. Ba chỗ, và cả ba đi qua
`paths.cache_dir()`.
