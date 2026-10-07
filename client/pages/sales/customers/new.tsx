import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { SalesFormDialog } from '../form-dialog.js';
import type { CustomersOutletContext } from '../types.js';
import { CustomerForm } from './customer-form.js';

/** Create a customer. The list opens it and refreshes once it closes. */
export default function NewCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const { onSaved } = useOutletContext<CustomersOutletContext>();
  return (
    <SalesFormDialog
      title={t('sales.customer.create')}
      description={t('sales.customer.formDescription')}
      className='sm:max-w-lg'
      submitLabel={t('actions.create')}
      onSaved={onSaved}
      renderForm={(props) => <CustomerForm {...props} />}
    />
  );
}
