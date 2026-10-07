import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { SalesEditDialog } from '../form-dialog.js';
import type { Customer, SalesEditOutletContext } from '../types.js';
import { CustomerForm } from './customer-form.js';

/**
 * Edit a customer. Two routes load it: `/customers/edit/:customerId`, which the list opens over itself, and
 * `/customers/:customerId/edit`, which the detail drawer's "Edit" stacks on the drawer. Both name the parameter
 * `customerId`.
 */
export default function EditCustomerPage(): ReactElement {
  const { customerId = '' } = useParams();
  // Remount when the parameter changes, so the dialog reloads instead of showing the previous record's values.
  return <EditCustomer key={customerId} customerId={customerId} />;
}

function EditCustomer({
  customerId,
}: {
  readonly customerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { onSaved, onNotFound } =
    useOutletContext<SalesEditOutletContext<Customer>>();
  return (
    <SalesEditDialog<Customer>
      title={t('sales.customer.edit')}
      description={t('sales.customer.formDescription')}
      className='sm:max-w-lg'
      path={`customers/${encodeURIComponent(customerId)}`}
      notFoundLabel={t('sales.customer.notFound')}
      skeletonFields={2}
      onSaved={onSaved}
      onNotFound={onNotFound}
      renderForm={(customer, props) => (
        <CustomerForm {...props} customer={customer} />
      )}
    />
  );
}
