import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  BookOpenText,
  FileText,
  LockKeyhole,
  PlusIcon,
  Share2,
} from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { formatInstant, useDocumentResource } from './data.js';
import { DocumentError } from './document-error.js';
import { CREATE_DOCUMENT, VIEW_DOCUMENTS } from './permissions.js';
import type {
  DocumentItem,
  DocumentListResponse,
  DocumentsContext,
} from './types.js';

function excerpt(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

function DocumentCard({
  document,
  currentUserId,
  language,
}: {
  readonly document: DocumentItem;
  readonly currentUserId: string | undefined;
  readonly language: string;
}) {
  const { t } = useTranslation();
  const shared =
    currentUserId !== undefined &&
    document.ownerId !== currentUserId &&
    !document.published;
  return (
    <Link
      to={`/documents/${document.id}`}
      className='group/card block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <Card className='h-full transition-shadow group-hover/card:shadow-md'>
        <CardHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <StatusBadge
              tone={document.published ? 'success' : 'warning'}
              size='sm'
            >
              {t(
                document.published
                  ? 'documents.badges.published'
                  : 'documents.badges.draft',
              )}
            </StatusBadge>
            {document.confidential && (
              <StatusBadge tone='danger' size='sm'>
                <LockKeyhole data-icon='inline-start' />
                {t('documents.badges.confidential')}
              </StatusBadge>
            )}
            {shared && (
              <StatusBadge tone='info' size='sm'>
                <Share2 data-icon='inline-start' />
                {t('documents.badges.shared')}
              </StatusBadge>
            )}
          </div>
          <CardTitle className='line-clamp-2 text-lg'>
            {document.title}
          </CardTitle>
          <CardDescription className='line-clamp-3 leading-6'>
            {excerpt(document.body)}
          </CardDescription>
        </CardHeader>
        <div className='mt-auto flex flex-wrap items-center justify-between gap-2 px-(--card-spacing) text-xs text-muted-foreground'>
          <span className='inline-flex items-center gap-1.5'>
            <FileText className='size-3.5' />
            {document.ownerName}
          </span>
          <span>{formatInstant(document.updatedAt, language)}</span>
        </div>
      </Card>
    </Link>
  );
}

export default function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { session } = useAuthentication();
  const view = useCan(VIEW_DOCUMENTS);
  const canCreate = useCan(CREATE_DOCUMENT).can;
  const documents = useDocumentResource<DocumentListResponse>('documents', {
    enabled: view.can,
  });
  const context: DocumentsContext = { reload: documents.reload };

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('documents.page.title')}
          description={t('documents.page.description')}
          actions={
            canCreate ? (
              <Button
                nativeButton={false}
                render={
                  <Link
                    to={{ pathname: '/documents/new', search: location.search }}
                  />
                }
              >
                <PlusIcon data-icon='inline-start' />
                {t('documents.actions.new')}
              </Button>
            ) : undefined
          }
        />
        {view.isPending ? (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className='h-52 rounded-xl' />
            ))}
          </div>
        ) : !view.can ? (
          <DocumentError error={{ status: 403 }} />
        ) : documents.error != null ? (
          <DocumentError error={documents.error} retry={documents.reload} />
        ) : documents.loading && !documents.data ? (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className='h-52 rounded-xl' />
            ))}
          </div>
        ) : documents.data?.data.length ? (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {documents.data.data.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                currentUserId={session?.user.id}
                language={i18n.language}
              />
            ))}
          </div>
        ) : (
          <Empty className='border'>
            <EmptyHeader>
              <BookOpenText className='size-6 text-muted-foreground' />
              <EmptyTitle>{t('documents.list.emptyTitle')}</EmptyTitle>
              <EmptyDescription>
                {canCreate
                  ? t('documents.list.emptyOwner')
                  : t('documents.list.emptyReader')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </PageContainer>
      <Outlet context={context} />
    </>
  );
}
