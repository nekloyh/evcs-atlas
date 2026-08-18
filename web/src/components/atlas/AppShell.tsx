import type * as React from "react";

export function AppShell({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col-reverse overflow-hidden bg-panel text-ink lg:flex-row">
      {nav}
      {children}
    </div>
  );
}
