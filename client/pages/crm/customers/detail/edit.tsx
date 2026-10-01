import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { useCustomer } from '../../hooks.js';
import type { Customer, CustomerDetailOutletContext } from '../../types.js';
import { CustomerForm } from '../customer-form.js';

const FORM_ID = 'customer-edit-form';

/** Route `/customers/:customerId/edit`: edit a customer, stacked on the detail drawer. */
export default function EditCustomerPage(): ReactElement {
  const { customerId = '' } = useParams();
  return <EditCustomer key={customerId} customerId={customerId} />;
}

function EditCustomer({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { onNotFound } = useOutletContext<CustomerDetailOutletContext>();
  // The state disables the buttons; the ref is what beforeClose reads.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // Load the latest data by id before rendering the form, instead of using the drawer's possibly stale record.
  const { loading, data, error, reload } = useCustomer(customerId);
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound ? t('crm.common.notFound') : t('crm.common.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.common.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!data) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        aria-busy={loading}
        className='flex flex-col gap-5'
      >
        {['name', 'industry'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditCustomerBody
        customer={data}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
        }}
      />
    );
    footer = <EditCustomerFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('crm.customers.editTitle')}
      description={t('crm.customers.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function EditCustomerBody({
  customer,
  onSubmittingChange,
  onNotFound,
}: {
  readonly customer: Customer;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<CustomerDetailOutletContext>();
  return (
    <CustomerForm
      formId={FORM_ID}
      customer={customer}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        onSaved(saved);
        void close();
      }}
    />
  );
}

function EditCustomerFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <CloseButton label={t('actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function CloseButton({
  label,
  disabled = false,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}
