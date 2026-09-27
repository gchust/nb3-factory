import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  PaperclipIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { FilePreviewField } from '@/extensions/nocobase-file-component-ui';

import {
  describeError,
  toFileRecords,
  useResource,
  useServiceApi,
  type AttachmentRecord,
  type Row,
} from '../../service/api.js';
import {
  asBoolean,
  asNumber,
  asText,
  formatAmount,
  formatBytes,
  formatDateTime,
} from '../../service/format.js';
import {
  FieldRow,
  InfoGrid,
  QueryState,
  RegionBadge,
  SectionCard,
  StatusBadge,
} from '../../service/ui.js';

interface TicketDetail extends Row {
  readonly id: number;
  readonly serial: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly region: string;
  readonly confidential: boolean;
  readonly overdue: boolean;
  readonly logs: readonly Row[];
  readonly shares: readonly Row[];
  readonly canShare: boolean;
  readonly canSeeInternalFields: boolean;
  readonly attachments: readonly AttachmentRecord[];
}

const ACTION_LABELS: Record<string, string> = {
  submit: 'service.tickets.action.submit',
  assign: 'service.tickets.action.assign',
  reassign: 'service.tickets.action.reassign',
  resolve: 'service.tickets.action.resolve',
  confirm: 'service.tickets.action.confirm',
  return: 'service.tickets.action.return',
  cancel: 'service.tickets.action.cancel',
  comment: 'service.tickets.action.comment',
};

const ACTIONS_FOR_STATUS: Record<string, readonly string[]> = {
  draft: ['submit', 'cancel', 'comment'],
  pending_assignment: ['assign', 'reassign', 'cancel', 'comment'],
  in_progress: ['reassign', 'resolve', 'cancel', 'comment'],
  pending_confirmation: ['confirm', 'return', 'reassign', 'comment'],
  closed: ['comment'],
  cancelled: ['comment'],
};

