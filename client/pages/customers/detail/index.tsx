import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { AmountText } from '@/components/crm/amount-text.js';
import { fetchCustomer } from '@/components/crm/crm-api.js';
import { StageBadge } from '@/components/crm/stage-badge.js';
import type {
  Contact,
  Customer,
  CustomerDetail,
  Opportunity,
} from '@/components/crm/types.js';
import { DataTable } from '@/components/data-table';
import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import type {
  CustomerDetailOutletContext,
  CustomersOutletContext,
} from '../types.js';

/** Route `/customers/:customerId`: the customer detail drawer. */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  return <CustomerDetailView key={customerId} customerId={customerId} />;
}

function CustomerDetailView({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const { reload: reloadList } = useOutletContext<CustomersOutletContext>();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${customerId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly customer?: CustomerDetail;
    readonly error?: unknown;
  }>();
  const [saved, setSaved] = useState<Customer>();
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${customerId}:${reloadCount}`;
    fetchCustomer(api, customerId, controller.signal).then(
      (customer) => {
        if (!controller.signal.aborted) setResult({ key, customer });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error });
        if (error instanceof ApiClientError && error.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, customerId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = gone || status === 404;
  const customer = notFound
    ? undefined
    : saved
      ? { ...(result?.customer as CustomerDetail), ...saved }
      : result?.customer;

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

  const contactColumns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('crm.contact.fields.name'),
        enableHiding: false,
      },
      {
        accessorKey: 'contact',
        header: t('crm.contact.fields.contact'),
        cell: ({ row }) =>
          row.original.contact ?? (
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
        header: t('crm.opportunity.fields.name'),
        enableHiding: false,
      },
      {
        accessorKey: 'amount',
        header: t('crm.opportunity.fields.amount'),
        cell: ({ row }) => (
          <span className='block text-right tabular-nums'>
            <AmountText amount={row.original.amount} />
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunity.fields.stage'),
        cell: ({ row }) => <StageBadge stage={row.original.stage} />,
      },
    ],
    [t],
  );

  let body: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('crm.customer.error.notFound')
            : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('crm.actions.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!customer) {
    body = (
      <div
        role='status'
        aria-label={t('crm.status.loading')}
        className='space-y-3'
      >
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else {
    body = (
      <div className='space-y-6'>
        <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
          <dt className='text-muted-foreground'>
            {t('crm.customer.fields.name')}
          </dt>
          <dd className='min-w-0 wrap-anywhere'>{customer.name}</dd>
          <dt className='text-muted-foreground'>
            {t('crm.customer.fields.industry')}
          </dt>
          <dd>{customer.industry ?? '—'}</dd>
          <dt className='text-muted-foreground'>
            {t('crm.customer.fields.amountTotal')}
          </dt>
          <dd className='font-medium tabular-nums'>
            <AmountText amount={customer.amountTotal} />
          </dd>
        </dl>

        <Card>
          <CardHeader>
            <CardTitle>{t('crm.customer.contacts.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={contactColumns}
              data={customer.contacts}
              pagination={false}
              showSelectedCount={false}
              emptyMessage={t('crm.customer.contacts.empty')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('crm.customer.opportunities.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={opportunityColumns}
              data={customer.opportunities}
              pagination={false}
              showSelectedCount={false}
              emptyMessage={t('crm.customer.opportunities.empty')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RouteDrawer
      title={customer?.name ?? t('crm.customer.detail.title')}
      className='sm:max-w-2xl'
      footer={
        customer ? (
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: 'edit', search: location.search }}
                aria-label={t('crm.customer.edit.action')}
              />
            }
          >
            {t('crm.actions.edit')}
          </Button>
        ) : undefined
      }
    >
      {body}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}
