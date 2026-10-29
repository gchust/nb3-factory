import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { BookOpenIcon, LockIcon, PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

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
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';

import { DocumentFormDialog } from './document-form-dialog.js';
import type { LibraryDocument, LibraryListResponse } from './types.js';
import { useLibraryData } from './use-library-data.js';

function excerpt(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

export default function LibraryPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const request = useLibraryData<LibraryListResponse<LibraryDocument>>(
    'library/documents?page=1&pageSize=100',
  );
  const canCreate = useCan({
    resource: { type: 'composite', id: 'library.documents' },
    action: 'create',
  }).can;
  const [creating, setCreating] = useState(false);
  const documents = request.data?.data ?? [];
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('library.title')}
          description={t('library.description')}
          actions={
            canCreate ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon />
                {t('library.actions.create')}
              </Button>
            ) : undefined
          }
        />
        {request.error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {t('library.errors.loadFailed')}
          </div>
        ) : request.loading && !request.data ? (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className='h-48 w-full rounded-xl' />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <Empty className='min-h-64 border border-dashed'>
            <EmptyMedia variant='icon'>
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>{t('library.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('library.empty.description')}
            </EmptyDescription>
            {canCreate ? (
              <EmptyContent>
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon />
                  {t('library.actions.create')}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <>
            <p className='text-sm text-muted-foreground'>
              {t('library.count', { count: request.data?.meta.total ?? 0 })}
            </p>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {documents.map((document) => (
                <Link
                  key={document.id}
                  to={encodeURIComponent(document.id)}
                  className='rounded-xl focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <Card className='h-full transition-colors hover:bg-muted/30'>
                    <CardHeader>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge
                          variant={document.published ? 'secondary' : 'outline'}
                        >
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
                      </div>
                      <CardTitle className='line-clamp-2'>
                        {document.title}
                      </CardTitle>
                      <CardDescription>
                        {t('library.byOwner', { name: document.ownerName })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='flex flex-col gap-3'>
                      <p className='line-clamp-4 min-h-16 text-sm leading-6 text-muted-foreground'>
                        {document.body.trim()
                          ? excerpt(document.body)
                          : t('library.noBody')}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {t('library.updatedAt', {
                          date: formatDate(document.updatedAt),
                        })}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </PageContainer>
      <Outlet context={{ reload: request.reload }} />
      <DocumentFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => request.reload()}
      />
    </>
  );
}
