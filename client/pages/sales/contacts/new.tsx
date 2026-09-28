import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { CloseOnSubmit } from '../close-on-submit.js';
import { ContactForm } from '../contact-form.js';
import { FormDialogFooter } from '../form-dialog-footer.js';
import type { ContactsOutletContext } from '../types.js';

const FORM_ID = 'contact-create';

export default function NewContactDialog(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<ContactsOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.contacts.new.title')}
      description={t('sales.contacts.new.description')}
      footer={<FormDialogFooter formId={FORM_ID} submitting={submitting} />}
    >
      <CloseOnSubmit onSaved={reload}>
        {(onSubmitted) => (
          <ContactForm
            formId={FORM_ID}
            onSubmittingChange={setSubmitting}
            onSubmitted={onSubmitted}
          />
        )}
      </CloseOnSubmit>
    </RouteDialog>
  );
}
