import { useTranslation } from '@nocobase/i18n/client';
import { LockIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import {
  deviceStatusKey,
  inspectionStatusKey,
  ticketPriorityKey,
  ticketStatusKey,
} from '../types.js';

type BadgeVariant =
  'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';

const TICKET_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending_acceptance: 'outline',
  pending_processing: 'secondary',
  processing: 'default',
  pending_confirmation: 'secondary',
  closed: 'ghost',
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

const INSPECTION_VARIANT: Record<string, BadgeVariant> = {
  scheduled: 'secondary',
  overdue: 'destructive',
  completed: 'default',
};

const DEVICE_VARIANT: Record<string, BadgeVariant> = {
  active: 'default',
  maintenance: 'secondary',
  retired: 'ghost',
};

/** A ticket's lifecycle state, coloured by how far along it is. */
export function TicketStatusBadge({
  value,
}: {
  readonly value: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={TICKET_STATUS_VARIANT[value] ?? 'outline'}>
      {t(ticketStatusKey(value), { defaultValue: value })}
    </Badge>
  );
}

export function TicketPriorityBadge({
  value,
}: {
  readonly value: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={PRIORITY_VARIANT[value] ?? 'outline'}>
      {t(ticketPriorityKey(value), { defaultValue: value })}
    </Badge>
  );
}

export function InspectionStatusBadge({
  value,
}: {
  readonly value: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={INSPECTION_VARIANT[value] ?? 'outline'}>
      {t(inspectionStatusKey(value), { defaultValue: value })}
    </Badge>
  );
}

export function DeviceStatusBadge({
  value,
}: {
  readonly value: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={DEVICE_VARIANT[value] ?? 'outline'}>
      {t(deviceStatusKey(value), { defaultValue: value })}
    </Badge>
  );
}

/** Marks a ticket an observer may not read, and which can never be shared. */
export function ConfidentialBadge({
  className,
}: {
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant='destructive' className={cn('gap-1', className)}>
      <LockIcon />
      {t('service.ticket.confidential')}
    </Badge>
  );
}

/**
 * A ticket whose automatic acceptance failed. The scheduler retries, but the
 * supervisor needs to see which ones are waiting, so the state is surfaced.
 */
export function AcceptanceBadge({
  status,
  error,
}: {
  readonly status: string | null;
  readonly error: string | null;
}): ReactElement | null {
  const { t } = useTranslation();
  if (status !== 'failed') return null;
  return (
    <Badge variant='destructive' title={error ?? undefined}>
      {t('service.ticket.acceptanceFailed')}
    </Badge>
  );
}
