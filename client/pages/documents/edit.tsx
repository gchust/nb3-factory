import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';
import { DocumentsClient, type DocumentItem } from '#lib/documents-client';

import { DocumentForm } from './document-form.js';
import { parseDocumentId, type DocumentEditContext } from './types.js';

const FORM_ID = 'document-edit-form';

/**
 * Edit a document. Two routes load it: `/documents/edit/:documentId`, which a row's menu opens alone over the list,
 * and `/documents/:documentId/edit`, which the drawer's "Edit" stacks on the drawer. Both name the parameter
 * `documentId`, and both read the same context from the view behind.
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
  const { onNotFound } = useOutletContext<DocumentEditContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const dirtyRef = useRef(false);
  const handleDirtyChange = useCallback((dirty: boolean): void => {
    dirtyRef.current = dirty;
  }, []);
  const [discardPrompt, setDiscardPrompt] = useState<{
    readonly answer: (discard: boolean) => void;
  }>();

  function answerDiscard(discard: boolean): void {
    discardPrompt?.answer(discard);
    setDiscardPrompt(undefined);
  }

  // Load the latest data by id on open, rather than passing in the possibly stale record from the drawer or the list.
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${documentId}:${reloadCount}`;
  const id = parseDocumentId(documentId);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: DocumentItem;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (id === undefined) return;
    const controller = new AbortController();
    const key = `${documentId}:${reloadCount}`;
    new DocumentsClient(api).get(id, controller.signal).then(
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
  }, [api, documentId, id, reloadCount, onNotFound]);

  const loading = id !== undefined && result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = id === undefined || goneOnSave || status === 404;
  const document = loading ? undefined : result?.document;

  let body: ReactElement;
  let footer: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseButton label={t('actions.close')} />;
  } else if (notFound || status === 403) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('documents.error.notFound')
            : t('documents.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {t('documents.error.requestFailed')}
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
  } else if (!document) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['title', 'body', 'published', 'confidential'].map((field) => (
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
        onSubmittingChange={(value) => {
          submittingRef.current = value;
          setSubmitting(value);
        }}
        onDirtyChange={handleDirtyChange}
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
      title={t('documents.edit.title')}
      description={t('documents.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => {
        if (submittingRef.current) return false;
        if (!dirtyRef.current) return true;
        return new Promise<boolean>((resolve) => {
          setDiscardPrompt({ answer: resolve });
        });
      }}
      footer={footer}
    >
      {body}
      <AlertDialog
        open={discardPrompt !== undefined}
        onOpenChange={(open) => {
          if (!open) answerDiscard(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.discard.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.discard.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('documents.discard.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => answerDiscard(true)}
            >
              {t('documents.discard.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteDialog>
  );
}

function EditDocumentBody({
  document,
  onSubmittingChange,
  onDirtyChange,
  onNotFound,
}: {
  readonly document: DocumentItem;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<DocumentEditContext>();
  return (
    <DocumentForm
      formId={FORM_ID}
      document={document}
      onSubmittingChange={onSubmittingChange}
      onDirtyChange={onDirtyChange}
      onNotFound={onNotFound}
      onSubmitted={(saved) => {
        // Let the view behind show the saved record first (the drawer at once, the list by refreshing), then close.
        onDirtyChange(false);
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
