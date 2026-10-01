import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';

/**
 * A locale-aware formatter for expected amounts. Amounts carry no currency in
 * this application, so they render as plain numbers with two decimals rather
 * than inventing a currency symbol.
 */
export function useAmountFormatter(): (amount: number) => string {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const formatter = new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (amount: number) => formatter.format(amount);
  }, [i18n.language]);
}
