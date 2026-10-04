import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
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
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { EMPTY_VALUE, formatAmount, formatDate } from '../../format.js';
import { fetchCustomerDetail } from '../../sales-api.js';
import { StageBadge } from '../../stage-badge.js';
import type {
  Contact,
  Customer,
  CustomerDetailOutletContext,
  CustomersOutletContext,
  Opportunity,
} from '../../types.js';
import { useApiData } from '../../use-api-data.js';

/** Route `/sales/customers/:customerId`: the customer detail drawer. */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  // Key by id so the drawer's own state starts over when forward or back moves to another customer.
  return <CustomerDetail key={customerId} customerId={customerId} />;
}

function CustomerDetail({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<CustomersOutletContext>();

  const load = useCallback(
    (signal: AbortSignal) => fetchCustomerDetail(api, customerId, signal),
    [api, customerId],
  );
  const { data, error, reload } = useApiData(load);

  // After an edit is saved, show the record the endpoint returned right away.
  const [saved, setSaved] = useState<Customer>();
  // The edit dialog found that the record no longer exists.
  const [gone, setGone] = useState(false);

  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = gone || status === 404;

  // A record that no longer exists may still have a row in the list behind, so refresh it.
  useEffect(() => {
    if (notFound) reloadList();
  }, [notFound, reloadList]);

  const customer = notFound ? undefined : (saved ?? data?.customer);

  const outletContext = useMemo<CustomerDetailOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        reloadList();
      },
      onNotFound: () => {
        setGone(true);
        reloadList();
      },
    }),
    [reloadList],
  );

  let body: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('sales.customers.detail.notFound')
            : t('sales.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('sales.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('sales.error.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!customer || !data) {
    body = (
      <div role='status' aria-label={t('sales.loading')} className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = (
      <CustomerDetailBody
        customer={customer}
        contacts={data.contacts}
        opportunities={data.opportunities}
        totalAmount={data.totalAmount}
        locale={locale}
      />
    );
  }

  return (
    <RouteDrawer
      title={customer?.name ?? t('sales.customers.detail.title')}
      footer={customer ? <CustomerDetailFooter /> : undefined}
    >
      {body}
      {/* The edit dialog renders inside the drawer, stacked on it. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function CustomerDetailFooter(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'edit', search: location.search }} />}
    >
      {t('sales.customers.detail.edit')}
    </Button>
  );
}

function CustomerDetailBody({
  customer,
  contacts,
  opportunities,
  totalAmount,
  locale,
}: {
  readonly customer: Customer;
  readonly contacts: readonly Contact[];
  readonly opportunities: readonly Opportunity[];
  readonly totalAmount: number;
  readonly locale: string;
}): ReactElement {
  const { t } = useTranslation();

  const contactColumns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('sales.contacts.columns.name'),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'phone',
        header: t('sales.contacts.columns.phone'),
        cell: ({ row }) => row.original.phone || EMPTY_VALUE,
      },
      {
        accessorKey: 'email',
        header: t('sales.contacts.columns.email'),
        cell: ({ row }) => row.original.email || EMPTY_VALUE,
      },
    ],
    [t],
  );

  const opportunityColumns = useMemo<ColumnDef<Opportunity, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('sales.opportunities.columns.name'),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'amount',
        header: t('sales.opportunities.columns.amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.amount, locale)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('sales.opportunities.columns.stage'),
        cell: ({ row }) => <StageBadge stage={row.original.stage} />,
      },
    ],
    [t, locale],
  );

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardDescription>{t('sales.customers.detail.total')}</CardDescription>
          <CardTitle className='font-heading text-2xl tabular-nums'>
            {formatAmount(totalAmount, locale)}
          </CardTitle>
        </CardHeader>
      </Card>
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
        <dt className='text-muted-foreground'>
          {t('sales.customers.columns.industry')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>
          {customer.industry || EMPTY_VALUE}
        </dd>
        <dt className='text-muted-foreground'>
          {t('sales.customers.columns.createdAt')}
        </dt>
        <dd>{formatDate(customer.createdAt, locale)}</dd>
      </dl>
      <section className='space-y-2'>
        <h2 className='text-sm font-medium'>
          {t('sales.customers.detail.contacts')}
        </h2>
        {contacts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('sales.customers.detail.noContacts')}
          </p>
        ) : (
          <DataTable
            columns={contactColumns}
            data={[...contacts]}
            pagination={false}
          />
        )}
      </section>
      <section className='space-y-2'>
        <h2 className='text-sm font-medium'>
          {t('sales.customers.detail.opportunities')}
        </h2>
        {opportunities.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('sales.customers.detail.noOpportunities')}
          </p>
        ) : (
          <DataTable
            columns={opportunityColumns}
            data={[...opportunities]}
            pagination={false}
          />
        )}
      </section>
    </div>
  );
}
