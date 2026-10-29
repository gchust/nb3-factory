import { useTranslation } from '@nocobase/i18n/client';
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  InboxIcon,
  PlusIcon,
  UsersIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { cn } from 'cn';

import {
  errorText,
  useTicketLabels,
  useTicketPermission,
  useTicketsApi,
  type Ticket,
  type TicketDashboard,
  type TicketState,
} from '../tickets/shared.js';

function statusBadge(status: TicketState) {
  return status === 'escalated'
    ? 'destructive'
    : status === 'processing'
      ? 'default'
      : status === 'resolved'
        ? 'secondary'
        : 'outline';
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { formatDate, priority, status } = useTicketLabels();
  const canCreate = useTicketPermission('create');
  const canAssign = useTicketPermission('assign');
  const request = useTicketsApi<{ data: TicketDashboard }>('tickets/dashboard');
  const dashboard = request.data?.data;

  const summary = dashboard?.summary;
  const cards = [
    {
      key: 'active',
      value: summary?.active ?? 0,
      hint: t('helpdesk.dashboard.summary.activeHint'),
      icon: ActivityIcon,
      attention: false,
    },
    {
      key: 'unassigned',
      value: summary?.unassigned ?? 0,
      hint: t('helpdesk.dashboard.summary.unassignedHint'),
      icon: InboxIcon,
      attention: false,
    },
    {
      key: 'overdue',
      value: summary?.overdue ?? 0,
      hint: t('helpdesk.dashboard.summary.overdueHint'),
      icon: AlertTriangleIcon,
      attention: (summary?.overdue ?? 0) > 0,
    },
    {
      key: 'resolved',
      value: summary?.resolved ?? 0,
      hint: t('helpdesk.dashboard.summary.resolvedHint'),
      icon: CheckCircle2Icon,
      attention: false,
    },
  ] as const;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('helpdesk.dashboard.title')}
        description={t('helpdesk.dashboard.description')}
        actions={
          canCreate ? (
            <Button nativeButton={false} render={<Link to='/tickets/new' />}>
              <PlusIcon />
              {t('helpdesk.newTicket')}
            </Button>
          ) : undefined
        }
      />

      {request.error ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('helpdesk.dashboard.loadFailed')}
            <span className='block text-xs opacity-80'>
              {errorText(request.error, '')}
            </span>
            <Button variant='outline' size='sm' onClick={request.reload}>
              {t('helpdesk.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : request.loading && !dashboard ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {cards.map((card) => (
              <Skeleton key={card.key} className='h-32 w-full' />
            ))}
          </div>
          <div className='grid gap-4 lg:grid-cols-2'>
            <Skeleton className='h-72 w-full' />
            <Skeleton className='h-72 w-full' />
          </div>
        </>
      ) : (
        <>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.key}
                  className={cn(card.attention && 'border-destructive/40')}
                >
                  <CardHeader className='flex flex-row items-center justify-between gap-2 pb-2'>
                    <CardTitle className='text-sm font-medium text-muted-foreground'>
                      {t(`helpdesk.dashboard.summary.${card.key}`)}
                    </CardTitle>
                    <span
                      className={cn(
                        'flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                        card.attention && 'bg-destructive/10 text-destructive',
                      )}
                    >
                      <Icon className='size-4' aria-hidden />
                    </span>
                  </CardHeader>
                  <CardContent>
                    <p className='text-3xl font-semibold tracking-tight'>
                      {card.value}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {card.hint}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <TicketQueue
              title={t('helpdesk.dashboard.unassignedTitle')}
              description={t('helpdesk.dashboard.unassignedDescription')}
              empty={t('helpdesk.dashboard.unassignedEmpty')}
              tickets={dashboard?.unassigned ?? []}
              href='/tickets?status=pending'
              viewAll={t('helpdesk.dashboard.viewTickets')}
              formatDate={formatDate}
              priority={priority}
              status={status}
            />
            <TicketQueue
              title={t('helpdesk.dashboard.overdueTitle')}
              description={t('helpdesk.dashboard.overdueDescription')}
              empty={t('helpdesk.dashboard.overdueEmpty')}
              tickets={dashboard?.overdue ?? []}
              href='/tickets?status=escalated'
              viewAll={t('helpdesk.dashboard.viewTickets')}
              formatDate={formatDate}
              priority={priority}
              status={status}
              attention
            />
          </div>

          {canAssign ? (
            <Card>
              <CardHeader className='flex flex-row items-start justify-between gap-3'>
                <div className='space-y-1'>
                  <CardTitle
                    role='heading'
                    aria-level={2}
                    className='flex items-center gap-2'
                  >
                    <UsersIcon className='size-4 text-muted-foreground' />
                    {t('helpdesk.dashboard.workloadTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('helpdesk.dashboard.workloadDescription')}
                  </CardDescription>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  nativeButton={false}
                  render={<Link to='/tickets?status=processing' />}
                >
                  {t('helpdesk.dashboard.viewTickets')}
                </Button>
              </CardHeader>
              <CardContent>
                {(dashboard?.workload.length ?? 0) === 0 ? (
                  <p className='py-6 text-center text-sm text-muted-foreground'>
                    {t('helpdesk.dashboard.workloadEmpty')}
                  </p>
                ) : (
                  <ul className='divide-y'>
                    {dashboard?.workload.map((engineer) => (
                      <li
                        key={engineer.id}
                        className='flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0'
                      >
                        <div className='min-w-0'>
                          <p className='truncate font-medium'>
                            {engineer.name}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {t('helpdesk.dashboard.workloadActive', {
                              count: engineer.active,
                            })}
                          </p>
                        </div>
                        {engineer.escalated > 0 ? (
                          <Badge variant='destructive'>
                            {t('helpdesk.dashboard.workloadEscalated', {
                              count: engineer.escalated,
                            })}
                          </Badge>
                        ) : (
                          <Badge variant='outline'>
                            {t('helpdesk.status.processing')}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}

function TicketQueue({
  title,
  description,
  empty,
  tickets,
  href,
  viewAll,
  formatDate,
  priority,
  status,
  attention = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly empty: string;
  readonly tickets: readonly Ticket[];
  readonly href: string;
  readonly viewAll: string;
  readonly formatDate: (value: string | null | undefined) => string;
  readonly priority: (value: Ticket['priority']) => string;
  readonly status: (value: TicketState) => string;
  readonly attention?: boolean;
}): ReactElement {
  return (
    <Card className={cn(attention && 'border-destructive/30')}>
      <CardHeader className='flex flex-row items-start justify-between gap-3'>
        <div className='space-y-1'>
          <CardTitle role='heading' aria-level={2}>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          variant='ghost'
          size='sm'
          nativeButton={false}
          render={<Link to={href} />}
        >
          {viewAll}
          <ArrowRightIcon data-icon='inline-end' />
        </Button>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {empty}
          </p>
        ) : (
          <ul className='divide-y'>
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/tickets/${encodeURIComponent(ticket.id)}`}
                  className='flex flex-col gap-2 py-3 first:pt-0 last:pb-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-mono text-xs text-muted-foreground'>
                      {ticket.ticketNo}
                    </span>
                    <Badge variant={statusBadge(ticket.status)}>
                      {status(ticket.status)}
                    </Badge>
                    <Badge variant='outline'>{priority(ticket.priority)}</Badge>
                  </div>
                  <p className='truncate font-medium'>{ticket.title}</p>
                  <p className='text-xs text-muted-foreground'>
                    {formatDate(ticket.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
