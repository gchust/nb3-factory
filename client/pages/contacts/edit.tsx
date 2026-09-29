import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { ContactForm } from './contacts-form.js';
import type { Contact, ContactsOutletContext } from './types.js';

const FORM_ID = 'contact-edit-form';

/** Route `/contacts/:contactId/edit`: the edit dialog. */
export default function EditContactPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { contactId = '' } = useParams();
  // The state disables the buttons; the ref is what beforeClose reads.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const { reload } = useOutletContext<ContactsOutletContext>();

  // Load the latest record before showing the form, so an edit never starts
  // from stale values the list happens to hold.
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
    api
      .request<{ data: Contact }>({
        path: `contacts/${encodeURIComponent(contactId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, contact: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The row may still be in the list behind the dialog: refresh it.
          if (error instanceof ApiClientError && error.status === 404) reload();
        },
      );
    return () => controller.abort();
  }, [api, contactId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const notFound = error instanceof ApiClientError && error.status === 404;
  const contact = notFound ? undefined : result?.contact;

  return (
    <RouteDialog
      title={t('contacts.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        notFound ? (
          <EditContactFooter submitting={false} closeOnly />
        ) : (
          <EditContactFooter submitting={submitting} />
        )
      }
    >
      {notFound ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('contacts.error.notFound')}</AlertDescription>
        </Alert>
      ) : error ? (
        <div className='flex flex-col items-start gap-3'>
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>
              {t('contacts.error.requestFailed')}
            </AlertDescription>
          </Alert>
          <Button
            variant='outline'
            onClick={() => setReloadCount((c) => c + 1)}
          >
            {t('status.retry')}
          </Button>
        </div>
      ) : loading || !contact ? (
        <EditContactSkeleton label={t('status.loading')} />
      ) : (
        <EditContactForm
          contact={contact}
          onSubmittingChange={handleSubmittingChange}
        />
      )}
    </RouteDialog>
  );
}

function EditContactForm({
  contact,
  onSubmittingChange,
}: {
  readonly contact: Contact;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ContactsOutletContext>();
  return (
    <ContactForm
      contact={contact}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function EditContactFooter({
  submitting,
  closeOnly = false,
}: {
  readonly submitting: boolean;
  readonly closeOnly?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      {closeOnly ? null : (
        <Button type='submit' form={FORM_ID} disabled={submitting}>
          {submitting ? <Spinner data-icon='inline-start' /> : null}
          {submitting ? t('contacts.form.saving') : t('contacts.edit.action')}
        </Button>
      )}
    </>
  );
}

function EditContactSkeleton({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <div role='status' aria-label={label} className='space-y-4'>
      <Skeleton className='h-8 w-full' />
      <Skeleton className='h-8 w-full' />
      <Skeleton className='h-8 w-full' />
      <Skeleton className='h-20 w-full' />
    </div>
  );
}
