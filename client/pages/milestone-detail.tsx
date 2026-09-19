import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Send } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { DeliveryQueryState } from '@/components/delivery/query-state';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { deliveryApi, formatDateTime, type DeliveryUser } from '@/lib/delivery';
import { useDeliveryAction, useDeliveryQuery } from '@/lib/use-delivery-query';

export default function MilestoneDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const milestoneId = Number(params.milestoneId);
  const query = useDeliveryQuery(
    'milestone',
    (api) => deliveryApi.milestone(api, milestoneId),
    [milestoneId],
  );
  const users = useDeliveryQuery('users', (api) => deliveryApi.users(api));
  const [taskOpen, setTaskOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const detail = query.data;
  const canManage =
    detail?.project.role === 'admin' || detail?.project.role === 'manager';
  const allDone = Boolean(
    detail &&
    detail.milestone.taskCount > 0 &&
    detail.milestone.doneCount === detail.milestone.taskCount,
  );
  // An accepted milestone is settled; the server refuses another application,
  // so the entry to it is closed here as well.
  const completed = detail?.milestone.status === 'completed';

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <DeliveryQueryState
        error={query.error}
        loading={query.loading}
        onRetry={query.reload}
      >
        {detail ? (
          <div className='space-y-6'>
            <PageHeader
              actions={
                canManage ? (
                  <>
                    <Button onClick={() => setTaskOpen(true)} variant='outline'>
                      <Plus />
                      {t('delivery.tasks.create')}
                    </Button>
                    <Button
                      disabled={!allDone || completed}
                      onClick={() => setSubmitOpen(true)}
                    >
                      <Send />
                      {t('delivery.submissions.create')}
                    </Button>
                  </>
                ) : undefined
              }
              description={[
                detail.project.code,
                detail.project.name,
                detail.milestone.dueDate
                  ? `${t('delivery.field.dueDate')}: ${detail.milestone.dueDate}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              title={detail.milestone.name}
            />

            {canManage && !allDone ? (
              <Alert>
                <AlertDescription>
                  {t('delivery.submissions.notReady')}
                </AlertDescription>
              </Alert>
            ) : null}

            {canManage && completed ? (
              <Alert>
                <AlertDescription>
                  {t('delivery.submissions.completed')}
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.milestones.progressTitle')}</CardTitle>
              </CardHeader>
              <CardContent className='flex items-center gap-3'>
                <DeliveryStatusBadge
                  kind='milestone'
                  value={detail.milestone.status}
                />
                <Progress
                  className='max-w-md flex-1'
                  value={Math.round(detail.milestone.progress * 100)}
                />
                <span className='text-sm text-muted-foreground'>
                  {detail.milestone.doneCount}/{detail.milestone.taskCount}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.tasks.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.tasks.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('delivery.field.task')}</TableHead>
                        <TableHead>{t('delivery.field.assignee')}</TableHead>
                        <TableHead>{t('delivery.field.priority')}</TableHead>
                        <TableHead>{t('delivery.field.planDate')}</TableHead>
                        <TableHead>{t('delivery.field.actualDate')}</TableHead>
                        <TableHead>{t('delivery.field.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.tasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <Link
                              className='text-primary underline-offset-4 hover:underline'
                              to={`/tasks/${task.id}`}
                            >
                              {task.title}
                            </Link>
                          </TableCell>
                          <TableCell>{task.assigneeName ?? '-'}</TableCell>
                          <TableCell>
                            <DeliveryStatusBadge
                              kind='priority'
                              value={task.priority}
                            />
                          </TableCell>
                          <TableCell>{task.planDate ?? '-'}</TableCell>
                          <TableCell>{task.actualDate ?? '-'}</TableCell>
                          <TableCell>
                            <DeliveryStatusBadge
                              kind='task'
                              value={task.status}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.tasks.empty')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.submissions.historyTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.submissions.length ? (
                  <ul className='space-y-2'>
                    {detail.submissions.map((submission) => (
                      <li
                        className='flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2'
                        key={submission.id}
                      >
                        <span className='text-sm'>
                          {t('delivery.submissions.round', {
                            round: submission.round,
                          })}
                        </span>
                        <DeliveryStatusBadge
                          kind='submission'
                          value={submission.status}
                        />
                        <span className='text-xs text-muted-foreground'>
                          {t('delivery.field.applicant')}:{' '}
                          {submission.applicantName} ·{' '}
                          {t('delivery.field.reviewer')}:{' '}
                          {submission.reviewerName} ·{' '}
                          {formatDateTime(submission.createdAt)}
                        </span>
                        <Link
                          className='ml-auto text-sm text-primary underline-offset-4 hover:underline'
                          to={`/submissions/${submission.id}`}
                        >
                          {t('delivery.actions.viewDetail')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.submissions.empty')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DeliveryQueryState>

      <CreateTaskDialog
        milestoneId={milestoneId}
        onClose={() => setTaskOpen(false)}
        onSaved={() => {
          setTaskOpen(false);
          query.reload();
        }}
        open={taskOpen}
        users={users.data ?? []}
      />
      <SubmitDeliveryDialog
        milestoneId={milestoneId}
        onClose={() => setSubmitOpen(false)}
        onSaved={() => {
          setSubmitOpen(false);
          query.reload();
        }}
        open={submitOpen}
        users={users.data ?? []}
      />
    </PageContainer>
  );
}

function CreateTaskDialog({
  open,
  milestoneId,
  users,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly milestoneId: number;
  readonly users: readonly DeliveryUser[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [form, setForm] = useState({
    title: '',
    assigneeId: '',
    priority: 'medium',
    planDate: '',
    description: '',
  });

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.createTask(api, { milestoneId, ...form }),
    );
    if (ok) {
      setForm({
        title: '',
        assigneeId: '',
        priority: 'medium',
        planDate: '',
        description: '',
      });
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.tasks.create')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='task-title'>{t('delivery.field.task')}</Label>
            <Input
              id='task-title'
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              required
              value={form.title}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='task-assignee'>
                {t('delivery.field.assignee')}
              </Label>
              <NativeSelect
                id='task-assignee'
                onChange={(event) =>
                  setForm({ ...form, assigneeId: event.target.value })
                }
                value={form.assigneeId}
              >
                <option value=''>{t('delivery.form.selectUser')}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='task-priority'>
                {t('delivery.field.priority')}
              </Label>
              <NativeSelect
                id='task-priority'
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
                value={form.priority}
              >
                <option value='low'>{t('delivery.status.priority.low')}</option>
                <option value='medium'>
                  {t('delivery.status.priority.medium')}
                </option>
                <option value='high'>
                  {t('delivery.status.priority.high')}
                </option>
              </NativeSelect>
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='task-plan'>{t('delivery.field.planDate')}</Label>
            <Input
              id='task-plan'
              onChange={(event) =>
                setForm({ ...form, planDate: event.target.value })
              }
              type='date'
              value={form.planDate}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='task-description'>
              {t('delivery.field.description')}
            </Label>
            <Textarea
              id='task-description'
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              value={form.description}
            />
          </div>
          {action.error ? (
            <Alert variant='destructive'>
              <AlertDescription>{action.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter showCloseButton>
            <Button disabled={action.pending} type='submit'>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitDeliveryDialog({
  open,
  milestoneId,
  users,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly milestoneId: number;
  readonly users: readonly DeliveryUser[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const versions = useDeliveryQuery(
    'milestone-versions',
    (api) => deliveryApi.milestoneVersions(api, milestoneId),
    [milestoneId, open],
  );
  const [reviewerId, setReviewerId] = useState('');
  const [note, setNote] = useState('');
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  const groups = versions.data ?? [];
  const selection: Record<number, number> = {};
  for (const group of groups) {
    for (const result of group.results) {
      const latest = result.versions[result.versions.length - 1];
      if (latest) selection[result.id] = overrides[result.id] ?? latest.id;
    }
  }
  const versionIds = Object.values(selection);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.createSubmission(api, {
        milestoneId,
        reviewerId,
        note,
        versionIds,
      }),
    );
    if (ok) {
      setReviewerId('');
      setNote('');
      setOverrides({});
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.submissions.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.submissions.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='submission-reviewer'>
              {t('delivery.field.reviewer')}
            </Label>
            <NativeSelect
              id='submission-reviewer'
              onChange={(event) => setReviewerId(event.target.value)}
              required
              value={reviewerId}
            >
              <option value=''>{t('delivery.form.selectUser')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='submission-note'>{t('delivery.field.note')}</Label>
            <Textarea
              id='submission-note'
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <div className='space-y-3'>
            <p className='text-sm font-medium'>
              {t('delivery.submissions.selectVersions')}
            </p>
            {groups.map((group) => (
              <div
                className='space-y-2 rounded-lg border border-border p-3'
                key={group.taskId}
              >
                <p className='text-sm'>{group.taskTitle}</p>
                {group.results.map((result) => (
                  <div className='space-y-1' key={result.id}>
                    <p className='text-xs text-muted-foreground'>
                      {result.title}
                    </p>
                    {result.versions.map((version) => (
                      <label
                        className='flex cursor-pointer items-center gap-2 text-sm'
                        key={version.id}
                      >
                        <input
                          checked={selection[result.id] === version.id}
                          name={`version-${result.id}`}
                          onChange={() =>
                            setOverrides({
                              ...overrides,
                              [result.id]: version.id,
                            })
                          }
                          type='radio'
                          value={version.id}
                        />
                        <span>
                          {t('delivery.field.versionNo', {
                            no: version.versionNo,
                          })}
                          {version.note ? ` · ${version.note}` : ''}
                          {` · ${version.files.length} ${t('delivery.file.unit')}`}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {action.error ? (
            <Alert variant='destructive'>
              <AlertDescription>{action.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter showCloseButton>
            <Button
              disabled={action.pending || !reviewerId || !versionIds.length}
              type='submit'
            >
              {t('delivery.submissions.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
