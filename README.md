# evcs-atlas

Tập bản đồ + bộ dữ liệu nền cho bài toán **đặt trạm sạc xe điện**, phạm vi **34 tỉnh toàn
quốc**, theo nguyên tắc *một khái niệm một trường*.

Lưới phân tích **H3 r8** (~0,74 km²/ô) — 425.778 ô. Địa giới VNSDI hiệu lực 16/6/2025:
34 tỉnh, 3.321 xã/phường/đặc khu.

Nguồn nằm ở hai repo khác (`aGiang-evcs`, `legacy-evcs-dataset`) và **chỉ được đọc**.

---

## Đọc gì, theo thứ tự

| | file | khi nào |
|---|---|---|
| 1 | [`HAN_CHE.md`](HAN_CHE.md) | **trước mỗi lần trích một con số ra ngoài** |
| 2 | [`CONTEXT.md`](CONTEXT.md) | trước khi viết truy vấn đầu tiên |
| 3 | [`docs/COT.md`](docs/COT.md) | tra cột — SINH TỰ ĐỘNG, không sửa tay |
| 4 | [`DECISIONS.md`](DECISIONS.md) | trước khi thêm hoặc khôi phục một trường |
| 5 | [`docs/adr/`](docs/adr/) | trước khi sửa `src/` |
| 6 | [`web/DESIGN.md`](web/DESIGN.md) | trước khi chạm một dòng TSX |

## Chạy

```bash
make vn            # cả 34 tỉnh, resume theo cặp (bước, tỉnh)
make vn TINH=01    # một tỉnh
make vn-plan       # in kế hoạch, không chạy
make kiem          # schema + test Python + test web + golden. Chạy trước mọi commit.
```

`uv run python -m vn --do-thi` in DAG suy ra từ `reads`/`writes` — không có danh sách thứ
tự viết tay nào.

## Dữ liệu ở đâu

```
store/p/<mã>/     280 MB  sản phẩm — grid_h3_r8 · commune · stations · connectors ·
                          occupancy · roads · poi · substations
store/cache/<mã>/ 603 MB  dựng lại được từ PBF (make clean-cache)   → docs/adr/0005
store/qa/                 một JSON mỗi bước mỗi tỉnh + BAO_CAO_TINH.md
web/public/data/          bản đã xuất cho giao diện
```

Mọi số **theo tỉnh** đọc ở `store/qa/`, không ở tài liệu. Tài liệu chỉ nói LUẬT.

Hà Nội là mã `01` và không có gì đặc biệt về mặt cấu trúc.

```python
import pyarrow.parquet as pq
g = pq.read_table("store/p/01/grid_h3_r8.parquet").to_pandas()

# dân ngoài 2 km đường tới trạm gần nhất
far = g[g.dist_station_network_m > 2000]
print(f"{far.population.sum():,.0f} người ({far.population.sum()/g.population.sum():.1%})")

# ô đông dân, chưa có trạm, xa nhất — xếp theo NGƯỜI-KM, không theo mét
cand = g[g.n_stations == 0].assign(nguoi_km=lambda d: d.population * d.dist_station_network_m / 1000)
print(cand.nlargest(10, "nguoi_km")[["h3_r8", "commune_name", "population", "nguoi_km"]])
```

## Hình dạng mã

Ba gói, ranh giới giữa chúng là ranh giới về **quyền đọc đĩa** ([`adr/0002`](docs/adr/0002-core-khong-doc-dia.md)):

```
src/evcs/core/      nguyên hàm miền — THUẦN, không IO. Test không cần store.
src/evcs/schema/    khai cột của bảng phát hành. Một chỗ, mọi thứ khác suy ra.
src/evcs/pipeline/  Dataset · Step · DAG · resume · audit. Chỗ DUY NHẤT đọc/ghi đĩa.
src/vn/             các bước ETL + registry dataset.
golden/             vân tay mọi bảng sản phẩm — cổng chặn của mọi refactor (adr/0001).
```

Một bước khai **đọc gì / ghi gì bằng TÊN dataset**, không bằng đường dẫn. Đường dẫn, vân
tay resume, thứ tự chạy đều suy ra. `--soi` đo xem bản khai có đúng không bằng cách ghi lại
file mà bước thật sự mở.

**Thêm một cột:** sửa một dòng ở `src/evcs/schema/grid.py` → `make schema` → `make kiem`
nói chính xác chỗ nào còn thiếu.

## Giấy phép & bảo mật

Kế thừa ràng buộc của nguồn: OSM là **ODbL**; trạm sạc từ evcs.vn bị **giới hạn ToS**;
WorldPop **CC-BY**; ranh giới VNSDI là dữ liệu nhà nước. **Không publish** khi chưa có
sign-off. Không có khoá hay secret nào trong repo.
