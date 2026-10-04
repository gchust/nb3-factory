import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { useUrlSearch } from '../shared';
import { OpportunityForm } from './opportunity-form';

const FORM_ID = 'opportunity-new-form';

/** Route `/sales/opportunities/new`: the create-opportunity dialog, on top of the opportunity list. */
export default function NewOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  // Opening the dialog keeps the list's query parameters, so the customer filter carries into the new record.
  const [customerId] = useUrlSearch('customerId');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('sales.opportunity.createTitle')}
      description={t('sales.opportunity.createDescription')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewOpportunityFooter submitting={submitting} />}
    >
      <NewOpportunityBody
        defaultCustomerId={customerId}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function NewOpportunityBody({
  defaultCustomerId,
  onSubmittingChange,
}: {
  readonly defaultCustomerId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <OpportunityForm
      defaultCustomerId={defaultCustomerId}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => void close()}
    />
  );
}

function NewOpportunityFooter({
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
      <Button type='submit' form={FORM_ID} disabled={submitting || isClosing}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
