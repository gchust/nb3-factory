import { useApiClient, useService, useToaster } from '@nocobase/app-client';
import type { ClientFileRepositoryManager } from '@nocobase/app-plugin-file/client';
import type { LifecycleDescription } from '@nocobase/lifecycle';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeftIcon, SendIcon } from 'lucide-react';

import { PageContainer } from '#components/page-container';
import { RouteChildPage } from '#components/route-child-page';
import { PageHeader } from '#components/page-header';
import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Label } from '#components/ui/label';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Skeleton } from '#components/ui/skeleton';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  FilePreviewField,
  FileUploadField,
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '#extensions/nocobase-file-component-ui/index';

import {
  errorText,
  useTicketLabels,
  useTicketPermission,
  useTicketsApi,
  type Engineer,
  type TicketDetail,
  type TicketState,
} from './shared.js';

function statusBadge(status: TicketState) {
  return status === 'escalated'
    ? 'destructive'
    : status === 'processing'
      ? 'default'
      : status === 'resolved'
        ? 'secondary'
        : 'outline';
}

interface LifecycleDescriptionResponse {
  description: LifecycleDescription;
  parameters: Readonly<Record<string, unknown>>;
  diagram: string;
}

const ACTION_FIELDS: Record<
  string,
  'assignee' | 'resolution' | 'cancel' | 'close' | 'reason' | 'none'
> = {
  assign: 'assignee',
  resolve: 'resolution',
  cancel: 'cancel',
  close: 'close',
  reopen: 'reason',
  claim: 'none',
  start: 'none',
};

