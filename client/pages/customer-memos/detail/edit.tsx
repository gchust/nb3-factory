import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { CustomerMemoForm } from '../customer-memo-form.js';
import type {
  CustomerMemo,
  CustomerMemoDetailOutletContext,
} from '../types.js';

const FORM_ID = 'customer-memo-edit-form';

/** Route `/customer-memos/:memoId/edit`: the edit dialog, stacked on the detail drawer. */
export default function EditCustomerMemoPage(): ReactElement {
  const { memoId = '' } = useParams();
  return <EditCustomerMemo key={memoId} memoId={memoId} />;
}

function EditCustomerMemo({
  memoId,
}: {
  readonly memoId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { onNotFound } = useOutletContext<CustomerMemoDetailOutletContext>();

  // The state disables the buttons; the ref is what `beforeClose` reads.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // Load the latest record on open rather than trusting the drawer's copy.
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${memoId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly memo?: CustomerMemo;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${memoId}:${reloadCount}`;
    api
      .request<{ data: CustomerMemo }>({
        path: `customer-memos/${encodeURIComponent(memoId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, memo: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          if (error instanceof ApiClientError && error.status === 404) {
            onNotFound();
          }
        },
      );
    return () => controller.abort();
  }, [api, memoId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const memo = loading ? undefined : result?.memo;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('customerMemos.notFound')}</AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('customerMemos.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!memo) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-4 w-1/2' />
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditCustomerMemoBody
        memo={memo}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
        }}
      />
    );
    footer = <EditCustomerMemoFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('customerMemos.editTitle')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

// `useRouteOverlay()` only works inside the overlay, so the form gets its own wrapper.
function EditCustomerMemoBody({
  memo,
  onSubmittingChange,
  onNotFound,
}: {
  readonly memo: CustomerMemo;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<CustomerMemoDetailOutletContext>();
  return (
    <CustomerMemoForm
      memo={memo}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        // Update the drawer at once, then close the dialog.
        onSaved(saved);
        void close();
      }}
    />
  );
}

function EditCustomerMemoFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <CloseButton label={t('actions.cancel')} disabled={submitting} />
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {t('actions.save')}
      </Button>
    </>
  );
}

function CloseButton({
  label,
  disabled = false,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled || isClosing}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}
