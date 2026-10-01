import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { CloseOnSubmit } from '../close-on-submit.js';
import { CustomerForm } from '../customer-form.js';
import { FormDialogFooter } from '../form-dialog-footer.js';
import type { CustomersOutletContext } from '../types.js';

const FORM_ID = 'customer-create';

export default function NewCustomerDialog(): ReactElement {
  const { t } = useTranslation();
  const { reload } = useOutletContext<CustomersOutletContext>();
  const [submitting, setSubmitting] = useState(false);

  return (
    <RouteDialog
      title={t('sales.customers.new.title')}
      description={t('sales.customers.new.description')}
      footer={<FormDialogFooter formId={FORM_ID} submitting={submitting} />}
    >
      <CloseOnSubmit onSaved={reload}>
        {(onSubmitted) => (
          <CustomerForm
            formId={FORM_ID}
            onSubmittingChange={setSubmitting}
            onSubmitted={onSubmitted}
          />
        )}
      </CloseOnSubmit>
    </RouteDialog>
  );
}
