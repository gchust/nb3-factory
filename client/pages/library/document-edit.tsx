import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { DocumentForm } from './document-form.js';
import type { LibraryDocument, LibraryEditOutletContext } from './types.js';

const FORM_ID = 'library-document-edit-form';

/**
 * Edit a document. Two routes load it: `/library/edit/:documentId`, which a
 * row's menu opens alone over the list, and `/library/:documentId/edit`,
 * which the drawer's "Edit" stacks on the drawer. Both name the parameter
 * `documentId`.
 */
export default function EditDocumentPage(): ReactElement {
  const { documentId = '' } = useParams();
  return <EditDocument key={documentId} documentId={documentId} />;
}

function EditDocument({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Callbacks of the view behind the dialog through <Outlet context>: the
  // drawer, or the list for a row's menu.
  const { onNotFound } = useOutletContext<LibraryEditOutletContext>();

  // The state disables the buttons; the ref is for beforeClose to read: when
  // close() runs right after a successful save, the new state value has not
  // rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // On open, load the latest data by id before rendering the form, instead of
  // the drawer's or the list's possibly stale data.
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${documentId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: LibraryDocument;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${documentId}:${reloadCount}`;
    api
      .request<{ data: LibraryDocument }>({
        path: `library/documents/${encodeURIComponent(documentId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, document: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record no longer exists: tell the view behind, so the drawer
          // switches to "not found" and the list refreshes.
          if (error instanceof ApiClientError && error.status === 404) {
            onNotFound();
          }
        },
      );
    return () => controller.abort();
  }, [api, documentId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  // A 404 on save also means the record does not exist.
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const document = loading ? undefined : result?.document;

  let body: ReactElement;
  let footer: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseButton label={t('actions.close')} />;
  } else if (notFound || status === 403) {
    // Offer no "Retry", only "Close".
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('library.error.notFound')
            : t('library.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('library.error.requestFailed')}</AlertDescription>
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
  } else if (!document) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['title', 'body'].map((field) => (
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
      <EditDocumentBody
        document={document}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
        }}
      />
    );
    footer = <EditDocumentFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('library.edit.title')}
      description={t('library.form.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the × button, Esc, clicking the backdrop
      // and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called in a component inside RouteDialog, so
// the form and the footer buttons each get their own wrapper component.
function EditDocumentBody({
  document,
  onSubmittingChange,
  onNotFound,
}: {
  readonly document: LibraryDocument;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<LibraryEditOutletContext>();
  return (
    <DocumentForm
      formId={FORM_ID}
      document={document}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        // First let the view behind show the saved record (the drawer at
        // once, the list by refreshing), then close the dialog.
        onSaved(saved);
        void close();
      }}
    />
  );
}

function EditDocumentFooter({
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
