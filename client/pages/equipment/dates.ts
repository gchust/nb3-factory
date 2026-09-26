import { enUS, zhCN } from 'date-fns/locale';

/** The `date-fns` locale shape, inferred from the English locale to avoid a deep type import. */
export type DateFnsLocale = typeof enUS;

/** Map the application locale to the `date-fns` locale used by `DatePicker` and `format`. */
export function toDateFnsLocale(locale: string): DateFnsLocale {
  return locale.startsWith('zh') ? zhCN : enUS;
}
