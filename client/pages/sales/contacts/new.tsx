import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { SalesFormDialog } from '../form-dialog.js';
import type { ContactsOutletContext } from '../types.js';
import { ContactForm } from './contact-form.js';

/** Create a contact. The list opens it and refreshes once it closes. */
export default function NewContactPage(): ReactElement {
  const { t } = useTranslation();
  const { onSaved } = useOutletContext<ContactsOutletContext>();
  return (
    <SalesFormDialog
      title={t('sales.contact.create')}
      description={t('sales.contact.formDescription')}
      className='sm:max-w-lg'
      submitLabel={t('actions.create')}
      onSaved={onSaved}
      renderForm={(props) => <ContactForm {...props} />}
    />
  );
}
