import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Building2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  UsersIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  documentCenterErrorKey,
  formatDateTime,
  listDepartments,
  type Department,
} from '@/lib/document-center';

/** The departments administration page: the visibility groups documents are assigned to. */
export default function DocumentCenterDepartmentsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly rows?: readonly Department[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    listDepartments(api, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const rows = result?.rows;
  const error = result?.error;

  const columns = useMemo<ColumnDef<Department>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        enableHiding: false,
        header: t('documentsAdmin.departments.column.title'),
        cell: ({ row }) => (
          <span className='font-medium text-foreground'>
            {row.original.title}
          </span>
        ),
      },
      {
        id: 'code',
        accessorKey: 'code',
        header: t('documentsAdmin.departments.column.code'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        ),
      },
      {
        id: 'description',
        accessorKey: 'description',
        enableSorting: false,
        header: t('documentsAdmin.departments.column.description'),
        cell: ({ row }) =>
          row.original.description ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'active',
        accessorKey: 'active',
        enableSorting: false,
        header: t('documentsAdmin.departments.column.active'),
        cell: ({ row }) =>
          row.original.active ? (
            <Badge>{t('documentsAdmin.departments.active')}</Badge>
          ) : (
            <Badge variant='outline'>
              {t('documentsAdmin.departments.inactive')}
            </Badge>
          ),
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        header: t('documentsAdmin.departments.column.updatedAt'),
        cell: ({ row }) => formatDateTime(row.original.updatedAt, locale),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('documents.column.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('documents.column.actions')}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  render={<Link to={`${row.original.id}/edit`} />}
                >
                  <PencilIcon />
                  {t('actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link to={`${row.original.id}/members`} />}
                >
                  <UsersIcon />
                  {t('documentsAdmin.departments.members')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [locale, t],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertTitle>
          {t(`documents.error.${documentCenterErrorKey(error)}`)}
        </AlertTitle>
        <Button
          variant='outline'
          size='sm'
          className='mt-2'
          onClick={() => reload()}
        >
          {t('documents.action.retry')}
        </Button>
      </Alert>
    );
  } else if (rows === undefined) {
    content = (
      <div className='space-y-2' role='status' aria-label={t('status.loading')}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className='h-12 w-full' />
        ))}
      </div>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={[...rows]}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('documentsAdmin.departments.empty')}</EmptyTitle>
              <EmptyDescription>
                {t('documentsAdmin.departments.emptyDescription')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.documentCenterDepartments')}
        description={t('documentsAdmin.departments.description')}
        actions={
          <Button render={<Link to='new' />}>
            <Building2Icon />
            {t('documentsAdmin.departments.new')}
          </Button>
        }
      />
      {content}
      <Outlet context={{ reload }} />
    </PageContainer>
  );
}
