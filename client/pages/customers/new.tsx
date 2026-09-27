import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import type { SalesListOutletContext } from '../sales/types.js';
import { CustomerForm } from './customer-form.js';

const FORM_ID = 'customer-create-form';

/** Route `/customers/new`: create a customer in a dialog over the list. */
export default function CustomerCreatePage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.customers.form.createTitle')}
      description={t('sales.customers.form.createDescription')}
      footer={<CustomerCreateFooter submitting={submitting} />}
    >
      <CustomerCreateBody onSubmittingChange={setSubmitting} />
    </RouteDialog>
  );
}

/**
 * The form lives inside `RouteDialog`, so `useRouteOverlay` resolves the dialog's own close. Calling it from the page
 * that renders the dialog would sit outside the overlay's context and throw.
 */
function CustomerCreateBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<SalesListOutletContext>();

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

function CustomerCreateFooter({
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
        onClick={() => void close()}
        disabled={submitting}
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
