import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, FileQuestionIcon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { fetchMemo } from '../memo-api.js';
import { MemoForm } from '../memo-form.js';
import type { CustomerMemo, MemoDetailOutletContext } from '../types.js';

const FORM_ID = 'memo-edit-form';

type EditState =
  | { readonly kind: 'ready'; readonly memo: CustomerMemo }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error'; readonly error: unknown };

/**
 * The edit dialog, reached at `/memos/:memoId/edit` and stacked over the detail drawer.
 *
 * It fetches the latest memo so the form is never populated from stale data, then reports a successful save back to the
 * drawer through `<Outlet context>`.
 */
export default function MemoEditPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { memoId } = useParams();
  const detail = useOutletContext<MemoDetailOutletContext>();
  const [reloadCount, retry] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([memoId, reloadCount]);

  const [result, setResult] = useState<{
    readonly key: string;
    readonly status?: EditState;
  }>({ key: '' });
  const loading = result.key !== requestKey;
  const status = loading ? undefined : result.status;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([memoId, reloadCount]);
    fetchMemo(api, memoId ?? '', controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) {
          setResult({ key, status: { kind: 'ready', memo: loaded } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiClientError && caught.status === 404) {
          setResult({ key, status: { kind: 'notFound' } });
          detail.onNotFound();
        } else {
          setResult({ key, status: { kind: 'error', error: caught } });
        }
      },
    );
    return () => controller.abort();
  }, [api, detail, memoId, reloadCount]);

  return (
    <RouteDialog
      title={t('memos.edit.title', {
        name: status?.kind === 'ready' ? status.memo.name : '',
      })}
      description={t('memos.edit.description')}
      footer={
        <EditFooter
          submitting={submitting}
          disabled={loading || status?.kind !== 'ready'}
        />
      }
    >
      <EditBody
        loading={loading}
        status={status}
        onRetry={retry}
        onSubmittingChange={setSubmitting}
        onSaved={(saved) => {
          detail.onSaved(saved);
        }}
        onRemoteDeleted={() => {
          detail.onNotFound();
        }}
      />
    </RouteDialog>
  );
}

interface EditBodyProps {
  readonly loading: boolean;
  readonly status: EditState | undefined;
  readonly onRetry: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSaved: (memo: CustomerMemo) => void;
  readonly onRemoteDeleted: () => void;
}

function EditBody({
  loading,
  status,
  onRetry,
  onSubmittingChange,
  onSaved,
  onRemoteDeleted,
}: EditBodyProps): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();

  if (loading) {
    return (
      <div
        className='flex flex-col gap-4'
        role='status'
        aria-label={t('status.loading')}
      >
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  }

  if (status?.kind === 'notFound') {
    return (
      <Alert>
        <FileQuestionIcon />
        <AlertTitle>{t('memos.detail.notFound.title')}</AlertTitle>
        <AlertDescription>
          {t('memos.detail.notFound.description')}
        </AlertDescription>
      </Alert>
    );
  }

  if (status?.kind !== 'ready') {
    const forbidden =
      status?.kind === 'error' &&
      status.error instanceof ApiClientError &&
      status.error.status === 403;
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('memos.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('memos.error.forbidden')
            : t('memos.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <Button variant='outline' size='sm' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        )}
      </Alert>
    );
  }

  return (
    <MemoForm
      memo={status.memo}
      formId={FORM_ID}
      onSubmitted={(saved) => {
        onSaved(saved);
        void close();
      }}
      onSubmittingChange={onSubmittingChange}
      onNotFound={() => {
        onRemoteDeleted();
        void close();
      }}
    />
  );
}

function EditFooter({
  submitting,
  disabled,
}: {
  readonly submitting: boolean;
  readonly disabled: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={disabled || submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
