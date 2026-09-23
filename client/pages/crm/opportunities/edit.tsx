import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  listCustomers,
  listOpportunities,
  updateOpportunity,
  type CustomerRecord,
  type OpportunityInput,
  type OpportunityRecord,
} from '../api.js';
import { FormError, OpportunityForm, StatePanel } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function EditOpportunityDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog title={t('crm.opportunities.editTitle')}>
      <EditOpportunityForm />
    </RouteDialog>
  );
}

// The overlay context is provided inside RouteDialog, so the hook that closes it
// must run in a descendant of the dialog rather than in the page component that
// renders the dialog.
function EditOpportunityForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { opportunityId } = useParams();
  const { close } = useRouteOverlay();
  const errorMessages = useRequestErrorMessages();
  const id = Number(opportunityId);
  const { data: customers } = useCrmData<CustomerRecord[]>(
    'opportunity-form-customers',
    (signal) => listCustomers(api, { signal }),
  );
  const {
    data: opportunities,
    error,
    loading,
  } = useCrmData<OpportunityRecord[]>(
    `opportunity-edit:${opportunityId ?? ''}`,
    (signal) => listOpportunities(api, undefined, { signal }),
  );
  const opportunity = opportunities?.find((item) => item.id === id);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: OpportunityInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateOpportunity(api, id, values);
      await close();
    } catch (caught) {
      setSubmitError(describeRequestError(caught, errorMessages));
      setSubmitting(false);
    }
  }

  return (
    <>
      {loading && !opportunities ? (
        <StatePanel>{t('crm.common.loading')}</StatePanel>
      ) : null}
      {error ? (
        <FormError message={describeRequestError(error, errorMessages)} />
      ) : null}
      {opportunities && !opportunity ? (
        <StatePanel>{t('crm.common.notFound')}</StatePanel>
      ) : null}
      {opportunity && customers && customers.length > 0 ? (
        <OpportunityForm
          customers={customers}
          initial={opportunity}
          submitting={submitting}
          error={submitError}
          onSubmit={(values) => void handleSubmit(values)}
          onCancel={() => void close()}
        />
      ) : null}
    </>
  );
}
