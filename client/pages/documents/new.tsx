import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import { DocumentError } from './document-error.js';
import { documentErrorMessage } from './document-error-message.js';
import { DocumentForm } from './document-form.js';
import { CREATE_DOCUMENT } from './permissions.js';
import type {
  DocumentDataResponse,
  DocumentInput,
  DocumentsContext,
} from './types.js';

export default function NewDocumentPage() {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();
  const parent = useOutletContext<DocumentsContext>();
  const permission = useCan(CREATE_DOCUMENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async (input: DocumentInput) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.request<DocumentDataResponse>({
        path: 'documents',
        method: 'POST',
        json: input,
      });
      parent.reload();
      toaster.show({ type: 'success', title: t('documents.form.created') });
      void navigate(
        { pathname: `/documents/${result.data.id}`, search: location.search },
        { replace: true },
      );
    } catch (value) {
      setError(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={{ pathname: '/documents', search: location.search }} />
        <PageHeader
          title={t('documents.form.newTitle')}
          description={t('documents.form.newDescription')}
        />
        {permission.isPending ? (
          <div className='flex flex-col gap-3'>
            <Skeleton className='h-9 w-full' />
            <Skeleton className='h-64 w-full' />
          </div>
        ) : !permission.can ? (
          <DocumentError error={{ status: 403 }} />
        ) : (
          <DocumentForm
            busy={busy}
            submitLabel={t('documents.form.create')}
            error={
              error != null ? (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {documentErrorMessage(error, t)}
                  </AlertDescription>
                </Alert>
              ) : undefined
            }
            onSubmit={(input) => void submit(input)}
            onCancel={() =>
              void navigate({
                pathname: '/documents',
                search: location.search,
              })
            }
          />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}
