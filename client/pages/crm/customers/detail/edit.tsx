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
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchCustomerDetail } from '../../api.js';
import { CustomerForm } from '../../customer-form.js';
import type { Customer, CustomerDetailOutletContext } from '../../types.js';

const FORM_ID = 'crm-customer-edit-form';

export default function EditCustomerPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams();
  const customerId = params.customerId ?? '';
  const { onSaved, onNotFound } =
    useOutletContext<CustomerDetailOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const [reloadCount, retry] = useReducer((count: number) => count + 1, 0);
  const [state, setState] = useState<{
    readonly key: string;
    readonly customer?: Customer;
    readonly error?: unknown;
    readonly missing?: boolean;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    fetchCustomerDetail(api, customerId, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setState({ key, customer: detail });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setState({ key, missing: true });
          return;
        }
        setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, customerId, reloadCount]);

  const current = state?.key === String(reloadCount) ? state : undefined;

  if (current?.missing) {
    return <MissingDialog onNotFound={onNotFound} />;
  }

  return (
    <RouteDialog
      title={t('crm.customer.edit.title')}
      description={t('crm.customer.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditCustomerFooter submitting={submitting} />}
    >
      {current?.error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('crm.error.title')}</AlertTitle>
          <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={retry}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : current?.customer ? (
        <EditCustomerBody
          customer={current.customer}
          onSubmittingChange={handleSubmittingChange}
          onSaved={onSaved}
          onNotFound={onNotFound}
        />
      ) : (
        <Skeleton className='h-48' />
      )}
    </RouteDialog>
  );
}

function EditCustomerBody({
  customer,
  onSubmittingChange,
  onSaved,
  onNotFound,
}: {
  readonly customer: Customer;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSaved: (customer: Customer) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <CustomerForm
      customer={customer}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        onSaved(saved);
        void close();
      }}
    />
  );
}

/** Editing found the record deleted: explain it and offer only "Close" (guideline R3). */
function MissingDialog({
  onNotFound,
}: {
  readonly onNotFound: () => void;
}): ReactElement {
  const { t } = useTranslation();
  useEffect(onNotFound, [onNotFound]);
  return (
    <RouteDialog
      title={t('crm.customer.edit.title')}
      footer={<MissingDialogFooter />}
    >
      <Alert>
        <AlertCircleIcon />
        <AlertTitle>{t('crm.record.notFound.title')}</AlertTitle>
        <AlertDescription>
          {t('crm.record.notFound.description')}
        </AlertDescription>
      </Alert>
    </RouteDialog>
  );
}

function MissingDialogFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {t('routeOverlay.close')}
    </Button>
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
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
