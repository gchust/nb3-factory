import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { CustomerForm } from '../customer-form';
import { salesErrorMessageKey, useApiQuery, type Customer } from '../../shared';

const FORM_ID = 'customer-edit-form';

/** Route `/sales/customers/:customerId/edit`: the edit-customer dialog, stacked on the detail page. */
export default function EditCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const { customerId = '' } = useParams();
  // The state disables the buttons; the ref is what beforeClose reads, before the next render lands.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };
  // The record was deleted while this dialog was open.
  const [gone, setGone] = useState(false);

  const request = useMemo(
    () => ({ path: `sales/customers/${encodeURIComponent(customerId)}` }),
    [customerId],
  );
  const { data, error, loading } = useApiQuery<Customer>(request);
  const notFound =
    gone || (error instanceof ApiClientError && error.status === 404);

  return (
    <RouteDialog
      title={t('sales.customer.editTitle')}
      description={t('sales.customer.editDescription')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        <EditCustomerFooter
          submitting={submitting}
          ready={data !== undefined && !notFound}
        />
      }
    >
      {notFound ? (
        <EditCustomerMissing />
      ) : error && !loading ? (
        <p className='text-sm text-destructive' role='alert'>
          {t(salesErrorMessageKey(error))}
        </p>
      ) : loading || !data ? (
        <div className='space-y-4'>
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      ) : (
        <EditCustomerForm
          customer={data}
          onSubmittingChange={handleSubmittingChange}
          onNotFound={() => setGone(true)}
        />
      )}
    </RouteDialog>
  );
}

// useRouteOverlay() is only reachable inside the dialog, so the form and the missing-record notice each get their
// own component rather than the hook being called in the page that returns the dialog.
function EditCustomerForm({
  customer,
  onSubmittingChange,
  onNotFound,
}: {
  readonly customer: Customer;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <CustomerForm
      // Key by the record so a forward or back to another customer remounts the form with that record's values.
      key={String(customer.id)}
      customer={customer}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => void close()}
      onNotFound={onNotFound}
    />
  );
}

function EditCustomerMissing(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <div className='space-y-4'>
      <p className='text-sm text-destructive'>
        {t('sales.errors.customerNotFound')}
      </p>
      <Button variant='outline' onClick={() => void close()}>
        {t('sales.actions.backToList')}
      </Button>
    </div>
  );
}

function EditCustomerFooter({
  submitting,
  ready,
}: {
  readonly submitting: boolean;
  readonly ready: boolean;
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
      <Button
        type='submit'
        form={FORM_ID}
        disabled={submitting || isClosing || !ready}
      >
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
