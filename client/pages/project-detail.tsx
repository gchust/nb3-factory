import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Trash2 } from 'lucide-react';
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
import {
  deliveryApi,
  formatDateTime,
  type DeliveryMaterial,
  type DeliveryUser,
  type UploadedRecord,
} from '@/lib/delivery';
import { useDeliveryAction, useDeliveryQuery } from '@/lib/use-delivery-query';

export default function ProjectDetailPage(): ReactElement {
  const { t } = useTranslation();
  const params = useParams();
  const projectId = Number(params.projectId);
  const query = useDeliveryQuery(
    'project',
    (api) => deliveryApi.project(api, projectId),
    [projectId],
  );
  const me = useDeliveryQuery('me', (api) => deliveryApi.me(api));
  const users = useDeliveryQuery('users', (api) => deliveryApi.users(api));
  const action = useDeliveryAction();
  const [editOpen, setEditOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);

  const detail = query.data;
  const canManage =
    detail?.project.role === 'admin' || detail?.project.role === 'manager';

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
                    <Button onClick={() => setEditOpen(true)} variant='outline'>
                      {t('delivery.projects.edit')}
                    </Button>
                    <Button onClick={() => setMilestoneOpen(true)}>
                      <Plus />
                      {t('delivery.milestones.create')}
                    </Button>
                  </>
                ) : undefined
              }
              description={detail.project.description ?? undefined}
              title={`${detail.project.code} · ${detail.project.name}`}
            />

            {action.error ? (
              <Alert variant='destructive'>
                <AlertDescription>{action.error}</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.projects.overview')}</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                <Info label={t('delivery.field.manager')}>
                  {detail.project.managerName ?? '-'}
                </Info>
                <Info label={t('delivery.field.dates')}>
                  {detail.project.startDate ?? '-'} ~{' '}
                  {detail.project.endDate ?? '-'}
                </Info>
                <Info label={t('delivery.field.status')}>
                  <DeliveryStatusBadge
                    kind='project'
                    value={detail.project.status}
                  />
                </Info>
                <Info label={t('delivery.field.members')}>
                  {detail.project.memberCount}
                </Info>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex-row items-center justify-between'>
                <CardTitle>{t('delivery.members.title')}</CardTitle>
                {canManage ? (
                  <Button
                    onClick={() => setMemberOpen(true)}
                    size='sm'
                    variant='outline'
                  >
                    <Plus />
                    {t('delivery.members.add')}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                <ul className='space-y-2'>
                  {detail.members.map((member) => (
                    <li
                      className='flex items-center gap-3 rounded-lg border border-border px-3 py-2'
                      key={member.id}
                    >
                      <span className='flex-1 text-sm'>{member.name}</span>
                      <DeliveryStatusBadge kind='role' value={member.role} />
                      {canManage &&
                      member.userId !== detail.project.managerId ? (
                        <Button
                          aria-label={`${t('delivery.members.remove')} ${member.name}`}
                          onClick={() =>
                            void action
                              .run((api) =>
                                deliveryApi.removeMember(
                                  api,
                                  detail.project.id,
                                  member.id,
                                ),
                              )
                              .then((ok) => ok && query.reload())
                          }
                          size='icon-sm'
                          variant='ghost'
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex-row items-center justify-between'>
                <CardTitle>{t('delivery.materials.title')}</CardTitle>
                {canManage ? (
                  <Button
                    onClick={() => setMaterialOpen(true)}
                    size='sm'
                    variant='outline'
                  >
                    <Plus />
                    {t('delivery.materials.create')}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className='space-y-4'>
                {detail.materials.length ? (
                  detail.materials.map((material) => (
                    <MaterialItem
                      canManage={Boolean(canManage)}
                      key={material.id}
                      material={material}
                      onChanged={query.reload}
                    />
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.materials.empty')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('delivery.milestones.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.milestones.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('delivery.field.name')}</TableHead>
                        <TableHead>{t('delivery.field.dueDate')}</TableHead>
                        <TableHead>{t('delivery.field.status')}</TableHead>
                        <TableHead>{t('delivery.field.progress')}</TableHead>
                        <TableHead>{t('delivery.field.submission')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.milestones.map((milestone) => (
                        <TableRow key={milestone.id}>
                          <TableCell>
                            <Link
                              className='text-primary underline-offset-4 hover:underline'
                              to={`/milestones/${milestone.id}`}
                            >
                              {milestone.name}
                            </Link>
                          </TableCell>
                          <TableCell>{milestone.dueDate ?? '-'}</TableCell>
                          <TableCell>
                            <DeliveryStatusBadge
                              kind='milestone'
                              value={milestone.status}
                            />
                          </TableCell>
                          <TableCell>
                            <div className='flex items-center gap-2'>
                              <Progress
                                className='w-24'
                                value={Math.round(milestone.progress * 100)}
                              />
                              <span className='text-xs text-muted-foreground'>
                                {milestone.doneCount}/{milestone.taskCount}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {milestone.submission ? (
                              <DeliveryStatusBadge
                                kind='submission'
                                value={milestone.submission.status}
                              />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    {t('delivery.milestones.empty')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DeliveryQueryState>

      <EditProjectDialog
        isAdmin={Boolean(me.data?.isAdmin)}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          query.reload();
        }}
        open={editOpen}
        project={detail?.project}
        users={users.data ?? []}
      />
      <AddMemberDialog
        members={detail?.members ?? []}
        onClose={() => setMemberOpen(false)}
        onSaved={() => {
          setMemberOpen(false);
          query.reload();
        }}
        open={memberOpen}
        projectId={projectId}
        users={users.data ?? []}
      />
      <CreateMaterialDialog
        onClose={() => setMaterialOpen(false)}
        onSaved={() => {
          setMaterialOpen(false);
          query.reload();
        }}
        open={materialOpen}
        projectId={projectId}
      />
      <CreateMilestoneDialog
        onClose={() => setMilestoneOpen(false)}
        onSaved={() => {
          setMilestoneOpen(false);
          query.reload();
        }}
        open={milestoneOpen}
        projectId={projectId}
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

function MaterialItem({
  material,
  canManage,
  onChanged,
}: {
  readonly material: DeliveryMaterial;
  readonly canManage: boolean;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  return (
    <div className='space-y-2 rounded-lg border border-border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-sm font-medium'>{material.title}</p>
          <p className='text-xs text-muted-foreground'>
            {material.note ? `${material.note} · ` : ''}
            {material.uploaderName} · {formatDateTime(material.createdAt)}
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() =>
              void action
                .run((api) => deliveryApi.removeMaterial(api, material.id))
                .then((ok) => ok && onChanged())
            }
            size='sm'
            variant='ghost'
          >
            <Trash2 />
            {t('delivery.materials.remove')}
          </Button>
        ) : null}
      </div>
      <DeliveryFileList
        files={material.files}
        onRemove={
          canManage
            ? (file) =>
                void action
                  .run((api) =>
                    deliveryApi.removeMaterialFile(api, material.id, file.id),
                  )
                  .then((ok) => ok && onChanged())
            : undefined
        }
      />
      {action.error ? (
        <p className='text-xs text-destructive' role='alert'>
          {action.error}
        </p>
      ) : null}
    </div>
  );
}

interface EditProjectDialogProps {
  readonly open: boolean;
  readonly project?: {
    readonly id: number;
    readonly name: string;
    readonly managerId: string | null;
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly status: string;
    readonly description: string | null;
  };
  readonly users: readonly DeliveryUser[];
  readonly isAdmin: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

function EditProjectDialog({
  open,
  project,
  users,
  isAdmin,
  onClose,
  onSaved,
}: EditProjectDialogProps): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [form, setForm] = useState(() => ({
    name: project?.name ?? '',
    managerId: project?.managerId ?? '',
    startDate: project?.startDate ?? '',
    endDate: project?.endDate ?? '',
    status: project?.status ?? 'active',
    description: project?.description ?? '',
  }));
  const [initializedFor, setInitializedFor] = useState<number | undefined>(
    project?.id,
  );
  if (project && initializedFor !== project.id) {
    setInitializedFor(project.id);
    setForm({
      name: project.name,
      managerId: project.managerId ?? '',
      startDate: project.startDate ?? '',
      endDate: project.endDate ?? '',
      status: project.status,
      description: project.description ?? '',
    });
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!project) return;
    const input: Record<string, unknown> = {
      name: form.name,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      description: form.description,
    };
    if (isAdmin) input.managerId = form.managerId;
    const ok = await action.run((api) =>
      deliveryApi.updateProject(api, project.id, input),
    );
    if (ok) onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.projects.edit')}</DialogTitle>
            <DialogDescription>
              {t('delivery.projects.editDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='edit-name'>{t('delivery.field.name')}</Label>
            <Input
              id='edit-name'
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
              value={form.name}
            />
          </div>
          {isAdmin ? (
            <div className='space-y-1.5'>
              <Label htmlFor='edit-manager'>
                {t('delivery.field.manager')}
              </Label>
              <NativeSelect
                id='edit-manager'
                onChange={(event) =>
                  setForm({ ...form, managerId: event.target.value })
                }
                value={form.managerId}
              >
                <option value=''>{t('delivery.form.selectUser')}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='edit-start'>
                {t('delivery.field.startDate')}
              </Label>
              <Input
                id='edit-start'
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
                type='date'
                value={form.startDate}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='edit-end'>{t('delivery.field.endDate')}</Label>
              <Input
                id='edit-end'
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
                type='date'
                value={form.endDate}
              />
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='edit-status'>{t('delivery.field.status')}</Label>
            <NativeSelect
              id='edit-status'
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
              value={form.status}
            >
              <option value='active'>
                {t('delivery.status.project.active')}
              </option>
              <option value='on_hold'>
                {t('delivery.status.project.on_hold')}
              </option>
              <option value='completed'>
                {t('delivery.status.project.completed')}
              </option>
            </NativeSelect>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='edit-description'>
              {t('delivery.field.description')}
            </Label>
            <Textarea
              id='edit-description'
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

function AddMemberDialog({
  open,
  projectId,
  members,
  users,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly projectId: number;
  readonly members: readonly { userId: string }[];
  readonly users: readonly DeliveryUser[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('member');
  const memberIds = new Set(members.map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.addMember(api, projectId, { userId, role }),
    );
    if (ok) {
      setUserId('');
      setRole('member');
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.members.add')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='member-user'>{t('delivery.field.member')}</Label>
            <NativeSelect
              id='member-user'
              onChange={(event) => setUserId(event.target.value)}
              required
              value={userId}
            >
              <option value=''>{t('delivery.form.selectUser')}</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='member-role'>{t('delivery.field.role')}</Label>
            <NativeSelect
              id='member-role'
              onChange={(event) => setRole(event.target.value)}
              value={role}
            >
              <option value='member'>{t('delivery.status.role.member')}</option>
              <option value='manager'>
                {t('delivery.status.role.manager')}
              </option>
            </NativeSelect>
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

function CreateMaterialDialog({
  open,
  projectId,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly projectId: number;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<readonly UploadedRecord[]>([]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.createMaterial(api, projectId, {
        title,
        note,
        fileIds: files.map((file) => file.id),
      }),
    );
    if (ok) {
      setTitle('');
      setNote('');
      setFiles([]);
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.materials.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.materials.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='material-title'>
              {t('delivery.materials.name')}
            </Label>
            <Input
              id='material-title'
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='material-note'>
              {t('delivery.field.description')}
            </Label>
            <Textarea
              id='material-note'
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <DeliveryFileUpload
            onUploaded={(uploaded) =>
              setFiles((current) => [...current, ...uploaded].slice(0, 5))
            }
          />
          {files.length ? (
            <ul className='space-y-1 text-xs text-muted-foreground'>
              {files.map((file) => (
                <li key={file.id}>{file.filename}</li>
              ))}
            </ul>
          ) : null}
          {action.error ? (
            <Alert variant='destructive'>
              <AlertDescription>{action.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter showCloseButton>
            <Button disabled={action.pending || !files.length} type='submit'>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateMilestoneDialog({
  open,
  projectId,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly projectId: number;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [form, setForm] = useState({ name: '', dueDate: '', description: '' });

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.createMilestone(api, { projectId, ...form }),
    );
    if (ok) {
      setForm({ name: '', dueDate: '', description: '' });
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.milestones.create')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-1.5'>
            <Label htmlFor='milestone-name'>{t('delivery.field.name')}</Label>
            <Input
              id='milestone-name'
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
              value={form.name}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='milestone-due'>{t('delivery.field.dueDate')}</Label>
            <Input
              id='milestone-due'
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
              type='date'
              value={form.dueDate}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='milestone-description'>
              {t('delivery.field.description')}
            </Label>
            <Textarea
              id='milestone-description'
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
