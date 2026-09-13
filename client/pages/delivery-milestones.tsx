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
  type Milestone,
  type MilestoneStatus,
} from '@/components/delivery/delivery-api';

const EMPTY_FORM = {
  projectId: '',
  name: '',
  plannedDate: '',
  actualDate: '',
  status: 'not_started' as MilestoneStatus,
};

export default function DeliveryMilestonesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const actor = useAsyncData(() => api.me(), [api]);
  const projects = useAsyncData(() => api.listProjects(), [api]);
  const [projectFilter, setProjectFilter] = useState('');
  const milestones = useAsyncData(
    () => api.listMilestones(projectFilter ? Number(projectFilter) : undefined),
    [api, projectFilter],
  );
  const canManage = actor.data ? actor.data.role !== 'member' : false;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  const projectOptions = (projects.data ?? []).map((project) => ({
    value: String(project.id),
    label: project.name,
  }));
  const statusOptions = [
    { value: 'not_started', label: t('delivery.status.milestone.not_started') },
    { value: 'in_progress', label: t('delivery.status.milestone.in_progress') },
    { value: 'completed', label: t('delivery.status.milestone.completed') },
  ];

  return (
    <section className='space-y-6 p-6'>
      <DeliveryHeader
        title={t('delivery.milestones.title')}
        description={t('delivery.milestones.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={milestones.reload}>
              <RefreshCw aria-hidden='true' />
              {t('delivery.actions.refresh')}
            </Button>
            {canManage ? (
              <Button
                size='sm'
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus aria-hidden='true' />
                {t('delivery.milestones.create')}
              </Button>
            ) : null}
          </>
        }
      />
      <div className='max-w-xs'>
        <FormSelect
          id='milestone-project-filter'
          label={t('delivery.fields.project')}
          value={projectFilter}
          onChange={setProjectFilter}
          emptyLabel={t('delivery.allProjects')}
          options={projectOptions}
        />
      </div>
      {milestones.loading ? <DeliveryLoading /> : null}
      {milestones.error ? (
        <DeliveryError error={milestones.error} onRetry={milestones.reload} />
      ) : null}
      {milestones.data ? (
        <Card>
          <CardContent>
            {milestones.data.length === 0 ? (
              <DeliveryEmpty>{t('delivery.milestones.empty')}</DeliveryEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.fields.name')}</TableHead>
                    <TableHead>{t('delivery.fields.project')}</TableHead>
                    <TableHead>{t('delivery.fields.plannedDate')}</TableHead>
                    <TableHead>{t('delivery.fields.actualDate')}</TableHead>
                    <TableHead>{t('delivery.fields.status')}</TableHead>
                    {canManage ? (
                      <TableHead>{t('delivery.fields.actions')}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.data.map((milestone) => (
                    <TableRow key={milestone.id}>
                      <TableCell className='font-medium'>
                        {milestone.name}
                      </TableCell>
                      <TableCell>{milestone.projectName ?? '—'}</TableCell>
                      <TableCell>{formatDate(milestone.plannedDate)}</TableCell>
                      <TableCell>{formatDate(milestone.actualDate)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          value={t(
                            `delivery.status.milestone.${milestone.status}`,
                          )}
                          tone={milestoneStatusTone(milestone.status)}
                        />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => {
                              setEditing(milestone);
                              setFormOpen(true);
                            }}
                          >
                            {t('delivery.actions.edit')}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
      {canManage ? (
        <MilestoneFormDialog
          key={editing?.id ?? 'create'}
          open={formOpen}
          milestone={editing}
          projectOptions={projectOptions}
          statusOptions={statusOptions}
          onOpenChange={setFormOpen}
          onSaved={() => {
            setFormOpen(false);
            milestones.reload();
          }}
        />
      ) : null}
    </section>
  );
}

function milestoneStatusTone(status: MilestoneStatus): string {
  switch (status) {
    case 'completed':
      return 'positive';
    case 'in_progress':
      return 'info';
    default:
      return 'neutral';
  }
}

function MilestoneFormDialog({
  open,
  milestone,
  projectOptions,
  statusOptions,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  milestone: Milestone | null;
  projectOptions: readonly { value: string; label: string }[];
  statusOptions: readonly { value: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const [form, setForm] = useState(() =>
    milestone
      ? {
          projectId: String(milestone.projectId),
          name: milestone.name,
          plannedDate: milestone.plannedDate?.slice(0, 10) ?? '',
          actualDate: milestone.actualDate?.slice(0, 10) ?? '',
          status: milestone.status,
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  // The dialog stays mounted while the project list loads, so the create form
  // cannot capture the first option in state at mount. Derive the effective
  // project from the loaded options instead; otherwise the native select shows
  // the first option while the submitted value stays empty and becomes 0.
  const projectId =
    form.projectId || (milestone ? '' : (projectOptions[0]?.value ?? ''));

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        projectId: Number(projectId),
        name: form.name,
        plannedDate: form.plannedDate || null,
        actualDate: form.actualDate || null,
        status: form.status,
      };
      if (milestone) {
        await api.updateMilestone(milestone.id, payload);
      } else {
        await api.createMilestone(payload);
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
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {milestone
              ? t('delivery.milestones.editTitle')
              : t('delivery.milestones.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FormSelect
            id='milestone-project'
            label={t('delivery.fields.project')}
            value={projectId}
            onChange={(value) =>
              setForm((current) => ({ ...current, projectId: value }))
            }
            options={projectOptions}
            required
          />
          <FormInput
            id='milestone-name'
            label={t('delivery.fields.name')}
            value={form.name}
            onChange={(value) =>
              setForm((current) => ({ ...current, name: value }))
            }
            required
          />
          <FormSelect
            id='milestone-status'
            label={t('delivery.fields.status')}
            value={form.status}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                status: value as MilestoneStatus,
              }))
            }
            options={statusOptions}
          />
          <FormInput
            id='milestone-planned'
            label={t('delivery.fields.plannedDate')}
            type='date'
            value={form.plannedDate}
            onChange={(value) =>
              setForm((current) => ({ ...current, plannedDate: value }))
            }
          />
          <FormInput
            id='milestone-actual'
            label={t('delivery.fields.actualDate')}
            type='date'
            value={form.actualDate}
            onChange={(value) =>
              setForm((current) => ({ ...current, actualDate: value }))
            }
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
