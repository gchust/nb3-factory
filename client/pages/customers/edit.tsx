import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { fetchCustomer } from '../sales/api.js';
import { ListSkeleton } from '../sales/list-skeleton.js';
import type {
  CustomerDetail,
  CustomerDetailOutletContext,
} from '../sales/types.js';
import { CustomerForm } from './customer-form.js';

const FORM_ID = 'customer-edit-form';

/** Route `/customers/:customerId/edit`: edit the customer in a dialog over the detail drawer. */
export default function CustomerEditPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const { customerId } = useParams();
  const { onSaved, onNotFound } =
    useOutletContext<CustomerDetailOutletContext>();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly customer?: CustomerDetail;
    readonly error?: unknown;
  }>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (customerId === undefined) return undefined;
    fetchCustomer(api, customerId, controller.signal).then(
      (customer) => {
        if (!controller.signal.aborted)
          setResult({ key: reloadCount, customer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: reloadCount, error });
      },
    );
    return () => controller.abort();
  }, [api, customerId, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;

  // The record no longer exists: leave no dialog behind a detail that is about to show "not found".
  const notFound = error instanceof ApiClientError && error.status === 404;
  useEffect(() => {
    if (!notFound) return;
    onNotFound();
    void close();
  }, [close, notFound, onNotFound]);

  const customer = loading ? undefined : result?.customer;

  let body: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('sales.customers.detail.notFoundDescription')}
        </AlertDescription>
      </Alert>
    );
  } else if (error !== undefined) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('sales.customers.errorTitle')}</AlertTitle>
        <AlertDescription>{t('sales.errorRequestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (customer === undefined) {
    body = <ListSkeleton label={t('status.loading')} />;
  } else {
    body = (
      <CustomerForm
        customer={customer}
        formId={FORM_ID}
        onSubmittingChange={setSubmitting}
        onSubmitted={(updated) => {
          onSaved(updated);
          void close();
        }}
      />
    );
  }

  return (
    <RouteDialog
      title={t('sales.customers.form.editTitle')}
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => void close()}
            disabled={submitting}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            type='submit'
            form={FORM_ID}
            disabled={submitting || customer === undefined}
          >
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitting ? t('actions.saving') : t('actions.save')}
          </Button>
        </>
      }
    >
      {body}
    </RouteDialog>
  );
}
