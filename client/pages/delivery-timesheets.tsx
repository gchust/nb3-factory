import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw } from 'lucide-react';
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
  FormTextarea,
  DeliveryEmpty,
  DeliveryError,
  DeliveryHeader,
  DeliveryLoading,
} from '@/components/delivery/ui';
import { formatDate } from '@/components/delivery/format';
import { useAsyncData } from '@/components/delivery/use-async-data';
import { useDeliveryApi } from '@/components/delivery/delivery-api';

export default function DeliveryTimesheetsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const actor = useAsyncData(() => api.me(), [api]);
  const projects = useAsyncData(() => api.listProjects(), [api]);
  const tasks = useAsyncData(() => api.listTasks(), [api]);
  const members = useAsyncData(() => api.members(), [api]);
  const [projectFilter, setProjectFilter] = useState('');
  const timesheets = useAsyncData(
    () =>
      api.listTimesheets(
        projectFilter ? { projectId: Number(projectFilter) } : {},
      ),
    [api, projectFilter],
  );
  const [formOpen, setFormOpen] = useState(false);
  const canManage = actor.data ? actor.data.role !== 'member' : false;

  const projectOptions = (projects.data ?? []).map((project) => ({
    value: String(project.id),
    label: project.name,
  }));
  const memberOptions = (members.data ?? []).map((member) => ({
    value: member.id,
    label: member.name || member.id,
  }));

  return (
    <section className='space-y-6 p-6'>
      <DeliveryHeader
        title={t('delivery.timesheets.title')}
        description={t('delivery.timesheets.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={timesheets.reload}>
              <RefreshCw aria-hidden='true' />
              {t('delivery.actions.refresh')}
            </Button>
            <Button
              size='sm'
              disabled={!actor.data}
              onClick={() => setFormOpen(true)}
            >
              <Plus aria-hidden='true' />
              {t('delivery.timesheets.create')}
            </Button>
          </>
        }
      />
      {!canManage && actor.data ? (
        <p className='text-sm text-muted-foreground'>
          {t('delivery.timesheets.ownOnly')}
        </p>
      ) : null}
      <div className='max-w-xs'>
        <FormSelect
          id='timesheet-project-filter'
          label={t('delivery.fields.project')}
          value={projectFilter}
          onChange={setProjectFilter}
          emptyLabel={t('delivery.allProjects')}
          options={projectOptions}
        />
      </div>
      {timesheets.loading ? <DeliveryLoading /> : null}
      {timesheets.error ? (
        <DeliveryError error={timesheets.error} onRetry={timesheets.reload} />
      ) : null}
      {timesheets.data ? (
        <Card>
          <CardContent>
            {timesheets.data.length === 0 ? (
              <DeliveryEmpty>{t('delivery.timesheets.empty')}</DeliveryEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.fields.workDate')}</TableHead>
                    <TableHead>{t('delivery.fields.member')}</TableHead>
                    <TableHead>{t('delivery.fields.project')}</TableHead>
                    <TableHead>{t('delivery.fields.task')}</TableHead>
                    <TableHead>{t('delivery.fields.hours')}</TableHead>
                    <TableHead>{t('delivery.fields.workContent')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.data.map((timesheet) => (
                    <TableRow key={timesheet.id}>
                      <TableCell>{formatDate(timesheet.workDate)}</TableCell>
                      <TableCell>{timesheet.userName ?? '—'}</TableCell>
                      <TableCell>{timesheet.projectName ?? '—'}</TableCell>
                      <TableCell className='font-medium'>
                        {timesheet.taskName ?? '—'}
                      </TableCell>
                      <TableCell>{timesheet.hours}</TableCell>
                      <TableCell className='max-w-md whitespace-normal'>
                        {timesheet.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
      {actor.data ? (
        <TimesheetFormDialog
          open={formOpen}
          canManage={canManage}
          actorId={actor.data.userId}
          tasks={tasks.data ?? []}
          projectOptions={projectOptions}
          memberOptions={memberOptions}
          onOpenChange={setFormOpen}
          onSaved={() => {
            setFormOpen(false);
            timesheets.reload();
          }}
        />
      ) : null}
    </section>
  );
}

function TimesheetFormDialog({
  open,
  canManage,
  actorId,
  tasks,
  projectOptions,
  memberOptions,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  canManage: boolean;
  actorId: string;
  tasks: readonly {
    id: number;
    name: string;
    projectId: number;
    projectName: string | null;
  }[];
  projectOptions: readonly { value: string; label: string }[];
  memberOptions: readonly { value: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const [form, setForm] = useState(() => ({
    taskId: '',
    userId: canManage ? actorId : '',
    workDate: new Date().toISOString().slice(0, 10),
    hours: '2',
    description: '',
  }));
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  const taskOptions = tasks.map((task) => ({
    value: String(task.id),
    label: `${task.projectName ?? projectOptionsLabel(projectOptions, task.projectId)} · ${task.name}`,
  }));

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      await api.createTimesheet({
        taskId: Number(form.taskId),
        userId: form.userId || undefined,
        workDate: form.workDate,
        hours: Number(form.hours),
        description: form.description,
      });
      onSaved();
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('delivery.timesheets.createTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className='sm:col-span-2'>
            <FormSelect
              id='timesheet-task'
              label={t('delivery.fields.task')}
              value={form.taskId}
              onChange={(value) =>
                setForm((current) => ({ ...current, taskId: value }))
              }
              emptyLabel={t('delivery.none')}
              options={taskOptions}
              required
            />
          </div>
          {canManage ? (
            <FormSelect
              id='timesheet-member'
              label={t('delivery.fields.member')}
              value={form.userId}
              onChange={(value) =>
                setForm((current) => ({ ...current, userId: value }))
              }
              options={memberOptions}
            />
          ) : null}
          <FormInput
            id='timesheet-date'
            label={t('delivery.fields.workDate')}
            type='date'
            value={form.workDate}
            onChange={(value) =>
              setForm((current) => ({ ...current, workDate: value }))
            }
            required
          />
          <FormInput
            id='timesheet-hours'
            label={t('delivery.fields.hours')}
            type='number'
            min='0.5'
            max='24'
            step='0.5'
            value={form.hours}
            onChange={(value) =>
              setForm((current) => ({ ...current, hours: value }))
            }
            required
          />
          <div className='sm:col-span-2'>
            <FormTextarea
              id='timesheet-description'
              label={t('delivery.fields.workContent')}
              value={form.description}
              onChange={(value) =>
                setForm((current) => ({ ...current, description: value }))
              }
              required
            />
          </div>
          <p className='text-xs text-muted-foreground sm:col-span-2'>
            {t('delivery.timesheets.rules')}
          </p>
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

function projectOptionsLabel(
  options: readonly { value: string; label: string }[],
  projectId: number,
): string {
  return (
    options.find((option) => option.value === String(projectId))?.label ?? ''
  );
}
