import { useApiClient, useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { LockKeyhole, Pencil, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { formatInstant, useDocumentResource } from './data.js';
import { DocumentError } from './document-error.js';
import { documentErrorMessage } from './document-error-message.js';
import { DocumentForm } from './document-form.js';
import {
  EDIT_DOCUMENT,
  SHARE_DOCUMENT,
  VIEW_DOCUMENTS,
} from './permissions.js';
import { SharePanel } from './share-panel.js';
import type {
  DocumentDataResponse,
  DocumentInput,
  DocumentsContext,
} from './types.js';

export default function DocumentDetailPage() {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const params = useParams();
  const documentId = params.documentId ?? '';
  const parent = useOutletContext<DocumentsContext>();
  const { session } = useAuthentication();
  const view = useCan(VIEW_DOCUMENTS);
  const resource = useDocumentResource<DocumentDataResponse>(
    `documents/${encodeURIComponent(documentId)}`,
    { enabled: documentId !== '' && view.can },
  );
  const document = resource.data?.data;
  const unrestricted = useCan('unrestricted').can;
  const canEdit = useCan(EDIT_DOCUMENT, { enabled: document != null }).can;
  const canShare = useCan(SHARE_DOCUMENT, { enabled: document != null }).can;
  const owner = document != null && document.ownerId === session?.user.id;
  const canManage = canEdit && (owner || unrestricted);
  const canManageShares = canShare && (owner || unrestricted);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();

  const update = async (input: DocumentInput) => {
    setBusy(true);
    setSaveError(undefined);
    try {
      await api.request<DocumentDataResponse>({
        path: `documents/${encodeURIComponent(documentId)}`,
        method: 'PATCH',
        json: input,
      });
      resource.reload();
      parent.reload();
      setEditing(false);
      toaster.show({ type: 'success', title: t('documents.detail.saved') });
    } catch (value) {
      setSaveError(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton to={{ pathname: '/documents', search: location.search }} />
        {view.isPending || resource.loading ? (
          <div className='flex flex-col gap-4'>
            <Skeleton className='h-9 w-64' />
            <Skeleton className='h-5 w-80' />
            <Skeleton className='h-72 w-full' />
          </div>
        ) : !view.can ? (
          <DocumentError error={{ status: 403 }} />
        ) : resource.error != null ? (
          <DocumentError error={resource.error} retry={resource.reload} />
        ) : document ? (
          <div className='flex flex-col gap-8'>
            <PageHeader
              title={document.title}
              description={t('documents.detail.meta', {
                owner: document.ownerName,
                date: formatInstant(document.updatedAt, i18n.language),
              })}
              actions={
                canManage && !editing ? (
                  <Button
                    variant='outline'
                    onClick={() => {
                      setSaveError(undefined);
                      setEditing(true);
                    }}
                  >
                    <Pencil data-icon='inline-start' />
                    {t('documents.actions.edit')}
                  </Button>
                ) : undefined
              }
            />
            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge tone={document.published ? 'success' : 'warning'}>
                {t(
                  document.published
                    ? 'documents.badges.published'
                    : 'documents.badges.draft',
                )}
              </StatusBadge>
              {document.confidential && (
                <StatusBadge tone='danger'>
                  <LockKeyhole data-icon='inline-start' />
                  {t('documents.badges.confidential')}
                </StatusBadge>
              )}
            </div>

            {editing ? (
              <section className='flex flex-col gap-4 rounded-xl border p-5'>
                <div>
                  <h2 className='font-heading text-base font-medium'>
                    {t('documents.form.editTitle')}
                  </h2>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('documents.form.editDescription')}
                  </p>
                </div>
                <DocumentForm
                  initial={{
                    title: document.title,
                    body: document.body,
                    published: document.published,
                    confidential: document.confidential,
                  }}
                  busy={busy}
                  submitLabel={t('documents.form.save')}
                  error={
                    saveError != null ? (
                      <Alert variant='destructive'>
                        <AlertDescription>
                          {documentErrorMessage(saveError, t)}
                        </AlertDescription>
                      </Alert>
                    ) : undefined
                  }
                  onSubmit={(input) => void update(input)}
                  onCancel={() => {
                    setSaveError(undefined);
                    setEditing(false);
                  }}
                />
              </section>
            ) : (
              <article className='rounded-xl border p-5'>
                {document.confidential && (
                  <Alert className='mb-5'>
                    <AlertDescription>
                      {t('documents.detail.confidentialNotice')}
                    </AlertDescription>
                  </Alert>
                )}
                <p className='whitespace-pre-wrap text-sm leading-7'>
                  {document.body}
                </p>
              </article>
            )}

            {canManageShares && document.confidential && (
              <Alert>
                <AlertDescription>
                  {t('documents.share.confidentialBlocked')}
                </AlertDescription>
              </Alert>
            )}
            {canManageShares && !document.confidential && (
              <>
                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <Share2 className='size-4' />
                  {t(
                    document.published
                      ? 'documents.share.publishedHint'
                      : 'documents.share.ownerHint',
                  )}
                </div>
                <SharePanel
                  documentId={document.id}
                  currentUserId={session?.user.id}
                />
              </>
            )}
          </div>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
