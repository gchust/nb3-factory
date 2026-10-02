import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import {
  EQUIPMENT_STATUS_LABEL,
  INSPECTION_STATUS_LABEL,
  WORK_ORDER_PRIORITY_LABEL,
  WORK_ORDER_STATUS_LABEL,
} from './data.js';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending_acceptance: 'outline',
  pending_processing: 'secondary',
  processing: 'default',
  pending_confirmation: 'secondary',
  closed: 'outline',
  returned: 'destructive',
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

const INSPECTION_VARIANT: Record<string, BadgeVariant> = {
  pending: 'outline',
  done: 'secondary',
  overdue: 'destructive',
  skipped: 'outline',
};

export function WorkOrderStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = WORK_ORDER_STATUS_LABEL[status];
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {key ? t(key) : status}
    </Badge>
  );
}

export function WorkOrderPriorityBadge({
  priority,
}: {
  readonly priority: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = WORK_ORDER_PRIORITY_LABEL[priority];
  return (
    <Badge variant={PRIORITY_VARIANT[priority] ?? 'outline'}>
      {key ? t(key) : priority}
    </Badge>
  );
}

export function InspectionStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = INSPECTION_STATUS_LABEL[status];
  return (
    <Badge variant={INSPECTION_VARIANT[status] ?? 'outline'}>
      {key ? t(key) : status}
    </Badge>
  );
}

export function EquipmentStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = EQUIPMENT_STATUS_LABEL[status];
  return (
    <Badge variant={status === 'retired' ? 'destructive' : 'secondary'}>
      {key ? t(key) : status}
    </Badge>
  );
}

export interface StatCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly tone?: 'default' | 'warning' | 'success';
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: StatCardProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            'font-heading text-2xl tabular-nums',
            tone === 'warning' && 'text-destructive',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className='text-sm text-muted-foreground'>
          {hint}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function LoadingState(): ReactElement {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-9 w-full' />
      <Skeleton className='h-9 w-full' />
      <Skeleton className='h-9 w-full' />
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center'>
      <AlertCircleIcon className='size-5 text-destructive' />
      <p className='text-sm text-muted-foreground'>{message}</p>
      {onRetry ? (
        <button
          className='text-sm font-medium underline underline-offset-4'
          onClick={onRetry}
          type='button'
        >
          {t('status.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}): ReactElement {
  return (
    <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center'>
      <p className='font-medium'>{title}</p>
      {description ? (
        <p className='text-sm text-muted-foreground'>{description}</p>
      ) : null}
    </div>
  );
}
