import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  BookOpenIcon,
  FileTextIcon,
  SendIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import {
  askAssistant,
  fetchAssistantMessages,
  type AssistantCitation,
  type AssistantMessage,
} from '../api.js';

/**
 * The service assistant: answers from the knowledge articles, device manuals
 * and the tickets the signed-in user may read, and cites each source. It never
 * writes anything — a draft is only a suggestion the user carries into a
 * ticket's process note. Every exchange is persisted so a refresh restores the
 * conversation.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    key: string;
    messages?: AssistantMessage[];
    failed?: boolean;
  }>();

  const requestKey = String(reload);
  useEffect(() => {
    const controller = new AbortController();
    fetchAssistantMessages(api, { limit: 50 }).then(
      (list) => {
        if (!controller.signal.aborted) {
          setState({ key: String(reload), messages: list });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setState({ key: String(reload), failed: true });
        }
      },
    );
    return () => controller.abort();
  }, [api, reload]);

  const messages = state?.key === requestKey ? state.messages : undefined;
  const loadError = state?.key === requestKey && state.failed === true;

  async function ask(): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await askAssistant(api, trimmed);
      setQuestion('');
      setReload((count) => count + 1);
    } catch {
      toaster.show({ type: 'error', title: t('service.assistant.failed') });
    } finally {
      setBusy(false);
    }
  }

  const iconFor: Record<AssistantCitation['sourceType'], ReactElement> = {
    ticket: <WrenchIcon className='size-4' />,
    knowledge: <FileTextIcon className='size-4' />,
    manual: <BookOpenIcon className='size-4' />,
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <SparklesIcon className='size-4' />{' '}
            {t('service.assistant.askTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className='flex gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t('service.assistant.placeholder')}
            />
            <Button type='submit' disabled={busy || !question.trim()}>
              <SendIcon />
              {t('service.assistant.ask')}
            </Button>
          </form>
          <p className='mt-2 text-xs text-muted-foreground'>
            {t('service.assistant.scopeHint')}
          </p>
        </CardContent>
      </Card>

      {loadError ? (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            {t('service.error.requestFailed')}
          </CardContent>
        </Card>
      ) : null}

      {messages?.length ? (
        <div className='space-y-4'>
          {messages.map((message) => (
            <Card key={message.id}>
              <CardHeader>
                <CardTitle className='text-sm'>{message.question}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <p className='whitespace-pre-wrap text-sm'>{message.answer}</p>
                {message.modelAvailable ? null : (
                  <p className='text-xs text-muted-foreground'>
                    {t('service.assistant.localMode')}
                  </p>
                )}
                <div>
                  <p className='mb-2 text-xs font-medium text-muted-foreground'>
                    {t('service.assistant.citations')}
                  </p>
                  <ul className='space-y-2'>
                    {message.citations.map((citation) => (
                      <li
                        key={`${citation.sourceType}:${citation.reference}`}
                        className='rounded-md border p-3 text-sm'
                      >
                        <p className='flex items-center gap-2 font-medium'>
                          {iconFor[citation.sourceType]}
                          {citation.title}
                        </p>
                        <p className='mt-1 text-muted-foreground'>
                          {citation.excerpt}
                        </p>
                      </li>
                    ))}
                    {!message.citations.length ? (
                      <li className='text-sm text-muted-foreground'>
                        {t('service.assistant.noCitations')}
                      </li>
                    ) : null}
                  </ul>
                </div>
                <div className='rounded-md bg-muted/50 p-3'>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.assistant.draftHint')}
                  </p>
                  <p className='mt-1 whitespace-pre-wrap text-sm'>
                    {message.draft}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </PageContainer>
  );
}
