/**
 * The status, priority and level chips the service pages share.
 *
 * Each one is only a translation of a value the API sent into a `Badge`; the
 * colour never carries a meaning the text does not also state.
 */

import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type {
  WorkOrderPriority,
  WorkOrderStatus,
} from './types.js';

const STATUS_VARIANTS: Readonly<
  Record<WorkOrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'>
> = {
  pending_acceptance: 'destructive',
  pending_processing: 'outline',
  processing: 'default',
  pending_confirmation: 'secondary',
  closed: 'outline',
};

export function WorkOrderStatusBadge({
  status,
}: {
  readonly status: WorkOrderStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {t(`service.workOrder.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: WorkOrderPriority;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={priority === 'urgent' ? 'destructive' : 'outline'}>
      {t(`service.workOrder.priority.${priority}`, { defaultValue: priority })}
    </Badge>
  );
}

export function InspectionStatusBadge({
  status,
}: {
  readonly status: 'pending' | 'completed' | 'skipped';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={status === 'completed' ? 'secondary' : 'outline'}>
      {t(`service.inspection.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function ManualStatusBadge({
  status,
}: {
  readonly status: 'draft' | 'published' | 'indexed' | 'failed';
}): ReactElement {
  const { t } = useTranslation();
  const variant =
    status === 'indexed'
      ? 'default'
      : status === 'failed'
        ? 'destructive'
        : status === 'published'
          ? 'secondary'
          : 'outline';
  return (
    <Badge variant={variant}>
      {t(`service.manual.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function NoteStatusBadge({
  status,
}: {
  readonly status: 'draft' | 'published';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={status === 'published' ? 'secondary' : 'outline'}>
      {t(`service.note.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function CustomerLevelBadge({
  level,
}: {
  readonly level: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={level === 'normal' ? 'outline' : 'secondary'}>
      {t(`service.customer.level.${level}`, {
        defaultValue: level,
      })}
    </Badge>
  );
}
