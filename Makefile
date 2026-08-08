.PHONY: all setup clean layers docs help web web-data vn vn-plan vn-web vn-quocgia
PY := uv run python -m hanoi

help:
	@echo "make setup    — cài môi trường (uv sync)"
	@echo "make all      — chạy toàn bộ pipeline B1→B11 (~4 phút, bước nặng nhất là quét PBF)"
	@echo "make layers   — chạy lại các bước sau khi đã có bản trích OSM (~30 giây)"
	@echo "make clean    — xoá data/processed và data/qa (giữ data/raw)"
	@echo "make web-data — xuất dữ liệu cho web app sang web/public/data/"
	@echo "make web      — chạy dev server của web app (cần make web-data trước)"
	@echo ""
	@echo "  ── toàn quốc (34 tỉnh) ──"
	@echo "make vn                 — chạy toàn bộ pipeline toàn quốc (resume được)"
	@echo "make vn TINH=01         — chỉ một tỉnh"
	@echo "make vn TINH=01,79,48   — vài tỉnh"
	@echo "make vn-plan            — in kế hoạch, không chạy (cặp nào sẽ chạy, cặp nào bỏ qua)"
	@echo "make vn-web             — chỉ xuất lại store cho web (34 bộ theo tỉnh)"
	@echo "make vn-quocgia         — chỉ dựng lại lớp gộp TOÀN QUỐC + 4 file GeoJSON POI"

setup:
	uv sync

# B3 quét file PBF 325 MB một lần (~2,5 phút); các bước còn lại chạy trên bản trích Hà Nội.
# B3b quét lần hai với area-assembly (~2 phút) — lớp POI VISUAL giữ polygon (DESIGN §11 M3.5).
# B3c quét lần ba (~1,7 phút) — toạ độ trạm biến áp OSM, lớp ĐIỂM để vẽ (DESIGN §11 M5).
# Ba lần quét thay vì một, cùng lý do đã ghi ở đầu mỗi bước: ba lớp là ba khái niệm, và
# gộp chúng vào một lần đọc sẽ đổi nghĩa các cột đếm mà lớp đầu tiên đã phát.
all: setup
	$(PY).s01_admin
	$(PY).s03_osm_extract
	$(PY).s03b_osm_poi_visual
	$(PY).s03c_osm_substation
	$(MAKE) layers

# B2 định nghĩa TẬP Ô BÁO CÁO (grid.MIN_AREA_FRAC) nên phải chạy lại mỗi khi grid.py đổi.
# Nó chỉ đọc VNSDI, không đụng file PBF, nên chỗ đúng của nó là ở đây chứ không phải `all`.
layers:
	$(PY).s02_grid
	$(PY).s04_population
	$(PY).s05_stations
	$(PY).s06_occupancy
	$(PY).s07_landcover
	$(PY).s08_traveltime
	$(PY).s09_grid_features
	$(PY).s12_screening
	$(PY).s10_assemble
	$(PY).s11_summary

clean:
	rm -rf data/processed data/qa

# --- web app (xem web/DESIGN.md) -------------------------------------------
.PHONY: web web-data

web-data:
	$(PY).web_export

web:
	cd web && pnpm install && pnpm dev

# --- pipeline toàn quốc (xem AUDIT_TOAN_QUOC.md + QUYET_DINH_TOAN_QUOC.md) ---
# Tham số hoá theo tỉnh và RESUME được: đơn vị ghi nhận là cặp (bước, tỉnh), nên đứt ở tỉnh
# thứ 19 thì lần sau bắt đầu từ tỉnh thứ 19. Xoá một file sản phẩm hoặc đổi logic một bước
# là bước đó tự hết hạn — xem docstring `vn/runner.py`.
TINH ?= all

vn:
	uv run python -m vn all --tinh $(TINH)

vn-plan:
	uv run python -m vn all --tinh $(TINH) --liet-ke

vn-web:
	uv run python -m vn n11_web_export

# Lớp CẢ NƯỚC XEM MỘT LẦN: lưới H3 r6 gộp + bảng trạm + bảng POI + 4 file GeoJSON theo
# nhóm POI. Đọc 34 phân mảnh đã có trên đĩa, không chạm nguồn — nên chạy lại rẻ (~2 giây).
vn-quocgia:
	uv run python -m vn n12_national
