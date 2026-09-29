import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bot, MessageSquarePlus, Send, Sparkles, User } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import { errorMessage, useAsync } from '@/service/ui.js';
import type { AssistantAnswer, AssistantReference } from '@/service/types.js';

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly status?: AssistantAnswer['status'];
  readonly references?: readonly AssistantReference[];
  readonly proposedAction?: AssistantAnswer['proposedAction'];
  readonly orderNo?: string;
}

export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isObserver } = useSession();
  const conversations = useAsync(() => api.listConversations(), []);
  const devices = useAsync(() => api.listDevices(), []);

  const [conversationId, setConversationId] = useState<number>();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDevice, setConfirmDevice] = useState('');

  const persist = async (
    id: number | undefined,
    title: string,
    next: readonly ChatMessage[],
  ): Promise<number | undefined> => {
    try {
      const record = await api.saveConversation(id, title, next);
      return record.id;
    } catch {
      return id;
    }
  };

  const openConversation = (id: number): void => {
    const found = conversations.data?.find((row) => row.id === id);
    if (!found) {
      return;
    }
    setConversationId(found.id);
    const stored = Array.isArray(found.messages)
      ? (found.messages as ChatMessage[])
      : [];
    // A conversation stored before messages carried an id gets one now, so the
    // list always has a stable key to render against.
    setMessages(
      stored.map((message) => ({
        ...message,
        id: message.id ?? crypto.randomUUID(),
      })),
    );
  };

  const send = async (): Promise<void> => {
    const prompt = question.trim();
    if (!prompt) {
      return;
    }
    setBusy(true);
    setQuestion('');
    const withUser: ChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: 'user', content: prompt },
    ];
    setMessages(withUser);
    try {
      const answer = await api.askAssistant(prompt);
      const next: ChatMessage[] = [
        ...withUser,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: answer.answer,
          status: answer.status,
          references: answer.references,
          proposedAction: answer.proposedAction,
        },
      ];
      setMessages(next);
      const title =
        messages.length === 0 ? prompt.slice(0, 60) : '服务助手会话';
      const id = await persist(conversationId, title, next);
      if (id) {
        setConversationId(id);
      }
      conversations.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (index: number): Promise<void> => {
    const message = messages[index];
    if (!message?.proposedAction || !confirmDevice) {
      return;
    }
    try {
      const order = await api.confirmAssistant({
        title: message.proposedAction.title,
        priority: message.proposedAction.priority,
        deviceId: Number(confirmDevice),
        idempotencyKey: crypto.randomUUID(),
      });
      const next = messages.map((item, position) =>
        position === index
          ? { ...item, orderNo: order.orderNo, proposedAction: undefined }
          : item,
      );
      setMessages(next);
      setConfirmDevice('');
      toaster.show({
        type: 'success',
        title: t('service.assistant.created', { orderNo: order.orderNo }),
      });
      void persist(conversationId, '服务助手会话', next);
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    }
  };

  const startNew = (): void => {
    setConversationId(undefined);
    setMessages([]);
    setQuestion('');
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
        actions={
          <Button variant='outline' onClick={startNew}>
            <MessageSquarePlus />
            {t('service.assistant.newConversation')}
          </Button>
        }
      />

      <div className='grid gap-6 lg:grid-cols-4'>
        <Card className='lg:col-span-1'>
          <CardContent className='space-y-2 pt-6'>
            <p className='text-sm font-medium'>
              {t('service.assistant.history')}
            </p>
            {(conversations.data ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.assistant.noHistory')}
              </p>
            ) : (
              (conversations.data ?? []).map((conversation) => (
                <button
                  key={conversation.id}
                  className={
                    'block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ' +
                    (conversationId === conversation.id ? 'bg-muted' : '')
                  }
                  onClick={() => openConversation(conversation.id)}
                  type='button'
                >
                  {conversation.title || t('service.assistant.untitled')}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className='space-y-4 lg:col-span-3'>
          <Card>
            <CardContent className='space-y-4 pt-6'>
              {messages.length === 0 ? (
                <div className='flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground'>
                  <Sparkles className='size-6' />
                  <p>{t('service.assistant.emptyHint')}</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className='space-y-2'>
                    <div className='flex items-start gap-2'>
                      {message.role === 'user' ? (
                        <User className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                      ) : (
                        <Bot className='mt-0.5 size-4 shrink-0 text-primary' />
                      )}
                      <div className='min-w-0 flex-1'>
                        {message.role === 'assistant' &&
                        message.status &&
                        message.status !== 'answered' ? (
                          <p className='mb-1 text-xs font-medium text-amber-600 dark:text-amber-500'>
                            {t(`service.assistant.status.${message.status}`)}
                          </p>
                        ) : null}
                        <p className='text-sm whitespace-pre-wrap'>
                          {message.content}
                        </p>
                        {message.references && message.references.length > 0 ? (
                          <ul className='mt-2 space-y-1'>
                            {message.references.map((reference) => (
                              <li
                                key={`${reference.type}-${reference.id}`}
                                className='rounded-md border border-border px-2 py-1 text-xs text-muted-foreground'
                              >
                                <span className='font-medium'>
                                  [
                                  {t(`service.assistant.ref.${reference.type}`)}
                                  ]
                                </span>{' '}
                                {reference.title}
                                {reference.detail
                                  ? ` — ${reference.detail}`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {message.proposedAction ? (
                          <div className='mt-3 space-y-2 rounded-md border border-dashed border-border p-3'>
                            <p className='text-sm font-medium'>
                              {t('service.assistant.proposed')}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              {t('service.assistant.proposedHint')}
                            </p>
                            <div className='grid gap-2 sm:max-w-xs'>
                              <Label>
                                {t('service.assistant.confirmDevice')}
                              </Label>
                              <Select
                                items={(devices.data ?? []).map((device) => ({
                                  value: String(device.id),
                                  label: `${device.serialNumber} · ${device.name}`,
                                }))}
                                value={confirmDevice}
                                onValueChange={(next) =>
                                  setConfirmDevice(next ?? '')
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      'service.workOrders.selectDevice',
                                    )}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {(devices.data ?? []).map((device) => (
                                    <SelectItem
                                      key={device.id}
                                      value={String(device.id)}
                                    >
                                      {device.serialNumber} · {device.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                disabled={!confirmDevice || isObserver}
                                onClick={() =>
                                  void confirm(messages.indexOf(message))
                                }
                              >
                                {t('service.assistant.confirmCreate')}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {message.orderNo ? (
                          <p className='mt-2 text-xs text-muted-foreground'>
                            {t('service.assistant.created', {
                              orderNo: message.orderNo,
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className='space-y-2'>
            <Textarea
              placeholder={t('service.assistant.placeholder')}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  void send();
                }
              }}
            />
            <div className='flex items-center justify-between'>
              <p className='text-xs text-muted-foreground'>
                {t('service.assistant.readonlyHint')}
              </p>
              <Button
                onClick={() => void send()}
                disabled={busy || !question.trim()}
              >
                <Send />
                {t('service.assistant.send')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
