import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PencilIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { formatAmount } from '../../format.js';
import { OpportunityStageBadge } from '../../stage-badge.js';
import type {
  Contact,
  Customer,
  CustomerDetail,
  CustomerEditOutletContext,
  CustomerListOutletContext,
  Opportunity,
} from '../../types.js';

/**
 * A customer's own page: its details, the contacts and opportunities that belong to it, and the total of its
 * opportunities. Opened as a drawer at `/customers/:customerId` over the list.
 */
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
  const location = useLocation();
  const { reload } = useOutletContext<CustomerListOutletContext>();

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
    api
      .request<{ data: CustomerDetail }>({
        path: `customers/${encodeURIComponent(customerId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, detail: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          if (error instanceof ApiClientError && error.status === 404) {
            reload();
          }
        },
      );
    return () => controller.abort();
  }, [api, customerId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const [saved, setSaved] = useState<Customer>();
  const notFound = goneOnSave || status === 404;
  const detail = loading ? undefined : result?.detail;
  // A save from the stacked edit dialog carries a fresh name and industry but not the lists, so overlay it.
  const view = detail ? { ...detail, ...saved } : undefined;

  // Passed to the `edit` child route: it updates this drawer at once, and refreshes the list behind it.
  const editContext = useMemo<CustomerEditOutletContext>(
    () => ({
      onSaved: (next) => {
        setSaved(next);
        reload();
      },
      onNotFound: () => {
        setGoneOnSave(true);
        reload();
      },
    }),
    [reload],
  );

  let body: ReactElement;
  let footer: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseButton label={t('actions.close')} />;
  } else if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound ? t('customers.error.notFound') : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('customers.error.requestFailed')}
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
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!view) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-4'>
        <Skeleton className='h-5 w-40' />
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = <CustomerDetailBody customer={view} />;
    footer = (
      <>
        <CloseButton label={t('actions.close')} />
        <Button
          render={
            <Link
              to={{ pathname: 'edit', search: location.search }}
              aria-label={t('actions.edit')}
            />
          }
          nativeButton={false}
        >
          <PencilIcon data-icon='inline-start' />
          {t('actions.edit')}
        </Button>
      </>
    );
  }

  return (
    <RouteDrawer
      title={view?.name ?? ''}
      description={view?.industry ?? undefined}
      footer={footer}
    >
      {body}
      {/* The `edit` dialog stacks on this drawer and reads the callbacks above. */}
      <Outlet context={editContext} />
    </RouteDrawer>
  );
}

function CustomerDetailBody({
  customer,
}: {
  readonly customer: CustomerDetail;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='space-y-6'>
      <section className='space-y-2'>
        <h3 className='text-sm font-medium text-muted-foreground'>
          {t('customers.detail.total')}
        </h3>
        <p className='text-2xl font-semibold tabular-nums'>
          {formatAmount(customer.opportunityAmountTotal)}
        </p>
      </section>
      <Separator />
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('customers.detail.contacts')}
        </h3>
        <ContactsList contacts={customer.contacts} />
      </section>
      <Separator />
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>
          {t('customers.detail.opportunities')}
        </h3>
        <OpportunitiesList opportunities={customer.opportunities} />
      </section>
    </div>
  );
}

function ContactsList({
  contacts,
}: {
  readonly contacts: Contact[];
}): ReactElement {
  const { t } = useTranslation();
  if (contacts.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('customers.detail.emptyContacts')}
      </p>
    );
  }
  return (
    <ul className='divide-y rounded-lg border'>
      {contacts.map((contact) => (
        <li
          key={contact.id}
          className='flex items-center justify-between gap-4 px-3 py-2 text-sm'
        >
          <span className='font-medium'>{contact.name}</span>
          <span className='text-muted-foreground'>
            {contact.contact ?? '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OpportunitiesList({
  opportunities,
}: {
  readonly opportunities: Opportunity[];
}): ReactElement {
  const { t } = useTranslation();
  if (opportunities.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('customers.detail.emptyOpportunities')}
      </p>
    );
  }
  return (
    <ul className='divide-y rounded-lg border'>
      {opportunities.map((opportunity) => (
        <li
          key={opportunity.id}
          className='flex items-center justify-between gap-4 px-3 py-2 text-sm'
        >
          <span className='font-medium'>{opportunity.name}</span>
          <span className='flex items-center gap-3'>
            <span className='tabular-nums text-muted-foreground'>
              {formatAmount(opportunity.amount)}
            </span>
            <OpportunityStageBadge stage={opportunity.stage} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function CloseButton({ label }: { readonly label: string }): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={isClosing}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}
