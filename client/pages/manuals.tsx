import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { ManualStatusBadge } from '@/components/service/badges.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { formatDateTime } from '@/components/service/format.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import type { ManualView, Paged } from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient, useDebouncedValue } from '@/hooks/use-service-api.js';

interface ManualFormState {
  readonly title: string;
  readonly modelName: string;
  readonly version: string;
  readonly docNo: string;
  readonly summary: string;
}

const EMPTY_FORM: ManualFormState = {
  title: '',
  modelName: '',
  version: '',
  docNo: '',
  summary: '',
};

export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ManualFormState>(EMPTY_FORM);

  const mayMaintain = useCan({
    resource: { type: 'composite', id: 'service.manuals' },
    action: 'maintain',
  });

  const list = useApiQuery<Paged<ManualView>>('/manuals', {
    search: debouncedSearch.trim() || undefined,
    pageSize: 200,
  });

  const submit = async () => {
    await client.request({
      path: '/manuals',
      method: 'POST',
      json: {
        title: form.title.trim(),
        modelName: form.modelName.trim() || null,
        version: form.version.trim() || null,
        docNo: form.docNo.trim() || null,
        summary: form.summary.trim() || null,
        fileName: `${form.title.trim()}.docx`,
      },
    });
    setCreating(false);
    setForm(EMPTY_FORM);
    list.reload();
  };

  const publish = async (manual: ManualView) => {
    await client.request({
      path: `/manuals/${manual.id}/publish`,
      method: 'POST',
    });
    list.reload();
  };

  const columns = useMemo(
    () => [
      { accessorKey: 'title', header: t('service.manual.title') },
      {
        accessorKey: 'modelName',
        header: t('service.manual.modelName'),
        cell: ({ row }: { row: { original: ManualView } }) => (
          <span>{row.original.modelName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'version',
        header: t('service.manual.version'),
        cell: ({ row }: { row: { original: ManualView } }) => (
          <span>{row.original.version ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.manual.status'),
        cell: ({ row }: { row: { original: ManualView } }) => (
          <div className='flex items-center gap-2'>
            <ManualStatusBadge status={row.original.status} />
            {row.original.indexMessage ? (
              <span
                className='max-w-[18rem] truncate text-xs text-muted-foreground'
                title={row.original.indexMessage}
              >
                {row.original.indexMessage}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'publishedAt',
        header: t('service.manual.publishedAt'),
        cell: ({ row }: { row: { original: ManualView } }) => (
          <span className='text-xs text-muted-foreground'>
            {row.original.publishedAt
              ? formatDateTime(row.original.publishedAt)
              : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: ManualView } }) =>
          mayMaintain.can && row.original.status === 'draft' ? (
            <Button size='sm' onClick={() => void publish(row.original)}>
              {t('service.manual.publish')}
            </Button>
          ) : null,
      },
    ],
    [mayMaintain.can, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.manual.title')}
        description={t('service.manual.description')}
        actions={
          mayMaintain.can ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              {t('service.manual.create')}
            </Button>
          ) : undefined
        }
      />

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('service.manual.searchPlaceholder')}
        className='max-w-xs'
      />

      {list.error ? (
        <RequestError error={list.error} onRetry={list.reload} />
      ) : null}

      {list.data ? (
        list.data.data.length === 0 ? (
          <EmptyTable title={t('service.manual.empty')} />
        ) : (
          <DataTable
            columns={columns}
            data={[...list.data.data]}
            getRowId={(row) => row.id}
            showSelectedCount={false}
            emptyMessage={t('service.manual.empty')}
          />
        )
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
        title={t('service.manual.create')}
        onSubmit={submit}
        wide
        canSubmit={form.title.trim().length > 0}
      >
        <Field label={t('service.manual.title')} htmlFor='manual-title'>
          <Input
            id='manual-title'
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <div className='grid gap-4 sm:grid-cols-3'>
          <Field label={t('service.manual.modelName')} htmlFor='manual-model'>
            <Input
              id='manual-model'
              value={form.modelName}
              onChange={(event) =>
                setForm({ ...form, modelName: event.target.value })
              }
            />
          </Field>
          <Field label={t('service.manual.version')} htmlFor='manual-version'>
            <Input
              id='manual-version'
              value={form.version}
              onChange={(event) =>
                setForm({ ...form, version: event.target.value })
              }
            />
          </Field>
          <Field label={t('service.manual.docNo')} htmlFor='manual-docno'>
            <Input
              id='manual-docno'
              value={form.docNo}
              onChange={(event) => setForm({ ...form, docNo: event.target.value })}
            />
          </Field>
        </div>
        <Field label={t('service.manual.summary')} htmlFor='manual-summary'>
          <Textarea
            id='manual-summary'
            value={form.summary}
            onChange={(event) =>
              setForm({ ...form, summary: event.target.value })
            }
          />
        </Field>
      </FormDialog>
    </PageContainer>
  );
}
