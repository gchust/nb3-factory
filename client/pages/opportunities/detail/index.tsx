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
import { Skeleton } from '@/components/ui/skeleton';

import { fetchOpportunity } from '../../crm/crm-api.js';
import { OpportunityStageBadge } from '../../crm/stage-badge.js';
import {
  displayText,
  type DetailOutletContext,
  type ListOutletContext,
  type Opportunity,
} from '../../crm/types.js';

/** Route `/opportunities/:opportunityId`: the opportunity detail drawer. */
export default function OpportunityDetailPage(): ReactElement {
  const { opportunityId = '' } = useParams();
  return (
    <OpportunityDetail key={opportunityId} opportunityId={opportunityId} />
  );
}

function OpportunityDetail({
  opportunityId,
}: {
  readonly opportunityId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload: reloadList } = useOutletContext<ListOutletContext>();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${opportunityId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly opportunity?: Opportunity;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${opportunityId}:${reloadCount}`;
    fetchOpportunity(api, Number(opportunityId), controller.signal).then(
      (opportunity) => {
        if (!controller.signal.aborted) setResult({ key, opportunity });
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
  }, [api, opportunityId, reloadCount, reloadList]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;

  const [saved, setSaved] = useState<Opportunity>();
  const [gone, setGone] = useState(false);

  const notFound = gone || status === 404;
  const opportunity = notFound ? undefined : (saved ?? result?.opportunity);

  const outletContext = useMemo<DetailOutletContext<Opportunity>>(
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
            ? t('crm.opportunity.error.notFound')
            : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('crm.opportunity.error.requestFailed')}
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
  } else if (!opportunity) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
  } else {
    body = <OpportunityFields opportunity={opportunity} />;
  }

  return (
    <RouteDrawer
      title={opportunity?.name ?? t('crm.opportunity.detail.title')}
      footer={opportunity ? <OpportunityDetailActions /> : undefined}
    >
      {body}
      <Outlet context={outletContext} />
    </RouteDrawer>
  );
}

function OpportunityDetailActions(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'edit', search: location.search }} />}
    >
      {t('crm.opportunity.actions.edit')}
    </Button>
  );
}

function OpportunityFields({
  opportunity,
}: {
  readonly opportunity: Opportunity;
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

  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>
        {t('crm.opportunity.fields.customer')}
      </dt>
      <dd className='min-w-0 wrap-anywhere'>
        {displayText(opportunity.customerName)}
      </dd>
      <dt className='text-muted-foreground'>
        {t('crm.opportunity.fields.amount')}
      </dt>
      <dd className='tabular-nums'>
        {amountFormat.format(opportunity.amount)}
      </dd>
      <dt className='text-muted-foreground'>
        {t('crm.opportunity.fields.stage')}
      </dt>
      <dd>
        <OpportunityStageBadge stage={opportunity.stage} />
      </dd>
      <dt className='text-muted-foreground'>
        {t('crm.opportunity.fields.createdAt')}
      </dt>
      <dd>{dateFormat.format(new Date(opportunity.createdAt))}</dd>
      <dt className='text-muted-foreground'>
        {t('crm.opportunity.fields.updatedAt')}
      </dt>
      <dd>{dateFormat.format(new Date(opportunity.updatedAt))}</dd>
    </dl>
  );
}
