import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  ClockIcon,
  InboxIcon,
  LoaderIcon,
  UserCheckIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';

import type { TicketDashboard } from './types.js';

export interface TicketDashboardSectionProps {
  readonly dashboard: TicketDashboard | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
}

/** Counts and engineer workload for the people allowed to see the dashboard. */
export function TicketDashboardSection({
  dashboard,
  loading,
  error,
  onRetry,
}: TicketDashboardSectionProps): ReactElement {
  const { t } = useTranslation();

  if (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status?: number }).status
        : undefined;
    return status === 401 ? (
      <SessionExpiredAlert />
    ) : (
      <Alert variant='destructive'>
        <AlertTriangleIcon />
        <AlertTitle>{t('itTickets.dashboard.loadFailed')}</AlertTitle>
        <AlertDescription className='flex items-center justify-between gap-3'>
          <span>{t('itTickets.errors.requestFailed')}</span>
          <Button variant='outline' size='sm' onClick={onRetry}>
            {t('itTickets.actions.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loading || !dashboard) {
    return (
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-28 rounded-xl' />
        ))}
      </div>
    );
  }

  const metrics = [
    {
      key: 'pending',
      value: dashboard.pendingAssignment,
      label: t('itTickets.dashboard.pendingAssignment'),
      icon: InboxIcon,
    },
    {
      key: 'progress',
      value: dashboard.inProgress,
      label: t('itTickets.dashboard.inProgress'),
      icon: LoaderIcon,
    },
    {
      key: 'resolved',
      value: dashboard.resolvedAwaiting,
      label: t('itTickets.dashboard.resolvedAwaiting'),
      icon: UserCheckIcon,
    },
    {
      key: 'overdue',
      value: dashboard.overdue,
      label: t('itTickets.dashboard.overdue', {
        hours: dashboard.overdueAfterHours,
      }),
      icon: ClockIcon,
    },
  ];

  return (
    <section className='space-y-3' aria-labelledby='it-dashboard-heading'>
      <div className='flex items-end justify-between gap-3'>
        <div>
          <h2 id='it-dashboard-heading' className='text-base font-medium'>
            {t('itTickets.dashboard.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('itTickets.dashboard.description')}
          </p>
        </div>
        {dashboard.myOpen > 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('itTickets.dashboard.myOpen', { count: dashboard.myOpen })}
          </p>
        ) : null}
      </div>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {metrics.map(({ key, value, label, icon: Icon }) => (
          <Card key={key} size='sm'>
            <CardHeader className='flex flex-row items-center justify-between gap-3'>
              <CardDescription>{label}</CardDescription>
              <Icon className='size-4 text-muted-foreground' aria-hidden />
            </CardHeader>
            <CardContent>
              <p className='font-heading text-3xl font-semibold tracking-tight'>
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {dashboard.canAssign ? (
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{t('itTickets.dashboard.workload')}</CardTitle>
            <CardDescription>
              {t('itTickets.dashboard.workloadDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.workload.length ? (
              <ul className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                {dashboard.workload.map((engineer) => (
                  <li
                    key={engineer.id}
                    className='flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2'
                  >
                    <span className='min-w-0 truncate text-sm font-medium'>
                      {engineer.name}
                    </span>
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      {t('itTickets.dashboard.engineerLoad', {
                        open: engineer.open,
                        overdue: engineer.overdue,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className='rounded-lg border border-dashed bg-muted/20 p-4'>
                <p className='font-medium'>
                  {t('itTickets.dashboard.setupTitle')}
                </p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {t('itTickets.dashboard.setupDescription')}
                </p>
                <Link
                  className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-3`}
                  to='/it-team'
                >
                  {t('itTickets.dashboard.setupAction')}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
