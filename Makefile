.PHONY: setup clean help web vn vn-plan vn-web vn-quocgia golden golden-ghi schema schema-kiem kiem clean-cache

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
	@echo "  ── cổng chặn (xem docs/adr/) ──"
	@echo "make kiem      — schema + test Python + test web + golden. Chạy trước mọi commit."
	@echo "make golden    — DỪNG nếu một con số của 863 bảng sản phẩm đổi"
	@echo "make schema    — sinh lại khai báo cột cho web từ src/evcs/schema/grid.py"
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

kiem: schema-kiem
	uv run pytest
	cd web && pnpm test
	$(MAKE) golden
