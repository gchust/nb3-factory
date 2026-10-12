import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  ClipboardListIcon,
  ClockIcon,
  FilePlus2Icon,
  InboxIcon,
  UsersIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { buttonVariants } from '#components/ui/button';
import { Button } from '#components/ui/button';
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
  EmptyTitle,
} from '#components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import {
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../tickets/ticket-badges.js';
import type { TicketOverview } from '../tickets/types.js';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [overview, setOverview] = useState<TicketOverview>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: TicketOverview }>({
        path: 'helpdesk/overview',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setOverview(data);
            setError(undefined);
          }
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) setError(cause);
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('helpdesk.dashboard.title')}
        description={t('helpdesk.dashboard.description')}
        actions={
          <Link className={buttonVariants()} to='/tickets/new'>
            <FilePlus2Icon />
            {t('helpdesk.tickets.new')}
          </Link>
        }
      />
      {error ? (
        <LoadError error={error} onRetry={() => setReloadCount((n) => n + 1)} />
      ) : overview === undefined ? (
        <Loading label={t('status.loading')} />
      ) : (
        <Dashboard overview={overview} />
      )}
    </PageContainer>
  );
}

function Dashboard({
  overview,
}: {
  readonly overview: TicketOverview;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const stats = [
    {
      key: 'pending',
      icon: InboxIcon,
      value: overview.stats.pending,
    },
    {
      key: 'overdue',
      icon: ClockIcon,
      value: overview.stats.overdue,
    },
    {
      key: 'open',
      icon: ClipboardListIcon,
      value: overview.stats.open,
    },
    {
      key: 'resolved',
      icon: ClipboardListIcon,
      value: overview.stats.resolved,
    },
    {
      key: 'total',
      icon: ClipboardListIcon,
      value: overview.stats.total,
    },
  ] as const;

  return (
    <div className='flex flex-col gap-6'>
      <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {stats.map(({ key, icon: Icon, value }) => (
          <li key={key}>
            <Card>
              <CardHeader>
                <CardDescription className='flex items-center gap-2'>
                  <Icon className='size-4' aria-hidden />
                  {t(`helpdesk.dashboard.stats.${key}`)}
                </CardDescription>
                <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>

      {overview.role === 'service-desk' ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UsersIcon className='size-4' aria-hidden />
              {t('helpdesk.dashboard.workload.title')}
            </CardTitle>
            <CardDescription>
              {t('helpdesk.dashboard.workload.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.workload.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('helpdesk.dashboard.workload.empty')}
              </p>
            ) : (
              <ul className='flex flex-col gap-2'>
                {overview.workload.map((engineer) => (
                  <li
                    key={engineer.id}
                    className='flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2'
                  >
                    <span className='text-sm font-medium'>{engineer.name}</span>
                    <span className='text-sm text-muted-foreground tabular-nums'>
                      {t('helpdesk.dashboard.workload.count', {
                        tickets: engineer.count,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('helpdesk.dashboard.recent.title')}</CardTitle>
          <CardDescription>
            {t('helpdesk.dashboard.recent.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.recent.length === 0 ? (
            <Empty className='min-h-40 border border-dashed'>
              <EmptyHeader>
                <EmptyTitle>{t('helpdesk.tickets.empty.title')}</EmptyTitle>
                <EmptyDescription>
                  {t('helpdesk.tickets.empty.description')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('helpdesk.fields.title')}</TableHead>
                  <TableHead>{t('helpdesk.fields.status')}</TableHead>
                  <TableHead>{t('helpdesk.fields.priority')}</TableHead>
                  <TableHead>{t('helpdesk.fields.assignee')}</TableHead>
                  <TableHead>{t('helpdesk.fields.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recent.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className='max-w-72 truncate'>
                      <Link
                        className='font-medium hover:underline'
                        to={`/tickets/${ticket.id}`}
                      >
                        {ticket.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <TicketStatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell>
                      <TicketPriorityBadge priority={ticket.priority} />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {ticket.assigneeName ?? t('helpdesk.unassigned')}
                    </TableCell>
                    <TableCell className='whitespace-nowrap text-muted-foreground'>
                      {dateFormat.format(new Date(ticket.updatedAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoadError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const status = error instanceof ApiClientError ? error.status : undefined;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('helpdesk.dashboard.error.title')}</AlertTitle>
      <AlertDescription>
        {status === 401
          ? t('helpdesk.dashboard.error.unauthorized')
          : status === 403
            ? t('helpdesk.dashboard.error.forbidden')
            : t('helpdesk.dashboard.error.requestFailed')}
      </AlertDescription>
      {status === 401 || status === 403 ? null : (
        <AlertAction>
          <Button size='sm' variant='outline' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
