import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { Link } from 'react-router';

import { DeliveryQueryState } from '@/components/delivery/query-state';
import { DeliveryStatusBadge } from '@/components/delivery/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { deliveryApi } from '@/lib/delivery';
import { useDeliveryAction, useDeliveryQuery } from '@/lib/use-delivery-query';

export default function ProjectsPage(): ReactElement {
  const { t } = useTranslation();
  const query = useDeliveryQuery('projects', (api) =>
    deliveryApi.projects(api),
  );
  const me = useDeliveryQuery('me', (api) => deliveryApi.me(api));
  const users = useDeliveryQuery('users', (api) => deliveryApi.users(api));
  const [open, setOpen] = useState(false);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          me.data?.isAdmin ? (
            <Button onClick={() => setOpen(true)}>
              <Plus />
              {t('delivery.projects.create')}
            </Button>
          ) : undefined
        }
        title={t('delivery.projects.title')}
        description={t('delivery.projects.description')}
      />
      <DeliveryQueryState
        error={query.error}
        loading={query.loading}
        onRetry={query.reload}
      >
        {query.data ? (
          query.data.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('delivery.field.code')}</TableHead>
                  <TableHead>{t('delivery.field.name')}</TableHead>
                  <TableHead>{t('delivery.field.manager')}</TableHead>
                  <TableHead>{t('delivery.field.dates')}</TableHead>
                  <TableHead>{t('delivery.field.status')}</TableHead>
                  <TableHead>{t('delivery.field.milestones')}</TableHead>
                  <TableHead>{t('delivery.field.openTasks')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className='font-mono text-xs'>
                      {project.code}
                    </TableCell>
                    <TableCell>
                      <Link
                        className='text-primary underline-offset-4 hover:underline'
                        to={`/projects/${project.id}`}
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>{project.managerName ?? '-'}</TableCell>
                    <TableCell className='text-xs text-muted-foreground'>
                      {project.startDate ?? '-'} ~ {project.endDate ?? '-'}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatusBadge
                        kind='project'
                        value={project.status}
                      />
                    </TableCell>
                    <TableCell>
                      {project.doneMilestoneCount}/{project.milestoneCount}
                    </TableCell>
                    <TableCell>{project.openTaskCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('delivery.projects.empty')}
            </p>
          )
        ) : null}
      </DeliveryQueryState>

      <CreateProjectDialog
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          query.reload();
        }}
        open={open}
        users={users.data ?? []}
      />
    </PageContainer>
  );
}

interface CreateProjectDialogProps {
  readonly open: boolean;
  readonly users: readonly { id: string; name: string }[];
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

function CreateProjectDialog({
  open,
  users,
  onClose,
  onCreated,
}: CreateProjectDialogProps): ReactElement {
  const { t } = useTranslation();
  const action = useDeliveryAction();
  const [form, setForm] = useState({
    code: '',
    name: '',
    managerId: '',
    startDate: '',
    endDate: '',
    status: 'active',
    description: '',
  });

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await action.run((api) =>
      deliveryApi.createProject(api, { ...form }),
    );
    if (ok) {
      setForm({
        code: '',
        name: '',
        managerId: '',
        startDate: '',
        endDate: '',
        status: 'active',
        description: '',
      });
      onCreated();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <form className='space-y-4' onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('delivery.projects.create')}</DialogTitle>
            <DialogDescription>
              {t('delivery.projects.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='project-code'>{t('delivery.field.code')}</Label>
              <Input
                id='project-code'
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
                required
                value={form.code}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='project-name'>{t('delivery.field.name')}</Label>
              <Input
                id='project-name'
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
                value={form.name}
              />
            </div>
            <div className='col-span-full space-y-1.5'>
              <Label htmlFor='project-manager'>
                {t('delivery.field.manager')}
              </Label>
              <NativeSelect
                id='project-manager'
                onChange={(event) =>
                  setForm({ ...form, managerId: event.target.value })
                }
                required
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
            <div className='space-y-1.5'>
              <Label htmlFor='project-start'>
                {t('delivery.field.startDate')}
              </Label>
              <Input
                id='project-start'
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
                type='date'
                value={form.startDate}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='project-end'>{t('delivery.field.endDate')}</Label>
              <Input
                id='project-end'
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
                type='date'
                value={form.endDate}
              />
            </div>
            <div className='col-span-full space-y-1.5'>
              <Label htmlFor='project-status'>
                {t('delivery.field.status')}
              </Label>
              <NativeSelect
                id='project-status'
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
            <div className='col-span-full space-y-1.5'>
              <Label htmlFor='project-description'>
                {t('delivery.field.description')}
              </Label>
              <Textarea
                id='project-description'
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                value={form.description}
              />
            </div>
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