/** One ticket: its lifecycle actions, its attachments, its shares and its log. */
export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const params = useParams<{ ticketId: string }>();
  const ticketId = Number(params.ticketId);

  const ticket = useResource(`service:ticket:${ticketId}`, () =>
    api.getTicket(ticketId),
  );
  const detail = ticket.data as unknown as TicketDetail | undefined;

  const [action, setAction] = useState<string | null>(null);

  return (
    <PageContainer>
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          render={<Link to='/service/tickets' />}
        >
          <ArrowLeftIcon />
          {t('service.tickets.backToList')}
        </Button>
      </div>

      <QueryState
        loading={ticket.loading}
        error={ticket.error}
        onRetry={ticket.reload}
      >
        {detail ? (
          <>
            <PageHeader
              title={
                <span className='flex flex-wrap items-center gap-3'>
                  <span>{detail.serial}</span>
                  <StatusBadge kind='ticket' value={detail.status} />
                  <StatusBadge kind='priority' value={detail.priority} />
                  <RegionBadge value={detail.region} />
                  {detail.overdue ? (
                    <Badge variant='destructive'>
                      {t('service.tickets.overdue')}
                    </Badge>
                  ) : null}
                  {asBoolean(detail.confidential) ? (
                    <Badge variant='secondary'>
                      {t('service.tickets.confidential')}
                    </Badge>
                  ) : null}
                </span>
              }
              description={asText(detail.title)}
              actions={
                <Button variant='outline' size='sm' onClick={ticket.reload}>
                  {t('service.common.refresh')}
                </Button>
              }
            />

            <SectionCard title={t('service.tickets.overview')}>
              <InfoGrid>
                <FieldRow label={t('service.tickets.customer')}>
                  {asText(detail.customerName) || '—'}
                </FieldRow>
                <FieldRow label={t('service.tickets.device')}>
                  {asText(detail.deviceSerial) || '—'}
                </FieldRow>
                <FieldRow label={t('service.tickets.assignee')}>
                  {asText(detail.assigneeName) ||
                    t('service.tickets.unassigned')}
                </FieldRow>
                <FieldRow label={t('service.tickets.reporter')}>
                  {asText(detail.reporterName) || '—'}
                </FieldRow>
                <FieldRow label={t('service.tickets.createdAt')}>
                  {formatDateTime(detail.createdAt)}
                </FieldRow>
                <FieldRow label={t('service.tickets.dueAt')}>
                  {formatDateTime(detail.slaDueAt)}
                </FieldRow>
                <FieldRow label={t('service.tickets.descriptionColumn')}>
                  {asText(detail.description) || '—'}
                </FieldRow>
                <FieldRow label={t('service.tickets.resolution')}>
                  {asText(detail.resolution) || '—'}
                </FieldRow>
              </InfoGrid>
            </SectionCard>

            <SectionCard
              title={t('service.tickets.internalFields')}
              description={
                detail.canSeeInternalFields
                  ? t('service.tickets.internalFieldsVisible')
                  : t('service.tickets.internalFieldsHidden')
              }
            >
              {detail.canSeeInternalFields ? (
                <InfoGrid>
                  <FieldRow label={t('service.tickets.laborCost')}>
                    {formatAmount(detail.laborCost)}
                  </FieldRow>
                  <FieldRow label={t('service.tickets.partsCost')}>
                    {formatAmount(detail.partsCost)}
                  </FieldRow>
                  <FieldRow label={t('service.tickets.internalNotes')}>
                    {asText(detail.internalNotes) || '—'}
                  </FieldRow>
                </InfoGrid>
              ) : (
                <Alert>
                  <AlertTitle>
                    {t('service.tickets.financialHiddenTitle')}
                  </AlertTitle>
                  <AlertDescription>
                    {t('service.tickets.financialHidden')}
                  </AlertDescription>
                </Alert>
              )}
            </SectionCard>

            <SectionCard title={t('service.tickets.actions')}>
              <div className='flex flex-wrap gap-2'>
                {(ACTIONS_FOR_STATUS[detail.status] ?? ['comment']).map(
                  (candidate) => (
                    <Button
                      key={candidate}
                      variant={
                        candidate === 'cancel' ? 'destructive' : 'outline'
                      }
                      size='sm'
                      onClick={() => setAction(candidate)}
                    >
                      {t(ACTION_LABELS[candidate] ?? candidate, {
                        defaultValue: candidate,
                      })}
                    </Button>
                  ),
                )}
              </div>
            </SectionCard>

            <AttachmentsCard
              ticketId={ticketId}
              attachments={detail.attachments}
              onChanged={ticket.reload}
            />

            <SharesCard
              ticketId={ticketId}
              shares={detail.shares}
              canShare={detail.canShare}
              onChanged={ticket.reload}
            />

            <SectionCard title={t('service.tickets.logs')}>
              <LogTimeline logs={detail.logs} />
            </SectionCard>

            {action ? (
              <TicketActionDialog
                action={action}
                ticketId={ticketId}
                open
                onOpenChange={(next) => {
                  if (!next) setAction(null);
                }}
                onDone={() => {
                  setAction(null);
                  ticket.reload();
                }}
                canSeeInternalFields={detail.canSeeInternalFields}
              />
            ) : null}
          </>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}

function LogTimeline({
  logs,
}: {
  readonly logs: readonly Row[];
}): ReactElement {
  const { t } = useTranslation();
  if (logs.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.common.empty')}
      </p>
    );
  }
  return (
    <ol className='space-y-4'>
      {logs.map((log) => (
        <li key={asNumber(log.id) ?? 0} className='flex gap-3'>
          <div className='mt-1.5 size-2 shrink-0 rounded-full bg-primary' />
          <div className='min-w-0 flex-1 space-y-1'>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <Badge
                variant={log.kind === 'acceptance' ? 'secondary' : 'outline'}
              >
                {t(`service.tickets.logKind.${asText(log.kind)}`, {
                  defaultValue: asText(log.kind),
                })}
              </Badge>
              <span className='font-medium'>
                {t(`service.tickets.logAction.${asText(log.action)}`, {
                  defaultValue: asText(log.action),
                })}
              </span>
              {log.stepStatus ? (
                <Badge
                  variant={
                    asText(log.stepStatus) === 'passed'
                      ? 'default'
                      : asText(log.stepStatus) === 'failed'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {t(`service.tickets.stepStatus.${asText(log.stepStatus)}`, {
                    defaultValue: asText(log.stepStatus),
                  })}
                </Badge>
              ) : null}
              <span className='text-xs text-muted-foreground'>
                {formatDateTime(log.createdAt)}
              </span>
            </div>
            <p className='text-sm text-muted-foreground'>
              {asText(log.content)}
            </p>
            {log.actorName ? (
              <p className='text-xs text-muted-foreground'>
                {t('service.tickets.byActor', { name: asText(log.actorName) })}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

interface AttachmentsCardProps {
  readonly ticketId: number;
  readonly attachments: readonly AttachmentRecord[];
  readonly onChanged: () => void;
}

function AttachmentsCard({
  ticketId,
  attachments,
  onChanged,
}: AttachmentsCardProps): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      await api.uploadAttachment(file, { ticketId });
      toast.add({ type: 'success', title: t('service.common.uploaded') });
      onChanged();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.uploadFailed'),
        description: describeError(error),
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (id: string): Promise<void> => {
    try {
      await api.deleteAttachment(id);
      toast.add({ type: 'success', title: t('service.common.deleted') });
      onChanged();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.deleteFailed'),
        description: describeError(error),
      });
    }
  };

  return (
    <SectionCard
      title={t('service.tickets.attachments')}
      description={t('service.tickets.attachmentsDescription')}
      actions={
        <div>
          <input
            ref={inputRef}
            type='file'
            className='hidden'
            accept='.png,.jpg,.jpeg,.pdf,.docx,.xlsx,.pptx'
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            variant='outline'
            size='sm'
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <UploadIcon />
            {uploading
              ? t('service.common.uploading')
              : t('service.common.upload')}
          </Button>
        </div>
      }
    >
      <div className='space-y-4'>
        <FilePreviewField
          files={toFileRecords(attachments)}
          showFilenames
          emptyState={
            <p className='text-sm text-muted-foreground'>
              {t('service.common.empty')}
            </p>
          }
        />
        {attachments.length > 0 ? (
          <>
            <Separator />
            <ul className='space-y-2'>
              {attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className='flex items-center justify-between gap-3 text-sm'
                >
                  <span className='flex min-w-0 items-center gap-2'>
                    <PaperclipIcon className='size-4 shrink-0 text-muted-foreground' />
                    <span className='truncate'>{attachment.filename}</span>
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      {formatBytes(attachment.size)}
                    </span>
                  </span>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('service.common.delete')}
                    onClick={() => void remove(attachment.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}

interface SharesCardProps {
  readonly ticketId: number;
  readonly shares: readonly Row[];
  readonly canShare: boolean;
  readonly onChanged: () => void;
}

function SharesCard({
  ticketId,
  shares,
  canShare,
  onChanged,
}: SharesCardProps): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const accounts = useResource(
    'service:accounts',
    () => api.accounts(),
    canShare,
  );
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const accountItems = (accounts.data ?? []).map((account) => ({
    value: asText(account.id),
    label: `${asText(account.name)} · ${asText(account.email)}`,
  }));

  const add = async (): Promise<void> => {
    const account = (accounts.data ?? []).find(
      (item) => asText(item.id) === userId,
    );
    if (!account) return;
    setSaving(true);
    try {
      await api.shareTicket(ticketId, {
        userId,
        userName: asText(account.name),
        reason,
      });
      toast.add({ type: 'success', title: t('service.tickets.shared') });
      setUserId('');
      setReason('');
      onChanged();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (shareUserId: string): Promise<void> => {
    try {
      await api.unshareTicket(ticketId, shareUserId);
      toast.add({ type: 'success', title: t('service.tickets.unshared') });
      onChanged();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    }
  };

  return (
    <SectionCard
      title={t('service.tickets.shares')}
      description={t('service.tickets.sharesDescription')}
    >
      <div className='space-y-4'>
        {shares.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('service.common.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('service.tickets.collaborator')}</TableHead>
                <TableHead>{t('service.tickets.reason')}</TableHead>
                <TableHead>{t('service.tickets.sharedAt')}</TableHead>
                {canShare ? (
                  <TableHead>{t('service.common.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shares.map((share) => (
                <TableRow key={asText(share.id)}>
                  <TableCell>{asText(share.userName)}</TableCell>
                  <TableCell>{asText(share.reason) || '—'}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {formatDateTime(share.createdAt)}
                  </TableCell>
                  {canShare ? (
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('service.common.delete')}
                        onClick={() => void remove(asText(share.userId))}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {canShare ? (
          <div className='flex flex-wrap items-end gap-2'>
            <div className='min-w-56 space-y-2'>
              <Label>{t('service.tickets.collaborator')}</Label>
              <Select
                items={accountItems}
                value={userId || null}
                onValueChange={(value: string | null) => setUserId(value ?? '')}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='min-w-56 flex-1 space-y-2'>
              <Label htmlFor='share-reason'>
                {t('service.tickets.reason')}
              </Label>
              <Input
                id='share-reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button disabled={saving || !userId} onClick={() => void add()}>
              {t('service.tickets.share')}
            </Button>
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              {t('service.tickets.shareDenied')}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </SectionCard>
  );
}

interface TicketActionDialogProps {
  readonly action: string;
  readonly ticketId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: () => void;
  readonly canSeeInternalFields: boolean;
}

const REASON_ACTIONS = new Set(['reassign', 'return', 'cancel']);
const ASSIGNEE_ACTIONS = new Set(['assign', 'reassign']);

function TicketActionDialog({
  action,
  ticketId,
  open,
  onOpenChange,
  onDone,
  canSeeInternalFields,
}: TicketActionDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const accounts = useResource(
    `service:accounts:${action}`,
    () => api.accounts(),
    ASSIGNEE_ACTIONS.has(action),
  );
  const requestKey = useMemo(
    () => `${action}:${crypto.randomUUID()}`,
    [action],
  );
  const [assigneeId, setAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const [comment, setComment] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const accountItems = (accounts.data ?? []).map((account) => ({
    value: asText(account.id),
    label: `${asText(account.name)} · ${asText(account.email)}`,
  }));

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      const account = (accounts.data ?? []).find(
        (item) => asText(item.id) === assigneeId,
      );
      await api.ticketAction(ticketId, {
        action,
        idempotencyKey: requestKey,
        payload: {
          assigneeId: assigneeId || undefined,
          assigneeName: account ? asText(account.name) : undefined,
          reason: reason || undefined,
          resolution: resolution || undefined,
          comment: comment || undefined,
          laborCost: laborCost === '' ? undefined : Number(laborCost),
          partsCost: partsCost === '' ? undefined : Number(partsCost),
          internalNotes: internalNotes || undefined,
        },
      });
      toast.add({ type: 'success', title: t('service.tickets.actionDone') });
      onDone();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.tickets.actionFailed'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t(ACTION_LABELS[action] ?? action, { defaultValue: action })}
          </DialogTitle>
          <DialogDescription>
            {t('service.tickets.actionDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          {ASSIGNEE_ACTIONS.has(action) ? (
            <div className='space-y-2'>
              <Label>{t('service.tickets.assignee')}</Label>
              <Select
                items={accountItems}
                value={assigneeId || null}
                onValueChange={(value: string | null) =>
                  setAssigneeId(value ?? '')
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {REASON_ACTIONS.has(action) ? (
            <div className='space-y-2'>
              <Label htmlFor='action-reason'>
                {t('service.tickets.reason')}
              </Label>
              <Textarea
                id='action-reason'
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          ) : null}

          {action === 'resolve' ? (
            <>
              <div className='space-y-2'>
                <Label htmlFor='action-resolution'>
                  {t('service.tickets.resolution')}
                </Label>
                <Textarea
                  id='action-resolution'
                  rows={3}
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                />
              </div>
              {canSeeInternalFields ? (
                <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-2'>
                    <Label htmlFor='action-labor'>
                      {t('service.tickets.laborCost')}
                    </Label>
                    <Input
                      id='action-labor'
                      type='number'
                      value={laborCost}
                      onChange={(event) => setLaborCost(event.target.value)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='action-parts'>
                      {t('service.tickets.partsCost')}
                    </Label>
                    <Input
                      id='action-parts'
                      type='number'
                      value={partsCost}
                      onChange={(event) => setPartsCost(event.target.value)}
                    />
                  </div>
                  <div className='col-span-2 space-y-2'>
                    <Label htmlFor='action-notes'>
                      {t('service.tickets.internalNotes')}
                    </Label>
                    <Textarea
                      id='action-notes'
                      rows={2}
                      value={internalNotes}
                      onChange={(event) => setInternalNotes(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {action === 'comment' ? (
            <div className='space-y-2'>
              <Label htmlFor='action-comment'>
                {t('service.tickets.comment')}
              </Label>
              <Textarea
                id='action-comment'
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          ) : null}

          {action === 'confirm' ? (
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox checked readOnly />
              {t('service.tickets.confirmHint')}
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('service.common.cancel')}
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? t('service.common.saving') : t('service.common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
