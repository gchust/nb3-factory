import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { ContactForm } from '../contact-form.js';
import { CloseButton, FormFooter, FormSkeleton } from '../dialog-parts.js';
import { fetchContact, fetchCustomers } from '../sales-api.js';
import type { Contact, ContactsOutletContext, Customer } from '../types.js';
import { useApiData } from '../use-api-data.js';

const FORM_ID = 'sales-contact-edit-form';

/** Route `/sales/contacts/:contactId/edit`: the edit dialog over the list. */
export default function EditContactPage(): ReactElement {
  const { contactId = '' } = useParams();
  return <EditContact key={contactId} contactId={contactId} />;
}

function EditContact({
  contactId,
}: {
  readonly contactId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const load = useCallback(
    (signal: AbortSignal) =>
      Promise.all([
        fetchContact(api, contactId, signal),
        fetchCustomers(api, signal),
      ]).then(([contact, customers]) => ({ contact, customers })),
    [api, contactId],
  );
  const { data, error, reload } = useApiData(load);

  const [goneOnSave, setGoneOnSave] = useState(false);
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = goneOnSave || status === 404;
  const contact = notFound ? undefined : data?.contact;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('sales.contacts.edit.notFound')
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
  } else if (!contact || !data) {
    body = <FormSkeleton fields={4} />;
    footer = <CloseButton label={t('sales.actions.cancel')} />;
  } else if (data.customers.length === 0) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('sales.contacts.form.noCustomers')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('sales.actions.close')} />;
  } else {
    body = (
      <EditContactBody
        contact={contact}
        customers={data.customers}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => setGoneOnSave(true)}
      />
    );
    footer = (
      <FormFooter
        formId={FORM_ID}
        submitting={submitting}
        submitLabel={t('sales.actions.save')}
      />
    );
  }

  return (
    <RouteDialog
      title={t('sales.contacts.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function EditContactBody({
  contact,
  customers,
  onSubmittingChange,
  onNotFound,
}: {
  readonly contact: Contact;
  readonly customers: readonly Customer[];
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ContactsOutletContext>();
  return (
    <ContactForm
      contact={contact}
      customers={customers}
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
