import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDrawer } from '#components/route-drawer';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';

import { getDocument } from './api.js';
import { libraryKeys } from './queries.js';

export default function LibraryDocumentDrawer(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { documentId = '' } = useParams();
  const query = useQuery({
    queryKey: libraryKeys.document(documentId),
    queryFn: ({ signal }) => getDocument(api, documentId, signal),
    enabled: Boolean(documentId),
  });
  const document = query.data;

  return (
    <RouteDrawer
      title={document?.title ?? t('library.detail.title')}
      description={document ? t('library.detail.description') : undefined}
    >
      {query.isPending ? (
        <Loading className='min-h-48' />
      ) : query.isError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.errors.notFound')}</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error ? query.error.message : null}
          </AlertDescription>
        </Alert>
      ) : document ? (
        <article className='flex flex-col gap-6'>
          <div className='flex flex-wrap gap-2'>
            <StatusBadge tone={document.published ? 'success' : 'neutral'}>
              {document.published
                ? t('library.visibility.published')
                : t('library.visibility.draft')}
            </StatusBadge>
            {document.confidential ? (
              <StatusBadge tone='warning'>
                {t('library.visibility.confidential')}
              </StatusBadge>
            ) : null}
          </div>

          <dl className='grid gap-3 text-sm sm:grid-cols-2'>
            <div className='flex flex-col gap-0.5'>
              <dt className='text-muted-foreground'>
                {t('library.detail.owner')}
              </dt>
              <dd>{document.ownerName || '—'}</dd>
            </div>
            <div className='flex flex-col gap-0.5'>
              <dt className='text-muted-foreground'>
                {t('library.detail.updatedAt')}
              </dt>
              <dd>{new Date(document.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>

          <section className='flex flex-col gap-2'>
            <h2 className='text-sm font-medium'>{t('library.detail.body')}</h2>
            <p className='text-sm leading-7 whitespace-pre-wrap'>
              {document.body}
            </p>
          </section>
        </article>
      ) : null}
    </RouteDrawer>
  );
}
