import type { RGB } from "./palette";

/** P1 bivariate classes: tertiles are an exploratory comparison, not an opportunity score. */
export function tertileBreaks(values: number[]): [number, number] {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0];
  return [
    sorted[Math.floor((sorted.length - 1) / 3)]!,
    sorted[Math.floor((sorted.length - 1) * 2 / 3)]!,
  ];
}

export function tertileClass(value: number, breaks: [number, number]): 0 | 1 | 2 {
  return value <= breaks[0] ? 0 : value <= breaks[1] ? 1 : 2;
}

/** Hàng = cầu (nhạt → đậm), cột = cung (thấp → cao). */
export const DEMAND_SUPPLY_RGB: readonly (readonly RGB[])[] = [
  [[232, 229, 220], [176, 201, 211], [80, 139, 160]],
  [[238, 185, 157], [188, 157, 170], [105, 103, 151]],
  [[201, 89, 47], [151, 69, 91], [83, 54, 111]],
];
