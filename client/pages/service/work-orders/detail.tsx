import { resolveAppUrl, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  DownloadIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Link, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
  ErrorState,
  LoadingState,
  WorkOrderPriorityBadge,
  WorkOrderStatusBadge,
} from '../components.js';
import { WorkOrderAIAssistant } from './assistant.js';
import {
  deleteAttachment,
  deleteWorkOrder,
  errorMessage,
  formatDateTime,
  getDirectory,
  getWorkOrder,
  listKnowledge,
  revokeWorkOrderShare,
  shareWorkOrder,
  transitionWorkOrder,
  uploadAttachment,
  WORK_ORDER_EVENT_LABEL,
  type DirectoryProfile,
  type Knowledge,
  type WorkOrderDetail,
  type WorkOrderTransition,
} from '../data.js';

export default function WorkOrderDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const params = useParams();
  const id = params.id ?? '';

  const [detail, setDetail] = useState<WorkOrderDetail>();
  const [engineers, setEngineers] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);

  const [transitioning, setTransitioning] = useState<WorkOrderTransition>();
  const [transitionNote, setTransitionNote] = useState('');
  const [assignee, setAssignee] = useState('');

  const [sharing, setSharing] = useState(false);
  const [shareTarget, setShareTarget] = useState('');
  const [removingShare, setRemovingShare] = useState<number>();

  const [removingAttachment, setRemovingAttachment] = useState<string>();
  const [deletingOrder, setDeletingOrder] = useState(false);

  const [assistQuery, setAssistQuery] = useState('');
  const [assistResults, setAssistResults] = useState<Knowledge[]>([]);
  const [assistBusy, setAssistBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    Promise.all([
      getWorkOrder(api, id),
      getDirectory(api).catch(() => ({ groups: [], profiles: [] })),
    ])
      .then(([workOrder, directory]) => {
        if (controller.signal.aborted) return;
        setDetail(workOrder);
        setEngineers(directory.profiles);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, id, revision]);

  const nameById = new Map(
    engineers.map((engineer) => [engineer.userId, engineer.name]),
  );
  const name = (userId: string | null): string =>
    userId ? (nameById.get(userId) ?? userId) : '—';

  const runTransition = async (): Promise<void> => {
    if (!transitioning) return;
    setBusy(true);
    try {
      await transitionWorkOrder(api, id, transitioning, {
        note: transitionNote || undefined,
        resolutionNote:
          transitioning === 'submit' ? transitionNote || undefined : undefined,
        returnReason: transitionNote || undefined,
        assigneeId: assignee || undefined,
      });
      toaster.show({
        type: 'success',
        title: t('service.workOrders.transitionDone'),
      });
      setTransitioning(undefined);
      setTransitionNote('');
      setAssignee('');
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const submitShare = async (): Promise<void> => {
    if (!shareTarget) return;
    setBusy(true);
    try {
      await shareWorkOrder(api, id, shareTarget);
      toaster.show({
        type: 'success',
        title: t('service.workOrders.shareDone'),
      });
      setSharing(false);
      setShareTarget('');
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const removeShare = async (shareId: number): Promise<void> => {
    setBusy(true);
    try {
      await revokeWorkOrderShare(api, id, shareId);
      setRemovingShare(undefined);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadAttachment(api, id, file);
      toaster.show({
        type: 'success',
        title: t('service.attachments.uploaded'),
      });
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const removeAttachment = async (attachmentId: string): Promise<void> => {
    setBusy(true);
    try {
      await deleteAttachment(api, attachmentId);
      setRemovingAttachment(undefined);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = async (): Promise<void> => {
    setBusy(true);
    try {
      await deleteWorkOrder(api, id);
      window.location.assign(resolveAppUrl('service/work-orders'));
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
      setDeletingOrder(false);
    } finally {
      setBusy(false);
    }
  };

  const searchKnowledge = async (): Promise<void> => {
    setAssistBusy(true);
    try {
      const page = await listKnowledge(api, { keyword: assistQuery });
      setAssistResults(page.items.slice(0, 5));
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setAssistBusy(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }
  if (error || !detail) {
    return (
      <PageContainer>
        <ErrorState
          message={error ?? t('service.workOrders.notFound')}
          onRetry={reload}
        />
      </PageContainer>
    );
  }

  const {
    workOrder,
    events,
    shares,
    attachments,
    transitions,
    canManageShares,
  } = detail;
  const activeShares = shares.filter((share) => !share.revokedAt);

  return (
    <PageContainer>
      <Button
        className='w-fit'
        variant='ghost'
        size='sm'
        render={<Link to='/service/work-orders' />}
      >
        <ArrowLeftIcon />
        {t('service.workOrders.back')}
      </Button>

      <PageHeader
        title={workOrder.title}
        description={`${workOrder.code ?? `#${workOrder.id}`} · ${t('service.workOrders.createdAt')} ${formatDateTime(workOrder.createdAt)}`}
        actions={
          <Button variant='destructive' onClick={() => setDeletingOrder(true)}>
            <Trash2Icon />
            {t('service.workOrders.delete')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <WorkOrderStatusBadge status={workOrder.status} />
        <WorkOrderPriorityBadge priority={workOrder.priority} />
        {workOrder.confidential ? (
          <Badge variant='destructive'>
            {t('service.workOrders.confidential')}
          </Badge>
        ) : null}
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>{t('service.workOrders.detail')}</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <Detail label={t('service.workOrders.customer')}>
              #{workOrder.customerId}
            </Detail>
            <Detail label={t('service.workOrders.equipment')}>
              #{workOrder.equipmentId}
            </Detail>
            <Detail label={t('service.workOrders.assignee')}>
              {name(workOrder.assigneeId)}
            </Detail>
            <Detail label={t('service.workOrders.supervisor')}>
              {name(workOrder.supervisorId ?? workOrder.createdById)}
            </Detail>
            <Detail label={t('service.workOrders.deadline')}>
              {formatDateTime(workOrder.deadline)}
            </Detail>
            <Detail label={t('service.workOrders.source')}>
              {workOrder.source}
            </Detail>
            <div className='sm:col-span-2'>
              <p className='text-xs uppercase text-muted-foreground'>
                {t('service.workOrders.descriptionLabel')}
              </p>
              <p className='mt-1 whitespace-pre-wrap text-sm'>
                {workOrder.description ?? '—'}
              </p>
            </div>
            {workOrder.acceptanceNote ? (
              <div className='sm:col-span-2'>
                <p className='text-xs uppercase text-muted-foreground'>
                  {t('service.workOrders.acceptanceNote')}
                </p>
                <p className='mt-1 whitespace-pre-wrap text-sm'>
                  {workOrder.acceptanceNote}
                </p>
              </div>
            ) : null}
            {workOrder.resolutionNote ? (
              <div className='sm:col-span-2'>
                <p className='text-xs uppercase text-muted-foreground'>
                  {t('service.workOrders.resolutionNote')}
                </p>
                <p className='mt-1 whitespace-pre-wrap text-sm'>
                  {workOrder.resolutionNote}
                </p>
              </div>
            ) : null}
            {workOrder.returnReason ? (
              <div className='sm:col-span-2'>
                <p className='text-xs uppercase text-muted-foreground'>
                  {t('service.workOrders.returnReason')}
                </p>
                <p className='mt-1 whitespace-pre-wrap text-sm text-destructive'>
                  {workOrder.returnReason}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('service.workOrders.transitions')}</CardTitle>
            <CardDescription>
              {t('service.workOrders.transitionsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2'>
            {transitions.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.workOrders.noTransition')}
              </p>
            ) : (
              transitions.map((transition) => (
                <Button
                  key={transition}
                  onClick={() => {
                    setTransitioning(transition);
                    setAssignee(workOrder.assigneeId ?? '');
                  }}
                  variant={transition === 'return' ? 'outline' : 'default'}
                >
                  {t(`service.transition.${transition}`)}
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Share2Icon className='size-4' />
              {t('service.shares.title')}
            </CardTitle>
            <CardDescription>{t('service.shares.description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {activeShares.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.shares.empty')}
              </p>
            ) : (
              <ul className='divide-y'>
                {activeShares.map((share) => (
                  <li
                    key={share.id}
                    className='flex items-center justify-between py-2 text-sm'
                  >
                    <span>{name(share.engineerId)}</span>
                    {canManageShares ? (
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setRemovingShare(share.id)}
                      >
                        {t('service.shares.revoke')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManageShares ? (
              <>
                <Button
                  variant='outline'
                  disabled={workOrder.confidential}
                  onClick={() => setSharing(true)}
                >
                  <PlusIcon />
                  {t('service.shares.add')}
                </Button>
                {workOrder.confidential ? (
                  <p className='text-xs text-muted-foreground'>
                    {t('service.shares.confidentialBlocked')}
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <FileTextIcon className='size-4' />
              {t('service.attachments.title')}
            </CardTitle>
            <CardDescription>
              {t('service.attachments.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {attachments.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.attachments.empty')}
              </p>
            ) : (
              <ul className='divide-y'>
                {attachments.map((attachment) => {
                  const contentUrl = resolveAppUrl(
                    `api/service/attachments/${encodeURIComponent(attachment.id)}/content`,
                  );
                  const isImage = attachment.ext === 'png';
                  return (
                    <li key={attachment.id} className='py-3'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='truncate text-sm'>
                          {attachment.filename}
                        </span>
                        <div className='flex items-center gap-1'>
                          <Button
                            size='sm'
                            variant='ghost'
                            render={
                              <a
                                href={contentUrl}
                                target='_blank'
                                rel='noreferrer'
                              />
                            }
                          >
                            {t('service.attachments.preview')}
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            render={
                              <a href={`${contentUrl}?download=1`} download />
                            }
                          >
                            <DownloadIcon />
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => setRemovingAttachment(attachment.id)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </div>
                      {isImage ? (
                        <img
                          alt={attachment.filename}
                          className='mt-2 max-h-40 rounded border'
                          src={contentUrl}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <label className='inline-flex'>
              <input
                accept='.png,.docx'
                className='hidden'
                type='file'
                onChange={(event) => {
                  void onUpload(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <span className='inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted'>
                <UploadIcon className='size-4' />
                {t('service.attachments.upload')}
              </span>
            </label>
            <p className='text-xs text-muted-foreground'>
              {t('service.attachments.hint')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <SparklesIcon className='size-4' />
            {t('service.assistant.title')}
          </CardTitle>
          <CardDescription>
            {t('service.assistant.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <form
            className='flex gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              void searchKnowledge();
            }}
          >
            <div className='relative flex-1'>
              <SearchIcon className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
              <Input
                className='pl-8'
                placeholder={t('service.assistant.placeholder')}
                value={assistQuery}
                onChange={(event) => setAssistQuery(event.target.value)}
              />
            </div>
            <Button type='submit' disabled={assistBusy}>
              {t('service.assistant.ask')}
            </Button>
          </form>
          {assistResults.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.assistant.empty')}
            </p>
          ) : (
            <ul className='divide-y'>
              {assistResults.map((item) => (
                <li key={item.id} className='space-y-1 py-3'>
                  <p className='font-medium'>{item.title}</p>
                  {item.symptom ? (
                    <p className='text-sm text-muted-foreground'>
                      {item.symptom}
                    </p>
                  ) : null}
                  {item.content ? (
                    <p className='text-sm'>{item.content}</p>
                  ) : null}
                  <p className='text-xs text-muted-foreground'>
                    {item.category ?? ''} {item.tags ?? ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <WorkOrderAIAssistant />

      <Card>
        <CardHeader>
          <CardTitle>{t('service.events.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.events.empty')}
            </p>
          ) : (
            <ol className='space-y-3'>
              {events.map((event) => (
                <li key={event.id} className='flex gap-3 text-sm'>
                  <span className='mt-1.5 size-2 shrink-0 rounded-full bg-primary' />
                  <div>
                    <p className='font-medium'>
                      {WORK_ORDER_EVENT_LABEL[event.type]
                        ? t(WORK_ORDER_EVENT_LABEL[event.type])
                        : event.type}
                    </p>
                    {event.message ? (
                      <p className='text-muted-foreground'>{event.message}</p>
                    ) : null}
                    <p className='text-xs text-muted-foreground'>
                      {formatDateTime(event.createdAt)} · {name(event.actorId)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={transitioning !== undefined}
        onOpenChange={(open) => {
          if (!open) setTransitioning(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transitioning ? t(`service.transition.${transitioning}`) : ''}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup>
            {transitioning === 'accept' ? (
              <Field>
                <FieldLabel>{t('service.workOrders.assignee')}</FieldLabel>
                <Select
                  value={assignee}
                  onValueChange={(value) => setAssignee(value ?? '')}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('service.workOrders.unassigned')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((engineer) => (
                      <SelectItem key={engineer.userId} value={engineer.userId}>
                        {engineer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor='transition-note'>
                {transitioning === 'submit'
                  ? t('service.workOrders.resolutionNote')
                  : transitioning === 'return'
                    ? t('service.workOrders.returnReason')
                    : t('service.workOrders.note')}
              </FieldLabel>
              <Textarea
                id='transition-note'
                rows={3}
                value={transitionNote}
                onChange={(event) => setTransitionNote(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setTransitioning(undefined)}
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void runTransition()}>
              {t('actions.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('service.shares.add')}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{t('service.shares.engineer')}</FieldLabel>
              <Select
                value={shareTarget}
                onValueChange={(value) => setShareTarget(value ?? '')}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.shares.selectEngineer')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.userId} value={engineer.userId}>
                      {engineer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant='outline' onClick={() => setSharing(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy || !shareTarget}
              onClick={() => void submitShare()}
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removingShare !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemovingShare(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('service.shares.revoke')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.shares.revokeConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removingShare !== undefined)
                  void removeShare(removingShare);
              }}
            >
              {t('actions.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removingAttachment !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemovingAttachment(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.attachments.remove')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.attachments.removeConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removingAttachment !== undefined)
                  void removeAttachment(removingAttachment);
              }}
            >
              {t('actions.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingOrder} onOpenChange={setDeletingOrder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.workOrders.delete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.workOrders.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void removeOrder()}
            >
              {t('actions.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Separator />
      <p className='text-xs text-muted-foreground'>
        {t('service.workOrders.footerHint')}
      </p>
    </PageContainer>
  );
}

function Detail({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <p className='text-xs uppercase text-muted-foreground'>{label}</p>
      <p className='mt-1 text-sm'>{children}</p>
    </div>
  );
}
