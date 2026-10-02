import { useLocale } from '@nocobase/i18n/client';
import { type ReactElement, useMemo } from 'react';

/** Shows an amount in the current language: thousands separators and two decimal places follow the language. */
export function AmountText({
  amount,
}: {
  readonly amount: number;
}): ReactElement {
  const { locale } = useLocale();
  const format = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );
  return <>{format.format(amount)}</>;
}
