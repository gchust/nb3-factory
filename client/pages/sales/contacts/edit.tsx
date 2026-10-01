import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDialog } from '@/components/route-dialog';

import { CloseOnSubmit } from '../close-on-submit.js';
import { ContactForm } from '../contact-form.js';
import { DrawerCloseButton } from '../drawer-close-button.js';
import { FormDialogFooter } from '../form-dialog-footer.js';
import { RemoteDataError } from '../remote-data.js';
import type { Contact, ContactsOutletContext } from '../types.js';
import { useRemoteOne } from '../use-remote.js';

const FORM_ID = 'contact-edit';

export default function EditContactDialog(): ReactElement {
  const { t } = useTranslation();
  const { contactId } = useParams<{ contactId: string }>();
  const parsedId = Number(contactId);
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : undefined;
  const { data, loading, error, notFound, reload } = useRemoteOne<Contact>(
    'contacts',
    id,
  );
  const { reload: reloadParent } = useOutletContext<ContactsOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.contacts.edit.title')}
      description={t('sales.contacts.edit.description')}
      footer={
        data ? (
          <FormDialogFooter formId={FORM_ID} submitting={submitting} />
        ) : (
          <DrawerCloseButton />
        )
      }
    >
      {loading ? <Loading /> : null}
      {error ? <RemoteDataError reload={reload} /> : null}
      {notFound ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.contacts.detail.notFound')}
        </p>
      ) : null}
      {data ? (
        <CloseOnSubmit onSaved={reloadParent}>
          {(onSubmitted) => (
            <ContactForm
              contact={data}
              formId={FORM_ID}
              onSubmittingChange={setSubmitting}
              onSubmitted={onSubmitted}
            />
          )}
        </CloseOnSubmit>
      ) : null}
    </RouteDialog>
  );
}
