import { useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { AttachmentManager } from '@/components/attachment-manager';
import { FileViewerDialog } from '@/components/file-viewer/file-viewer-dialog';
import { useFileViewer } from '@/components/file-viewer/use-file-viewer';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  clientFileRepositoryManagerToken,
  FileUploadField,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { CONTRACT_TRANSITIONS, FILE_RESOURCE_BY_KIND } from '@/lib/constants';
import {
  contractStatusLabel,
  memberRoleLabel,
  memberRoleOptions,
  taskStatusOptions,
} from '@/lib/status-labels';
import type {
  DeliveryFile,
  DeliveryTask,
  DeliveryVersion,
} from '@/lib/delivery-api';
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  parseAmountToCents,
  todayInput,
} from '@/lib/format';
import { useDeliveryErrorMessage } from '@/lib/delivery-error';
import { useDeliveryApi, useResource } from '@/lib/use-delivery-resource';

export default function ContractDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const projectId = Number(params.id);
  const api = useDeliveryApi();
  const state = useResource(
    (client) => client.contract(projectId),
    String(projectId),
  );
  const viewer = useFileViewer();
  const errorMessage = useDeliveryErrorMessage();
  const [error, setError] = useState<string>();

  const [milestoneForm, setMilestoneForm] = useState<{
    name: string;
    dueDate: string;
    amount: string;
    ownerId: string;
    acceptorId: string;
  }>();
  const [changeForm, setChangeForm] = useState<{
    changeType: string;
    summary: string;
  }>();
  const [memberId, setMemberId] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [versionTarget, setVersionTarget] = useState<{
    task: DeliveryTask;
    milestoneName: string;
  }>();
  const [taskForm, setTaskForm] = useState<{
    milestoneId: number;
    name: string;
    required: boolean;
    assigneeId: string;
  }>();
  const [reviewTarget, setReviewTarget] = useState<DeliveryVersion>();
  const [reviewComment, setReviewComment] = useState('');
  const [busy, setBusy] = useState(false);

  const detail = state.data;
  // `detail` arrives after the first render, so the resource key must change
  // when it does; otherwise the empty resolution from the first pass is kept
  // forever and the member/owner/acceptor selectors stay empty. The directory
  // is needed both by the lead (members) and by whoever maintains the
  // contract's milestones (owner and acceptance specialist).
  const canManageMembers = detail?.canManageMembers === true;
  const canUseDirectory =
    canManageMembers ||
    detail?.canManage === true ||
    detail?.canMaintainTasks === true;
  const users = useResource(
    (client) => (canUseDirectory ? client.users() : Promise.resolve([])),
    canUseDirectory ? 'members' : '',
  );
  const directoryOptions = useMemo(
    () =>
      (users.data ?? []).map((user) => ({
        value: user.id,
        label: user.name || user.id,
      })),
    [users.data],
  );
  const ownerOptions = useMemo(
    () => [
      { value: '', label: t('delivery.milestones.selectOwner') },
      ...directoryOptions,
    ],
    [directoryOptions, t],
  );
  const acceptorOptions = useMemo(
    () => [
      { value: '', label: t('delivery.milestones.selectAcceptor') },
      ...directoryOptions,
    ],
    [directoryOptions, t],
  );

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      state.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) {
    return (
      <PageContainer>
        <Loading />
      </PageContainer>
    );
  }
  if (state.error || !detail) {
    return (
      <PageContainer>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.contracts.loadFailed')}</CardTitle>
            <CardDescription>{state.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={state.reload}>{t('delivery.common.retry')}</Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const transitions = CONTRACT_TRANSITIONS[detail.contract.status] ?? [];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={`${detail.contract.contractNo} · ${detail.contract.title}`}
        description={`${detail.customer?.name ?? '—'} · ${detail.managerName} · ${formatDate(
          detail.contract.startDate,
        )} → ${formatDate(detail.contract.endDate)}`}
        actions={
          <div className='flex items-center gap-2'>
            <StatusBadge kind='contract' status={detail.contract.status} />
            {detail.canManage && transitions.length ? (
              <SelectField
                label={t('delivery.contracts.changeStatus')}
                value=''
                placeholder={t('delivery.contracts.changeStatus')}
                options={transitions.map((status) => ({
                  value: status,
                  label: contractStatusLabel(t, status),
                }))}
                onValueChange={(value) =>
                  value
                    ? void run(() => api.changeContractStatus(projectId, value))
                    : undefined
                }
              />
            ) : null}
          </div>
        }
      />

      {error ? (
        <p
          className='rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
          role='alert'
        >
          {error}
        </p>
      ) : null}

      <div className='grid gap-4 lg:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.contracts.amount')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <p className='text-2xl font-semibold'>
              {formatMoney(
                detail.contract.amountCents,
                detail.contract.currency,
              )}
            </p>
            <p className='text-sm text-muted-foreground'>
              {t('delivery.contracts.allocated')}:{' '}
              {formatMoney(detail.progress.allocatedCents)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.contracts.progress')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1'>
            <p className='text-2xl font-semibold'>
              {detail.progress.progressPercent}%
            </p>
            <p className='text-sm text-muted-foreground'>
              {t('delivery.dashboard.progressHint', {
                accepted: detail.progress.acceptedMilestoneCount,
                total: detail.progress.milestoneCount,
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.contracts.contacts')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-1 text-sm text-muted-foreground'>
            {(detail.contacts ?? []).slice(0, 3).map((contact) => (
              <p key={String(contact.id)}>
                {textOf(contact.name)} · {textOf(contact.title)} ·{' '}
                {textOf(contact.phone)}
              </p>
            ))}
            {detail.contacts?.length ? null : (
              <p>{t('delivery.contracts.noContacts')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>{t('delivery.milestones.title')}</CardTitle>
            <CardDescription>
              {t('delivery.milestones.description')}
            </CardDescription>
          </div>
          {detail.canManage ? (
            <Button
              onClick={() =>
                setMilestoneForm({
                  name: '',
                  dueDate: todayInput(),
                  amount: '0.00',
                  ownerId: detail.contract.managerId ?? '',
                  acceptorId: detail.milestones[0]?.acceptorId ?? '',
                })
              }
            >
              <Plus aria-hidden='true' /> {t('delivery.milestones.create')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className='space-y-4'>
          {detail.milestones.length ? (
            detail.milestones.map((milestone) => (
              <div
                key={milestone.id}
                className='space-y-3 rounded-md border border-border p-4'
              >
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <p className='font-medium'>
                      M{milestone.seq} · {milestone.name}
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      {t('delivery.milestones.dueDate')}:{' '}
                      {formatDate(milestone.dueDate)} ·{' '}
                      {t('delivery.milestones.owner')}:{' '}
                      {milestone.ownerName || '—'} ·{' '}
                      {t('delivery.milestones.acceptor')}:{' '}
                      {milestone.acceptorName || '—'} ·{' '}
                      {formatMoney(milestone.amountCents)}
                    </p>
                  </div>
                  <div className='flex flex-wrap items-center gap-1'>
                    <StatusBadge
                      kind='milestone'
                      status={
                        milestone.isOverdue ? 'pending' : milestone.status
                      }
                    />
                    {milestone.isOverdue ? (
                      <span className='text-xs text-destructive'>
                        {t('delivery.milestones.overdue')}
                      </span>
                    ) : null}
                    {milestone.receivable ? (
                      <StatusBadge
                        kind='receivable'
                        status={milestone.receivable.status}
                      />
                    ) : null}
                  </div>
                </div>

                <div className='space-y-3'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <p className='text-sm font-medium'>
                      {t('delivery.deliverables.tasks')} ·{' '}
                      {t('delivery.deliverables.requiredProgress', {
                        done: milestone.requiredTaskDoneCount,
                        total: milestone.requiredTaskCount,
                      })}
                    </p>
                    {milestone.canMaintainTasks ? (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          setTaskForm({
                            milestoneId: milestone.id,
                            name: '',
                            required: true,
                            assigneeId: '',
                          })
                        }
                      >
                        <Plus aria-hidden='true' />{' '}
                        {t('delivery.deliverables.create')}
                      </Button>
                    ) : null}
                  </div>
                  {milestone.tasks.length ? (
                    milestone.tasks.map((task) => (
                      <div
                        key={task.id}
                        className='space-y-2 rounded-md border border-border p-3'
                      >
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>{task.name}</span>
                          <StatusBadge kind='task' status={task.status} />
                          <span className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
                            {task.required
                              ? t('delivery.deliverables.required')
                              : t('delivery.deliverables.optional')}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {t('delivery.deliverables.assignee')}:{' '}
                            {task.assigneeName || '—'}
                          </span>
                          <span className='flex-1' />
                          {task.canManage ? (
                            <SelectField
                              label={t('delivery.deliverables.status')}
                              value={task.status}
                              options={taskStatusOptions(t)}
                              onValueChange={(value) =>
                                value
                                  ? void run(() =>
                                      api.updateTask(task.id, {
                                        status: value,
                                      }),
                                    )
                                  : undefined
                              }
                            />
                          ) : null}
                        </div>
                        <VersionList
                          versions={task.versions}
                          onPreview={(files, index) =>
                            viewer.show(files, index)
                          }
                          onReview={(version) => {
                            setReviewTarget(version);
                            setReviewComment('');
                          }}
                        />
                        {task.canManage ? (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() =>
                              setVersionTarget({
                                task,
                                milestoneName: milestone.name,
                              })
                            }
                          >
                            <Plus aria-hidden='true' />{' '}
                            {t('delivery.deliverables.submitVersion')}
                          </Button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t('delivery.deliverables.none')}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('delivery.milestones.empty')}
            </p>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.files.contractTitle')}</CardTitle>
            <CardDescription>
              {t('delivery.files.contractHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttachmentManager
              resource={FILE_RESOURCE_BY_KIND.contract}
              files={detail.files}
              canManage={detail.canManage}
              onAdd={(fileIds) =>
                api.linkContractFiles(projectId, fileIds).then(state.reload)
              }
              onRename={(fileId, filename) =>
                api.renameFile('contract', fileId, filename).then(state.reload)
              }
              onRemove={(fileId) =>
                api.removeFile('contract', fileId).then(state.reload)
              }
              onPreview={(files, index) => viewer.show(files, index)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle>{t('delivery.changes.title')}</CardTitle>
              <CardDescription>
                {t('delivery.changes.description')}
              </CardDescription>
            </div>
            {detail.canManage ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  setChangeForm({ changeType: 'amount', summary: '' })
                }
              >
                <Plus aria-hidden='true' /> {t('delivery.changes.create')}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className='space-y-3'>
            {detail.changes.length ? (
              detail.changes.map((change) => (
                <div
                  key={change.id}
                  className='rounded-md border border-border p-3 text-sm'
                >
                  <p className='font-medium'>{change.summary}</p>
                  <p className='text-muted-foreground'>
                    {change.changeType} · {change.beforeValue || '—'} →{' '}
                    {change.afterValue || '—'} · {change.createdByName} ·{' '}
                    {formatDateTime(change.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.changes.empty')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {detail.canManageMembers ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('delivery.members.title')}</CardTitle>
            <CardDescription>
              {t('delivery.members.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <ul className='divide-y divide-border rounded-md border border-border'>
              {detail.members.map((member) => (
                <li
                  key={member.id}
                  className='flex items-center justify-between gap-2 p-3'
                >
                  <span>
                    {member.userName} · {memberRoleLabel(t, member.memberRole)}
                  </span>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api.removeContractMember(projectId, member.id),
                      )
                    }
                  >
                    {t('delivery.members.remove')}
                  </Button>
                </li>
              ))}
            </ul>
            <div className='flex flex-wrap items-end gap-2'>
              <SelectField
                label={t('delivery.members.add')}
                value={memberId}
                placeholder={t('delivery.members.selectUser')}
                options={[
                  { value: '', label: t('delivery.members.selectUser') },
                  ...(users.data ?? []).map((user) => ({
                    value: user.id,
                    label: user.name || user.id,
                  })),
                ]}
                onValueChange={setMemberId}
              />
              <SelectField
                label={t('delivery.members.role')}
                value={memberRole}
                options={memberRoleOptions(t)}
                onValueChange={setMemberRole}
              />
              <Button
                disabled={!memberId || busy}
                onClick={() =>
                  void run(() =>
                    api.addContractMember(projectId, {
                      userId: memberId,
                      memberRole,
                    }),
                  )
                }
              >
                {t('delivery.members.add')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={Boolean(taskForm)}
        onOpenChange={(open) => (open ? undefined : setTaskForm(undefined))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delivery.deliverables.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.deliverables.formHint')}
            </DialogDescription>
          </DialogHeader>
          {taskForm ? (
            <div className='space-y-3'>
              <div className='space-y-2'>
                <Label htmlFor='task-name'>
                  {t('delivery.deliverables.name')}
                </Label>
                <Input
                  id='task-name'
                  value={taskForm.name}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, name: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label>{t('delivery.deliverables.assignee')}</Label>
                <SelectField
                  label={t('delivery.deliverables.assignee')}
                  className='w-full min-w-0'
                  value={taskForm.assigneeId}
                  placeholder={t('delivery.deliverables.selectAssignee')}
                  onValueChange={(value) =>
                    setTaskForm({ ...taskForm, assigneeId: value })
                  }
                  options={[
                    {
                      value: '',
                      label: t('delivery.deliverables.selectAssignee'),
                    },
                    ...directoryOptions,
                  ]}
                />
              </div>
              <label className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={taskForm.required}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      required: event.target.checked,
                    })
                  }
                />
                {t('delivery.deliverables.required')}
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setTaskForm(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy || !taskForm?.name.trim()}
              onClick={() =>
                taskForm
                  ? void run(async () => {
                      await api.createDeliverable(taskForm.milestoneId, {
                        name: taskForm.name,
                        required: taskForm.required,
                        assigneeId: taskForm.assigneeId || undefined,
                      });
                      setTaskForm(undefined);
                    })
                  : undefined
              }
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VersionSubmitDialog
        target={versionTarget}
        onClose={() => setVersionTarget(undefined)}
        onSubmitted={() => {
          setVersionTarget(undefined);
          state.reload();
        }}
      />

      <Dialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => (open ? undefined : setReviewTarget(undefined))}
      >
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {t('delivery.acceptance.review')} · V{reviewTarget?.versionNo}
            </DialogTitle>
            <DialogDescription>
              {t('delivery.acceptance.reviewHint')}
            </DialogDescription>
          </DialogHeader>
          {reviewTarget ? (
            <ReviewBody
              version={reviewTarget}
              onPreview={(files, index) => viewer.show(files, index)}
            />
          ) : null}
          <div className='space-y-2'>
            <Label htmlFor='review-comment'>
              {t('delivery.acceptance.comment')}
            </Label>
            <Textarea
              id='review-comment'
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setReviewTarget(undefined)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='outline'
              disabled={busy || !reviewComment.trim()}
              onClick={() =>
                reviewTarget
                  ? void run(async () => {
                      await api.returnVersion(reviewTarget.id, reviewComment);
                      setReviewTarget(undefined);
                    })
                  : undefined
              }
            >
              {t('delivery.acceptance.return')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                reviewTarget
                  ? void run(async () => {
                      await api.approveVersion(reviewTarget.id, reviewComment);
                      setReviewTarget(undefined);
                    })
                  : undefined
              }
            >
              {t('delivery.acceptance.approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(milestoneForm)}
        onOpenChange={(open) =>
          open ? undefined : setMilestoneForm(undefined)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delivery.milestones.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.milestones.formHint')}
            </DialogDescription>
          </DialogHeader>
          {milestoneForm ? (
            <div className='space-y-3'>
              <div className='space-y-2'>
                <Label htmlFor='milestone-name'>
                  {t('delivery.milestones.name')}
                </Label>
                <Input
                  id='milestone-name'
                  value={milestoneForm.name}
                  onChange={(event) =>
                    setMilestoneForm({
                      ...milestoneForm,
                      name: event.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='milestone-due'>
                  {t('delivery.milestones.dueDate')}
                </Label>
                <Input
                  id='milestone-due'
                  type='date'
                  value={milestoneForm.dueDate}
                  onChange={(event) =>
                    setMilestoneForm({
                      ...milestoneForm,
                      dueDate: event.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='milestone-amount'>
                  {t('delivery.milestones.amount')}
                </Label>
                <Input
                  id='milestone-amount'
                  inputMode='decimal'
                  value={milestoneForm.amount}
                  onChange={(event) =>
                    setMilestoneForm({
                      ...milestoneForm,
                      amount: event.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label>{t('delivery.milestones.owner')}</Label>
                <SelectField
                  label={t('delivery.milestones.owner')}
                  className='w-full min-w-0'
                  value={milestoneForm.ownerId}
                  onValueChange={(value) =>
                    setMilestoneForm({ ...milestoneForm, ownerId: value })
                  }
                  options={ownerOptions}
                />
              </div>
              <div className='space-y-2'>
                <Label>{t('delivery.milestones.acceptor')}</Label>
                <SelectField
                  label={t('delivery.milestones.acceptor')}
                  className='w-full min-w-0'
                  value={milestoneForm.acceptorId}
                  onValueChange={(value) =>
                    setMilestoneForm({ ...milestoneForm, acceptorId: value })
                  }
                  options={acceptorOptions}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setMilestoneForm(undefined)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                milestoneForm
                  ? void run(async () => {
                      await api.createMilestone(projectId, {
                        name: milestoneForm.name,
                        dueDate: milestoneForm.dueDate,
                        amountCents: parseAmountToCents(milestoneForm.amount),
                        acceptorId: milestoneForm.acceptorId || undefined,
                        ownerId:
                          milestoneForm.ownerId ||
                          detail.contract.managerId ||
                          undefined,
                      });
                      setMilestoneForm(undefined);
                    })
                  : undefined
              }
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(changeForm)}
        onOpenChange={(open) => (open ? undefined : setChangeForm(undefined))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delivery.changes.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.changes.formHint')}
            </DialogDescription>
          </DialogHeader>
          {changeForm ? (
            <div className='space-y-2'>
              <Label htmlFor='change-summary'>
                {t('delivery.changes.summary')}
              </Label>
              <Textarea
                id='change-summary'
                value={changeForm.summary}
                onChange={(event) =>
                  setChangeForm({ ...changeForm, summary: event.target.value })
                }
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setChangeForm(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={busy || !changeForm?.summary.trim()}
              onClick={() =>
                changeForm
                  ? void run(async () => {
                      await api.addContractChange(projectId, changeForm);
                      setChangeForm(undefined);
                    })
                  : undefined
              }
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileViewerDialog
        files={viewer.files}
        initialIndex={viewer.index}
        open={viewer.open}
        onOpenChange={(open) => (open ? undefined : viewer.hide())}
      />
    </PageContainer>
  );
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function VersionList({
  versions,
  onPreview,
  onReview,
}: {
  readonly versions: readonly DeliveryVersion[];
  readonly onPreview: (files: readonly DeliveryFile[], index: number) => void;
  readonly onReview: (version: DeliveryVersion) => void;
}): ReactElement {
  const { t } = useTranslation();
  if (!versions.length) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('delivery.deliverables.noVersions')}
      </p>
    );
  }
  return (
    <>
      {versions.map((version) => (
        <div key={version.id} className='rounded-md bg-muted/40 p-3 text-sm'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>V{version.versionNo}</span>
            <StatusBadge kind='version' status={version.status} />
            <span className='text-muted-foreground'>
              {version.submittedByName} · {formatDateTime(version.submittedAt)}
            </span>
            <span className='flex-1' />
            {version.canAccept ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => onReview(version)}
              >
                {t('delivery.acceptance.review')}
              </Button>
            ) : null}
          </div>
          {version.note ? <p className='mt-1'>{version.note}</p> : null}
          {version.reviewComment ? (
            <p className='mt-1 text-muted-foreground'>
              {t('delivery.acceptance.comment')}: {version.reviewComment}
            </p>
          ) : null}
          <ul className='mt-2 space-y-1'>
            {version.files.map((file, index) => (
              <li key={file.id} className='flex items-center gap-2'>
                <span className='truncate'>{file.filename}</span>
                <span className='text-xs text-muted-foreground'>
                  {formatBytes(file.size)}
                </span>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => onPreview(version.files, index)}
                >
                  <Eye aria-hidden='true' /> {t('delivery.files.preview')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function ReviewBody({
  version,
  onPreview,
}: {
  readonly version: DeliveryVersion;
  readonly onPreview: (files: readonly DeliveryFile[], index: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='space-y-2 rounded-md border border-border p-3 text-sm'>
      <p className='font-medium'>
        V{version.versionNo} · {version.submittedByName} ·{' '}
        {formatDateTime(version.submittedAt)}
      </p>
      {version.note ? <p>{version.note}</p> : null}
      <ul className='space-y-1'>
        {version.files.map((file, index) => (
          <li key={file.id} className='flex items-center gap-2'>
            <span className='truncate'>{file.filename}</span>
            <span className='text-xs text-muted-foreground'>
              {formatBytes(file.size)}
            </span>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => onPreview(version.files, index)}
            >
              <Eye aria-hidden='true' /> {t('delivery.files.preview')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionSubmitDialog({
  target,
  onClose,
  onSubmitted,
}: {
  readonly target: { task: DeliveryTask; milestoneName: string } | undefined;
  readonly onClose: () => void;
  readonly onSubmitted: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(FILE_RESOURCE_BY_KIND.deliverable),
    [manager],
  );
  const [selected, setSelected] = useState<readonly FileRecord[]>([]);
  const [note, setNote] = useState('');
  const errorMessage = useDeliveryErrorMessage();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!target) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.submitVersion(target.task.id, {
        note,
        fileIds: selected.map((file) => file.id),
      });
      setSelected([]);
      setNote('');
      onSubmitted();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) {
          setSelected([]);
          setNote('');
          setError(undefined);
          onClose();
        }
      }}
    >
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('delivery.deliverables.submitVersion')}</DialogTitle>
          <DialogDescription>
            {t('delivery.deliverables.submitHint', {
              name: target?.milestoneName ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        <FileUploadField
          repository={repository}
          value={selected}
          onChange={setSelected}
          onError={(cause) => setError(cause.message)}
          multiple
          maxSize={20 * 1024 * 1024}
          maxFiles={5}
        />
        <p className='text-xs text-muted-foreground'>
          {t('delivery.files.uploadHint', { size: 20, count: 5 })}
        </p>
        <div className='space-y-2'>
          <Label htmlFor='version-note'>
            {t('delivery.deliverables.note')}
          </Label>
          <Textarea
            id='version-note'
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {error ? (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={busy || !selected.length}
            onClick={() => void submit()}
          >
            {t('delivery.deliverables.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
