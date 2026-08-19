import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Hexagon, MapPin, Search, X, Zap } from "lucide-react";

import type { CommuneCollection, GridCell, StationPoint } from "../data/queries";
import { useStore } from "../state/store";
import {
  EMPTY_SEARCH_OUTCOME,
  MIN_QUERY_LENGTH,
  buildSearchIndex,
  isCellQuery,
  normalizeSearchText,
  rankSearchResults,
  type SearchIndex,
  type SearchResult,
} from "./search";

export interface SearchBarProps {
  communes: CommuneCollection | null;
  stations: StationPoint[];
  cells?: GridCell[];
  onResultSelect?: () => void;
  className?: string;
}

/**
 * Trạng thái của popup — §1.6.
 *
 * `results.length === 0` KHÔNG phải một điều kiện mà là ba: chưa gõ đủ, chưa nạp xong, và
 * thật sự không có. Bản cũ in `Không tìm thấy…` cho cả ba, kể cả trong lúc `communes` còn
 * `null` lúc boot — tức báo một phủ định SAI về dữ liệu chưa đọc tới.
 */
type PopupState = "hidden" | "hint" | "loading" | "empty" | "results";

/** Bước nhảy của `PageUp`/`PageDown` — §1.7. */
const PAGE_STEP = 5;

function KindIcon({ kind }: { kind: SearchResult["kind"] }) {
  if (kind === "commune") return <MapPin className="h-3.5 w-3.5 text-cold-1" aria-hidden />;
  if (kind === "station") return <Zap className="h-3.5 w-3.5 text-warn" aria-hidden />;
  return <Hexagon className="h-3.5 w-3.5 text-ink-2" aria-hidden />;
}

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  commune: "Xã/phường",
  station: "Trạm sạc",
  cell: "Ô H3",
};

