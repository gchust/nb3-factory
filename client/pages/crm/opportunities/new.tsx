import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { OpportunitiesOutletContext } from '../types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-new-form';

export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.opportunities.create.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewOpportunityFooter submitting={submitting} />}
    >
      <NewOpportunityBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewOpportunityBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { reload } = useOutletContext<OpportunitiesOutletContext>();
  const { close } = useRouteOverlay();
  return (
    <OpportunityForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewOpportunityFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
      </Button>
    </>
  );
}
