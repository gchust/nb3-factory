import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { salesErrorMessageKey, useApiQuery, type Contact } from '../../shared';
import { ContactForm } from '../contact-form';

const FORM_ID = 'contact-edit-form';

/** Route `/sales/contacts/:contactId/edit`: the edit-contact dialog, stacked on the detail drawer. */
export default function EditContactPage(): ReactElement {
  const { t } = useTranslation();
  const { contactId = '' } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };
  const [gone, setGone] = useState(false);

  const request = useMemo(
    () => ({ path: `sales/contacts/${encodeURIComponent(contactId)}` }),
    [contactId],
  );
  const { data, error, loading } = useApiQuery<Contact>(request);
  const notFound =
    gone || (error instanceof ApiClientError && error.status === 404);

  return (
    <RouteDialog
      title={t('sales.contact.editTitle')}
      description={data?.name}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        <EditContactFooter
          submitting={submitting}
          ready={data !== undefined && !notFound}
        />
      }
    >
      {notFound ? (
        <p className='text-sm text-destructive'>
          {t('sales.errors.contactNotFound')}
        </p>
      ) : error && !loading ? (
        <p className='text-sm text-destructive' role='alert'>
          {t(salesErrorMessageKey(error))}
        </p>
      ) : loading || !data ? (
        <div className='space-y-4'>
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      ) : (
        <EditContactForm
          contact={data}
          onSubmittingChange={handleSubmittingChange}
          onNotFound={() => setGone(true)}
        />
      )}
    </RouteDialog>
  );
}

// useRouteOverlay() is only reachable inside the dialog, so the form and the buttons are their own components.
function EditContactForm({
  contact,
  onSubmittingChange,
  onNotFound,
}: {
  readonly contact: Contact;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <ContactForm
      key={String(contact.id)}
      contact={contact}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => void close()}
      onNotFound={onNotFound}
    />
  );
}

function EditContactFooter({
  submitting,
  ready,
}: {
  readonly submitting: boolean;
  readonly ready: boolean;
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
      <Button
        type='submit'
        form={FORM_ID}
        disabled={submitting || isClosing || !ready}
      >
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
