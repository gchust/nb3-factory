import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import {
  priorityLabelKey,
  statusLabelKey,
  type BadgeVariant,
  type Priority,
  type WorkOrderStatus,
} from './model.js';

const STATUS_VARIANTS: Readonly<Record<WorkOrderStatus, BadgeVariant>> = {
  pending_accept: 'destructive',
  pending_handle: 'default',
  processing: 'secondary',
  pending_confirm: 'outline',
  closed: 'secondary',
};

export function StatusBadge({
  status,
}: {
  readonly status: WorkOrderStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status]}>{t(statusLabelKey(status))}</Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: Priority;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={priority === 'urgent' ? 'destructive' : 'outline'}>
      {t(priorityLabelKey(priority))}
    </Badge>
  );
}

export function LoadingState({
  label,
  className,
}: {
  readonly label?: string;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner className='size-4' />
      {label ?? t('service.loading')}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive' className={className}>
      <AlertCircleIcon />
      <AlertTitle>{t('service.loadFailed')}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={onRetry}
            className='mt-2'
          >
            <RefreshCwIcon data-icon='inline-start' />
            {t('service.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
