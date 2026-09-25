import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { CrmTableSkeleton } from '../../table-skeleton.js';
import type { Customer, CustomersOutletContext } from '../../types.js';
import { CustomerForm } from '../customer-form.js';

const FORM_ID = 'customer-edit-form';

export default function EditCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const { customerId } = useParams<{ customerId: string }>();
  const { rows, reload } = useOutletContext<CustomersOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const customer = rows?.find((row) => String(row.id) === customerId);

  if (notFound || (rows !== undefined && !customer)) {
    return (
      <RouteDialog
        title={t('crm.error.notFoundTitle')}
        className='sm:max-w-lg'
        footer={<CloseOnlyFooter />}
      >
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('crm.error.notFoundDescription')}
          </AlertDescription>
        </Alert>
      </RouteDialog>
    );
  }

  if (!customer) {
    return (
      <RouteDialog
        title={t('crm.customers.edit.title')}
        className='sm:max-w-lg'
        footer={<CloseOnlyFooter />}
      >
        <CrmTableSkeleton label={t('status.loading')} />
      </RouteDialog>
    );
  }

  return (
    <RouteDialog
      title={t('crm.customers.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditCustomerFooter submitting={submitting} />}
    >
      <EditCustomerBody
        customer={customer}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setNotFound(true);
          reload();
        }}
      />
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
  const { reload } = useOutletContext<CustomersOutletContext>();
  const { close } = useRouteOverlay();
  return (
    <CustomerForm
      customer={customer}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        reload();
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

function CloseOnlyFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
