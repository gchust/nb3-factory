import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';

import { isUnauthenticated, materialErrorKey } from './errors.js';
import { formatDateTime } from './format.js';
import { listMaterials } from './material-api.js';
import {
  LoadingBlock,
  LoadFailedAlert,
  SessionExpiredAlert,
} from './materials-state.js';
import type { Material, MaterialsOutletContext } from './types.js';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'unauthenticated' }
  | {
      readonly status: 'error';
      readonly errorKey: ReturnType<typeof materialErrorKey>;
    }
  | { readonly status: 'ready'; readonly materials: readonly Material[] };

/**
 * The materials list. It stays mounted while a child route covers it, so it owns
 * the reload the child calls after a create, an edit or a detach, and hands it
 * down through the outlet context.
 */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ListState>({ status: 'loading' });

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    listMaterials(api, controller.signal).then(
      (result) => {
        if (active) setState({ status: 'ready', materials: result.data });
      },
      (error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState(
          isUnauthenticated(error)
            ? { status: 'unauthenticated' }
            : { status: 'error', errorKey: materialErrorKey(error) },
        );
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, revision]);

  const columns = useMemo<ColumnDef<Material>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('materials.list.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={row.original.id}
            className='font-medium underline-offset-4 hover:underline'
            aria-label={t('materials.list.open', { title: row.original.title })}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'attachments',
        header: t('materials.list.attachments'),
        cell: ({ row }) =>
          t('materials.list.fileCount', {
            count: row.original.files.length,
          }),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('materials.list.updatedAt')}
          />
        ),
        cell: ({ row }) => formatDateTime(row.original.updatedAt, locale),
      },
    ],
    [t, locale],
  );

  const outletContext = useMemo<MaterialsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button render={<Link to='new' />}>
            <PlusIcon aria-hidden='true' />
            {t('materials.create.action')}
          </Button>
        }
      />
      {state.status === 'loading' ? (
        <LoadingBlock />
      ) : state.status === 'unauthenticated' ? (
        <SessionExpiredAlert />
      ) : state.status === 'error' ? (
        <LoadFailedAlert message={t(state.errorKey)} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          data={[...state.materials]}
          emptyMessage={t('materials.empty.description')}
          onRowClick={(row) => void navigate(row.original.id)}
          showSelectedCount={false}
        />
      )}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
