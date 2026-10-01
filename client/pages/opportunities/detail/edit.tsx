import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchOpportunity } from '../../crm/crm-api.js';
import {
  OverlayCancelButton,
  OverlaySubmitButton,
} from '../../crm/overlay-footer.js';
import type { DetailOutletContext, Opportunity } from '../../crm/types.js';
import { OpportunityForm } from '../opportunity-form.js';

const FORM_ID = 'opportunity-edit-form';

/** Route `/opportunities/:opportunityId/edit`: edit, stacked on the detail drawer. */
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
  const { onNotFound } = useOutletContext<DetailOutletContext<Opportunity>>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
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
    fetchOpportunity(api, Number(opportunityId), controller.signal).then(
      (opportunity) => {
        if (!controller.signal.aborted) setResult({ key, opportunity });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: caught });
        if (caught instanceof ApiClientError && caught.status === 404) {
          onNotFound();
        }
      },
    );
    return () => controller.abort();
  }, [api, opportunityId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const opportunity = loading ? undefined : result?.opportunity;

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
    footer = <OverlayCancelButton label={t('actions.close')} />;
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
    footer = <OverlayCancelButton label={t('actions.cancel')} />;
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
    footer = <OverlayCancelButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditOpportunityBody
        opportunity={opportunity}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
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
  const { onSaved } = useOutletContext<DetailOutletContext<Opportunity>>();
  return (
    <OpportunityForm
      formId={FORM_ID}
      opportunity={opportunity}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        onSaved(saved);
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
      <OverlayCancelButton label={t('actions.cancel')} disabled={submitting} />
      <OverlaySubmitButton
        formId={FORM_ID}
        submitting={submitting}
        label={t('actions.save')}
        submittingLabel={t('actions.saving')}
      />
    </>
  );
}
