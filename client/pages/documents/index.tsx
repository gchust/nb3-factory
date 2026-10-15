import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, FileTextIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { fetchDocuments } from './document-api.js';
import type { DocumentList, LibraryDocument } from './types.js';

/** The library: every document the signed-in user may read, with the ones they may create at the top. */
export default function DocumentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly list?: DocumentList;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    fetchDocuments(api, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setResult({ key, list });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== String(reloadCount);
  const error = loading ? undefined : result?.error;
  const list = result?.list;
  const canCreate = list?.meta.canCreate ?? false;

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={
          canCreate ? (
            <Button render={<Link to='/documents/new' />}>
              <PlusIcon data-icon='inline-start' />
              {t('documents.create')}
            </Button>
          ) : null
        }
      />
      <p className='text-xs text-muted-foreground'>{t('documents.demoHint')}</p>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('documents.error.load')}</AlertTitle>
          <AlertDescription>
            {error instanceof ApiClientError && error.status === 401
              ? t('documents.error.forbidden')
              : t('documents.error.request')}
          </AlertDescription>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('documents.error.request')}
          </Button>
        </Alert>
      ) : loading && !list ? (
        <div className='grid gap-4 sm:grid-cols-2'>
          <Skeleton className='h-36 w-full' />
          <Skeleton className='h-36 w-full' />
        </div>
      ) : !list || list.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t('documents.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('documents.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? (
            <EmptyContent>
              <Button render={<Link to='/documents/new' />}>
                <PlusIcon data-icon='inline-start' />
                {t('documents.create')}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ul className='grid gap-4 sm:grid-cols-2'>
          {list.data.map((document) => (
            <li key={document.id} className='flex'>
              <DocumentCard document={document} />
            </li>
          ))}
        </ul>
      )}
      {loading && list ? <Spinner className='mx-auto' /> : null}
    </PageContainer>
  );
}

function DocumentCard({
  document,
}: {
  readonly document: LibraryDocument;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const updatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(document.updatedAt)),
    [locale, document.updatedAt],
  );

  return (
    <Link
      to={`/documents/${encodeURIComponent(document.id)}`}
      className='group flex w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <Card className='w-full transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-md motion-reduce:transition-none motion-reduce:group-hover:translate-y-0'>
        <CardHeader>
          <CardTitle className='truncate'>{document.title}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <div className='flex flex-wrap gap-2'>
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
          </div>
          <p className='text-sm text-muted-foreground'>
            {t('documents.owner')}：{document.ownerName ?? '—'}
          </p>
          <p className='text-xs text-muted-foreground'>
            {t('documents.updatedAt')}：{updatedAt}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
