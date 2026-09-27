import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon, UsersIcon } from 'lucide-react';
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
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

import { fetchCustomers } from '../sales/api.js';
import { formatNumber } from '../sales/format.js';
import { ListSkeleton } from '../sales/list-skeleton.js';
import type {
  CustomerSummary,
  SalesListOutletContext,
} from '../sales/types.js';

/** Route `/customers`: the customer list. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly rows?: CustomerSummary[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(api, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, rows });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<SalesListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<CustomerSummary>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('sales.name')} />
        ),
        cell: ({ row }) => (
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'industry',
        header: t('sales.industry'),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>
              {t('sales.emptyValue')}
            </span>
          ),
      },
      {
        accessorKey: 'contactCount',
        enableHiding: false,
        header: () => (
          <div className='text-right'>{t('sales.contactCount')}</div>
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {row.original.contactCount}
          </div>
        ),
      },
      {
        accessorKey: 'opportunityCount',
        enableHiding: false,
        header: () => (
          <div className='text-right'>{t('sales.opportunityCount')}</div>
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {row.original.opportunityCount}
          </div>
        ),
      },
      {
        accessorKey: 'totalAmount',
        enableHiding: false,
        header: () => (
          <div className='text-right'>{t('sales.totalAmount')}</div>
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatNumber(locale, row.original.totalAmount)}
          </div>
        ),
      },
    ],
    [collator, locale, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('sales.customers.errorTitle')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('sales.errorForbidden')
            : t('sales.errorRequestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <ListSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('sales.customers.emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {t('sales.customers.emptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.customers.create')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.customers.title')}
        description={t('sales.customers.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.customers.create')}
          </Button>
        }
      />
      {/* Reloading keeps the old data and shows only a small Spinner here. */}
      {loading && rows !== undefined ? (
        <Spinner className='self-end text-muted-foreground' />
      ) : null}
      {content}
      {/* The create and detail child routes render here and get the list refresh function from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
