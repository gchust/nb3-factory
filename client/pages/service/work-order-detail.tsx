/**
 * Work order detail — the whole closed loop for one order.
 *
 * The server answers one call with everything this screen shows: the order, its
 * capability flags, its event timeline, its attachments and — for a supervisor
 * — its temporary shares. Every button is rendered from `capabilities`, and
 * every action reloads the same view so the timeline and the buttons reflect
 * what actually happened rather than what the page assumed.
 */
import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useService, useToaster } from '@nocobase/app-client';
import {
  ArrowLeftIcon,
  FileTextIcon,
  ImageIcon,
  Share2Icon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { FilePreviewDialog } from '../../extensions/nocobase-file-component-ui/index.js';

import { useServiceApi } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  PriorityBadge,
  ServicePage,
  StatusBadge,
} from './parts.js';
import type {
  AttachmentView,
  MemberView,
  ShareView,
  WorkOrderEventView,
  WorkOrderView,
} from './types.js';

export default function WorkOrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const params = useParams();
  const orderId = Number(params.workOrderId);

  const state = useLoad(
    useCallback(
      () => api.get<WorkOrderView>(`/work-orders/${orderId}`),
      [api, orderId],
    ),
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    'resolution' | 'close' | 'reject' | 'share' | null
  >(null);

  const act = async (
    label: string,
    run: () => Promise<unknown>,
  ): Promise<void> => {
    setBusy(label);
    try {
      await run();
      // A dialog action that succeeded has nothing left to collect, so it
      // closes. Leaving it open is what let a second Confirm re-post the same
      // action (a resolution submitted twice got a 409) and let the page keep
      // showing the previous step's dialog after the order had moved on. A
      // failure keeps the dialog open so the input is not lost.
      setDialog(null);
      state.reload();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(null);
    }
  };

  const order = state.data;

  return (
    <ServicePage
      title={
        order ? (
          <span className='flex flex-wrap items-center gap-3'>
            <span className='font-mono text-sm text-muted-foreground'>
              {order.orderNo}
            </span>
            {order.title}
            <StatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
            {order.confidential ? (
              <Badge variant='outline'>
                {t('service.workOrders.confidential')}
              </Badge>
            ) : null}
          </span>
        ) : (
          t('service.workOrders.detailTitle')
        )
      }
      description={t('service.workOrders.detailDescription')}
      actions={
        <Button variant='outline' render={<Link to='/service/work-orders' />}>
          <ArrowLeftIcon className='size-4' />
          {t('service.common.back')}
        </Button>
      }
    >
      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}

      {order ? (
        <div className='space-y-6'>
          <ActionBar
            order={order}
            busy={busy}
            onAccept={() => {
              void act('accept', () =>
                api.post(`/work-orders/${orderId}/accept`),
              );
            }}
            onRetryAcceptance={() => {
              void act('retry', () =>
                api.post(`/work-orders/${orderId}/retry-acceptance`),
              );
            }}
            onStart={() => {
              void act('start', () =>
                api.post(`/work-orders/${orderId}/start`),
              );
            }}
            onOpenDialog={setDialog}
          />

          <div className='grid gap-6 lg:grid-cols-2'>
            <SummaryCard order={order} />
            <DetailCard
              title={t('service.workOrders.problem')}
              body={order.problem}
            />
            <DetailCard
              title={t('service.workOrders.acceptance')}
              body={
                order.acceptanceNote ??
                (order.acceptNoteStatus === 'pending'
                  ? t('service.workOrders.acceptancePending')
                  : null)
              }
              extra={
                order.acceptedAt
                  ? `${t('service.workOrders.acceptedAt')}: ${formatDateTime(order.acceptedAt)}`
                  : undefined
              }
            />
            {order.capabilities.canViewInternalNotes ? (
              <DetailCard
                title={t('service.workOrders.resolution')}
                body={
                  order.resolution ?? t('service.workOrders.resolutionEmpty')
                }
                extra={
                  order.lastRejectReason
                    ? `${t('service.workOrders.lastReject')}: ${order.lastRejectReason}`
                    : undefined
                }
              />
            ) : null}
          </div>

          <TimelineCard events={order.events ?? []} />
          <AttachmentsCard
            order={order}
            orderId={orderId}
            onChanged={() => state.reload()}
          />
          {order.capabilities.canManageShares ? (
            <SharesCard
              order={order}
              orderId={orderId}
              shares={order.shares ?? []}
              onOpenShare={() => setDialog('share')}
              onRevoke={(shareId) => {
                void act('revoke', () =>
                  api.post(`/work-orders/${orderId}/shares/${shareId}/revoke`),
                );
              }}
            />
          ) : null}
        </div>
      ) : null}

      <TextAreaDialog
        open={dialog === 'resolution'}
        onOpenChange={(open) => setDialog(open ? 'resolution' : null)}
        title={t('service.workOrders.submitResolution')}
        description={t('service.workOrders.submitResolutionHint')}
        fieldName='resolution'
        label={t('service.workOrders.resolution')}
        required
        busy={busy === 'resolution'}
        onSubmit={(values) => {
          void act('resolution', () =>
            api.post(`/work-orders/${orderId}/resolution`, {
              resolution: values.resolution,
            }),
          );
        }}
      />
      <TextAreaDialog
        open={dialog === 'close'}
        onOpenChange={(open) => setDialog(open ? 'close' : null)}
        title={t('service.workOrders.close')}
        description={t('service.workOrders.closeHint')}
        fieldName='note'
        label={t('service.workOrders.closeNote')}
        busy={busy === 'close'}
        onSubmit={(values) => {
          void act('close', () =>
            api.post(`/work-orders/${orderId}/close`, { note: values.note }),
          );
        }}
      />
      <TextAreaDialog
        open={dialog === 'reject'}
        onOpenChange={(open) => setDialog(open ? 'reject' : null)}
        title={t('service.workOrders.reject')}
        description={t('service.workOrders.rejectHint')}
        fieldName='reason'
        label={t('service.workOrders.rejectReason')}
        required
        busy={busy === 'reject'}
        onSubmit={(values) => {
          void act('reject', () =>
            api.post(`/work-orders/${orderId}/reject`, {
              reason: values.reason,
            }),
          );
        }}
      />
      <ShareDialog
        open={dialog === 'share'}
        onOpenChange={(open) => setDialog(open ? 'share' : null)}
        excludedMemberId={order?.assignee?.id ?? null}
        busy={busy === 'share'}
        onSubmit={(values) => {
          void act('share', () =>
            api.post(`/work-orders/${orderId}/shares`, values),
          );
        }}
      />
    </ServicePage>
  );
}

