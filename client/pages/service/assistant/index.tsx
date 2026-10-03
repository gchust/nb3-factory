import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bot, BookOpen, Cpu, Send, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  useServiceApi,
  type AssistantCitation,
  type AssistantMessage,
  type AssistantStatus,
} from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import { EmptyBlock, ErrorBlock, LoadingBlock } from '../shared.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The service assistant.
 *
 * The chat is a retrieval surface over the business records the signed-in user
 * may already see. Every answer cites the orders, repair knowledge and device
 * manuals it used, states whether an LLM service is configured, and refuses to
 * produce a resolution when nothing matches. The conversation is persisted, so
 * a refresh restores it, and a draft is only written to an order after an
 * explicit confirmation.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [searchParams] = useSearchParams();
  const rawOrderId = searchParams.get('orderId');
  const orderId =
    rawOrderId && Number.isFinite(Number(rawOrderId))
      ? Number(rawOrderId)
      : undefined;

  const status = useAsync(() => api.assistantStatus(), [api]);
  const history = useAsync(
    () => api.assistantMessages(orderId),
    [api, orderId],
  );
  const order = useAsync(
    () => (orderId === undefined ? Promise.resolve(undefined) : api.order(orderId)),
    [api, orderId],
  );

  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toaster = useToaster();

  useEffect(() => {
    if (history.data) {
      setMessages(history.data);
    }
  }, [history.data]);

  const latestDraft = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'assistant' && message.payload?.draft) {
        return message.payload.draft;
      }
    }
    return '';
  }, [messages]);

  useEffect(() => {
    setDraft(latestDraft);
  }, [latestDraft]);

  async function send(): Promise<void> {
    const value = question.trim();
    if (value === '' || sending) {
      return;
    }
    setSending(true);
    try {
      const reply = await api.askAssistant(value, orderId);
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now(),
          role: 'user',
          content: value,
          payload: null,
          degraded: false,
          orderId: orderId ?? null,
          createdAt: reply.createdAt,
        },
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: reply.answer,
          payload: reply,
          degraded: reply.degraded,
          orderId: orderId ?? null,
          createdAt: reply.createdAt,
        },
      ]);
      setQuestion('');
      history.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.assistant.askFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  async function saveDraft(): Promise<void> {
    if (!orderId) {
      return;
    }
    setBusy(true);
    try {
      await api.transition(orderId, 'submit', draft.trim());
      toaster.show({
        type: 'success',
        title: t('service.assistant.draftSaved'),
      });
      setConfirmOpen(false);
      order.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.assistant.draftSaveFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const canSaveDraft =
    orderId !== undefined &&
    order.data?.can.process === true &&
    order.data?.status === 'processing' &&
    draft.trim() !== '';

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
        actions={
          <Button
            size='sm'
            variant='outline'
            render={<Link to='/settings/ai' />}
          >
            {t('service.assistant.configure')}
          </Button>
        }
      />
      {status.error ? (
        <ErrorBlock error={status.error} onRetry={status.reload} />
      ) : !status.data ? (
        <LoadingBlock />
      ) : (
        <div className='grid gap-6 lg:grid-cols-3'>
          <div className='space-y-6 lg:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Sparkles className='size-4' />
                  {t('service.assistant.chatTitle')}
                  {orderId !== undefined && order.data ? (
                    <Badge variant='outline' className='ml-auto'>
                      {order.data.orderNo}
                    </Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div
                  className='max-h-[420px] space-y-3 overflow-y-auto pr-1'
                  data-testid='assistant-messages'
                >
                  {messages.length === 0 ? (
                    <EmptyBlock
                      description={t('service.assistant.emptyChat')}
                    />
                  ) : (
                    messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        t={t}
                      />
                    ))
                  )}
                  {sending ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('service.assistant.thinking')}
                    </p>
                  ) : null}
                </div>
                <Separator />
                <div className='space-y-2'>
                  <Textarea
                    rows={3}
                    value={question}
                    placeholder={t('service.assistant.questionPlaceholder')}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className='flex justify-end'>
                    <Button
                      size='sm'
                      disabled={sending || question.trim() === ''}
                      onClick={() => void send()}
                    >
                      <Send />
                      {t('service.assistant.send')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid='assistant-draft'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Wrench className='size-4' />
                  {t('service.assistant.draftTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  {t('service.assistant.draftHint')}
                </p>
                {latestDraft === '' ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.assistant.draftEmpty')}
                  </p>
                ) : (
                  <>
                    <Textarea
                      rows={8}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <div className='flex flex-wrap items-center justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setDraft(latestDraft)}
                      >
                        {t('service.assistant.draftReset')}
                      </Button>
                      {orderId !== undefined ? (
                        <Button
                          size='sm'
                          disabled={!canSaveDraft}
                          onClick={() => setConfirmOpen(true)}
                        >
                          {t('service.assistant.saveDraft')}
                        </Button>
                      ) : null}
                    </div>
                    {orderId !== undefined && !canSaveDraft ? (
                      <p className='text-right text-xs text-muted-foreground'>
                        {t('service.assistant.draftNotWritable')}
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className='space-y-6'>
            <StatusPanel status={status.data} t={t} />
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('service.assistant.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('service.assistant.confirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <pre className='max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm'>
            {draft}
          </pre>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setConfirmOpen(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button
              type='button'
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function MessageBubble({
  message,
  t,
}: {
  message: AssistantMessage;
  t: Translate;
}): ReactElement {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
            : 'max-w-[90%] space-y-2 rounded-lg border bg-card px-3 py-2 text-sm'
        }
      >
        <p className='whitespace-pre-wrap'>{message.content}</p>
        {!isUser && message.payload ? (
          <>
            {message.payload.reason ? (
              <p className='text-xs text-muted-foreground'>
                {message.payload.degraded
                  ? t('service.assistant.degradedNotice')
                  : t('service.assistant.retrievalNotice')}
                ：{message.payload.reason}
              </p>
            ) : null}
            {message.payload.citations.length > 0 ? (
              <ul className='space-y-1'>
                {message.payload.citations.map((citation) => (
                  <CitationRow
                    key={`${citation.kind}-${citation.id}`}
                    citation={citation}
                  />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function CitationRow({
  citation,
}: {
  citation: AssistantCitation;
}): ReactElement {
  const content = (
    <span className='flex items-center gap-2 text-xs text-muted-foreground'>
      <Badge variant='secondary'>{citation.kind}</Badge>
      <span className='truncate'>{citation.title}</span>
      {citation.subtitle ? (
        <span className='shrink-0'>· {citation.subtitle}</span>
      ) : null}
    </span>
  );
  return (
    <li>
      {citation.href ? <Link to={citation.href}>{content}</Link> : content}
    </li>
  );
}

function StatusPanel({
  status,
  t,
}: {
  status: AssistantStatus;
  t: Translate;
}): ReactElement {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Cpu className='size-4' />
            {t('service.assistant.models')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          {status.llmServices.length === 0 ? (
            <p className='text-muted-foreground'>
              {t('service.assistant.noModels')}
            </p>
          ) : (
            status.llmServices.map((service) => (
              <div
                key={service.name}
                className='flex items-center justify-between gap-2'
              >
                <span>
                  {service.title}
                  {service.provider ? (
                    <span className='text-muted-foreground'>
                      {' '}
                      · {service.provider}
                    </span>
                  ) : null}
                </span>
                <Badge variant={service.enabled ? 'default' : 'secondary'}>
                  {service.enabled
                    ? t('service.assistant.enabled')
                    : t('service.assistant.disabled')}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Bot className='size-4' />
            {t('service.assistant.employees')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          {status.employees.length === 0 ? (
            <p className='text-muted-foreground'>
              {t('service.assistant.noEmployees')}
            </p>
          ) : (
            status.employees.map((employee) => (
              <div key={employee.username} className='space-y-1'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>
                    {employee.nickname || employee.username}
                  </span>
                  <Badge variant={employee.enabled ? 'default' : 'secondary'}>
                    {employee.enabled
                      ? t('service.assistant.enabled')
                      : t('service.assistant.disabled')}
                  </Badge>
                </div>
                <p className='text-muted-foreground'>
                  {employee.position || employee.username}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BookOpen className='size-4' />
            {t('service.assistant.knowledgeBases')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          {status.knowledgeBases.length === 0 ? (
            <p className='text-muted-foreground'>
              {t('service.assistant.noKnowledgeBases')}
            </p>
          ) : (
            status.knowledgeBases.map((base) => (
              <div key={base.key} className='space-y-1'>
                <div className='flex items-center justify-between gap-2'>
                  <span>{base.name}</span>
                  <Badge variant={base.enabled ? 'default' : 'secondary'}>
                    {base.documentCount}
                  </Badge>
                </div>
                {status.documents
                  .filter((document) => document.knowledgeBaseKey === base.key)
                  .map((document) => (
                    <p
                      key={document.id}
                      className='flex items-center justify-between gap-2 text-xs text-muted-foreground'
                    >
                      <span className='truncate'>{document.title}</span>
                      <span className='shrink-0'>
                        {document.indexStatus}
                        {document.segmentCount > 0
                          ? ` · ${document.segmentCount}`
                          : ''}
                      </span>
                    </p>
                  ))}
              </div>
            ))
          )}
          <Separator />
          <Button
            size='sm'
            variant='ghost'
            render={<Link to='/service/manuals' />}
          >
            {t('service.assistant.openManuals')}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
