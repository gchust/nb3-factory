import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { fetchOpportunities } from '@/components/crm/crm-api.js';
import type { Opportunity } from '@/components/crm/types.js';
import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { OpportunityForm } from './opportunity-form.js';
import type { OpportunitiesOutletContext } from './types.js';

const FORM_ID = 'opportunity-edit-form';

/** Route `/opportunities/:opportunityId/edit`: edit an opportunity. */
export default function EditOpportunityPage(): ReactElement {
  const { opportunityId = '' } = useParams();
  return <EditOpportunity key={opportunityId} opportunityId={opportunityId} />;
}

function EditOpportunity({
  opportunityId,
}: {
  readonly opportunityId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<OpportunitiesOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // The list endpoint has no "get one", so load the full list and pick the record out of it.
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
    fetchOpportunities(api, {}, controller.signal).then(
      (opportunities) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            opportunity: opportunities.find(
              (item) => String(item.id) === opportunityId,
            ),
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, opportunityId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const opportunity = loading ? undefined : result?.opportunity;
  const notFound = !loading && !error && !opportunity;

  let body: ReactElement;
  let footer: ReactElement;
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
    footer = <CloseButton label={t('crm.actions.close')} />;
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
    footer = <CloseButton label={t('crm.actions.cancel')} />;
  } else if (!opportunity) {
    body = (
      <div
        role='status'
        aria-label={t('crm.status.loading')}
        className='space-y-5'
      >
        <Skeleton className='h-4 w-16' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-4 w-16' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
    footer = <CloseButton label={t('crm.actions.cancel')} />;
  } else {
    body = (
      <EditOpportunityBody
        opportunity={opportunity}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          reload();
        }}
      />
    );
    footer = <EditOpportunityFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('crm.opportunity.edit.title')}
      description={t('crm.opportunity.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function EditOpportunityBody({
  opportunity,
  onSubmittingChange,
  onNotFound,
}: {
  readonly opportunity: Opportunity;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<OpportunitiesOutletContext>();
  return (
    <OpportunityForm
      formId={FORM_ID}
      opportunity={opportunity}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function EditOpportunityFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <CloseButton label={t('crm.actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
      </Button>
    </>
  );
}

function CloseButton({
  label,
  disabled = false,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}
