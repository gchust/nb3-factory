import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, ListChecksIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
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

import type { Todo, TodoList } from './types.js';

// The endpoint pages every list and caps a page at 100 records. This page sorts in the browser, so it asks for the
// largest page and says when more records match.
const PAGE_SIZE = 100;

/** The `overdue` flag the Schedule only ever sets; the page reads it and writes nothing. */
function OverdueBadge({
  overdue,
}: {
  readonly overdue: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return overdue ? (
    <StatusBadge tone='warning'>{t('todos.status.overdue')}</StatusBadge>
  ) : (
    <span className='text-muted-foreground'>{t('todos.status.onTime')}</span>
  );
}

function CompletedBadge({
  completed,
}: {
  readonly completed: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={completed ? 'success' : 'neutral'}>
      {completed ? t('todos.status.completed') : t('todos.status.open')}
    </StatusBadge>
  );
}

export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Todo[];
    readonly total?: number;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort on unmount and on reload, so a stale response never overwrites a newer one.
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<TodoList>({
        path: 'todos',
        query: { pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, total: meta.total });
          }
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

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<Todo>[]>(
    () => [
      {
        accessorKey: 'title',
        enableHiding: false,
        header: t('todos.fields.title'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'dueAt',
        enableHiding: false,
        // `dueAt` is ISO 8601, so the default string comparison is chronological.
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('todos.fields.dueAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.dueAt))}
          </span>
        ),
      },
      {
        accessorKey: 'completed',
        enableHiding: false,
        header: t('todos.fields.completed'),
        cell: ({ row }) => (
          <CompletedBadge completed={row.original.completed} />
        ),
      },
      {
        accessorKey: 'overdue',
        enableHiding: false,
        header: t('todos.fields.overdue'),
        cell: ({ row }) => <OverdueBadge overdue={row.original.overdue} />,
      },
    ],
    [dateFormat, t],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('todos.error.title')}</AlertTitle>
        <AlertDescription>
          {error instanceof ApiClientError && error.status === 401
            ? t('todos.error.sessionExpired')
            : t('todos.error.requestFailed')}
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
            <ListChecksIcon />
          </EmptyMedia>
          <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('todos.empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('todos.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          pagination={false}
          showSelectedCount={false}
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
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
    </PageContainer>
  );
}
