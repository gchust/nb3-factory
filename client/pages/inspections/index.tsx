import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import {
  createTask,
  getSessionContext,
  listEquipment,
  listPeople,
  listTasks,
  listTemplates,
  useAsync,
} from '@/components/inspection/api.js';
import { formatDateTime } from '@/components/inspection/format.js';
import { TaskStatusBadge } from '@/components/inspection/status-badge.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const tasks = useAsync('inspections', listTasks);
  const session = useAsync('session', getSessionContext);
  const isManager = isManagerRole(session.data?.roles);
  const [creating, setCreating] = useState(false);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={
          isManager ? t('inspections.titleManager') : t('inspections.title')
        }
        description={t('inspections.description')}
        actions={
          isManager ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className='size-4' />
              {t('inspections.create')}
            </Button>
          ) : undefined
        }
      />
      {tasks.loading ? (
        <Loading label={t('status.loading')} />
      ) : tasks.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('inspections.loadFailed')}
        </p>
      ) : (tasks.data ?? []).length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('inspections.empty')}
        </p>
      ) : (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inspections.code')}</TableHead>
                <TableHead>{t('inspections.equipment')}</TableHead>
                <TableHead>{t('inspections.template')}</TableHead>
                <TableHead>{t('inspections.assignee')}</TableHead>
                <TableHead>{t('inspections.plannedDate')}</TableHead>
                <TableHead>{t('inspections.progress')}</TableHead>
                <TableHead>{t('inspections.status')}</TableHead>
                <TableHead>{t('inspections.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tasks.data ?? []).map((task) => (
                <TableRow key={task.id}>
                  <TableCell className='font-medium'>{task.code}</TableCell>
                  <TableCell>
                    {task.equipmentCode} {task.equipmentName}
                  </TableCell>
                  <TableCell>{task.templateName ?? '-'}</TableCell>
                  <TableCell>{task.assigneeName ?? task.assigneeId}</TableCell>
                  <TableCell>
                    <span className='flex items-center gap-2'>
                      {formatDateTime(task.plannedDate)}
                      {task.overdue ? (
                        <Badge variant='destructive'>
                          {t('inspections.overdue')}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    {task.answeredCount}/{task.resultCount}
                    {task.abnormalCount > 0 ? (
                      <span className='ml-2 text-destructive'>
                        {t('inspections.abnormalCount', {
                          count: task.abnormalCount,
                        })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/inspections/${task.id}`}
                      className='text-sm font-medium text-primary hover:underline'
                    >
                      {task.status === 'submitted'
                        ? t('inspections.view')
                        : t('inspections.execute')}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creating ? (
        <TaskCreator
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            tasks.reload();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function TaskCreator(props: {
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const equipment = useAsync('equipment', listEquipment);
  const templates = useAsync('templates', listTemplates);
  const people = useAsync('people', listPeople);
  const [equipmentId, setEquipmentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Base UI's Select.Value resolves the trigger label from the `items` prop,
  // not from the rendered SelectItem children. Pass the options here so a
  // chosen device/template/person shows its name instead of the raw id.
  const equipmentItems = (equipment.data ?? []).map((item) => ({
    value: String(item.id),
    label: `${item.code} ${item.name}`,
  }));
  const templateItems = (templates.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.name,
  }));
  const assigneeItems = (people.data?.inspectors ?? []).map((person) => ({
    value: person.id,
    label: person.name,
  }));

  async function save(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await createTask(api, {
        equipmentId: Number(equipmentId),
        templateId: Number(templateId),
        assigneeId,
        plannedDate,
      });
      props.onSaved();
    } catch (cause) {
      setError(messageOf(cause, t('inspections.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      // A native <input type="date"> opens a browser-level calendar that Base UI
      // cannot recognize as part of the popup, so choosing a day registers as an
      // outside press and dismisses the dialog, discarding the whole form. Keep
      // pointer dismissal off here; Cancel and Escape still close the dialog.
      disablePointerDismissal
      onOpenChange={(open) => !open && props.onClose()}
    >
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('inspections.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label>{t('inspections.equipment')}</Label>
            <Select
              items={equipmentItems}
              value={equipmentId}
              onValueChange={(value) => setEquipmentId(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('inspections.selectEquipment')} />
              </SelectTrigger>
              <SelectContent>
                {(equipment.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.code} {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label>{t('inspections.template')}</Label>
            <Select
              items={templateItems}
              value={templateId}
              onValueChange={(value) => setTemplateId(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('inspections.selectTemplate')} />
              </SelectTrigger>
              <SelectContent>
                {(templates.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label>{t('inspections.assignee')}</Label>
            <Select
              items={assigneeItems}
              value={assigneeId}
              onValueChange={(value) => setAssigneeId(value ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('inspections.selectAssignee')} />
              </SelectTrigger>
              <SelectContent>
                {(people.data?.inspectors ?? []).map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label>{t('inspections.plannedDate')}</Label>
            <Input
              type='date'
              value={plannedDate}
              onChange={(event) => setPlannedDate(event.target.value)}
            />
          </div>
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={
              busy || !equipmentId || !templateId || !assigneeId || !plannedDate
            }
            onClick={() => void save()}
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isManagerRole(roles: readonly string[] | undefined): boolean {
  return Boolean(
    roles?.some(
      (role) => role === 'system-administrator' || role === 'equipment-manager',
    ),
  );
}

function messageOf(cause: unknown, fallback: string): string {
  const payload = cause as {
    payload?: { message?: unknown };
    message?: unknown;
  };
  if (typeof payload?.payload?.message === 'string') {
    return payload.payload.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}
