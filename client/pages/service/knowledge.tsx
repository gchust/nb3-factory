import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpenIcon, SearchIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import {
  DateTimeText,
  EmptyState,
  LoadError,
  TableSkeleton,
} from './components/service-states.js';
import { useAsync, useServiceApi } from './service-hooks.js';
import type { ServiceArticle } from './types.js';

const CONTENT_STATUSES = ['published', 'draft', 'archived'] as const;

/** Knowledge articles: a searchable list beside the article being read. */
export default function ServiceKnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('published');
  const [pickedId, setPickedId] = useState<number | null>(null);

  const articles = useAsync(
    () =>
      api.listArticles({
        ...(term.trim() ? { query: term.trim() } : {}),
        ...(status ? { status } : {}),
      }),
    `articles:${term}:${status}`,
  );

  // The first article is shown until the reader picks another; derived
  // rather than stored so a filter change cannot leave a stale selection.
  const selectedId = pickedId ?? articles.data?.[0]?.id ?? null;

  const article = useAsync(
    () =>
      selectedId === null
        ? Promise.resolve(undefined)
        : api.getArticle(selectedId),
    `article:${selectedId ?? 'none'}`,
  );

  const columns = useMemo<ColumnDef<ServiceArticle>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.knowledge.titleColumn')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-medium'>{row.original.title}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {row.original.summary ?? ''}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: t('service.knowledge.category'),
        cell: ({ row }) => row.original.category ?? '—',
      },
      {
        accessorKey: 'status',
        header: t('service.knowledge.status'),
        cell: ({ row }) => (
          <Badge variant='outline'>
            {t(`service.contentStatus.${row.original.status}`, {
              defaultValue: row.original.status,
            })}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full max-w-sm'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={term}
            className='pl-8'
            placeholder={t('service.knowledge.searchPlaceholder')}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <NativeSelect
          className='w-44'
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value=''>{t('service.knowledge.allStatuses')}</option>
          {CONTENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`service.contentStatus.${value}`, { defaultValue: value })}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
        <div className='flex flex-col gap-4'>
          {articles.error ? (
            <LoadError error={articles.error} onRetry={articles.reload} />
          ) : articles.loading ? (
            <TableSkeleton rows={5} columns={3} />
          ) : (
            <DataTable
              columns={columns}
              data={articles.data ?? []}
              pagination={false}
              emptyMessage={<EmptyState title={t('service.knowledge.empty')} />}
              onRowClick={(row) => setPickedId(row.original.id)}
            />
          )}
        </div>

        <Card className='overflow-hidden'>
          <CardContent className='pt-6'>
            {article.loading ? (
              <TableSkeleton rows={6} columns={1} />
            ) : article.error ? (
              <LoadError error={article.error} onRetry={article.reload} />
            ) : article.data ? (
              <article className='flex flex-col gap-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <BookOpenIcon className='size-4 text-muted-foreground' />
                  <h2 className='font-heading text-base font-medium'>
                    {article.data.title}
                  </h2>
                </div>
                <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                  <span>{article.data.slug}</span>
                  {article.data.category ? (
                    <>
                      <Separator orientation='vertical' className='h-3' />
                      <span>{article.data.category}</span>
                    </>
                  ) : null}
                  <Separator orientation='vertical' className='h-3' />
                  <DateTimeText value={article.data.updatedAt} />
                </div>
                {article.data.summary ? (
                  <p className='text-sm text-muted-foreground'>
                    {article.data.summary}
                  </p>
                ) : null}
                <ScrollArea className='h-[420px] rounded-lg border p-4'>
                  <div className='text-sm whitespace-pre-wrap'>
                    {article.data.content}
                  </div>
                </ScrollArea>
              </article>
            ) : (
              <EmptyState title={t('service.knowledge.noSelection')} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
