import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/pages/service/shared.js';
import {
  formatDateTime,
  useActionFeedback,
  useServiceList,
  useServiceMe,
} from '@/pages/service/service-api.js';
import type { KnowledgeArticle } from '@/pages/service/types.js';

interface Draft {
  title: string;
  summary: string;
  body: string;
  published: boolean;
}

const EMPTY: Draft = { title: '', summary: '', body: '', published: false };

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const { data, error, loading, reload } = useServiceList<KnowledgeArticle>(
    'service/knowledge',
    undefined,
    '',
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (!draft) return;
    setBusy(true);
    try {
      if (editingId) {
        await api.request({
          path: `service/knowledge/${editingId}`,
          method: 'PATCH',
          json: draft,
        });
        feedback.success(t('service.knowledge.updated'));
      } else {
        await api.request({
          path: 'service/knowledge',
          method: 'POST',
          json: draft,
        });
        feedback.success(t('service.knowledge.created'));
      }
      setDraft(null);
      setEditingId(null);
      reload();
    } catch (saveError) {
      feedback.failure(saveError);
    } finally {
      setBusy(false);
    }
  };

  const setPublished = async (
    article: KnowledgeArticle,
    published: boolean,
  ): Promise<void> => {
    setBusy(true);
    try {
      await api.request({
        path: `service/knowledge/${article.id}`,
        method: 'PATCH',
        json: { published },
      });
      feedback.success(
        published
          ? t('service.knowledge.published')
          : t('service.knowledge.unpublished'),
      );
      reload();
    } catch (publishError) {
      feedback.failure(publishError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
        actions={
          me?.supervisor ? (
            <Button
              variant='outline'
              onClick={() => {
                setEditingId(null);
                setDraft(EMPTY);
              }}
            >
              <PlusIcon data-icon='inline-start' />
              {t('service.knowledge.create')}
            </Button>
          ) : null
        }
      />
      {draft ? (
        <Card>
          <CardContent className='grid gap-4 pt-6'>
            <div className='grid gap-2'>
              <Label htmlFor='kb-title'>
                {t('service.knowledge.fieldTitle')}
              </Label>
              <Input
                id='kb-title'
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='kb-summary'>
                {t('service.knowledge.summary')}
              </Label>
              <Input
                id='kb-summary'
                value={draft.summary}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='kb-body'>{t('service.knowledge.body')}</Label>
              <Textarea
                id='kb-body'
                rows={6}
                value={draft.body}
                onChange={(event) =>
                  setDraft({ ...draft, body: event.target.value })
                }
              />
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={draft.published}
                onChange={(event) =>
                  setDraft({ ...draft, published: event.target.checked })
                }
              />
              {t('service.knowledge.publishedField')}
            </label>
            <div className='flex gap-2'>
              <Button
                disabled={
                  busy || draft.title.trim() === '' || draft.body.trim() === ''
                }
                onClick={() => void save()}
              >
                {t('actions.save')}
              </Button>
              <Button
                variant='ghost'
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                }}
              >
                {t('actions.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        data.length === 0 ? (
          <EmptyState
            title={t('service.knowledge.empty')}
            description={t('service.knowledge.emptyHint')}
          />
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            {data.map((article) => (
              <Card key={article.id}>
                <CardHeader>
                  <div className='flex items-center justify-between gap-2'>
                    <CardTitle className='text-base'>{article.title}</CardTitle>
                    <Badge variant={article.published ? 'default' : 'outline'}>
                      {article.published
                        ? t('service.knowledge.publishedField')
                        : t('service.knowledge.draft')}
                    </Badge>
                  </div>
                  {article.summary ? (
                    <CardDescription>{article.summary}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className='space-y-3 text-sm'>
                  <p className='whitespace-pre-wrap text-muted-foreground'>
                    {article.body}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.field.updatedAt')}:{' '}
                    {formatDateTime(article.updatedAt)}
                  </p>
                  {me?.supervisor ? (
                    <div className='flex gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={busy}
                        onClick={() => {
                          setDraft({
                            title: article.title,
                            summary: article.summary ?? '',
                            body: article.body,
                            published: article.published,
                          });
                          setEditingId(article.id);
                        }}
                      >
                        {t('service.field.edit')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        disabled={busy}
                        onClick={() =>
                          void setPublished(article, !article.published)
                        }
                      >
                        {article.published
                          ? t('service.knowledge.unpublish')
                          : t('service.knowledge.publish')}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </PageContainer>
  );
}
