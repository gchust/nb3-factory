import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly scheduleStatus: 'active' | 'paused';
}

/** The schedule key the server registers in `server/providers/todos.ts`. */
const EXPIRY_SCHEDULE_KEY = 'todos.check-expired';

function formatInstant(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : format(date, 'yyyy-MM-dd HH:mm:ss');
}

function StatCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}): ReactElement {
  return (
    <Card>
      <CardContent className='pt-6'>
        <p className='text-sm text-muted-foreground'>{label}</p>
        <p className='mt-1 text-2xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [todosError, setTodosError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void api
      .request<{ data: Todo[] }>({ path: 'todos', signal: controller.signal })
      .then((response) => setTodos(response.data))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setTodosError(
            cause instanceof Error
              ? cause.message
              : t('todos.errors.loadTodos'),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [api, t]);

  useEffect(() => {
    const controller = new AbortController();

    void api
      .request<{ data: Schedule[] }>({
        path: 'schedules',
        signal: controller.signal,
      })
      .then((response) => {
        const items = response.data;
        setSchedule(
          items.find((item) => item.key === EXPIRY_SCHEDULE_KEY) ?? null,
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setScheduleError(
            cause instanceof Error
              ? cause.message
              : t('todos.errors.loadSchedule'),
          );
        }
      });

    return () => controller.abort();
  }, [api, t]);

  const columns = useMemo<ColumnDef<Todo>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('todos.columns.title')}
          />
        ),
      },
      {
        accessorKey: 'dueAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('todos.columns.dueAt')}
          />
        ),
        cell: ({ row }) => formatInstant(row.original.dueAt),
      },
      {
        accessorKey: 'completed',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('todos.columns.completed')}
          />
        ),
        cell: ({ row }) =>
          row.original.completed ? (
            <Badge variant='secondary'>{t('todos.completed')}</Badge>
          ) : (
            <Badge variant='outline'>{t('todos.pending')}</Badge>
          ),
      },
      {
        accessorKey: 'expired',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('todos.columns.expired')}
          />
        ),
        cell: ({ row }) =>
          row.original.expired ? (
            <Badge variant='destructive'>{t('todos.expired')}</Badge>
          ) : (
            <Badge variant='outline'>{t('todos.notExpired')}</Badge>
          ),
      },
    ],
    [t],
  );

  const expiredCount = todos.filter((todo) => todo.expired).length;
  const pendingCount = todos.filter(
    (todo) => !todo.completed && !todo.expired,
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
      />

      <div className='grid gap-4 sm:grid-cols-3'>
        <StatCard label={t('todos.stats.total')} value={todos.length} />
        <StatCard label={t('todos.stats.expired')} value={expiredCount} />
        <StatCard label={t('todos.stats.pending')} value={pendingCount} />
      </div>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <CalendarClock className='size-4 text-muted-foreground' />
            {t('todos.schedule.title')}
          </CardTitle>
          {schedule ? (
            <Badge variant={schedule.enabled ? 'secondary' : 'outline'}>
              {schedule.enabled
                ? t('todos.schedule.enabled')
                : t('todos.schedule.disabled')}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className='space-y-4'>
          {scheduleError ? (
            <Alert variant='destructive'>
              <AlertTitle>{t('todos.schedule.unavailable')}</AlertTitle>
              <AlertDescription>{scheduleError}</AlertDescription>
            </Alert>
          ) : schedule ? (
            <>
              <div className='grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2'>
                <div>
                  <p className='text-muted-foreground'>
                    {t('todos.schedule.name')}
                  </p>
                  <p className='font-medium'>{schedule.title}</p>
                </div>
                <div>
                  <p className='text-muted-foreground'>
                    {t('todos.schedule.cron')}
                  </p>
                  <p className='font-mono text-xs'>
                    {schedule.cron} ({schedule.timezone})
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>
                    {t('todos.schedule.nextRun')}
                  </p>
                  <p className='font-medium'>
                    {formatInstant(schedule.nextRunAt)}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>
                    {t('todos.schedule.lastRun')}
                  </p>
                  <p className='font-medium'>
                    {formatInstant(schedule.lastRunAt)}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>
                    {t('todos.schedule.runCount')}
                  </p>
                  <p className='font-medium'>{schedule.runCount}</p>
                </div>
                <div>
                  <p className='text-muted-foreground'>
                    {t('todos.schedule.completedCount')}
                  </p>
                  <p className='font-medium'>{schedule.completedCount}</p>
                </div>
              </div>
              <Link
                className='inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline'
                to={`/settings/schedules/${encodeURIComponent(schedule.id)}`}
              >
                {t('todos.schedule.open')}
                <ExternalLink className='size-3.5' aria-hidden='true' />
              </Link>
            </>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {loading ? t('todos.schedule.loading') : t('todos.schedule.warn')}
            </p>
          )}
        </CardContent>
      </Card>

      {todosError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('todos.errors.loadTodos')}</AlertTitle>
          <AlertDescription>{todosError}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={todos}
        emptyMessage={loading ? t('todos.loading') : t('todos.empty')}
        pageSizeOptions={[10, 25, 50]}
      />
    </PageContainer>
  );
}