export default function TicketDetailPage(): ReactElement {
  const { ticketId = '' } = useParams();
  const navigate = useNavigate();
  const api = useApiClient();
  const toaster = useToaster();
  const {
    t,
    formatDate,
    category,
    priority,
    status,
    action,
    transition,
    state,
  } = useTicketLabels();
  const detailRequest = useTicketsApi<{ data: TicketDetail }>(
    ticketId ? `tickets/${encodeURIComponent(ticketId)}` : null,
  );
  const lifecycleRequest = useTicketsApi<{
    data: LifecycleDescriptionResponse;
  }>('tickets/lifecycle');
  const accessRequest = useTicketsApi<{
    data: { actions: Record<string, boolean> };
  }>('tickets/access');
  const canComment = useTicketPermission('comment');
  const canAttach = useTicketPermission('attach');
  const manager = useService<ClientFileRepositoryManager>(
    clientFileRepositoryManagerToken,
  );
  const fileRepository = manager.repository('ticketFiles');
  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<unknown>();
  const [actionName, setActionName] = useState<string>();
  const [assigneeId, setAssigneeId] = useState('');
  const [resolution, setResolution] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [reason, setReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>();
  const engineersRequest = useTicketsApi<{ data: Engineer[] }>(
    actionName === 'assign' ? 'tickets/engineers' : null,
  );

  const ticket = detailRequest.data?.data;
  const lifecycle = ticket?.lifecycle;
  const permitted = useMemo(
    () => accessRequest.data?.data?.actions ?? {},
    [accessRequest.data?.data?.actions],
  );
  const available = useMemo(
    () =>
      (lifecycle?.available ?? []).filter(
        (item) => item.allowed && permitted[item.name],
      ),
    [lifecycle?.available, permitted],
  );
  const history = useMemo(
    () =>
      (lifecycle?.history.transitions ?? []).map((entry) => ({
        transition: entry.transition,
        from: entry.from,
        to: entry.to,
      })),
    [lifecycle?.history.transitions],
  );
  const fileRecords = useMemo(
    () => (ticket?.files ?? []) as FileRecord[],
    [ticket?.files],
  );

  const runAction = async (): Promise<void> => {
    if (!actionName || !ticket) return;
    setActionBusy(true);
    setActionError(undefined);
    try {
      await api.request({
        path: `tickets/${encodeURIComponent(ticket.id)}/fire`,
        method: 'POST',
        json: {
          transition: actionName,
          ...(actionName === 'assign' ? { assigneeId } : {}),
          ...(actionName === 'resolve' ? { resolution } : {}),
          ...(actionName === 'cancel' ? { cancelReason } : {}),
          ...(actionName === 'close' && closeNote.trim() ? { closeNote } : {}),
          ...(actionName === 'reopen' && reason.trim() ? { reason } : {}),
          requestId: crypto.randomUUID(),
          ...(lifecycle?.version != null
            ? { expectedVersion: lifecycle.version }
            : {}),
        },
      });
      toaster.show({
        type: 'success',
        title: t('helpdesk.detail.actionDone', {
          action: action(actionName),
        }),
      });
      setActionName(undefined);
      setAssigneeId('');
      setResolution('');
      setCancelReason('');
      setCloseNote('');
      setReason('');
      detailRequest.reload();
    } catch (next) {
      setActionError(next);
    } finally {
      setActionBusy(false);
    }
  };

  const addComment = async (): Promise<void> => {
    if (!ticket || comment.trim().length === 0) return;
    setCommentBusy(true);
    try {
      await api.request({
        path: `tickets/${encodeURIComponent(ticket.id)}/comments`,
        method: 'POST',
        json: { body: comment.trim() },
      });
      setComment('');
      detailRequest.reload();
    } catch (next) {
      toaster.show({
        type: 'error',
        title: t('helpdesk.detail.commentFailed'),
        description: errorText(next, ''),
      });
    } finally {
      setCommentBusy(false);
    }
  };

  const attach = async (records: readonly FileRecord[]): Promise<void> => {
    if (!ticket || records.length === 0) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      await api.request({
        path: `tickets/${encodeURIComponent(ticket.id)}/attachments`,
        method: 'POST',
        json: { attachmentIds: records.map((record) => record.id) },
      });
      detailRequest.reload();
    } catch (next) {
      setUploadError(next);
    } finally {
      setUploading(false);
    }
  };

  if (detailRequest.error) {
    return (
      <RouteChildPage>
        <PageContainer>
          <Alert variant='destructive'>
            <AlertDescription>
              {t('helpdesk.detail.loadFailed')}
              <span className='block text-xs opacity-80'>
                {errorText(detailRequest.error, '')}
              </span>
              <Button
                variant='outline'
                size='sm'
                onClick={detailRequest.reload}
              >
                {t('helpdesk.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        </PageContainer>
      </RouteChildPage>
    );
  }

  if (!ticket) {
    return (
      <RouteChildPage>
        <PageContainer>
          <Skeleton className='h-10 w-64' />
          <Skeleton className='h-72 w-full' />
        </PageContainer>
      </RouteChildPage>
    );
  }

  return (
    <RouteChildPage>
      <PageContainer>
        <div>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void navigate('/tickets')}
          >
            <ArrowLeftIcon />
            {t('helpdesk.detail.back')}
          </Button>
        </div>
        <PageHeader
          title={ticket.title}
          description={
            <span className='flex flex-wrap items-center gap-2'>
              <span className='font-mono'>{ticket.ticketNo}</span>
              <Badge variant={statusBadge(ticket.status)}>
                {status(ticket.status)}
              </Badge>
              <Badge variant='outline'>{priority(ticket.priority)}</Badge>
              <span>{category(ticket.category)}</span>
            </span>
          }
          actions={
            <div className='flex flex-wrap gap-2'>
              {available.map((item) => (
                <Button
                  key={item.name}
                  variant={item.name === 'cancel' ? 'destructive' : 'default'}
                  size='sm'
                  onClick={() => {
                    setActionError(undefined);
                    setActionName(item.name);
                  }}
                >
                  {action(item.name)}
                </Button>
              ))}
            </div>
          }
        />

        <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]'>
          <div className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>{t('helpdesk.detail.description')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='whitespace-pre-line text-sm leading-6'>
                  {ticket.description}
                </p>
              </CardContent>
            </Card>

            {ticket.resolution || ticket.cancelReason || ticket.closeNote ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('helpdesk.detail.outcome')}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3 text-sm'>
                  {ticket.resolution ? (
                    <div>
                      <p className='font-medium'>
                        {t('helpdesk.fields.resolution')}
                      </p>
                      <p className='whitespace-pre-line text-muted-foreground'>
                        {ticket.resolution}
                      </p>
                    </div>
                  ) : null}
                  {ticket.cancelReason ? (
                    <div>
                      <p className='font-medium'>
                        {t('helpdesk.fields.cancelReason')}
                      </p>
                      <p className='whitespace-pre-line text-muted-foreground'>
                        {ticket.cancelReason}
                      </p>
                    </div>
                  ) : null}
                  {ticket.closeNote ? (
                    <div>
                      <p className='font-medium'>
                        {t('helpdesk.fields.closeNote')}
                      </p>
                      <p className='whitespace-pre-line text-muted-foreground'>
                        {ticket.closeNote}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('helpdesk.detail.comments')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {ticket.comments.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('helpdesk.detail.noComments')}
                  </p>
                ) : (
                  <ol className='space-y-4'>
                    {ticket.comments.map((item) => (
                      <li key={item.id} className='rounded-lg border p-3'>
                        <p className='text-xs text-muted-foreground'>
                          <span className='font-mono'>{item.authorId}</span> ·{' '}
                          {formatDate(item.createdAt)}
                        </p>
                        <p className='mt-1 whitespace-pre-line text-sm'>
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                {canComment ? (
                  <div className='space-y-2'>
                    <Label htmlFor='ticket-comment'>
                      {t('helpdesk.detail.addComment')}
                    </Label>
                    <Textarea
                      id='ticket-comment'
                      rows={3}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder={t('helpdesk.detail.commentPlaceholder')}
                    />
                    <div className='flex justify-end'>
                      <Button
                        size='sm'
                        disabled={commentBusy || comment.trim().length === 0}
                        onClick={() => void addComment()}
                      >
                        <SendIcon />
                        {commentBusy
                          ? t('helpdesk.detail.sending')
                          : t('helpdesk.detail.send')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('helpdesk.detail.history')}</CardTitle>
              </CardHeader>
              <CardContent>
                {lifecycle?.history.transitions.length ? (
                  <ol className='space-y-3 text-sm'>
                    {lifecycle.history.transitions.map((entry) => (
                      <li key={entry.id} className='flex gap-3'>
                        <span className='mt-1 size-2 shrink-0 rounded-full bg-primary' />
                        <div>
                          <p className='font-medium'>
                            {transition(entry.transition)}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {entry.from ? `${state(entry.from)} → ` : ''}
                            {state(entry.to)} · {formatDate(entry.at)} ·{' '}
                            <span className='font-mono'>{entry.actorId}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('helpdesk.detail.noHistory')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>{t('helpdesk.detail.details')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <DetailRow label={t('helpdesk.fields.requester')}>
                  <span className='font-mono'>{ticket.requesterId}</span>
                </DetailRow>
                <DetailRow label={t('helpdesk.fields.assignee')}>
                  <span className='font-mono'>{ticket.assigneeId ?? '—'}</span>
                </DetailRow>
                <DetailRow label={t('helpdesk.fields.createdAt')}>
                  {formatDate(ticket.createdAt)}
                </DetailRow>
                <DetailRow label={t('helpdesk.fields.updatedAt')}>
                  {formatDate(ticket.updatedAt)}
                </DetailRow>
                <DetailRow label={t('helpdesk.fields.statusChangedAt')}>
                  {formatDate(ticket.statusChangedAt)}
                </DetailRow>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('helpdesk.fields.attachments')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {fileRecords.length ? (
                  <FilePreviewField
                    files={fileRecords}
                    labels={{ empty: t('helpdesk.attachments.empty') }}
                  />
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('helpdesk.attachments.empty')}
                  </p>
                )}
                {canAttach ? (
                  <div className='space-y-2 border-t pt-3'>
                    <Label>{t('helpdesk.attachments.add')}</Label>
                    <FileUploadField
                      repository={fileRepository}
                      value={[]}
                      multiple
                      maxFiles={5}
                      maxSize={10 * 1024 * 1024}
                      disabled={uploading}
                      labels={{
                        choose: t('helpdesk.attachments.choose'),
                        remove: t('helpdesk.attachments.remove'),
                        retry: t('helpdesk.retry'),
                      }}
                      onChange={(records) => void attach(records)}
                      onStatusChange={(next) =>
                        setUploading(next === 'uploading')
                      }
                      onError={setUploadError}
                    />
                    {uploading ? (
                      <p className='text-xs text-muted-foreground'>
                        {t('helpdesk.attachments.linking')}
                      </p>
                    ) : null}
                    {uploadError ? (
                      <p className='text-xs text-destructive'>
                        {errorText(uploadError, '')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('helpdesk.detail.process')}</CardTitle>
              </CardHeader>
              <CardContent>
                {lifecycleRequest.error ? (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      {t('helpdesk.workflow.loadFailed')}
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={lifecycleRequest.reload}
                      >
                        {t('helpdesk.retry')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : lifecycleRequest.data ? (
                  <LifecycleDiagram
                    description={lifecycleRequest.data.data.description}
                    currentState={ticket.status}
                    availableTransitions={available.map((item) => item.name)}
                    history={history}
                    stateLabel={(item) => state(item.name)}
                    transitionLabel={(item) => transition(item.name)}
                    ariaLabel={t('helpdesk.detail.process')}
                    autoHeight
                    showMiniMap={false}
                  />
                ) : (
                  <Skeleton className='h-52 w-full' />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog
          open={Boolean(actionName)}
          onOpenChange={(open) => {
            if (!open && !actionBusy) {
              setActionName(undefined);
              setActionError(undefined);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionName
                  ? t('helpdesk.detail.confirmAction', {
                      action: action(actionName),
                    })
                  : ''}
              </DialogTitle>
              <DialogDescription>
                {t('helpdesk.detail.actionHint')}
              </DialogDescription>
            </DialogHeader>
            {actionName ? (
              <div className='space-y-3'>
                {ACTION_FIELDS[actionName] === 'assignee' ? (
                  <div className='space-y-2'>
                    <Label>{t('helpdesk.fields.assignee')}</Label>
                    <Select
                      value={assigneeId}
                      onValueChange={(value) => setAssigneeId(value ?? '')}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue
                          placeholder={t('helpdesk.detail.chooseEngineer')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(engineersRequest.data?.data ?? []).map((engineer) => (
                          <SelectItem key={engineer.id} value={engineer.id}>
                            {engineer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {engineersRequest.error ? (
                      <p className='text-xs text-destructive'>
                        {errorText(engineersRequest.error, '')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {ACTION_FIELDS[actionName] === 'resolution' ? (
                  <div className='space-y-2'>
                    <Label htmlFor='ticket-resolution'>
                      {t('helpdesk.fields.resolution')}
                    </Label>
                    <Textarea
                      id='ticket-resolution'
                      rows={4}
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                    />
                  </div>
                ) : null}
                {ACTION_FIELDS[actionName] === 'cancel' ? (
                  <div className='space-y-2'>
                    <Label htmlFor='ticket-cancel'>
                      {t('helpdesk.fields.cancelReason')}
                    </Label>
                    <Textarea
                      id='ticket-cancel'
                      rows={3}
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                    />
                  </div>
                ) : null}
                {ACTION_FIELDS[actionName] === 'close' ? (
                  <div className='space-y-2'>
                    <Label htmlFor='ticket-close'>
                      {t('helpdesk.fields.closeNote')}
                    </Label>
                    <Textarea
                      id='ticket-close'
                      rows={3}
                      value={closeNote}
                      onChange={(event) => setCloseNote(event.target.value)}
                    />
                  </div>
                ) : null}
                {ACTION_FIELDS[actionName] === 'reason' ? (
                  <div className='space-y-2'>
                    <Label htmlFor='ticket-reason'>
                      {t('helpdesk.fields.reason')}
                    </Label>
                    <Input
                      id='ticket-reason'
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>
                ) : null}
                {actionError ? (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      {errorText(
                        actionError,
                        t('helpdesk.detail.actionFailed'),
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                variant='outline'
                disabled={actionBusy}
                onClick={() => setActionName(undefined)}
              >
                {t('helpdesk.cancel')}
              </Button>
              <Button
                disabled={
                  actionBusy ||
                  (actionName === 'assign' && !assigneeId) ||
                  (actionName === 'resolve' && !resolution.trim()) ||
                  (actionName === 'cancel' && !cancelReason.trim())
                }
                onClick={() => void runAction()}
              >
                {actionBusy
                  ? t('helpdesk.detail.working')
                  : t('helpdesk.detail.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </RouteChildPage>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className='text-muted-foreground'>{label}</span>
      <span>{children}</span>
    </div>
  );
}
