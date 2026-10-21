import { useTranslation } from '@nocobase/i18n/client';
import { BookOpenIcon, FileTextIcon, LockIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Spinner } from '#components/ui/spinner';

import { isDenied, useApiData, type DocumentListResponse } from './api.js';
import type { DocumentsOutletContext } from './types.js';

function DocumentCard({
  document,
}: {
  readonly document: DocumentListResponse['data'][number];
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Link
      to={{ pathname: String(document.id), search: location.search }}
      className='group block rounded-xl border border-border bg-card text-card-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <Card className='border-0 shadow-none'>
        <CardHeader>
          <div className='flex flex-wrap items-center gap-2'>
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
          </div>
          <CardTitle className='group-hover:text-primary'>
            {document.title}
          </CardTitle>
          <CardDescription className='line-clamp-2'>
            {document.content}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'>
          <span>
            {t('documents.owner')}: {document.ownerName || document.ownerId}
          </span>
          <span>{new Date(document.updatedAt).toLocaleDateString()}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const request = useApiData<DocumentListResponse>('documents');
  const outletContext = useMemo<DocumentsOutletContext>(
    () => ({ reload: request.reload }),
    [request.reload],
  );
  const documents = request.data?.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          request.data?.meta.canCreate ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon aria-hidden />
              {t('documents.new')}
            </Button>
          ) : undefined
        }
      />

      {request.loading && !request.data ? (
        <div className='flex justify-center py-16'>
          <Spinner />
        </div>
      ) : request.error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>
              {isDenied(request.error)
                ? t('documents.errors.accessDenied')
                : t('documents.errors.unknown')}
            </EmptyTitle>
            <EmptyDescription>
              {t('documents.errors.accessDeniedDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : documents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t('documents.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('documents.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className='grid gap-3 lg:grid-cols-2'>
          {documents.map((document) => (
            <li key={document.id}>
              <DocumentCard document={document} />
            </li>
          ))}
        </ul>
      )}

      <div className='mt-6 flex items-center gap-2 text-sm text-muted-foreground'>
        <BookOpenIcon className='size-4' aria-hidden />
        {t('documents.readOnlyHint')}
      </div>

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
