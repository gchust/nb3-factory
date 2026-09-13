import { useTranslation } from '@nocobase/i18n/client';
import { Paperclip, Plus, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  FormInput,
  FormSelect,
  StatusBadge,
  DeliveryEmpty,
  DeliveryError,
  DeliveryHeader,
  DeliveryLoading,
} from '@/components/delivery/ui';
import { formatDate } from '@/components/delivery/format';
import { useAsyncData } from '@/components/delivery/use-async-data';
import {
  useDeliveryApi,
  type Attachment,
  type DeliveryActor,
  type Project,
  type ProjectStatus,
} from '@/components/delivery/delivery-api';

const EMPTY_FORM = {
  name: '',
  clientName: '',
  managerId: '',
  startDate: '',
  endDate: '',
  budgetHours: '',
  status: 'planning' as ProjectStatus,
};

export default function DeliveryProjectsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const actor = useAsyncData(() => api.me(), [api]);
  const members = useAsyncData(() => api.members(), [api]);
  const [status, setStatus] = useState('');
  const actorValue: DeliveryActor | undefined = actor.data;
  const canManage = actorValue ? actorValue.role !== 'member' : false;

  const projects = useAsyncData(
    () => api.listProjects(status || undefined),
    [api, status],
  );

  const [editing, setEditing] = useState<Project | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [attachmentsFor, setAttachmentsFor] = useState<Project | null>(null);

  const openCreate = (): void => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (project: Project): void => {
    setEditing(project);
    setFormOpen(true);
  };

  const memberOptions = (members.data ?? []).map((member) => ({
    value: member.id,
    label: member.name || member.id,
  }));

  const statusOptions = [
    { value: 'planning', label: t('delivery.status.project.planning') },
    { value: 'active', label: t('delivery.status.project.active') },
    { value: 'delivered', label: t('delivery.status.project.delivered') },
    { value: 'paused', label: t('delivery.status.project.paused') },
  ];

  return (
    <section className='space-y-6 p-6'>
      <DeliveryHeader
        title={t('delivery.projects.title')}
        description={t('delivery.projects.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={projects.reload}>
              <RefreshCw aria-hidden='true' />
              {t('delivery.actions.refresh')}
            </Button>
            {canManage ? (
              <Button size='sm' onClick={openCreate}>
                <Plus aria-hidden='true' />
                {t('delivery.projects.create')}
              </Button>
            ) : null}
          </>
        }
      />
      <div className='max-w-xs'>
        <FormSelect
          id='project-status-filter'
          label={t('delivery.projects.filterStatus')}
          value={status}
          onChange={setStatus}
          emptyLabel={t('delivery.projects.allStatuses')}
          options={statusOptions}
        />
      </div>
      {projects.loading ? <DeliveryLoading /> : null}
      {projects.error ? (
        <DeliveryError error={projects.error} onRetry={projects.reload} />
      ) : null}
      {projects.data ? (
        <Card>
          <CardContent>
            {projects.data.length === 0 ? (
              <DeliveryEmpty>{t('delivery.projects.empty')}</DeliveryEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.fields.name')}</TableHead>
                    <TableHead>{t('delivery.fields.client')}</TableHead>
                    <TableHead>{t('delivery.fields.manager')}</TableHead>
                    <TableHead>{t('delivery.fields.startDate')}</TableHead>
                    <TableHead>{t('delivery.fields.endDate')}</TableHead>
                    <TableHead>{t('delivery.fields.budgetHours')}</TableHead>
                    <TableHead>{t('delivery.fields.status')}</TableHead>
                    <TableHead>{t('delivery.fields.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.data.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className='font-medium'>
                        {project.name}
                      </TableCell>
                      <TableCell>{project.clientName}</TableCell>
                      <TableCell>{project.managerName ?? '—'}</TableCell>
                      <TableCell>{formatDate(project.startDate)}</TableCell>
                      <TableCell>{formatDate(project.endDate)}</TableCell>
                      <TableCell>
                        {project.budgetHours === null
                          ? '—'
                          : project.budgetHours}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          value={t(`delivery.status.project.${project.status}`)}
                          tone={projectStatusTone(project.status)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-2'>
                          {canManage ? (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => openEdit(project)}
                            >
                              {t('delivery.actions.edit')}
                            </Button>
                          ) : null}
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => setAttachmentsFor(project)}
                          >
                            <Paperclip aria-hidden='true' />
                            {t('delivery.attachments.button')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
      {canManage ? (
        <ProjectFormDialog
          key={editing?.id ?? 'create'}
          open={formOpen}
          project={editing}
          memberOptions={memberOptions}
          statusOptions={statusOptions}
          onOpenChange={setFormOpen}
          onSaved={() => {
            setFormOpen(false);
            projects.reload();
          }}
        />
      ) : null}
      {attachmentsFor ? (
        <AttachmentsDialog
          project={attachmentsFor}
          canManage={canManage}
          onClose={() => setAttachmentsFor(null)}
        />
      ) : null}
    </section>
  );
}

function projectStatusTone(status: ProjectStatus): string {
  switch (status) {
    case 'active':
      return 'info';
    case 'delivered':
      return 'positive';
    case 'paused':
      return 'warning';
    default:
      return 'neutral';
  }
}

function ProjectFormDialog({
  open,
  project,
  memberOptions,
  statusOptions,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  project: Project | null;
  memberOptions: readonly { value: string; label: string }[];
  statusOptions: readonly { value: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const [form, setForm] = useState(() =>
    project
      ? {
          name: project.name,
          clientName: project.clientName,
          managerId: project.managerId ?? '',
          startDate: project.startDate?.slice(0, 10) ?? '',
          endDate: project.endDate?.slice(0, 10) ?? '',
          budgetHours:
            project.budgetHours === null ? '' : String(project.budgetHours),
          status: project.status,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  const update = (key: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        name: form.name,
        clientName: form.clientName,
        managerId: form.managerId || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        budgetHours: form.budgetHours === '' ? null : Number(form.budgetHours),
        status: form.status,
      };
      if (project) {
        await api.updateProject(project.id, payload);
      } else {
        await api.createProject(payload);
      }
      onSaved();
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {project
              ? t('delivery.projects.editTitle')
              : t('delivery.projects.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FormInput
            id='project-name'
            label={t('delivery.fields.name')}
            value={form.name}
            onChange={update('name')}
            required
          />
          <FormInput
            id='project-client'
            label={t('delivery.fields.client')}
            value={form.clientName}
            onChange={update('clientName')}
            required
          />
          <FormSelect
            id='project-manager'
            label={t('delivery.fields.manager')}
            value={form.managerId}
            onChange={update('managerId')}
            emptyLabel={t('delivery.unassigned')}
            options={memberOptions}
          />
          <FormSelect
            id='project-status'
            label={t('delivery.fields.status')}
            value={form.status}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                status: value as ProjectStatus,
              }))
            }
            options={statusOptions}
          />
          <FormInput
            id='project-start'
            label={t('delivery.fields.startDate')}
            type='date'
            value={form.startDate}
            onChange={update('startDate')}
          />
          <FormInput
            id='project-end'
            label={t('delivery.fields.endDate')}
            type='date'
            value={form.endDate}
            onChange={update('endDate')}
          />
          <FormInput
            id='project-budget'
            label={t('delivery.fields.budgetHours')}
            type='number'
            min='0'
            step='0.5'
            value={form.budgetHours}
            onChange={update('budgetHours')}
          />
          {error ? (
            <div className='sm:col-span-2'>
              <DeliveryError error={error} />
            </div>
          ) : null}
          <DialogFooter className='sm:col-span-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('delivery.actions.cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {t('delivery.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentsDialog({
  project,
  canManage,
  onClose,
}: {
  project: Project;
  canManage: boolean;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const attachments = useAsyncData(
    () => api.listAttachments(project.id),
    [api, project.id],
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>();
  const [uploading, setUploading] = useState(false);

  const upload = async (): Promise<void> => {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      await api.uploadAttachment(project.id, file);
      setFile(null);
      attachments.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('delivery.attachments.title', { name: project.name })}
          </DialogTitle>
        </DialogHeader>
        {error ? <DeliveryError error={error} /> : null}
        {attachments.loading ? <DeliveryLoading /> : null}
        {attachments.error ? (
          <DeliveryError
            error={attachments.error}
            onRetry={attachments.reload}
          />
        ) : null}
        {attachments.data ? (
          attachments.data.length === 0 ? (
            <DeliveryEmpty>{t('delivery.attachments.empty')}</DeliveryEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('delivery.attachments.filename')}</TableHead>
                  <TableHead>{t('delivery.attachments.size')}</TableHead>
                  <TableHead>{t('delivery.fields.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.data.map((attachment: Attachment) => (
                  <TableRow key={attachment.id}>
                    <TableCell className='font-medium'>
                      {attachment.filename}
                    </TableCell>
                    <TableCell>{attachment.size}</TableCell>
                    <TableCell>
                      <Button
                        variant='outline'
                        size='sm'
                        render={
                          <a
                            href={attachment.contentUrl}
                            download={attachment.filename}
                          />
                        }
                      >
                        {t('delivery.attachments.download')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : null}
        {canManage ? (
          <div className='space-y-3 rounded-lg border border-border p-4'>
            <p className='text-sm font-medium'>
              {t('delivery.attachments.upload')}
            </p>
            <input
              aria-label={t('delivery.attachments.upload')}
              type='file'
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className='block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground'
            />
            <Button
              size='sm'
              disabled={!file || uploading}
              onClick={() => void upload()}
            >
              {t('delivery.actions.upload')}
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('delivery.actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
