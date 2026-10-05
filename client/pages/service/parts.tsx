/** Small shared pieces of the after-sales service pages. */
import { type ReactElement, type ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Loader2, RefreshCwIcon } from 'lucide-react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ServicePage({
  actions,
  children,
  description,
  title,
}: {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly description?: ReactNode;
  readonly title: ReactNode;
}): ReactElement {
  return (
    <PageContainer>
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </PageContainer>
  );
}

export function Loading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
      <Loader2 className='size-4 animate-spin' />
      {t('service.common.loading')}
    </div>
  );
}

export function LoadFailure({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card className='border-destructive/40'>
      <CardHeader>
        <CardTitle className='text-base'>
          {t('service.common.loadFailed')}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant='outline' size='sm' onClick={onRetry}>
          <RefreshCwIcon className='size-4' />
          {t('service.common.retry')}
        </Button>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  message,
}: {
  readonly message: ReactNode;
}): ReactElement {
  return (
    <div className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'>
      {message}
    </div>
  );
}

export function StatCard({
  hint,
  label,
  tone,
  value,
}: {
  readonly hint?: string;
  readonly label: ReactNode;
  readonly tone?: 'default' | 'warning' | 'destructive' | 'success';
  readonly value: ReactNode;
}): ReactElement {
  const toneClass =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : '';
  return (
    <Card>
      <CardContent className='space-y-1 py-5'>
        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          {label}
        </p>
        <p className={`font-heading text-3xl font-semibold ${toneClass}`}>
          {value}
        </p>
        {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_TONE: Record<string, BadgeVariant> = {
  pending_acceptance: 'secondary',
  pending_processing: 'outline',
  processing: 'default',
  pending_confirmation: 'secondary',
  closed: 'outline',
  pending: 'secondary',
  in_progress: 'default',
  overdue: 'destructive',
  done: 'outline',
  received: 'secondary',
  duplicate: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  not_indexed: 'outline',
  indexed: 'default',
  failed: 'destructive',
};

export function StatusBadge({
  status,
}: {
  readonly status: string | null;
}): ReactElement {
  const { t } = useTranslation();
  const key = status ?? 'unknown';
  const label = t(`service.status.${key}`);
  return (
    <Badge variant={STATUS_TONE[key] ?? 'outline'}>
      {label === `service.status.${key}` ? key : label}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: string | null;
}): ReactElement {
  const { t } = useTranslation();
  if (priority === 'urgent') {
    return <Badge variant='destructive'>{t('service.priority.urgent')}</Badge>;
  }
  return <Badge variant='outline'>{t('service.priority.normal')}</Badge>;
}

export function Pagination({
  onPage,
  page,
  pageSize,
  total,
}: {
  readonly onPage: (page: number) => void;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}): ReactElement | null {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) {
    return null;
  }
  return (
    <div className='flex items-center justify-between text-sm text-muted-foreground'>
      <span>{t('service.common.totalRows', { total })}</span>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t('service.common.previous')}
        </Button>
        <span>{t('service.common.pageOf', { page, pageCount })}</span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          {t('service.common.next')}
        </Button>
      </div>
    </div>
  );
}
