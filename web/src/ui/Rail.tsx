import { useState } from "react";

import type { Manifest } from "../data/manifest";
import type { CommuneCollection } from "../data/queries";
import type { RuntimeCoverage } from "../fields";
import { useStore } from "../state/store";
import { FieldsTab } from "./FieldsTab";
import { LayersTab } from "./LayersTab";
import { SourceBlock } from "./Source";

/**
 * Workspace của BẢN ĐỒ.
 *
 * Đây cố ý KHÔNG phải inspector: nó chỉ giúp chọn câu hỏi, measure và context. Dữ liệu của
 * object được chọn sống trong `InspectorSheet`, nên người dùng không phải đổi tab giữa
 * “TRƯỜNG / LAYER / Ô” để hoàn tất một thao tác click trên map.
 */
export function Rail({
  manifest,
  runtime,
  communes,
}: {
  manifest: Manifest | null;
  runtime: Map<string, RuntimeCoverage>;
  communes: CommuneCollection | null;
}) {
  const { field, setField, layers, cell, workspaceOpen, setWorkspaceOpen } = useStore();
  const [page, setPage] = useState<"question" | "context">("question");
  const [search, setSearch] = useState("");

  // Một selection ưu tiên không gian đọc map. Ở màn rất rộng vẫn giữ workspace để analyst
  // có thể đối chiếu measure mà không đóng inspector; ở desktop thông thường nó tự collapse.
  const visibility = cell ? "hidden 2xl:flex" : "hidden xl:flex";
  const drawer = workspaceOpen ? "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:flex max-xl:w-full sm:max-xl:w-80" : "";

  return (
    <aside className={`${visibility} ${drawer} absolute bottom-3 right-3 z-20 max-h-[min(42rem,calc(100%-1.5rem))] w-80 flex-col border border-hairline bg-panel`} aria-label="Không gian điều tra">
      <div className="flex shrink-0 border-b border-hairline text-[11px] tracking-[0.1em]">
        <button onClick={() => setWorkspaceOpen(false)} className="hidden border-r border-hairline px-2 text-ink-2 max-xl:block">đóng</button>
        <button
          onClick={() => setPage("question")}
          className={`flex-1 cursor-pointer py-2 ${page === "question" ? "bg-basemap font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          CÂU HỎI
        </button>
        <button
          onClick={() => setPage("context")}
          className={`flex-1 cursor-pointer border-l border-hairline py-2 ${page === "context" ? "bg-basemap font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          BỐI CẢNH
          {layers.size > 0 && <span className="pl-1 tabular-nums text-cold-2">{layers.size}</span>}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {page === "question" ? (
          <FieldsTab
            field={field}
            setField={setField}
            search={search}
            setSearch={setSearch}
            manifest={manifest}
            runtime={runtime}
            communes={communes}
          />
        ) : (
          <LayersTab manifest={manifest} />
        )}
      </div>

      <SourceBlock manifest={manifest} cell={null} occ={null} />
    </aside>
  );
}
