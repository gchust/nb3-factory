import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DeliveryIssue } from '@/lib/delivery-api';
import { useDeliveryErrorMessage } from '@/lib/delivery-error';
import { ISSUE_STATUSES } from '@/lib/constants';
import {
  issueSeverityLabel,
  issueSeverityOptions,
  issueStatusLabel,
  issueStatusOptions,
} from '@/lib/status-labels';
import { formatDate } from '@/lib/format';
import { useDeliveryApi, useResource } from '@/lib/use-delivery-resource';

export default function IssuesPage(): ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = useState('all');
  const state = useResource(
    (client) =>
      client.issues({
        status: status === 'all' ? undefined : status,
        pageSize: 100,
      }),
    status,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryIssue>();

  const statusOptions = [
    { value: 'all', label: t('delivery.issues.filterAll') },
    ...ISSUE_STATUSES.map((value) => ({
      value,
      label: issueStatusLabel(t, value),
    })),
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.issues.title')}
        description={t('delivery.issues.description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden='true' /> {t('delivery.issues.create')}
          </Button>
        }
      />

      <Card>
        <CardHeader className='gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>{t('delivery.issues.list')}</CardTitle>
            <CardDescription>{t('delivery.issues.listHint')}</CardDescription>
          </div>
          <SelectField
            label={t('delivery.issues.filterStatus')}
            value={status}
            options={statusOptions}
            onValueChange={setStatus}
          />
        </CardHeader>
        <CardContent className='space-y-3'>
          {state.loading ? <Loading /> : null}
          {state.error ? (
            <div className='space-y-2'>
              <p className='text-sm text-destructive'>{state.error}</p>
              <Button onClick={state.reload}>
                {t('delivery.common.retry')}
              </Button>
            </div>
          ) : null}
          {state.data && !state.loading ? (
            state.data.items.length ? (
              state.data.items.map((issue) => (
                <div
                  key={issue.id}
                  className='flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3'
                >
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{issue.title}</span>
                      <StatusBadge kind='issue' status={issue.status} />
                      <Badge variant='secondary'>
                        {issueSeverityLabel(t, issue.severity)}
                      </Badge>
                    </div>
                    <p className='text-sm text-muted-foreground'>
                      {issue.projectNo} · {issue.projectTitle}
                      {issue.taskName ? ` · ${issue.taskName}` : ''}
                      {issue.milestoneName ? ` · ${issue.milestoneName}` : ''}
                    </p>
                    {issue.description ? (
                      <p className='text-sm'>{issue.description}</p>
                    ) : null}
                    {issue.resolution ? (
                      <p className='text-sm text-muted-foreground'>
                        {t('delivery.issues.resolution')}: {issue.resolution}
                      </p>
                    ) : null}
                    <p className='text-xs text-muted-foreground'>
                      {t('delivery.issues.owner')}: {issue.ownerName || '—'} ·{' '}
                      {issue.createdByName} · {formatDate(issue.createdAt)}
                    </p>
                  </div>
                  {issue.canManage ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setEditing(issue)}
                    >
                      {t('delivery.issues.update')}
                    </Button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.issues.empty')}
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <IssueCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          state.reload();
        }}
      />

      <IssueEditDialog
        issue={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          state.reload();
        }}
      />
    </PageContainer>
  );
}

function IssueCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const errorMessage = useDeliveryErrorMessage();
  const projects = useResource(
    (client) => client.contracts({ pageSize: 100 }),
    'issue-projects',
  );
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const detail = useResource(
    (client) =>
      projectId ? client.contract(Number(projectId)) : Promise.resolve(null),
    projectId,
  );

  const taskOptions = [
    { value: '', label: t('delivery.issues.noTask') },
    ...(detail.data?.milestones ?? []).flatMap((milestone) =>
      milestone.tasks.map((task) => ({
        value: String(task.id),
        label: `${milestone.name} · ${task.name}`,
      })),
    ),
  ];

  const reset = (): void => {
    setProjectId('');
    setTaskId('');
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setError(undefined);
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await api.createIssue({
        projectId: Number(projectId),
        taskId: taskId ? Number(taskId) : undefined,
        title,
        description,
        severity,
      });
      reset();
      onCreated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('delivery.issues.create')}</DialogTitle>
          <DialogDescription>
            {t('delivery.issues.createHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label>{t('delivery.issues.project')}</Label>
            <SelectField
              label={t('delivery.issues.project')}
              className='w-full min-w-0'
              value={projectId}
              placeholder={t('delivery.issues.selectProject')}
              options={[
                { value: '', label: t('delivery.issues.selectProject') },
                ...(projects.data?.items ?? []).map((project) => ({
                  value: String(project.id),
                  label: `${project.contractNo} · ${project.title}`,
                })),
              ]}
              onValueChange={(value) => {
                setProjectId(value);
                setTaskId('');
              }}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('delivery.issues.task')}</Label>
            <SelectField
              label={t('delivery.issues.task')}
              className='w-full min-w-0'
              value={taskId}
              placeholder={t('delivery.issues.noTask')}
              options={taskOptions}
              onValueChange={setTaskId}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='issue-title'>{t('delivery.issues.name')}</Label>
            <Input
              id='issue-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='issue-description'>
              {t('delivery.issues.detail')}
            </Label>
            <Textarea
              id='issue-description'
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('delivery.issues.severity')}</Label>
            <SelectField
              label={t('delivery.issues.severity')}
              className='w-full min-w-0'
              value={severity}
              options={issueSeverityOptions(t)}
              onValueChange={setSeverity}
            />
          </div>
        </div>
        {error ? (
          <p className='text-sm text-destructive' role='alert'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={busy || !projectId || !title.trim()}
            onClick={() => void submit()}
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueEditDialog({
  issue,
  onClose,
  onSaved,
}: {
  readonly issue: DeliveryIssue | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const errorMessage = useDeliveryErrorMessage();
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('medium');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [key, setKey] = useState<number | undefined>();

  // Re-seed the form whenever a different issue is opened, without an effect.
  if (issue && key !== issue.id) {
    setKey(issue.id);
    setStatus(issue.status);
    setSeverity(issue.severity);
    setResolution(issue.resolution ?? '');
    setError(undefined);
  }

  const submit = async (): Promise<void> => {
    if (!issue) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.updateIssue(issue.id, { status, severity, resolution });
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(issue)}
      onOpenChange={(next) => (next ? undefined : onClose())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('delivery.issues.update')} · {issue?.title}
          </DialogTitle>
          <DialogDescription>
            {t('delivery.issues.updateHint')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label>{t('delivery.issues.status')}</Label>
            <SelectField
              label={t('delivery.issues.status')}
              className='w-full min-w-0'
              value={status}
              options={issueStatusOptions(t)}
              onValueChange={setStatus}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('delivery.issues.severity')}</Label>
            <SelectField
              label={t('delivery.issues.severity')}
              className='w-full min-w-0'
              value={severity}
              options={issueSeverityOptions(t)}
              onValueChange={setSeverity}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='issue-resolution'>
              {t('delivery.issues.resolution')}
            </Label>
            <Textarea
              id='issue-resolution'
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          </div>
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
          <Button disabled={busy} onClick={() => void submit()}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
