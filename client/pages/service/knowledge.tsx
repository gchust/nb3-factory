import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type KnowledgeInput } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import {
  EmptyState,
  ErrorState,
  KnowledgeStatusBadge,
  PageLoading,
  errorMessage,
  formatDateTime,
  useAsync,
} from '@/service/ui.js';
import type { ServiceKnowledgeArticle } from '@/service/types.js';

const EMPTY: KnowledgeInput = { title: '', content: '', status: 'draft' };

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor } = useSession();
  const articles = useAsync(() => api.listKnowledge(), []);
  const [editing, setEditing] = useState<KnowledgeInput>();
  const [reading, setReading] = useState<ServiceKnowledgeArticle>();
  const [removing, setRemoving] = useState<ServiceKnowledgeArticle>();
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!editing?.title.trim() || !editing?.content.trim()) {
      toaster.show({ type: 'error', title: t('service.knowledge.required') });
      return;
    }
    setSaving(true);
    try {
      await api.saveKnowledge(editing);
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setEditing(undefined);
      articles.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!removing) {
      return;
    }
    try {
      await api.deleteKnowledge(removing.id);
      toaster.show({ type: 'success', title: t('service.common.deleted') });
      setRemoving(undefined);
      articles.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
      setRemoving(undefined);
    }
  };

  const update = (patch: Partial<KnowledgeInput>): void =>
    setEditing((current) => ({ ...(current ?? EMPTY), ...patch }));

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
        actions={
          isSupervisor ? (
            <Button onClick={() => setEditing({ ...EMPTY })}>
              <Plus />
              {t('service.knowledge.create')}
            </Button>
          ) : undefined
        }
      />

      {articles.loading ? <PageLoading /> : null}
      {articles.error ? (
        <ErrorState error={articles.error} onRetry={articles.reload} />
      ) : null}

      {!articles.loading && !articles.error ? (
        articles.data && articles.data.length > 0 ? (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {articles.data.map((article) => (
              <div
                key={article.id}
                className='flex flex-col gap-3 rounded-lg border border-border p-4'
              >
                <div className='flex items-start justify-between gap-2'>
                  <h2 className='font-heading text-lg font-semibold'>
                    {article.title}
                  </h2>
                  <KnowledgeStatusBadge status={article.status} />
                </div>
                {article.summary ? (
                  <p className='line-clamp-3 text-sm text-muted-foreground'>
                    {article.summary}
                  </p>
                ) : null}
                <p className='text-xs text-muted-foreground'>
                  {t('service.knowledge.updatedAt')}{' '}
                  {formatDateTime(article.updatedAt)}
                </p>
                <div className='mt-auto flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setReading(article)}
                  >
                    <Eye />
                    {t('service.knowledge.read')}
                  </Button>
                  {isSupervisor ? (
                    <>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() =>
                          setEditing({
                            id: article.id,
                            title: article.title,
                            summary: article.summary ?? '',
                            content: article.content,
                            tags: article.tags ?? '',
                            status: article.status,
                          })
                        }
                      >
                        <Pencil />
                        {t('service.common.edit')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setRemoving(article)}
                      >
                        <Trash2 />
                        {t('service.common.delete')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState />
        )
      ) : null}

      <Sheet
        open={Boolean(reading)}
        onOpenChange={(open) => !open && setReading(undefined)}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>{reading?.title}</SheetTitle>
            <SheetDescription>
              {reading ? (
                <KnowledgeStatusBadge status={reading.status} />
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <div className='prose prose-sm max-w-none px-4 pb-8 whitespace-pre-wrap text-sm'>
            {reading?.content}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>
              {editing?.id
                ? t('service.knowledge.editTitle')
                : t('service.knowledge.create')}
            </SheetTitle>
          </SheetHeader>
          <div className='grid gap-4 px-4 pb-8'>
            <div className='grid gap-2'>
              <Label htmlFor='knowledge-title'>
                {t('service.knowledge.articleTitle')}
              </Label>
              <Input
                id='knowledge-title'
                value={editing?.title ?? ''}
                onChange={(event) => update({ title: event.target.value })}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='knowledge-summary'>
                {t('service.knowledge.summary')}
              </Label>
              <Input
                id='knowledge-summary'
                value={editing?.summary ?? ''}
                onChange={(event) => update({ summary: event.target.value })}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='knowledge-tags'>
                {t('service.knowledge.tags')}
              </Label>
              <Input
                id='knowledge-tags'
                value={editing?.tags ?? ''}
                onChange={(event) => update({ tags: event.target.value })}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='knowledge-content'>
                {t('service.knowledge.content')}
              </Label>
              <Textarea
                id='knowledge-content'
                className='min-h-60'
                value={editing?.content ?? ''}
                onChange={(event) => update({ content: event.target.value })}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('service.knowledge.status')}</Label>
              <Select
                items={[
                  {
                    value: 'draft',
                    label: t('service.knowledgeStatus.draft'),
                  },
                  {
                    value: 'published',
                    label: t('service.knowledgeStatus.published'),
                  },
                ]}
                value={editing?.status ?? 'draft'}
                onValueChange={(next) =>
                  update({ status: next as 'draft' | 'published' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='draft'>
                    {t('service.knowledgeStatus.draft')}
                  </SelectItem>
                  <SelectItem value='published'>
                    {t('service.knowledgeStatus.published')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                {t('service.knowledge.statusHint')}
              </p>
            </div>
            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setEditing(undefined)}>
                {t('actions.cancel')}
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {t('actions.save')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.knowledge.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.knowledge.deleteDescription', {
                title: removing?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('service.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
