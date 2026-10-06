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
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchOpportunity } from '../api.js';
import { OpportunityForm } from '../opportunity-form.js';
import type { OpportunitiesOutletContext, Opportunity } from '../types.js';

const FORM_ID = 'crm-opportunity-edit-form';

export default function EditOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams();
  const opportunityId = params.opportunityId ?? '';
  const { reload } = useOutletContext<OpportunitiesOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const [reloadCount, retry] = useReducer((count: number) => count + 1, 0);
  const [state, setState] = useState<{
    readonly key: string;
    readonly opportunity?: Opportunity;
    readonly error?: unknown;
    readonly missing?: boolean;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    fetchOpportunity(api, opportunityId, controller.signal).then(
      (opportunity) => {
        if (!controller.signal.aborted) setState({ key, opportunity });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setState({ key, missing: true });
          return;
        }
        setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, opportunityId, reloadCount]);

  const current = state?.key === String(reloadCount) ? state : undefined;

  if (current?.missing) {
    return <MissingDialog />;
  }

  return (
    <RouteDialog
      title={t('crm.opportunity.edit.title')}
      description={t('crm.opportunity.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditOpportunityFooter submitting={submitting} />}
    >
      {current?.error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('crm.error.title')}</AlertTitle>
          <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={retry}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : current?.opportunity ? (
        <EditOpportunityBody
          opportunity={current.opportunity}
          onSubmittingChange={handleSubmittingChange}
          onSubmitted={() => {
            reload();
          }}
        />
      ) : (
        <Skeleton className='h-64' />
      )}
    </RouteDialog>
  );
}

function EditOpportunityBody({
  opportunity,
  onSubmittingChange,
  onSubmitted,
}: {
  readonly opportunity: Opportunity;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <OpportunityForm
      opportunity={opportunity}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        onSubmitted();
        void close();
      }}
    />
  );
}

/** Editing found the record deleted: explain it and offer only "Close" (guideline R3). */
function MissingDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('crm.opportunity.edit.title')}
      footer={<MissingDialogFooter />}
    >
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>{t('crm.record.notFound.title')}</AlertTitle>
        <AlertDescription>
          {t('crm.record.notFound.description')}
        </AlertDescription>
      </Alert>
    </RouteDialog>
  );
}

function MissingDialogFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('routeOverlay.close')}
    </Button>
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
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
