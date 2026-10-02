import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  Building2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { fetchCustomers } from '@/components/crm/crm-api.js';
import type { Customer } from '@/components/crm/types.js';
import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
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
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

import type { CustomersOutletContext } from './types.js';

/** Route `/customers`: the customer list. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly customers?: Customer[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(api, controller.signal).then(
      (customers) => {
        if (!controller.signal.aborted)
          setResult({ key: reloadCount, customers });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const customers = result?.customers;
  const status = error instanceof ApiClientError ? error.status : undefined;

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('crm.customer.fields.name'),
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            className='font-medium hover:underline'
            to={{ pathname: String(row.original.id), search: location.search }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'industry',
        header: t('crm.customer.fields.industry'),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('crm.actions.actions')}</span>
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('crm.actions.forRecord', {
                    name: row.original.name,
                  })}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                render={
                  <Link
                    to={{
                      pathname: `${row.original.id}/edit`,
                      search: location.search,
                    }}
                  />
                }
              >
                <PencilIcon />
                {t('crm.actions.edit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [location.search, t],
  );

  const outletContext = useMemo<CustomersOutletContext>(
    () => ({ reload }),
    [reload],
  );

  let content: ReactElement;
  if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 403
            ? t('crm.error.forbidden')
            : t('crm.error.requestFailed')}
        </AlertDescription>
        {status === 403 ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('crm.actions.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (customers === undefined) {
    content = (
      <div
        role='status'
        aria-label={t('crm.status.loading')}
        className='space-y-3'
      >
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  } else if (customers.length === 0) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>{t('crm.customer.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.customer.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={customers}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={t('crm.customer.empty.title')}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customer.title')}
        description={t('crm.customer.description')}
        actions={
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: 'new', search: location.search }}
                aria-label={t('crm.customer.create.action')}
              />
            }
          >
            <PlusIcon />
            {t('crm.customer.create.action')}
          </Button>
        }
      />
      {loading && customers !== undefined ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('crm.status.refreshing')}
        </p>
      ) : null}
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
