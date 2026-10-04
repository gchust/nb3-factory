import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { OpportunityForm } from '../../opportunities/opportunity-form';

const FORM_ID = 'customer-opportunity-new-form';

/** Route `/sales/customers/:customerId/opportunities/new`: the create-opportunity dialog for this customer. */
export default function NewCustomerOpportunityPage(): ReactElement {
  const { t } = useTranslation();
  const { customerId = '' } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('sales.opportunity.createTitle')}
      description={t('sales.opportunity.createForCustomerDescription')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<Footer submitting={submitting} />}
    >
      <Body
        customerId={customerId}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function Body({
  customerId,
  onSubmittingChange,
}: {
  readonly customerId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <OpportunityForm
      defaultCustomerId={customerId}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => void close()}
    />
  );
}

function Footer({
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
