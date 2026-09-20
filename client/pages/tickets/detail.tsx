import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  PlayCircle,
  Send,
  XCircle,
} from 'lucide-react';
import {
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { AttachmentList } from '@/components/repair/attachment-list';
import { AttachmentUpload } from '@/components/repair/attachment-upload';
import { PriorityBadge, StatusBadge } from '@/components/repair/badges';
import { DataState } from '@/components/repair/data-state';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  ATTACHMENT_CATEGORY_KEYS,
  errorKey,
  formatDateTime,
  repairApi,
  type Attachment,
} from '@/lib/repair-api';
import { useApiData, useRepairMeta, useRepairSession } from '@/lib/use-repair';

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactElement {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{value || '—'}</dd>
    </div>
  );
}

export default function TicketDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const params = useParams();
  const ticketId = Number(params.id ?? 0);
  const session = useRepairSession();
  const meta = useRepairMeta();
  const detail = useApiData(`repair/ticket:${ticketId}`, (api) =>
    repairApi.ticket(api, ticketId),
  );
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dispatchValues, setDispatchValues] = useState({
    assigneeId: '',
    dueAt: '',
    remark: '',
  });
  const [workValues, setWorkValues] = useState({
    faultCause: '',
    repairProcess: '',
    laborCost: '0',
    remark: '',
  });
  const [acceptRemark, setAcceptRemark] = useState('');
  const [rejectRemark, setRejectRemark] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [settleRemark, setSettleRemark] = useState('');
  const [materialValues, setMaterialValues] = useState({
    materialId: '',
    quantity: '1',
    remark: '',
  });

  const ticket = detail.data;
  const capabilities = ticket?.capabilities;
  const role = session.data?.user.role;
  const userId = session.data?.user.userId;

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setActionError(undefined);
    setBusy(true);
    try {
      await action();
      detail.reload();
    } catch (cause) {
      const mapped = errorKey(cause);
      setActionError(t(mapped.key, { defaultValue: mapped.fallback }));
    } finally {
      setBusy(false);
    }
  };

  const isAssignee = Boolean(ticket && userId && ticket.assigneeId === userId);
  const isReporter = Boolean(ticket && userId && ticket.reporterId === userId);
  const openForWork = Boolean(
    ticket && ['assigned', 'in_progress', 'rework'].includes(ticket.status),
  );

  const canEditCategory = (category: string): boolean => {
    if (!ticket || !capabilities) return false;
    if (category === 'fault') {
      return (
        (isReporter || capabilities.dispatch) &&
        !['completed', 'cancelled'].includes(ticket.status)
      );
    }
    if (category === 'receipt') return capabilities.settle;
    return (capabilities.work && isAssignee) || capabilities.dispatch;
  };

  const byCategory = (category: string): Attachment[] =>
    (ticket?.attachments ?? []).filter((item) => item.category === category);

  const submitDispatch = (event: FormEvent): void => {
    event.preventDefault();
    void run(() =>
      repairApi.action(api, ticketId, 'dispatch', {
        assigneeId: dispatchValues.assigneeId,
        dueAt: dispatchValues.dueAt
          ? new Date(dispatchValues.dueAt).toISOString()
          : undefined,
        remark: dispatchValues.remark,
      }),
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title={
          ticket
            ? `${ticket.ticketNo} · ${ticket.title}`
            : t('repair.ticket.title', { defaultValue: 'Repair ticket' })
        }
        description={
          ticket ? (
            <span className='flex flex-wrap items-center gap-2'>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {ticket.overdue ? (
                <Badge variant='destructive'>
                  {t('repair.tickets.overdue', { defaultValue: 'Overdue' })}
                </Badge>
              ) : null}
              {ticket.reworkCount > 0 ? (
                <Badge variant='outline'>
                  {t('repair.ticket.reworkCount', {
                    count: ticket.reworkCount,
                    defaultValue: 'Reworked {{count}}×',
                  })}
                </Badge>
              ) : null}
            </span>
          ) : null
        }
        actions={
          <Button variant='outline' render={<Link to='/tickets' />}>
            <ArrowLeft aria-hidden='true' />
            {t('repair.form.back', { defaultValue: 'Back to list' })}
          </Button>
        }
      />

      <DataState
        loading={detail.loading}
        error={detail.error}
        onRetry={detail.reload}
      >
        {ticket ? (
          <div className='grid gap-4 lg:grid-cols-3'>
            <div className='space-y-4 lg:col-span-2'>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('repair.ticket.info', {
                      defaultValue: 'Request details',
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className='grid gap-4 sm:grid-cols-3'>
                    <Field
                      label={t('repair.ticket.building', {
                        defaultValue: 'Building',
                      })}
                      value={ticket.buildingName}
                    />
                    <Field
                      label={t('repair.ticket.room', { defaultValue: 'Room' })}
                      value={ticket.roomNumber}
                    />
                    <Field
                      label={t('repair.ticket.equipment', {
                        defaultValue: 'Equipment',
                      })}
                      value={ticket.equipmentName}
                    />
                    <Field
                      label={t('repair.ticket.location', {
                        defaultValue: 'Location',
                      })}
                      value={ticket.location}
                    />
                    <Field
                      label={t('repair.ticket.faultType', {
                        defaultValue: 'Fault type',
                      })}
                      value={t(`repair.faultType.${ticket.faultType}`, {
                        defaultValue: ticket.faultType,
                      })}
                    />
                    <Field
                      label={t('repair.ticket.reporter', {
                        defaultValue: 'Reporter',
                      })}
                      value={ticket.reporterName}
                    />
                    <Field
                      label={t('repair.ticket.contact', {
                        defaultValue: 'Contact',
                      })}
                      value={`${ticket.contactName} ${ticket.contactPhone}`}
                    />
                    <Field
                      label={t('repair.ticket.created', {
                        defaultValue: 'Created',
                      })}
                      value={formatDateTime(ticket.createdAt)}
                    />
                    <Field
                      label={t('repair.ticket.due', { defaultValue: 'Due' })}
                      value={formatDateTime(ticket.dueAt)}
                    />
                    <Field
                      label={t('repair.ticket.assignee', {
                        defaultValue: 'Technician',
                      })}
                      value={ticket.assigneeName}
                    />
                    <Field
                      label={t('repair.ticket.started', {
                        defaultValue: 'Started',
                      })}
                      value={formatDateTime(ticket.startedAt)}
                    />
                    <Field
                      label={t('repair.ticket.finished', {
                        defaultValue: 'Submitted',
                      })}
                      value={formatDateTime(ticket.finishedAt)}
                    />
                  </dl>
                  <Separator className='my-4' />
                  <p className='whitespace-pre-wrap text-sm'>
                    {ticket.description}
                  </p>
                  {ticket.faultCause ? (
                    <>
                      <Separator className='my-4' />
                      <p className='text-xs text-muted-foreground'>
                        {t('repair.ticket.faultCause', {
                          defaultValue: 'Cause',
                        })}
                      </p>
                      <p className='whitespace-pre-wrap text-sm'>
                        {ticket.faultCause}
                      </p>
                    </>
                  ) : null}
                  {ticket.repairProcess ? (
                    <>
                      <p className='mt-3 text-xs text-muted-foreground'>
                        {t('repair.ticket.process', {
                          defaultValue: 'Repair process',
                        })}
                      </p>
                      <p className='whitespace-pre-wrap text-sm'>
                        {ticket.repairProcess}
                      </p>
                    </>
                  ) : null}
                  {ticket.cancelReason ? (
                    <p className='mt-3 text-sm text-destructive'>
                      {t('repair.ticket.cancelReason', {
                        defaultValue: 'Cancelled:',
                      })}{' '}
                      {ticket.cancelReason}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('repair.ticket.attachments', {
                      defaultValue: 'Attachments',
                    })}
                  </CardTitle>
                  <CardDescription>
                    {t('repair.ticket.attachmentsHint', {
                      defaultValue:
                        'Photos before and after the repair, inspection reports and receipts.',
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-6'>
                  {ATTACHMENT_CATEGORY_KEYS.map((category) => (
                    <section
                      key={category}
                      className='space-y-2'
                      data-category={category}
                    >
                      <h3 className='text-sm font-medium'>
                        {t(`repair.category.${category}`, {
                          defaultValue: category,
                        })}
                      </h3>
                      <AttachmentList
                        attachments={byCategory(category)}
                        canEdit={canEditCategory(category)}
                        onChanged={detail.reload}
                        previewFiles={ticket.attachments}
                      />
                      {canEditCategory(category) ? (
                        <AttachmentUpload
                          ticketId={ticket.id}
                          category={category}
                          disabled={busy}
                          onUploaded={detail.reload}
                          labels={{
                            choose: t(`repair.upload.${category}`, {
                              defaultValue: 'Upload',
                            }),
                          }}
                        />
                      ) : null}
                    </section>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('repair.ticket.timeline', { defaultValue: 'History' })}
                  </CardTitle>
                  <CardDescription>
                    {t('repair.ticket.timelineHint', {
                      defaultValue:
                        'A rejected ticket keeps its earlier submissions here.',
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className='space-y-3'>
                    {ticket.events.map((event) => (
                      <li key={event.id} className='flex gap-3 text-sm'>
                        <span className='mt-1 size-2 shrink-0 rounded-full bg-primary' />
                        <div>
                          <p>
                            {t(`repair.event.${event.type}`, {
                              defaultValue: event.type,
                            })}
                            {event.toStatus
                              ? ` → ${t(`repair.status.${event.toStatus}`, { defaultValue: event.toStatus })}`
                              : ''}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {event.operatorName ?? '—'} ·{' '}
                            {formatDateTime(event.createdAt)}
                          </p>
                          {event.remark ? (
                            <p className='text-xs text-muted-foreground'>
                              {event.remark}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>

            <div className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('repair.ticket.actions', { defaultValue: 'Actions' })}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {actionError ? (
                    <p className='text-sm text-destructive' role='alert'>
                      {actionError}
                    </p>
                  ) : null}

                  {capabilities?.dispatch &&
                  ['pending_dispatch', 'rework'].includes(ticket.status) ? (
                    <form className='space-y-2' onSubmit={submitDispatch}>
                      <p className='text-sm font-medium'>
                        {t('repair.action.dispatch', {
                          defaultValue: 'Assign a technician',
                        })}
                      </p>
                      <Select
                        value={dispatchValues.assigneeId}
                        onValueChange={(value) =>
                          setDispatchValues((current) => ({
                            ...current,
                            assigneeId: value ?? '',
                          }))
                        }
                      >
                        <SelectTrigger
                          aria-label={t('repair.action.dispatch', {
                            defaultValue: 'Assign a technician',
                          })}
                        >
                          <SelectValue
                            placeholder={t('repair.form.choose', {
                              defaultValue: 'Choose…',
                            })}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(meta.data?.technicians ?? []).map((technician) => (
                            <SelectItem
                              key={technician.userId}
                              value={technician.userId}
                            >
                              {technician.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type='datetime-local'
                        aria-label={t('repair.action.dueAt', {
                          defaultValue: 'Due at',
                        })}
                        value={dispatchValues.dueAt}
                        onChange={(event) => {
                          // Read the value synchronously: React nulls out `currentTarget` once the handler returns,
                          // and a state updater may run later (see the finish form below).
                          const value = event.currentTarget.value;
                          setDispatchValues((current) => ({
                            ...current,
                            dueAt: value,
                          }));
                        }}
                      />
                      <Button
                        type='submit'
                        disabled={
                          busy ||
                          !dispatchValues.assigneeId ||
                          !dispatchValues.dueAt
                        }
                      >
                        <Send aria-hidden='true' />
                        {t('repair.action.dispatchSubmit', {
                          defaultValue: 'Dispatch',
                        })}
                      </Button>
                    </form>
                  ) : null}

                  {ticket.capabilities.work &&
                  isAssignee &&
                  openForWork &&
                  ticket.status !== 'in_progress' ? (
                    <Button
                      type='button'
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          repairApi.action(api, ticket.id, 'start'),
                        )
                      }
                    >
                      <PlayCircle aria-hidden='true' />
                      {t('repair.action.start', { defaultValue: 'Start work' })}
                    </Button>
                  ) : null}

                  {ticket.capabilities.work && isAssignee && openForWork ? (
                    <form
                      className='space-y-2'
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(() =>
                          repairApi.action(api, ticket.id, 'finish', {
                            faultCause: workValues.faultCause,
                            repairProcess: workValues.repairProcess,
                            laborCost: Number(workValues.laborCost) || 0,
                            remark: workValues.remark,
                          }),
                        );
                      }}
                    >
                      <p className='text-sm font-medium'>
                        {t('repair.action.finish', {
                          defaultValue: 'Submit for acceptance',
                        })}
                      </p>
                      <Input
                        placeholder={t('repair.ticket.faultCause', {
                          defaultValue: 'Cause',
                        })}
                        aria-label={t('repair.ticket.faultCause', {
                          defaultValue: 'Cause',
                        })}
                        value={workValues.faultCause}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setWorkValues((current) => ({
                            ...current,
                            faultCause: value,
                          }));
                        }}
                      />
                      <Textarea
                        placeholder={t('repair.ticket.process', {
                          defaultValue: 'Repair process',
                        })}
                        aria-label={t('repair.ticket.process', {
                          defaultValue: 'Repair process',
                        })}
                        value={workValues.repairProcess}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setWorkValues((current) => ({
                            ...current,
                            repairProcess: value,
                          }));
                        }}
                      />
                      <Input
                        type='number'
                        min={0}
                        step='0.01'
                        aria-label={t('repair.ticket.labor', {
                          defaultValue: 'Labor cost',
                        })}
                        value={workValues.laborCost}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setWorkValues((current) => ({
                            ...current,
                            laborCost: value,
                          }));
                        }}
                      />
                      <p className='text-xs text-muted-foreground'>
                        {t('repair.action.finishHint', {
                          defaultValue:
                            'An after-repair photo and an inspection report are required before submitting.',
                        })}
                      </p>
                      <Button type='submit' disabled={busy}>
                        <ClipboardCheck aria-hidden='true' />
                        {t('repair.action.finishSubmit', {
                          defaultValue: 'Submit',
                        })}
                      </Button>
                    </form>
                  ) : null}

                  {ticket.status === 'pending_acceptance' &&
                  (isReporter || capabilities?.accept) ? (
                    <div className='space-y-2'>
                      <Textarea
                        placeholder={t('repair.action.remark', {
                          defaultValue: 'Remark',
                        })}
                        aria-label={t('repair.action.remark', {
                          defaultValue: 'Remark',
                        })}
                        value={acceptRemark}
                        onChange={(event) =>
                          setAcceptRemark(event.currentTarget.value)
                        }
                      />
                      <Button
                        type='button'
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            repairApi.action(api, ticket.id, 'accept', {
                              remark: acceptRemark,
                            }),
                          )
                        }
                      >
                        <CheckCircle2 aria-hidden='true' />
                        {t('repair.action.accept', { defaultValue: 'Accept' })}
                      </Button>
                      <Textarea
                        placeholder={t('repair.action.rejectReason', {
                          defaultValue: 'Reason for rejection (required)',
                        })}
                        aria-label={t('repair.action.rejectReason', {
                          defaultValue: 'Reason for rejection (required)',
                        })}
                        value={rejectRemark}
                        onChange={(event) =>
                          setRejectRemark(event.currentTarget.value)
                        }
                      />
                      <Button
                        type='button'
                        variant='destructive'
                        disabled={busy || !rejectRemark}
                        onClick={() =>
                          void run(() =>
                            repairApi.action(api, ticket.id, 'reject', {
                              remark: rejectRemark,
                            }),
                          )
                        }
                      >
                        <XCircle aria-hidden='true' />
                        {t('repair.action.reject', {
                          defaultValue: 'Send back for rework',
                        })}
                      </Button>
                    </div>
                  ) : null}

                  {capabilities?.settle &&
                  ticket.status === 'completed' &&
                  !ticket.settlement ? (
                    <div className='space-y-2'>
                      <Input
                        placeholder={t('repair.action.settleRemark', {
                          defaultValue: 'Settlement remark',
                        })}
                        aria-label={t('repair.action.settleRemark', {
                          defaultValue: 'Settlement remark',
                        })}
                        value={settleRemark}
                        onChange={(event) =>
                          setSettleRemark(event.currentTarget.value)
                        }
                      />
                      <Button
                        type='button'
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            repairApi.action(api, ticket.id, 'settle', {
                              remark: settleRemark,
                            }),
                          )
                        }
                      >
                        {t('repair.action.settle', {
                          defaultValue: 'Create settlement',
                        })}
                      </Button>
                    </div>
                  ) : null}

                  {(isReporter || capabilities?.cancel) &&
                  !['completed', 'cancelled'].includes(ticket.status) ? (
                    <div className='space-y-2'>
                      <Input
                        placeholder={t('repair.action.cancelReason', {
                          defaultValue: 'Reason for cancellation (required)',
                        })}
                        aria-label={t('repair.action.cancelReason', {
                          defaultValue: 'Reason for cancellation (required)',
                        })}
                        value={cancelReason}
                        onChange={(event) =>
                          setCancelReason(event.currentTarget.value)
                        }
                      />
                      <Button
                        type='button'
                        variant='outline'
                        disabled={busy || !cancelReason}
                        onClick={() =>
                          void run(() =>
                            repairApi.action(api, ticket.id, 'cancel', {
                              reason: cancelReason,
                            }),
                          )
                        }
                      >
                        {t('repair.action.cancel', {
                          defaultValue: 'Cancel ticket',
                        })}
                      </Button>
                    </div>
                  ) : null}

                  {role ? (
                    <p className='text-xs text-muted-foreground'>
                      {t('repair.ticket.signedInAs', {
                        role: t(`repair.roles.${role}`, { defaultValue: role }),
                        defaultValue: 'Signed in as {{role}}',
                      })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('repair.ticket.materials', {
                      defaultValue: 'Materials',
                    })}
                  </CardTitle>
                  <CardDescription>
                    {t('repair.ticket.materialsHint', {
                      defaultValue:
                        'Consumed materials belong to this ticket; unused ones can be returned.',
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {ticket.materials.length ? (
                    <ul className='space-y-2 text-sm'>
                      {ticket.materials.map((usage) => (
                        <li
                          key={usage.id}
                          className='flex items-center justify-between gap-2 rounded-md border p-2'
                        >
                          <span>
                            {usage.materialName} × {usage.quantity} {usage.unit}
                            <span className='ml-2 text-xs text-muted-foreground'>
                              ¥{usage.cost.toFixed(2)}
                            </span>
                            {usage.status === 'returned' ? (
                              <Badge variant='secondary' className='ml-2'>
                                {t('repair.material.returned', {
                                  defaultValue: 'Returned',
                                })}
                              </Badge>
                            ) : null}
                          </span>
                          {usage.status === 'consumed' &&
                          ((capabilities?.work && isAssignee) ||
                            capabilities?.stockIn) &&
                          !['completed', 'cancelled'].includes(
                            ticket.status,
                          ) ? (
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  repairApi.returnMaterial(api, usage.id, {}),
                                )
                              }
                            >
                              {t('repair.material.return', {
                                defaultValue: 'Return',
                              })}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('repair.ticket.noMaterials', {
                        defaultValue: 'No materials consumed.',
                      })}
                    </p>
                  )}
                  {capabilities?.work && isAssignee && openForWork ? (
                    <form
                      className='space-y-2'
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(() =>
                          repairApi.action(api, ticket.id, 'materials', {
                            materialId: Number(materialValues.materialId),
                            quantity: Number(materialValues.quantity),
                            remark: materialValues.remark,
                          }),
                        );
                      }}
                    >
                      <Select
                        value={materialValues.materialId}
                        onValueChange={(value) =>
                          setMaterialValues((current) => ({
                            ...current,
                            materialId: value ?? '',
                          }))
                        }
                      >
                        <SelectTrigger
                          aria-label={t('repair.material.choose', {
                            defaultValue: 'Material',
                          })}
                        >
                          <SelectValue
                            placeholder={t('repair.form.choose', {
                              defaultValue: 'Choose…',
                            })}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(meta.data?.materials ?? []).map((material) => (
                            <SelectItem
                              key={material.id}
                              value={String(material.id)}
                            >
                              {material.name} (库存 {material.stock})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type='number'
                        min={0.01}
                        step='0.01'
                        aria-label={t('repair.material.quantity', {
                          defaultValue: 'Quantity',
                        })}
                        value={materialValues.quantity}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setMaterialValues((current) => ({
                            ...current,
                            quantity: value,
                          }));
                        }}
                      />
                      <Button
                        type='submit'
                        disabled={busy || !materialValues.materialId}
                      >
                        {t('repair.material.consume', {
                          defaultValue: 'Consume',
                        })}
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('repair.ticket.costs', { defaultValue: 'Costs' })}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <div className='flex justify-between'>
                    <span>
                      {t('repair.ticket.materialCost', {
                        defaultValue: 'Materials',
                      })}
                    </span>
                    <span className='tabular-nums'>
                      ¥{ticket.materialCost.toFixed(2)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span>
                      {t('repair.ticket.labor', { defaultValue: 'Labor cost' })}
                    </span>
                    <span className='tabular-nums'>
                      ¥{ticket.laborCost.toFixed(2)}
                    </span>
                  </div>
                  <Separator />
                  <div className='flex justify-between font-medium'>
                    <span>
                      {t('repair.ticket.total', { defaultValue: 'Total' })}
                    </span>
                    <span className='tabular-nums'>
                      ¥{ticket.totalCost.toFixed(2)}
                    </span>
                  </div>
                  {ticket.settlement ? (
                    <div
                      className='rounded-md border p-2 text-xs'
                      data-testid='settlement'
                    >
                      <p>
                        {t('repair.ticket.settlementNo', {
                          defaultValue: 'Settlement',
                        })}
                        : {ticket.settlement.settlementNo}
                      </p>
                      <p>
                        {ticket.settlement.settledByName} ·{' '}
                        {formatDateTime(ticket.settlement.settledAt)}
                      </p>
                      <p className='tabular-nums'>
                        ¥{ticket.settlement.totalAmount.toFixed(2)}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </DataState>
    </PageContainer>
  );
}
