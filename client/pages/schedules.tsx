import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, RefreshCwIcon } from 'lucide-react';
import { Fragment, type ReactElement, useState } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
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

type ScheduleStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

interface ScheduleListItem {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly targetSummary: { readonly targetLabel: string };
}

interface ScheduleOccurrence {
  readonly id: string;
  readonly status: ScheduleStatus;
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
}

interface ScheduleListResponse {
  readonly data: readonly ScheduleListItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

interface OccurrenceListResponse {
  readonly data: readonly ScheduleOccurrence[];
}

/** The schedule an application defines with a stable `key`, mapped to the application's own wording. */
const SCHEDULE_TITLE_KEYS: Readonly<Record<string, string>> = {
  'todos.mark-overdue': 'schedules.definitions.markOverdueTodos',
};

const TARGET_LABEL_KEYS: Readonly<Record<string, string>> = {
  'app.todo-overdue': 'schedules.targets.markOverdueTodos',
};

/**
 * Route `/schedules`: a minimal management UI over the Scheduler plugin's API, because the plugin ships the API but no
 * page. It lists every schedule with its name, cron, enabled state, next run and run counts, and expands one row into
 * its execution history. Enabling and disabling go through the plugin's own routes, so the state it shows is the state
 * the scheduler stored.
 */
export default function SchedulesPage(): ReactElement {
  const api = useApiClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState<string>();

  const query = useQuery({
    queryKey: ['scheduler', 'schedules', 'list'],
    queryFn: ({ signal }) =>
      api.request<ScheduleListResponse>({
        path: 'scheduler/schedules',
        query: { page: 1, pageSize: 100 },
        signal,
      }),
  });

  const setEnabled = useMutation({
    mutationFn: ({
      id,
      enabled,
    }: {
      readonly id: string;
      readonly enabled: boolean;
    }) =>
      api.request({
        path: `scheduler/schedules/${id}/${enabled ? 'enable' : 'disable'}`,
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['scheduler', 'schedules'],
      });
    },
    onError: () =>
      void toaster.show({
        type: 'error',
        title: t('schedules.actionFailed'),
      }),
  });

  const schedules = query.data?.data ?? [];
  const formatDate = (value: string): string =>
    new Date(value).toLocaleString(i18n.language);

