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

import { CrmTableSkeleton } from '../table-skeleton.js';
import type { CustomerSummary, CustomersOutletContext } from '../types.js';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly CustomerSummary[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify(reloadCount);
    api
      .request<{ data: CustomerSummary[] }>({
        path: 'customers',
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

  const outletContext = useMemo<CustomersOutletContext>(
    () => ({ rows, reload }),
    [rows, reload],
  );

  const amountFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );

  const columns = useMemo<ColumnDef<CustomerSummary>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: t('crm.customers.fields.name'),
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
        header: t('crm.customers.fields.industry'),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'contactCount',
        header: t('crm.customers.fields.contactCount'),
        cell: ({ row }) => row.original.contactCount,
      },
      {
        accessorKey: 'opportunityCount',
        header: t('crm.customers.fields.opportunityCount'),
        cell: ({ row }) => row.original.opportunityCount,
      },
      {
        accessorKey: 'totalAmount',
        header: t('crm.customers.fields.totalAmount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {amountFormat.format(row.original.totalAmount)}
          </span>
        ),
      },
    ],
    [amountFormat, location.search, t],
  );

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('crm.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden ? t('crm.error.forbidden') : t('crm.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('crm.actions.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <CrmTableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('crm.customers.emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {t('crm.customers.emptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={
              <Link
                to={{ pathname: 'new', search: location.search }}
                aria-label={t('crm.customers.create.title')}
              />
            }
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.actions.create')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={[...rows]}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        pagination={rows.length > 10}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customers.title')}
        description={t('crm.customers.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.customers.create.title')}
          </Button>
        }
      />
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
