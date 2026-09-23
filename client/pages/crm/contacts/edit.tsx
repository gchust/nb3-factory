import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  listContacts,
  listCustomers,
  updateContact,
  type ContactInput,
  type ContactRecord,
  type CustomerRecord,
} from '../api.js';
import { ContactForm, FormError, StatePanel } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function EditContactDialog(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog title={t('crm.contacts.editTitle')}>
      <EditContactForm />
    </RouteDialog>
  );
}

// The overlay context is provided inside RouteDialog, so the hook that closes it
// must run in a descendant of the dialog rather than in the page component that
// renders the dialog.
function EditContactForm(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { contactId } = useParams();
  const { close } = useRouteOverlay();
  const errorMessages = useRequestErrorMessages();
  const id = Number(contactId);
  const { data: customers } = useCrmData<CustomerRecord[]>(
    'contact-form-customers',
    (signal) => listCustomers(api, { signal }),
  );
  const {
    data: contacts,
    error,
    loading,
  } = useCrmData<ContactRecord[]>(`contact-edit:${contactId ?? ''}`, (signal) =>
    listContacts(api, { signal }),
  );
  const contact = contacts?.find((item) => item.id === id);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: ContactInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateContact(api, id, values);
      await close();
    } catch (caught) {
      setSubmitError(describeRequestError(caught, errorMessages));
      setSubmitting(false);
    }
  }

  return (
    <>
      {loading && !contacts ? (
        <StatePanel>{t('crm.common.loading')}</StatePanel>
      ) : null}
      {error ? (
        <FormError message={describeRequestError(error, errorMessages)} />
      ) : null}
      {contacts && !contact ? (
        <StatePanel>{t('crm.common.notFound')}</StatePanel>
      ) : null}
      {contact && customers && customers.length > 0 ? (
        <ContactForm
          customers={customers}
          initial={contact}
          submitting={submitting}
          error={submitError}
          onSubmit={(values) => void handleSubmit(values)}
          onCancel={() => void close()}
        />
      ) : null}
    </>
  );
}
