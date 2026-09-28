/** Formats an opportunity amount for display, following the current interface language. */
export function formatAmount(amount: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
