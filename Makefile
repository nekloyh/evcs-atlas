.PHONY: check-chain setup clean help web vn vn-plan vn-web vn-quocgia poi-proxy golden golden-ghi schema schema-kiem kiem lint clean-cache deploy-pages

help:
	@echo "make setup    — cài môi trường (uv sync)"
	@echo "make clean    — xoá store/p, store/cache và QA theo tỉnh"
	@echo "make web      — chạy dev server của web app (cần `make vn-web` trước)"
	@echo ""
	@echo "  ── toàn quốc (34 tỉnh) ──"
	@echo "make vn                 — chạy toàn bộ pipeline toàn quốc (resume được)"
	@echo "make vn TINH=01         — chỉ một tỉnh"
	@echo "make vn TINH=01,79,48   — vài tỉnh"
	@echo "make vn-plan            — in kế hoạch, không chạy (cặp nào sẽ chạy, cặp nào bỏ qua)"
	@echo "make vn-web             — chỉ xuất lại store cho web (34 bộ theo tỉnh)"
	@echo "make vn-quocgia         — chỉ dựng lại lớp gộp TOÀN QUỐC + 4 file GeoJSON POI"
	@echo ""
	@echo "  ── proxy POI (chế độ test, #tinh=poi) ──"
	@echo "make poi-proxy SRC=data/qa/eda/poi_chungcu_7tinh.parquet   — đưa một bảng POI lên bản đồ"
	@echo "  (cửa thứ hai, KHÔNG cần lệnh: kéo-thả .geojson/.parquet thẳng vào #tinh=poi —"
	@echo "   đọc trong trình duyệt, không ghi đĩa, mất khi tải lại trang)"
	@echo ""
	@echo "  ── cổng chặn (xem docs/adr/) ──"
	@echo "make kiem      — lint + schema + test Python + test web + golden. Chạy trước mọi commit."
	@echo "make lint      — ruff, phạm vi chốt ở pyproject.toml. PHẢI là 0 lỗi."
	@echo "make golden    — DỪNG nếu một con số của 863 bảng sản phẩm đổi"
	@echo "make schema    — sinh lại khai báo cột cho web từ src/evcs/schema/grid.py"
	@echo "make deploy-pages — phát hành snapshot đã build lên nhánh gh-pages"
	@echo ""
	@echo "  ── soi pipeline ──"
	@echo "uv run python -m vn --do-thi              — in DAG suy từ reads/writes"
	@echo "uv run python -m vn all --tinh 01 --soi   — chạy VÀ đo bản khai reads có đúng không"
	@echo "make clean-cache — xoá store/cache (dựng lại được), giữ nguyên sản phẩm"

setup:
	uv sync

clean:
	rm -rf store/p store/cache store/qa/[0-9]*

# Cache dựng lại được từ PBF: xoá không mất sản phẩm nào. Đây là cả điểm của việc tách tier —
# "xoá cache" phải là một lệnh, không phải một cuộc rà soát bằng mắt.
clean-cache:
	rm -rf store/cache

# --- web app (xem web/DESIGN.md) -------------------------------------------
.PHONY: web

web:
	cd web && pnpm install && pnpm dev

# --- pipeline toàn quốc (xem README.md + DECISIONS.md) ---
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

# --- proxy POI: nhìn thẳng một bảng POI đang soi ở notebook ------------------
# KHÔNG phải một bước pipeline (xem docstring `vn/proxy_poi.py`). Một parquet bất kỳ có
# lat/lng → một lớp trên bản đồ ở `#tinh=poi`. Manifest cộng dồn: chạy nhiều lần với nhiều
# file thì bộ chọn ở web liệt kê đủ, bấm qua lại được giữa b2 và b3.
#   make poi-proxy SRC=data/qa/eda/poi_chungcu_7tinh.parquet
#   make poi-proxy SRC="data/qa/eda/poi_chungcu_7tinh_b3.parquet data/qa/eda/poi_chungcu_7tinh_b3_bi_xoa.parquet"
poi-proxy:
	@test -n "$(SRC)" || (echo "cần SRC=<file.parquet> [file2.parquet …]"; exit 1)
	uv run python -m vn.proxy_poi $(SRC)

# --- lưới an toàn: vân tay mọi bảng sản phẩm ---------------------------------
# `make golden` DỪNG nếu một con số nào đổi. Đây là cổng chặn của mọi đợt refactor:
# đổi cấu trúc mã thì được, đổi kết quả thì phải là một quyết định có người ký.
golden:
	uv run python -m golden.capture

golden-ghi:
	uv run python -m golden.capture --ghi

# --- schema: một chỗ khai cột, mọi thứ khác suy ra -------------------------
# `schema` sinh lại khai báo TypeScript cho web; `schema-kiem` chỉ kiểm nó còn khớp.
# Đây là nửa web của vòng ETL→viz; nửa dữ liệu là phép kiểm `schema_khop_khai_bao` ở n09.
schema:
	uv run python -m evcs.schema.emit

schema-kiem:
	uv run python -m evcs.schema.emit --kiem

# --- lint: phạm vi và tập luật khai ở `pyproject.toml`, không phải mặc định của ruff ---
# Đứng TRƯỚC test trong `kiem` vì nó rẻ nhất và bắt đúng loại lỗi làm test nói dối
# (import chết, tên không tồn tại, biến bị shadow).
lint:
	uv run ruff check .

kiem: lint schema-kiem
	uv run pytest
	cd web && pnpm test
	$(MAKE) golden

# main là nguồn release; gh-pages chỉ là snapshot sinh tự động, không merge ngược.
deploy-pages:
	bash scripts/deploy_pages.sh

check-chain:  ## kiem nhat quan chuoi EDA POI: vao - final = ra (theo tap uid)
	uv run python scripts/check_chain.py
