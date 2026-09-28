/**
 * The edit overlay: a child route of the detail drawer, reached at
 * `/library/:documentId/edit`.
 *
 * It reloads the document itself rather than trusting the drawer's copy, so a
 * direct visit to the URL works and the form never edits stale values. The
 * server's update policy decides whether the write is allowed; a reader who
 * opens this URL gets a 403.
 */
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { fetchDocument, updateDocument } from '../library-api.js';
import { LibraryForm } from '../library-form.js';
import type { DocumentOutletContext } from './index.js';
import type { LibraryDocument, LibraryDocumentInput } from '../types.js';

/** Rendered inside the dialog, so it may read the overlay context. */
function EditDocumentForm({
  document,
}: {
  readonly document: LibraryDocument;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  const api = useApiClient();
  const toaster = useToaster();
  const { reloadDocument } = useOutletContext<DocumentOutletContext>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(input: LibraryDocumentInput): Promise<void> {
    setIsSubmitting(true);
    try {
      await updateDocument(api, document.id, input);
      toaster.show({ type: 'success', title: t('library.edit.success') });
      reloadDocument();
      await close();
    } catch {
      toaster.show({ type: 'error', title: t('library.submit.error') });
      setIsSubmitting(false);
    }
  }

  return (
    <LibraryForm
      initial={{
        title: document.title,
        body: document.body,
        published: document.published,
        confidential: document.confidential,
      }}
      isSubmitting={isSubmitting}
      onCancel={() => {
        void close();
      }}
      onSubmit={(input) => {
        void submit(input);
      }}
    />
  );
}

export default function EditDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId } = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<LibraryDocument | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!documentId) {
      return;
    }
    const controller = new AbortController();
    void fetchDocument(api, documentId, controller.signal)
      .then((record) => {
        setDocument(record);
        setIsLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(reason);
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [api, documentId]);

  const notFound = error instanceof ApiClientError && error.status === 404;

  return (
    <RouteDialog
      description={t('library.edit.description')}
      title={t('library.edit.title')}
    >
      {isLoading ? (
        <Loading className='py-12' />
      ) : notFound ? (
        <Alert>
          <AlertTitle>{t('library.detail.notFound.title')}</AlertTitle>
          <AlertDescription>
            {t('library.detail.notFound.description')}
          </AlertDescription>
        </Alert>
      ) : error || !document ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.error.title')}</AlertTitle>
          <AlertDescription>{t('library.error.description')}</AlertDescription>
        </Alert>
      ) : (
        <EditDocumentForm document={document} />
      )}
    </RouteDialog>
  );
}
