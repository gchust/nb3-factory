import { useTranslation } from '@nocobase/i18n/client';
import {
  useService,
  useToaster,
  resolveAppUrl,
  useApiClient,
} from '@nocobase/app-client';
import {
  ArrowLeftIcon,
  PaperclipIcon,
  SendIcon,
  Share2Icon,
  SparklesIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  FileList,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui/index';
import { useServiceRequest } from '../../api.js';
import type {
  AssistantDraft,
  EngineerLoad,
  TicketAttachment,
  TicketDetail,
} from '../../api.js';
import {
  AsyncBlock,
  formatDateTime,
  PriorityBadge,
  StatusBadge,
  useAsyncData,
} from '../../shared.js';

const ACTIONS = ['accept', 'start', 'submit', 'close', 'return'] as const;
type TicketAction = (typeof ACTIONS)[number];

/** The 服务助手 employee as the AI settings store it, plus its readiness. */
interface AssistantEmployee {
  readonly username: string;
  readonly nickname: string;
  readonly enabled?: boolean;
  readonly enableKnowledgeBase?: boolean;
  readonly knowledgeBase?: { readonly knowledgeBaseKeys?: readonly string[] };
  readonly missingKnowledgeBaseKeys?: readonly string[];
}

interface AssistantReadiness {
  readonly employee?: AssistantEmployee;
  /** Whether any LLM service/model is configured for the assistant to talk to. */
  readonly modelReady: boolean;
}

/**
 * The AI plugin answers these two routes with a bare list, not the `{ data }`
 * envelope the service routes use, so the readiness probe unwraps both shapes.
 */
function asList<T>(payload: unknown): readonly T[] {
  if (Array.isArray(payload)) return payload as readonly T[];
  const data = (payload as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return data as readonly T[];
  const nested = (data as { data?: unknown } | undefined)?.data;
  return Array.isArray(nested) ? (nested as readonly T[]) : [];
}

const ACTION_LABEL: Record<TicketAction, string> = {
  accept: 'service.actions.accept',
  start: 'service.actions.start',
  submit: 'service.actions.submit',
  close: 'service.actions.close',
  return: 'service.actions.return',
};

/**
 * The assistant draft is a browser-side scratchpad: it must survive a
 * refresh so an engineer can come back to it, but it must never be written to
 * a business record until the engineer confirms the handling action. The
 * ticket id is stored with the draft so navigating to another ticket cannot
 * show a stale suggestion.
 */
function readStoredDraft(
  ticketId: number,
): { ticketId: number; value: AssistantDraft } | null {
  if (typeof window === 'undefined') return null;
  const key = `service-assistant-draft:${ticketId}`;
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;
  try {
    return { ticketId, value: JSON.parse(stored) as AssistantDraft };
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function toFileRecord(attachment: TicketAttachment): FileRecord {
  return {
    id: attachment.fileId,
    disk: 'local',
    key: '',
    filename: attachment.filename ?? attachment.fileId,
    ext: attachment.ext ?? '',
    mimeType: attachment.mimeType ?? 'application/octet-stream',
    size: attachment.size ?? 0,
    createdAt: attachment.createdAt,
    updatedAt: attachment.createdAt,
    contentUrl: attachment.contentUrl
      ? resolveAppUrl(attachment.contentUrl)
      : undefined,
  };
}

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const params = useParams<{ ticketId: string }>();
  const ticketId = Number(params.ticketId);

  const state = useAsyncData<TicketDetail>(
    () => request<TicketDetail>(`/service/tickets/${ticketId}`),
    [request, ticketId],
  );
  const engineers = useAsyncData<readonly EngineerLoad[]>(
    () => request<readonly EngineerLoad[]>('/service/engineers'),
    [request],
  );

  return (
    <RouteChildPage>
      <PageContainer>
        <Breadcrumbs />
        <AsyncBlock state={state}>
          {(detail) => (
            <TicketDetailBody
              detail={detail}
              engineers={engineers.data ?? []}
              reload={state.reload}
              ticketId={ticketId}
              request={request}
              notify={(type, title, description) =>
                toaster.show({ type, title, description })
              }
              toasterError={t('service.error.title')}
            />
          )}
        </AsyncBlock>
      </PageContainer>
    </RouteChildPage>
  );
}

function TicketDetailBody({
  detail,
  engineers,
  reload,
  ticketId,
  request,
  notify,
  toasterError,
}: {
  readonly detail: TicketDetail;
  readonly engineers: readonly EngineerLoad[];
  readonly reload: () => void;
  readonly ticketId: number;
  readonly request: ReturnType<typeof useServiceRequest>;
  readonly notify: (
    type: 'success' | 'error',
    title: string,
    description?: string,
  ) => void;
  readonly toasterError: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const fileManager = useService(clientFileRepositoryManagerToken);
  const repository = fileManager.repository('ticketFiles');
  const ticket = detail.ticket;

  const [action, setAction] = useState<TicketAction | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareGrantee, setShareGrantee] = useState('');
  const [shareReason, setShareReason] = useState('');
  const [shareTtl, setShareTtl] = useState('48');
  const [uploading, setUploading] = useState(false);
  const [draftState, setDraftState] = useState<{
    ticketId: number;
    value: AssistantDraft;
  } | null>(() => readStoredDraft(ticketId));
  const draft = draftState?.ticketId === ticketId ? draftState.value : null;
  const [draftPending, setDraftPending] = useState(false);

  // Read the employee and the model list from the AI plugin's own routes, so
  // the panel states what is really configured instead of assuming.
  const assistantReadiness = useAsyncData<AssistantReadiness>(async () => {
    const [employeePayload, modelPayload] = await Promise.all([
      api.request<unknown>({ path: '/ai/aiEmployees:listByUser' }),
      api.request<unknown>({ path: '/ai/ai:listAllEnabledModels' }),
    ]);
    const employees = asList<AssistantEmployee>(employeePayload);
    return {
      employee: employees.find((item) => item.username === 'service-assistant'),
      modelReady: asList<unknown>(modelPayload).length > 0,
    };
  }, [api]);

  const attachments = detail.attachments.map(toFileRecord);
  // The file record carries the file id, while unlinking needs the association
  // id, so keep the mapping for the remove control.
  const attachmentIds = new Map(
    detail.attachments.map((attachment) => [attachment.fileId, attachment.id]),
  );

  function fail(error: unknown): void {
    notify(
      'error',
      toasterError,
      error instanceof Error ? error.message : String(error),
    );
  }

  async function runAction(): Promise<void> {
    if (!action) return;
    setPending(true);
    try {
      const patch: Record<string, string | null> = {};
      if (action === 'submit') patch.handling = actionNote || null;
      if (action === 'close') patch.resolution = actionNote || null;
      if (Object.keys(patch).length) {
        await request(`/service/tickets/${ticketId}`, {
          method: 'PATCH',
          json: patch,
        });
      }
      await request(`/service/tickets/${ticketId}/actions/${action}`, {
        method: 'POST',
        json: { comment: actionComment || null },
      });
      notify(
        'success',
        t(
          action === 'accept'
            ? 'service.tickets.acceptanceSubmitted'
            : 'service.tickets.actionDone',
        ),
      );
      setAction(null);
      setActionNote('');
      setActionComment('');
      reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  async function submitComment(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!comment.trim()) return;
    setPending(true);
    try {
      await request(`/service/tickets/${ticketId}/comments`, {
        method: 'POST',
        json: { comment: comment.trim() },
      });
      setComment('');
      reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  async function attach(records: readonly FileRecord[]): Promise<void> {
    if (records.length === 0) return;
    setUploading(true);
    try {
      for (const record of records) {
        await request(`/service/tickets/${ticketId}/attachments`, {
          method: 'POST',
          json: { fileId: record.id, kind: 'repair' },
        });
      }
      notify('success', t('service.tickets.attachmentAdded'));
      reload();
    } catch (error) {
      fail(error);
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(record: FileRecord): Promise<void> {
    const attachmentId = attachmentIds.get(record.id);
    if (!attachmentId) return;
    setUploading(true);
    try {
      await request(
        `/service/tickets/${ticketId}/attachments/${attachmentId}`,
        { method: 'DELETE' },
      );
      notify('success', t('service.tickets.attachmentRemoved'));
      reload();
    } catch (error) {
      fail(error);
    } finally {
      setUploading(false);
    }
  }

  async function createShare(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    try {
      await request(`/service/tickets/${ticketId}/shares`, {
        method: 'POST',
        json: {
          granteeId: shareGrantee ? Number(shareGrantee) : null,
          reason: shareReason || null,
          ttlHours: shareTtl ? Number(shareTtl) : null,
        },
      });
      notify('success', t('service.tickets.shareCreated'));
      setShareOpen(false);
      setShareGrantee('');
      setShareReason('');
      reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  async function revokeShare(shareId: number): Promise<void> {
    try {
      await request(`/service/tickets/${ticketId}/shares/${shareId}`, {
        method: 'DELETE',
      });
      reload();
    } catch (error) {
      fail(error);
    }
  }

  async function generateDraft(): Promise<void> {
    setDraftPending(true);
    try {
      const result = await request<AssistantDraft>('/service/assistant/draft', {
        method: 'POST',
        json: { ticketId, language: 'zh-CN' },
      });
      setDraftState({ ticketId, value: result });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `service-assistant-draft:${ticketId}`,
          JSON.stringify(result),
        );
      }
    } catch (error) {
      fail(error);
    } finally {
      setDraftPending(false);
    }
  }

  /**
   * Move the assistant suggestion into the handling-note draft. This only
   * prefills the action dialog; the engineer still confirms (or cancels) the
   * real state transition, so nothing is written on its own.
   */
  function bringDraftIntoHandling(): void {
    if (!draft) return;
    const target = (['submit', 'close'] as const).find((value) =>
      detail.capabilities.includes(value),
    );
    if (!target) {
      notify('error', toasterError, t('service.assistant.noHandlingAction'));
      return;
    }
    setActionNote(draft.draft);
    setActionComment('');
    setAction(target);
  }

  const readOnly = ticket.status === 'closed';
  const isManager = detail.capabilities.some((value) =>
    ['accept', 'close', 'return'].includes(value),
  );

  return (
    <>
      <PageHeader
        title={ticket.title}
        description={t('service.tickets.detailDescription', {
          ticketNo: ticket.ticketNo,
        })}
        actions={
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to='..'
            relative='path'
          >
            <ArrowLeftIcon data-icon='inline-start' />
            {t('service.actions.back')}
          </Link>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.confidential ? (
          <Badge variant='destructive'>
            {t('service.tickets.confidential')}
          </Badge>
        ) : null}
        <Badge variant='outline'>
          {t(`service.source.${ticket.source}`, {
            defaultValue: ticket.source,
          })}
        </Badge>
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>{t('service.tickets.info')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.customer')}
                </div>
                <div>{ticket.customerName ?? '—'}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.device')}
                </div>
                <div>
                  {ticket.deviceNo ?? '—'}
                  {ticket.deviceModel ? ` · ${ticket.deviceModel}` : ''}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.assignee')}
                </div>
                <div>{ticket.assigneeName ?? '—'}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.slaDue')}
                </div>
                <div>{formatDateTime(ticket.slaDueAt)}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.createdAt')}
                </div>
                <div>{formatDateTime(ticket.createdAt)}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.closedAt')}
                </div>
                <div>{formatDateTime(ticket.closedAt)}</div>
              </div>
            </div>
            <Separator />
            <div>
              <div className='text-muted-foreground'>
                {t('service.tickets.descriptionField')}
              </div>
              <p className='whitespace-pre-wrap'>{ticket.description ?? '—'}</p>
            </div>
            {ticket.handling ? (
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.handling')}
                </div>
                <p className='whitespace-pre-wrap'>{ticket.handling}</p>
              </div>
            ) : null}
            {ticket.resolution ? (
              <div>
                <div className='text-muted-foreground'>
                  {t('service.tickets.resolution')}
                </div>
                <p className='whitespace-pre-wrap'>{ticket.resolution}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('service.tickets.lifecycle')}</CardTitle>
            <CardDescription>
              {readOnly
                ? t('service.tickets.readOnly')
                : t('service.tickets.lifecycleHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {detail.acceptance.pending ? (
              <Alert>
                <AlertTitle>
                  {t('service.tickets.acceptancePendingTitle')}
                </AlertTitle>
                <AlertDescription>
                  {t('service.tickets.acceptancePendingHint')}
                </AlertDescription>
              </Alert>
            ) : null}
            {detail.acceptance.lastFailed ? (
              <Alert variant='destructive'>
                <AlertTitle>
                  {t('service.tickets.acceptanceFailedTitle')}
                </AlertTitle>
                <AlertDescription>
                  {t('service.tickets.acceptanceFailedHint')}
                </AlertDescription>
              </Alert>
            ) : null}
            {readOnly || detail.capabilities.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.tickets.noAction')}
              </p>
            ) : (
              <div className='flex flex-wrap gap-2'>
                {ACTIONS.filter((value) =>
                  detail.capabilities.includes(value),
                ).map((value) => (
                  <Button
                    key={value}
                    variant={value === 'close' ? 'default' : 'outline'}
                    disabled={value === 'accept' && detail.acceptance.pending}
                    onClick={() => {
                      setAction(value);
                      setActionNote('');
                      setActionComment('');
                    }}
                  >
                    {t(ACTION_LABEL[value])}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('service.tickets.timeline')}</CardTitle>
            <CardDescription>
              {t('service.tickets.timelineHint')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form
              className='flex items-start gap-2'
              onSubmit={(event) => {
                void submitComment(event);
              }}
            >
              <Textarea
                rows={2}
                placeholder={t('service.tickets.commentPlaceholder')}
                value={comment}
                disabled={readOnly}
                onChange={(event) => setComment(event.target.value)}
              />
              <Button
                disabled={pending || readOnly || !comment.trim()}
                type='submit'
              >
                <SendIcon data-icon='inline-start' />
                {t('service.actions.comment')}
              </Button>
            </form>
            <ul className='space-y-3'>
              {detail.events.map((event) => (
                <li className='rounded-md border p-3 text-sm' key={event.id}>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-medium'>
                      {t(`service.event.${event.type}`, {
                        defaultValue: event.type,
                      })}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {event.operatorName ?? '—'}
                    {event.status
                      ? ` · ${t(`service.status.ticket.${event.status}`, {
                          defaultValue: event.status,
                        })}`
                      : ''}
                  </div>
                  {event.comment ? (
                    <p className='mt-1 whitespace-pre-wrap'>{event.comment}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <PaperclipIcon className='size-4' />
                {t('service.tickets.attachments')}
              </CardTitle>
              <CardDescription>
                {t('service.tickets.attachmentsHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <FileList
                files={attachments}
                labels={{
                  remove: t('service.tickets.removeAttachment'),
                }}
                onRemove={readOnly ? undefined : removeAttachment}
                emptyState={t('service.tickets.noAttachments')}
              />
              {readOnly ? null : (
                <FileUploadField
                  accept={[
                    'image/png',
                    'image/jpeg',
                    'image/webp',
                    '.docx',
                    '.pdf',
                  ]}
                  disabled={uploading}
                  multiple
                  repository={repository}
                  value={[]}
                  onChange={(records) => void attach(records)}
                  onError={fail}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='flex items-center gap-2'>
                  <Share2Icon className='size-4' />
                  {t('service.tickets.shares')}
                </CardTitle>
                {isManager && !ticket.confidential ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setShareOpen(true)}
                  >
                    {t('service.tickets.addShare')}
                  </Button>
                ) : null}
              </div>
              <CardDescription>
                {ticket.confidential
                  ? t('service.tickets.confidentialShareBlocked')
                  : t('service.tickets.sharesHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {detail.shares.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.tickets.noShares')}
                </p>
              ) : (
                detail.shares.map((share) => (
                  <div
                    className='flex items-center justify-between gap-2 rounded-md border p-3 text-sm'
                    key={share.id}
                  >
                    <div>
                      <div className='font-medium'>
                        {share.granteeName ?? `#${share.granteeId}`}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {share.reason ?? '—'} ·{' '}
                        {t('service.tickets.shareExpires', {
                          value: formatDateTime(share.expiresAt),
                        })}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      {share.revoked ? (
                        <Badge variant='secondary'>
                          {t('service.tickets.shareRevoked')}
                        </Badge>
                      ) : (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => void revokeShare(share.id)}
                        >
                          {t('service.actions.revoke')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='flex items-center gap-2'>
                  <SparklesIcon className='size-4' />
                  {t('service.assistant.title')}
                </CardTitle>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={draftPending}
                  onClick={() => void generateDraft()}
                >
                  {t('service.assistant.generate')}
                </Button>
              </div>
              <CardDescription>
                {t('service.assistant.detailHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='space-y-1 rounded-md border border-border bg-muted/40 p-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>
                    {t('service.assistant.employee')}
                  </span>
                  <Badge
                    variant={
                      assistantReadiness.data?.employee
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {assistantReadiness.data?.employee?.nickname ??
                      t('service.assistant.employeeMissing')}
                  </Badge>
                  <span className='text-muted-foreground'>
                    {assistantReadiness.data?.employee
                      ? t('service.assistant.employeeReady')
                      : t('service.assistant.employeeHint')}
                  </span>
                </div>
                {assistantReadiness.data &&
                !assistantReadiness.data.modelReady ? (
                  <p className='text-muted-foreground'>
                    {t('service.assistant.modelMissing')}
                  </p>
                ) : null}
              </div>
              {draft ? (
                <>
                  <p className='whitespace-pre-wrap'>{draft.draft}</p>
                  {draft.sources.length ? (
                    <div>
                      <div className='text-muted-foreground'>
                        {t('service.assistant.sources')}
                      </div>
                      <ul className='list-inside list-disc'>
                        {draft.sources.map((source) => (
                          <li key={source.id}>{source.title}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className='text-muted-foreground'>
                    {t('service.assistant.draftNotSaved')}
                  </p>
                  <Button
                    size='sm'
                    variant='secondary'
                    disabled={readOnly}
                    onClick={bringDraftIntoHandling}
                  >
                    {t('service.assistant.useDraft')}
                  </Button>
                </>
              ) : (
                <p className='text-muted-foreground'>
                  {t('service.assistant.empty')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction();
            }}
          >
            <DialogHeader>
              <DialogTitle>{action ? t(ACTION_LABEL[action]) : ''}</DialogTitle>
              <DialogDescription>
                {t('service.tickets.actionHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              {action === 'submit' ? (
                <Field>
                  <FieldLabel>{t('service.tickets.handling')}</FieldLabel>
                  <Textarea
                    rows={3}
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                  />
                </Field>
              ) : null}
              {action === 'close' ? (
                <Field>
                  <FieldLabel>{t('service.tickets.resolution')}</FieldLabel>
                  <Textarea
                    rows={3}
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel>{t('service.tickets.comment')}</FieldLabel>
                <Textarea
                  rows={2}
                  value={actionComment}
                  onChange={(event) => setActionComment(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setAction(null)}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {t('service.actions.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className='sm:max-w-lg'>
          <form
            onSubmit={(event) => {
              void createShare(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('service.tickets.addShare')}</DialogTitle>
              <DialogDescription>
                {t('service.tickets.addShareHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel>{t('service.tickets.shareGrantee')}</FieldLabel>
                <select
                  required
                  className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                  value={shareGrantee}
                  onChange={(event) => setShareGrantee(event.target.value)}
                >
                  <option value=''>{t('service.tickets.selectGrantee')}</option>
                  {engineers.map((engineer) => (
                    <option key={engineer.id} value={engineer.id}>
                      {engineer.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel>{t('service.tickets.shareReason')}</FieldLabel>
                <Input
                  value={shareReason}
                  onChange={(event) => setShareReason(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t('service.tickets.shareTtl')}</FieldLabel>
                <Input
                  type='number'
                  min={1}
                  max={720}
                  value={shareTtl}
                  onChange={(event) => setShareTtl(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setShareOpen(false)}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {t('service.actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
