import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

export function TaskStatusBadge({ status }: { status: string }): ReactElement {
  const { t } = useTranslation();
  const label =
    status === 'pending'
      ? t('inspection.taskStatus.pending')
      : status === 'in_progress'
        ? t('inspection.taskStatus.in_progress')
        : status === 'submitted'
          ? t('inspection.taskStatus.submitted')
          : status;
  const variant = status === 'submitted' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{label}</Badge>;
}

export function RepairStatusBadge({
  status,
}: {
  status: string;
}): ReactElement {
  const { t } = useTranslation();
  const label =
    status === 'pending'
      ? t('inspection.repairStatus.pending')
      : status === 'processing'
        ? t('inspection.repairStatus.processing')
        : status === 'review'
          ? t('inspection.repairStatus.review')
          : status === 'closed'
            ? t('inspection.repairStatus.closed')
            : status === 'returned'
              ? t('inspection.repairStatus.returned')
              : status;
  const variant =
    status === 'closed'
      ? 'secondary'
      : status === 'review'
        ? 'default'
        : 'outline';
  return <Badge variant={variant}>{label}</Badge>;
}

export function PriorityBadge({
  priority,
}: {
  priority: string;
}): ReactElement {
  const { t } = useTranslation();
  const label =
    priority === 'low'
      ? t('inspection.priority.low')
      : priority === 'normal'
        ? t('inspection.priority.normal')
        : priority === 'high'
          ? t('inspection.priority.high')
          : priority === 'urgent'
            ? t('inspection.priority.urgent')
            : priority;
  return <Badge variant='outline'>{label}</Badge>;
}

export function EquipmentStatusBadge({
  status,
}: {
  status: string;
}): ReactElement {
  const { t } = useTranslation();
  const label =
    status === 'running'
      ? t('inspection.equipmentStatus.running')
      : status === 'idle'
        ? t('inspection.equipmentStatus.idle')
        : status === 'maintenance'
          ? t('inspection.equipmentStatus.maintenance')
          : status === 'retired'
            ? t('inspection.equipmentStatus.retired')
            : status;
  const variant = status === 'running' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{label}</Badge>;
}
