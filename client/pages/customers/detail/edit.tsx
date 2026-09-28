import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { getCustomer } from '../../crm/api.js';
import { CrmError } from '../../crm/request-state.js';
import {
  type Customer,
  type CustomerDetailOutletContext,
} from '../../crm/types.js';
import { useApiData } from '../../crm/use-api-data.js';
import { CustomerForm } from '../customer-form.js';

const FORM_ID = 'customer-edit-form';

export default function EditCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { customerId } = useParams();
  const id = Number(customerId);
  const valid = Number.isInteger(id) && id > 0;
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const { data, error, loading, reload } = useApiData(
    valid ? `crm:customer:${id}` : 'crm:customer:invalid',
    (signal) =>
      valid
        ? getCustomer(api, id, signal)
        : Promise.reject(new Error('Invalid customer id')),
  );

  return (
    <RouteDialog
      title={t('crm.customer.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditCustomerFooter submitting={submitting} />}
    >
      <EditCustomerBody
        customer={data}
        loading={loading}
        error={error}
        onRetry={reload}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function EditCustomerBody({
  customer,
  loading,
  error,
  onRetry,
  onSubmittingChange,
}: {
  readonly customer?: Customer;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const { reloadDetail, reloadList } =
    useOutletContext<CustomerDetailOutletContext>();

  if (loading && !customer) {
    return (
      <div className='space-y-4' role='status' aria-hidden='true'>
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
      </div>
    );
  }

  if (error && !customer) {
    return (
      <CrmError
        error={error}
        onRetry={onRetry}
        notFoundMessage={t('crm.customer.detail.notFound')}
      />
    );
  }

  if (!customer) {
    return <CrmError error={new Error('missing')} />;
  }

  return (
    <CustomerForm
      customer={customer}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reloadDetail();
        reloadList();
        void close();
      }}
      onNotFound={() => {
        reloadDetail();
        reloadList();
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
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
