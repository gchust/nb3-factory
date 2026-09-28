import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { getOpportunity } from '../crm/api.js';
import { CrmError } from '../crm/request-state.js';
import type { OpportunitiesOutletContext, Opportunity } from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-edit-form';

export default function EditOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { opportunityId } = useParams();
  const id = Number(opportunityId);
  const valid = Number.isInteger(id) && id > 0;
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const { data, error, loading, reload } = useApiData(
    valid ? `crm:opportunity:${id}` : 'crm:opportunity:invalid',
    (signal) =>
      valid
        ? getOpportunity(api, id, signal)
        : Promise.reject(new Error('Invalid opportunity id')),
  );

  return (
    <RouteDialog
      title={t('crm.opportunity.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditOpportunityFooter submitting={submitting} />}
    >
      <EditOpportunityBody
        opportunity={data}
        loading={loading}
        error={error}
        onRetry={reload}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function EditOpportunityBody({
  opportunity,
  loading,
  error,
  onRetry,
  onSubmittingChange,
}: {
  readonly opportunity?: Opportunity;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<OpportunitiesOutletContext>();

  const closeAndReload = (): void => {
    reload();
    void close();
  };

  if (loading && !opportunity) {
    return (
      <div className='space-y-4' role='status' aria-hidden='true'>
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
      </div>
    );
  }

  if (error && !opportunity) {
    return (
      <CrmError
        error={error}
        onRetry={onRetry}
        notFoundMessage={t('crm.opportunity.edit.notFound')}
      />
    );
  }

  if (!opportunity) {
    return <CrmError error={error ?? new Error('missing opportunity')} />;
  }

  return (
    <OpportunityForm
      opportunity={opportunity}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={closeAndReload}
      onNotFound={closeAndReload}
    />
  );
}

function EditOpportunityFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting || isClosing}
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
