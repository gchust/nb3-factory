import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useState, type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { createCustomer, type CustomerInput } from '../api.js';
import { CustomerForm } from '../components.js';
import { describeRequestError, useRequestErrorMessages } from '../hooks.js';

export default function NewCustomerDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog title={t('crm.customers.addTitle')}>
      <NewCustomerForm />
    </RouteDialog>
  );
}

// The overlay context is provided inside RouteDialog, so the hook that closes it
// must run in a descendant of the dialog rather than in the page component that
// renders the dialog.
function NewCustomerForm(): ReactElement {
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const errorMessages = useRequestErrorMessages();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: CustomerInput): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await createCustomer(api, values);
      await close();
    } catch (caught) {
      setError(describeRequestError(caught, errorMessages));
      setSubmitting(false);
    }
  }

  return (
    <CustomerForm
      submitting={submitting}
      error={error}
      onSubmit={(values) => void handleSubmit(values)}
      onCancel={() => void close()}
    />
  );
}
