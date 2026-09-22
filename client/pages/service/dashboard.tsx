import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { StatCard } from './components/stat-card.js';
import { TicketTable } from './components/ticket-table.js';
import {
  REGION_OPTIONS,
  TICKET_STATUS_OPTIONS,
  regionLabel,
  ticketStatusLabel,
} from './lib/format.js';
import { useServiceClient, useCaller } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const summary = useServiceQuery(() => client.dashboard(), 'dashboard');

  // The dashboard's recent list follows the same region/status filters as the
  // ticket list, so "filter then update" is exercised against live data.
  const recent = (summary.data?.recent ?? []).filter(
    (ticket) =>
      (regionFilter === 'all' || ticket.region === regionFilter) &&
      (statusFilter === 'all' || ticket.status === statusFilter),
  );

  return (
    <PageContainer>
      <PageHeader
        description={t('service.dashboard.description')}
        title={t('service.dashboard.title')}
      />
      {summary.loading && !summary.data ? <LoadingState /> : null}
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={summary.reload} />
      ) : null}
      {summary.data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <StatCard
              label={t('service.dashboard.total')}
              value={summary.data.total}
            />
            <StatCard
              label={t('service.dashboard.open')}
              tone='warn'
              value={summary.data.open}
            />
            <StatCard
              label={t('service.dashboard.todayInspections')}
              value={summary.data.todayOpenInspections}
              hint={t('service.dashboard.todayInspectionsHint')}
            />
            <StatCard
              label={t('service.dashboard.overdueInspections')}
              hint={t('service.dashboard.overdueInspectionsHint')}
              tone='danger'
              value={summary.data.overdueInspections}
            />
          </div>
          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.dashboard.byStatus')}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-wrap gap-6'>
                {TICKET_STATUS_OPTIONS.map((status) => (
                  <div key={status}>
                    <p className='text-xs text-muted-foreground'>
                      {ticketStatusLabel(t, status)}
                    </p>
                    <p className='font-heading text-2xl font-semibold'>
                      {summary.data?.byStatus[status] ?? 0}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.dashboard.byRegion')}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-wrap gap-6'>
                {Object.keys(summary.data.byRegion).length ? (
                  Object.entries(summary.data.byRegion).map(
                    ([region, count]) => (
                      <div key={region}>
                        <p className='text-xs text-muted-foreground'>
                          {regionLabel(t, region)}
                        </p>
                        <p className='font-heading text-2xl font-semibold'>
                          {count}
                        </p>
                      </div>
                    ),
                  )
                ) : (
                  <EmptyState message={t('service.dashboard.noWorkload')} />
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('service.dashboard.byAssignee')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {summary.data.byAssignee.length ? (
                summary.data.byAssignee.map((item) => (
                  <div
                    className='flex items-center justify-between gap-4 text-sm'
                    key={item.assigneeId}
                  >
                    <span>{item.name ?? item.assigneeId}</span>
                    <span className='font-mono text-muted-foreground'>
                      {item.count}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState message={t('service.dashboard.noWorkload')} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex-row items-center justify-between'>
              <CardTitle>{t('service.dashboard.myTasks')}</CardTitle>
              <Button
                render={<Link to='/service/tickets' />}
                size='sm'
                variant='ghost'
              >
                {t('service.dashboard.viewAll')}
              </Button>
            </CardHeader>
            <CardContent>
              {summary.data.myTasks.length ? (
                <TicketTable tickets={summary.data.myTasks} />
              ) : (
                <EmptyState message={t('service.dashboard.noTasks')} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex-row items-center justify-between gap-4'>
              <CardTitle>{t('service.dashboard.recent')}</CardTitle>
              <div className='flex flex-wrap items-center gap-2'>
                <div className='w-36'>
                  <Select
                    value={regionFilter}
                    onValueChange={(value) =>
                      setRegionFilter(value ? String(value) : 'all')
                    }
                  >
                    <SelectTrigger aria-label={t('service.tickets.region')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>
                        {t('service.common.all')}
                      </SelectItem>
                      {REGION_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {regionLabel(t, value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='w-36'>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) =>
                      setStatusFilter(value ? String(value) : 'all')
                    }
                  >
                    <SelectTrigger aria-label={t('service.tickets.status')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>
                        {t('service.common.all')}
                      </SelectItem>
                      {TICKET_STATUS_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {ticketStatusLabel(t, value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {recent.length ? (
                <TicketTable tickets={recent} />
              ) : (
                <EmptyState message={t('service.tickets.empty')} />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
      {caller.data ? (
        <p className='text-xs text-muted-foreground'>
          {t('service.dashboard.signedInAs', {
            name: caller.data.caller.name,
            region: regionLabel(t, caller.data.caller.region),
          })}
        </p>
      ) : null}
    </PageContainer>
  );
}
