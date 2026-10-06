import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import type { ContactListOutletContext } from '../types.js';
import { ContactForm } from './contact-form.js';

const FORM_ID = 'contact-create-form';

/** Create a contact, opened at `/contacts/new` over the list. */
export default function NewContactPage(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<ContactListOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('contacts.create.title')}
      description={t('contacts.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submitting}
      footer={<NewContactFooter submitting={submitting} />}
    >
      <NewContactBody
        onSubmittingChange={setSubmitting}
        onSubmitted={() => {
          reload();
        }}
      />
    </RouteDialog>
  );
}

function NewContactBody({
  onSubmittingChange,
  onSubmitted,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <ContactForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        onSubmitted();
        void close();
      }}
    />
  );
}

function NewContactFooter({
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
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
