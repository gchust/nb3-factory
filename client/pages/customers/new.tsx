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
import { CustomerForm } from './customer-form.js';

const FORM_ID = 'customer-new-form';

/** Route `/customers/new`: the create-customer dialog. */
export default function NewCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.customer.create.title')}
      description={t('crm.customer.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewCustomerFooter submitting={submitting} />}
    >
      <NewCustomerBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewCustomerBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ListOutletContext>();
  return (
    <CustomerForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewCustomerFooter({
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