function ActionBar({
  busy,
  onAccept,
  onOpenDialog,
  onRetryAcceptance,
  onStart,
  order,
}: {
  readonly busy: string | null;
  readonly onAccept: () => void;
  readonly onOpenDialog: (
    dialog: 'resolution' | 'close' | 'reject' | 'share',
  ) => void;
  readonly onRetryAcceptance: () => void;
  readonly onStart: () => void;
  readonly order: WorkOrderView;
}): ReactElement | null {
  const { t } = useTranslation();
  const caps = order.capabilities;
  const actions: ReactElement[] = [];
  if (caps.canAccept) {
    actions.push(
      <Button key='accept' disabled={busy !== null} onClick={onAccept}>
        {t('service.workOrders.accept')}
      </Button>,
    );
  }
  if (caps.canRetryAcceptance) {
    actions.push(
      <Button
        key='retry'
        variant='outline'
        disabled={busy !== null}
        onClick={onRetryAcceptance}
      >
        {t('service.workOrders.retryAcceptance')}
      </Button>,
    );
  }
  if (caps.canStart) {
    actions.push(
      <Button key='start' disabled={busy !== null} onClick={onStart}>
        {t('service.workOrders.start')}
      </Button>,
    );
  }
  if (caps.canSubmitResolution) {
    actions.push(
      <Button key='resolution' onClick={() => onOpenDialog('resolution')}>
        {t('service.workOrders.submitResolution')}
      </Button>,
    );
  }
  if (caps.canClose) {
    actions.push(
      <Button key='close' onClick={() => onOpenDialog('close')}>
        {t('service.workOrders.close')}
      </Button>,
    );
  }
  if (caps.canReject) {
    actions.push(
      <Button
        key='reject'
        variant='destructive'
        onClick={() => onOpenDialog('reject')}
      >
        {t('service.workOrders.reject')}
      </Button>,
    );
  }
  if (actions.length === 0) {
    return null;
  }
  return <div className='flex flex-wrap gap-2'>{actions}</div>;
}

