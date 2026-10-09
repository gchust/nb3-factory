import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Trash2Icon, UploadIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
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
import { RouteChildPage } from '@/components/route-child-page';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { AssistantDraftPanel } from '@/pages/service/assistant-draft.js';
import { CitationList } from '@/pages/service/citation-list.js';
import {
  ErrorState,
  LoadingState,
  SelectField,
  StatusBadge,
} from '@/pages/service/shared.js';
import {
  PRIORITIES,
  attachmentUrl,
  formatDateTime,
  uploadAttachment,
  useActionFeedback,
  useServiceList,
  useServiceMe,
  useServiceObject,
  validateAttachmentFile,
} from '@/pages/service/service-api.js';
import type {
  AssistantAnswer,
  Attachment,
  EngineerOption,
  TicketDetail,
} from '@/pages/service/types.js';

const PHOTO_TYPES = '.png';
const REPORT_TYPES = '.docx';

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const id = params.ticketId ?? '';
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const detail = useServiceObject<TicketDetail>(`service/tickets/${id}`);
  const engineers = useServiceList<EngineerOption>(
    'service/engineers',
    undefined,
    '',
  );

  const [ownerId, setOwnerId] = useState('');
  // The supervisor may override the priority while accepting, but the
  // override belongs to the ticket it was made on. Keeping the ticket id with
  // the value and deriving the effective priority means switching to another
  // ticket falls back to that ticket's own priority without an effect that
  // sets state on every reload. The original bug was a hard-coded `normal`
  // default that silently downgraded an urgent ticket on accept.
  const [priorityEdit, setPriorityEdit] = useState<{
    readonly ticketId: string;
    readonly priority: string;
  } | null>(null);
  const [refuseReason, setRefuseReason] = useState('');
  const [resultText, setResultText] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [reason, setReason] = useState('');
  const [shareId, setShareId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [category, setCategory] = useState('photo');
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] =
    useState<AssistantAnswer | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);

  const ticket = detail.data?.ticket;
  const ticketPriority = ticket?.priority;
  const acceptPriority =
    priorityEdit?.ticketId === id
      ? priorityEdit.priority
      : (ticketPriority ?? 'normal');
  const supervisor = me?.supervisor ?? false;
  const isOwner = Boolean(ticket && me && ticket.ownerId === me.id);
  const canEditAttachments = isOwner || supervisor;
  // A read-only observer sees the ticket summary only; the handling log, the
  // share list and the repair attachments are internal records and stay hidden.
  const internal = detail.data?.access !== 'summary';

  const engineerOptions = [
    { value: '', label: t('service.tickets.selectEngineer') },
    ...(engineers.data ?? []).map((engineer) => ({
      value: engineer.id,
      label: engineer.name,
    })),
  ];

  const act = async (
    path: string,
    method: 'POST' | 'DELETE',
    json: unknown,
    success: string,
  ): Promise<void> => {
    setBusy(true);
    try {
      await api.request({ path, method, json });
      feedback.success(success);
      detail.reload();
    } catch (actionError) {
      feedback.failure(actionError);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File): Promise<void> => {
    setProgress(0);
    try {
      await validateAttachmentFile(file);
      const uploaded = await uploadAttachment(file, setProgress);
      await api.request({
        path: `service/tickets/${id}/attachments`,
        method: 'POST',
        json: { fileId: uploaded.id, category },
      });
      feedback.success(
        t('service.attachments.uploaded', { name: uploaded.filename }),
      );
      detail.reload();
    } catch (uploadError) {
      feedback.failure(uploadError);
    } finally {
      // The picker keeps the chosen file. Clearing it here (or before the
      // asynchronous byte read) would both lose a choice that failed validation
      // and make an observer see an empty picker even after a real upload. The
      // picker is cleared on click instead, which is when a retry starts.
      setProgress(null);
    }
  };

  const removeAttachment = async (fileId: string): Promise<void> => {
    setBusy(true);
    try {
      await api.request({
        path: `service/tickets/${id}/attachments/${fileId}`,
        method: 'DELETE',
      });
      feedback.success(t('service.attachments.removed'));
      detail.reload();
    } catch (removeError) {
      feedback.failure(removeError);
    } finally {
      setBusy(false);
    }
  };

  const askAssistant = async (): Promise<void> => {
    const text = assistantQuestion.trim();
    if (text === '') return;
    setAssistantBusy(true);
    try {
      const { data } = await api.request<{ data: AssistantAnswer }>({
        path: 'service/assistant/query',
        method: 'POST',
        json: { question: text },
      });
      setAssistantAnswer(data);
    } catch (assistantError) {
      feedback.failure(assistantError);
    } finally {
      setAssistantBusy(false);
    }
  };

  // The draft save is the explicit human confirmation the assistant flow
  // requires. The panel shows its own success or failure feedback.
  const saveAssistantDraft = async (draft: string): Promise<void> => {
    await api.request({
      path: `service/tickets/${id}/assistant-draft`,
      method: 'POST',
      json: { draft },
    });
    detail.reload();
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton>{t('service.tickets.backToList')}</BackButton>
        {detail.loading ? <LoadingState /> : null}
        {detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : null}
        {ticket ? (
          <>
            <header className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-xs text-muted-foreground'>
                    {ticket.ticketNo}
                  </span>
                  <StatusBadge status={ticket.status} />
                  {ticket.confidential ? (
                    <Badge variant='outline'>
                      {t('service.tickets.confidential')}
                    </Badge>
                  ) : null}
                </div>
                <h1 className='mt-2 font-heading text-2xl font-semibold tracking-tight'>
                  {ticket.title}
                </h1>
              </div>
              <div className='text-sm text-muted-foreground'>
                <p>
                  {t('service.tickets.priority')}:{' '}
                  {t(`service.priority.${ticket.priority}`)}
                </p>
                <p>
                  {t('service.tickets.dueAt')}: {formatDateTime(ticket.dueAt)}
                </p>
              </div>
            </header>

            <div className='grid gap-6 lg:grid-cols-3'>
              <Card className='lg:col-span-2'>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('service.tickets.detail')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3 text-sm'>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('service.tickets.problem')}:{' '}
                    </span>
                    {ticket.problem ?? '—'}
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('service.tickets.result')}:{' '}
                    </span>
                    {ticket.result ?? '—'}
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('service.tickets.resolutionNote')}:{' '}
                    </span>
                    {ticket.resolutionNote ?? '—'}
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('service.tickets.customer')}:{' '}
                    </span>
                    {ticket.customerName ?? '—'}
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      {t('service.tickets.device')}:{' '}
                    </span>
                    {ticket.deviceSerial
                      ? `${ticket.deviceSerial}${ticket.deviceName ? ` · ${ticket.deviceName}` : ''}`
                      : '—'}
                  </div>
                  <div className='grid gap-x-6 gap-y-2 sm:grid-cols-2'>
                    <p>
                      <span className='text-muted-foreground'>
                        {t('service.tickets.owner')}:{' '}
                      </span>
                      {ticket.ownerName ?? ticket.ownerId ?? '—'}
                    </p>
                    <p>
                      <span className='text-muted-foreground'>
                        {t('service.tickets.source')}:{' '}
                      </span>
                      {ticket.source}
                    </p>
                    <p>
                      <span className='text-muted-foreground'>
                        {t('service.tickets.acceptedAt')}:{' '}
                      </span>
                      {formatDateTime(ticket.acceptedAt)}
                    </p>
                    <p>
                      <span className='text-muted-foreground'>
                        {t('service.tickets.closedAt')}:{' '}
                      </span>
                      {formatDateTime(ticket.closedAt)}
                    </p>
                    {ticket.rejectReason ? (
                      <p className='sm:col-span-2'>
                        <span className='text-muted-foreground'>
                          {t('service.tickets.rejectReason')}:{' '}
                        </span>
                        {ticket.rejectReason}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('service.tickets.actions')}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {supervisor && ticket.status === 'pendingAcceptance' ? (
                    <div className='space-y-3'>
                      <div className='grid gap-2'>
                        <Label htmlFor='accept-owner'>
                          {t('service.tickets.owner')}
                        </Label>
                        <SelectField
                          id='accept-owner'
                          value={ownerId}
                          onValueChange={setOwnerId}
                          options={engineerOptions}
                        />
                      </div>
                      <div className='grid gap-2'>
                        <Label htmlFor='accept-priority'>
                          {t('service.tickets.priority')}
                        </Label>
                        <SelectField
                          id='accept-priority'
                          value={acceptPriority}
                          onValueChange={(value) =>
                            setPriorityEdit({ ticketId: id, priority: value })
                          }
                          options={PRIORITIES.map((value) => ({
                            value,
                            label: t(`service.priority.${value}`),
                          }))}
                        />
                      </div>
                      <Button
                        disabled={busy || ownerId === ''}
                        onClick={() =>
                          void act(
                            `service/tickets/${id}/accept`,
                            'POST',
                            { accept: true, ownerId, priority: acceptPriority },
                            t('service.tickets.accepted'),
                          )
                        }
                      >
                        {t('service.tickets.accept')}
                      </Button>
                      <div className='grid gap-2'>
                        <Label htmlFor='refuse-reason'>
                          {t('service.tickets.refuseReason')}
                        </Label>
                        <Input
                          id='refuse-reason'
                          value={refuseReason}
                          onChange={(event) =>
                            setRefuseReason(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        variant='outline'
                        disabled={busy || refuseReason.trim() === ''}
                        onClick={() =>
                          void act(
                            `service/tickets/${id}/accept`,
                            'POST',
                            { accept: false, reason: refuseReason },
                            t('service.tickets.refused'),
                          )
                        }
                      >
                        {t('service.tickets.refuse')}
                      </Button>
                      <Separator />
                    </div>
                  ) : null}

                  {isOwner && ticket.status === 'pending' ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(
                          `service/tickets/${id}/process`,
                          'POST',
                          {},
                          t('service.tickets.processing'),
                        )
                      }
                    >
                      {t('service.tickets.start')}
                    </Button>
                  ) : null}

                  {isOwner &&
                  (ticket.status === 'processing' ||
                    ticket.status === 'pending') ? (
                    <div className='space-y-3'>
                      <div className='grid gap-2'>
                        <Label htmlFor='ticket-result'>
                          {t('service.tickets.result')}
                        </Label>
                        <Textarea
                          id='ticket-result'
                          value={resultText}
                          onChange={(event) =>
                            setResultText(event.target.value)
                          }
                        />
                      </div>
                      <div className='grid gap-2'>
                        <Label htmlFor='ticket-note'>
                          {t('service.tickets.resolutionNote')}
                        </Label>
                        <Textarea
                          id='ticket-note'
                          value={resolutionNote}
                          onChange={(event) =>
                            setResolutionNote(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        disabled={busy || resultText.trim() === ''}
                        onClick={() =>
                          void act(
                            `service/tickets/${id}/result`,
                            'POST',
                            {
                              result: resultText,
                              resolutionNote: resolutionNote || undefined,
                            },
                            t('service.tickets.resultSubmitted'),
                          )
                        }
                      >
                        {t('service.tickets.submitResult')}
                      </Button>
                    </div>
                  ) : null}

                  {internal &&
                  (isOwner || supervisor) &&
                  ticket.status !== 'closed' ? (
                    <div className='space-y-3 rounded-md border border-dashed p-3'>
                      <Label htmlFor='assistant-question'>
                        {t('service.assistant.title')}
                      </Label>
                      <p className='text-xs text-muted-foreground'>
                        {t('service.assistant.ticketHint')}
                      </p>
                      <form
                        className='flex gap-2'
                        onSubmit={(event) => {
                          event.preventDefault();
                          void askAssistant();
                        }}
                      >
                        <Input
                          id='assistant-question'
                          value={assistantQuestion}
                          placeholder={t('service.assistant.placeholder')}
                          onChange={(event) =>
                            setAssistantQuestion(event.target.value)
                          }
                        />
                        <Button
                          type='submit'
                          variant='outline'
                          disabled={
                            assistantBusy || assistantQuestion.trim() === ''
                          }
                        >
                          {t('service.assistant.send')}
                        </Button>
                      </form>
                      {assistantAnswer ? (
                        <div className='space-y-2 text-sm'>
                          <p className='whitespace-pre-wrap text-muted-foreground'>
                            {assistantAnswer.answer}
                          </p>
                          <CitationList citations={assistantAnswer.citations} />
                          <AssistantDraftPanel
                            suggestion={assistantAnswer.resolutionNoteDraft}
                            savedDraft={ticket.assistantDraft}
                            canSave={isOwner || supervisor}
                            saveBlockedReason={
                              isOwner || supervisor
                                ? undefined
                                : t('service.assistant.saveBlocked')
                            }
                            onSave={saveAssistantDraft}
                            onApplyToNote={
                              isOwner ? setResolutionNote : undefined
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {supervisor && ticket.status === 'pendingConfirmation' ? (
                    <div className='space-y-3'>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void act(
                            `service/tickets/${id}/confirm`,
                            'POST',
                            {},
                            t('service.tickets.confirmed'),
                          )
                        }
                      >
                        {t('service.tickets.confirmClose')}
                      </Button>
                      <div className='grid gap-2'>
                        <Label htmlFor='return-reason'>
                          {t('service.tickets.returnReason')}
                        </Label>
                        <Input
                          id='return-reason'
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </div>
                      <Button
                        variant='outline'
                        disabled={busy || reason.trim() === ''}
                        onClick={() =>
                          void act(
                            `service/tickets/${id}/return`,
                            'POST',
                            { reason },
                            t('service.tickets.returned'),
                          )
                        }
                      >
                        {t('service.tickets.returnToProcessing')}
                      </Button>
                    </div>
                  ) : null}

                  {supervisor && ticket.status === 'pendingAcceptance' ? (
                    <Button
                      variant='destructive'
                      disabled={busy || refuseReason.trim() === ''}
                      onClick={() =>
                        void act(
                          `service/tickets/${id}/reject`,
                          'POST',
                          { reason: refuseReason },
                          t('service.tickets.rejected'),
                        )
                      }
                    >
                      {t('service.tickets.reject')}
                    </Button>
                  ) : null}

                  {supervisor ? (
                    <div className='space-y-2 border-t pt-4'>
                      <Label>{t('service.tickets.observerVisible')}</Label>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={busy}
                        onClick={() =>
                          void act(
                            `service/tickets/${id}/visibility`,
                            'POST',
                            { observerVisible: !ticket.observerVisible },
                            t('service.tickets.visibilityUpdated'),
                          )
                        }
                      >
                        {ticket.observerVisible
                          ? t('service.common.yes')
                          : t('service.common.no')}
                      </Button>
                    </div>
                  ) : null}

                  {!isOwner && !supervisor && ticket.status !== 'closed' ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('service.tickets.readOnlyHint')}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {internal ? (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('service.attachments.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('service.attachments.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {canEditAttachments ? (
                    <div className='flex flex-wrap items-end gap-3'>
                      <div className='grid gap-2'>
                        <Label htmlFor='attachment-category'>
                          {t('service.attachments.category')}
                        </Label>
                        <SelectField
                          id='attachment-category'
                          value={category}
                          onValueChange={setCategory}
                          className='w-48'
                          options={[
                            {
                              value: 'photo',
                              label: t('service.attachments.photo'),
                            },
                            {
                              value: 'report',
                              label: t('service.attachments.report'),
                            },
                            {
                              value: 'other',
                              label: t('service.attachments.other'),
                            },
                          ]}
                        />
                      </div>
                      <div className='grid gap-2'>
                        <Label htmlFor='attachment-file'>
                          {t('service.attachments.choose')}
                        </Label>
                        <Input
                          id='attachment-file'
                          type='file'
                          accept={
                            category === 'photo' ? PHOTO_TYPES : REPORT_TYPES
                          }
                          disabled={progress !== null}
                          // Clear the picker when it opens instead of when a
                          // choice is made: validation reads the bytes
                          // asynchronously, and clearing the input first can
                          // null the read. Clearing on click still lets the
                          // same file be chosen again after a failure.
                          onClick={(event) => {
                            event.currentTarget.value = '';
                          }}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void upload(file);
                          }}
                        />
                      </div>
                      {progress !== null ? (
                        <div className='w-40 pb-2'>
                          <div className='h-2 w-full overflow-hidden rounded bg-muted'>
                            <div
                              className='h-full bg-primary transition-[width]'
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {t('service.attachments.progress', {
                              percent: progress,
                            })}
                          </p>
                        </div>
                      ) : (
                        <p className='flex items-center gap-1 pb-2 text-xs text-muted-foreground'>
                          <UploadIcon className='size-3' />
                          {t('service.attachments.hint')}
                        </p>
                      )}
                    </div>
                  ) : null}
                  {(detail.data?.attachments ?? []).length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('service.attachments.empty')}
                    </p>
                  ) : null}
                  <ul className='space-y-2'>
                    {(detail.data?.attachments ?? []).map(
                      (file: Attachment) => (
                        <li
                          key={file.id}
                          className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3'
                        >
                          <div className='flex min-w-0 items-center gap-3'>
                            {file.mimeType.startsWith('image/') ? (
                              <a
                                href={attachmentUrl(file)}
                                target='_blank'
                                rel='noreferrer'
                              >
                                <img
                                  src={attachmentUrl(file)}
                                  alt={file.filename}
                                  className='h-14 w-14 rounded border object-cover'
                                />
                              </a>
                            ) : null}
                            <div className='min-w-0'>
                              <p className='truncate text-sm font-medium'>
                                {file.filename}
                              </p>
                              <p className='text-xs text-muted-foreground'>
                                {file.mimeType} ·{' '}
                                {Math.max(1, Math.round(file.size / 1024))} KB ·{' '}
                                {file.category ?? 'other'}
                              </p>
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              nativeButton={false}
                              render={
                                <a
                                  href={attachmentUrl(file)}
                                  target='_blank'
                                  rel='noreferrer'
                                />
                              }
                            >
                              {t('service.attachments.download')}
                            </Button>
                            {canEditAttachments ? (
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                disabled={busy}
                                aria-label={t('service.attachments.remove')}
                                onClick={() => void removeAttachment(file.id)}
                              >
                                <Trash2Icon />
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {supervisor && !ticket.confidential ? (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('service.shares.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('service.shares.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='flex flex-wrap items-end gap-3'>
                    <div className='grid gap-2'>
                      <Label htmlFor='share-engineer'>
                        {t('service.shares.engineer')}
                      </Label>
                      <SelectField
                        id='share-engineer'
                        value={shareId}
                        onValueChange={setShareId}
                        options={engineerOptions}
                        className='w-56'
                      />
                    </div>
                    <Button
                      disabled={busy || shareId === ''}
                      onClick={() =>
                        void act(
                          `service/tickets/${id}/shares`,
                          'POST',
                          { engineerId: shareId },
                          t('service.shares.created'),
                        )
                      }
                    >
                      {t('service.shares.share')}
                    </Button>
                  </div>
                  <ul className='space-y-2'>
                    {(detail.data?.shares ?? []).map((share) => (
                      <li
                        key={share.id}
                        className='flex items-center justify-between rounded-md border p-2 text-sm'
                      >
                        <span>{share.engineerName ?? share.engineerId}</span>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={busy}
                          onClick={() =>
                            void act(
                              `service/tickets/${id}/shares/${share.engineerId}`,
                              'DELETE',
                              undefined,
                              t('service.shares.revoked'),
                            )
                          }
                        >
                          {t('service.shares.revoke')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {internal ? (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('service.tickets.logs')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className='space-y-3'>
                    {(detail.data?.logs ?? []).map((log) => (
                      <li key={log.id} className='flex gap-3 text-sm'>
                        <span className='w-40 shrink-0 text-muted-foreground'>
                          {formatDateTime(log.createdAt)}
                        </span>
                        <span>
                          <Badge variant='outline' className='mr-2'>
                            {log.step}
                          </Badge>
                          {log.status}
                          {log.message ? ` · ${log.message}` : ''}
                        </span>
                      </li>
                    ))}
                    {(detail.data?.logs ?? []).length === 0 ? (
                      <p className='text-sm text-muted-foreground'>
                        {t('service.tickets.noLogs')}
                      </p>
                    ) : null}
                  </ol>
                </CardContent>
              </Card>
            ) : null}
            <Outlet />
          </>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
