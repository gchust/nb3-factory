import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  ImageIcon,
  LockIcon,
  PaperclipIcon,
  SendIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { useRouteOverlay } from '@/components/use-route-overlay';
import {
  FilePreviewDialog,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import {
  askAssistant,
  deleteAttachment,
  downloadAttachment,
  fetchAttachmentObjectUrl,
  fetchEngineers,
  fetchTicket,
  revokeShare,
  runTicketAction,
  shareTicket,
  uploadAttachment,
  type Attachment,
  type Engineer,
  type Ticket,
} from '../api.js';
import { formatDateTime, formatSize } from '../format.js';
import {
  LoadingBlock,
  PriorityBadge,
  QueryError,
  StatusBadge,
} from '../shared.js';

type LifecycleAction =
  'accept' | 'start' | 'submit' | 'confirm' | 'return' | 'reaccept';

/** The child route for one ticket, presented as a drawer over the worklist. */
export default function TicketDetailPage(): ReactElement {
  const { ticketId } = useParams<{ ticketId: string }>();
  return (
    <RouteDrawer
      title={`#${ticketId ?? ''}`}
      description={<span />}
      className='sm:max-w-2xl'
    >
      <TicketDetailPanel ticketId={Number(ticketId)} />
    </RouteDrawer>
  );
}

function TicketDetailPanel({
  ticketId,
}: {
  readonly ticketId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<{
    key: string;
    ticket?: Ticket;
    error?: unknown;
  }>();
  const [action, setAction] = useState<LifecycleAction>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [shareEngineer, setShareEngineer] = useState('');
  const [question, setQuestion] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistant, setAssistant] = useState<{
    answer: string;
    draft: string;
    citations: { sourceType: string; title: string; reference: string }[];
  }>();

  const requestKey = `${ticketId}:${reloadCount}`;

  useEffect(() => {
    const controller = new AbortController();
    const key = `${ticketId}:${reloadCount}`;
    fetchTicket(api, ticketId).then(
      (ticket) => {
        if (!controller.signal.aborted) setState({ key, ticket });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, ticketId, reloadCount]);

  useEffect(() => {
    let active = true;
    void fetchEngineers(api).then(
      (list) => {
        if (active) setEngineers(list);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api]);

  const loading = state?.key !== requestKey;
  const ticket = state?.ticket;

  const availableActions = useMemo<LifecycleAction[]>(() => {
    if (!ticket) return [];
    switch (ticket.status) {
      case 'pending_acceptance':
        return ['accept'];
      case 'pending_processing':
        return ['start', 'reaccept'];
      case 'processing':
        return ['submit', 'reaccept'];
      case 'pending_confirmation':
        return ['confirm', 'return'];
      default:
        return [];
    }
  }, [ticket]);

  async function runAction(): Promise<void> {
    if (!ticket || !action) return;
    const requiresNote =
      action === 'submit' || action === 'return' || action === 'reaccept';
    if (requiresNote && !note.trim()) {
      toaster.show({
        type: 'error',
        title: t('service.tickets.detail.noteRequired'),
      });
      return;
    }
    setBusy(true);
    try {
      const json: Record<string, unknown> =
        action === 'submit'
          ? { resultNote: note.trim() }
          : note.trim()
            ? { note: note.trim(), reason: note.trim() }
            : {};
      const updated = await runTicketAction(api, ticket.id, action, json);
      setState({ key: requestKey, ticket: updated });
      setAction(undefined);
      setNote('');
      toaster.show({
        type: 'success',
        title: t(`service.tickets.detail.actionDone.${action}`),
      });
    } catch (error: unknown) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError && error.status === 403
            ? t('service.error.forbidden')
            : t('service.tickets.detail.actionFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitShare(): Promise<void> {
    if (!ticket || !shareEngineer) return;
    setBusy(true);
    try {
      await shareTicket(api, ticket.id, shareEngineer);
      setShareEngineer('');
      setReloadCount((count) => count + 1);
      toaster.show({
        type: 'success',
        title: t('service.tickets.detail.shared'),
      });
    } catch (error: unknown) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError && error.status === 403
            ? t('service.tickets.detail.confidentialNoShare')
            : t('service.error.requestFailed'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(shareId: number): Promise<void> {
    if (!ticket) return;
    try {
      await revokeShare(api, ticket.id, shareId);
      setReloadCount((count) => count + 1);
    } catch {
      toaster.show({ type: 'error', title: t('service.error.requestFailed') });
    }
  }

  async function ask(): Promise<void> {
    if (!question.trim()) return;
    setAssistantBusy(true);
    try {
      const answer = await askAssistant(api, question.trim(), ticketId);
      setAssistant({
        answer: answer.answer,
        draft: answer.draft,
        citations: answer.citations,
      });
    } catch {
      toaster.show({ type: 'error', title: t('service.assistant.failed') });
    } finally {
      setAssistantBusy(false);
    }
  }

  if (loading && !ticket) {
    return <LoadingBlock rows={6} />;
  }
  if (state?.error) {
    return (
      <QueryError
        error={state.error}
        onRetry={() => setReloadCount((count) => count + 1)}
      />
    );
  }
  if (!ticket) {
    return <LoadingBlock rows={2} />;
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.confidential ? (
          <Badge variant='outline'>
            <LockIcon /> {t('service.tickets.confidential')}
          </Badge>
        ) : null}
        {ticket.source === 'external' ? (
          <Badge variant='secondary'>{t('service.tickets.external')}</Badge>
        ) : null}
      </div>

      <h2 className='font-heading text-lg font-semibold'>{ticket.title}</h2>
      {ticket.description ? (
        <p className='text-sm text-muted-foreground'>{ticket.description}</p>
      ) : null}

      <dl className='grid grid-cols-2 gap-3 text-sm'>
        <Detail
          label={t('service.common.customer')}
          value={ticket.customerName}
        />
        <Detail
          label={t('service.common.device')}
          value={
            ticket.deviceCode
              ? `${ticket.deviceCode} · ${ticket.deviceName ?? ''}`
              : t('service.common.none')
          }
        />
        <Detail
          label={t('service.tickets.column.assignee')}
          value={ticket.assigneeName ?? t('service.common.unassigned')}
        />
        <Detail
          label={t('service.tickets.column.dueAt')}
          value={ticket.dueAt ?? t('service.common.none')}
        />
      </dl>

      {ticket.summaryOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>
              {t('service.tickets.detail.summaryOnly')}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <>
          {ticket.acceptNote ? (
            <Note
              label={t('service.tickets.detail.acceptNote')}
              value={ticket.acceptNote}
            />
          ) : null}
          {ticket.processNote ? (
            <Note
              label={t('service.tickets.detail.processNote')}
              value={ticket.processNote}
            />
          ) : null}
          {ticket.resultNote ? (
            <Note
              label={t('service.tickets.detail.resultNote')}
              value={ticket.resultNote}
            />
          ) : null}
          {ticket.rejectReason ? (
            <Note
              label={t('service.tickets.detail.rejectReason')}
              value={ticket.rejectReason}
            />
          ) : null}
          {ticket.confirmationNote ? (
            <Note
              label={t('service.tickets.detail.confirmationNote')}
              value={ticket.confirmationNote}
            />
          ) : null}
        </>
      )}

      {ticket.summaryOnly ? null : (
        <>
          {availableActions.length ? (
            <Card>
              <CardHeader>
                <CardTitle className='text-sm'>
                  {t('service.tickets.detail.actions')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {action ? (
                  <div className='space-y-3'>
                    <Textarea
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={t(
                        `service.tickets.detail.notePlaceholder.${action}`,
                      )}
                    />
                    <div className='flex justify-end gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setAction(undefined)}
                        disabled={busy}
                      >
                        {t('service.actions.cancel')}
                      </Button>
                      <Button
                        size='sm'
                        onClick={() => void runAction()}
                        disabled={busy}
                      >
                        {t(`service.tickets.detail.confirmAction.${action}`)}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className='flex flex-wrap gap-2'>
                    {availableActions.map((value) => (
                      <Button
                        key={value}
                        variant={value === 'return' ? 'destructive' : 'outline'}
                        size='sm'
                        onClick={() => setAction(value)}
                      >
                        {t(`service.tickets.detail.actionsLabel.${value}`)}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <AttachmentsSection
            ticket={ticket}
            onChanged={() => setReloadCount((count) => count + 1)}
          />

          {ticket.confidential ? null : (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <Share2Icon className='size-4' />{' '}
                  {t('service.tickets.detail.shares')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='flex gap-2'>
                  <Select
                    items={engineers
                      .filter((engineer) => engineer.id !== ticket.assigneeId)
                      .map((engineer) => ({
                        value: engineer.id,
                        label: engineer.name,
                      }))}
                    value={shareEngineer || null}
                    onValueChange={(value: string | null) =>
                      setShareEngineer(value ?? '')
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={t(
                          'service.tickets.detail.sharePlaceholder',
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {engineers
                        .filter((engineer) => engineer.id !== ticket.assigneeId)
                        .map((engineer) => (
                          <SelectItem key={engineer.id} value={engineer.id}>
                            {engineer.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant='outline'
                    onClick={() => void submitShare()}
                    disabled={busy || !shareEngineer}
                  >
                    <UsersIcon />
                    {t('service.actions.share')}
                  </Button>
                </div>
                <ul className='space-y-1 text-sm'>
                  {(ticket.shares ?? []).map((share) => (
                    <li
                      key={share.id}
                      className='flex items-center justify-between rounded-md border px-3 py-1.5'
                    >
                      <span>
                        {engineers.find(
                          (engineer) => engineer.id === share.engineerId,
                        )?.name ?? share.engineerId}
                      </span>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => void removeShare(share.id)}
                      >
                        <Trash2Icon />
                        {t('service.actions.revoke')}
                      </Button>
                    </li>
                  ))}
                  {!(ticket.shares ?? []).length ? (
                    <li className='text-muted-foreground'>
                      {t('service.tickets.detail.noShares')}
                    </li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-sm'>
                <SparklesIcon className='size-4' />{' '}
                {t('service.assistant.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex gap-2'>
                <Input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={t('service.assistant.placeholder')}
                />
                <Button
                  variant='outline'
                  onClick={() => void ask()}
                  disabled={assistantBusy || !question.trim()}
                >
                  <SendIcon />
                  {t('service.assistant.ask')}
                </Button>
              </div>
              {assistant ? (
                <div className='space-y-2 text-sm'>
                  <p className='whitespace-pre-wrap'>{assistant.answer}</p>
                  <ul className='space-y-1 text-xs text-muted-foreground'>
                    {assistant.citations.map((citation) => (
                      <li key={`${citation.sourceType}:${citation.reference}`}>
                        [{citation.sourceType}] {citation.title}
                      </li>
                    ))}
                  </ul>
                  <div className='rounded-md bg-muted/50 p-3'>
                    <p className='text-xs text-muted-foreground'>
                      {t('service.assistant.draftHint')}
                    </p>
                    <p className='mt-1 whitespace-pre-wrap'>
                      {assistant.draft}
                    </p>
                    <Button
                      className='mt-2'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setNote(assistant.draft);
                        setAction(
                          ticket.status === 'processing' ? 'submit' : 'start',
                        );
                        toaster.show({
                          type: 'info',
                          title: t('service.assistant.draftPasted'),
                        });
                      }}
                    >
                      {t('service.assistant.useDraft')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>
                {t('service.tickets.detail.timeline')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className='space-y-3 text-sm'>
                {(ticket.executionLogs ?? []).map((log) => (
                  <li key={log.id} className='flex gap-3'>
                    <span className='mt-1 size-2 shrink-0 rounded-full bg-primary' />
                    <div>
                      <p className='font-medium'>
                        {t(`service.ticketAction.${log.action}`, log.action)}
                      </p>
                      {log.detail ? (
                        <p className='text-muted-foreground'>{log.detail}</p>
                      ) : null}
                      <p className='text-xs text-muted-foreground'>
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
                {!(ticket.executionLogs ?? []).length ? (
                  <li className='text-muted-foreground'>
                    {t('service.tickets.detail.noTimeline')}
                  </li>
                ) : null}
              </ol>
            </CardContent>
          </Card>

          <div className='flex justify-end'>
            <Button variant='outline' onClick={() => void close()}>
              {t('service.actions.close')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string | null;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5'>{value || '—'}</dd>
    </div>
  );
}

function Note({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='rounded-md border bg-muted/30 p-3 text-sm'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-1 whitespace-pre-wrap'>{value}</p>
    </div>
  );
}

function AttachmentsSection({
  ticket,
  onChanged,
}: {
  readonly ticket: Ticket;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [kind, setKind] = useState<'photo' | 'report'>('photo');
  // The chosen file stays in state across a failed submit, so a validation
  // failure never loses the user's selection.
  const [file, setFile] = useState<File>();
  const [uploading, setUploading] = useState(false);

  async function upload(): Promise<void> {
    if (!file) {
      toaster.show({
        type: 'error',
        title: t('service.tickets.detail.chooseFile'),
      });
      return;
    }
    setUploading(true);
    try {
      await uploadAttachment(api, ticket.id, file, kind);
      setFile(undefined);
      toaster.show({
        type: 'success',
        title: t('service.tickets.detail.uploaded'),
      });
      onChanged();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.tickets.detail.uploadFailed'),
        description: apiErrorMessage(error),
      });
    } finally {
      setUploading(false);
    }
  }

  async function remove(attachment: Attachment): Promise<void> {
    try {
      await deleteAttachment(api, ticket.id, attachment.id);
      toaster.show({
        type: 'success',
        title: t('service.tickets.detail.removed'),
      });
      onChanged();
    } catch {
      toaster.show({ type: 'error', title: t('service.error.requestFailed') });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-sm'>
          <PaperclipIcon className='size-4' />{' '}
          {t('service.tickets.detail.attachments')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            items={[
              { value: 'photo', label: t('service.tickets.detail.kind.photo') },
              {
                value: 'report',
                label: t('service.tickets.detail.kind.report'),
              },
            ]}
            value={kind}
            onValueChange={(value: string | null) =>
              setKind((value ?? 'photo') as 'photo' | 'report')
            }
          >
            <SelectTrigger className='w-40'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='photo'>
                {t('service.tickets.detail.kind.photo')}
              </SelectItem>
              <SelectItem value='report'>
                {t('service.tickets.detail.kind.report')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            type='file'
            accept={
              kind === 'photo' ? 'image/png,image/jpeg' : '.docx,.xlsx,.pptx'
            }
            onChange={(event) => setFile(event.target.files?.[0])}
            className='max-w-xs'
          />
          <Button
            variant='outline'
            onClick={() => void upload()}
            disabled={uploading}
          >
            <UploadIcon />
            {t('service.actions.upload')}
          </Button>
        </div>
        <ul className='space-y-1'>
          {(ticket.attachments ?? []).map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              ticketId={ticket.id}
              attachment={attachment}
              onRemove={() => void remove(attachment)}
            />
          ))}
          {!(ticket.attachments ?? []).length ? (
            <li className='text-sm text-muted-foreground'>
              {t('service.tickets.detail.noAttachments')}
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function AttachmentItem({
  ticketId,
  attachment,
  onRemove,
}: {
  readonly ticketId: number;
  readonly attachment: Attachment;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const isImage = (attachment.mimeType ?? '').startsWith('image/');
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);

  // Load image bytes only when the item renders and the viewer has access.
  useEffect(() => {
    if (!isImage) return;
    let active = true;
    let objectUrl: string | undefined;
    void fetchAttachmentObjectUrl(api, ticketId, attachment.id).then(
      (url) => {
        objectUrl = url;
        if (active) setPreviewUrl(url);
      },
      () => undefined,
    );
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, ticketId, attachment.id, isImage]);

  // The preview reads through the same authorized content route the download
  // uses, so a user without access to the ticket cannot preview by guessing a
  // URL, and the Office document is rendered from the real bytes.
  const previewFile: FileRecord = {
    id: String(attachment.id),
    disk: 'local',
    key: attachment.fileId,
    filename: attachment.filename,
    ext: fileExtension(attachment.filename),
    mimeType: attachment.mimeType ?? '',
    size: attachment.size ?? 0,
    createdAt: attachment.createdAt ?? '1970-01-01T00:00:00.000Z',
    updatedAt: attachment.createdAt ?? '1970-01-01T00:00:00.000Z',
    contentUrl: resolveAppUrl(
      `/api/service/tickets/${ticketId}/attachments/${attachment.id}/content`,
    ),
  };

  return (
    <li className='flex items-center gap-3 rounded-md border px-3 py-2 text-sm'>
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt={attachment.filename}
          className='size-10 rounded object-cover'
        />
      ) : (
        <span className='flex size-10 items-center justify-center rounded bg-muted'>
          {isImage ? (
            <ImageIcon className='size-4' />
          ) : (
            <FileTextIcon className='size-4' />
          )}
        </span>
      )}
      <div className='min-w-0 flex-1'>
        <button
          type='button'
          className='truncate text-left font-medium hover:underline'
          onClick={() => setPreviewOpen(true)}
        >
          {attachment.filename}
        </button>
        <p className='text-xs text-muted-foreground'>
          {t(`service.tickets.detail.kind.${attachment.kind}`, attachment.kind)}{' '}
          · {formatSize(attachment.size)} ·{' '}
          {formatDateTime(attachment.createdAt)}
        </p>
      </div>
      <Button variant='ghost' size='sm' onClick={() => setPreviewOpen(true)}>
        <EyeIcon />
        {t('service.tickets.detail.previewFile')}
      </Button>
      <Button
        variant='ghost'
        size='sm'
        onClick={() =>
          void downloadAttachment(api, ticketId, attachment).catch(() =>
            toaster.show({
              type: 'error',
              title: t('service.error.requestFailed'),
            }),
          )
        }
      >
        <DownloadIcon />
        {t('service.actions.download')}
      </Button>
      <Button variant='ghost' size='sm' onClick={onRemove}>
        <Trash2Icon />
        {t('service.actions.remove')}
      </Button>
      <FilePreviewDialog
        files={[previewFile]}
        initialIndex={0}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        download={false}
        onError={() =>
          toaster.show({
            type: 'error',
            title: t('service.error.requestFailed'),
          })
        }
      />
    </li>
  );
}

/** The lowercase extension without the dot, used to pick a preview renderer. */
function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** The server's real message for a rejected request, when it supplied one. */
function apiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const payload = error.payload;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return undefined;
}
