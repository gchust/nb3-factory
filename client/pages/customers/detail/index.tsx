import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fetchCustomerDetail } from '../../crm/crm-api.js';
import {
  displayText,
  type Customer,
  type CustomerDetail,
  type DetailOutletContext,
  type ListOutletContext,
} from '../../crm/types.js';
import { ContactTable } from '../../contacts/contact-table.js';
import { OpportunityTable } from '../../opportunities/opportunity-table.js';

/** Route `/customers/:customerId`: the customer detail drawer. */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  return <CustomerDetail key={customerId} customerId={customerId} />;
}

function CustomerDetail({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<ListOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${customerId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly detail?: CustomerDetail;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${customerId}:${reloadCount}`;
    fetchCustomerDetail(api, Number(customerId), controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setResult({ key, detail });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: caught });
        if (caught instanceof ApiClientError && caught.status === 404) {
          reloadList();
        }
      },
    );
    return () => controller.abort();
  }, [api, customerId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  // The edit dialog returns the saved customer; show its new name in the title
  // right away and reload the detail so the lists and total stay authoritative.
  const [saved, setSaved] = useState<Customer>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const detail = notFound ? undefined : result?.detail;
  const customer = notFound ? undefined : (saved ?? detail?.customer);

  const outletContext = useMemo<DetailOutletContext<Customer>>(
    () => ({
      onSaved: (updated) => {
        setSaved(updated);
        setReloadCount((count) => count + 1);
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
            ? t('crm.customer.error.notFound')
            : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('crm.customer.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!detail) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <CustomerDetailBody detail={detail} />;
  }

  return (
    <RouteDrawer
      title={customer?.name ?? t('crm.customer.detail.title')}
      className='sm:max-w-2xl'
      footer={detail ? <CustomerDetailActions /> : undefined}
    >
      {body}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function CustomerDetailActions(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'edit', search: location.search }} />}
    >
      {t('crm.customer.actions.edit')}
    </Button>
  );
}

function CustomerDetailBody({
  detail,
}: {
  readonly detail: CustomerDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const amountFormat = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );
  const [tab, setTab] = useState('contacts');

  return (
    <div className='flex flex-col gap-4'>
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
        <dt className='text-muted-foreground'>
          {t('crm.customer.fields.industry')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>
          {displayText(detail.customer.industry)}
        </dd>
        <dt className='text-muted-foreground'>
          {t('crm.customer.fields.updatedAt')}
        </dt>
        <dd>{dateFormat.format(new Date(detail.customer.updatedAt))}</dd>
      </dl>

      <Card>
        <CardHeader>
          <CardTitle className='text-sm text-muted-foreground'>
            {t('crm.customer.detail.totalExpectedAmount')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='font-heading text-2xl font-semibold tabular-nums'>
            {amountFormat.format(detail.totalExpectedAmount)}
          </p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value='contacts'>
            {t('crm.customer.detail.contactsTab', {
              count: detail.contacts.length,
            })}
          </TabsTrigger>
          <TabsTrigger value='opportunities'>
            {t('crm.customer.detail.opportunitiesTab', {
              count: detail.opportunities.length,
            })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='contacts'>
          <ContactTable
            data={detail.contacts}
            showCustomer={false}
            emptyMessage={t('crm.customer.detail.noContacts')}
          />
        </TabsContent>
        <TabsContent value='opportunities'>
          <OpportunityTable
            data={detail.opportunities}
            locale={locale}
            emptyMessage={t('crm.customer.detail.noOpportunities')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
