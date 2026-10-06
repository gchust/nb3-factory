import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { Opportunity, OpportunityListOutletContext } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-edit-form';

/** Edit an opportunity, opened at `/opportunities/edit/:opportunityId` over the list. */
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
  const { reload } = useOutletContext<OpportunityListOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

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
    api
      .request<{ data: Opportunity }>({
        path: `opportunities/${encodeURIComponent(opportunityId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, opportunity: data });
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
  }, [api, opportunityId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const opportunity = loading ? undefined : result?.opportunity;

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
          {notFound
            ? t('opportunities.error.notFound')
            : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
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
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!opportunity) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['name', 'customer', 'amount', 'stage'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditOpportunityBody
        opportunity={opportunity}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          reload();
        }}
      />
    );
    footer = <EditOpportunityFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('opportunities.edit.title')}
      description={t('opportunities.form.description')}
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
  const { reload } = useOutletContext<OpportunityListOutletContext>();
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
      <CloseButton label={t('actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
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
