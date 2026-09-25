import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { CustomersOutletContext } from '../types.js';
import { CustomerForm } from './customer-form.js';

const FORM_ID = 'customer-new-form';

export default function NewCustomerPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is read by beforeClose, because
  // close() runs before the state that disables it has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.customers.create.title')}
      description={t('crm.customers.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewCustomerFooter submitting={submitting} />}
    >
      <NewCustomerBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewCustomerBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { reload } = useOutletContext<CustomersOutletContext>();
  const { close } = useRouteOverlay();
  return (
    <CustomerForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewCustomerFooter({
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
