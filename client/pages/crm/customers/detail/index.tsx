import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { DataTable } from '@/components/data-table';
import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { OpportunityStageBadge } from '../../stage-badge.js';
import type {
  Contact,
  CrmListOutletContext,
  Customer,
  CustomerDetailOutletContext,
  CustomerDetail,
  Opportunity,
} from '../../types.js';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const { customerId } = useParams<{ customerId: string }>();
  const listContext = useOutletContext<CrmListOutletContext>();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${customerId ?? ''}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly detail?: CustomerDetail;
    readonly error?: unknown;
  }>();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    const key = `${customerId}:${reloadCount}`;
    api
      .request<{ data: CustomerDetail }>({
        path: `crm/customers/${encodeURIComponent(customerId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, detail: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, customerId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const detail = result?.detail;

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );

  // The edit dialog updates the drawer immediately, then both the drawer and
  // the list behind it refresh in the background.
  const detailContext = useMemo<CustomerDetailOutletContext>(
    () => ({
      onSaved: (customer: Customer) => {
        setResult((previous) =>
          previous?.detail
            ? { ...previous, detail: { ...previous.detail, ...customer } }
            : previous,
        );
        reload();
        listContext.reload();
      },
      onNotFound: () => {
        setNotFound(true);
        listContext.reload();
      },
    }),
    [listContext, reload],
  );

  const contactColumns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('crm.contacts.fields.name'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'contactInfo',
        header: t('crm.contacts.fields.contactInfo'),
        cell: ({ row }) =>
          row.original.contactInfo ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
    ],
    [t],
  );

  const opportunityColumns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('crm.opportunities.fields.name'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'amount',
        header: t('crm.opportunities.fields.amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {numberFormat.format(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunities.fields.stage'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
    ],
    [numberFormat, t],
  );

  let content: ReactElement;
  if (notFound || (error instanceof ApiClientError && error.status === 404)) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('crm.customers.detail.notFound')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!detail) {
    content = (
      <div role='status' aria-label={t('status.loading')} className='space-y-4'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else {
    content = (
      <div className='space-y-6'>
        <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
          <dt className='text-muted-foreground'>
            {t('crm.customers.fields.industry')}
          </dt>
          <dd className='min-w-0 wrap-anywhere'>
            {detail.industry ?? (
              <span className='text-muted-foreground'>—</span>
            )}
          </dd>
          <dt className='text-muted-foreground'>
            {t('crm.customers.detail.totalAmount')}
          </dt>
          <dd className='font-medium tabular-nums'>
            {numberFormat.format(detail.totalAmount)}
          </dd>
        </dl>

        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>
            {t('crm.customers.detail.contacts')}
          </h3>
          {detail.contacts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('crm.customers.detail.noContacts')}
            </p>
          ) : (
            <DataTable
              columns={contactColumns}
              data={detail.contacts}
              getRowId={(row) => String(row.id)}
              pagination={false}
              showSelectedCount={false}
            />
          )}
        </section>

        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>
            {t('crm.customers.detail.opportunities')}
          </h3>
          {detail.opportunities.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('crm.customers.detail.noOpportunities')}
            </p>
          ) : (
            <DataTable
              columns={opportunityColumns}
              data={detail.opportunities}
              getRowId={(row) => String(row.id)}
              pagination={false}
              showSelectedCount={false}
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <RouteDrawer
      title={detail?.name ?? t('crm.customers.detail.title')}
      footer={
        detail ? (
          <Button
            render={<Link to={{ pathname: 'edit', search: location.search }} />}
            nativeButton={false}
          >
            {t('crm.actions.edit')}
          </Button>
        ) : null
      }
    >
      {content}
      {/* The edit dialog for this customer renders here and stacks on the drawer. */}
      <Outlet context={detailContext} />
    </RouteDrawer>
  );
}
