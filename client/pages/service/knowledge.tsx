import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import {
  describeError,
  useIdentity,
  useResource,
  useServiceApi,
} from '../../service/api.js';
import {
  asNumber,
  asText,
  joinTags,
  useDebouncedValue,
} from '../../service/format.js';
import { usePagedList } from '../../service/use-paged-list.js';
import {
  FilterSelect,
  ListPager,
  QueryState,
  SearchInput,
  StatusBadge,
} from '../../service/ui.js';

/**
 * Knowledge base. Readers only ever receive published articles — the server
 * applies that restriction to the query, not to the rendered result.
 */
export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const identity = useIdentity();
  const navigate = useNavigate();
  const list = usePagedList(20);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const canWrite = identity.data?.manageKnowledge === true;

  const articles = useResource(`${list.key}:${debouncedSearch}`, () =>
    api.listKnowledge({ ...list.query, search: debouncedSearch || undefined }),
  );

  const rows = articles.data?.data ?? [];
  const total = (articles.data?.meta?.total as number | undefined) ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={
          canWrite
            ? t('service.knowledge.descriptionWriter')
            : t('service.knowledge.descriptionReader')
        }
        actions={
          canWrite ? (
            <Button size='sm' onClick={() => setCreating(true)}>
              <PlusIcon />
              {t('service.knowledge.create')}
            </Button>
          ) : undefined
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('service.knowledge.searchPlaceholder')}
        />
        <FilterSelect
          allLabel={t('service.common.all')}
          value={list.filters.category ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('category', value === 'all' ? undefined : value)
          }
          options={['repair', 'maintenance', 'safety', 'operation'].map(
            (category) => ({
              value: category,
              label: t(`service.knowledge.category.${category}`, {
                defaultValue: category,
              }),
            }),
          )}
        />
        {canWrite ? (
          <FilterSelect
            allLabel={t('service.common.all')}
            value={list.filters.status ?? 'all'}
            onValueChange={(value) =>
              list.setFilter('status', value === 'all' ? undefined : value)
            }
            options={[
              {
                value: 'published',
                label: t('service.status.article.published'),
              },
              { value: 'draft', label: t('service.status.article.draft') },
            ]}
          />
        ) : null}
        <Button variant='ghost' size='sm' onClick={() => list.reset()}>
          {t('service.common.clearFilters')}
        </Button>
      </div>

      <QueryState
        loading={articles.loading}
        error={articles.error}
        empty={rows.length === 0}
        onRetry={articles.reload}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('service.knowledge.articleTitle')}</TableHead>
              <TableHead>{t('service.knowledge.categoryLabel')}</TableHead>
              <TableHead>{t('service.knowledge.status')}</TableHead>
              <TableHead>{t('service.knowledge.tags')}</TableHead>
              <TableHead>{t('service.knowledge.updatedAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((article) => (
              <TableRow
                key={article.id}
                className='cursor-pointer'
                onClick={() => {
                  void navigate(`/service/knowledge/${article.id}`);
                }}
              >
                <TableCell>
                  <Link
                    className='font-medium hover:underline'
                    to={`/service/knowledge/${article.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {asText(article.title)}
                  </Link>
                  <p className='max-w-2xl truncate text-xs text-muted-foreground'>
                    {asText(article.summary)}
                  </p>
                </TableCell>
                <TableCell>
                  {t(`service.knowledge.category.${asText(article.category)}`, {
                    defaultValue: asText(article.category),
                  })}
                </TableCell>
                <TableCell>
                  <StatusBadge kind='article' value={article.status} />
                </TableCell>
                <TableCell className='text-sm text-muted-foreground'>
                  {joinTags(article.tags) || '—'}
                </TableCell>
                <TableCell className='text-sm text-muted-foreground'>
                  {asText(article.updatedAt).slice(0, 10)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPager
          page={list.page}
          pageSize={list.pageSize}
          total={total}
          onPageChange={(page) => list.setPage(page)}
        />
      </QueryState>

      {canWrite ? (
        <CreateArticleDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={(id) => {
            setCreating(false);
            articles.reload();
            void navigate(`/service/knowledge/${id}`);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

interface CreateArticleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (id: number) => void;
}

function CreateArticleDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateArticleDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('repair');
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createKnowledge({
        title: title.trim(),
        summary,
        content,
        category,
      });
      toast.add({ type: 'success', title: t('service.knowledge.created') });
      setTitle('');
      setSummary('');
      setContent('');
      onCreated(asNumber(created.id) ?? 0);
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('service.knowledge.create')}</DialogTitle>
          <DialogDescription>
            {t('service.knowledge.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label htmlFor='article-title'>
              {t('service.knowledge.articleTitle')}
            </Label>
            <Input
              id='article-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='article-category'>
              {t('service.knowledge.categoryLabel')}
            </Label>
            <Input
              id='article-category'
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='article-summary'>
              {t('service.knowledge.summary')}
            </Label>
            <Textarea
              id='article-summary'
              rows={2}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='article-content'>
              {t('service.knowledge.content')}
            </Label>
            <Textarea
              id='article-content'
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('service.common.cancel')}
          </Button>
          <Button
            disabled={saving || !title.trim()}
            onClick={() => void submit()}
          >
            {saving ? t('service.common.saving') : t('service.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
