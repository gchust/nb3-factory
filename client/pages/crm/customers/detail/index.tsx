import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useCustomerSummary } from '../../hooks.js';
import { useAmountFormatter } from '../../format.js';
import type {
  Contact,
  CrmListOutletContext,
  Customer,
  CustomerDetailOutletContext,
  CustomerSummary,
  Opportunity,
  OpportunityStage,
} from '../../types.js';

/** Route `/customers/:customerId`: the customer detail drawer. */
export default function CustomerDetailPage(): ReactElement {
  const { customerId = '' } = useParams();
  // Key by id: moving forward or back to another record starts the drawer's state over.
  return <CustomerDetail key={customerId} customerId={customerId} />;
}

const STAGE_BADGE: Record<
  OpportunityStage,
  'default' | 'secondary' | 'outline'
> = {
  nurturing: 'secondary',
  won: 'default',
  lost: 'outline',
};

function CustomerDetail({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { reload: reloadList } = useOutletContext<CrmListOutletContext>();
  const { loading, data, error, reload } = useCustomerSummary(customerId);

  const status = error instanceof ApiClientError ? error.status : undefined;
  // A 404 means the record was deleted: show a permanent notice, and refresh the list behind the drawer.
  const [goneOnSave, setGoneOnSave] = useState(false);
  useEffect(() => {
    if (status === 404) {
      reloadList();
    }
  }, [status, reloadList]);

  const notFound = goneOnSave || status === 404;

  // After an edit is saved, show the record the endpoint returned right away instead of waiting for a reload.
  const [savedCustomer, setSavedCustomer] = useState<Customer>();
  const summary: CustomerSummary | undefined = notFound
    ? undefined
    : data && { ...data, customer: savedCustomer ?? data.customer };

  // The edit dialog (child route edit) gets these callbacks through <Outlet context>.
  const outletContext = useMemo<CustomerDetailOutletContext>(
    () => ({
      onSaved: (customer) => {
        setSavedCustomer(customer);
        reloadList();
      },
      onNotFound: () => {
        setGoneOnSave(true);
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
          {notFound ? t('crm.common.notFound') : t('crm.common.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.common.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!summary) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        aria-busy={loading}
        className='space-y-3'
      >
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else {
    body = <CustomerDetails summary={summary} />;
  }

  return (
    <RouteDrawer
      title={summary?.customer.name ?? t('crm.customers.detailTitle')}
      footer={
        summary ? (
          <CustomerDetailActions
            onRefresh={reload}
            editTo={{ pathname: 'edit', search: location.search }}
          />
        ) : undefined
      }
    >
      {body}
      {/* The edit dialog (child route edit) renders inside the drawer, stacked on it. */}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function CustomerDetailActions({
  onRefresh,
  editTo,
}: {
  readonly onRefresh: () => void;
  readonly editTo: { pathname: string; search: string };
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Button type='button' variant='outline' onClick={onRefresh}>
        {t('crm.common.refresh')}
      </Button>
      <Button nativeButton={false} render={<Link to={editTo} />}>
        {t('crm.common.edit')}
      </Button>
    </>
  );
}

function CustomerDetails({
  summary,
}: {
  readonly summary: CustomerSummary;
}): ReactElement {
  const { t } = useTranslation();
  const formatAmount = useAmountFormatter();
  return (
    <div className='space-y-6'>
      <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
        <dt className='text-muted-foreground'>
          {t('crm.customers.columns.name')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>{summary.customer.name}</dd>
        <dt className='text-muted-foreground'>
          {t('crm.customers.columns.industry')}
        </dt>
        <dd className='min-w-0 wrap-anywhere'>
          {summary.customer.industry ?? '—'}
        </dd>
      </dl>
      <ContactsSection contacts={summary.contacts} />
      <OpportunitiesSection
        opportunities={summary.opportunities}
        total={summary.opportunityTotal}
        formatAmount={formatAmount}
      />
      <div className='flex items-baseline justify-between rounded-lg border bg-muted/40 px-3 py-2'>
        <span className='text-sm text-muted-foreground'>
          {t('crm.customers.totalLabel')}
        </span>
        <span className='text-lg font-semibold tabular-nums'>
          {formatAmount(summary.opportunityTotal)}
        </span>
      </div>
    </div>
  );
}

function ContactsSection({
  contacts,
}: {
  readonly contacts: readonly Contact[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='space-y-2'>
      <h2 className='text-sm font-medium'>
        {t('crm.customers.contactsTitle')}
      </h2>
      {contacts.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('crm.customers.contactsEmpty')}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className='flex items-center justify-between gap-4 px-3 py-2 text-sm'
            >
              <span className='min-w-0 wrap-anywhere font-medium'>
                {contact.name}
              </span>
              <span className='min-w-0 wrap-anywhere text-muted-foreground'>
                {[contact.phone, contact.email].filter(Boolean).join(' · ') ||
                  '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpportunitiesSection({
  opportunities,
  total,
  formatAmount,
}: {
  readonly opportunities: readonly Opportunity[];
  readonly total: number;
  readonly formatAmount: (amount: number) => string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='space-y-2'>
      <h2 className='text-sm font-medium'>
        {t('crm.customers.opportunitiesTitle')}
      </h2>
      {opportunities.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('crm.customers.opportunitiesEmpty')}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {opportunities.map((opportunity) => (
            <li
              key={opportunity.id}
              className='flex items-center justify-between gap-4 px-3 py-2 text-sm'
            >
              <span className='min-w-0 wrap-anywhere font-medium'>
                {opportunity.name}
              </span>
              <span className='flex shrink-0 items-center gap-3'>
                <Badge variant={STAGE_BADGE[opportunity.stage]}>
                  {t(`crm.opportunities.stage.${opportunity.stage}`)}
                </Badge>
                <span className='tabular-nums'>
                  {formatAmount(opportunity.amount)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className='text-right text-sm text-muted-foreground'>
        {t('crm.customers.totalLabel')}:{' '}
        <span className='font-medium tabular-nums text-foreground'>
          {formatAmount(total)}
        </span>
      </p>
    </section>
  );
}
