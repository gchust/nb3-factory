import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchContact } from '../../crm/crm-api.js';
import {
  OverlayCancelButton,
  OverlaySubmitButton,
} from '../../crm/overlay-footer.js';
import type { Contact, DetailOutletContext } from '../../crm/types.js';
import { ContactForm } from '../contact-form.js';

const FORM_ID = 'contact-edit-form';

/** Route `/contacts/:contactId/edit`: edit, stacked on the detail drawer. */
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
  const { onNotFound } = useOutletContext<DetailOutletContext<Contact>>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

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
    fetchContact(api, Number(contactId), controller.signal).then(
      (contact) => {
        if (!controller.signal.aborted) setResult({ key, contact });
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: caught });
        if (caught instanceof ApiClientError && caught.status === 404) {
          onNotFound();
        }
      },
    );
    return () => controller.abort();
  }, [api, contactId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const contact = loading ? undefined : result?.contact;

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
    footer = <OverlayCancelButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('crm.contact.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <OverlayCancelButton label={t('actions.cancel')} />;
  } else if (!contact) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['name', 'customer', 'phone', 'email'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <OverlayCancelButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditContactBody
        contact={contact}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
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
  const { onSaved } = useOutletContext<DetailOutletContext<Contact>>();
  return (
    <ContactForm
      formId={FORM_ID}
      contact={contact}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        onSaved(saved);
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
      <OverlayCancelButton label={t('actions.cancel')} disabled={submitting} />
      <OverlaySubmitButton
        formId={FORM_ID}
        submitting={submitting}
        label={t('actions.save')}
        submittingLabel={t('actions.saving')}
      />
    </>
  );
}
