import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToaster } from '@nocobase/app-client';

import { useServiceRequest } from '../api.js';
import type { KnowledgeRecord, Paged } from '../api.js';
import {
  AsyncBlock,
  formatDateTime,
  StatusBadge,
  useAsyncData,
} from '../shared.js';

interface KnowledgeForm {
  title: string;
  category: string;
  deviceModel: string;
  tags: string;
  status: string;
  summary: string;
  content: string;
}

const EMPTY: KnowledgeForm = {
  title: '',
  category: '',
  deviceModel: '',
  tags: '',
  status: 'published',
  summary: '',
  content: '',
};

const CATEGORIES = ['manual', 'faq', 'troubleshooting', 'sop'] as const;

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KnowledgeRecord | null>(null);
  const [viewing, setViewing] = useState<KnowledgeRecord | null>(null);
  const [form, setForm] = useState<KnowledgeForm>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const state = useAsyncData<Paged<KnowledgeRecord>>(
    () =>
      request<Paged<KnowledgeRecord>>('/service/knowledge', {
        query: { search, pageSize: 100 },
      }),
    [request, search],
  );

  function openCreate(): void {
    setForm(EMPTY);
    setFields({});
    setCreating(true);
  }

  function openEdit(article: KnowledgeRecord): void {
    setForm({
      title: article.title,
      category: article.category ?? '',
      deviceModel: article.deviceModel ?? '',
      tags: article.tags ?? '',
      status: article.status,
      summary: article.summary ?? '',
      content: article.content,
    });
    setFields({});
    setEditing(article);
  }

  function fail(error: unknown): void {
    toaster.show({
      type: 'error',
      title: t('service.error.title'),
      description: error instanceof Error ? error.message : String(error),
    });
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = t('service.validation.required');
    if (!form.content.trim()) next.content = t('service.validation.required');
    setFields(next);
    if (Object.keys(next).length) return;
    setPending(true);
    const body = {
      title: form.title.trim(),
      category: form.category || null,
      deviceModel: form.deviceModel || null,
      tags: form.tags || null,
      status: form.status,
      summary: form.summary || null,
      content: form.content,
    };
    try {
      if (editing) {
        await request(`/service/knowledge/${editing.id}`, {
          method: 'PATCH',
          json: body,
        });
        toaster.show({
          type: 'success',
          title: t('service.knowledge.updated'),
        });
      } else {
        await request('/service/knowledge', { method: 'POST', json: body });
        toaster.show({
          type: 'success',
          title: t('service.knowledge.created'),
        });
      }
      setCreating(false);
      setEditing(null);
      state.reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  async function remove(article: KnowledgeRecord): Promise<void> {
    try {
      await request(`/service/knowledge/${article.id}`, { method: 'DELETE' });
      setViewing(null);
      state.reload();
    } catch (error) {
      fail(error);
    }
  }

  const dialogOpen = creating || editing !== null;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('service.knowledge.create')}
          </Button>
        }
      />

      <div className='relative w-full max-w-sm'>
        <SearchIcon className='pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground' />
        <Input
          className='pl-8'
          placeholder={t('service.knowledge.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <AsyncBlock state={state} empty={(data) => data.items.length === 0}>
        {(data) => (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.knowledge.titleField')}</TableHead>
                  <TableHead>{t('service.knowledge.category')}</TableHead>
                  <TableHead>{t('service.knowledge.deviceModel')}</TableHead>
                  <TableHead>{t('service.knowledge.status')}</TableHead>
                  <TableHead>{t('service.knowledge.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((article) => (
                  <TableRow
                    className='cursor-pointer'
                    key={article.id}
                    onClick={() => setViewing(article)}
                  >
                    <TableCell className='font-medium'>
                      {article.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {article.category
                          ? t(`service.knowledgeCategory.${article.category}`, {
                              defaultValue: article.category,
                            })
                          : '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>{article.deviceModel ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge kind='knowledge' status={article.status} />
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {formatDateTime(article.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AsyncBlock>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t('service.knowledge.editTitle')
                  : t('service.knowledge.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('service.knowledge.formHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={Boolean(fields.title)}>
                <FieldLabel>{t('service.knowledge.titleField')}</FieldLabel>
                <Input
                  aria-invalid={Boolean(fields.title)}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
                {fields.title ? <FieldError>{fields.title}</FieldError> : null}
              </Field>
              <div className='grid gap-4 sm:grid-cols-3'>
                <Field>
                  <FieldLabel>{t('service.knowledge.category')}</FieldLabel>
                  <select
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                  >
                    <option value=''>
                      {t('service.knowledge.noCategory')}
                    </option>
                    {CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {t(`service.knowledgeCategory.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel>{t('service.knowledge.deviceModel')}</FieldLabel>
                  <Input
                    value={form.deviceModel}
                    onChange={(event) =>
                      setForm({ ...form, deviceModel: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('service.knowledge.status')}</FieldLabel>
                  <select
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value })
                    }
                  >
                    <option value='published'>
                      {t('service.status.knowledge.published')}
                    </option>
                    <option value='draft'>
                      {t('service.status.knowledge.draft')}
                    </option>
                  </select>
                </Field>
              </div>
              <Field>
                <FieldLabel>{t('service.knowledge.tags')}</FieldLabel>
                <Input
                  value={form.tags}
                  onChange={(event) =>
                    setForm({ ...form, tags: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('service.knowledge.summary')}</FieldLabel>
                <Textarea
                  rows={2}
                  value={form.summary}
                  onChange={(event) =>
                    setForm({ ...form, summary: event.target.value })
                  }
                />
              </Field>
              <Field data-invalid={Boolean(fields.content)}>
                <FieldLabel>{t('service.knowledge.content')}</FieldLabel>
                <Textarea
                  rows={8}
                  aria-invalid={Boolean(fields.content)}
                  value={form.content}
                  onChange={(event) =>
                    setForm({ ...form, content: event.target.value })
                  }
                />
                {fields.content ? (
                  <FieldError>{fields.content}</FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {editing
                  ? t('service.actions.save')
                  : t('service.actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{viewing?.title ?? ''}</DialogTitle>
            <DialogDescription>
              {viewing
                ? `${viewing.deviceModel ?? ''} ${viewing.tags ?? ''}`.trim()
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className='max-h-[60vh] space-y-3 overflow-y-auto text-sm'>
            {viewing?.summary ? (
              <p className='text-muted-foreground'>{viewing.summary}</p>
            ) : null}
            <p className='whitespace-pre-wrap'>{viewing?.content ?? ''}</p>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='destructive'
              onClick={() => viewing && void remove(viewing)}
            >
              {t('service.actions.delete')}
            </Button>
            <Button
              type='button'
              onClick={() => {
                if (viewing) openEdit(viewing);
                setViewing(null);
              }}
            >
              {t('service.actions.edit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
