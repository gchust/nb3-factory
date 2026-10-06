import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { MessageSquareText, Search } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import {
  documentExcerpt,
  formatUpdatedAt,
  listDocuments,
  type DocumentRecord,
} from './api.js';

/**
 * The list of documents the signed-in user may read.
 *
 * It is a page in its own right rather than only the assistant's data source: the assistant may be
 * unconfigured, and reading a document must never depend on a model being available.
 */
export default function DocumentsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<
    readonly DocumentRecord[] | undefined
  >(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        setFailed(false);
        listDocuments(api, query.trim() || undefined)
          .then((rows) => {
            if (active) setDocuments(rows);
          })
          .catch(() => {
            if (active) setFailed(true);
          });
      },
      query ? 250 : 0,
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, query]);

  return (
    <PageContainer>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to='/assistant'
          >
            <MessageSquareText />
            {t('navigation.assistant')}
          </Link>
        }
      />

      <div className='relative max-w-md'>
        <Search
          aria-hidden='true'
          className='pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
        />
        <Input
          aria-label={t('documents.searchLabel')}
          className='ps-9'
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('documents.searchPlaceholder')}
          type='search'
          value={query}
        />
      </div>

      {failed ? (
        <Alert role='alert' variant='destructive'>
          <AlertDescription>{t('documents.loadError')}</AlertDescription>
        </Alert>
      ) : null}

      {!failed && documents === undefined ? (
        <div aria-busy='true' className='space-y-3'>
          <Skeleton className='h-20 w-full' />
          <Skeleton className='h-20 w-full' />
        </div>
      ) : null}

      {!failed && documents?.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {query ? t('documents.noResults') : t('documents.empty')}
        </p>
      ) : null}

      {!failed && documents?.length ? (
        <ul className='grid gap-3'>
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                className='block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40'
                to={`/documents/${document.id}`}
              >
                <h2 className='font-medium text-card-foreground'>
                  {document.title}
                </h2>
                <p className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                  {documentExcerpt(document.body)}
                </p>
                <p className='mt-2 text-xs text-muted-foreground'>
                  {t('documents.updatedAt', {
                    date: formatUpdatedAt(
                      document.updatedAt,
                      i18n.language ?? 'en-US',
                    ),
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The outlet of this page; the record page covers it from here. */}
      <Outlet />
    </PageContainer>
  );
}
