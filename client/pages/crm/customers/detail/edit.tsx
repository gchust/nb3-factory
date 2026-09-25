import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { CustomerForm } from '../../customer-form.js';
import type { Customer, CustomerDetailOutletContext } from '../../types.js';

const FORM_ID = 'crm-customer-edit-form';

export default function EditCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('crm.customers.edit.title')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditCustomerFooter submitting={submitting} />}
    >
      <EditCustomerBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function EditCustomerBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const { customerId } = useParams<{ customerId: string }>();
  const { onSaved, onNotFound } =
    useOutletContext<CustomerDetailOutletContext>();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${customerId ?? ''}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly customer?: Customer;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    const key = `${customerId}:${reloadCount}`;
    api
      .request<{ data: Customer }>({
        path: `crm/customers/${encodeURIComponent(customerId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, customer: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof ApiClientError && error.status === 404) {
            // The record was deleted while the dialog was open: tell the drawer
            // and close instead of offering a form that cannot be saved.
            onNotFound();
            void close();
            return;
          }
          setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, customerId, reloadCount, close, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const customer = result?.customer;

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  if (!customer) {
    return (
      <div role='status' aria-label={t('status.loading')} className='space-y-4'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  return (
    <CustomerForm
      customer={customer}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={() => {
        onNotFound();
        void close();
      }}
      onSubmitted={(saved) => {
        onSaved(saved);
        void close();
      }}
    />
  );
}

function EditCustomerFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('crm.actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('crm.actions.saving') : t('crm.actions.save')}
      </Button>
    </>
  );
}
