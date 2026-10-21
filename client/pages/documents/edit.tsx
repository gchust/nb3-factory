import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';

import { type DocumentInput, type DocumentResponse } from './api.js';
import { DocumentError } from './errors.js';
import { DocumentForm } from './form.js';
import type { DocumentEditOutletContext } from './types.js';

function EditDocumentBody({
  document,
  onSubmittingChange,
}: {
  readonly document: DocumentEditOutletContext['document'];
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId } = useParams();
  const parent = useOutletContext<DocumentEditOutletContext>();
  const { close } = useRouteOverlay();
  const [error, setError] = useState<unknown>();

  const submit = async (input: DocumentInput): Promise<void> => {
    setError(undefined);
    try {
      await api.request<DocumentResponse, Partial<DocumentInput>>({
        path: `documents/${encodeURIComponent(documentId ?? '')}`,
        method: 'PATCH',
        json: input,
      });
      parent.reload();
      await close();
    } catch (next) {
      setError(next);
    }
  };

  return (
    <DocumentForm
      initial={{
        title: document.title,
        content: document.content,
        published: document.published,
        confidential: document.confidential,
      }}
      submitLabel={t('documents.form.save')}
      busyLabel={t('documents.form.saving')}
      onCancel={() => void close()}
      onSubmittingChange={onSubmittingChange}
      onSubmit={submit}
      error={<DocumentError error={error} />}
    />
  );
}

export default function EditDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const parent = useOutletContext<DocumentEditOutletContext>();
  const submittingRef = useRef(false);

  return (
    <RouteDialog
      title={t('documents.editTitle')}
      description={t('documents.editDescription', {
        title: parent.document.title,
      })}
      className='sm:max-w-2xl'
      beforeClose={() => !submittingRef.current}
    >
      <EditDocumentBody
        document={parent.document}
        onSubmittingChange={(submitting) => {
          submittingRef.current = submitting;
        }}
      />
    </RouteDialog>
  );
}