function SummaryCard({
  order,
}: {
  readonly order: WorkOrderView;
}): ReactElement {
  const { t } = useTranslation();
  const rows: [string, ReactElement | string][] = [
    [t('service.workOrders.customer'), order.customer?.name ?? '—'],
    [
      t('service.workOrders.equipment'),
      order.equipment
        ? `${order.equipment.code ?? ''} ${order.equipment.name ?? ''}`.trim()
        : '—',
    ],
    [t('service.workOrders.assignee'), order.assignee?.name ?? '—'],
    [t('service.workOrders.deadline'), formatDateTime(order.deadline)],
    [t('service.workOrders.createdAt'), formatDateTime(order.createdAt)],
    [
      t('service.workOrders.sourceLabel'),
      t(`service.workOrders.source.${order.source ?? 'manual'}`),
    ],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>
          {t('service.workOrders.summary')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-2'>
        {rows.map(([label, value]) => (
          <div key={label} className='flex justify-between gap-4 text-sm'>
            <span className='text-muted-foreground'>{label}</span>
            <span className='text-right font-medium'>{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DetailCard({
  body,
  extra,
  title,
}: {
  readonly body: string | null;
  readonly extra?: string;
  readonly title: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>{title}</CardTitle>
        {extra ? <CardDescription>{extra}</CardDescription> : null}
      </CardHeader>
      <CardContent className='whitespace-pre-wrap text-sm'>
        {body ?? (
          <span className='text-muted-foreground'>
            {t('service.common.none')}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineCard({
  events,
}: {
  readonly events: readonly WorkOrderEventView[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>
          {t('service.workOrders.timeline')}
        </CardTitle>
        <CardDescription>
          {t('service.workOrders.timelineHint')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState message={t('service.workOrders.noEvents')} />
        ) : (
          <ol className='space-y-4'>
            {events.map((event) => (
              <li key={String(event.id)} className='flex gap-3'>
                <span className='mt-1.5 size-2 shrink-0 rounded-full bg-primary' />
                <div className='space-y-0.5'>
                  <p className='text-sm'>{event.message}</p>
                  <p className='text-xs text-muted-foreground'>
                    {formatDateTime(event.createdAt)}
                    {event.runId
                      ? ` · ${t('service.workOrders.workflowRun')}`
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function AttachmentsCard({
  onChanged,
  order,
  orderId,
}: {
  readonly onChanged: () => void;
  readonly order: WorkOrderView;
  readonly orderId: number;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const files = useService(clientFileRepositoryManagerToken);
  const toaster = useToaster();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<'photo' | 'report'>('photo');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const attachments = useMemo(
    () => order.attachments ?? [],
    [order.attachments],
  );

  const records = useMemo(
    () =>
      attachments.map((item) => ({
        id: item.id,
        disk: 'local',
        key: '',
        filename: item.filename,
        ext: (item.ext ?? '').replace(/^\./, ''),
        mimeType: item.mimeType ?? 'application/octet-stream',
        size: item.size,
        createdAt: item.createdAt ?? '',
        updatedAt: item.createdAt ?? '',
        contentUrl: item.contentUrl,
      })),
    [attachments],
  );

  const upload = async (file: File): Promise<void> => {
    const rejection = await validateAttachment(file, category);
    if (rejection) {
      toaster.show({
        type: 'error',
        title: t('service.workOrders.attachmentRejected'),
        description: t(rejection),
      });
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }
    setUploading(true);
    try {
      const repository = files.repository('serviceWorkOrderFiles');
      const result = await repository.uploadOne({ file });
      await api.post(`/work-orders/${orderId}/attachments`, {
        fileId: result.record.id,
        category,
      });
      onChanged();
    } catch (error) {
      api.report(error);
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const remove = async (item: AttachmentView): Promise<void> => {
    try {
      await api.del(`/work-orders/${orderId}/attachments/${item.id}`);
      onChanged();
    } catch (error) {
      api.report(error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>
          {t('service.workOrders.attachments')}
        </CardTitle>
        <CardDescription>
          {t('service.workOrders.attachmentsHint')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {order.capabilities.canUploadAttachment ? (
          <div className='flex flex-wrap items-end gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='attachment-category'>
                {t('service.workOrders.attachmentCategory')}
              </Label>
              <Select
                value={category}
                onValueChange={(value) =>
                  setCategory(value === 'report' ? 'report' : 'photo')
                }
              >
                <SelectTrigger id='attachment-category' className='w-40'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='photo'>
                    {t('service.workOrders.category.photo')}
                  </SelectItem>
                  <SelectItem value='report'>
                    {t('service.workOrders.category.report')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input
              ref={inputRef}
              type='file'
              className='hidden'
              accept={category === 'photo' ? 'image/png,image/jpeg' : '.docx'}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void upload(file);
                }
              }}
            />
            <Button
              variant='outline'
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon className='size-4' />
              {uploading
                ? t('service.common.uploading')
                : t('service.workOrders.uploadAttachment')}
            </Button>
          </div>
        ) : null}

        {attachments.length === 0 ? (
          <EmptyState message={t('service.workOrders.noAttachments')} />
        ) : (
          <div className='space-y-2'>
            {attachments.map((item, index) => (
              <div
                key={item.id}
                className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'
              >
                <button
                  type='button'
                  className='flex items-center gap-2 text-left text-sm hover:underline'
                  onClick={() => setPreview(index)}
                >
                  {item.category === 'photo' ? (
                    <ImageIcon className='size-4 text-muted-foreground' />
                  ) : (
                    <FileTextIcon className='size-4 text-muted-foreground' />
                  )}
                  <span>{item.filename}</span>
                  <Badge variant='outline'>
                    {t(`service.workOrders.category.${item.category}`)}
                  </Badge>
                </button>
                <div className='flex items-center gap-2'>
                  <span className='text-xs text-muted-foreground'>
                    {formatDateTime(item.createdAt)}
                  </span>
                  {order.capabilities.canUploadAttachment ? (
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('service.common.delete')}
                      onClick={() => void remove(item)}
                    >
                      <Trash2Icon className='size-3.5' />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <FilePreviewDialog
        files={records}
        initialIndex={preview ?? 0}
        open={preview !== null}
        onOpenChange={(open) => setPreview(open ? preview : null)}
        onError={(error) => api.report(error)}
      />
    </Card>
  );
}

function SharesCard({
  onOpenShare,
  onRevoke,
  order,
  orderId,
  shares,
}: {
  readonly onOpenShare: () => void;
  readonly onRevoke: (shareId: number) => void;
  readonly order: WorkOrderView;
  readonly orderId: number;
  readonly shares: readonly ShareView[];
}): ReactElement {
  const { t } = useTranslation();
  const active = shares.filter((share) => !share.revokedAt);
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>
          {t('service.workOrders.shares')}
        </CardTitle>
        <CardDescription>
          {order.confidential
            ? t('service.workOrders.sharesConfidential')
            : t('service.workOrders.sharesHint')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {order.capabilities.canShare ? (
          <Button variant='outline' onClick={onOpenShare}>
            <Share2Icon className='size-4' />
            {t('service.workOrders.share')}
          </Button>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('service.workOrders.sharesUnavailable')}
          </p>
        )}
        {active.length === 0 ? (
          <EmptyState message={t('service.workOrders.noShares')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('service.workOrders.engineer')}</TableHead>
                <TableHead>{t('service.workOrders.grantedAt')}</TableHead>
                <TableHead>{t('service.workOrders.shareNote')}</TableHead>
                <TableHead className='text-right'>
                  {t('service.common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((share) => (
                <TableRow key={String(share.id)}>
                  <TableCell>{share.engineer?.name ?? '—'}</TableCell>
                  <TableCell>{formatDateTime(share.grantedAt)}</TableCell>
                  <TableCell>{share.note ?? '—'}</TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => onRevoke(Number(share.id))}
                    >
                      {t('service.workOrders.revokeShare')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className='text-xs text-muted-foreground'>
          {t('service.workOrders.orderReference', { id: orderId })}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Reject a file before it reaches storage.
 *
 * The input's `accept` attribute is a filter the picker applies, not a promise:
 * a corrupt `corrupt.png` still matches `image/png` by name and arrives here, and
 * the server's category check only inspects the extension. Decoding the bytes is
 * the cheap way to tell a real image from a renamed file, and a `.docx` is a ZIP
 * container whose first bytes are `PK\x03\x04` — the same check that catches a
 * truncated download or an unrelated file saved with the wrong name.
 *
 * Returns the translation key of the reason, or `null` when the file is usable.
 */
async function validateAttachment(
  file: File,
  category: 'photo' | 'report',
): Promise<string | null> {
  if (file.size === 0) {
    return category === 'photo'
      ? 'service.workOrders.attachmentErrors.image'
      : 'service.workOrders.attachmentErrors.docx';
  }
  if (category === 'photo') {
    return (await decodesAsImage(file))
      ? null
      : 'service.workOrders.attachmentErrors.image';
  }
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip =
    signature[0] === 0x50 &&
    signature[1] === 0x4b &&
    signature[2] === 0x03 &&
    signature[3] === 0x04;
  return isZip ? null : 'service.workOrders.attachmentErrors.docx';
}

async function decodesAsImage(file: File): Promise<boolean> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const usable = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      return usable;
    } catch {
      return false;
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<boolean>((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(probe.naturalWidth > 0);
      probe.onerror = () => resolve(false);
      probe.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function TextAreaDialog({
  busy,
  description,
  fieldName,
  label,
  onOpenChange,
  onSubmit,
  open,
  required,
  title,
}: {
  readonly busy: boolean;
  readonly description: string;
  readonly fieldName: string;
  readonly label: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: Record<string, string>) => void;
  readonly open: boolean;
  readonly required?: boolean;
  readonly title: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onSubmit({ [fieldName]: formText(data, fieldName) });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor={`field-${fieldName}`}>{label}</FieldLabel>
              <Textarea
                id={`field-${fieldName}`}
                name={fieldName}
                rows={4}
                required={required}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  busy,
  excludedMemberId,
  onOpenChange,
  onSubmit,
  open,
}: {
  readonly busy: boolean;
  readonly excludedMemberId: number | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: {
    engineerMemberId: number;
    note: string;
  }) => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [engineerMemberId, setEngineerMemberId] = useState('');
  const [note, setNote] = useState('');
  const state = useLoad(
    useCallback(() => api.get<MemberView[]>('/engineers'), [api]),
  );
  const candidates = (state.data ?? []).filter(
    (row) => row.kind === 'engineer' && row.id !== excludedMemberId,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ engineerMemberId: Number(engineerMemberId), note });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('service.workOrders.share')}</DialogTitle>
            <DialogDescription>
              {t('service.workOrders.shareHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='share-engineer'>
                {t('service.workOrders.engineer')}
              </FieldLabel>
              <Select
                value={engineerMemberId}
                onValueChange={(value) => setEngineerMemberId(String(value))}
              >
                <SelectTrigger id='share-engineer' className='w-full'>
                  <SelectValue
                    placeholder={t('service.common.selectPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((row) => (
                    <SelectItem key={String(row.id)} value={String(row.id)}>
                      {row.name ?? row.ref ?? `#${row.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='share-note'>
                {t('service.workOrders.shareNote')}
              </FieldLabel>
              <Input
                id='share-note'
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !engineerMemberId}>
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
