import type * as React from "react";

import type { AppNavMode } from "../../state/types";

export function Workspace({
  error,
  children,
  bottom,
}: {
  error: string | null;
  children: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {error && (
        <div role="alert" className="shrink-0 border-b border-hairline bg-panel px-4 py-2 text-heading">
          Không nạp được dữ liệu: {error}
          <span className="text-ink-muted"> — đã chạy `make web-data` chưa?</span>
        </div>
      )}
      {children}
      {bottom}
    </div>
  );
}

export function ModeSwitch({
  mode,
  map,
  story,
  data,
}: {
  mode: Exclude<AppNavMode, "national">;
  map: React.ReactNode;
  story: React.ReactNode;
  data: React.ReactNode;
}) {
  return <>{({ map, story, data } as const)[mode]}</>;
}

export function MapWorkspace({
  readColumn,
  map,
}: {
  readColumn: React.ReactNode;
  map: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {readColumn}
      <main className="relative min-w-0 flex-1" aria-label="Không gian bản đồ chính">
        {map}
      </main>
    </div>
  );
}
