import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { OpportunityForm } from '../opportunity-form.js';
import type { CrmListOutletContext, Opportunity } from '../types.js';

const FORM_ID = 'crm-opportunity-edit-form';

export default function EditOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.opportunities.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditOpportunityFooter submitting={submitting} />}
    >
      <EditOpportunityBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function EditOpportunityBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const { reload } = useOutletContext<CrmListOutletContext>();

  const [reloadCount, reloadRequest] = useReducer(
    (count: number) => count + 1,
    0,
  );
  const requestKey = `${opportunityId ?? ''}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly opportunity?: Opportunity;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (!opportunityId) return;
    const controller = new AbortController();
    const key = `${opportunityId}:${reloadCount}`;
    api
      .request<{ data: Opportunity }>({
        path: `crm/opportunities/${encodeURIComponent(opportunityId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, opportunity: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof ApiClientError && error.status === 404) {
            reload();
            void close();
            return;
          }
          setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, opportunityId, reloadCount, close, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const opportunity = result?.opportunity;

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reloadRequest}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  if (!opportunity) {
    return (
      <div role='status' aria-label={t('status.loading')} className='space-y-4'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  return (
    <OpportunityForm
      opportunity={opportunity}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={() => {
        reload();
        void close();
      }}
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
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('crm.actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
      </Button>
    </>
  );
}
