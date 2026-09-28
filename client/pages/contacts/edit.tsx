import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { getContact } from '../crm/api.js';
import { CrmError } from '../crm/request-state.js';
import type { Contact, ContactsOutletContext } from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';
import { ContactForm } from './contact-form.js';

const FORM_ID = 'contact-edit-form';

export default function EditContactPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { contactId } = useParams();
  const id = Number(contactId);
  const valid = Number.isInteger(id) && id > 0;
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const { data, error, loading, reload } = useApiData(
    valid ? `crm:contact:${id}` : 'crm:contact:invalid',
    (signal) =>
      valid
        ? getContact(api, id, signal)
        : Promise.reject(new Error('Invalid contact id')),
  );

  return (
    <RouteDialog
      title={t('crm.contact.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditContactFooter submitting={submitting} />}
    >
      <EditContactBody
        contact={data}
        loading={loading}
        error={error}
        onRetry={reload}
        onSubmittingChange={handleSubmittingChange}
      />
    </RouteDialog>
  );
}

function EditContactBody({
  contact,
  loading,
  error,
  onRetry,
  onSubmittingChange,
}: {
  readonly contact?: Contact;
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ContactsOutletContext>();

  const closeAndReload = (): void => {
    reload();
    void close();
  };

  if (loading && !contact) {
    return (
      <div className='space-y-4' role='status' aria-hidden='true'>
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-9 w-full' />
      </div>
    );
  }

  if (error && !contact) {
    return (
      <CrmError
        error={error}
        onRetry={onRetry}
        notFoundMessage={t('crm.contact.edit.notFound')}
      />
    );
  }

  if (!contact) {
    return <CrmError error={error ?? new Error('missing contact')} />;
  }

  return (
    <ContactForm
      contact={contact}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={closeAndReload}
      onNotFound={closeAndReload}
    />
  );
}

function EditContactFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting || isClosing}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
