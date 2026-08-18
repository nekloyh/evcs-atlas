import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X, MapPin, Zap, Hexagon, CornerDownLeft } from "lucide-react";
import type { CommuneCollection, GridCell, StationPoint } from "../data/queries";
import { useStore } from "../state/store";
import {
  filterSearchResults,
  type SearchResultItem,
} from "./search";

export interface SearchBarProps {
  communes: CommuneCollection | null;
  stations: StationPoint[];
  cells?: GridCell[];
  onResultSelect?: () => void;
  className?: string;
}

export function SearchBar({
  communes,
  stations,
  cells = [],
  onResultSelect,
  className = "",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const flyTo = useStore((s) => s.flyTo);

  // Global keyboard shortcut to focus search bar (/ or Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        if (e.key === "Escape" && target === inputRef.current) {
          setIsOpen(false);
          inputRef.current?.blur();
        }
        return;
      }

      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered search results
  const results = useMemo<SearchResultItem[]>(
    () => filterSearchResults(query, communes, stations, cells),
    [query, communes, stations, cells],
  );
  const popupVisible = isOpen && query.trim().length > 0;
  const activeOptionId =
    popupVisible && results[selectedIndex] ? `${listboxId}-option-${selectedIndex}` : undefined;

  const handleSelectResult = useCallback(
    (item: SearchResultItem) => {
      flyTo(
        {
          lng: item.center[0],
          lat: item.center[1],
          zoom: item.zoom,
          pitch: 0,
          bearing: 0,
        },
        item.id,
      );
      setIsOpen(false);
      setQuery("");
      onResultSelect?.();
    },
    [flyTo, onResultSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0 && selectedIndex < results.length) {
        const item = results[selectedIndex];
        if (item) handleSelectResult(item);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center w-full">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Tìm xã, phường, trạm sạc..."
          aria-label="Tìm kiếm địa điểm, trạm sạc"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-expanded={popupVisible}
          aria-activedescendant={activeOptionId}
          className="h-8 w-full rounded-sm border border-hairline bg-surface pl-8 pr-14 text-body text-ink placeholder:text-ink-muted/70 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
        />

        {query ? (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Xoá tìm kiếm"
            className="absolute right-2.5 grid h-4 w-4 place-items-center rounded-xs text-ink-muted hover:text-ink cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            title="Nhấn phím / hoặc ⌘K để tìm nhanh"
            className="pointer-events-none absolute right-2 top-1.5 hidden h-5 select-none items-center gap-0.5 rounded border border-hairline bg-basemap px-1 font-mono text-[9px] font-medium text-ink-muted sm:inline-flex"
          >
            /
          </kbd>
        )}
      </div>

      {/* Autocomplete Dropdown Popover */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {popupVisible
          ? results.length > 0
            ? `${results.length} kết quả tìm kiếm`
            : "Không có kết quả tìm kiếm"
          : ""}
      </span>

      {popupVisible && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-sm border border-hairline bg-panel shadow-float overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-center text-body text-ink-muted">
              Không tìm thấy xã hay trạm sạc nào cho &ldquo;<span className="text-ink font-medium">{query}</span>&rdquo;
            </div>
          ) : (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Kết quả tìm kiếm"
              className="custom-scrollbar max-h-64 overflow-y-auto divide-y divide-hairline/60 p-0 m-0 list-none"
            >
              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <li
                    key={item.id + idx}
                    id={`${listboxId}-option-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? "bg-basemap font-medium text-ink"
                        : "text-ink-2 hover:bg-basemap/60"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 text-ink-muted">
                      {item.category === "commune" && <MapPin className="h-3.5 w-3.5 text-cold-1" />}
                      {item.category === "station" && <Zap className="h-3.5 w-3.5 text-warn" />}
                      {item.category === "cell" && <Hexagon className="h-3.5 w-3.5 text-ink-2" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-title font-medium text-ink">
                        {item.title}
                      </div>
                      <div className="truncate text-note text-ink-muted">{item.subtitle}</div>
                    </div>
                    {isSelected && (
                      <CornerDownLeft className="h-3 w-3 shrink-0 self-center text-ink-muted" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