  return (
    <PageContainer>
      <PageHeader
        title={t('schedules.title')}
        description={t('schedules.description')}
        actions={
          <Button
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCwIcon
              data-icon='inline-start'
              className={query.isFetching ? 'animate-spin' : undefined}
            />
            {t('schedules.refresh')}
          </Button>
        }
      />

      <Card>
        <CardContent>
          {query.isPending ? (
            <Loading className='py-12' />
          ) : query.isError ? (
            <Empty className='min-h-48'>
              <EmptyHeader>
                <EmptyTitle>{t('schedules.errorTitle')}</EmptyTitle>
                <EmptyDescription>
                  {t('schedules.errorDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : schedules.length === 0 ? (
            <Empty className='min-h-48'>
              <EmptyHeader>
                <EmptyTitle>{t('schedules.empty')}</EmptyTitle>
                <EmptyDescription>
                  {t('schedules.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('schedules.columns.name')}</TableHead>
                  <TableHead>{t('schedules.columns.schedule')}</TableHead>
                  <TableHead>{t('schedules.columns.status')}</TableHead>
                  <TableHead>{t('schedules.columns.nextRun')}</TableHead>
                  <TableHead>{t('schedules.columns.runs')}</TableHead>
                  <TableHead className='w-0'>
                    <span className='sr-only'>
                      {t('schedules.columns.actions')}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const status = scheduleStatus(schedule);
                  const titleKey = SCHEDULE_TITLE_KEYS[schedule.key];
                  const targetKey = TARGET_LABEL_KEYS[schedule.targetType];
                  return (
                    <Fragment key={schedule.id}>
                      <TableRow>
                        <TableCell>
                          <div className='font-medium'>
                            {titleKey ? t(titleKey) : schedule.title}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {targetKey
                              ? t(targetKey)
                              : schedule.targetSummary.targetLabel}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='font-mono text-xs'>
                            {schedule.cron}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {schedule.timezone}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={status.tone}>
                            {t(status.labelKey)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {schedule.nextRunAt
                            ? formatDate(schedule.nextRunAt)
                            : t('schedules.never')}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {t('schedules.runs', {
                            completed: schedule.completedCount,
                            total: schedule.runCount,
                          })}
                        </TableCell>
                        <TableCell className='text-right'>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant='ghost'
                                  size='icon-sm'
                                  aria-label={t('schedules.actionsFor', {
                                    title: titleKey
                                      ? t(titleKey)
                                      : schedule.title,
                                  })}
                                />
                              }
                            >
                              <MoreHorizontalIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align='end'
                              className='w-auto min-w-40'
                            >
                              <DropdownMenuItem
                                disabled={setEnabled.isPending}
                                onClick={() =>
                                  setEnabled.mutate({
                                    id: schedule.id,
                                    enabled: !schedule.enabled,
                                  })
                                }
                              >
                                {schedule.enabled
                                  ? t('schedules.disable')
                                  : t('schedules.enable')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setExpandedId(
                                    expandedId === schedule.id
                                      ? undefined
                                      : schedule.id,
                                  )
                                }
                              >
                                {t('schedules.executionResults')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {expandedId === schedule.id ? (
                        <TableRow>
                          <TableCell colSpan={6} className='bg-muted/40'>
                            <OccurrencesPanel scheduleId={schedule.id} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function scheduleStatus(schedule: ScheduleListItem): {
  readonly tone: 'neutral' | 'warning' | 'success';
  readonly labelKey: string;
} {
  if (
    schedule.lifecycleState === 'inactive' ||
    schedule.targetState === 'missing'
  ) {
    return { tone: 'warning', labelKey: 'schedules.status.missing' };
  }
  if (schedule.targetState === 'invalid') {
    return { tone: 'warning', labelKey: 'schedules.status.invalid' };
  }
  return schedule.enabled
    ? { tone: 'success', labelKey: 'schedules.status.enabled' }
    : { tone: 'neutral', labelKey: 'schedules.status.disabled' };
}

function occurrenceTone(
  status: ScheduleStatus,
): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'timed_out':
      return 'warning';
    case 'running':
    case 'pending':
    case 'waiting':
    case 'triggered':
      return 'info';
    default:
      return 'neutral';
  }
}

function OccurrencesPanel({
  scheduleId,
}: {
  readonly scheduleId: string;
}): ReactElement {
  const api = useApiClient();
  const { t, i18n } = useTranslation();

  const query = useQuery({
    queryKey: ['scheduler', 'schedules', scheduleId, 'occurrences'],
    queryFn: ({ signal }) =>
      api.request<OccurrenceListResponse>({
        path: `scheduler/schedules/${scheduleId}/occurrences`,
        query: { pageSize: 20 },
        signal,
      }),
  });

  const occurrences = query.data?.data ?? [];

  if (query.isPending) {
    return <Loading className='py-6' />;
  }

  if (occurrences.length === 0) {
    return (
      <p className='py-4 text-sm text-muted-foreground'>
        {t('schedules.noExecutions')}
      </p>
    );
  }

  return (
    <div className='py-2'>
      <p className='mb-2 text-sm font-medium'>
        {t('schedules.executionResults')}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('schedules.occurrences.status')}</TableHead>
            <TableHead>{t('schedules.occurrences.startedAt')}</TableHead>
            <TableHead>{t('schedules.occurrences.detail')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {occurrences.map((occurrence) => (
            <TableRow key={occurrence.id}>
              <TableCell>
                <StatusBadge tone={occurrenceTone(occurrence.status)}>
                  {t(`schedules.occurrenceStatus.${occurrence.status}`)}
                </StatusBadge>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {new Date(occurrence.startedAt).toLocaleString(i18n.language)}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {occurrence.reason ??
                  (occurrence.resultSummary
                    ? JSON.stringify(occurrence.resultSummary)
                    : t('schedules.occurrences.noDetail'))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
