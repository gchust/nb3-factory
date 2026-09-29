import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { useContact, useCustomers } from '../hooks.js';
import type { Contact, CrmListOutletContext, Customer } from '../types.js';
import { ContactForm } from './contact-form.js';

const FORM_ID = 'contact-edit-form';

/** Route `/contacts/:contactId/edit`: the edit dialog. */
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
  const { reload: reloadList } = useOutletContext<CrmListOutletContext>();
  const contact = useContact(contactId);
  const customers = useCustomers();

  // The state disables the buttons; the ref is what beforeClose reads.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const status =
    contact.error instanceof ApiClientError ? contact.error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;

  const error = contact.error ?? customers.error;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound ? t('crm.common.notFound') : t('crm.common.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.common.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              contact.reload();
              customers.reload();
            }}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!contact.data || !customers.data) {
    body = (
      <Skeleton
        className='h-48 w-full'
        role='status'
        aria-label={t('status.loading')}
        aria-busy={contact.loading || customers.loading}
      />
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditContactBody
        contact={contact.data}
        customers={customers.data}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          reloadList();
        }}
      />
    );
    footer = <EditContactFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('crm.contacts.editTitle')}
      description={t('crm.contacts.form.description')}
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
  readonly customers: Customer[];
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<CrmListOutletContext>();
  return (
    <ContactForm
      formId={FORM_ID}
      contact={contact}
      customers={customers}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function EditContactFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <CloseButton label={t('actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
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
