import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { FileIcon, PlusIcon, TrashIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { PageContainer } from '@/components/page-container.js';
import { RouteDrawer } from '@/components/route-drawer.js';
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/service/badges.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { formatBytes, formatDateTime } from '@/components/service/format.js';
import { SelectField } from '@/components/service/select-field.js';
import { RequestError } from '@/components/service/states.js';
import type {
  AttachmentView,
  ShareTargetView,
  WorkOrderAction,
  WorkOrderDetailView,
} from '@/components/service/types.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient } from '@/hooks/use-service-api.js';

/** Which extra input a lifecycle action insists on, if any. */
const REQUIRED_FIELD: Partial<
  Record<WorkOrderAction, 'remark' | 'failureReason' | 'closeSummary'>
> = {
  submit: 'remark',
  reject: 'failureReason',
  close: 'closeSummary',
};

const ACTIONS: readonly WorkOrderAction[] = [
  'accept',
  'start',
  'submit',
  'confirm',
  'reject',
  'close',
  'reopen',
];

export default function WorkOrderDetailPage(): ReactElement | null {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const client = useClient();
  const [transition, setTransition] = useState<WorkOrderAction | null>(null);
  const [remark, setRemark] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareWith, setShareWith] = useState('');
  const [shareNote, setShareNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<'photo' | 'report'>('photo');

  const query = useApiQuery<{ data: WorkOrderDetailView }>(
    `/workOrders/${id}`,
    undefined,
    {
      enabled: id.length > 0,
    },
  );
  const detail = query.data?.data;
  const shareAllowed = useCan(
    {
      resource: { type: 'composite', id: 'service.workOrders' },
      action: 'share',
    },
    { enabled: detail !== undefined },
  );
  const attachAllowed = useCan(
    {
      resource: { type: 'composite', id: 'service.workOrders' },
      action: 'attach',
    },
    { enabled: detail !== undefined },
  );
  const targets = useApiQuery<{ data: readonly ShareTargetView[] }>(
    '/workOrders/shareTargets',
    {},
    { enabled: detail !== undefined && shareAllowed.can },
  );

  const targetOptions = useMemo(
    () =>
      (targets.data?.data ?? [])
        .filter((target) => !target.disabled)
        .map((target) => ({
          value: target.id,
          label: target.name,
        })),
    [targets.data],
  );

  const runTransition = async () => {
    if (!transition) return;
    const field = REQUIRED_FIELD[transition];
    await client.request({
      path: `/workOrders/${id}/actions/${transition}`,
      method: 'POST',
      json: {
        idempotencyKey: crypto.randomUUID(),
        ...(field ? { [field]: remark.trim() } : {}),
        ...(transition === 'reopen' && remark.trim()
          ? { remark: remark.trim() }
          : {}),
      },
    });
    query.reload();
  };

  const upload = async (file: File) => {
    const body = new FormData();
    body.set('file', file);
    body.set('category', category);
    await client.request({
      path: `/workOrders/${id}/attachments`,
      method: 'POST',
      body,
    });
    query.reload();
  };

  const removeAttachment = async (attachment: AttachmentView) => {
    await client.request({
      path: `/workOrders/${id}/attachments/${attachment.id}`,
      method: 'DELETE',
    });
    query.reload();
  };

  const addShare = async () => {
    await client.request({
      path: `/workOrders/${id}/shares`,
      method: 'POST',
      json: { sharedWithId: shareWith, note: shareNote.trim() || null },
    });
    setShareOpen(false);
    setShareWith('');
    setShareNote('');
    query.reload();
  };

  const revokeShare = async (shareId: string) => {
    await client.request({
      path: `/workOrders/${id}/shares/${shareId}`,
      method: 'DELETE',
    });
    query.reload();
  };

  if (!id) return null;

  const order = detail?.order;
  const field = transition ? REQUIRED_FIELD[transition] : undefined;

  return (
    <RouteDrawer
      title={order ? `${order.orderNo} · ${order.title}` : t('service.workOrder.detail')}
      description={
        order ? (
          <span className='flex items-center gap-2'>
            <WorkOrderStatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
          </span>
        ) : undefined
      }
      closeTo={{ pathname: '/workOrders', search: '' }}
      className='sm:max-w-2xl'
    >
      <PageContainer className='p-0'>
        {query.error ? (
          <RequestError error={query.error} onRetry={query.reload} />
        ) : null}

        {order ? (
          <div className='space-y-6'>
            {order.overdueSince ? (
              <p className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {t('service.workOrder.overdueNotice')}
              </p>
            ) : null}

            {detail.allowedActions.length > 0 ? (
              <div className='flex flex-wrap gap-2'>
                {ACTIONS.filter((action) =>
                  detail.allowedActions.includes(action),
                ).map((action) => (
                  <Button
                    key={action}
                    size='sm'
                    variant={
                      action === 'reject' || action === 'reopen'
                        ? 'destructive'
                        : 'default'
                    }
                    onClick={() => {
                      setRemark('');
                      setTransition(action);
                    }}
                  >
                    {t(`service.workOrder.action.${action}`, {
                      defaultValue: action,
                    })}
                  </Button>
                ))}
              </div>
            ) : null}

            <dl className='grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2'>
              <Detail label={t('service.workOrder.customer')}>
                {order.customerName ?? '—'}
              </Detail>
              <Detail label={t('service.workOrder.device')}>
                {order.deviceName ?? order.deviceCode ?? '—'}
              </Detail>
              <Detail label={t('service.workOrder.assignee')}>
                {order.assigneeName ?? '—'}
              </Detail>
              <Detail label={t('service.workOrder.group')}>
                {order.groupName ?? '—'}
              </Detail>
              <Detail label={t('service.workOrder.createdBy')}>
                {order.createdByName ?? '—'}
              </Detail>
              <Detail label={t('service.workOrder.createdAt')}>
                {formatDateTime(order.createdAt)}
              </Detail>
              <Detail label={t('service.workOrder.lastActivity')}>
                {formatDateTime(order.lastActivityAt)}
              </Detail>
              <Detail label={t('service.workOrder.confidentialLabel')}>
                {order.confidential
                  ? t('service.workOrder.confidentialYes')
                  : t('service.workOrder.confidentialNo')}
              </Detail>
              {order.closedAt ? (
                <Detail label={t('service.workOrder.closedAt')}>
                  {formatDateTime(order.closedAt)}
                </Detail>
              ) : null}
              {order.reopenCount > 0 ? (
                <Detail label={t('service.workOrder.reopenCount')}>
                  {order.reopenCount}
                </Detail>
              ) : null}
            </dl>

            {order.description ? (
              <section className='space-y-1'>
                <h3 className='text-sm font-medium'>
                  {t('service.workOrder.description')}
                </h3>
                <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                  {order.description}
                </p>
              </section>
            ) : null}

            {order.closeSummary ? (
              <section className='space-y-1'>
                <h3 className='text-sm font-medium'>
                  {t('service.workOrder.closeSummary')}
                </h3>
                <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                  {order.closeSummary}
                </p>
              </section>
            ) : null}

            {order.failureReason ? (
              <section className='space-y-1'>
                <h3 className='text-sm font-medium text-destructive'>
                  {t('service.workOrder.failureReason')}
                </h3>
                <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                  {order.failureReason}
                </p>
              </section>
            ) : null}

            {detail.executions.length > 0 ? (
              <section className='space-y-3'>
                <h3 className='text-sm font-medium'>
                  {t('service.workOrder.timeline')}
                </h3>
                <ol className='space-y-3 border-l border-border pl-4'>
                  {detail.executions.map((execution) => (
                    <li key={execution.id} className='space-y-1 text-sm'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium'>
                          {t(`service.workOrder.action.${execution.action}`, {
                            defaultValue: execution.action,
                          })}
                        </span>
                        <span className='text-xs text-muted-foreground'>
                          {formatDateTime(execution.createdAt)} ·{' '}
                          {execution.operatorName ??
                            t('service.workOrder.system')}
                        </span>
                      </div>
                      {execution.detail ? (
                        <p className='whitespace-pre-wrap text-muted-foreground'>
                          {execution.detail}
                        </p>
                      ) : null}
                      {execution.failureReason ? (
                        <p className='whitespace-pre-wrap text-destructive'>
                          {execution.failureReason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h3 className='text-sm font-medium'>
                  {t('service.workOrder.attachments')}
                </h3>
                {attachAllowed.can ? (
                  <div className='flex items-center gap-2'>
                    <SelectField
                      value={category}
                      onValueChange={(value) =>
                        setCategory(value as 'photo' | 'report')
                      }
                      options={[
                        { value: 'photo', label: t('service.file.photo') },
                        { value: 'report', label: t('service.file.report') },
                      ]}
                    />
                    <input
                      ref={fileInput}
                      type='file'
                      accept='image/png,.docx'
                      className='hidden'
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void upload(file).catch(() => undefined);
                        }
                        event.target.value = '';
                      }}
                    />
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => fileInput.current?.click()}
                    >
                      <PlusIcon />
                      {t('service.file.upload')}
                    </Button>
                  </div>
                ) : null}
              </div>
              {detail.attachments.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.file.empty')}
                </p>
              ) : (
                <ul className='space-y-2'>
                  {detail.attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className='flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm'
                    >
                      <a
                        href={attachment.contentUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='flex items-center gap-2 hover:underline'
                      >
                        {attachment.category === 'photo' ? (
                          <img
                            src={attachment.contentUrl}
                            alt={attachment.filename}
                            className='size-10 shrink-0 rounded border border-border object-cover'
                          />
                        ) : (
                          <FileIcon className='size-4' />
                        )}
                        <span>{attachment.filename}</span>
                        <span className='text-xs text-muted-foreground'>
                          {formatBytes(attachment.size)}
                        </span>
                        <Badge variant='secondary'>
                          {attachment.category === 'photo'
                            ? t('service.file.photo')
                            : t('service.file.report')}
                        </Badge>
                      </a>
                      {attachAllowed.can ? (
                        <Button
                          size='icon'
                          variant='ghost'
                          aria-label={t('service.file.remove')}
                          onClick={() => void removeAttachment(attachment)}
                        >
                          <TrashIcon />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {shareAllowed.can ? (
              <section className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-sm font-medium'>
                    {t('service.workOrder.shares')}
                  </h3>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setShareOpen(true)}
                  >
                    {t('service.workOrder.shareAdd')}
                  </Button>
                </div>
                {detail.shares.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.workOrder.shareEmpty')}
                  </p>
                ) : (
                  <ul className='space-y-2'>
                    {detail.shares.map((share) => (
                      <li
                        key={share.id}
                        className='flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm'
                      >
                        <span>
                          {share.sharedWithName ?? share.sharedWithId}
                          {share.active ? null : (
                            <span className='ml-2 text-xs text-muted-foreground'>
                              {t('service.workOrder.shareRevoked')}
                            </span>
                          )}
                        </span>
                        {share.active ? (
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => void revokeShare(share.id)}
                          >
                            {t('service.workOrder.shareRevoke')}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </PageContainer>

      <FormDialog
        open={transition !== null}
        onOpenChange={(open) => {
          if (!open) setTransition(null);
        }}
        title={
          transition
            ? t(`service.workOrder.action.${transition}`, {
                defaultValue: transition,
              })
            : ''
        }
        onSubmit={runTransition}
        canSubmit={!field || remark.trim().length > 0}
      >
        {field ? (
          <Field
            label={t(`service.workOrder.${field}`)}
            htmlFor='transition-input'
            hint={
              transition === 'submit'
                ? t('service.workOrder.processingNoteHint')
                : undefined
            }
          >
            <Textarea
              id='transition-input'
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
            />
          </Field>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('service.workOrder.transitionConfirm')}
          </p>
        )}
      </FormDialog>

      <FormDialog
        open={shareOpen}
        onOpenChange={(open) => {
          if (!open) setShareOpen(false);
        }}
        title={t('service.workOrder.shareAdd')}
        onSubmit={addShare}
        canSubmit={shareWith.length > 0}
      >
        <Field label={t('service.workOrder.shareWith')} htmlFor='share-with'>
          <SelectField
            id='share-with'
            value={shareWith || null}
            onValueChange={setShareWith}
            options={targetOptions}
            placeholder={t('service.workOrder.shareWithPlaceholder')}
            className='w-full'
          />
        </Field>
        <Field label={t('service.workOrder.shareNote')} htmlFor='share-note'>
          <Input
            id='share-note'
            value={shareNote}
            onChange={(event) => setShareNote(event.target.value)}
          />
        </Field>
      </FormDialog>
    </RouteDrawer>
  );
}

function Detail({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
