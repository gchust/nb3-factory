import { resolveAppUrl, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Bot, Paperclip, Share2, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  FileList as AttachmentList,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import {
  useServiceApi,
  type OrderShare,
  type OrderView,
  type AttachmentView,
} from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  OrderPriorityBadge,
  OrderStatusBadge,
} from '../shared.js';
import { formatBytes, formatDateTime } from '../format.js';

export default function OrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const params = useParams();
  const orderId = Number(params.id);
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);

  const state = useAsync(async () => {
    const [order, events, attachments, shares, me] = await Promise.all([
      api.order(orderId),
      api.orderEvents(orderId),
      api.attachments(orderId),
      api.shares(orderId).catch(() => []),
      api.me(),
    ]);
    return { order, events, attachments, shares, me };
  }, [api, orderId]);

  const refresh = (): void => {
    state.reload();
  };

  async function run(
    action: string,
    body?: Record<string, unknown>,
  ): Promise<void> {
    setBusy(true);
    try {
      await api.transition(
        orderId,
        action,
        typeof body?.comment === 'string' ? body.comment : undefined,
      );
      toaster.show({ type: 'success', title: t('service.order.actionDone') });
      refresh();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.order.actionFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (state.error) {
    return (
      <PageContainer>
        <ErrorBlock error={state.error} onRetry={refresh} />
      </PageContainer>
    );
  }
  if (!state.data) {
    return (
      <PageContainer>
        <LoadingBlock />
      </PageContainer>
    );
  }

  const { order, events, attachments, shares, me } = state.data;
  const summaryOnly = !order.can.view && order.can.viewSummary;

  return (
    <PageContainer>
      <PageHeader
        title={order.title}
        description={
          <span className='flex flex-wrap items-center gap-2'>
            <span className='font-mono text-xs'>{order.orderNo}</span>
            <OrderStatusBadge status={order.status} />
            <OrderPriorityBadge priority={order.priority} />
            {order.confidential ? (
              <Badge variant='destructive'>
                {t('service.order.confidential')}
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={refresh}
              disabled={state.loading}
            >
              {t('service.common.refresh')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              render={<Link to='/service/orders' />}
            >
              <ArrowLeft />
              {t('service.order.backToList')}
            </Button>
          </div>
        }
      />

      {summaryOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('service.order.summaryOnly')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            <p>
              {order.problemDescription ?? t('service.order.noDescription')}
            </p>
            <p className='text-muted-foreground'>
              {t('service.order.customer')}: {order.customer?.name ?? '—'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-6 lg:grid-cols-3'>
          <div className='space-y-6 lg:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.order.info')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <dl className='grid gap-3 sm:grid-cols-2'>
                  <Info
                    label={t('service.order.customer')}
                    value={order.customer?.name}
                  />
                  <Info
                    label={t('service.order.contact')}
                    value={[
                      order.customer?.contactName,
                      order.customer?.contactPhone,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                  <Info
                    label={t('service.order.device')}
                    value={
                      order.device
                        ? `${order.device.deviceNo} · ${order.device.name}`
                        : undefined
                    }
                  />
                  <Info
                    label={t('service.order.deviceLocation')}
                    value={order.device?.location}
                  />
                  <Info
                    label={t('service.order.assignee')}
                    value={order.assignee.name}
                  />
                  <Info
                    label={t('service.order.deadline')}
                    value={formatDateTime(order.deadline)}
                  />
                  <Info
                    label={t('service.order.acceptedAt')}
                    value={formatDateTime(order.acceptedAt)}
                  />
                  <Info
                    label={t('service.order.acceptanceNote')}
                    value={order.acceptanceNote}
                  />
                </dl>
                <Separator />
                <div>
                  <p className='mb-1 font-medium'>
                    {t('service.order.problemDescription')}
                  </p>
                  <p className='whitespace-pre-wrap text-muted-foreground'>
                    {order.problemDescription ??
                      t('service.order.noDescription')}
                  </p>
                </div>
                {order.resolution ? (
                  <div>
                    <p className='mb-1 font-medium'>
                      {t('service.order.resolution')}
                    </p>
                    <p className='whitespace-pre-wrap text-muted-foreground'>
                      {order.resolution}
                    </p>
                  </div>
                ) : null}
                {order.returnReason ? (
                  <div>
                    <p className='mb-1 font-medium'>
                      {t('service.order.returnReason')}
                    </p>
                    <p className='whitespace-pre-wrap text-muted-foreground'>
                      {order.returnReason}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('service.order.processTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {order.status === 'pending_accept' ? (
                  <p className='mb-3 text-sm text-muted-foreground'>
                    {t('service.order.awaitingAcceptance')}
                  </p>
                ) : null}
                {events.length === 0 ? (
                  <EmptyBlock />
                ) : (
                  <ol className='space-y-4'>
                    {events.map((event) => (
                      <li key={event.id} className='flex gap-3'>
                        <div className='mt-1.5 size-2 shrink-0 rounded-full bg-primary' />
                        <div className='min-w-0'>
                          <p className='text-sm font-medium'>
                            {t(`service.order.event.${event.action}`, {
                              defaultValue: event.action,
                            })}
                            {event.toStatus ? (
                              <span className='ml-2'>
                                <OrderStatusBadge status={event.toStatus} />
                              </span>
                            ) : null}
                          </p>
                          {event.comment ? (
                            <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                              {event.comment}
                            </p>
                          ) : null}
                          <p className='text-xs text-muted-foreground'>
                            {formatDateTime(event.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <AttachmentsCard
              api={api}
              orderId={orderId}
              attachments={attachments}
              canAttach={order.can.attach && order.status !== 'closed'}
              onChanged={refresh}
            />

            {order.can.supervise && !order.confidential ? (
              <SharesCard
                api={api}
                orderId={orderId}
                shares={shares}
                onChanged={refresh}
                selfId={me.userId}
              />
            ) : null}
          </div>

          <div className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.order.actions')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <TransitionActions
                  order={order}
                  busy={busy}
                  onRun={run}
                  onRetry={() => void run('retry-accept')}
                />
                {order.status === 'closed' ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.order.readOnly')}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Bot className='size-4' />
                  {t('service.assistant.entryTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  {t('service.assistant.entryHint')}
                </p>
                <Button
                  size='sm'
                  variant='outline'
                  render={
                    <Link
                      to={`/service/assistant?orderId=${orderId}`}
                    />
                  }
                >
                  <Sparkles />
                  {t('service.assistant.entryAction')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd>{value ? value : '—'}</dd>
    </div>
  );
}

function TransitionActions({
  order,
  busy,
  onRun,
  onRetry,
}: {
  order: OrderView;
  busy: boolean;
  onRun: (action: string, body?: Record<string, unknown>) => Promise<void>;
  onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [comment, setComment] = useState('');

  const buttons: ReactElement[] = [];
  if (order.status === 'pending_accept' && order.can.supervise) {
    buttons.push(
      <Button key='accept' disabled={busy} onClick={() => void onRun('accept')}>
        {t('service.order.accept')}
      </Button>,
      <Button key='retry' variant='outline' disabled={busy} onClick={onRetry}>
        {t('service.order.retryAccept')}
      </Button>,
    );
  }
  if (order.status === 'pending_process' && order.can.process) {
    buttons.push(
      <Button key='start' disabled={busy} onClick={() => void onRun('start')}>
        {t('service.order.startProcessing')}
      </Button>,
    );
  }
  if (order.status === 'processing' && order.can.process) {
    buttons.push(
      <Button key='submit' disabled={busy} onClick={() => setSubmitOpen(true)}>
        {t('service.order.submitForConfirmation')}
      </Button>,
    );
  }
  if (order.status === 'pending_confirm' && order.can.supervise) {
    buttons.push(
      <Button key='close' disabled={busy} onClick={() => void onRun('close')}>
        {t('service.order.close')}
      </Button>,
      <Button
        key='return'
        variant='outline'
        disabled={busy}
        onClick={() => setReturnOpen(true)}
      >
        {t('service.order.returnToProcessing')}
      </Button>,
    );
  }

  return (
    <>
      <div className='flex flex-wrap gap-2'>{buttons}</div>
      {buttons.length === 0 && order.status !== 'closed' ? (
        <p className='text-sm text-muted-foreground'>
          {t('service.order.noActions')}
        </p>
      ) : null}

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {t('service.order.submitForConfirmation')}
            </DialogTitle>
            <DialogDescription>
              {t('service.order.submitDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-2'>
            <Field>
              <FieldLabel htmlFor='order-resolution'>
                {t('service.order.resolution')}
              </FieldLabel>
              <Textarea
                id='order-resolution'
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setSubmitOpen(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button
              type='button'
              disabled={busy || !comment.trim()}
              onClick={() => {
                void onRun('submit', { comment: comment.trim() }).then(() => {
                  setComment('');
                  setSubmitOpen(false);
                });
              }}
            >
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('service.order.returnToProcessing')}</DialogTitle>
            <DialogDescription>
              {t('service.order.returnDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-2'>
            <Field>
              <FieldLabel htmlFor='order-return-reason'>
                {t('service.order.returnReason')}
              </FieldLabel>
              <Textarea
                id='order-return-reason'
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setReturnOpen(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button
              type='button'
              variant='destructive'
              disabled={busy || !comment.trim()}
              onClick={() => {
                void onRun('return', { comment: comment.trim() }).then(() => {
                  setComment('');
                  setReturnOpen(false);
                });
              }}
            >
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AttachmentsCard({
  api,
  orderId,
  attachments,
  canAttach,
  onChanged,
}: {
  api: ReturnType<typeof useServiceApi>;
  orderId: number;
  attachments: AttachmentView[];
  canAttach: boolean;
  onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const [uploading, setUploading] = useState(false);

  const records: FileRecord[] = useMemo(
    () =>
      attachments.map((item) => ({
        id: item.id,
        disk: 'local',
        key: item.id,
        filename: item.filename,
        ext: item.ext,
        mimeType: item.mimeType ?? '',
        size: item.size,
        kind: item.kind,
        createdAt: item.createdAt ?? '',
        updatedAt: item.createdAt ?? '',
        contentUrl: resolveAppUrl(
          `/api/service/orders/${orderId}/attachments/${item.id}/content`,
        ),
      })),
    [attachments, orderId],
  );

  async function upload(files: globalThis.FileList | null): Promise<void> {
    if (!files?.length) {
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadAttachment(orderId, file);
      }
      toaster.show({
        type: 'success',
        title: t('service.attachment.uploaded'),
      });
      onChanged();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.attachment.uploadFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
      // A failed upload must not discard files the user already selected.
      onChanged();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <CardTitle className='flex items-center gap-2'>
          <Paperclip className='size-4' />
          {t('service.attachment.title')}
        </CardTitle>
        {canAttach ? (
          <label className='inline-flex cursor-pointer items-center gap-2 text-sm'>
            <input
              type='file'
              accept='.png,.docx'
              multiple
              className='hidden'
              disabled={uploading}
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={uploading}
            >
              {uploading
                ? t('service.attachment.uploading')
                : t('service.attachment.upload')}
            </Button>
          </label>
        ) : null}
      </CardHeader>
      <CardContent>
        <AttachmentList
          files={records}
          labels={{ empty: t('service.attachment.empty') }}
          onDownload={(file) => {
            window.open(
              resolveAppUrl(
                `/api/service/orders/${orderId}/attachments/${file.id}/download`,
              ),
              '_blank',
              'noopener',
            );
          }}
          onRemove={
            canAttach
              ? async (file) => {
                  try {
                    await api.removeAttachment(orderId, file.id);
                    toaster.show({
                      type: 'success',
                      title: t('service.attachment.removed'),
                    });
                    onChanged();
                  } catch (error) {
                    toaster.show({
                      type: 'error',
                      title: t('service.attachment.removeFailed'),
                      description:
                        error instanceof Error ? error.message : undefined,
                    });
                  }
                }
              : undefined
          }
        />
        {records.length > 0 ? (
          <p className='mt-3 text-xs text-muted-foreground'>
            {records
              .map(
                (file) =>
                  `${file.filename} (${formatBytes(Number(file.size))})`,
              )
              .join(' · ')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SharesCard({
  api,
  orderId,
  shares,
  onChanged,
  selfId,
}: {
  api: ReturnType<typeof useServiceApi>;
  orderId: number;
  shares: OrderShare[];
  onChanged: () => void;
  selfId: string;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const engineers = useAsync(() => api.engineers(), [api]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const candidates = (engineers.data ?? []).filter(
    (engineer) =>
      engineer.userId !== null &&
      engineer.userId !== selfId &&
      !shares.some((share) => share.sharedWithId === engineer.userId),
  );

  async function share(): Promise<void> {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      await api.shareOrder(orderId, selected);
      toaster.show({ type: 'success', title: t('service.share.created') });
      setSelected('');
      onChanged();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.share.createFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Share2 className='size-4' />
          {t('service.share.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          {t('service.share.description')}
        </p>
        <div className='flex gap-2'>
          <Select
            value={selected}
            onValueChange={(value) => setSelected(String(value))}
          >
            <SelectTrigger className='w-56'>
              <SelectValue placeholder={t('service.share.selectEngineer')} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((engineer) => (
                <SelectItem key={engineer.id} value={engineer.userId ?? ''}>
                  {engineer.displayName ?? engineer.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            disabled={busy || !selected}
            onClick={() => void share()}
          >
            {t('service.share.add')}
          </Button>
        </div>
        {shares.length === 0 ? (
          <EmptyBlock title={t('service.share.none')} />
        ) : (
          <ul className='space-y-2 text-sm'>
            {shares.map((share) => (
              <li
                key={share.id}
                className='flex items-center justify-between gap-2'
              >
                <span>{share.sharedWithName ?? share.sharedWithId}</span>
                <Button
                  type='button'
                  size='xs'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void api
                      .revokeShare(orderId, share.id)
                      .then(() => {
                        toaster.show({
                          type: 'success',
                          title: t('service.share.revoked'),
                        });
                        onChanged();
                      })
                      .catch((error: unknown) => {
                        toaster.show({
                          type: 'error',
                          title: t('service.share.revokeFailed'),
                          description:
                            error instanceof Error ? error.message : undefined,
                        });
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  {t('service.share.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
