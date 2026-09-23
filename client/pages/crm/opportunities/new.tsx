import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useState, type ReactElement } from 'react';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  createOpportunity,
  listCustomers,
  type CustomerRecord,
  type OpportunityInput,
} from '../api.js';
import { FormError, OpportunityForm, StatePanel } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function NewOpportunityDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog title={t('crm.opportunities.addTitle')}>
      <NewOpportunityForm />
    </RouteDialog>
  );
}

// The overlay context is provided inside RouteDialog, so the hook that closes it
// must run in a descendant of the dialog rather than in the page component that
// renders the dialog.
function NewOpportunityForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const errorMessages = useRequestErrorMessages();
  const { data: customers, error: customersError } = useCrmData<
    CustomerRecord[]
  >('opportunity-form-customers', (signal) => listCustomers(api, { signal }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: OpportunityInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createOpportunity(api, values);
      await close();
    } catch (caught) {
      setSubmitError(describeRequestError(caught, errorMessages));
      setSubmitting(false);
    }
  }

  return (
    <>
      {customersError ? (
        <FormError
          message={describeRequestError(customersError, errorMessages)}
        />
      ) : null}
      {customers && customers.length === 0 ? (
        <StatePanel>{t('crm.opportunities.noCustomers')}</StatePanel>
      ) : null}
      {customers && customers.length > 0 ? (
        <OpportunityForm
          customers={customers}
          submitting={submitting}
          error={submitError}
          onSubmit={(values) => void handleSubmit(values)}
          onCancel={() => void close()}
        />
      ) : null}
      {!customers && !customersError ? (
        <StatePanel>{t('crm.common.loading')}</StatePanel>
      ) : null}
    </>
  );
}
