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
import { Link, useLocation, useParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { OpportunityStageBadge } from '../../opportunity-stage-badge.js';
import { CrmTableSkeleton } from '../../table-skeleton.js';
import type {
  ContactSummary,
  CustomerDetail,
  OpportunitySummary,
} from '../../types.js';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const { customerId } = useParams<{ customerId: string }>();
  const location = useLocation();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([customerId, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: CustomerDetail;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([customerId, reloadCount]);
    api
      .request<{ data: CustomerDetail }>({
        path: `customers/${customerId}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, customerId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const customer = loading ? undefined : result?.data;

  const amountFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );

  const contactColumns = useMemo<ColumnDef<ContactSummary>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: t('crm.contacts.fields.name'),
        cell: ({ row }) => row.original.name,
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

  const opportunityColumns = useMemo<ColumnDef<OpportunitySummary>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: t('crm.opportunities.fields.name'),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'amount',
        header: t('crm.opportunities.fields.amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {amountFormat.format(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunities.fields.stage'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
    ],
    [amountFormat, t],
  );

  let body: ReactElement;
  if (error) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('crm.error.notFoundDescription')
            : t('crm.error.requestFailed')}
        </AlertDescription>
        {notFound ? (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              render={<Link to='..' />}
              nativeButton={false}
            >
              {t('actions.close')}
            </Button>
          </AlertAction>
        ) : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('crm.actions.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (!customer) {
    body = <CrmTableSkeleton label={t('status.loading')} />;
  } else {
    body = (
      <div className='space-y-6'>
        <dl className='grid gap-4 sm:grid-cols-2'>
          <div>
            <dt className='text-sm text-muted-foreground'>
              {t('crm.customers.fields.industry')}
            </dt>
            <dd className='mt-1'>
              {customer.industry ?? (
                <span className='text-muted-foreground'>—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className='text-sm text-muted-foreground'>
              {t('crm.customers.detail.totalAmount')}
            </dt>
            <dd className='mt-1 font-medium tabular-nums'>
              {amountFormat.format(customer.totalAmount)}
            </dd>
          </div>
        </dl>

        <Card size='sm'>
          <CardHeader>
            <CardTitle>{t('crm.customers.detail.contacts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={contactColumns}
              data={[...customer.contacts]}
              getRowId={(row) => String(row.id)}
              pagination={false}
              emptyMessage={t('crm.customers.detail.noContacts')}
            />
          </CardContent>
        </Card>

        <Card size='sm'>
          <CardHeader>
            <CardTitle>{t('crm.customers.detail.opportunities')}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={opportunityColumns}
              data={[...customer.opportunities]}
              getRowId={(row) => String(row.id)}
              pagination={false}
              emptyMessage={t('crm.customers.detail.noOpportunities')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RouteDrawer
      title={customer?.name ?? t('crm.customers.detail.title')}
      description={t('crm.customers.detail.title')}
      footer={
        <>
          <CloseButton />
          {customer ? (
            <Button
              render={
                <Link
                  to={{
                    pathname: `/customers/${customer.id}/edit`,
                    search: location.search,
                  }}
                />
              }
              nativeButton={false}
            >
              {t('crm.actions.edit')}
            </Button>
          ) : null}
        </>
      }
    >
      {body}
    </RouteDrawer>
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
