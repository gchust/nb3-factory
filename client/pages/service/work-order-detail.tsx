import { useToaster, useApiClient, resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  DownloadIcon,
  EyeIcon,
  PaperclipIcon,
  PlusIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  ServiceAssistantBoundary,
  ServiceAssistantPanel,
} from '@/components/service-assistant';
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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  AIPageContextScope,
  createAIPageContextReference,
  useAIForm,
  useAIPageElementHandle,
} from '@/extensions/nocobase-ai';
import {
  FilePreviewDialog,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';

import {
  serviceRequest,
  uploadWorkOrderAttachment,
  useServiceResource,
  WORK_ORDER_ACTIONS_BY_STATUS,
  type Assignee,
  type Attachment,
  type Customer,
  type Device,
  type ServicePrincipal,
  type WorkOrder,
  type WorkOrderAction,
} from './model.js';
import {
  ErrorState,
  LoadingState,
  PriorityBadge,
  StatusBadge,
} from './shared.js';

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className='text-sm'>{children}</span>
    </div>
  );
}

function actionLabelKey(action: WorkOrderAction): string {
  return `service.workOrders.action.${action}`;
}

export default function WorkOrderDetailPage(): ReactElement {
  // The AI root provider has to sit above both the page-context registrations
  // and the chat, so the floating assistant shares one registry with the order
  // view. It is a stable boundary: it does not depend on the loaded order.
  return (
    <ServiceAssistantBoundary>
      <WorkOrderDetailContent />
    </ServiceAssistantBoundary>
  );
}

