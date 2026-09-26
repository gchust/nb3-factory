import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { EquipmentStatus } from './types.js';

/** The availability badge used by the ledger and, for consistency, wherever equipment state is shown. */
export function EquipmentStatusBadge({
  status,
}: {
  readonly status: EquipmentStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={status === 'available' ? 'secondary' : 'default'}>
      {t(`equipment.status.${status}`)}
    </Badge>
  );
}

/** A clear marker for a loan or a device that is past its expected return date. */
export function OverdueBadge(): ReactElement {
  const { t } = useTranslation();
  return <Badge variant='destructive'>{t('equipment.overdue')}</Badge>;
}

/** Formats an ISO timestamp in the current language; an empty value reads as "—". */
export function DateValue({
  value,
}: {
  readonly value: string | null;
}): ReactElement {
  const { locale } = useLocale();
  const formatted = useMemo(
    () =>
      value
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
            new Date(value),
          )
        : null,
    [locale, value],
  );
  return formatted ? (
    <span>{formatted}</span>
  ) : (
    <span className='text-muted-foreground'>—</span>
  );
}

/** One of the three totals above the ledger. */
export function StatCard({
  label,
  value,
  tone = 'default',
}: {
  readonly label: string;
  readonly value: number | undefined;
  readonly tone?: 'default' | 'destructive';
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            'font-heading text-2xl tabular-nums',
            tone === 'destructive' && (value ?? 0) > 0
              ? 'text-destructive'
              : undefined,
          )}
        >
          {value ?? '—'}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
