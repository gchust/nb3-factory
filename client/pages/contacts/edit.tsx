import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { fetchContacts } from '@/components/crm/crm-api.js';
import type { Contact } from '@/components/crm/types.js';
import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { ContactForm } from './contact-form.js';
import type { ContactsOutletContext } from './types.js';

const FORM_ID = 'contact-edit-form';

/** Route `/contacts/:contactId/edit`: edit a contact. */
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
  const { reload } = useOutletContext<ContactsOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // The list endpoint has no "get one", so load the full list and pick the record out of it.
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${contactId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly contact?: Contact;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${contactId}:${reloadCount}`;
    fetchContacts(api, {}, controller.signal).then(
      (contacts) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            contact: contacts.find((item) => String(item.id) === contactId),
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, contactId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const contact = loading ? undefined : result?.contact;
  const notFound = !loading && !error && !contact;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('crm.contact.error.notFound')
            : t('crm.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('crm.actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('crm.actions.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('crm.actions.cancel')} />;
  } else if (!contact) {
    body = (
      <div
        role='status'
        aria-label={t('crm.status.loading')}
        className='space-y-5'
      >
        <Skeleton className='h-4 w-16' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-4 w-16' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
    footer = <CloseButton label={t('crm.actions.cancel')} />;
  } else {
    body = (
      <EditContactBody
        contact={contact}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          reload();
        }}
      />
    );
    footer = <EditContactFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('crm.contact.edit.title')}
      description={t('crm.contact.form.description')}
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
      formId={FORM_ID}
      contact={contact}
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
      <CloseButton label={t('crm.actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
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
