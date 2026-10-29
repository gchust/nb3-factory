import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { DocumentForm } from './document-form.js';
import { deleteDocument, fetchDocument } from './document-api.js';
import { SharePanel } from './share-panel.js';
import type { LibraryDocument } from './types.js';

const FORM_ID = 'document-edit-form';

/** One document: read it, edit it when you may, and (as an administrator) share a single draft. */
export default function DocumentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const { documentId = '' } = useParams<{ documentId: string }>();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly document?: LibraryDocument;
    readonly notFound?: boolean;
    readonly failed?: boolean;
  }>();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    const key = String(reloadCount);
    fetchDocument(api, documentId, controller.signal).then(
      (document) => {
        if (!controller.signal.aborted) setResult({ key, document });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const notFound =
          error instanceof ApiClientError && error.status === 404;
        setResult({ key, notFound, failed: !notFound });
      },
    );
    return () => controller.abort();
  }, [api, documentId, reloadCount]);

  const missingId = documentId.length === 0;
  const loading = !missingId && result?.key !== String(reloadCount);
  const document = loading ? undefined : result?.document;
  const notFound = missingId || (!loading && (result?.notFound ?? false));
  const failed = !loading && (result?.failed ?? false);

  if (notFound) {
    return (
      <PageContainer className='mx-auto max-w-3xl'>
        <BackButton>{t('documents.back')}</BackButton>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('documents.notFound.title')}</EmptyTitle>
            <EmptyDescription>
              {t('documents.notFound.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PageContainer>
    );
  }

  if (failed) {
    return (
      <PageContainer className='mx-auto max-w-3xl'>
        <BackButton>{t('documents.back')}</BackButton>
        <PageHeader title={t('documents.title')} />
        <div className='flex items-center gap-3'>
          <p className='text-sm text-muted-foreground'>
            {t('documents.error.load')}
          </p>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('documents.error.request')}
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (!document) {
    return (
      <PageContainer className='mx-auto max-w-3xl'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-48 w-full' />
      </PageContainer>
    );
  }

  const { capabilities } = document;
  const canDelete = capabilities.canDelete;

  if (editing) {
    return (
      <PageContainer className='mx-auto max-w-2xl'>
        <BackButton to='/documents'>{t('documents.back')}</BackButton>
        <PageHeader title={t('documents.editTitle')} />
        <DocumentForm
          document={document}
          formId={FORM_ID}
          onSubmittingChange={setSubmitting}
          onSubmitted={() => {
            setEditing(false);
            reload();
          }}
          onNotFound={() => {
            setEditing(false);
            reload();
          }}
        />
        <div className='flex flex-wrap justify-end gap-2'>
          <Button
            variant='outline'
            disabled={submitting}
            onClick={() => setEditing(false)}
          >
            {t('documents.cancel')}
          </Button>
          <Button type='submit' form={FORM_ID} disabled={submitting}>
            {submitting ? <Spinner data-icon='inline-start' /> : null}
            {submitting ? t('documents.saving') : t('documents.save')}
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className='mx-auto max-w-3xl'>
      <BackButton>{t('documents.back')}</BackButton>
      <PageHeader
        title={document.title}
        description={
          <span className='flex flex-wrap items-center gap-2'>
            <StatusBadge tone={document.published ? 'info' : 'neutral'}>
              {document.published
                ? t('documents.published')
                : t('documents.draft')}
            </StatusBadge>
            {document.confidential ? (
              <StatusBadge tone='warning'>
                {t('documents.confidential')}
              </StatusBadge>
            ) : null}
          </span>
        }
        actions={
          <>
            {capabilities.canEdit ? (
              <Button variant='outline' onClick={() => setEditing(true)}>
                <PencilIcon data-icon='inline-start' />
                {t('documents.edit')}
              </Button>
            ) : null}
            {canDelete ? (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <Button
                  variant='destructive'
                  disabled={deleting}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon data-icon='inline-start' />
                  {t('documents.delete')}
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('documents.deleteTitle')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('documents.deleteDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('documents.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant='destructive'
                      disabled={deleting}
                      onClick={() => {
                        setDeleting(true);
                        deleteDocument(api, document.id).then(
                          () => {
                            setDeleteOpen(false);
                            void navigate('/documents');
                          },
                          () => {
                            setDeleting(false);
                            toaster.show({
                              type: 'error',
                              title: t('documents.error.request'),
                            });
                          },
                        );
                      }}
                    >
                      {deleting ? <Spinner data-icon='inline-start' /> : null}
                      {deleting
                        ? t('documents.deleting')
                        : t('documents.delete')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        }
      />

      {!capabilities.canEdit ? (
        <p className='rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground'>
          {t('documents.readOnly')}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('documents.field.body')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <DocumentBody document={document} />
        </CardContent>
      </Card>

      {capabilities.canManageShares ? (
        <SharePanel
          documentId={document.id}
          confidential={document.confidential}
          onChanged={reload}
        />
      ) : null}
    </PageContainer>
  );
}

function DocumentBody({
  document,
}: {
  readonly document: LibraryDocument;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const updatedAt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(document.updatedAt));
  return (
    <>
      <p className='whitespace-pre-wrap text-sm leading-6'>
        {document.body ?? '—'}
      </p>
      <p className='text-xs text-muted-foreground'>
        {t('documents.owner')}：{document.ownerName ?? '—'} ·{' '}
        {t('documents.updatedAt')}：{updatedAt}
      </p>
    </>
  );
}
