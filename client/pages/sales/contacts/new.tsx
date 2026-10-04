import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { ContactForm } from '../contact-form.js';
import { CloseButton, FormFooter, FormSkeleton } from '../dialog-parts.js';
import { fetchCustomers } from '../sales-api.js';
import type { ContactsOutletContext, Customer } from '../types.js';
import { useApiData } from '../use-api-data.js';

const FORM_ID = 'sales-contact-new-form';

/** Route `/sales/contacts/new`: the create dialog over the list. */
export default function NewContactPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const load = useCallback(
    (signal: AbortSignal) => fetchCustomers(api, signal),
    [api],
  );
  const customers = useApiData(load);

  let body: ReactElement;
  let footer: ReactElement;
  if (customers.error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('sales.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={customers.reload}>
            {t('sales.error.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('sales.actions.cancel')} />;
  } else if (!customers.data) {
    body = <FormSkeleton fields={4} />;
    footer = <CloseButton label={t('sales.actions.cancel')} />;
  } else if (customers.data.length === 0) {
    // A contact always belongs to a customer, so there is nothing to create until one exists.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('sales.contacts.form.noCustomers')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('sales.actions.close')} />;
  } else {
    body = (
      <NewContactBody
        customers={customers.data}
        onSubmittingChange={handleSubmittingChange}
      />
    );
    footer = (
      <FormFooter
        formId={FORM_ID}
        submitting={submitting}
        submitLabel={t('sales.actions.create')}
      />
    );
  }

  return (
    <RouteDialog
      title={t('sales.contacts.create.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function NewContactBody({
  customers,
  onSubmittingChange,
}: {
  readonly customers: readonly Customer[];
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<ContactsOutletContext>();
  return (
    <ContactForm
      customers={customers}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}
