import { useTranslation } from '@nocobase/i18n/client';
import { Bot, Plus, Send, User } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { formatDateTime } from './lib/format.js';
import type { AssistantConversation, AssistantDetail } from './lib/types.js';
import { useServiceClient } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

export default function ServiceAssistantPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const [selectedId, setSelectedId] = useState<number>();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const conversations = useServiceQuery(
    () => client.listConversations(),
    'assistant-conversations',
  );
  // The active conversation is the one the user picked, or the newest one until
  // they pick. Deriving it removes the effect that used to seed the state.
  const conversationId = selectedId ?? conversations.data?.[0]?.id;
  const detail = useServiceQuery<AssistantDetail | undefined>(
    () =>
      conversationId
        ? client.conversation(conversationId)
        : Promise.resolve(undefined),
    `assistant-conversation:${conversationId ?? 'none'}`,
  );

  const startConversation = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const conversation: AssistantConversation =
        await client.createConversation();
      setSelectedId(conversation.id);
      conversations.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    let target = conversationId;
    setBusy(true);
    setError(undefined);
    try {
      if (!target) {
        const conversation = await client.createConversation();
        target = conversation.id;
        setSelectedId(target);
        conversations.reload();
      }
      await client.ask(target, question.trim());
      setQuestion('');
      detail.reload();
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
          <Button
            disabled={busy}
            onClick={() => void startConversation()}
            variant='outline'
          >
            <Plus aria-hidden='true' />
            {t('service.assistant.newConversation')}
          </Button>
        }
        description={t('service.assistant.description')}
        title={t('service.assistant.title')}
      />
      <div className='grid gap-6 lg:grid-cols-[18rem_1fr]'>
        <Card className='py-0'>
          <CardHeader className='border-b border-border px-4 py-3'>
            <CardTitle className='text-sm'>
              {t('service.assistant.conversations')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-1 p-2'>
            {conversations.data?.length ? (
              conversations.data.map((conversation) => (
                <button
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                    conversation.id === conversationId &&
                      'bg-muted font-medium',
                  )}
                  key={conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                  type='button'
                >
                  {conversation.title}
                  <span className='mt-0.5 block text-xs text-muted-foreground'>
                    {formatDateTime(conversation.updatedAt)}
                  </span>
                </button>
              ))
            ) : (
              <p className='p-3 text-sm text-muted-foreground'>
                {t('service.assistant.noConversations')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className='flex min-h-96 flex-col py-0'>
          <CardContent className='flex flex-1 flex-col gap-4 overflow-y-auto p-4'>
            {detail.loading && !detail.data ? <LoadingState /> : null}
            {detail.error ? (
              <ErrorState error={detail.error} onRetry={detail.reload} />
            ) : null}
            {detail.data ? (
              detail.data.messages.length ? (
                detail.data.messages.map((message) => (
                  <div
                    className={cn(
                      'flex max-w-[85%] gap-2',
                      message.role === 'user' && 'ml-auto flex-row-reverse',
                    )}
                    key={message.id}
                  >
                    <span className='mt-1 text-muted-foreground'>
                      {message.role === 'user' ? (
                        <User aria-hidden='true' className='size-4' />
                      ) : (
                        <Bot aria-hidden='true' className='size-4' />
                      )}
                    </span>
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  message={t('service.assistant.emptyConversation')}
                />
              )
            ) : null}
          </CardContent>
          <div className='border-t border-border p-3'>
            {error ? (
              <p className='mb-2 text-sm text-destructive'>{error}</p>
            ) : null}
            <div className='flex gap-2'>
              <Input
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                placeholder={t('service.assistant.placeholder')}
                value={question}
              />
              <Button
                disabled={busy || !question.trim()}
                onClick={() => void ask()}
              >
                <Send aria-hidden='true' />
                {t('service.assistant.send')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
