import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PencilIcon } from 'lucide-react';
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

import { RouteDrawer } from '@/components/route-drawer';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fetchCustomer } from '../sales/api.js';
import { formatNumber } from '../sales/format.js';
import { ListSkeleton } from '../sales/list-skeleton.js';
import { OpportunityStageBadge } from '../sales/stage-badge.js';
import type {
  Contact,
  CustomerDetail,
  CustomerDetailOutletContext,
  CustomerSummary,
  Opportunity,
  SalesListOutletContext,
} from '../sales/types.js';

/** Route `/customers/:customerId`: the customer detail drawer, with its edit dialog as a child route. */
export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const { customerId } = useParams();
  const { reload: reloadList } = useOutletContext<SalesListOutletContext>();

  const [reloadCount, reloadDetail] = useReducer(
    (count: number) => count + 1,
    0,
  );
  const [result, setResult] = useState<{
    readonly key: number;
    readonly detail?: CustomerDetail;
    readonly error?: unknown;
  }>();
  // A saved customer overrides only the record's own fields; the relationship lists still come from the loaded detail.
  const [saved, setSaved] = useState<{
    readonly id: number;
    readonly customer: CustomerSummary;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    if (customerId === undefined) return undefined;
    fetchCustomer(api, customerId, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, detail });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, customerId, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  const detail = loading ? undefined : result?.detail;
  const customer =
    saved !== undefined && saved.id === detail?.id ? saved.customer : detail;

  const detailContext = useMemo<CustomerDetailOutletContext>(
    () => ({
      onSaved: (updated) => {
        setSaved({ id: updated.id, customer: updated });
        reloadList();
      },
      onNotFound: () => {
        reloadList();
        reloadDetail();
      },
    }),
    [reloadList],
  );

  let body: ReactElement;
  if (error) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    const forbidden = error instanceof ApiClientError && error.status === 403;
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>
          {notFound
            ? t('sales.customers.detail.notFoundTitle')
            : t('sales.customers.errorTitle')}
        </AlertTitle>
        <AlertDescription>
          {notFound
            ? t('sales.customers.detail.notFoundDescription')
            : forbidden
              ? t('sales.errorForbidden')
              : t('sales.errorRequestFailed')}
        </AlertDescription>
        {notFound ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reloadDetail}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (detail === undefined) {
    body = <ListSkeleton label={t('status.loading')} />;
  } else {
    body = (
      <div className='space-y-6'>
        {loading ? (
          <div className='flex justify-end'>
            <Spinner className='text-muted-foreground' />
          </div>
        ) : null}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <Stat
            label={t('sales.contactCount')}
            value={String(detail.contacts.length)}
          />
          <Stat
            label={t('sales.opportunityCount')}
            value={String(detail.opportunities.length)}
          />
          <Stat
            label={t('sales.totalAmount')}
            value={formatNumber(locale, detail.totalAmount)}
          />
        </div>

        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>{t('sales.contacts.title')}</h3>
          {detail.contacts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('sales.customers.detail.noContacts')}
            </p>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {detail.contacts.map((contact: Contact) => (
                <li
                  key={contact.id}
                  className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                >
                  <span className='font-medium'>{contact.name}</span>
                  <span className='text-sm text-muted-foreground'>
                    {contact.contactInfo ?? t('sales.emptyValue')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>
            {t('sales.opportunities.title')}
          </h3>
          {detail.opportunities.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('sales.customers.detail.noOpportunities')}
            </p>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {detail.opportunities.map((opportunity: Opportunity) => (
                <li
                  key={opportunity.id}
                  className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
                >
                  <span className='font-medium'>{opportunity.name}</span>
                  <span className='flex items-center gap-3'>
                    <span className='tabular-nums'>
                      {formatNumber(locale, opportunity.amount)}
                    </span>
                    <OpportunityStageBadge stage={opportunity.stage} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <RouteDrawer
      title={customer?.name ?? t('sales.customers.detail.fallbackTitle')}
      description={customer?.industry ?? undefined}
      footer={
        <>
          <Button
            variant='outline'
            render={<Link to={{ pathname: '..', search: location.search }} />}
            nativeButton={false}
          >
            {t('actions.close')}
          </Button>
          <Button
            render={<Link to={{ pathname: 'edit', search: location.search }} />}
            nativeButton={false}
          >
            <PencilIcon data-icon='inline-start' />
            {t('sales.customers.detail.edit')}
          </Button>
        </>
      }
    >
      {body}
      {/* The edit dialog renders here, inside the drawer, and reads the record from this context. */}
      <Outlet context={detailContext} />
    </RouteDrawer>
  );
}

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-sm text-muted-foreground'>{label}</div>
      <div className='text-xl font-semibold tabular-nums'>{value}</div>
    </div>
  );
}
