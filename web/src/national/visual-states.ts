import { HATCH_HEX, hexToRgb, type RGB } from "../viz/palette";

/** Một nguồn sự thật cho map, legend và cổng ΔE của trạng thái cấp tỉnh. */
export const NOT_COMPARABLE_HEX = "#5c5a55";
export const NOT_COMPARABLE_RGB: RGB = hexToRgb(NOT_COMPARABLE_HEX);
export const MISSING_HATCH_HEX = HATCH_HEX;
export const MISSING_HATCH_CSS =
  `repeating-linear-gradient(45deg, ${MISSING_HATCH_HEX} 0 1px, transparent 1px 6px)`;
