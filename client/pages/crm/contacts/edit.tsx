import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { CrmTableSkeleton } from '../table-skeleton.js';
import type { Contact, ContactsOutletContext } from '../types.js';
import { ContactForm } from './contact-form.js';

const FORM_ID = 'contact-edit-form';

export default function EditContactPage(): ReactElement {
  const { t } = useTranslation();
  const { contactId } = useParams<{ contactId: string }>();
  const { rows, reload } = useOutletContext<ContactsOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const contact = rows?.find((row) => String(row.id) === contactId);

  if (notFound || (rows !== undefined && !contact)) {
    return (
      <RouteDialog
        title={t('crm.error.notFoundTitle')}
        className='sm:max-w-lg'
        footer={<CloseOnlyFooter />}
      >
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('crm.error.notFoundDescription')}
          </AlertDescription>
        </Alert>
      </RouteDialog>
    );
  }

  if (!contact) {
    return (
      <RouteDialog
        title={t('crm.contacts.edit.title')}
        className='sm:max-w-lg'
        footer={<CloseOnlyFooter />}
      >
        <CrmTableSkeleton label={t('status.loading')} />
      </RouteDialog>
    );
  }

  return (
    <RouteDialog
      title={t('crm.contacts.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditContactFooter submitting={submitting} />}
    >
      <EditContactBody
        contact={contact}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setNotFound(true);
          reload();
        }}
      />
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
  const { reload } = useOutletContext<ContactsOutletContext>();
  const { close } = useRouteOverlay();
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
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
      </Button>
    </>
  );
}

function CloseOnlyFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}
