import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import {
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';

import { DeliveryFileList } from '@/components/delivery/file-list';
import { DeliveryFileUpload } from '@/components/delivery/file-upload';
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
import { Textarea } from '@/components/ui/textarea';
import {
  deliveryApi,
  formatDateTime,
  type DeliveryUser,
  type UploadedRecord,
} from '@/lib/delivery';
import { useDeliveryAction, useDeliveryQuery } from '@/lib/use-delivery-query';

const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export default function TaskDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const taskId = Number(params.taskId);
  const query = useDeliveryQuery(
    'task',
    (api) => deliveryApi.task(api, taskId),
    [taskId],
  );
  const users = useDeliveryQuery('users', (api) => deliveryApi.users(api));
  const action = useDeliveryAction();
  const [resultOpen, setResultOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [versionTarget, setVersionTarget] = useState<number>();

  const detail = query.data;

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <DeliveryQueryState
        error={query.error}
        loading={query.loading}
        onRetry={query.reload}
      >
        {detail ? (
          <div className='space-y-6'>
            <PageHeader
              actions={
                detail.canManage ? (
                  <>
                    <Button onClick={() => setEditOpen(true)} variant='outline'>
                      {t('delivery.tasks.edit')}
                    </Button>
                    {detail.canUpload ? (
                      <Button onClick={() => setResultOpen(true)}>
                        <Plus />
                        {t('delivery.results.create')}
                      </Button>
                    ) : null}
                  </>
                ) : detail.canUpload ? (
                  <Button onClick={() => setResultOpen(true)}>
                    <Plus />
                    {t('delivery.results.create')}
                  </Button>
                ) : undefined
              }
              description={[
                detail.project.code,
                detail.project.name,
                detail.milestone.name,
              ].join(' · ')}
              title={detail.task.title}
            />

            {action.error ? (
              <Alert variant='destructive'>
                <AlertDescription>{action.error}</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardContent className='grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3'>
                <Info label={t('delivery.field.assignee')}>
                  {detail.task.assigneeName ?? '-'}
                </Info>
                <Info label={t('delivery.field.priority')}>
                  <DeliveryStatusBadge
                    kind='priority'
                    value={detail.task.priority}
                  />
                </Info>
                <Info label={t('delivery.field.status')}>
                  <DeliveryStatusBadge kind='task' value={detail.task.status} />
                </Info>
                <Info label={t('delivery.field.planDate')}>
                  {detail.task.planDate ?? '-'}
                </Info>
                <Info label={t('delivery.field.actualDate')}>
                  {detail.task.actualDate ?? '-'}
                </Info>
                <Info label={t('delivery.field.milestone')}>
                  <Link
                    className='text-primary underline-offset-4 hover:underline'
                    to={`/milestones/${detail.milestone.id}`}
                  >
                    {detail.milestone.name}
                  </Link>
                </Info>
              </CardContent>
            </Card>

            {detail.canUpload ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('delivery.field.updateStatus')}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-wrap gap-2'>
                  {TASK_STATUSES.map((status) => (
                    <Button
                      disabled={action.pending || detail.task.status === status}
                      key={status}
                      onClick={() =>
                        void action
                          .run((api) =>
                            deliveryApi.updateTask(api, detail.task.id, {
                              status,
                            }),
                          )
                          .then((ok) => ok && query.reload())
                      }
                      variant={
                        detail.task.status === status ? 'default' : 'outline'
                      }
                    >
                      {t(`delivery.status.task.${status}`)}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.results.title')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {detail.results.length ? (
                  detail.results.map((result) => (
                    <div
                      className='space-y-3 rounded-lg border border-border p-3'
                      key={result.id}
                    >
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='text-sm font-medium'>{result.title}</p>
                        {detail.canUpload ? (
                          <Button
                            onClick={() => setVersionTarget(result.id)}
                            size='sm'
                            variant='outline'
                          >
                            <Plus />
                            {t('delivery.results.addVersion')}
                          </Button>
                        ) : null}
                      </div>
                      {result.versions.map((version) => (
                        <div
                          className='space-y-2 rounded-md bg-muted/40 p-3'
                          key={version.id}
                        >
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='text-sm'>
                              {t('delivery.field.versionNo', {
                                no: version.versionNo,
                              })}
                            </span>
                            <span className='text-xs text-muted-foreground'>
                              {version.note ? `${version.note} · ` : ''}
                              {version.uploaderName} ·{' '}
                              {formatDateTime(version.createdAt)}
                            </span>
                            {version.referencedBySubmission ? (
                              <span className='text-xs text-muted-foreground'>
                                {t('delivery.results.referenced')}
                              </span>
                            ) : null}
                          </div>
                          <DeliveryFileList
                            files={version.files}
                            onRemove={
                              detail.canUpload
                                ? (file) =>
                                    void action
                                      .run((api) =>
                                        deliveryApi.removeVersionFile(
                                          api,
                                          version.id,
                                          file.id,
                                        ),
                                      )
                                      .then((ok) => ok && query.reload())
                                : undefined
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.results.empty')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DeliveryQueryState>

      <ResultDialog
        onClose={() => setResultOpen(false)}
        onSaved={() => {
          setResultOpen(false);
          query.reload();
        }}
        open={resultOpen}
        taskId={taskId}
      />
      <VersionDialog
        onClose={() => setVersionTarget(undefined)}
        onSaved={() => {
          setVersionTarget(undefined);
          query.reload();
        }}
        resultId={versionTarget}
      />
      <EditTaskDialog
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          query.reload();
        }}
        open={editOpen}
        task={detail?.task}
        users={users.data ?? []}
      />
    </PageContainer>
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
    <div className='space-y-1'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <div className='text-sm'>{children}</div>
    </div>
  );
}

function useStagedFiles(): {
  readonly files: readonly UploadedRecord[];
  readonly add: (files: readonly UploadedRecord[]) => void;
  readonly clear: () => void;
} {
  const [files, setFiles] = useState<readonly UploadedRecord[]>([]);
  return {
    files,
    add: (uploaded) =>
      setFiles((current) => [...current, ...uploaded].slice(0, 5)),
    clear: () => setFiles([]),
  };
}

function ResultDialog({
  open,
  taskId,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly taskId: number;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const staged = useStagedFiles();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.createResult(api, taskId, {
        title,
        note,
        fileIds: staged.files.map((file) => file.id),
      }),
    );
    if (ok) {
      setTitle('');
      setNote('');
      staged.clear();
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.results.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.results.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='result-title'>{t('delivery.results.name')}</Label>
            <Input
              id='result-title'
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='result-note'>
              {t('delivery.field.versionNote')}
            </Label>
            <Textarea
              id='result-note'
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <DeliveryFileUpload onUploaded={staged.add} />
          <StagedList files={staged.files} />
          {action.error ? (
            <Alert variant='destructive'>
              <AlertDescription>{action.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter showCloseButton>
            <Button
              disabled={action.pending || !staged.files.length}
              type='submit'
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog({
  resultId,
  onClose,
  onSaved,
}: {
  readonly resultId: number | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const staged = useStagedFiles();
  const [note, setNote] = useState('');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!resultId) return;
    const ok = await action.run((api) =>
      deliveryApi.addVersion(api, resultId, {
        note,
        fileIds: staged.files.map((file) => file.id),
      }),
    );
    if (ok) {
      setNote('');
      staged.clear();
      onSaved();
    }
  }

  return (
    <Dialog
      open={Boolean(resultId)}
      onOpenChange={(next) => !next && onClose()}
    >
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.results.addVersion')}</DialogTitle>
            <DialogDescription>
              {t('delivery.results.addVersionDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='version-note'>
              {t('delivery.field.versionNote')}
            </Label>
            <Textarea
              id='version-note'
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <DeliveryFileUpload onUploaded={staged.add} />
          <StagedList files={staged.files} />
          {action.error ? (
            <Alert variant='destructive'>
              <AlertDescription>{action.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter showCloseButton>
            <Button
              disabled={action.pending || !staged.files.length}
              type='submit'
            >
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StagedList({
  files,
}: {
  readonly files: readonly UploadedRecord[];
}): ReactElement | null {
  if (!files.length) return null;
  return (
    <ul className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
      {files.map((file) => (
        <li className='rounded-md bg-muted px-2 py-1' key={file.id}>
          {file.filename}
        </li>
      ))}
    </ul>
  );
}

function EditTaskDialog({
  open,
  task,
  users,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly task?: {
    readonly id: number;
    readonly title: string;
    readonly assigneeId: string | null;
    readonly priority: string;
    readonly planDate: string | null;
    readonly description: string | null;
  };
  readonly users: readonly DeliveryUser[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [form, setForm] = useState(() => ({
    title: task?.title ?? '',
    assigneeId: task?.assigneeId ?? '',
    priority: task?.priority ?? 'medium',
    planDate: task?.planDate ?? '',
    description: task?.description ?? '',
  }));
  const [initializedFor, setInitializedFor] = useState<number | undefined>(
    task?.id,
  );
  if (task && initializedFor !== task.id) {
    setInitializedFor(task.id);
    setForm({
      title: task.title,
      assigneeId: task.assigneeId ?? '',
      priority: task.priority,
      planDate: task.planDate ?? '',
      description: task.description ?? '',
    });
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!task) return;
    const ok = await action.run((api) =>
      deliveryApi.updateTask(api, task.id, { ...form }),
    );
    if (ok) onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.tasks.edit')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='edit-task-title'>{t('delivery.field.task')}</Label>
            <Input
              id='edit-task-title'
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              required
              value={form.title}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='edit-task-assignee'>
                {t('delivery.field.assignee')}
              </Label>
              <NativeSelect
                id='edit-task-assignee'
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
              <Label htmlFor='edit-task-priority'>
                {t('delivery.field.priority')}
              </Label>
              <NativeSelect
                id='edit-task-priority'
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
            <Label htmlFor='edit-task-plan'>
              {t('delivery.field.planDate')}
            </Label>
            <Input
              id='edit-task-plan'
              onChange={(event) =>
                setForm({ ...form, planDate: event.target.value })
              }
              type='date'
              value={form.planDate}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='edit-task-description'>
              {t('delivery.field.description')}
            </Label>
            <Textarea
              id='edit-task-description'
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
