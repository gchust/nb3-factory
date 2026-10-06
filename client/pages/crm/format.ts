/**
 * Amounts are plain numbers on the wire. This keeps them plain on screen too: no currency symbol (the endpoint stores
 * no currency) and no thousands separator, so the figure the user typed is the figure the user reads.
 */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}
