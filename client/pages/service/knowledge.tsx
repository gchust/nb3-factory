import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { EmptyState, ErrorState, LoadingState } from './components.js';
import {
  createKnowledge,
  deleteKnowledge,
  errorMessage,
  listKnowledge,
  updateKnowledge,
  type Knowledge,
} from './data.js';

interface FormState {
  title: string;
  category: string;
  tags: string;
  symptom: string;
  content: string;
  published: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  category: '',
  tags: '',
  symptom: '',
  content: '',
  published: false,
};

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [rows, setRows] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Knowledge | 'new'>();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listKnowledge(api, { keyword })
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, keyword, revision]);

  const openCreate = (): void => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };

  const openEdit = (item: Knowledge): void => {
    setForm({
      title: item.title,
      category: item.category ?? '',
      tags: item.tags ?? '',
      symptom: item.symptom ?? '',
      content: item.content ?? '',
      published: item.published,
    });
    setEditing(item);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    const payload = {
      title: form.title,
      category: form.category || null,
      tags: form.tags || null,
      symptom: form.symptom || null,
      content: form.content || null,
      published: form.published,
    };
    try {
      if (editing === 'new') {
        await createKnowledge(api, payload);
      } else if (editing) {
        await updateKnowledge(api, editing.id, payload);
      }
      toaster.show({ type: 'success', title: t('service.knowledge.saved') });
      setEditing(undefined);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: Knowledge): Promise<void> => {
    setBusy(true);
    try {
      await deleteKnowledge(api, item.id);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Knowledge>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.knowledge.name')}
        />
      ),
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.title}</span>
      ),
    },
    {
      accessorKey: 'category',
      header: t('service.knowledge.category'),
      cell: ({ row }) => row.original.category ?? '—',
    },
    {
      accessorKey: 'symptom',
      header: t('service.knowledge.symptom'),
      cell: ({ row }) => (
        <span className='line-clamp-1 text-sm text-muted-foreground'>
          {row.original.symptom ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'published',
      header: t('service.knowledge.published'),
      cell: ({ row }) =>
        row.original.published ? (
          <Badge variant='secondary'>
            {t('service.knowledge.publishedYes')}
          </Badge>
        ) : (
          <Badge variant='outline'>{t('service.knowledge.publishedNo')}</Badge>
        ),
    },
    {
      accessorKey: 'viewCount',
      header: t('service.knowledge.viewCount'),
      cell: ({ row }) => row.original.viewCount,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button
            size='icon-sm'
            variant='ghost'
            onClick={() => openEdit(row.original)}
          >
            <PencilIcon />
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => void remove(row.original)}
          >
            {t('service.knowledge.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('service.knowledge.create')}
          </Button>
        }
      />

      <div className='relative w-full max-w-xs'>
        <SearchIcon className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
        <Input
          className='pl-8'
          placeholder={t('service.knowledge.searchPlaceholder')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('service.knowledge.empty')} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
        />
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new'
                ? t('service.knowledge.create')
                : t('service.knowledge.edit')}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='knowledge-title'>
                {t('service.knowledge.name')}
              </FieldLabel>
              <Input
                id='knowledge-title'
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </Field>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='knowledge-category'>
                  {t('service.knowledge.category')}
                </FieldLabel>
                <Input
                  id='knowledge-category'
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='knowledge-tags'>
                  {t('service.knowledge.tags')}
                </FieldLabel>
                <Input
                  id='knowledge-tags'
                  value={form.tags}
                  onChange={(event) =>
                    setForm({ ...form, tags: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor='knowledge-symptom'>
                {t('service.knowledge.symptom')}
              </FieldLabel>
              <Textarea
                id='knowledge-symptom'
                rows={2}
                value={form.symptom}
                onChange={(event) =>
                  setForm({ ...form, symptom: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='knowledge-content'>
                {t('service.knowledge.content')}
              </FieldLabel>
              <Textarea
                id='knowledge-content'
                rows={5}
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
              />
            </Field>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={form.published}
                onCheckedChange={(checked) =>
                  setForm({ ...form, published: checked === true })
                }
              />
              {t('service.knowledge.publishedYes')}
            </label>
          </FieldGroup>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditing(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={busy || !form.title} onClick={() => void save()}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
