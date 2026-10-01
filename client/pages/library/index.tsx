/**
 * The document library's list screen.
 *
 * It shows every document the signed-in account is allowed to see, which the
 * server has already filtered by the caller's Repository Policy: a reader sees
 * published, non-confidential documents and any document temporarily opened to
 * them, a maintainer sees the ones they own, and root sees them all. The page
 * therefore never narrows the list itself.
 *
 * The create action is gated on the composite `create` capability, which is
 * the same check the server's endpoint makes, rather than on a role name. The
 * detail, new and edit screens are child routes rendered through the `Outlet`,
 * so each has a URL the browser's back button and a shared link both reach.
 */
import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
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

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';

import { fetchDocuments } from './library-api.js';
import { libraryDocumentResource } from './library-resource.js';
import type { LibraryDocument } from './types.js';

/** The context a child overlay reads with `useOutletContext()`. */
export interface LibraryOutletContext {
  readonly reload: () => void;
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function LibraryPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);
  const canCreate = useCan({
    resource: libraryDocumentResource,
    action: 'create',
  });

  // The fetch writes state only after it resolves, so the effect never updates state while rendering. A
  // user-initiated refresh also shows the loading state and clears a previous error first.
  const run = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      try {
        const records = await fetchDocuments(api, signal);
        if (signal.aborted) {
          return;
        }
        setDocuments(records);
        setIsLoading(false);
      } catch (reason) {
        if (signal.aborted) {
          return;
        }
        setError(reason);
        setIsLoading(false);
      }
    },
    [api],
  );

  const reload = useCallback((): void => {
    setIsLoading(true);
    setError(undefined);
    void run(new AbortController().signal);
  }, [run]);

  useEffect(() => {
    const controller = new AbortController();
    // The initial load is a mount-time request to an external system. The compiler rule cannot model it, and the
    // fetch itself writes state only after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading a list on mount, not a synchronous update
    void run(controller.signal);
    return () => controller.abort();
  }, [run]);

  const columns = useMemo<ColumnDef<LibraryDocument>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.table.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={row.original.id}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'ownerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.table.owner')}
          />
        ),
        cell: ({ row }) => row.original.ownerName ?? t('library.owner.none'),
      },
      {
        id: 'published',
        accessorFn: (row) => row.published,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.table.status')}
          />
        ),
        cell: ({ row }) =>
          row.original.published ? (
            <Badge variant='secondary'>{t('library.status.published')}</Badge>
          ) : (
            <Badge variant='outline'>{t('library.status.draft')}</Badge>
          ),
      },
      {
        id: 'confidential',
        accessorFn: (row) => row.confidential,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.table.confidential')}
          />
        ),
        cell: ({ row }) =>
          row.original.confidential ? (
            <Badge variant='destructive'>{t('library.confidential.yes')}</Badge>
          ) : (
            <span className='text-muted-foreground'>
              {t('library.confidential.no')}
            </span>
          ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('library.table.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.updatedAt, i18n.language)}
          </span>
        ),
      },
    ],
    [i18n.language, t],
  );

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate.can ? (
            <Link className={buttonVariants()} to='new'>
              <PlusIcon />
              {t('library.new')}
            </Link>
          ) : null
        }
        description={t('library.description')}
        title={t('library.title')}
      />

      {isLoading ? (
        <Loading className='py-16' />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription className='flex flex-col items-start gap-3'>
            {t('library.error.description')}
            <Button onClick={reload} size='sm' variant='outline'>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          emptyMessage={t('library.empty')}
          onRowClick={(row) => {
            void navigate(row.original.id);
          }}
          toolbar={(table) => <DataTableViewOptions table={table} />}
        />
      )}

      <Outlet context={{ reload } satisfies LibraryOutletContext} />
    </PageContainer>
  );
}
