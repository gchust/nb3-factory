import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { DocumentForm } from '../document-form.js';
import type { Document, DocumentEditOutletContext } from '../types.js';

const FORM_ID = 'document-edit-form';

/** Route `/documents/:documentId/edit`: the edit dialog stacked on the drawer. */
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
  const { onSaved, onNotFound } = useOutletContext<DocumentEditOutletContext>();

  const [document, setDocument] = useState<Document>();
  const [error, setError] = useState<unknown>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: Document }>({
        path: `documents/${encodeURIComponent(documentId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setDocument(data);
        },
        (caught: unknown) => {
          if (controller.signal.aborted) return;
          setError(caught);
          if (caught instanceof ApiClientError && caught.status === 404) {
            // The page behind may still show it, so refresh that page.
            onNotFound();
          }
        },
      );
    return () => controller.abort();
  }, [api, documentId, onNotFound]);

  const status = error instanceof ApiClientError ? error.status : undefined;

  let body: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 403 || status === 404
            ? t('library.error.notFound')
            : t('library.error.requestFailed')}
        </AlertDescription>
      </Alert>
    );
  } else if (!document) {
    body = (
      <div className='flex flex-col gap-3'>
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-5 w-24' />
      </div>
    );
  } else {
    body = (
      <DocumentForm
        document={document}
        formId={FORM_ID}
        onSubmittingChange={handleSubmittingChange}
        onSubmitted={onSaved}
        onNotFound={onNotFound}
      />
    );
  }

  return (
    <RouteDialog
      title={t('library.edit.title')}
      description={t('library.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<EditDocumentFooter submitting={submitting} ready={!!document} />}
    >
      {body}
    </RouteDialog>
  );
}

function EditDocumentFooter({
  submitting,
  ready,
}: {
  readonly submitting: boolean;
  readonly ready: boolean;
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
      <Button type='submit' form={FORM_ID} disabled={submitting || !ready}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}
