import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';

import { listDocuments } from './api.js';
import { DocumentTable } from './document-table.js';
import { libraryKeys } from './queries.js';

const PAGE_SIZE = 20;

export default function LibraryPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: libraryKeys.documents(search, page, PAGE_SIZE),
    queryFn: ({ signal }) =>
      listDocuments(api, {
        q: search,
        page,
        pageSize: PAGE_SIZE,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('library.title')}
        description={t('library.description')}
      />

      <div className='relative w-full max-w-sm'>
        <SearchIcon
          className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
          aria-hidden
        />
        <Input
          aria-label={t('library.searchLabel')}
          className='pl-9'
          placeholder={t('library.searchPlaceholder')}
          type='search'
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {query.isPending ? (
        <Loading className='min-h-60' />
      ) : query.isError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('library.errors.load')}</AlertTitle>
          <AlertDescription>
            <Button
              size='sm'
              variant='outline'
              onClick={() => void query.refetch()}
            >
              {t('library.actions.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <DocumentTable
            documents={query.data?.documents ?? []}
            emptyTitle={t('library.empty.title')}
            emptyDescription={t('library.empty.description')}
          />
          {total > PAGE_SIZE ? (
            <div className='flex items-center justify-between gap-4'>
              <p className='text-sm text-muted-foreground'>
                {`${total} · ${page}/${pageCount}`}
              </p>
              <div className='flex gap-2'>
                <Button
                  disabled={page <= 1 || query.isFetching}
                  size='sm'
                  variant='outline'
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('library.actions.previous')}
                </Button>
                <Button
                  disabled={page >= pageCount || query.isFetching}
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  {t('library.actions.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Outlet />
    </PageContainer>
  );
}