export function SearchBar({
  communes,
  stations,
  cells = [],
  onResultSelect,
  className = "",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const searchNavigate = useStore((s) => s.searchNavigate);

  /**
   * Index dựng NHIỀU NHẤT MỘT lần cho mỗi corpus của mỗi phiên dữ liệu (§4, cổng G3) — và
   * chỉ khi thật sự có một truy vấn để chạy.
   *
   * `useMemo` giữ một closure chứ không giữ index: nếu nó dựng index ngay khi corpus tới thì
   * phép dựng rơi vào ĐÚNG commit mà DuckDB vừa trả dữ liệu và deck.gl đang dựng lớp — đo
   * được là một Long Task 63 ms ở boot, mà 12–16 ms trong đó là của index. Hoãn tới lần
   * dùng đầu tiên thì boot không trả gì cả, và một phiên không ai gõ gì thì không dựng.
   * `??=` giữ đúng một lần dựng cho mỗi corpus, nên gõ phím vẫn không dựng lại.
   */
  const indexOf = useMemo(() => {
    let built: SearchIndex | null = null;
    return () => (built ??= buildSearchIndex({ communes, stations, cells }));
  }, [communes, stations, cells]);

  const normalized = normalizeSearchText(query);
  const outcome = useMemo(
    () =>
      normalizeSearchText(query).length < MIN_QUERY_LENGTH
        ? EMPTY_SEARCH_OUTCOME
        : rankSearchResults(query, indexOf()),
    [query, indexOf],
  );
  const results = outcome.results;

  // `stations.length === 0` là điều kiện "chưa nạp" chứ không phải "gói rỗng": loader boot
  // luôn trả ≥ 1 trạm ở mọi gói ship được, và một gói thật sự không có trạm nào sẽ dừng ở
  // trạng thái Đang nạp — đó là một sai số chấp nhận được so với việc báo "không tìm thấy"
  // trong lúc dữ liệu còn đang bay về.
  const corpusReady = communes !== null && stations.length > 0;

  const popupState: PopupState = !isOpen || normalized.length === 0
    ? "hidden"
    : normalized.length < MIN_QUERY_LENGTH
      ? "hint"
      : !corpusReady
        ? "loading"
        : results.length === 0
          ? "empty"
          : "results";

  /**
   * Lớp Ô H3 vắng mặt — §0.3-D, §1.6.
   *
   * `App` chỉ truyền `cells` khi trường đang mở đọc trên Ô. Một phiên không nạp trường Ô nào
   * thì `cells` rỗng, và báo "không tìm thấy" cho một mã H3 hợp lệ là một phủ định sai. Nói
   * NGUYÊN NHÂN thay vì báo một kết quả.
   */
  const cellCorpusMissing = isCellQuery(normalized) && cells.length === 0;

  // `activeIndex` được KẸP chứ không đặt lại về 0 (§1.7). Corpus tới bất đồng bộ; một chỉ số
  // vượt quá cuối danh sách biến `Enter` thành một no-op im lặng.
  useEffect(() => {
    setActiveIndex((prev) => (results.length === 0 ? 0 : Math.min(prev, results.length - 1)));
  }, [results]);

  // Cuộn tuỳ chọn đang chọn vào tầm nhìn. Cap toàn cục là 10 dòng còn hộp chỉ cao ~5,35
  // dòng, nên thiếu lời gọi này thì `ArrowDown` di một con trỏ VÔ HÌNH (§1.5).
  useEffect(() => {
    if (popupState !== "results") return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(listboxId)}-option-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, popupState, listboxId]);

  // Phím tắt toàn cục. `⌘K`/`Ctrl+K` chạy ở MỌI nơi kể cả trong ô nhập (§1.7); `/` chỉ chạy
  // khi tiêu điểm không nằm trong một ô nhập, nếu không thì không ai gõ được dấu gạch chéo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      setIsOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const activate = useCallback(
    (result: SearchResult) => {
      // MỘT action cho cả camera lẫn selection (§1.8). Truy vấn được xoá sau đó, nên hash
      // phản ánh một ĐỊA ĐIỂM chứ không phải một phiên tìm kiếm.
      searchNavigate(result);
      setQuery("");
      setActiveIndex(0);
      setIsOpen(false);
      onResultSelect?.();
    },
    [searchNavigate, onResultSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = results.length;
    const open = popupState === "results";

    if (e.key === "Tab") {
      // KHÔNG bẫy tiêu điểm: đóng popup rồi để trình duyệt chuyển tiêu điểm như thường.
      setIsOpen(false);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        // Hai bước, theo mẫu combobox của WAI-ARIA: xoá lỗi gõ không mất tiêu điểm. Cờ
        // `isOpen` giữ nguyên nên phím tiếp theo hiện kết quả ngay; §1.6 quyết định lúc này
        // popup vẽ gì (truy vấn rỗng ⇒ không vẽ gì).
        setQuery("");
        setActiveIndex(0);
        inputRef.current?.focus();
      } else {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (!open) {
      // `Enter` khi không có kết quả là một no-op, và KHÔNG đóng popup (§1.7): đóng nó sẽ
      // giấu mất câu giải thích vì sao chưa có gì.
      if (e.key === "Enter") e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => (p + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => (p - 1 + n) % n);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(n - 1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setActiveIndex((p) => Math.min(n - 1, p + PAGE_STEP));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setActiveIndex((p) => Math.max(0, p - PAGE_STEP));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) activate(item);
    }
  };

  const truncationLine =
    outcome.truncated > 0
      ? `Còn ${outcome.truncated.toLocaleString("vi-VN")} kết quả khác — gõ thêm để thu hẹp.`
      : null;

  /** Vùng `aria-live` đọc TRẠNG THÁI, không chỉ đọc số đếm (§1.6). */
  const liveMessage =
    popupState === "loading"
      ? "Đang nạp dữ liệu tìm kiếm."
      : popupState === "empty"
        ? cellCorpusMissing
          ? "Chưa nạp lớp Ô H3."
          : "Không tìm thấy kết quả nào."
        : popupState === "results"
          ? `${results.length} kết quả.${truncationLine ? ` ${truncationLine}` : ""}`
          : popupState === "hint"
            ? "Gõ thêm một ký tự."
            : "";

  const activeOptionId =
    popupState === "results" && results[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-muted" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Tìm xã, phường, trạm sạc, mã H3…"
          aria-label="Tìm xã, phường, trạm sạc hoặc mã ô H3"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={popupState !== "hidden"}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          className="h-8 w-full rounded-xs border border-hairline bg-surface pl-8 pr-8 text-body text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
            aria-label="Xoá tìm kiếm"
            className="absolute right-2.5 grid h-4 w-4 cursor-pointer place-items-center rounded-xs text-ink-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2.5 rounded-xs border border-hairline px-1 font-mono text-[10px] text-ink-muted">
            /
          </kbd>
        )}
      </div>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

      {popupState !== "hidden" && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-sm border border-hairline bg-panel shadow-float">
          {popupState === "hint" && (
            <p className="px-3 py-3 text-center text-body text-ink-muted">Gõ thêm một ký tự…</p>
          )}

          {popupState === "loading" && (
            <p className="px-3 py-3 text-center text-body text-ink-muted">Đang nạp dữ liệu…</p>
          )}

          {popupState === "empty" && (
            <div className="px-3 py-3 text-center text-body text-ink-muted">
              {cellCorpusMissing ? (
                <p>Chưa nạp lớp Ô H3 — chọn một trường của Ô để tìm theo mã H3.</p>
              ) : (
                <p>
                  Không tìm thấy xã, phường hay trạm sạc nào cho &ldquo;
                  <span className="font-medium text-ink">{query}</span>&rdquo;.
                </p>
              )}
            </div>
          )}

          {popupState === "results" && (
            <>
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label="Kết quả tìm kiếm"
                className="custom-scrollbar m-0 max-h-64 list-none divide-y divide-hairline/60 overflow-y-auto p-0"
              >
                {results.map((item, idx) => {
                  const selected = idx === activeIndex;
                  return (
                    <li
                      key={item.id}
                      id={`${listboxId}-option-${idx}`}
                      role="option"
                      aria-selected={selected}
                      onClick={() => activate(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                        selected ? "bg-basemap font-medium text-ink" : "text-ink-2 hover:bg-basemap/60"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        <KindIcon kind={item.kind} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-title font-medium text-ink">
                          {item.title}
                        </span>
                        <span className="block truncate text-note text-ink-muted">
                          <span className="sr-only">{KIND_LABEL[item.kind]}. </span>
                          {item.subtitle}
                        </span>
                      </span>
                      {selected && (
                        <CornerDownLeft className="h-3 w-3 shrink-0 self-center text-ink-muted" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
              {/* Cắt IM LẶNG không phân biệt được với phủ đầy đủ — §1.5 cấm nó. */}
              {truncationLine && (
                <p className="border-t border-hairline bg-basemap/50 px-3 py-1.5 text-note text-ink-muted">
                  {truncationLine}
                </p>
              )}
              {cellCorpusMissing && (
                <p className="border-t border-hairline bg-basemap/50 px-3 py-1.5 text-note text-ink-muted">
                  Chưa nạp lớp Ô H3 — chọn một trường của Ô để tìm theo mã H3.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
