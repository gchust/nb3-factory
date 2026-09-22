import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/data-states.js';
import { StatusBadge } from '../components/status-badge.js';
import { formatDateTime, knowledgeStatusLabel } from '../lib/format.js';
import type { KnowledgeArticle } from '../lib/types.js';
import { useCaller, useServiceClient } from '../lib/use-service.js';
import { useServiceQuery } from '../lib/use-service-query.js';

interface KnowledgeForm {
  id?: number;
  title: string;
  deviceCategory: string;
  summary: string;
  body: string;
  status: string;
}

const EMPTY: KnowledgeForm = {
  title: '',
  deviceCategory: '',
  summary: '',
  body: '',
  status: 'published',
};

export default function ServiceKnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<KnowledgeForm>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canManage =
    caller.data?.caller.capabilities['knowledge.manage'] === true;

  const list = useServiceQuery(
    () => client.listKnowledge({ search: search || undefined, pageSize: 100 }),
    `knowledge:${search}`,
  );

  const openForm = (article?: KnowledgeArticle) => {
    setError(undefined);
    setForm(
      article
        ? {
            id: article.id,
            title: article.title,
            deviceCategory: article.deviceCategory ?? '',
            summary: article.summary ?? '',
            body: article.body ?? '',
            status: article.status,
          }
        : EMPTY,
    );
  };

  const save = async () => {
    if (!form || !form.title.trim()) {
      setError(t('service.knowledge.titleRequired'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.saveKnowledge({
        id: form.id,
        title: form.title.trim(),
        deviceCategory: form.deviceCategory.trim() || undefined,
        summary: form.summary.trim() || undefined,
        body: form.body.trim() || undefined,
        status: form.status,
      });
      setForm(undefined);
      list.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={() => openForm()}>
              <Plus aria-hidden='true' />
              {t('service.knowledge.create')}
            </Button>
          ) : null
        }
        description={t('service.knowledge.description')}
        title={t('service.knowledge.title')}
      />
      <Input
        className='max-w-xs'
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('service.common.search')}
        value={search}
      />
      <Card className='py-0'>
        <CardContent className='px-0'>
          {list.loading && !list.data ? <LoadingState /> : null}
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : null}
          {list.data ? (
            list.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.knowledge.articleTitle')}</TableHead>
                    <TableHead>{t('service.knowledge.category')}</TableHead>
                    <TableHead>{t('service.knowledge.status')}</TableHead>
                    <TableHead>{t('service.knowledge.views')}</TableHead>
                    <TableHead>{t('service.knowledge.updatedAt')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell className='max-w-md'>
                        <Link
                          className='font-medium text-primary hover:underline'
                          to={`/service/knowledge/${article.id}`}
                        >
                          {article.title}
                        </Link>
                        {article.summary ? (
                          <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                            {article.summary}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{article.deviceCategory ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={knowledgeStatusLabel(t, article.status)}
                          value={article.status}
                        />
                      </TableCell>
                      <TableCell>{article.viewCount}</TableCell>
                      <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>
                        {formatDateTime(article.updatedAt)}
                      </TableCell>
                      {canManage ? (
                        <TableCell className='text-right'>
                          <Button
                            onClick={() => openForm(article)}
                            size='xs'
                            variant='ghost'
                          >
                            {t('service.common.edit')}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.knowledge.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>
      <Dialog
        open={form !== undefined}
        onOpenChange={(next) => !next && setForm(undefined)}
      >
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {form?.id
                ? t('service.knowledge.edit')
                : t('service.knowledge.create')}
            </DialogTitle>
          </DialogHeader>
          {form ? (
            <div className='grid gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='kbTitle'>
                  {t('service.knowledge.articleTitle')}
                </Label>
                <Input
                  id='kbTitle'
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  value={form.title}
                />
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='kbCategory'>
                    {t('service.knowledge.category')}
                  </Label>
                  <Input
                    id='kbCategory'
                    onChange={(event) =>
                      setForm({ ...form, deviceCategory: event.target.value })
                    }
                    value={form.deviceCategory}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='kbStatus'>
                    {t('service.knowledge.status')}
                  </Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        status: value ? String(value) : 'published',
                      })
                    }
                  >
                    <SelectTrigger className='w-full' id='kbStatus'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='published'>
                        {t('service.knowledgeStatus.published')}
                      </SelectItem>
                      <SelectItem value='draft'>
                        {t('service.knowledgeStatus.draft')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='kbSummary'>
                  {t('service.knowledge.summary')}
                </Label>
                <Textarea
                  id='kbSummary'
                  onChange={(event) =>
                    setForm({ ...form, summary: event.target.value })
                  }
                  rows={2}
                  value={form.summary}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='kbBody'>{t('service.knowledge.body')}</Label>
                <Textarea
                  id='kbBody'
                  onChange={(event) =>
                    setForm({ ...form, body: event.target.value })
                  }
                  rows={8}
                  value={form.body}
                />
              </div>
            </div>
          ) : null}
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <DialogFooter>
            <Button onClick={() => setForm(undefined)} variant='outline'>
              {t('service.common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Outlet />
    </PageContainer>
  );
}
