import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  getCustomer,
  updateCustomer,
  type CustomerDetailRecord,
  type CustomerInput,
} from '../api.js';
import { CustomerForm, FormError, StatePanel } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function EditCustomerDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog title={t('crm.customers.editTitle')}>
      <EditCustomerForm />
    </RouteDialog>
  );
}

// The overlay context is provided inside RouteDialog, so the hook that closes it
// must run in a descendant of the dialog rather than in the page component that
// renders the dialog.
function EditCustomerForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { customerId } = useParams();
  const { close } = useRouteOverlay();
  const errorMessages = useRequestErrorMessages();
  const id = Number(customerId);
  const { data, error, loading } = useCrmData<CustomerDetailRecord>(
    `customer-edit:${customerId ?? ''}`,
    (signal) => getCustomer(api, id, { signal }),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: CustomerInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateCustomer(api, id, values);
      await close();
    } catch (caught) {
      setSubmitError(describeRequestError(caught, errorMessages));
      setSubmitting(false);
    }
  }

  return (
    <>
      {loading && !data ? (
        <StatePanel>{t('crm.common.loading')}</StatePanel>
      ) : null}
      {error ? (
        <FormError message={describeRequestError(error, errorMessages)} />
      ) : null}
      {data ? (
        <CustomerForm
          initial={data}
          submitting={submitting}
          error={submitError}
          onSubmit={(values) => void handleSubmit(values)}
          onCancel={() => void close()}
        />
      ) : null}
    </>
  );
}
