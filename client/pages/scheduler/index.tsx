import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, CalendarClockIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';

import { ScheduleRowActions } from './actions.js';
import { ScheduleEnabledBadge, TargetStateBadge } from './status.js';
import type { Schedule, ScheduleList } from './types.js';

// The endpoint pages every list and caps a page at 100 records.
const PAGE_SIZE = 100;

/**
 * The application's Scheduler management page. The Scheduler plugin contributes no pages, so this reads its API:
 * `GET /api/scheduler/schedules` for the plan's name, enabled state and target state, and a link into the execution
 * history the plugin records for every firing.
 */
export default function SchedulerPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Schedule[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<ScheduleList>({
        path: 'scheduler/schedules',
        query: { pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, rows: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  // A plan changed by enable/disable is replaced in place, so the table reflects the new state without a refetch.
  const handleScheduleChanged = useCallback((schedule: Schedule) => {
    setResult((previous) =>
      previous?.rows
        ? {
            ...previous,
            rows: previous.rows.map((row) =>
              row.id === schedule.id ? schedule : row,
            ),
          }
        : previous,
    );
  }, []);

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<Schedule>[]>(
    () => [
      {
        accessorKey: 'title',
        enableHiding: false,
        header: t('scheduler.fields.title'),
        cell: ({ row }) => (
          <Link
            to={{ pathname: row.original.id, search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'cron',
        enableHiding: false,
        header: t('scheduler.fields.cron'),
        cell: ({ row }) => (
          <code className='rounded bg-muted px-1.5 py-0.5 text-xs'>
            {row.original.cron}
          </code>
        ),
      },
      {
        accessorKey: 'timezone',
        enableHiding: false,
        header: t('scheduler.fields.timezone'),
        cell: ({ row }) => <span>{row.original.timezone}</span>,
      },
      {
        accessorKey: 'enabled',
        enableHiding: false,
        header: t('scheduler.fields.enabled'),
        cell: ({ row }) => (
          <ScheduleEnabledBadge enabled={row.original.enabled} />
        ),
      },
      {
        accessorKey: 'targetState',
        enableHiding: false,
        header: t('scheduler.fields.targetState'),
        cell: ({ row }) => (
          <TargetStateBadge state={row.original.targetState} />
        ),
      },
      {
        accessorKey: 'nextRunAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('scheduler.fields.nextRunAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {row.original.nextRunAt
              ? dateFormat.format(new Date(row.original.nextRunAt))
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'lastRunAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('scheduler.fields.lastRunAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {row.original.lastRunAt
              ? dateFormat.format(new Date(row.original.lastRunAt))
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'runCount',
        enableHiding: false,
        header: t('scheduler.fields.runCount'),
        cell: ({ row }) => <span>{row.original.runCount}</span>,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('scheduler.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <ScheduleRowActions
            schedule={row.original}
            onChanged={handleScheduleChanged}
          />
        ),
      },
    ],
    [dateFormat, handleScheduleChanged, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('scheduler.error.title')}</AlertTitle>
        <AlertDescription>
          {t('scheduler.error.requestFailed')}
        </AlertDescription>
      </Alert>
    );
  } else if (rows === undefined) {
    content = (
      <div
        className='space-y-2 rounded-lg border p-4'
        aria-label={t('status.loading')}
      >
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <CalendarClockIcon />
          </EmptyMedia>
          <EmptyTitle>{t('scheduler.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('scheduler.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        pagination={false}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('scheduler.title')}
        description={t('scheduler.description')}
        actions={
          error ? (
            <Button
              variant='outline'
              onClick={() => setReloadCount((count) => count + 1)}
            >
              {t('status.retry')}
            </Button>
          ) : null
        }
      />
      {content}

      {/* The execution-history page opened by a plan's name or its "View execution records" action. */}
      <Outlet />
    </PageContainer>
  );
}
