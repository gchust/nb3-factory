import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';

import type { DocumentInput, DocumentResponse } from './api.js';
import { DocumentError } from './errors.js';
import { DocumentForm } from './form.js';
import type { DocumentsOutletContext } from './types.js';

function NewDocumentBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const parent = useOutletContext<DocumentsOutletContext>();
  const { close } = useRouteOverlay();
  const [error, setError] = useState<unknown>();

  const submit = async (input: DocumentInput): Promise<void> => {
    setError(undefined);
    try {
      await api.request<DocumentResponse, DocumentInput>({
        path: 'documents',
        method: 'POST',
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
      submitLabel={t('documents.form.create')}
      busyLabel={t('documents.form.saving')}
      onCancel={() => void close()}
      onSubmittingChange={onSubmittingChange}
      onSubmit={submit}
      error={<DocumentError error={error} />}
    />
  );
}

export default function NewDocumentPage(): ReactElement {
  const { t } = useTranslation();
  const submittingRef = useRef(false);

  return (
    <RouteDialog
      title={t('documents.create.title')}
      description={t('documents.create.description')}
      className='sm:max-w-2xl'
      beforeClose={() => !submittingRef.current}
    >
      <NewDocumentBody
        onSubmittingChange={(submitting) => {
          submittingRef.current = submitting;
        }}
      />
    </RouteDialog>
  );
}
