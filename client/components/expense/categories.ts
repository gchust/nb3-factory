export const EXPENSE_CATEGORIES = [
  'travel',
  'transport',
  'meal',
  'office',
] as const;
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];
