import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { SalesEditDialog } from '../form-dialog.js';
import type { Contact, SalesEditOutletContext } from '../types.js';
import { ContactForm } from './contact-form.js';

/** Edit a contact, opened from the contact list. */
export default function EditContactPage(): ReactElement {
  const { contactId = '' } = useParams();
  // Remount when the parameter changes, so the dialog reloads instead of showing the previous record.
  return <EditContact key={contactId} contactId={contactId} />;
}

function EditContact({
  contactId,
}: {
  readonly contactId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { onSaved, onNotFound } =
    useOutletContext<SalesEditOutletContext<Contact>>();
  return (
    <SalesEditDialog<Contact>
      title={t('sales.contact.edit')}
      description={t('sales.contact.formDescription')}
      className='sm:max-w-lg'
      path={`contacts/${encodeURIComponent(contactId)}`}
      notFoundLabel={t('sales.contact.notFound')}
      skeletonFields={3}
      onSaved={onSaved}
      onNotFound={onNotFound}
      renderForm={(contact, props) => (
        <ContactForm {...props} contact={contact} />
      )}
    />
  );
}
