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

import { fetchContact } from '../api.js';
import { ContactForm } from '../contact-form.js';
import type { Contact, ContactsOutletContext } from '../types.js';
import { useRemoteData } from '../use-remote-data.js';

const FORM_ID = 'contact-edit-form';

/** Route `/contacts/:contactId/edit`: edit a contact. */
export default function EditContactPage(): ReactElement {
  const { contactId = '' } = useParams<{ contactId: string }>();
  return <EditContact key={contactId} contactId={contactId} />;
}

function EditContact({
  contactId,
}: {
  readonly contactId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<ContactsOutletContext>();
  const {
    data,
    error,
    loading,
    reload: retry,
  } = useRemoteData(`contact-edit/${contactId}`, (api, signal) =>
    fetchContact(api, contactId, signal),
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
    if (status === 404) reload();
  }, [status, reload]);

  let body: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.contactNotFound')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={retry}>
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
      <EditContactBody
        contact={data}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => setGoneOnSave(true)}
      />
    );
  }

  return (
    <RouteDialog
      title={t('crm.contacts.edit.title')}
      description={t('crm.contacts.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        <EditContactFooter
          submitting={submitting}
          enabled={!notFound && !error && !!data}
        />
      }
    >
      {body}
    </RouteDialog>
  );
}

function EditContactBody({
  contact,
  onSubmittingChange,
  onNotFound,
}: {
  readonly contact: Contact;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ContactsOutletContext>();
  return (
    <ContactForm
      contact={contact}
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

function EditContactFooter({
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
