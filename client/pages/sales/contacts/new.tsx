import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { useUrlSearch } from '../shared';
import { ContactForm } from './contact-form';

const FORM_ID = 'contact-new-form';

/** Route `/sales/contacts/new`: the create-contact dialog, on top of the contact list. */
export default function NewContactPage(): ReactElement {
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
      title={t('sales.contact.createTitle')}
      description={t('sales.contact.createDescription')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewContactFooter submitting={submitting} />}
    >
      <NewContactBody
        defaultCustomerId={customerId}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function NewContactBody({
  defaultCustomerId,
  onSubmittingChange,
}: {
  readonly defaultCustomerId: string;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <ContactForm
      defaultCustomerId={defaultCustomerId}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => void close()}
    />
  );
}

function NewContactFooter({
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
