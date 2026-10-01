/**
 * 资料助手 — a read-only assistant that answers from the materials the asker is
 * permitted to see and cites the material it used, so the asker can open it and
 * verify the answer.
 *
 * The page holds no knowledge of who may read what. It sends the question to the
 * server, which retrieves from the caller's authorized scope, answers, and
 * stores both sides of the exchange. Because the transcript lives on the server,
 * it survives a refresh. An answer that no material supports says the materials
 * are insufficient instead of inventing one, and when the optional model service
 * is unavailable the page says so while manual reading keeps working.
 *
 * Skeleton: `PageContainer` → `PageHeader` → a fixed-height `Card` holding a
 * `MessageScroller` thread and a composer `Textarea`.
 */
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { SendIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';

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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Message,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  askAssistant,
  clearMessages,
  fetchAssistantStatus,
  fetchMessages,
  type AssistantAnswer,
  type AssistantMessage,
} from '@/lib/materials-api';

interface PendingTurn {
  question: string;
  createdAt: string;
}

export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [notice, setNotice] = useState<AssistantAnswer['notice']>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [draft, setDraft] = useState('');
  const [historyKey, setHistoryKey] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** A turn's text: the assistant's own words, or a localized statement of why it has none. */
  const turnBody = useCallback(
    (message: AssistantMessage): string => {
      if (message.content) return message.content;
      if (message.role !== 'assistant') return '';
      if (message.outcome === 'insufficient')
        return t('assistant.insufficient');
      if (message.outcome === 'denied') return t('assistant.denied');
      return '';
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      const [history, configured] = await Promise.all([
        fetchMessages(api),
        fetchAssistantStatus(api),
      ]);
      setMessages(history);
      setNotice((current) =>
        configured ? current : (current ?? 'ai-not-configured'),
      );
    } catch {
      toaster.show({ type: 'error', title: t('assistant.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [api, t, toaster]);

  // The first load runs here rather than through the shared `load` callback so
  // state is only set from an async callback, never synchronously in render.
  useEffect(() => {
    let active = true;
    void Promise.all([fetchMessages(api), fetchAssistantStatus(api)])
      .then(([history, configured]) => {
        if (!active) return;
        setMessages(history);
        setNotice((current) =>
          configured ? current : (current ?? 'ai-not-configured'),
        );
      })
      .catch(() => {
        if (active) {
          toaster.show({ type: 'error', title: t('assistant.loadFailed') });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, t, toaster]);

  const submit = useCallback(async () => {
    const question = draft.trim();
    if (!question || asking) return;
    setDraft('');
    setAsking(true);
    setPending({ question, createdAt: new Date().toISOString() });
    try {
      const answer = await askAssistant(api, question);
      // Keep the configuration hint the status check already reported: an
      // answer with no notice (insufficient materials) must not clear it.
      setNotice((current) => answer.notice ?? current);
      if (answer.outcome === 'denied') {
        setMessages((current) => [
          ...current,
          {
            id: -2,
            role: 'assistant' as const,
            content: '',
            citations: [],
            outcome: 'denied' as const,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        await load();
      }
    } catch {
      toaster.show({ type: 'error', title: t('assistant.askFailed') });
      setDraft(question);
    } finally {
      setPending(null);
      setAsking(false);
      inputRef.current?.focus();
    }
  }, [api, asking, draft, load, t, toaster]);

  const clear = useCallback(async () => {
    try {
      await clearMessages(api);
      setMessages([]);
      setNotice(null);
      setHistoryKey((key) => key + 1);
      toaster.show({ type: 'success', title: t('assistant.cleared') });
    } catch {
      toaster.show({ type: 'error', title: t('assistant.clearFailed') });
    }
  }, [api, t, toaster]);

  const items = pending
    ? [
        ...messages,
        {
          id: -1,
          role: 'user' as const,
          content: pending.question,
          citations: [],
          outcome: null,
          createdAt: pending.createdAt,
        },
      ]
    : messages;

  return (
    <PageContainer>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
        actions={
          messages.length > 0 || pending ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant='outline'>
                    <Trash2Icon data-icon='inline-start' />
                    {t('assistant.clear')}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('assistant.clearConfirmTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('assistant.clearConfirmDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void clear()}>
                    {t('actions.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null
        }
      />

      {notice ? (
        <Alert>
          <AlertTitle>{t('assistant.noticeTitle')}</AlertTitle>
          <AlertDescription>
            {notice === 'ai-unavailable'
              ? t('assistant.noticeUnavailable')
              : t('assistant.noticeNotConfigured')}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className='flex h-[calc(100svh-18rem)] min-h-96 flex-col overflow-hidden'>
        <CardContent className='flex min-h-0 flex-1 flex-col p-0'>
          {loading ? (
            <div className='flex flex-1 items-center justify-center'>
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className='flex flex-1 items-center justify-center p-6'>
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t('assistant.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>
                    {t('assistant.emptyDescription')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <MessageScrollerProvider key={historyKey}>
              <div className='min-h-0 flex-1'>
                <MessageScroller className='h-full'>
                  <MessageScrollerViewport
                    aria-label={t('assistant.threadLabel')}
                  >
                    <MessageScrollerContent className='gap-4 p-4'>
                      {items.map((message) => (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={String(message.id)}
                          scrollAnchor={message.role === 'user'}
                        >
                          <Message
                            align={message.role === 'user' ? 'end' : 'start'}
                          >
                            <MessageContent>
                              <Bubble
                                variant={
                                  message.role === 'user' ? 'default' : 'muted'
                                }
                              >
                                <BubbleContent className='whitespace-pre-line'>
                                  {turnBody(message)}
                                </BubbleContent>
                              </Bubble>
                              {message.role === 'assistant' &&
                              message.citations.length > 0 ? (
                                <MessageFooter className='flex flex-wrap items-center gap-1.5'>
                                  <span className='text-xs text-muted-foreground'>
                                    {t('assistant.citations')}
                                  </span>
                                  {message.citations.map((citation) => (
                                    <Badge
                                      key={citation.id}
                                      variant='secondary'
                                      render={
                                        <Link
                                          to={`/materials?id=${citation.id}`}
                                        />
                                      }
                                    >
                                      {citation.title}
                                    </Badge>
                                  ))}
                                </MessageFooter>
                              ) : null}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      ))}
                      {asking && pending ? (
                        <MessageScrollerItem messageId='pending' scrollAnchor>
                          <Message align='start'>
                            <MessageContent>
                              <Bubble variant='muted'>
                                <BubbleContent className='flex items-center gap-2 text-muted-foreground'>
                                  <SparklesIcon className='size-4' />
                                  {t('assistant.thinking')}
                                </BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      ) : null}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton
                    aria-label={t('assistant.scrollToLatest')}
                  />
                </MessageScroller>
              </div>
            </MessageScrollerProvider>
          )}

          <div className='shrink-0 border-t p-3'>
            <div className='flex items-end gap-2'>
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={t('assistant.composerPlaceholder')}
                aria-label={t('assistant.composerLabel')}
                rows={2}
                className='resize-none'
              />
              <Button
                disabled={asking || draft.trim() === ''}
                onClick={() => void submit()}
              >
                {asking ? (
                  <Spinner data-icon='inline-start' />
                ) : (
                  <SendIcon data-icon='inline-start' />
                )}
                {asking ? t('assistant.asking') : t('assistant.ask')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
