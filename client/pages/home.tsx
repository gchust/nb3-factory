import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, ReceiptIcon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { Link } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, ProgressValue } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { fetchStats } from './expenses/claim-api.js';
import { formatAmount, formatMonth } from './expenses/claim-format.js';
import { ClaimStatusBadge } from './expenses/claim-status-badge.js';
import type { ExpenseStats } from './expenses/types.js';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);

  const [loaded, setLoaded] = useState<{
    readonly key: number;
    readonly stats?: ExpenseStats;
    readonly error?: unknown;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    fetchStats(api, {}, controller.signal).then(
      (stats) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: reloadCount, stats });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: reloadCount, error });
        }
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = loaded?.key !== reloadCount;
  const error = loading ? undefined : loaded?.error;
  const stats = loading ? undefined : loaded?.stats;

  return (
    <PageContainer>
      <PageHeader
        title={t('home.title')}
        description={t('home.description')}
        actions={
          <Button nativeButton={false} render={<Link to='/expenses' />}>
            <ReceiptIcon data-icon='inline-start' />
            {t('navigation.expenses')}
          </Button>
        }
      />

      {error instanceof ApiClientError && error.status === 401 ? (
        <SessionExpiredAlert />
      ) : null}

      {error && !(error instanceof ApiClientError && error.status === 401) ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('home.error.title')}</AlertTitle>
          <AlertDescription>{t('home.error.description')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {loading ? <Loading /> : null}

      {stats ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard
              label={t('home.totals.count')}
              value={String(stats.totals.count)}
              hint={t('home.totals.rejected', {
                count: stats.totals.rejectedCount,
              })}
            />
            <StatCard
              label={t('home.totals.totalAmount')}
              value={formatAmount(stats.totals.totalAmount)}
            />
            <StatCard
              label={t('home.totals.pendingAmount')}
              value={formatAmount(stats.totals.pendingAmount)}
              hint={t('home.totals.pendingHint')}
            />
            <StatCard
              label={t('home.totals.paidAmount')}
              value={formatAmount(stats.totals.paidAmount)}
            />
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('home.byMonth.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byMonth.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('home.byMonth.empty')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('home.byMonth.month')}</TableHead>
                        <TableHead className='text-right'>
                          {t('home.table.count')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('home.table.totalAmount')}
                        </TableHead>
                        <TableHead className='text-right'>
                          {t('home.table.paidAmount')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byMonth.map((bucket) => (
                        <TableRow key={bucket.month}>
                          <TableCell className='whitespace-nowrap'>
                            {formatMonth(bucket.month, locale)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {bucket.count}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatAmount(bucket.totalAmount)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {formatAmount(bucket.paidAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('home.byDepartment.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byDepartment.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('home.byDepartment.empty')}
                  </p>
                ) : (
                  <div className='space-y-4'>
                    {stats.byDepartment.map((bucket) => (
                      <div
                        key={bucket.departmentId ?? '__none__'}
                        className='space-y-2'
                      >
                        <div className='flex items-baseline justify-between gap-4 text-sm'>
                          <span>{bucket.departmentName}</span>
                          <span className='tabular-nums text-muted-foreground'>
                            {formatAmount(bucket.totalAmount)} ·{' '}
                            {t('home.table.count', { count: bucket.count })}
                          </span>
                        </div>
                        {/* The share of the largest department: a comparison between departments, not against a goal. */}
                        <Progress
                          value={share(bucket.totalAmount, stats.byDepartment)}
                        >
                          <ProgressValue />
                        </Progress>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className='lg:col-span-2'>
              <CardHeader>
                <CardTitle>{t('home.byStatus.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='flex flex-wrap gap-3'>
                  {stats.byStatus.map((bucket) => (
                    <div
                      key={bucket.status}
                      className='rounded-lg border px-4 py-3'
                    >
                      <ClaimStatusBadge status={bucket.status} />
                      <p className='mt-2 text-lg tabular-nums'>
                        {bucket.count}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {formatAmount(bucket.totalAmount)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-normal text-muted-foreground'>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-2xl font-semibold tabular-nums'>{value}</p>
        {hint ? (
          <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** How large a department's amount is relative to the largest one, as a 0-100 share. */
function share(
  amount: number,
  buckets: readonly { readonly totalAmount: number }[],
): number {
  const largest = buckets.reduce(
    (max, bucket) => Math.max(max, bucket.totalAmount),
    0,
  );
  if (largest <= 0) {
    return 0;
  }
  return Math.round((amount / largest) * 100);
}
