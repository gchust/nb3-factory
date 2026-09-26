import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { CustomerMemoForm } from './customer-memo-form.js';
import type { CustomerMemosOutletContext } from './types.js';

const FORM_ID = 'customer-memo-new-form';

/** Route `/customer-memos/new`: the create dialog. */
export default function NewCustomerMemoPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what `beforeClose` reads, because a close right after a successful
  // save may run before the new state has rendered.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('customerMemos.createTitle')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewCustomerMemoFooter submitting={submitting} />}
    >
      <NewCustomerMemoBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// `useRouteOverlay()` only works in a component rendered inside the overlay, so the form and the footer each get one.
function NewCustomerMemoBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<CustomerMemosOutletContext>();
  return (
    <CustomerMemoForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewCustomerMemoFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {t('customerMemos.createAction')}
      </Button>
    </>
  );
}
