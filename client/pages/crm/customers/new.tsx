import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { CustomerListOutletContext } from '../types.js';
import { CustomerForm } from './customer-form.js';

const FORM_ID = 'customer-create-form';

/** Create a customer, opened at `/customers/new` over the list. */
export default function NewCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<CustomerListOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('customers.create.title')}
      description={t('customers.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submitting}
      footer={<NewCustomerFooter submitting={submitting} />}
    >
      <NewCustomerBody
        onSubmittingChange={setSubmitting}
        onSubmitted={() => {
          reload();
        }}
      />
    </RouteDialog>
  );
}

function NewCustomerBody({
  onSubmittingChange,
  onSubmitted,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <CustomerForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        onSubmitted();
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
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
