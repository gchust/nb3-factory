import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription } from '#components/ui/alert';

import { getDocument } from '../api.js';
import { DocumentForm } from '../document-form.js';
import { libraryKeys } from '../queries.js';

export default function EditLibraryDocumentDialog(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId = '' } = useParams();
  const query = useQuery({
    queryKey: libraryKeys.document(documentId),
    queryFn: ({ signal }) => getDocument(api, documentId, signal),
    enabled: Boolean(documentId),
  });

  if (query.isPending) {
    return (
      <RouteDialog title={t('library.form.editTitle')}>
        <Loading className='min-h-48' />
      </RouteDialog>
    );
  }

  if (query.isError || !query.data) {
    return (
      <RouteDialog title={t('library.form.editTitle')}>
        <Alert variant='destructive'>
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : t('library.errors.notFound')}
          </AlertDescription>
        </Alert>
      </RouteDialog>
    );
  }

  return <DocumentForm document={query.data} closeTo='/library/manage' />;
}
