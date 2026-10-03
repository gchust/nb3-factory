import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useServiceApi,
  type KnowledgeArticleView,
  type ServiceApi,
} from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import { ErrorBlock, LoadingBlock } from '../shared.js';
import { formatDateTime } from '../format.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [search, setSearch] = useState('');
  const articles = useAsync(() => api.knowledge(search), [api, search]);
  const me = useAsync(() => api.me(), [api]);
  const [viewing, setViewing] = useState<KnowledgeArticleView | null>(null);

  const columns = useMemo<ColumnDef<KnowledgeArticleView>[]>(
    () => [
      { accessorKey: 'title', header: t('service.knowledge.articleTitle') },
      {
        accessorKey: 'summary',
        header: t('service.knowledge.summary'),
        cell: ({ row }) => (
          <span className='line-clamp-1 text-muted-foreground'>
            {row.original.summary ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.knowledge.status'),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'published' ? 'default' : 'secondary'
            }
          >
            {t(`service.knowledge.statusValue.${row.original.status}`, {
              defaultValue: row.original.status,
            })}
          </Badge>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: t('service.knowledge.updatedAt'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.updatedAt)}
          </span>
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
        actions={
          me.data?.can.manageKnowledge ? (
            <ArticleEditor api={api} t={t} onSaved={() => articles.reload()} />
          ) : undefined
        }
      />
      <div className='flex items-center gap-2'>
        <Input
          className='w-64'
          placeholder={t('service.common.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {articles.error ? (
        <ErrorBlock error={articles.error} onRetry={articles.reload} />
      ) : !articles.data ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={articles.data}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => setViewing(row.original)}
          emptyMessage={t('service.knowledge.empty')}
        />
      )}
      <ArticleView
        api={api}
        t={t}
        article={viewing}
        canManage={Boolean(me.data?.can.manageKnowledge)}
        onClose={() => setViewing(null)}
        onChanged={() => articles.reload()}
      />
    </PageContainer>
  );
}

function ArticleEditor({
  api,
  t,
  article,
  onSaved,
  trigger,
}: {
  api: ServiceApi;
  t: Translate;
  article?: KnowledgeArticleView;
  onSaved: () => void;
  trigger?: ReactNode;
}): ReactElement {
  const toaster = useToaster();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: article?.title ?? '',
    summary: article?.summary ?? '',
    body: article?.body ?? '',
    status: article?.status ?? 'draft',
  });

  async function save(): Promise<void> {
    if (!form.title.trim()) {
      toaster.show({
        type: 'error',
        title: t('service.knowledge.titleRequired'),
      });
      return;
    }
    try {
      if (article) {
        await api.updateKnowledge(article.id, form);
      } else {
        await api.createKnowledge(form);
      }
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setOpen(false);
      onSaved();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size='sm' onClick={() => setOpen(true)}>
        {trigger ?? t('service.knowledge.newArticle')}
      </Button>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {article
              ? t('service.knowledge.editArticle')
              : t('service.knowledge.newArticle')}
          </DialogTitle>
          <DialogDescription>
            {t('service.knowledge.editorDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='max-h-[60vh] overflow-y-auto py-2'>
          <Field>
            <FieldLabel htmlFor='article-title'>
              {t('service.knowledge.articleTitle')}
            </FieldLabel>
            <Input
              id='article-title'
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='article-summary'>
              {t('service.knowledge.summary')}
            </FieldLabel>
            <Input
              id='article-summary'
              value={form.summary}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, summary: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='article-body'>
              {t('service.knowledge.body')}
            </FieldLabel>
            <Textarea
              id='article-body'
              rows={12}
              value={form.body}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, body: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='article-status'>
              {t('service.knowledge.status')}
            </FieldLabel>
            <Select
              value={form.status}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, status: String(value) }))
              }
            >
              <SelectTrigger id='article-status' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='draft'>
                  {t('service.knowledge.statusValue.draft')}
                </SelectItem>
                <SelectItem value='published'>
                  {t('service.knowledge.statusValue.published')}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            type='button'
            onClick={() => setOpen(false)}
          >
            {t('service.common.cancel')}
          </Button>
          <Button type='button' onClick={() => void save()}>
            {t('service.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArticleView({
  api,
  t,
  article,
  canManage,
  onClose,
  onChanged,
}: {
  api: ServiceApi;
  t: Translate;
  article: KnowledgeArticleView | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement | null {
  if (!article) {
    return null;
  }
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{article.title}</DialogTitle>
          <DialogDescription>
            {article.summary ? <span>{article.summary} · </span> : null}
            {formatDateTime(article.updatedAt)}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[60vh] overflow-y-auto whitespace-pre-wrap py-2 text-sm leading-6'>
          {article.body ?? ''}
        </div>
        {canManage ? (
          <DialogFooter>
            <ArticleEditor
              api={api}
              t={t}
              article={article}
              onSaved={() => {
                onClose();
                onChanged();
              }}
              trigger={<span>{t('service.common.edit')}</span>}
            />
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
