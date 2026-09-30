import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { FileTextIcon, SearchIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';

import { AttachmentPanel } from './components/attachment-panel.js';
import {
  DateTimeText,
  EmptyState,
  LoadError,
  SectionTitle,
  TableSkeleton,
} from './components/service-states.js';
import { useAsync, useServiceApi } from './service-hooks.js';
import type { ServiceManual } from './types.js';
import { manualIndexKey } from './types.js';

const CONTENT_STATUSES = ['published', 'draft', 'archived'] as const;

/** Product manuals: the catalogue beside the selected manual and its files. */
export default function ServiceManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('published');
  const [pickedId, setPickedId] = useState<number | null>(null);

  const manuals = useAsync(
    () =>
      api.listManuals({
        ...(term.trim() ? { query: term.trim() } : {}),
        ...(status ? { status } : {}),
      }),
    `manuals:${term}:${status}`,
  );

  // The first article is shown until the reader picks another; derived
  // rather than stored so a filter change cannot leave a stale selection.
  const selectedId = pickedId ?? manuals.data?.[0]?.id ?? null;

  const manual = useAsync(
    () =>
      selectedId === null
        ? Promise.resolve(undefined)
        : api.getManual(selectedId),
    `manual:${selectedId ?? 'none'}`,
  );

  const attachments = useAsync(
    () =>
      selectedId === null
        ? Promise.resolve([])
        : api.listAttachments({ manualId: selectedId }),
    `manual-attachments:${selectedId ?? 'none'}`,
  );

  const columns = useMemo<ColumnDef<ServiceManual>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.manuals.titleColumn')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-medium'>{row.original.title}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {[row.original.code, row.original.model]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'deviceCategory',
        header: t('service.manual.deviceCategory'),
        cell: ({ row }) => row.original.deviceCategory ?? '—',
      },
      {
        accessorKey: 'version',
        header: t('service.manual.version'),
        cell: ({ row }) => row.original.version ?? '—',
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
      {
        accessorKey: 'indexStatus',
        header: t('service.manual.indexStatus'),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.indexStatus === 'indexed' ? 'default' : 'outline'
            }
          >
            {t(manualIndexKey(row.original.indexStatus), {
              defaultValue: row.original.indexStatus,
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
        title={t('service.manuals.title')}
        description={t('service.manuals.description')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full max-w-sm'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={term}
            className='pl-8'
            placeholder={t('service.manuals.searchPlaceholder')}
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
          {manuals.error ? (
            <LoadError error={manuals.error} onRetry={manuals.reload} />
          ) : manuals.loading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : (
            <DataTable
              columns={columns}
              data={manuals.data ?? []}
              pagination={false}
              emptyMessage={<EmptyState title={t('service.manuals.empty')} />}
              onRowClick={(row) => setPickedId(row.original.id)}
            />
          )}
        </div>

        <Card className='overflow-hidden'>
          <CardContent className='flex flex-col gap-4 pt-6'>
            {manual.loading ? (
              <TableSkeleton rows={6} columns={1} />
            ) : manual.error ? (
              <LoadError error={manual.error} onRetry={manual.reload} />
            ) : manual.data ? (
              <>
                <div className='flex flex-col gap-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <FileTextIcon className='size-4 text-muted-foreground' />
                    <h2 className='font-heading text-base font-medium'>
                      {manual.data.title}
                    </h2>
                    <Badge variant='outline'>
                      {t(`service.contentStatus.${manual.data.status}`, {
                        defaultValue: manual.data.status,
                      })}
                    </Badge>
                  </div>
                  <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    {[
                      manual.data.code,
                      manual.data.deviceCategory,
                      manual.data.model,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    <Separator orientation='vertical' className='h-3' />
                    <DateTimeText value={manual.data.updatedAt} />
                  </div>
                  {manual.data.summary ? (
                    <p className='text-sm text-muted-foreground'>
                      {manual.data.summary}
                    </p>
                  ) : null}
                  <div className='flex flex-wrap items-center gap-2 text-xs'>
                    <span className='text-muted-foreground'>
                      {t('service.manual.indexStatus')}
                    </span>
                    <Badge
                      variant={
                        manual.data.indexStatus === 'indexed'
                          ? 'default'
                          : 'outline'
                      }
                    >
                      {t(manualIndexKey(manual.data.indexStatus), {
                        defaultValue: manual.data.indexStatus,
                      })}
                    </Badge>
                    {manual.data.indexStatus === 'failed' &&
                    manual.data.indexError ? (
                      <span className='text-destructive'>
                        {manual.data.indexError}
                      </span>
                    ) : manual.data.indexStatus === 'blocked' ? (
                      <span className='text-muted-foreground'>
                        {t('service.manual.indexBlockedHint')}
                      </span>
                    ) : null}
                  </div>
                </div>

                {manual.data.content ? (
                  <div className='flex flex-col gap-2'>
                    <SectionTitle>{t('service.manual.content')}</SectionTitle>
                    <article className='prose max-h-80 max-w-none overflow-auto rounded-md border bg-muted/30 p-4 dark:prose-invert'>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {manual.data.content}
                      </ReactMarkdown>
                    </article>
                  </div>
                ) : null}

                <Separator />

                <AttachmentPanel
                  owner={{ kind: 'manual', id: manual.data.id }}
                  resourceId='service.manuals'
                  action='manage'
                  title={t('service.manual.files')}
                  emptyText={t('service.manuals.noFiles')}
                  attachments={attachments.data ?? []}
                  onChanged={() => {
                    attachments.reload();
                    manual.reload();
                  }}
                />
              </>
            ) : (
              <EmptyState title={t('service.manuals.noSelection')} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
