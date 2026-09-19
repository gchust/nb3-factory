import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  fetchExpenseStatistics,
  type ExpenseStatistics,
} from './expenses/api.js';
import {
  STATUS_ORDER,
  formatAmount,
  statusLabelKey,
} from './expenses/constants.js';
import { expenseErrorMessage } from './expenses/errors.js';
import { useExpenseInvalidation } from './expenses/refresh.js';
import { EmptyState, Notice, Panel, StatusBadge } from './expenses/shared.jsx';

export default function ExpenseStatisticsPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const [stats, setStats] = useState<ExpenseStatistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const invalidation = useExpenseInvalidation();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetchExpenseStatistics(api, { scope: 'all' });
        if (!controller.signal.aborted) setStats(result);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(expenseErrorMessage(caught, t('expenses.loadFailed'), t));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, invalidation, t]);

  if (loading) {
    return (
      <PageContainer>
        <Loading className='py-16' />
      </PageContainer>
    );
  }

  const maxCategoryAmount = Math.max(
    1,
    ...(stats?.byCategory.map((row) => row.amount) ?? [1]),
  );
  const statusTotals = new Map(
    (stats?.byStatus ?? []).map((row) => [row.status, row]),
  );

  return (
    <PageContainer>
      <PageHeader
        description={t('expenses.statistics.description')}
        title={t('expenses.statistics.title')}
      />

      {error ? <Notice tone='error'>{error}</Notice> : null}

      <div className='grid gap-4 sm:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.statistics.totalAmount')}</CardTitle>
          </CardHeader>
          <CardContent className='text-2xl font-semibold'>
            {formatAmount(stats?.totalAmount ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.statistics.reportCount')}</CardTitle>
          </CardHeader>
          <CardContent className='text-2xl font-semibold'>
            {stats?.reportCount ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.statistics.itemCount')}</CardTitle>
          </CardHeader>
          <CardContent className='text-2xl font-semibold'>
            {stats?.itemCount ?? 0}
          </CardContent>
        </Card>
      </div>

      <Panel title={t('expenses.statistics.byCategory')}>
        {(stats?.byCategory.length ?? 0) === 0 ? (
          <EmptyState title={t('expenses.statistics.empty')} />
        ) : (
          <ul className='space-y-3'>
            {stats?.byCategory.map((row, index) => (
              <li className='space-y-1' key={row.categoryId}>
                <div className='flex items-center justify-between text-sm'>
                  <span className='font-medium'>{row.categoryName}</span>
                  <span className='text-muted-foreground'>
                    {formatAmount(row.amount)} ·{' '}
                    {t('expenses.statistics.entries', { count: row.count })}
                  </span>
                </div>
                <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
                  <div
                    aria-hidden='true'
                    className='h-full rounded-full'
                    style={{
                      backgroundColor: `var(--chart-${(index % 5) + 1})`,
                      width: `${Math.max(
                        4,
                        Math.round((row.amount / maxCategoryAmount) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel title={t('expenses.statistics.byStatus')}>
          <ul className='space-y-3'>
            {STATUS_ORDER.map((status) => {
              const row = statusTotals.get(status);
              if (!row) return null;
              return (
                <li
                  className='flex items-center justify-between gap-2 text-sm'
                  key={status}
                >
                  <StatusBadge status={status} />
                  <span className='text-muted-foreground'>
                    {row.count} · {formatAmount(row.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title={t('expenses.statistics.byDepartment')}>
          {(stats?.byDepartment.length ?? 0) === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('expenses.statistics.empty')}
            </p>
          ) : (
            <ul className='space-y-2'>
              {stats?.byDepartment.map((row) => (
                <li
                  className='flex items-center justify-between gap-2 text-sm'
                  key={row.departmentId}
                >
                  <span className='font-medium'>{row.departmentName}</span>
                  <span className='text-muted-foreground'>
                    {row.count} · {formatAmount(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className='text-xs text-muted-foreground'>
        {t('expenses.statistics.note')}{' '}
        {STATUS_ORDER.map((status) => t(statusLabelKey(status))).join(' / ')}
      </p>
    </PageContainer>
  );
}
