import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';

import {
  OverlayCancelButton,
  OverlaySubmitButton,
} from '../crm/overlay-footer.js';
import type { ListOutletContext } from '../crm/types.js';
import { ContactForm } from './contact-form.js';

const FORM_ID = 'contact-new-form';

/** Route `/contacts/new`: the create-contact dialog. */
export default function NewContactPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.contact.create.title')}
      description={t('crm.contact.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewContactFooter submitting={submitting} />}
    >
      <NewContactBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewContactBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ListOutletContext>();
  return (
    <ContactForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
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
  return (
    <>
      <OverlayCancelButton label={t('actions.cancel')} disabled={submitting} />
      <OverlaySubmitButton
        formId={FORM_ID}
        submitting={submitting}
        label={t('actions.create')}
        submittingLabel={t('actions.creating')}
      />
    </>
  );
}
