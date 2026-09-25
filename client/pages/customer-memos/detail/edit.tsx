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

/** Route `/customer-memos/:memoId/edit`: edit a memo, stacked on the detail drawer. */
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
  // Callbacks the detail drawer passes down through <Outlet context>.
  const { onNotFound } = useOutletContext<CustomerMemoDetailOutletContext>();

  // The state disables the buttons; the ref is for beforeClose to read: when close() runs right after a
  // successful save, the new state value has not rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // On open, load the latest data by id before rendering the form, instead of using the drawer's possibly stale data.
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
          // The record no longer exists: tell the drawer to switch to "not found" and refresh the list.
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
  // A 404 on save also means the record does not exist.
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const memo = loading ? undefined : result?.memo;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
    // Offer no "Retry", only "Close".
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('customerMemos.error.notFound')
            : t('customerMemos.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('customerMemos.error.requestFailed')}
        </AlertDescription>
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
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['customerName', 'remark'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
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
      title={t('customerMemos.edit.title')}
      description={t('customerMemos.form.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the × button, Esc, clicking the backdrop and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called in a component inside RouteDialog, so the form and the footer
// buttons each get their own wrapper component.
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
      formId={FORM_ID}
      memo={memo}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        // First update the drawer with the record the endpoint returned and refresh the list, then close the dialog.
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
      {/* The button is outside the <form> and linked through the form attribute. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
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
