import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  ClipboardListIcon,
  PlusIcon,
  UsersIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { buttonVariants } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';

import { getDashboard } from '../tickets/api.js';
import { TicketStatusBadge, UrgencyBadge } from '../tickets/labels.js';
import type {
  Ticket,
  TicketDashboard,
  TicketStatus,
} from '../tickets/types.js';

const COUNT_ORDER: readonly TicketStatus[] = [
  'pending',
  'processing',
  'resolved',
  'closed',
];

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [dashboard, setDashboard] = useState<TicketDashboard>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getDashboard(api);
        if (!cancelled) setDashboard(result);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiClientError
            ? caught.message
            : t('dashboard.error.load'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, t]);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Link to='/tickets/new' className={buttonVariants()}>
            <PlusIcon data-icon='inline-start' />
            {t('tickets.report')}
          </Link>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!dashboard && !error ? (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {COUNT_ORDER.map((status) => (
            <Skeleton key={status} className='h-28 w-full' />
          ))}
        </div>
      ) : null}

      {dashboard ? (
        <>
          <section
            aria-label={t('dashboard.counts')}
            className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
          >
            {COUNT_ORDER.map((status) => (
              <Card key={status}>
                <CardHeader>
                  <CardDescription>
                    {t(`tickets.status.${status}`)}
                  </CardDescription>
                  <CardTitle className='text-3xl tabular-nums'>
                    {dashboard.counts[status] ?? 0}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <div className='grid gap-6 lg:grid-cols-2'>
            <TicketColumn
              icon={<ClipboardListIcon className='size-4' aria-hidden />}
              title={t('dashboard.pendingAssignment.title')}
              description={t('dashboard.pendingAssignment.description')}
              tickets={dashboard.pendingAssignment}
              emptyLabel={t('dashboard.pendingAssignment.empty')}
            />
            <TicketColumn
              icon={<AlertTriangleIcon className='size-4' aria-hidden />}
              title={t('dashboard.overdue.title')}
              description={t('dashboard.overdue.description')}
              tickets={dashboard.overdue}
              emptyLabel={t('dashboard.overdue.empty')}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <UsersIcon className='size-4' aria-hidden />
                {t('dashboard.workload.title')}
              </CardTitle>
              <CardDescription>
                {t('dashboard.workload.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.workload.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('dashboard.workload.empty')}
                </p>
              ) : (
                <ul className='flex flex-col divide-y divide-border'>
                  {dashboard.workload.map((engineer) => (
                    <li
                      key={engineer.id}
                      className='flex items-center justify-between gap-4 py-3 text-sm'
                    >
                      <span className='font-medium'>
                        {engineer.name ?? engineer.username ?? engineer.id}
                      </span>
                      <span className='text-muted-foreground'>
                        {t('dashboard.workload.open', {
                          count: engineer.processing,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className='flex justify-end'>
            <Link
              to='/tickets'
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('dashboard.viewAll')}
            </Link>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

function TicketColumn({
  icon,
  title,
  description,
  tickets,
  emptyLabel,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly tickets: readonly Ticket[];
  readonly emptyLabel: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>{icon}</EmptyMedia>
              <EmptyTitle>{emptyLabel}</EmptyTitle>
              <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className='flex flex-col divide-y divide-border'>
            {tickets.map((ticket) => (
              <li key={ticket.id} className='py-3'>
                <Link
                  to={`/tickets/${ticket.id}`}
                  className='flex flex-wrap items-center justify-between gap-2 text-sm'
                >
                  <span className='font-medium underline-offset-4 hover:underline'>
                    #{ticket.id} {ticket.title}
                  </span>
                  <span className='flex items-center gap-2'>
                    <UrgencyBadge urgency={ticket.urgency} />
                    <TicketStatusBadge status={ticket.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
