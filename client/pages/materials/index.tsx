import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { FileText, Paperclip, Plus } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchMaterials } from './material-api.js';
import type { Material, MaterialListMeta } from './types.js';

const PAGE_SIZE = 20;

interface ListResult {
  readonly key: string;
  readonly status: 'ready' | 'failed';
  readonly data: readonly Material[];
  readonly meta: MaterialListMeta;
}

/** The user's materials, newest first, one page at a time, with the routes that open one or create another. */
export default function MaterialsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [page, setPage] = useState(1);
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `${page}:${reloadCount}`;
  const [result, setResult] = useState<ListResult>();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const outletContext = useMemo(() => ({ reload }), [reload]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMaterials(api, page, PAGE_SIZE, controller.signal)
      .then((response) =>
        setResult({
          key: requestKey,
          status: 'ready',
          data: response.data,
          meta: response.meta,
        }),
      )
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          status: 'failed',
          data: [],
          meta: { page, pageSize: PAGE_SIZE, total: 0 },
        });
      });
    return () => controller.abort();
  }, [api, page, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  const pageCount = current
    ? Math.max(1, Math.ceil(current.meta.total / current.meta.pageSize))
    : 1;

  return (
    <PageContainer>
      <PageHeader
        title={t('materials.title')}
        description={t('materials.description')}
        actions={
          <Button render={<Link to='create' />}>
            <Plus aria-hidden='true' />
            {t('materials.create')}
          </Button>
        }
      />

      {!current ? <ListSkeleton /> : null}

      {current?.status === 'failed' ? (
        <Alert variant='destructive'>
          <AlertDescription className='flex flex-wrap items-center gap-3'>
            <span>{t('materials.loadFailed')}</span>
            <Button type='button' size='sm' variant='outline' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {current?.status === 'ready' && current.data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileText aria-hidden='true' />
            </EmptyMedia>
            <EmptyTitle>{t('materials.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('materials.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant='outline' render={<Link to='create' />}>
              <Plus aria-hidden='true' />
              {t('materials.create')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {current?.status === 'ready' && current.data.length > 0 ? (
        <ul className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          {current.data.map((material) => (
            <li key={material.id}>
              <Card className='h-full'>
                <CardHeader>
                  <CardTitle className='min-w-0'>
                    <Link
                      className='hover:text-primary focus-visible:underline focus-visible:outline-none'
                      to={encodeURIComponent(material.id)}
                    >
                      {material.title}
                    </Link>
                  </CardTitle>
                  <CardAction>
                    <span className='inline-flex items-center gap-1 text-sm text-muted-foreground'>
                      <Paperclip aria-hidden='true' className='size-4' />
                      {material.files.length}
                    </span>
                  </CardAction>
                  {material.description ? (
                    <CardDescription className='line-clamp-2'>
                      {material.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    {t('materials.updatedAt', {
                      date: dateFormatter.format(new Date(material.updatedAt)),
                    })}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {current?.status === 'ready' && pageCount > 1 ? (
        <div className='flex items-center justify-end gap-3'>
          <Button
            type='button'
            variant='outline'
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {t('materials.pagination.previous')}
          </Button>
          <span className='text-sm text-muted-foreground'>
            {t('materials.pagination.pageOf', { page, pageCount })}
          </span>
          <Button
            type='button'
            variant='outline'
            disabled={page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('materials.pagination.next')}
          </Button>
        </div>
      ) : null}

      {/* The create dialog and the material detail are child routes; they render over this page and refresh it. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function ListSkeleton(): ReactElement {
  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className='h-32 w-full' />
      ))}
    </div>
  );
}
