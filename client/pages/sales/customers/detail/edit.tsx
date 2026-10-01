import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDialog } from '@/components/route-dialog';

import { CloseOnSubmit } from '../../close-on-submit.js';
import { CustomerForm } from '../../customer-form.js';
import { DrawerCloseButton } from '../../drawer-close-button.js';
import { FormDialogFooter } from '../../form-dialog-footer.js';
import { RemoteDataError } from '../../remote-data.js';
import type { Customer, CustomersOutletContext } from '../../types.js';
import { useRemoteOne } from '../../use-remote.js';

const FORM_ID = 'customer-edit';

export default function EditCustomerDialog(): ReactElement {
  const { t } = useTranslation();
  const { customerId } = useParams<{ customerId: string }>();
  const parsedId = Number(customerId);
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : undefined;
  const { data, loading, error, notFound, reload } = useRemoteOne<Customer>(
    'customers',
    id,
  );
  // The drawer provides this; its reload refreshes the drawer and the list.
  const { reload: reloadParent } = useOutletContext<CustomersOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.customers.edit.title')}
      description={t('sales.customers.edit.description')}
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
          {t('sales.customers.detail.notFound')}
        </p>
      ) : null}
      {data ? (
        <CloseOnSubmit onSaved={reloadParent}>
          {(onSubmitted) => (
            <CustomerForm
              customer={data}
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
