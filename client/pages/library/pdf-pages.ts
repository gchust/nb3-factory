/** Clamps a requested page number into the inclusive `[1, total]` range. */
export function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) return 1;
  if (!Number.isFinite(total) || total < 1) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), total);
}
