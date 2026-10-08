import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
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
  useActionFeedback,
  useServiceList,
  useServiceMe,
} from '@/pages/service/service-api.js';
import type { Manual } from '@/pages/service/types.js';

interface Draft {
  title: string;
  model: string;
  summary: string;
  body: string;
}

const EMPTY: Draft = { title: '', model: '', summary: '', body: '' };

const STATUS_VARIANT: Record<
  string,
  'default' | 'outline' | 'secondary' | 'destructive'
> = {
  ready: 'default',
  processing: 'secondary',
  pending: 'secondary',
  unconfigured: 'outline',
  failed: 'destructive',
};

export default function ManualsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const { data, error, loading, reload } = useServiceList<Manual>(
    'service/manuals',
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
      const payload = {
        title: draft.title,
        model: draft.model,
        summary: draft.summary,
        body: draft.body,
      };
      if (editingId) {
        await api.request({
          path: `service/manuals/${editingId}`,
          method: 'PATCH',
          json: payload,
        });
        feedback.success(t('service.manuals.updated'));
      } else {
        await api.request({
          path: 'service/manuals',
          method: 'POST',
          json: payload,
        });
        feedback.success(t('service.manuals.created'));
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

  const sync = async (id: number): Promise<void> => {
    setBusy(true);
    try {
      await api.request({
        path: `service/manuals/${id}/sync`,
        method: 'POST',
        json: {},
      });
      feedback.success(t('service.manuals.synced'));
      reload();
    } catch (syncError) {
      feedback.failure(syncError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.manuals.title')}
        description={t('service.manuals.description')}
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
              {t('service.manuals.create')}
            </Button>
          ) : null
        }
      />
      {draft ? (
        <Card>
          <CardContent className='grid gap-4 pt-6'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid gap-2'>
                <Label htmlFor='manual-title'>
                  {t('service.manuals.fieldTitle')}
                </Label>
                <Input
                  id='manual-title'
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='manual-model'>
                  {t('service.manuals.model')}
                </Label>
                <Input
                  id='manual-model'
                  value={draft.model}
                  onChange={(event) =>
                    setDraft({ ...draft, model: event.target.value })
                  }
                />
              </div>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='manual-summary'>
                {t('service.manuals.summary')}
              </Label>
              <Input
                id='manual-summary'
                value={draft.summary}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='manual-body'>{t('service.manuals.body')}</Label>
              <Textarea
                id='manual-body'
                rows={6}
                value={draft.body}
                onChange={(event) =>
                  setDraft({ ...draft, body: event.target.value })
                }
              />
            </div>
            <div className='flex gap-2'>
              <Button
                disabled={
                  busy ||
                  draft.title.trim() === '' ||
                  draft.model.trim() === '' ||
                  draft.body.trim() === ''
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
            title={t('service.manuals.empty')}
            description={t('service.manuals.emptyHint')}
          />
        ) : (
          <div className='grid gap-4 md:grid-cols-2'>
            {data.map((manual) => (
              <Card key={manual.id}>
                <CardHeader>
                  <div className='flex items-center justify-between gap-2'>
                    <CardTitle className='text-base'>{manual.title}</CardTitle>
                    <Badge variant={STATUS_VARIANT[manual.status] ?? 'outline'}>
                      {t(`service.manuals.status.${manual.status}`)}
                    </Badge>
                  </div>
                  <CardDescription>
                    {t('service.manuals.model')}: {manual.model}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3 text-sm'>
                  <p className='whitespace-pre-wrap text-muted-foreground'>
                    {manual.body}
                  </p>
                  {manual.statusMessage ? (
                    <p className='text-xs text-muted-foreground'>
                      {manual.statusMessage}
                    </p>
                  ) : null}
                  {manual.knowledgeBaseKey ? (
                    <p className='font-mono text-xs text-muted-foreground'>
                      {manual.knowledgeBaseKey}
                    </p>
                  ) : null}
                  {me?.supervisor ? (
                    <div className='flex gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={busy}
                        onClick={() => {
                          setDraft({
                            title: manual.title,
                            model: manual.model,
                            summary: manual.summary ?? '',
                            body: manual.body,
                          });
                          setEditingId(manual.id);
                        }}
                      >
                        {t('service.field.edit')}
                      </Button>
                      <Button
                        size='sm'
                        variant='secondary'
                        disabled={busy}
                        onClick={() => void sync(manual.id)}
                      >
                        <RefreshCwIcon data-icon='inline-start' />
                        {t('service.manuals.syncToKnowledgeBase')}
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
