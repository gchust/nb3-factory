import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback } from 'react';

/**
 * The wording every ticket page needs, in one place.
 *
 * The names stored in the lifecycle are stable identifiers, never display text, so each one is translated at the point
 * it is shown. `defaultValue` keeps an identifier the client has not learned yet readable instead of blank.
 */
export function useTicketLabels(): {
  readonly status: (status: string) => string;
  readonly urgency: (urgency: string) => string;
  readonly transition: (transition: string) => string;
  readonly category: (category: string | null) => string;
  readonly date: (value: string | null | undefined) => string;
} {
  const { t, i18n } = useTranslation();
  const date = useCallback(
    (value: string | null | undefined): string =>
      value
        ? new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(value))
        : '—',
    [i18n.language],
  );
  return {
    status: (status) => t(`tickets.status.${status}`, { defaultValue: status }),
    urgency: (urgency) =>
      t(`tickets.urgency.${urgency}`, { defaultValue: urgency }),
    transition: (transition) =>
      t(`tickets.transition.${transition}`, { defaultValue: transition }),
    category: (category) =>
      category
        ? t(`tickets.category.${category}`, { defaultValue: category })
        : '—',
    date,
  };
}

/** Whether the caller may read the service desk's aggregate numbers at all. */
export function useTicketDashboardPermission(): {
  readonly can: boolean;
  readonly isPending: boolean;
} {
  const { can, isPending } = useCan({
    resource: { type: 'composite', id: 'tickets' },
    action: 'dashboard',
  });
  return { can, isPending };
}
