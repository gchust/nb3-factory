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

import { LibraryDocumentForm } from './library-document-form.js';
import { fetchLibraryDocument } from './library-api.js';
import type { LibraryDocument, LibraryEditOutletContext } from './types.js';

const FORM_ID = 'library-document-edit';

/**
 * Edit a document. Two routes load it: `/library/edit/:documentId`, which a
 * row's menu opens alone over the list, and `/library/:documentId/edit`, which
 * the drawer's "Edit" stacks on the drawer. Both name the parameter
 * `documentId`.
 */
export default function EditLibraryDocumentPage(): ReactElement {
  const { documentId = '' } = useParams();
  return <EditLibraryDocument key={documentId} documentId={documentId} />;
}

function EditLibraryDocument({
  documentId,
}: {
  readonly documentId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { onNotFound } = useOutletContext<LibraryEditOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

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
    fetchLibraryDocument(api, documentId, controller.signal).then(
      (document) => {
        if (!controller.signal.aborted) setResult({ key, document });
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
  }, [api, documentId, reloadCount, onNotFound]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const document = loading ? undefined : result?.document;

  let body: ReactElement;
  let footer: ReactElement;
  if (notFound || status === 403) {
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
            onClick={() => setReloadCount((count) => count + 1)}
            size='sm'
            variant='outline'
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
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
        role='status'
      >
        {['title', 'content', 'flags'].map((field) => (
          <div className='flex flex-col gap-2' key={field}>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
  } else {
    body = (
      <EditBody
        document={document}
        onNotFound={() => {
          setGoneOnSave(true);
          onNotFound();
        }}
        onSubmittingChange={handleSubmittingChange}
      />
    );
    footer = <EditFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      className='sm:max-w-lg'
      description={t('library.edit.description')}
      footer={footer}
      title={t('library.edit.title')}
    >
      {body}
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called inside the overlay, so the form and the footer buttons each get a wrapper.
function EditBody({
  document,
  onNotFound,
  onSubmittingChange,
}: {
  readonly document: LibraryDocument;
  readonly onNotFound: () => void;
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<LibraryEditOutletContext>();
  return (
    <LibraryDocumentForm
      document={document}
      formId={FORM_ID}
      onNotFound={onNotFound}
      onSubmitted={() => {
        onSaved();
        void close();
      }}
      onSubmittingChange={onSubmittingChange}
    />
  );
}

function EditFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={submitting || isClosing}
        onClick={() => void close()}
        variant='outline'
      >
        {t('actions.cancel')}
      </Button>
      <Button disabled={submitting} form={FORM_ID} type='submit'>
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function CloseButton({ label }: { readonly label: string }): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button disabled={isClosing} onClick={() => void close()} variant='outline'>
      {label}
    </Button>
  );
}