function WorkOrderDetailContent(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const api = useApiClient();
  const toaster = useToaster();

  const order = useServiceResource<WorkOrder>(`work-orders/${id}`);
  const attachments = useServiceResource<Attachment[]>(
    `work-orders/${id}/attachments`,
  );
  const assignees = useServiceResource<Assignee[]>('assignees');
  const customers = useServiceResource<Customer[]>('customers');
  const devices = useServiceResource<Device[]>('devices');
  const principal = useServiceResource<ServicePrincipal>('me');

  // A draft the assistant may fill in and the engineer then reviews: the
  // assistant writes only this visible field, never the work order. The
  // transition dialog copies the draft into its note, so saving still needs the
  // engineer's explicit confirmation.
  const [draftNote, setDraftNote] = useState('');
  const noteFormRef = useAIForm({
    id: 'work-order-handling-note',
    title: t('service.workOrders.noteDraft'),
    fields: [
      {
        name: 'note',
        title: t('service.workOrders.note'),
        type: 'textarea',
        description: t('service.workOrders.noteDraftHint'),
      },
    ],
    getValues: () => ({ note: draftNote }),
    setValues: (values) => {
      const next = values.note;
      if (typeof next === 'string') setDraftNote(next);
    },
  });

  const orderElement = useAIPageElementHandle({
    id: `work-order-${id}`,
    title: order.data?.code ?? id,
    kind: 'work-order',
    getContext: () => ({
      workOrderId: order.data?.id,
      code: order.data?.code,
      title: order.data?.title,
      status: order.data?.status,
      priority: order.data?.priority,
      problem: order.data?.problem,
      customerId: order.data?.customerId,
      deviceId: order.data?.deviceId,
    }),
  });

  const assistantContext = useMemo(
    () => [
      orderElement.context,
      createAIPageContextReference({
        id: 'work-order-handling-note',
        title: t('service.workOrders.noteDraft'),
        kind: 'form',
      }),
    ],
    // `orderElement.context` is memoized by id, title and kind in the plugin.
    [orderElement.context, t],
  );

  const [transition, setTransition] = useState<WorkOrderAction | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  // The attachment list is rendered through the same file preview component the
  // Registry provides, so a PNG renders inline and a DOCX report renders its
  // real content in a dialog instead of only being downloadable.
  const previewFiles = useMemo<FileRecord[]>(
    () =>
      (attachments.data ?? []).map((attachment) => ({
        id: attachment.id,
        disk: 'local',
        key: '',
        filename: attachment.filename,
        ext: attachment.ext,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
        updatedAt: attachment.createdAt,
        contentUrl: resolveAppUrl(
          `api/service/work-orders/${id}/attachments/${attachment.id}/content`,
        ),
      })),
    [attachments.data, id],
  );

  const assigneeName = (userId: string | null): string =>
    userId
      ? (assignees.data?.find((entry) => entry.id === userId)?.name ?? userId)
      : t('service.unassigned');

  const customerName = useMemo(
    () =>
      customers.data?.find((entry) => entry.id === order.data?.customerId)
        ?.name ??
      order.data?.customerId ??
      '',
    [customers.data, order.data?.customerId],
  );
  const deviceName = useMemo(
    () =>
      devices.data?.find((entry) => entry.id === order.data?.deviceId)?.name ??
      order.data?.deviceId ??
      '',
    [devices.data, order.data?.deviceId],
  );

  const isAdmin = principal.data?.roles.admin ?? false;
  const isAssignee = principal.data?.id === order.data?.assigneeId;

  const availableActions = useMemo<WorkOrderAction[]>(() => {
    if (!order.data) return [];
    const actions = [...WORK_ORDER_ACTIONS_BY_STATUS[order.data.status]];
    if (isAdmin) return actions;
    return actions.filter((action) => {
      if (action === 'reject' || action === 'close') return false;
      if (action === 'accept') {
        return !order.data!.assigneeId || isAssignee;
      }
      return isAssignee;
    });
  }, [order, isAdmin, isAssignee]);

  const runTransition = async (
    payload: Record<string, unknown>,
  ): Promise<void> => {
    setPending(true);
    try {
      await serviceRequest(api, `work-orders/${id}/transition`, {
        method: 'POST',
        json: payload,
      });
      toaster.show({ type: 'success', title: t('service.saved') });
      setTransition(null);
      order.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.saveFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPending(false);
    }
  };

  const handleShare = async (engineerId: string): Promise<void> => {
    setPending(true);
    try {
      await serviceRequest(api, `work-orders/${id}/shares`, {
        method: 'POST',
        json: { engineerId },
      });
      toaster.show({ type: 'success', title: t('service.saved') });
      setShareOpen(false);
      order.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.saveFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPending(false);
    }
  };

  const removeAttachment = async (attachment: Attachment): Promise<void> => {
    try {
      await serviceRequest(
        api,
        `work-orders/${id}/attachments/${attachment.id}`,
        { method: 'DELETE' },
      );
      toaster.show({ type: 'success', title: t('service.deleted') });
      attachments.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.deleteFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  const onUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await uploadWorkOrderAttachment(api, id, file);
      toaster.show({
        type: 'success',
        title: t('service.attachments.uploaded'),
      });
      attachments.reload();
      order.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.attachments.uploadFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  if (order.loading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }
  if (order.error || !order.data) {
    return (
      <PageContainer>
        <ErrorState
          message={order.error ?? t('service.loadFailed')}
          onRetry={order.reload}
        />
      </PageContainer>
    );
  }

  const data = order.data;

  return (
    <PageContainer>
      <AIPageContextScope context={assistantContext}>
        <Button
          variant='ghost'
          size='sm'
          className='w-fit'
          nativeButton={false}
          render={<Link to='/work-orders' />}
        >
          <ArrowLeftIcon data-icon='inline-start' />
          {t('service.workOrders.backToList')}
        </Button>

        <PageHeader
          title={
            <span className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-base text-muted-foreground'>
                {data.code}
              </span>
              {data.title}
              <StatusBadge status={data.status} />
              <PriorityBadge priority={data.priority} />
            </span>
          }
          description={data.problem}
          actions={
            <>
              {availableActions.map((action) => (
                <Button
                  key={action}
                  type='button'
                  variant={action === 'reject' ? 'outline' : 'default'}
                  onClick={() => setTransition(action)}
                >
                  {t(actionLabelKey(action))}
                </Button>
              ))}
            </>
          }
        />

        <div className='grid gap-4 lg:grid-cols-3'>
          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardTitle>{t('service.workOrders.detail')}</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <DetailRow label={t('service.workOrders.customer')}>
                {customerName}
              </DetailRow>
              <DetailRow label={t('service.workOrders.device')}>
                {deviceName}
              </DetailRow>
              <DetailRow label={t('service.workOrders.assignee')}>
                {assigneeName(data.assigneeId)}
              </DetailRow>
              <DetailRow label={t('service.workOrders.dueAt')}>
                {data.dueAt ? new Date(data.dueAt).toLocaleDateString() : '—'}
              </DetailRow>
              <DetailRow label={t('service.workOrders.confidential')}>
                {data.confidential ? t('service.yes') : t('service.no')}
              </DetailRow>
              <DetailRow label={t('service.workOrders.createdAt')}>
                {data.createdAt
                  ? new Date(data.createdAt).toLocaleString()
                  : '—'}
              </DetailRow>
              {data.acceptanceNote ? (
                <DetailRow label={t('service.workOrders.acceptanceNote')}>
                  {data.acceptanceNote}
                </DetailRow>
              ) : null}
              {data.resolution ? (
                <DetailRow label={t('service.workOrders.resolution')}>
                  {data.resolution}
                </DetailRow>
              ) : null}
              {data.rejectionReason ? (
                <DetailRow label={t('service.workOrders.rejectionReason')}>
                  {data.rejectionReason}
                </DetailRow>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('service.workOrders.timeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              {(data.events ?? []).length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.empty')}
                </p>
              ) : (
                <ol className='space-y-3'>
                  {data.events!.map((event) => (
                    <li key={event.id} className='flex flex-col gap-0.5'>
                      <span className='text-sm font-medium'>
                        {t(`service.event.${event.type}`)}
                      </span>
                      {event.note ? (
                        <span className='text-sm text-muted-foreground'>
                          {event.note}
                        </span>
                      ) : null}
                      <span className='text-xs text-muted-foreground'>
                        {assigneeName(event.actorId)} ·{' '}
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0'>
            <CardTitle className='flex items-center gap-2'>
              <PaperclipIcon className='size-4' />
              {t('service.attachments.title')}
            </CardTitle>
            <label className='cursor-pointer'>
              <span className='pointer-events-none inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground'>
                <PlusIcon className='size-4' />
                {t('service.attachments.upload')}
              </span>
              <input
                type='file'
                accept='image/png,.docx'
                className='hidden'
                onChange={(event) => void onUpload(event)}
              />
            </label>
          </CardHeader>
          <CardContent>
            {attachments.loading ? (
              <LoadingState />
            ) : (attachments.data ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.attachments.empty')}
              </p>
            ) : (
              <ul className='divide-y'>
                {attachments.data!.map((attachment, index) => {
                  const isImage =
                    attachment.mimeType.split(';', 1)[0] === 'image/png' ||
                    attachment.mimeType.startsWith('image/');
                  const contentUrl = previewFiles[index]?.contentUrl ?? '';
                  return (
                    <li
                      key={attachment.id}
                      className='flex items-center justify-between gap-2 py-2'
                    >
                      <button
                        type='button'
                        className='flex min-w-0 flex-1 items-center gap-3 text-left'
                        onClick={() => {
                          setPreviewIndex(index);
                          setPreviewOpen(true);
                        }}
                      >
                        {isImage ? (
                          <img
                            src={contentUrl}
                            alt={attachment.filename}
                            className='size-10 shrink-0 rounded border object-cover'
                          />
                        ) : (
                          <span className='flex size-10 shrink-0 items-center justify-center rounded border bg-muted'>
                            <PaperclipIcon className='size-4 text-muted-foreground' />
                          </span>
                        )}
                        <span className='flex min-w-0 flex-col'>
                          <span className='truncate text-sm font-medium'>
                            {attachment.filename}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {Math.max(1, Math.round(attachment.size / 1024))} KB
                            · {new Date(attachment.createdAt).toLocaleString()}
                          </span>
                        </span>
                      </button>
                      <div className='flex items-center gap-1'>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('service.attachments.preview')}
                          onClick={() => {
                            setPreviewIndex(index);
                            setPreviewOpen(true);
                          }}
                        >
                          <EyeIcon />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('service.attachments.download')}
                          nativeButton={false}
                          render={
                            <a
                              href={contentUrl}
                              download={attachment.filename}
                            />
                          }
                        >
                          <DownloadIcon />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('service.delete')}
                          onClick={() => void removeAttachment(attachment)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <FilePreviewDialog
              files={previewFiles}
              initialIndex={previewIndex}
              open={previewOpen}
              onOpenChange={setPreviewOpen}
            />
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0'>
              <CardTitle className='flex items-center gap-2'>
                <Share2Icon className='size-4' />
                {t('service.workOrders.shares')}
              </CardTitle>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setShareOpen(true)}
              >
                <PlusIcon data-icon='inline-start' />
                {t('service.workOrders.share')}
              </Button>
            </CardHeader>
            <CardContent>
              {(data.shares ?? []).length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.workOrders.noShares')}
                </p>
              ) : (
                <ul className='divide-y'>
                  {data.shares!.map((share) => (
                    <li
                      key={share.id}
                      className='flex items-center justify-between gap-2 py-2 text-sm'
                    >
                      <span>{assigneeName(share.engineerId)}</span>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() =>
                          void serviceRequest(
                            api,
                            `work-orders/${id}/shares/${share.id}`,
                            { method: 'DELETE' },
                          ).then(() => order.reload())
                        }
                      >
                        {t('service.revoke')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {transition ? (
          <TransitionDialog
            action={transition}
            isAdmin={isAdmin}
            assignees={assignees.data ?? []}
            currentAssigneeId={data.assigneeId}
            initialNote={draftNote}
            pending={pending}
            onClose={() => setTransition(null)}
            onSubmit={(payload) => void runTransition(payload)}
          />
        ) : null}

        {shareOpen ? (
          <ShareDialog
            assignees={assignees.data ?? []}
            pending={pending}
            onClose={() => setShareOpen(false)}
            onSubmit={(engineerId) => {
              void handleShare(engineerId);
            }}
          />
        ) : null}

        <Card ref={noteFormRef}>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <SparklesIcon className='size-4' />
              {t('service.workOrders.noteDraft')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Textarea
              value={draftNote}
              placeholder={t('service.workOrders.noteDraftPlaceholder')}
              onChange={(event) => setDraftNote(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {t('service.workOrders.noteDraftHint')}
            </p>
          </CardContent>
        </Card>

        <ServiceAssistantPanel />
      </AIPageContextScope>
    </PageContainer>
  );
}

function TransitionDialog({
  action,
  isAdmin,
  assignees,
  currentAssigneeId,
  initialNote,
  pending,
  onClose,
  onSubmit,
}: {
  readonly action: WorkOrderAction;
  readonly isAdmin: boolean;
  readonly assignees: readonly Assignee[];
  readonly currentAssigneeId: string | null;
  readonly initialNote: string;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (payload: Record<string, unknown>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [note, setNote] = useState(initialNote);
  const [resolution, setResolution] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? '');

  const invalid =
    (action === 'submit' && !resolution.trim()) ||
    (action === 'reject' && !rejectionReason.trim());

  const submit = (): void => {
    if (invalid) return;
    onSubmit({
      action,
      note: note || undefined,
      resolution: resolution || undefined,
      rejectionReason: rejectionReason || undefined,
      assigneeId: assigneeId || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t(actionLabelKey(action))}</DialogTitle>
          <DialogDescription>
            {t(`service.workOrders.actionHint.${action}`)}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          {action === 'accept' && isAdmin ? (
            <Field>
              <FieldLabel htmlFor='transition-assignee'>
                {t('service.workOrders.assignee')}
              </FieldLabel>
              <NativeSelect
                id='transition-assignee'
                className='w-full'
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <NativeSelectOption value=''>
                  {t('service.unassigned')}
                </NativeSelectOption>
                {assignees.map((assignee) => (
                  <NativeSelectOption key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {action === 'submit' ? (
            <Field>
              <FieldLabel htmlFor='transition-resolution'>
                {t('service.workOrders.resolution')}
              </FieldLabel>
              <Textarea
                id='transition-resolution'
                required
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
              />
            </Field>
          ) : null}
          {action === 'reject' ? (
            <Field>
              <FieldLabel htmlFor='transition-rejection'>
                {t('service.workOrders.rejectionReason')}
              </FieldLabel>
              <Textarea
                id='transition-rejection'
                required
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor='transition-note'>
              {t('service.workOrders.note')}
            </FieldLabel>
            <Textarea
              id='transition-note'
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button type='button' onClick={submit} disabled={pending || invalid}>
            {pending ? t('service.saving') : t('service.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  assignees,
  pending,
  onClose,
  onSubmit,
}: {
  readonly assignees: readonly Assignee[];
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (engineerId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [engineerId, setEngineerId] = useState(assignees[0]?.id ?? '');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('service.workOrders.share')}</DialogTitle>
          <DialogDescription>
            {t('service.workOrders.shareDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='share-engineer'>
              {t('service.workOrders.assignee')}
            </FieldLabel>
            <NativeSelect
              id='share-engineer'
              className='w-full'
              value={engineerId}
              onChange={(event) => setEngineerId(event.target.value)}
            >
              {assignees.map((assignee) => (
                <NativeSelectOption key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            onClick={() => onSubmit(engineerId)}
            disabled={pending || !engineerId}
          >
            {pending ? t('service.saving') : t('service.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
