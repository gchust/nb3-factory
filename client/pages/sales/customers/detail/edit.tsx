import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { CustomerForm } from '../../customer-form.js';
import { fetchCustomerDetail } from '../../sales-api.js';
import type { Customer, CustomerDetailOutletContext } from '../../types.js';
import { useApiData } from '../../use-api-data.js';

const FORM_ID = 'sales-customer-edit-form';

/** Route `/sales/customers/:customerId/edit`: the edit dialog, stacked on the detail drawer. */
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
  const api = useApiClient();
  const { onNotFound } = useOutletContext<CustomerDetailOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const load = useCallback(
    (signal: AbortSignal) => fetchCustomerDetail(api, customerId, signal),
    [api, customerId],
  );
  const { data, error, reload } = useApiData(load);

  // A 404 on save also means the record is gone.
  const [goneOnSave, setGoneOnSave] = useState(false);
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = goneOnSave || status === 404;
  const customer = notFound ? undefined : data?.customer;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('sales.customers.detail.notFound')
            : t('sales.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('sales.actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('sales.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('sales.error.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('sales.actions.cancel')} />;
  } else if (!customer) {
    body = (
      <div
        role='status'
        aria-label={t('sales.loading')}
        className='flex flex-col gap-5'
      >
        <Skeleton className='h-4 w-16' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-4 w-16' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
    footer = <CloseButton label={t('sales.actions.cancel')} />;
  } else {
    body = (
      <EditCustomerBody
        customer={customer}
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
      title={t('sales.customers.edit.title')}
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
      customer={customer}
      formId={FORM_ID}
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
      <CloseButton label={t('sales.actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('sales.actions.saving') : t('sales.actions.save')}
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
