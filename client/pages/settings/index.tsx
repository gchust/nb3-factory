import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { ScheduleEnabledSwitch } from '#components/schedule-enabled-switch';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { useSchedules } from '#hooks/use-schedules';

/**
 * The application's own settings, reached from the sidebar like any other page (the template has no separate settings
 * area and the header carries no settings entry).
 *
 * The one setting worth configuring today is whether the `todos.check-expired` plan runs. The control writes through
 * the Scheduler's enable/disable endpoints, not the page's state, so the choice persists across reloads and is the same
 * one the scheduler engine reads.
 */
export default function SettingsPage(): ReactElement {
  const { t } = useTranslation();
  const { error, loading, pendingId, rows, setEnabled } = useSchedules();

  return (
    <PageContainer>
      <PageHeader
        description={t('settings.description')}
        title={t('settings.title')}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.scheduledTasks.title')}</CardTitle>
          <CardDescription>
            {t('settings.scheduledTasks.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !rows ? (
            <Loading />
          ) : error ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('settings.scheduledTasks.loadFailed')}
              </AlertDescription>
            </Alert>
          ) : rows && rows.length > 0 ? (
            <ul className='space-y-4'>
              {rows.map((schedule) => (
                <li
                  className='flex items-center justify-between gap-4'
                  key={schedule.id}
                >
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>
                      {schedule.title}
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {schedule.key}
                    </p>
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    <StatusBadge
                      tone={schedule.enabled ? 'success' : 'neutral'}
                    >
                      {schedule.enabled
                        ? t('schedules.enabled')
                        : t('schedules.disabled')}
                    </StatusBadge>
                    <ScheduleEnabledSwitch
                      disabled={pendingId === schedule.id}
                      onChange={(enabled) => void setEnabled(schedule, enabled)}
                      schedule={schedule}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('settings.scheduledTasks.empty')}
            </p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
