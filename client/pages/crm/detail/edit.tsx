import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchCustomerDetail } from '../api.js';
import { CustomerForm } from '../customer-form.js';
import type { Customer, CustomerDetailOutletContext } from '../types.js';
import { useRemoteData } from '../use-remote-data.js';

const FORM_ID = 'customer-edit-form';

/** Route `/customers/:customerId/edit`: edit a customer, stacked on the detail drawer. */
export default function EditCustomerPage(): ReactElement {
  const { customerId = '' } = useParams<{ customerId: string }>();
  return <EditCustomer key={customerId} customerId={customerId} />;
}

function EditCustomer({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { onNotFound } = useOutletContext<CustomerDetailOutletContext>();
  const { data, error, loading, reload } = useRemoteData(
    `customer-edit/${customerId}`,
    (api, signal) =>
      fetchCustomerDetail(api, customerId, signal).then(
        (detail) => detail.customer,
      ),
  );

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;

  useEffect(() => {
    if (status === 404) onNotFound();
  }, [status, onNotFound]);

  let body: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.customerNotFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (loading || !data) {
    body = (
      <div className='space-y-5'>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-8 w-full' />
        </div>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-8 w-full' />
        </div>
      </div>
    );
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
  }

  return (
    <RouteDialog
      title={t('crm.customers.edit.title')}
      description={t('crm.customers.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        <EditFooter
          submitting={submitting}
          enabled={!notFound && !error && !!data}
        />
      }
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

function EditFooter({
  submitting,
  enabled,
}: {
  readonly submitting: boolean;
  readonly enabled: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <div className='flex justify-end gap-2'>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {enabled ? t('actions.cancel') : t('actions.close')}
      </Button>
      {enabled ? (
        <Button type='submit' form={FORM_ID} disabled={submitting}>
          {submitting ? (
            <>
              <Spinner />
              {t('crm.action.saving')}
            </>
          ) : (
            t('actions.save')
          )}
        </Button>
      ) : null}
    </div>
  );
}
