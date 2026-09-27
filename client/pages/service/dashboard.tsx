import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import { useMemo, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useIdentity, useResource, useServiceApi } from '../../service/api.js';
import { asText, formatDateTime } from '../../service/format.js';
import {
  AlertNotice,
  QueryState,
  RegionBadge,
  SectionCard,
  StatCard,
  StatusBadge,
} from '../../service/ui.js';

/**
 * The service dashboard — scoped totals for the signed-in user.
 *
 * Every number comes from `GET /service/dashboard`, which narrows the tickets,
 * devices and customers in SQL to what this identity may see, so the figures
 * never describe records the user cannot open.
 */
export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const identity = useIdentity();
  const dashboard = useResource('service:dashboard', () => api.dashboard());

  const counts = dashboard.data?.counts;
  const statusRows = useMemo(() => {
    const byStatus = counts?.tickets.byStatus ?? {};
    return [
      'draft',
      'pending_assignment',
      'in_progress',
      'pending_confirmation',
      'closed',
      'cancelled',
    ]
      .map((status) => ({ status, count: byStatus[status] ?? 0 }))
      .filter((row) => row.count > 0);
  }, [counts]);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
        actions={
          <Button variant='outline' size='sm' onClick={dashboard.reload}>
            {t('service.common.refresh')}
          </Button>
        }
      />

      {identity.data ? (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm text-muted-foreground'>
            {t('service.dashboard.scope')}
          </span>
          {identity.data.regions.length > 0 ? (
            identity.data.regions.map((region) => (
              <RegionBadge key={region} value={region} />
            ))
          ) : (
            <span className='text-sm'>
              {t('service.dashboard.scopeLinked')}
            </span>
          )}
        </div>
      ) : null}

      <QueryState
        loading={dashboard.loading}
        error={dashboard.error}
        onRetry={dashboard.reload}
      >
        {dashboard.data ? (
          <>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                label={t('service.dashboard.ticketsTotal')}
                value={counts?.tickets.total ?? 0}
              />
              <StatCard
                label={t('service.dashboard.inProgress')}
                value={counts?.tickets.byStatus?.in_progress ?? 0}
                hint={t('service.dashboard.pendingAssignmentHint', {
                  count: counts?.tickets.byStatus?.pending_assignment ?? 0,
                })}
              />
              <StatCard
                label={t('service.dashboard.overdue')}
                value={counts?.tickets.overdue ?? 0}
                tone={
                  (counts?.tickets.overdue ?? 0) > 0
                    ? 'destructive'
                    : 'secondary'
                }
              />
              {identity.data?.internalFields ? (
                <StatCard
                  label={t('service.dashboard.confidential')}
                  value={counts?.tickets.confidential ?? 0}
                  tone='secondary'
                />
              ) : (
                <StatCard
                  label={t('service.dashboard.customers')}
                  value={counts?.customers.total ?? 0}
                />
              )}
            </div>

            <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
              <StatCard
                label={t('service.dashboard.devices')}
                value={counts?.devices.total ?? 0}
                hint={t('service.dashboard.devicesEnabled', {
                  count: counts?.devices.enabled ?? 0,
                })}
              />
              <StatCard
                label={t('service.dashboard.inspectionsToday')}
                value={counts?.inspections.today ?? 0}
                hint={t('service.dashboard.inspectionsPending', {
                  count: counts?.inspections.pending ?? 0,
                })}
              />
              <StatCard
                label={t('service.dashboard.knowledgePublished')}
                value={counts?.knowledge.published ?? 0}
                hint={t('service.dashboard.knowledgeDraft', {
                  count: counts?.knowledge.draft ?? 0,
                })}
              />
              <StatCard
                label={t('service.dashboard.deliveryIssues')}
                value={
                  (counts?.deliveries.failed ?? 0) +
                  (counts?.deliveries.notConfigured ?? 0)
                }
                tone={
                  (counts?.deliveries.failed ?? 0) > 0
                    ? 'destructive'
                    : 'secondary'
                }
                hint={t('service.dashboard.deliveryFailed', {
                  count: counts?.deliveries.failed ?? 0,
                })}
              />
            </div>

            <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
              <SectionCard title={t('service.dashboard.byStatus')}>
                {statusRows.length > 0 ? (
                  <ul className='space-y-2'>
                    {statusRows.map((row) => (
                      <li
                        key={row.status}
                        className='flex items-center justify-between gap-3'
                      >
                        <StatusBadge kind='ticket' value={row.status} />
                        <span className='text-sm tabular-nums'>
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.common.empty')}
                  </p>
                )}
              </SectionCard>

              <SectionCard
                title={t('service.dashboard.recentTickets')}
                className='xl:col-span-2'
              >
                <TicketMiniTable
                  rows={dashboard.data.recentTickets}
                  emptyLabel={t('service.common.empty')}
                />
              </SectionCard>
            </div>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between'>
                <CardTitle>{t('service.dashboard.overdueTickets')}</CardTitle>
                <Button
                  variant='outline'
                  size='sm'
                  render={<Link to='/service/tickets?overdue=true' />}
                >
                  {t('service.dashboard.openTickets')}
                </Button>
              </CardHeader>
              <CardContent>
                {dashboard.data.overdueTickets.length > 0 ? (
                  <TicketMiniTable
                    rows={dashboard.data.overdueTickets}
                    emptyLabel={t('service.common.empty')}
                  />
                ) : (
                  <AlertNotice title={t('service.dashboard.noOverdue')}>
                    {t('service.dashboard.noOverdueHint')}
                  </AlertNotice>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}

interface TicketMiniTableProps {
  readonly rows: readonly {
    readonly id: number;
    readonly serial?: unknown;
    readonly title?: unknown;
    readonly status?: unknown;
    readonly priority?: unknown;
    readonly dueAt?: unknown;
  }[];
  readonly emptyLabel: string;
}

function TicketMiniTable({
  rows,
  emptyLabel,
}: TicketMiniTableProps): ReactElement {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <p className='text-sm text-muted-foreground'>{emptyLabel}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('service.tickets.serial')}</TableHead>
          <TableHead>{t('service.tickets.titleColumn')}</TableHead>
          <TableHead>{t('service.tickets.status')}</TableHead>
          <TableHead>{t('service.tickets.priority')}</TableHead>
          <TableHead>{t('service.tickets.dueAt')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link
                className='font-medium hover:underline'
                to={`/service/tickets/${row.id}`}
              >
                {asText(row.serial) || asText(row.id)}
              </Link>
            </TableCell>
            <TableCell className='max-w-72 truncate'>
              {asText(row.title)}
            </TableCell>
            <TableCell>
              <StatusBadge kind='ticket' value={row.status} />
            </TableCell>
            <TableCell>
              <StatusBadge kind='priority' value={row.priority} />
            </TableCell>
            <TableCell className='text-sm text-muted-foreground'>
              {formatDateTime(row.dueAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
