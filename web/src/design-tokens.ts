/**
 * Design tokens required by TypeScript consumers.
 *
 * CSS-facing copies live in `index.css` because Tailwind reads them at build time.
 * `test/design-tokens.test.ts` is the contract that keeps both boundaries identical.
 * Do not add a token here until runtime code actually consumes it.
 */

export const NAV_RAIL_W = 56;
export const CHART_W = 296;
export const PANEL_PAD_X = 12;
export const READ_COL_W = CHART_W + 2 * PANEL_PAD_X;
export const CHROME_BOTTOM = 32;

export const COLOR_INK = "#0b0b0b";
export const COLOR_INK_2 = "#52514e";
export const COLOR_INK_MUTED = "#6f6d68";
export const COLOR_PANEL = "#f9f9f7";
export const COLOR_BASEMAP = "#f2f3f0";
export const COLOR_HAIRLINE = "#e1e0d9";
export const COLOR_SELECT = "#0b0b0b";
export const COLOR_SELECT_CASING = "#ffffff";

export const COLD_HEX = ["#3987e5", "#1c5cab", "#0d366b"] as const;

export const DEFAULT_RAMP_HEX = [
  "#e7997e",
  "#dd7b57",
  "#d25b2c",
  "#b74817",
  "#9a380b",
  "#7d2a03",
  "#601e01",
] as const;

export const HEX_MIN_ZOOM = 11;
