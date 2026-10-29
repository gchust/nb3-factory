import { useTranslation } from '@nocobase/i18n/client';
import { CalendarIcon, LockIcon, PencilIcon, UserIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import {
  isDenied,
  isNotFound,
  useApiData,
  type DocumentResponse,
} from './api.js';
import type {
  DocumentEditOutletContext,
  DocumentsOutletContext,
} from './types.js';

export default function DocumentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { documentId } = useParams();
  const location = useLocation();
  const parent = useOutletContext<DocumentsOutletContext>();
  const request = useApiData<DocumentResponse>(
    `documents/${encodeURIComponent(documentId ?? '')}`,
  );
  const document = request.data?.data;
  const reloadRequest = request.reload;
  const reload = useCallback(() => {
    reloadRequest();
    parent.reload();
  }, [parent, reloadRequest]);
  const editContext = useMemo<DocumentEditOutletContext | undefined>(
    () => (document ? { document, reload } : undefined),
    [document, reload],
  );

  return (
    <RouteDrawer
      title={document?.title ?? t('documents.detail.title')}
      description={
        document ? (
          <span className='flex flex-wrap items-center gap-2'>
            <Badge variant={document.published ? 'secondary' : 'outline'}>
              {document.published
                ? t('documents.published')
                : t('documents.draft')}
            </Badge>
            {document.confidential ? (
              <Badge variant='destructive'>
                <LockIcon aria-hidden />
                {t('documents.confidential')}
              </Badge>
            ) : null}
          </span>
        ) : undefined
      }
      footer={
        document?.canEdit ? (
          <Button
            render={<Link to={{ pathname: 'edit', search: location.search }} />}
          >
            <PencilIcon aria-hidden />
            {t('documents.edit')}
          </Button>
        ) : undefined
      }
      className='sm:max-w-2xl'
    >
      {request.loading && !document ? (
        <div className='flex justify-center py-12'>
          <Spinner />
        </div>
      ) : request.error || !document ? (
        <div className='flex flex-col gap-2 py-8 text-center'>
          <h2 className='font-heading text-base font-medium'>
            {isNotFound(request.error) || isDenied(request.error)
              ? t('documents.detail.notFoundTitle')
              : t('documents.errors.unknown')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('documents.detail.notFoundDescription')}
          </p>
        </div>
      ) : (
        <article className='flex flex-col gap-6'>
          <dl className='grid gap-3 text-sm sm:grid-cols-2'>
            <div className='flex items-center gap-2 text-muted-foreground'>
              <UserIcon className='size-4' aria-hidden />
              <dt>{t('documents.owner')}</dt>
              <dd className='text-foreground'>
                {document.ownerName || document.ownerId}
              </dd>
            </div>
            <div className='flex items-center gap-2 text-muted-foreground'>
              <CalendarIcon className='size-4' aria-hidden />
              <dt>{t('documents.updatedAt')}</dt>
              <dd className='text-foreground'>
                {new Date(document.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
          <div className='border-t border-border pt-5'>
            <p className='whitespace-pre-wrap text-sm leading-7'>
              {document.content}
            </p>
          </div>
          <Outlet context={editContext} />
        </article>
      )}
    </RouteDrawer>
  );
}
