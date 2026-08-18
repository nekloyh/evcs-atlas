/** Pure keyboard boundary used by EvidenceCard and exercised without a DOM test harness. */
export function shouldHandleInspectorEscape(event: {
  key: string;
  defaultPrevented: boolean;
}): boolean {
  return event.key === "Escape" && !event.defaultPrevented;
}

export type InspectorFocusAction = "none" | "skip-initial" | "capture-and-focus" | "focus-only";

export function inspectorFocusAction(
  previousKey: string | null,
  currentKey: string | null,
  skipInitialUrlFocus: boolean,
): InspectorFocusAction {
  if (currentKey === null || currentKey === previousKey) return "none";
  if (previousKey !== null) return "focus-only";
  return skipInitialUrlFocus ? "skip-initial" : "capture-and-focus";
}
