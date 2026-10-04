import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { ContactForm } from '../../contacts/contact-form';

const FORM_ID = 'customer-contact-new-form';

/** Route `/sales/customers/:customerId/contacts/new`: the create-contact dialog scoped to this customer. */
export default function NewCustomerContactPage(): ReactElement {
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
      title={t('sales.contact.createTitle')}
      description={t('sales.contact.createForCustomerDescription')}
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
    <ContactForm
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
