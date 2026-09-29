import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PencilIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { getCustomer } from '../../api.js';
import { formatAmount, formatDate } from '../../format.js';
import { OpportunityStageBadge } from '../../stage-badge.js';
import type {
  CustomerDetail,
  CustomerDetailOutletContext,
  ListOutletContext,
} from '../../types.js';
import { useResource } from '../../use-resource.js';

/** Route `/customers/:customerId`: the customer detail drawer. */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  // Key by id: when forward or back switches to another record, the drawer's state starts over.
  return <CustomerDetailView key={customerId} customerId={customerId} />;
}

function CustomerDetailView({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<ListOutletContext>();

  const { data, loading, error, reload } = useResource(
    `customer:${customerId}`,
    () => getCustomer(api, Number(customerId)),
  );

  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = status === 404;

  // The row may still be visible behind the drawer, so refresh the list when the record is gone.
  useEffect(() => {
    if (notFound) reloadList();
  }, [notFound, reloadList]);

  const outletContext = useMemo<CustomerDetailOutletContext>(
    () => ({ onSaved: reload }),
    [reload],
  );

  return (
    <RouteDrawer
      title={data?.name ?? t('crm.customers.detail.title')}
      footer={data ? <CustomerDetailActions /> : undefined}
    >
      {notFound || status === 403 ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {notFound
              ? t('crm.customers.error.notFound')
              : t('crm.error.forbidden')}
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading || !data ? (
        <div
          role='status'
          aria-label={t('status.loading')}
          className='space-y-4'
        >
          <Skeleton className='h-4 w-1/2' />
          <Skeleton className='h-4 w-1/3' />
          <Skeleton className='h-4 w-2/3' />
        </div>
      ) : (
        <CustomerDetailBody customer={data} />
      )}

      {/* The edit dialog (child route edit) renders inside the drawer, stacked on it. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function CustomerDetailBody({
  customer,
}: {
  readonly customer: CustomerDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();

  return (
    <div className='flex flex-col gap-6'>
      <dl className='grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm'>
        <dt className='text-muted-foreground'>
          {t('crm.customers.fields.industry')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>{customer.industry ?? '—'}</dd>
        <dt className='text-muted-foreground'>
          {t('crm.customers.fields.opportunityTotal')}
        </dt>
        <dd className='font-medium tabular-nums'>
          {formatAmount(customer.opportunityTotal, locale)}
        </dd>
        <dt className='text-muted-foreground'>
          {t('crm.customers.fields.updatedAt')}
        </dt>
        <dd>{formatDate(customer.updatedAt, locale)}</dd>
      </dl>

      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('crm.customers.detail.contactsTitle', {
            count: customer.contacts.length,
          })}
        </h3>
        {customer.contacts.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('crm.contacts.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('crm.contacts.fields.name')}</TableHead>
                <TableHead>{t('crm.contacts.fields.phone')}</TableHead>
                <TableHead>{t('crm.contacts.fields.email')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customer.contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className='font-medium'>{contact.name}</TableCell>
                  <TableCell>{contact.phone ?? '—'}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {contact.email ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('crm.customers.detail.opportunitiesTitle', {
            count: customer.opportunities.length,
          })}
        </h3>
        {customer.opportunities.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('crm.opportunities.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('crm.opportunities.fields.name')}</TableHead>
                <TableHead>{t('crm.opportunities.fields.stage')}</TableHead>
                <TableHead className='text-right'>
                  {t('crm.opportunities.fields.amount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customer.opportunities.map((opportunity) => (
                <TableRow key={opportunity.id}>
                  <TableCell className='font-medium'>
                    {opportunity.name}
                  </TableCell>
                  <TableCell>
                    <OpportunityStageBadge stage={opportunity.stage} />
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatAmount(opportunity.amount, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot>
              <TableRow>
                <TableCell
                  colSpan={2}
                  className='text-right font-medium text-muted-foreground'
                >
                  {t('crm.customers.detail.totalLabel')}
                </TableCell>
                <TableCell className='text-right font-medium tabular-nums'>
                  {formatAmount(customer.opportunityTotal, locale)}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        )}
      </section>
    </div>
  );
}

function CustomerDetailActions(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={isClosing}
        onClick={() => void close()}
      >
        {t('actions.close')}
      </Button>
      <Button
        nativeButton={false}
        render={<Link to={{ pathname: 'edit', search: location.search }} />}
      >
        <PencilIcon data-icon='inline-start' />
        {t('actions.edit')}
      </Button>
    </>
  );
}
