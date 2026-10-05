/**
 * Dashboard — the supervisor's and the engineer's view of the same numbers.
 *
 * Every figure comes from `GET /api/service/dashboard`, which applies the same
 * record-level scope as the work-order list, so a number and the filtered list
 * behind it always agree.
 */
import { type ReactElement, useCallback } from 'react';
import { Link } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRightIcon, ClipboardListIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useServiceApi } from './api.js';
import { useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  ServicePage,
  StatCard,
  StatusBadge,
} from './parts.js';
import type { DashboardView } from './types.js';

export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const state = useLoad(
    useCallback(() => api.get<DashboardView>('/dashboard'), [api]),
  );

  return (
    <ServicePage
      title={t('service.dashboard.title')}
      description={t('service.dashboard.description')}
      actions={
        <Button render={<Link to='/service/work-orders' />}>
          <ClipboardListIcon className='size-4' />
          {t('service.dashboard.openWorkOrders')}
        </Button>
      }
    >
      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}
      {state.data ? <DashboardBody view={state.data} /> : null}
    </ServicePage>
  );
}

function DashboardBody({
  view,
}: {
  readonly view: DashboardView;
}): ReactElement {
  const { t } = useTranslation();
  const totals = view.totals;
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          label={t('service.dashboard.total')}
          value={totals.total}
          hint={t('service.dashboard.totalHint')}
        />
        <StatCard
          label={t('service.dashboard.open')}
          value={totals.open}
          hint={t('service.dashboard.openHint')}
        />
        <StatCard
          label={t('service.dashboard.overdue')}
          value={totals.overdue}
          tone={totals.overdue > 0 ? 'destructive' : 'default'}
          hint={t('service.dashboard.overdueHint')}
        />
        <StatCard
          label={t('service.dashboard.urgent')}
          value={totals.urgent}
          tone={totals.urgent > 0 ? 'warning' : 'default'}
          hint={t('service.dashboard.urgentHint')}
        />
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('service.dashboard.byStatus')}
            </CardTitle>
            <CardDescription>
              {t('service.dashboard.byStatusHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {view.statuses.map((entry) => (
              <Link
                key={entry.status}
                to={`/service/work-orders?status=${encodeURIComponent(entry.status)}`}
                className='flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent'
              >
                <StatusBadge status={entry.status} />
                <span className='flex items-center gap-2 font-medium'>
                  {entry.count}
                  <ArrowRightIcon className='size-3.5 text-muted-foreground' />
                </span>
              </Link>
            ))}
            {view.mine ? (
              <p className='pt-2 text-xs text-muted-foreground'>
                {t('service.dashboard.mine', {
                  open: view.mine.open,
                  total: view.mine.total,
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('service.dashboard.workload')}
            </CardTitle>
            <CardDescription>
              {t('service.dashboard.workloadHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.groups.length === 0 ? (
              <EmptyState message={t('service.dashboard.noWorkload')} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.dashboard.engineer')}</TableHead>
                    <TableHead className='text-right'>
                      {t('service.dashboard.open')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('service.dashboard.total')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.groups.map((group) => (
                    <GroupRows key={group.id} group={group} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GroupRows({
  group,
}: {
  readonly group: DashboardView['groups'][number];
}): ReactElement {
  return (
    <>
      <TableRow>
        <TableCell colSpan={3} className='bg-muted/40 font-medium'>
          {group.name ?? '—'}
        </TableCell>
      </TableRow>
      {group.engineers.map((engineer) => (
        <TableRow key={engineer.id}>
          <TableCell>{engineer.name ?? engineer.ref ?? '—'}</TableCell>
          <TableCell className='text-right'>{engineer.open}</TableCell>
          <TableCell className='text-right'>{engineer.total}</TableCell>
        </TableRow>
      ))}
    </>
  );
}
