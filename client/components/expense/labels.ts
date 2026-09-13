import { useTranslation } from '@nocobase/i18n/client';

import { formatMoney } from '@/lib/expense-api';

export function useExpenseLabels(): {
  status: (status: string) => string;
  category: (category: string) => string;
  money: (cents: number) => string;
} {
  const { t } = useTranslation();
  return {
    status: (status) => t(`expense.status.${status}`, { defaultValue: status }),
    category: (category) =>
      t(`expense.category.${category}`, { defaultValue: category }),
    money: (cents) => formatMoney(cents),
  };
}
