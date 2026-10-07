import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { NoteStatusBadge } from '@/components/service/badges.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { formatDateTime } from '@/components/service/format.js';
import { SelectField } from '@/components/service/select-field.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import type { Paged, RepairNoteView } from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient, useDebouncedValue } from '@/hooks/use-service-api.js';

const FAULT_CATEGORIES = [
  'mechanical',
  'electrical',
  'software',
  'wear',
  'calibration',
  'other',
] as const;

interface NoteFormState {
  readonly title: string;
  readonly body: string;
  readonly deviceModel: string;
  readonly faultCategory: string;
}

const EMPTY_FORM: NoteFormState = {
  title: '',
  body: '',
  deviceModel: '',
  faultCategory: '',
};

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NoteFormState>(EMPTY_FORM);
  const [viewing, setViewing] = useState<RepairNoteView | null>(null);

  const mayPublish = useCan({
    resource: { type: 'composite', id: 'service.repairNotes' },
    action: 'publish',
  });

  const list = useApiQuery<Paged<RepairNoteView>>('/repairNotes', {
    search: debouncedSearch.trim() || undefined,
    pageSize: 200,
  });

  const submit = async () => {
    await client.request({
      path: '/repairNotes',
      method: 'POST',
      json: {
        title: form.title.trim(),
        body: form.body.trim(),
        deviceModel: form.deviceModel.trim() || null,
        faultCategory: form.faultCategory || null,
      },
    });
    setCreating(false);
    setForm(EMPTY_FORM);
    list.reload();
  };

  const publish = async (note: RepairNoteView) => {
    await client.request({
      path: `/repairNotes/${note.id}/publish`,
      method: 'POST',
    });
    list.reload();
  };

  const columns = useMemo(
    () => [
      { accessorKey: 'title', header: t('service.note.title') },
      {
        accessorKey: 'deviceModel',
        header: t('service.note.deviceModel'),
        cell: ({ row }: { row: { original: RepairNoteView } }) => (
          <span>{row.original.deviceModel ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'faultCategory',
        header: t('service.note.faultCategory'),
        cell: ({ row }: { row: { original: RepairNoteView } }) =>
          row.original.faultCategory ? (
            <span>
              {t(`service.faultCategory.${row.original.faultCategory}`, {
                defaultValue: row.original.faultCategory,
              })}
            </span>
          ) : (
            <span>—</span>
          ),
      },
      {
        accessorKey: 'status',
        header: t('service.note.status'),
        cell: ({ row }: { row: { original: RepairNoteView } }) => (
          <NoteStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'authorName',
        header: t('service.note.author'),
        cell: ({ row }: { row: { original: RepairNoteView } }) => (
          <span>{row.original.authorName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'publishedAt',
        header: t('service.note.publishedAt'),
        cell: ({ row }: { row: { original: RepairNoteView } }) => (
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
        cell: ({ row }: { row: { original: RepairNoteView } }) => (
          <div className='flex gap-2'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setViewing(row.original)}
            >
              {t('service.action.view')}
            </Button>
            {mayPublish.can && row.original.status === 'draft' ? (
              <Button size='sm' onClick={() => void publish(row.original)}>
                {t('service.note.publish')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [mayPublish.can, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.note.title')}
        description={t('service.note.description')}
        actions={
          mayPublish.can ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              {t('service.note.create')}
            </Button>
          ) : undefined
        }
      />

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('service.note.searchPlaceholder')}
        className='max-w-xs'
      />

      {list.error ? (
        <RequestError error={list.error} onRetry={list.reload} />
      ) : null}

      {list.data ? (
        list.data.data.length === 0 ? (
          <EmptyTable title={t('service.note.empty')} />
        ) : (
          <DataTable
            columns={columns}
            data={[...list.data.data]}
            getRowId={(row) => row.id}
            showSelectedCount={false}
            emptyMessage={t('service.note.empty')}
          />
        )
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
        title={t('service.note.create')}
        onSubmit={submit}
        wide
        canSubmit={form.title.trim().length > 0 && form.body.trim().length > 0}
      >
        <Field label={t('service.note.title')} htmlFor='note-title'>
          <Input
            id='note-title'
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label={t('service.note.body')} htmlFor='note-body'>
          <Textarea
            id='note-body'
            rows={8}
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </Field>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            label={t('service.note.deviceModel')}
            htmlFor='note-model'
          >
            <Input
              id='note-model'
              value={form.deviceModel}
              onChange={(event) =>
                setForm({ ...form, deviceModel: event.target.value })
              }
            />
          </Field>
          <Field
            label={t('service.note.faultCategory')}
            htmlFor='note-fault'
          >
            <SelectField
              id='note-fault'
              value={form.faultCategory || null}
              onValueChange={(faultCategory) =>
                setForm({ ...form, faultCategory })
              }
              options={FAULT_CATEGORIES.map((value) => ({
                value,
                label: t(`service.faultCategory.${value}`, {
                  defaultValue: value,
                }),
              }))}
              placeholder={t('service.workOrder.faultPlaceholder')}
              className='w-full'
            />
          </Field>
        </div>
      </FormDialog>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing ? <NoteStatusBadge status={viewing.status} /> : null}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 text-sm'>
            <p className='whitespace-pre-wrap'>{viewing?.body}</p>
            {viewing?.deviceModel ? (
              <p className='text-muted-foreground'>
                {t('service.note.deviceModel')}: {viewing.deviceModel}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
