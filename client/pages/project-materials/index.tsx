import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, FolderKanbanIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { fetchMaterials } from './api.js';
import type {
  ProjectMaterial,
  ProjectMaterialsOutletContext,
} from './types.js';

/**
 * The list of the signed-in user's own materials. The endpoint returns only
 * rows the caller created, so the page never needs an ownership filter.
 */
export default function ProjectMaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // Each reload() call increments the count and the effect requests again.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: ProjectMaterial[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort when the component unmounts or another reload starts, so a slow
    // response never overwrites a newer one.
    const controller = new AbortController();
    const key = String(reloadCount);
    fetchMaterials(api, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  // While reloading, `rows` still holds the previous batch, so the screen does
  // not flash; the current key is what decides whether the batch is fresh.
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const materials = result?.rows;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<ProjectMaterial>[]>(
    () => [
      {
        accessorKey: 'title',
        // The name column is the detail link: a click target that also works
        // from the keyboard, unlike a clickable row.
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projectMaterials.fields.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={{ pathname: row.original.id, search: location.search }}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'attachmentCount',
        accessorFn: (material) => material.attachments.length,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projectMaterials.fields.attachments')}
          />
        ),
        cell: ({ row }) =>
          t('projectMaterials.list.attachmentCount', {
            count: row.original.attachments.length,
          }),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('projectMaterials.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
    ],
    [dateFormat, location.search, t],
  );

  // Keep the context reference stable: the child overlays' effects depend on it.
  const outletContext = useMemo<ProjectMaterialsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('projectMaterials.error.requestFailed')}
        </AlertDescription>
        <Button variant='outline' size='sm' onClick={() => reload()}>
          {t('status.retry')}
        </Button>
      </Alert>
    );
  } else if (materials === undefined) {
    content = <Loading className='min-h-40' />;
  } else if (materials.length === 0) {
    content = (
      <Empty className='rounded-lg border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <FolderKanbanIcon />
          </EmptyMedia>
          <EmptyTitle>{t('projectMaterials.list.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('projectMaterials.list.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projectMaterials.new')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={materials}
        emptyMessage={t('projectMaterials.list.empty.title')}
        getRowId={(material) => material.id}
        showSelectedCount={false}
        toolbar={(table) => <DataTableViewOptions table={table} />}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('projectMaterials.title')}
        description={t('projectMaterials.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projectMaterials.new')}
          </Button>
        }
      />

      {content}

      {/* The create dialog and the detail drawer are child routes and render here. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
