import { resolveAppUrl, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CheckCircle2,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useServiceApi } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import {
  ConfidentialBadge,
  ErrorState,
  PageLoading,
  PriorityBadge,
  StatusBadge,
  errorMessage,
  formatDateTime,
  isOverdue,
  useAsync,
} from '@/service/ui.js';
import type { ServiceAttachment } from '@/service/types.js';
import {
  FilePreviewDialog,
  type FileRecord,
} from '../../../extensions/nocobase-file-component-ui/index.js';

export default function WorkOrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const params = useParams();
  const orderId = params.id ?? '';
  const { session, isSupervisor, isObserver, isIntegration } = useSession();
  const order = useAsync(() => api.getWorkOrder(orderId), [orderId]);
  const engineers = useAsync(() => api.listEngineers(), []);

  const [dialog, setDialog] = useState<'submit' | 'return' | undefined>();
  const [remark, setRemark] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingAttachment, setRemovingAttachment] =
    useState<ServiceAttachment>();
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [uploading, setUploading] = useState<'photo' | 'report' | undefined>();
  const [shareTarget, setShareTarget] = useState('');

  const current = order.data;
  const isClosed = current?.status === 'closed';
  const isAssignee =
    Boolean(session?.userId) && current?.assigneeId === session?.userId;
  // A temporary share grants read-only assistance and a closed order is final,
  // so handling and writing stay with the supervisor or the assigned engineer.
  const canHandle = !isClosed && (isSupervisor || (isAssignee && !isObserver));
  const canShare = !isClosed && !isIntegration && (isSupervisor || isAssignee);
  const canWrite =
    !isClosed && !isObserver && !isIntegration && (isSupervisor || isAssignee);

  const run = async (
    action: string,
    extra?: { resolution?: string; note?: string },
  ): Promise<void> => {
    setBusy(true);
    try {
      await api.transition(orderId, action, extra);
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setDialog(undefined);
      setRemark('');
      order.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async (): Promise<void> => {
    if (!comment.trim()) {
      return;
    }
    try {
      await api.comment(orderId, comment.trim());
      setComment('');
      order.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    }
  };

  const upload = async (
    file: File | undefined,
    category: 'photo' | 'report',
  ): Promise<void> => {
    if (!file) {
      return;
    }
    setUploading(category);
    try {
      await api.uploadAttachment(orderId, file, category);
      toaster.show({
        type: 'success',
        title: t('service.attachments.uploaded'),
      });
      order.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setUploading(undefined);
    }
  };

  const removeAttachment = async (): Promise<void> => {
    if (!removingAttachment) {
      return;
    }
    try {
      await api.deleteAttachment(orderId, removingAttachment.id);
      toaster.show({ type: 'success', title: t('service.common.deleted') });
      setRemovingAttachment(undefined);
      order.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
      setRemovingAttachment(undefined);
    }
  };

  const share = async (): Promise<void> => {
    if (!shareTarget) {
      return;
    }
    try {
      await api.share(orderId, shareTarget);
      toaster.show({ type: 'success', title: t('service.share.shared') });
      setShareTarget('');
      order.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    }
  };

  const unshare = async (engineerId: string): Promise<void> => {
    try {
      await api.unshare(orderId, engineerId);
      toaster.show({ type: 'success', title: t('service.share.unshared') });
      order.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    }
  };

  if (order.loading) {
    return (
      <RouteChildPage>
        <PageContainer>
          <PageLoading />
        </PageContainer>
      </RouteChildPage>
    );
  }
  if (order.error || !current) {
    return (
      <RouteChildPage>
        <PageContainer>
          <ErrorState
            error={order.error ?? new Error('not found')}
            onRetry={order.reload}
          />
        </PageContainer>
      </RouteChildPage>
    );
  }

  const attachments = current.attachments ?? [];
  const shares = (current.shares ?? []).filter((row) => !row.revokedAt);
  // The stored file metadata lets the preview dialog render the real PNG and
  // DOCX content from the same protected content route used for download.
  const previewFiles: FileRecord[] = attachments.map((attachment) => ({
    id: String(attachment.id),
    disk: '',
    key: '',
    filename: attachment.filename || `attachment-${String(attachment.id)}`,
    ext: attachment.ext ?? '',
    mimeType: attachment.mimeType ?? '',
    size: attachment.size ?? 0,
    createdAt: attachment.createdAt ?? '',
    updatedAt: attachment.createdAt ?? '',
    contentUrl: resolveAppUrl(
      `/api/service/attachments/${String(attachment.id)}/content`,
    ),
  }));

  return (
    <RouteChildPage>
      <PageContainer>
        <Breadcrumbs />
        <PageHeader
          title={current.title}
          description={
            <span className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs'>{current.orderNo}</span>
              <StatusBadge status={current.status} />
              <PriorityBadge priority={current.priority} />
              {current.confidential ? <ConfidentialBadge /> : null}
              {isOverdue(current) ? (
                <span className='text-destructive'>
                  {t('service.workOrders.overdue')}
                </span>
              ) : null}
            </span>
          }
          actions={
            <div className='flex flex-wrap items-center gap-2'>
              {current.status === 'pending_accept' && isSupervisor ? (
                <Button disabled={busy} onClick={() => void run('accept')}>
                  <CheckCircle2 />
                  {t('service.actions.accept')}
                </Button>
              ) : null}
              {current.status === 'pending_process' && canHandle ? (
                <Button disabled={busy} onClick={() => void run('start')}>
                  <Play />
                  {t('service.actions.start')}
                </Button>
              ) : null}
              {current.status === 'processing' && canHandle ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setRemark('');
                    setDialog('submit');
                  }}
                >
                  <Send />
                  {t('service.actions.submit')}
                </Button>
              ) : null}
              {current.status === 'pending_confirm' && isSupervisor ? (
                <>
                  <Button disabled={busy} onClick={() => void run('confirm')}>
                    <CheckCircle2 />
                    {t('service.actions.confirm')}
                  </Button>
                  <Button
                    disabled={busy}
                    variant='outline'
                    onClick={() => {
                      setRemark('');
                      setDialog('return');
                    }}
                  >
                    <RotateCcw />
                    {t('service.actions.return')}
                  </Button>
                </>
              ) : null}
            </div>
          }
        />

        <div className='grid gap-6 lg:grid-cols-3'>
          <div className='space-y-6 lg:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.workOrders.fault')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4 text-sm'>
                <p className='whitespace-pre-wrap'>
                  {current.description || t('service.common.none')}
                </p>
                {current.resolution ? (
                  <div>
                    <p className='mb-1 font-medium'>
                      {t('service.workOrders.resolution')}
                    </p>
                    <p className='whitespace-pre-wrap text-muted-foreground'>
                      {current.resolution}
                    </p>
                  </div>
                ) : null}
                {current.lastReturnReason ? (
                  <div>
                    <p className='mb-1 font-medium text-destructive'>
                      {t('service.workOrders.returnReason')}
                    </p>
                    <p className='whitespace-pre-wrap text-muted-foreground'>
                      {current.lastReturnReason}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('service.attachments.title')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {canWrite ? (
                  <div className='space-y-3'>
                    <div className='flex flex-wrap gap-2'>
                      <label
                        aria-disabled={uploading !== undefined}
                        className={`inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${
                          uploading !== undefined
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-pointer'
                        }`}
                      >
                        <ImageIcon className='size-4' />
                        {t('service.attachments.addPhoto')}
                        <input
                          accept='image/png'
                          className='hidden'
                          disabled={uploading !== undefined}
                          type='file'
                          onChange={(event) => {
                            void upload(event.target.files?.[0], 'photo');
                            event.target.value = '';
                          }}
                        />
                      </label>
                      <label
                        aria-disabled={uploading !== undefined}
                        className={`inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${
                          uploading !== undefined
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-pointer'
                        }`}
                      >
                        <Upload className='size-4' />
                        {t('service.attachments.addReport')}
                        <input
                          accept='.docx'
                          className='hidden'
                          disabled={uploading !== undefined}
                          type='file'
                          onChange={(event) => {
                            void upload(event.target.files?.[0], 'report');
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {uploading ? (
                      <p
                        className='flex items-center gap-2 text-sm text-muted-foreground'
                        role='status'
                      >
                        <Loader2 className='size-4 animate-spin' />
                        {t('service.attachments.uploading')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {attachments.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.attachments.empty')}
                  </p>
                ) : (
                  <ul className='space-y-2'>
                    {attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className='flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm'
                      >
                        {attachment.category === 'photo' ? (
                          <img
                            alt=''
                            className='size-10 rounded object-cover'
                            src={resolveAppUrl(
                              `/api/service/attachments/${String(attachment.id)}/content`,
                            )}
                          />
                        ) : (
                          <FileText className='size-5 text-muted-foreground' />
                        )}
                        <div className='min-w-0 flex-1'>
                          <p className='truncate'>
                            {attachment.filename ||
                              t(
                                `service.attachments.category.${attachment.category}`,
                              )}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {formatDateTime(attachment.createdAt)}
                          </p>
                        </div>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() =>
                            setPreviewIndex(
                              previewFiles.findIndex(
                                (file) => file.id === String(attachment.id),
                              ),
                            )
                          }
                        >
                          <Eye />
                          {t('service.attachments.preview')}
                        </Button>
                        <a
                          className='text-sm underline underline-offset-4'
                          href={resolveAppUrl(
                            `/api/service/attachments/${String(attachment.id)}/content`,
                          )}
                        >
                          {t('service.attachments.download')}
                        </a>
                        {canWrite ? (
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            onClick={() => setRemovingAttachment(attachment)}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('service.workOrders.timeline')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {(current.activities ?? []).map((activity) => (
                  <div key={activity.id} className='text-sm'>
                    <div className='flex items-center justify-between'>
                      <span className='font-medium'>
                        {t(`service.activity.${activity.action}`)}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {formatDateTime(activity.createdAt)}
                      </span>
                    </div>
                    {typeof activity.detail === 'object' &&
                    activity.detail !== null &&
                    'note' in activity.detail ? (
                      <p className='text-muted-foreground'>
                        {String((activity.detail as { note?: unknown }).note)}
                      </p>
                    ) : null}
                    <Separator className='mt-3' />
                  </div>
                ))}
                {canWrite ? (
                  <div className='space-y-2 pt-2'>
                    <Textarea
                      placeholder={t('service.workOrders.commentPlaceholder')}
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                    />
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => void submitComment()}
                      disabled={!comment.trim()}
                    >
                      {t('service.workOrders.addComment')}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.workOrders.info')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <Info label={t('service.workOrders.customer')}>
                  {current.customer?.name ?? '—'}
                </Info>
                <Info label={t('service.workOrders.device')}>
                  {current.device
                    ? `${current.device.serialNumber} · ${current.device.name}`
                    : '—'}
                </Info>
                <Info label={t('service.workOrders.assignee')}>
                  {engineers.data?.find((row) => row.id === current.assigneeId)
                    ?.name ?? '—'}
                </Info>
                <Info label={t('service.workOrders.dueAt')}>
                  {formatDateTime(current.dueAt)}
                </Info>
                <Info label={t('service.workOrders.createdAt')}>
                  {formatDateTime(current.createdAt)}
                </Info>
                <Info label={t('service.workOrders.acceptedAt')}>
                  {formatDateTime(current.acceptedAt)}
                </Info>
                <Info label={t('service.workOrders.submittedAt')}>
                  {formatDateTime(current.submittedAt)}
                </Info>
                <Info label={t('service.workOrders.closedAt')}>
                  {formatDateTime(current.closedAt)}
                </Info>
                <Info label={t('service.workOrders.returnCount')}>
                  {current.returnCount ?? 0}
                </Info>
              </CardContent>
            </Card>

            {canShare ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('service.share.title')}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.share.description')}
                  </p>
                  {shares.length > 0 ? (
                    <ul className='space-y-2 text-sm'>
                      {shares.map((row) => (
                        <li
                          key={row.id}
                          className='flex items-center justify-between rounded-md border border-border px-3 py-2'
                        >
                          <span>
                            {engineers.data?.find(
                              (item) => item.id === row.sharedWithId,
                            )?.name ?? row.sharedWithId}
                          </span>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => void unshare(row.sharedWithId)}
                          >
                            {t('service.share.revoke')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('service.share.empty')}
                    </p>
                  )}
                  <div className='flex items-end gap-2'>
                    <div className='grid flex-1 gap-2'>
                      <Label>{t('service.share.engineer')}</Label>
                      <Select
                        items={(engineers.data ?? [])
                          .filter(
                            (engineer) =>
                              engineer.id !== current.assigneeId &&
                              !shares.some(
                                (row) => row.sharedWithId === engineer.id,
                              ),
                          )
                          .map((engineer) => ({
                            value: engineer.id,
                            label: engineer.name,
                          }))}
                        value={shareTarget}
                        onValueChange={(next) => setShareTarget(next ?? '')}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t('service.share.selectEngineer')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(engineers.data ?? [])
                            .filter(
                              (engineer) =>
                                engineer.id !== current.assigneeId &&
                                !shares.some(
                                  (row) => row.sharedWithId === engineer.id,
                                ),
                            )
                            .map((engineer) => (
                              <SelectItem key={engineer.id} value={engineer.id}>
                                {engineer.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant='outline'
                      disabled={!shareTarget}
                      onClick={() => void share()}
                    >
                      <UserPlus />
                      {t('service.share.share')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>

        <Dialog
          open={Boolean(dialog)}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog === 'return'
                  ? t('service.actions.return')
                  : t('service.actions.submit')}
              </DialogTitle>
              <DialogDescription>
                {dialog === 'return'
                  ? t('service.workOrders.returnDialogHint')
                  : t('service.workOrders.submitDialogHint')}
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-2'>
              <Label htmlFor='transition-remark'>
                {dialog === 'return'
                  ? t('service.workOrders.returnReason')
                  : t('service.workOrders.resolution')}
              </Label>
              <Textarea
                id='transition-remark'
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant='outline' onClick={() => setDialog(undefined)}>
                {t('actions.cancel')}
              </Button>
              <Button
                disabled={busy || !remark.trim()}
                onClick={() =>
                  void run(dialog === 'return' ? 'return' : 'submit', {
                    resolution: remark,
                    note: remark,
                  })
                }
              >
                {t('actions.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(removingAttachment)}
          onOpenChange={(open) => !open && setRemovingAttachment(undefined)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('service.attachments.deleteTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('service.attachments.deleteDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void removeAttachment()}>
                {t('service.common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FilePreviewDialog
          files={previewFiles}
          initialIndex={previewIndex ?? 0}
          open={previewIndex !== undefined}
          onOpenChange={(next) => {
            if (!next) {
              setPreviewIndex(undefined);
            }
          }}
          onError={(error) =>
            toaster.show({ type: 'error', title: errorMessage(error) })
          }
        />
      </PageContainer>
    </RouteChildPage>
  );
}

function Info({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex items-start justify-between gap-3'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right'>{children}</span>
    </div>
  );
}
