import type { ColumnDef } from '@tanstack/react-table';
import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchCustomerDetail } from '../api.js';
import type {
  Contact,
  CustomerDetail,
  CustomerDetailOutletContext,
  CustomersOutletContext,
  Opportunity,
} from '../types.js';
import { formatAmount, useStageLabel } from '../format.js';
import { useRemoteData } from '../use-remote-data.js';

/** The customer detail drawer: its contacts, its opportunities and their total. */
export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { customerId } = useParams<{ customerId: string }>();
  const { reload: reloadList } = useOutletContext<CustomersOutletContext>();
  const { data, error, loading, reload } = useRemoteData(
    `customer/${customerId ?? ''}`,
    (api, signal) => fetchCustomerDetail(api, customerId ?? '', signal),
  );

  // After an edit is saved, show the record the endpoint returned right away.
  const [saved, setSaved] = useState<CustomerDetail>();
  // The edit dialog found that the customer no longer exists.
  const [gone, setGone] = useState(false);

  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = gone || status === 404;
  const detail = notFound ? undefined : (saved ?? data);

  const outletContext = useMemo<CustomerDetailOutletContext>(
    () => ({
      onSaved: (customer) => {
        setSaved((current) => (current ? { ...current, customer } : current));
        reload();
        reloadList();
      },
      onNotFound: () => {
        setGone(true);
        reloadList();
      },
    }),
    [reload, reloadList],
  );

  let body: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.customerNotFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
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
  } else if (loading && !detail) {
    body = (
      <div className='space-y-3'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-8 w-1/3' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else if (detail) {
    body = <CustomerDetailBody detail={detail} />;
  } else {
    body = <Skeleton className='h-24 w-full' />;
  }

  return (
    <RouteDrawer
      title={detail?.customer.name ?? t('crm.customers.detail.title')}
      description={detail?.customer.industry ?? undefined}
      className='sm:max-w-2xl'
      footer={detail ? <CustomerDetailActions /> : undefined}
    >
      {body}
      {/* The edit dialog (child route edit) renders stacked inside the drawer. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function CustomerDetailActions(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex justify-end gap-2'>
      <Button nativeButton={false} render={<Link to={{ pathname: 'edit' }} />}>
        {t('crm.action.edit')}
      </Button>
      <CloseButton />
    </div>
  );
}

function CloseButton(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}

function CustomerDetailBody({
  detail,
}: {
  readonly detail: CustomerDetail;
}): ReactElement {
  const { t } = useTranslation();
  const stageLabel = useStageLabel();

  const contactColumns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      { accessorKey: 'name', header: t('crm.contacts.column.name') },
      {
        accessorKey: 'phone',
        header: t('crm.contacts.column.phone'),
        cell: ({ row }) =>
          row.original.phone ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'email',
        header: t('crm.contacts.column.email'),
        cell: ({ row }) =>
          row.original.email ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
    ],
    [t],
  );

  const opportunityColumns = useMemo<ColumnDef<Opportunity, unknown>[]>(
    () => [
      { accessorKey: 'name', header: t('crm.opportunities.column.name') },
      {
        accessorKey: 'amount',
        header: t('crm.opportunities.column.amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunities.column.stage'),
        cell: ({ row }) => <Badge>{stageLabel(row.original.stage)}</Badge>,
      },
    ],
    [t, stageLabel],
  );

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle className='text-sm font-normal text-muted-foreground'>
            {t('crm.customers.detail.total')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-semibold tabular-nums'>
            {formatAmount(detail.opportunityTotal)}
          </div>
          <p className='text-xs text-muted-foreground'>
            {t('crm.customers.detail.totalHint')}
          </p>
        </CardContent>
      </Card>
      <Tabs defaultValue='contacts'>
        <TabsList>
          <TabsTrigger value='contacts'>
            {t('crm.customers.detail.contacts', {
              count: detail.contacts.length,
            })}
          </TabsTrigger>
          <TabsTrigger value='opportunities'>
            {t('crm.customers.detail.opportunities', {
              count: detail.opportunities.length,
            })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='contacts' className='space-y-3'>
          <DataTable
            columns={contactColumns}
            data={[...detail.contacts]}
            pagination={false}
            emptyMessage={t('crm.customers.detail.emptyContacts')}
          />
          <Button
            size='sm'
            variant='outline'
            nativeButton={false}
            render={
              <Link
                to={{
                  pathname: '/contacts/new',
                  search: `?customerId=${detail.customer.id}`,
                }}
              />
            }
          >
            {t('crm.contacts.new')}
          </Button>
        </TabsContent>
        <TabsContent value='opportunities' className='space-y-3'>
          <DataTable
            columns={opportunityColumns}
            data={[...detail.opportunities]}
            pagination={false}
            emptyMessage={t('crm.customers.detail.emptyOpportunities')}
          />
          <Button
            size='sm'
            variant='outline'
            nativeButton={false}
            render={
              <Link
                to={{
                  pathname: '/opportunities/new',
                  search: `?customerId=${detail.customer.id}`,
                }}
              />
            }
          >
            {t('crm.opportunities.new')}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
