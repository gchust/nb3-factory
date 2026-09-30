import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  BotIcon,
  FileTextIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  clearAssistantConversation,
  loadAssistantConversation,
  saveAssistantConversation,
  type AssistantDraft,
} from './assistant-storage.js';
import {
  EmptyState,
  LoadError,
  TableSkeleton,
} from './components/service-states.js';
import { useAsync, useServiceApi } from './service-hooks.js';
import type { AssistantAnswer } from './types.js';

/** A note-draft skeleton built only from real retrieval hits or a real answer. */
function draftFromAnswer(answer: AssistantAnswer): string {
  if (answer.ai.status === 'ready' && answer.ai.answer) {
    return answer.ai.answer;
  }
  const lines = answer.results
    .slice(0, 3)
    .map((hit) => `- ${hit.title}: ${hit.snippet}`);
  return lines.length > 0 ? lines.join('\n') : '';
}

/**
 * The knowledge assistant. Retrieval reads the application's own published
 * articles and manuals, so it works with or without a configured language
 * model; when none is configured the page says so instead of inventing an
 * answer.
 *
 * The conversation and the note draft persist per user, so a refresh restores
 * them. A draft is not a business record: it is written into a work order only
 * after the user confirms the transition inside the ticket form.
 */
export default function ServiceAssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const { session } = useAuthentication();
  const userId = session?.user?.id;
  const initial = loadAssistantConversation(userId);
  const [question, setQuestion] = useState(initial.question);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(initial.answer);
  const [draft, setDraft] = useState<AssistantDraft | null>(initial.draft);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    saveAssistantConversation(userId, { question, answer, draft });
  }, [answer, draft, question, userId]);

  const suggestions = useAsync(
    () => api.searchKnowledge(''),
    'assistant-suggestions',
  );

  const ask = useCallback(async () => {
    const text = question.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setDraftSaved(false);
    try {
      setAnswer(await api.ask(text));
    } catch (requestError) {
      setError(requestError);
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  }, [api, question]);

  const reset = useCallback(() => {
    setQuestion('');
    setAnswer(null);
    setDraft(null);
    setDraftSaved(false);
    setError(null);
    clearAssistantConversation(userId);
  }, [userId]);

  const startDraft = useCallback(() => {
    if (!answer) return;
    setDraft({
      text: draftFromAnswer(answer),
      updatedAt: new Date().toISOString(),
    });
    setDraftSaved(false);
  }, [answer]);

  const saveDraft = useCallback(() => {
    setDraftSaved(true);
  }, []);

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setDraftSaved(false);
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
        actions={
          question || answer || draft ? (
            <Button variant='outline' onClick={reset}>
              <Trash2Icon />
              {t('service.assistant.clear')}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className='flex flex-col gap-3 pt-6'>
          <form
            className='flex flex-wrap items-center gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <div className='relative min-w-0 flex-1'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={question}
                className='pl-8'
                placeholder={t('service.assistant.placeholder')}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </div>
            <Button type='submit' disabled={busy || !question.trim()}>
              <SparklesIcon />
              {busy
                ? t('service.assistant.thinking')
                : t('service.assistant.ask')}
            </Button>
          </form>

          {(suggestions.data ?? []).length > 0 ? (
            <div className='flex flex-wrap gap-2'>
              {(suggestions.data ?? []).slice(0, 6).map((hit) => (
                <Button
                  key={`${hit.kind}:${hit.id}`}
                  variant='outline'
                  size='sm'
                  type='button'
                  onClick={() => setQuestion(hit.title)}
                >
                  {hit.title}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? <LoadError error={error} onRetry={() => void ask()} /> : null}

      {busy ? <TableSkeleton rows={3} columns={1} /> : null}

      {answer && !busy ? (
        <div className='flex flex-col gap-4'>
          <Alert>
            <BotIcon />
            <AlertTitle>{t('service.assistant.retrieval')}</AlertTitle>
            <AlertDescription>
              {answer.ai.status === 'blocked'
                ? t('service.assistant.aiBlocked', {
                    reason: answer.ai.reason ?? '',
                  })
                : (answer.ai.answer ?? '')}
            </AlertDescription>
          </Alert>

          <section className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <h2 className='font-heading text-sm font-medium'>
                {t('service.assistant.matches', {
                  count: answer.results.length,
                })}
              </h2>
              <Button variant='outline' size='sm' onClick={startDraft}>
                <FileTextIcon />
                {t('service.assistant.draftIntoNote')}
              </Button>
            </div>
            {answer.results.length === 0 ? (
              <EmptyState title={t('service.assistant.noMatches')} />
            ) : (
              answer.results.map((hit) => (
                <Card key={`${hit.kind}:${hit.id}`}>
                  <CardHeader>
                    <CardTitle className='flex flex-wrap items-center gap-2 text-sm'>
                      {hit.title}
                      <Badge variant='outline'>
                        {hit.kind === 'article'
                          ? t('service.assistant.article')
                          : t('service.assistant.manual')}
                      </Badge>
                      <Badge variant='secondary'>
                        {hit.category ?? hit.status}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm text-muted-foreground'>
                      {hit.snippet}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </div>
      ) : null}

      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex flex-wrap items-center gap-2 text-sm'>
              <FileTextIcon />
              {t('service.assistant.draftTitle')}
              <Badge variant='secondary'>
                {t('service.assistant.draftBadge')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <p className='text-sm text-muted-foreground'>
              {t('service.assistant.draftHint')}
            </p>
            <Textarea
              rows={5}
              value={draft.text}
              placeholder={t('service.assistant.draftTitle')}
              onChange={(event) => {
                setDraft({
                  text: event.target.value,
                  updatedAt: new Date().toISOString(),
                });
                setDraftSaved(false);
              }}
            />
            <div className='flex flex-wrap items-center justify-end gap-2'>
              {draftSaved ? (
                <span className='mr-auto text-xs text-muted-foreground'>
                  {t('service.assistant.draftSaved')}
                </span>
              ) : null}
              <Button variant='ghost' onClick={cancelDraft}>
                {t('service.action.cancel')}
              </Button>
              <Button onClick={saveDraft} disabled={!draft.text.trim()}>
                {t('service.assistant.saveDraft')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className='text-xs text-muted-foreground'>
        {t('service.assistant.footnote')}
      </p>
    </PageContainer>
  );
}
