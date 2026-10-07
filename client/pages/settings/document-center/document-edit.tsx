import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  documentCenterErrorKey,
  getDocument,
  type DocumentDetail,
} from '@/lib/document-center';

import { DocumentForm } from './document-form.js';

/** The `:documentId/edit` child route: edit a document in a dialog over the list. */
export default function DocumentEditPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId } = useParams();
  const id = Number(documentId);
  const [result, setResult] = useState<{
    readonly key: number;
    readonly detail?: DocumentDetail;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const controller = new AbortController();
    getDocument(api, id, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setResult({ key: id, detail });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key: id, error });
      },
    );
    return () => controller.abort();
  }, [api, id]);

  const loading = result?.key !== id;
  const detail = loading ? undefined : result?.detail;
  const error = loading ? undefined : result?.error;

  return (
    <RouteDialog
      title={detail?.title ?? t('documentsAdmin.form.editTitle')}
      description={t('documentsAdmin.form.editDescription')}
    >
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : detail ? (
        <DocumentForm document={detail} />
      ) : (
        <div
          className='space-y-3'
          role='status'
          aria-label={t('status.loading')}
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
      )}
    </RouteDialog>
  );
}
