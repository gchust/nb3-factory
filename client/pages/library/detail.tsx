import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LockIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { ConfirmAction } from '../settings/shared.js';

import { DocumentFormDialog } from './document-form-dialog.js';
import type { LibraryDocument } from './types.js';
import { useLibraryData } from './use-library-data.js';

export default function LibraryDocumentPage(): ReactElement {
  const { documentId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const request = useLibraryData<{ data: LibraryDocument }>(
    `library/documents/${encodeURIComponent(documentId)}`,
  );
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const document = request.data?.data;

  const remove = async () => {
    if (!document || deleting) return;
    setDeleting(true);
    try {
      await api.request({
        path: `library/documents/${encodeURIComponent(document.id)}`,
        method: 'DELETE',
      });
      setConfirming(false);
      toaster.show({ type: 'success', title: t('library.deleted') });
      void navigate('/library', { replace: true });
    } catch {
      toaster.show({ type: 'error', title: t('library.errors.deleteFailed') });
    } finally {
      setDeleting(false);
    }
  };

  const missing =
    request.error instanceof ApiClientError &&
    [403, 404].includes(request.error.status);

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to='/library'>{t('library.actions.back')}</BackButton>
        {request.loading && !request.data ? (
          <div className='space-y-4'>
            <Skeleton className='h-10 w-2/3' />
            <Skeleton className='h-64 w-full' />
          </div>
        ) : missing || !document ? (
          <div className='rounded-xl border border-dashed p-8 text-center'>
            <h1 className='font-heading text-xl font-semibold'>
              {t('library.missing.title')}
            </h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              {t('library.missing.description')}
            </p>
          </div>
        ) : (
          <>
            <PageHeader
              title={document.title}
              description={t('library.byOwner', { name: document.ownerName })}
              actions={
                document.canEdit || document.canDelete ? (
                  <div className='flex items-center gap-2'>
                    {document.canEdit ? (
                      <Button
                        variant='outline'
                        onClick={() => setEditing(true)}
                      >
                        <PencilIcon />
                        {t('library.actions.edit')}
                      </Button>
                    ) : null}
                    {document.canDelete ? (
                      <Button
                        variant='destructive'
                        onClick={() => setConfirming(true)}
                      >
                        <Trash2Icon />
                        {t('library.actions.delete')}
                      </Button>
                    ) : null}
                  </div>
                ) : undefined
              }
            />
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={document.published ? 'secondary' : 'outline'}>
                {document.published
                  ? t('library.status.published')
                  : t('library.status.draft')}
              </Badge>
              {document.confidential ? (
                <Badge variant='destructive'>
                  <LockIcon />
                  {t('library.status.confidential')}
                </Badge>
              ) : null}
              <span className='text-xs text-muted-foreground'>
                {t('library.updatedAt', {
                  date: new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  }).format(new Date(document.updatedAt)),
                })}
              </span>
            </div>
            <article className='max-w-3xl whitespace-pre-wrap rounded-xl border bg-card p-6 text-[15px] leading-7'>
              {document.body.trim() ? (
                document.body
              ) : (
                <span className='text-muted-foreground'>
                  {t('library.noBody')}
                </span>
              )}
            </article>
          </>
        )}
      </PageContainer>
      {document ? (
        <DocumentFormDialog
          open={editing}
          document={document}
          onOpenChange={setEditing}
          onSaved={() => request.reload()}
        />
      ) : null}
      <ConfirmAction
        open={confirming}
        title={t('library.delete.title')}
        description={t('library.delete.description', {
          title: document?.title ?? '',
        })}
        confirmLabel={t('library.actions.delete')}
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      />
    </RouteChildPage>
  );
}
