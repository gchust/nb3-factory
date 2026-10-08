import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { SendIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

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
import { AssistantDraftPanel } from '@/pages/service/assistant-draft.js';
import { CitationList } from '@/pages/service/citation-list.js';
import {
  ErrorState,
  LoadingState,
  SelectField,
} from '@/pages/service/shared.js';
import {
  useActionFeedback,
  useServiceList,
  useServiceObject,
} from '@/pages/service/service-api.js';
import type {
  AssistantAnswer,
  AssistantStatus,
  AssistantTurn,
} from '@/pages/service/types.js';

export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const feedback = useActionFeedback();
  const status = useServiceObject<AssistantStatus>('service/assistant/status');
  const conversation = useServiceList<AssistantTurn>(
    'service/assistant/conversation',
    undefined,
    '',
  );
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  // The draft targets the work order the answer cites. When several are cited
  // the reader picks one; the server still enforces who may write to it.
  const [draftTicketId, setDraftTicketId] = useState('');
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [answerSeq, setAnswerSeq] = useState(0);

  const ticketCitations = (answer?.citations ?? []).filter(
    (citation) => citation.type === 'ticket',
  );

  const ask = async (): Promise<void> => {
    const text = question.trim();
    if (text === '') return;
    setBusy(true);
    try {
      // `api.request` resolves to the whole body: the answer is under `data`.
      // Reading `result.notes` / `result.citations` off the envelope is a
      // `undefined.map` crash.
      const { data } = await api.request<{ data: AssistantAnswer }>({
        path: 'service/assistant/query',
        method: 'POST',
        json: { question: text },
      });
      setAnswer(data);
      setDraftTicketId('');
      setSavedDraft(null);
      setAnswerSeq((value) => value + 1);
      setQuestion('');
      conversation.reload();
    } catch (askError) {
      feedback.failure(askError);
    } finally {
      setBusy(false);
    }
  };

  // The draft is persisted only after the reader explicitly confirms it, and
  // through the same ticket endpoint the detail page uses.
  const saveDraft = async (draft: string): Promise<void> => {
    const target = Number(draftTicketId || (ticketCitations[0]?.id ?? 0));
    if (!target) {
      throw new Error(t('service.assistant.saveBlockedNoTicket'));
    }
    await api.request({
      path: `service/tickets/${target}/assistant-draft`,
      method: 'POST',
      json: { draft },
    });
    setSavedDraft(draft);
  };

  const clearConversation = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.request({
        path: 'service/assistant/conversation',
        method: 'DELETE',
      });
      setAnswer(null);
      feedback.success(t('service.assistant.cleared'));
      conversation.reload();
    } catch (clearError) {
      feedback.failure(clearError);
    } finally {
      setBusy(false);
    }
  };

  const turns = conversation.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
        actions={
          turns.length > 0 ? (
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void clearConversation()}
            >
              {t('service.assistant.clear')}
            </Button>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.assistant.availability')}
          </CardTitle>
          <CardDescription>
            {status.data?.generativeAnswer
              ? t('service.assistant.modeHybrid')
              : t('service.assistant.modeRetrieval')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          {status.loading ? <LoadingState /> : null}
          {status.error ? (
            <ErrorState error={status.error} onRetry={status.reload} />
          ) : null}
          {status.data ? (
            <ul className='grid gap-1 sm:grid-cols-2'>
              {(
                [
                  ['llmService', status.data.llmService],
                  ['vectorDatabase', status.data.vectorDatabase],
                  ['embeddingModel', status.data.embeddingModel],
                  ['knowledgeBase', status.data.knowledgeBase],
                ] as const
              ).map(([key, value]) => (
                <li key={key} className='flex items-center gap-2'>
                  <Badge variant={value ? 'default' : 'outline'}>
                    {value
                      ? t('service.common.available')
                      : t('service.common.unavailable')}
                  </Badge>
                  <span className='text-muted-foreground'>
                    {t(`service.assistant.capability.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {status.data && status.data.missing.length > 0 ? (
            <div className='rounded-md border border-dashed p-3 text-xs text-muted-foreground'>
              <p className='font-medium'>
                {t('service.assistant.missingTitle')}
              </p>
              <ul className='mt-1 list-disc pl-5'>
                {status.data.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.assistant.ask')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <form
            className='flex gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <Input
              value={question}
              placeholder={t('service.assistant.placeholder')}
              aria-label={t('service.assistant.ask')}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Button type='submit' disabled={busy || question.trim() === ''}>
              <SendIcon data-icon='inline-start' />
              {t('service.assistant.send')}
            </Button>
          </form>

          {answer ? (
            <div className='space-y-3 rounded-lg border p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant={answer.generated ? 'default' : 'outline'}>
                  {t(`service.assistant.mode.${answer.mode}`)}
                </Badge>
                {answer.notes.map((note) => (
                  <span key={note} className='text-xs text-muted-foreground'>
                    {note}
                  </span>
                ))}
              </div>
              <p className='whitespace-pre-wrap text-sm'>{answer.answer}</p>
              <CitationList citations={answer.citations} />
              <div>
                <p className='text-sm font-medium'>
                  {t('service.assistant.draft')}
                </p>
                {ticketCitations.length > 1 ? (
                  <div className='mt-2 grid gap-2'>
                    <SelectField
                      id='assistant-draft-ticket'
                      value={draftTicketId || String(ticketCitations[0].id)}
                      onValueChange={setDraftTicketId}
                      options={ticketCitations.map((citation) => ({
                        value: String(citation.id),
                        label: citation.title,
                      }))}
                    />
                  </div>
                ) : null}
                <div className='mt-2'>
                  <AssistantDraftPanel
                    key={answerSeq}
                    suggestion={answer.resolutionNoteDraft}
                    savedDraft={savedDraft}
                    canSave={ticketCitations.length > 0}
                    saveBlockedReason={t(
                      'service.assistant.saveBlockedNoTicket',
                    )}
                    onSave={saveDraft}
                  />
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  nativeButton={false}
                  className='mt-2'
                  render={<Link to='/service/tickets' />}
                >
                  {t('service.assistant.openTicket')}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {conversation.error ? (
        <ErrorState error={conversation.error} onRetry={conversation.reload} />
      ) : null}
      {turns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('service.assistant.history')}
            </CardTitle>
            <CardDescription>
              {t('service.assistant.historyHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === 'user'
                    ? 'rounded-lg bg-muted p-3'
                    : 'rounded-lg border p-3'
                }
              >
                <p className='mb-1 text-xs font-medium text-muted-foreground'>
                  {turn.role === 'user'
                    ? t('service.assistant.you')
                    : t('service.assistant.bot')}
                </p>
                <p className='whitespace-pre-wrap text-sm'>{turn.content}</p>
                <CitationList citations={turn.citations} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  );
}
