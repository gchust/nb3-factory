import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';

import {
  OverlayCancelButton,
  OverlaySubmitButton,
} from '../crm/overlay-footer.js';
import type { ListOutletContext } from '../crm/types.js';
import { OpportunityForm } from './opportunity-form.js';

const FORM_ID = 'opportunity-new-form';

/** Route `/opportunities/new`: the create-opportunity dialog. */
export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what beforeClose reads, because
  // close() runs before the new state value has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.opportunity.create.title')}
      description={t('crm.opportunity.form.description')}
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
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ListOutletContext>();
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
  return (
    <>
      <OverlayCancelButton label={t('actions.cancel')} disabled={submitting} />
      <OverlaySubmitButton
        formId={FORM_ID}
        submitting={submitting}
        label={t('actions.create')}
        submittingLabel={t('actions.creating')}
      />
    </>
  );
}
