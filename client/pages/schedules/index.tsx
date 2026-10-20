import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

interface Schedule {
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
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
    readonly href?: string;
    readonly state?: 'ready' | 'disabled' | 'missing' | 'invalid';
  };
}

type OccurrenceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

interface Occurrence {
  readonly id: string;
  readonly status: OccurrenceStatus;
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
}

interface ScheduleList {
  readonly data: readonly Schedule[];
  readonly meta: { readonly total: number };
}

interface OccurrenceList {
  readonly data: readonly Occurrence[];
}

const OCCURRENCE_TONES: Readonly<
  Record<OccurrenceStatus, 'neutral' | 'info' | 'warning' | 'success'>
> = {
  pending: 'info',
  running: 'info',
  waiting: 'info',
  triggered: 'info',
  succeeded: 'success',
  failed: 'warning',
  cancelled: 'warning',
  timed_out: 'warning',
  skipped: 'neutral',
};

/**
 * Route `/schedules`: the application's own Scheduler management page.
 *
 * The scheduler plugin contributes no page, only the API and the authorization catalog, so this page is built on
 * `/api/scheduler/schedules`. It shows every registered schedule with the three things the feature has to preserve —
 * its name, whether it is enabled, and the record of what each firing did — plus the enable/disable switch the API
 * offers. The "check expired todos" schedule appears here with its history; the plugin owns every write, so nothing
 * on this page writes a todo directly.
 */
export default function SchedulesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [busyId, setBusyId] = useState<string>();
  const [result, setResult] = useState<{
    readonly key: string;
    readonly schedules?: readonly Schedule[];
    readonly occurrences?: Readonly<Record<string, readonly Occurrence[]>>;
    readonly error?: unknown;
  }>();

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<ScheduleList>({
        path: 'scheduler/schedules',
        query: { pageSize: 100 },
        signal: controller.signal,
      })
      .then(async ({ data }) => {
        const histories = await Promise.all(
          data.map(async (schedule) => {
            const page = await api.request<OccurrenceList>({
              path: `scheduler/schedules/${schedule.id}/occurrences`,
              query: { pageSize: 5 },
              signal: controller.signal,
            });
            return [schedule.id, page.data] as const;
          }),
        );
        if (!controller.signal.aborted) {
          setResult({
            key,
            schedules: data,
            occurrences: Object.fromEntries(histories),
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      });
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const schedules = result?.schedules;
  const occurrences = result?.occurrences ?? {};

  const formatDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const formatDateTime = (value: string | undefined): string =>
    value ? formatDate.format(new Date(value)) : t('schedules.never');

  const setEnabled = useCallback(
    async (schedule: Schedule, enabled: boolean): Promise<void> => {
      setBusyId(schedule.id);
      try {
        await api.request({
          path: `scheduler/schedules/${schedule.id}/${enabled ? 'enable' : 'disable'}`,
          method: 'POST',
        });
      } finally {
        setBusyId(undefined);
        setReloadCount((count) => count + 1);
      }
    },
    [api],
  );

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('schedules.title')}
        description={t('schedules.description')}
        actions={
          <Button
            variant='outline'
            onClick={() => setReloadCount((n) => n + 1)}
          >
            <RefreshCwIcon data-icon='inline-start' />
            {t('schedules.refresh')}
          </Button>
        }
      />
      {loading && !schedules ? (
        <Loading label={t('schedules.loading')} />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('schedules.loadErrorTitle')}</AlertTitle>
          <AlertDescription>
            {t('schedules.loadErrorDescription')}
          </AlertDescription>
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setReloadCount((n) => n + 1)}
            >
              {t('schedules.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <div className='flex flex-col gap-4'>
          {(schedules ?? []).map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              occurrences={occurrences[schedule.id] ?? []}
              busy={busyId === schedule.id}
              onSetEnabled={(schedule, enabled) => {
                void setEnabled(schedule, enabled);
              }}
              formatDateTime={formatDateTime}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function ScheduleCard({
  schedule,
  occurrences,
  busy,
  onSetEnabled,
  formatDateTime,
}: {
  readonly schedule: Schedule;
  readonly occurrences: readonly Occurrence[];
  readonly busy: boolean;
  readonly onSetEnabled: (schedule: Schedule, enabled: boolean) => void;
  readonly formatDateTime: (value: string | undefined) => string;
}): ReactElement {
  const { t } = useTranslation();
  // The Scheduler API returns the definition's stored title/description verbatim, in the language the application
  // registered it. The application translates its own definition by key; anything else shows what the definition
  // registered, which is the best available for a plugin-owned schedule.
  const isTodosSchedule = schedule.key === 'todos.checkExpired';
  const title = isTodosSchedule
    ? t('schedules.definitions.todosCheckExpired.title')
    : schedule.title;
  const description = isTodosSchedule
    ? t('schedules.definitions.todosCheckExpired.description')
    : schedule.description;
  const targetLabel =
    schedule.targetType === 'app.todos.markExpired'
      ? t('schedules.targets.todosMarkExpired')
      : schedule.targetSummary.targetLabel;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {title}
          <StatusBadge tone={schedule.enabled ? 'success' : 'neutral'}>
            {schedule.enabled
              ? t('schedules.enabled')
              : t('schedules.disabled')}
          </StatusBadge>
          {schedule.lifecycleState === 'inactive' ? (
            <StatusBadge tone='warning'>{t('schedules.inactive')}</StatusBadge>
          ) : null}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        <CardAction>
          <Button
            variant='outline'
            size='sm'
            disabled={busy}
            onClick={() => onSetEnabled(schedule, !schedule.enabled)}
          >
            {busy ? <Spinner /> : null}
            {schedule.enabled ? t('schedules.disable') : t('schedules.enable')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3'>
          <Detail label={t('schedules.fields.cron')} value={schedule.cron} />
          <Detail
            label={t('schedules.fields.timezone')}
            value={schedule.timezone}
          />
          <Detail
            label={t('schedules.fields.nextRunAt')}
            value={formatDateTime(schedule.nextRunAt)}
          />
          <Detail
            label={t('schedules.fields.lastRunAt')}
            value={formatDateTime(schedule.lastRunAt)}
          />
          <Detail
            label={t('schedules.fields.runCount')}
            value={String(schedule.runCount)}
          />
          <Detail label={t('schedules.fields.target')} value={targetLabel} />
        </dl>
        <div className='flex flex-col gap-2'>
          <h3 className='text-sm font-medium'>
            {t('schedules.executions.title')}
          </h3>
          {occurrences.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('schedules.executions.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('schedules.executions.status')}</TableHead>
                  <TableHead>{t('schedules.executions.startedAt')}</TableHead>
                  <TableHead>{t('schedules.executions.finishedAt')}</TableHead>
                  <TableHead>{t('schedules.executions.result')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((occurrence) => (
                  <TableRow key={occurrence.id}>
                    <TableCell>
                      <StatusBadge tone={OCCURRENCE_TONES[occurrence.status]}>
                        {t(`schedules.status.${occurrence.status}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(occurrence.startedAt)}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDateTime(occurrence.finishedAt)}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {occurrence.resultSummary
                        ? JSON.stringify(occurrence.resultSummary)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='font-medium'>{value}</dd>
    </div>
  );
}
