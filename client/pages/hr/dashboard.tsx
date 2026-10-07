/**
 * The landing page: the HR dashboard.
 *
 * It states the three numbers the requirement asks the homepage to show —
 * active (在职) headcount, employees still onboarding, and leave requests
 * awaiting a decision — plus what the signed-in person can reach and their
 * latest notifications. Counts and visibility are computed by the server for
 * the signed-in identity; this page only presents them.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { useApiData } from '@/hooks/use-api-data.js';

import {
  fetchDashboard,
  fetchNotifications,
  markNotificationRead,
} from './api.js';
import type { HrNotification } from './types.js';
import { HrErrorState, HrLoading, StatCard } from './ui.js';

function quickLinks(dashboard: {
  isHr: boolean;
  isSupervisor: boolean;
}): readonly { readonly to: string; readonly label: string }[] {
  const links: { to: string; label: string }[] = [
    { to: 'hr/employees', label: 'hr.nav.employees' },
    { to: 'hr/departments', label: 'hr.nav.departments' },
    { to: 'hr/leave', label: 'hr.nav.leave' },
    { to: 'hr/profile', label: 'hr.nav.profile' },
  ];
  if (dashboard.isHr || dashboard.isSupervisor) {
    links.splice(3, 0, { to: 'hr/approvals', label: 'hr.nav.approvals' });
  }
  return links;
}

function NotificationList({
  items,
  onRead,
}: {
  readonly items: readonly HrNotification[];
  readonly onRead: (id: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('hr.notifications.empty')}
      </p>
    );
  }
  return (
    <ul className='divide-y'>
      {items.map((item) => (
        <li
          key={item.id}
          className='flex items-start justify-between gap-4 py-3'
        >
          <div className='min-w-0'>
            <p className='flex items-center gap-2 text-sm font-medium'>
              {item.title}
              {item.read ? null : (
                <Badge variant='secondary'>
                  {t('hr.notifications.unread')}
                </Badge>
              )}
            </p>
            <p className='mt-1 text-sm text-muted-foreground'>{item.body}</p>
          </div>
          {item.read ? null : (
            <Button variant='ghost' size='sm' onClick={() => onRead(item.id)}>
              {t('hr.notifications.markRead')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function HrDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const dashboard = useApiData('hr.dashboard', (signal) =>
    fetchDashboard(api, signal),
  );
  const notifications = useApiData('hr.notifications', (signal) =>
    fetchNotifications(api, signal),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('hr.dashboard.title')}
        description={t('hr.dashboard.description')}
      />

      {dashboard.loading ? <HrLoading rows={2} /> : null}
      {dashboard.error ? (
        <HrErrorState error={dashboard.error} onRetry={dashboard.reload} />
      ) : null}

      {dashboard.data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <StatCard
              label={t('hr.dashboard.activeEmployees')}
              value={dashboard.data.activeEmployees}
              hint={t('hr.dashboard.activeEmployeesHint')}
            />
            <StatCard
              label={t('hr.dashboard.onboardingEmployees')}
              value={dashboard.data.onboardingEmployees}
              hint={t('hr.dashboard.onboardingEmployeesHint')}
            />
            <StatCard
              label={t('hr.dashboard.pendingLeave')}
              value={dashboard.data.pendingLeaveRequests}
              hint={t('hr.dashboard.pendingLeaveHint')}
            />
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('hr.dashboard.quickLinks')}</CardTitle>
                <CardDescription>
                  {t('hr.dashboard.quickLinksDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-wrap gap-2'>
                {quickLinks(dashboard.data).map((link) => (
                  <Button
                    key={link.to}
                    variant='outline'
                    render={<Link to={link.to} />}
                  >
                    {t(link.label)}
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('hr.dashboard.myLeave')}</CardTitle>
                <CardDescription>
                  {t('hr.dashboard.myLeaveDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <p>
                  {t('hr.dashboard.myPending', {
                    value: dashboard.data.myPendingLeaveRequests,
                  })}
                </p>
                <p>
                  {t('hr.dashboard.myRejected', {
                    value: dashboard.data.myRejectedLeaveRequests,
                  })}
                </p>
                <Button variant='outline' render={<Link to='hr/leave' />}>
                  {t('hr.leave.apply')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('hr.notifications.title')}</CardTitle>
          <CardDescription>{t('hr.notifications.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.loading ? <HrLoading rows={2} /> : null}
          {notifications.error ? (
            <HrErrorState
              error={notifications.error}
              onRetry={notifications.reload}
            />
          ) : null}
          {notifications.data ? (
            <NotificationList
              items={notifications.data}
              onRead={(id) => {
                void markNotificationRead(api, id).then(() =>
                  notifications.reload(),
                );
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
