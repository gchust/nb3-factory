import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  EmptyState,
  EnumBadge,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  PageSection,
  Panel,
} from '@/components/recruiting/ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import {
  createRequisition,
  deleteRequisition,
  listRequisitions,
  updateRequisition,
  type Requisition,
} from '@/lib/recruiting-api';
import { errorText, useAsyncData } from '@/lib/recruiting-hooks';

const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES = ['open', 'paused', 'completed'];

interface FormState {
  title: string;
  department: string;
  headcount: string;
  requirements: string;
  expectedArrivalDate: string;
  priority: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  department: '',
  headcount: '1',
  requirements: '',
  expectedArrivalDate: '',
  priority: 'medium',
  status: 'open',
};

export default function RequisitionsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Requisition | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const requisitions = useAsyncData(
    () =>
      listRequisitions(client, {
        ...(statusFilter === 'all' ? {} : { status: statusFilter }),
      }),
    [statusFilter],
  );

  function openCreate(): void {
    setForm(EMPTY_FORM);
    setNotice('');
    setEditing('new');
  }

  function openEdit(requisition: Requisition): void {
    setForm({
      title: requisition.title,
      department: requisition.department,
      headcount: String(requisition.headcount),
      requirements: requisition.requirements ?? '',
      expectedArrivalDate: requisition.expectedArrivalDate
        ? requisition.expectedArrivalDate.slice(0, 10)
        : '',
      priority: requisition.priority,
      status: requisition.status,
    });
    setNotice('');
    setEditing(requisition);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setNotice('');
    const payload = {
      title: form.title,
      department: form.department,
      headcount: Number(form.headcount),
      requirements: form.requirements || null,
      expectedArrivalDate: form.expectedArrivalDate || null,
      priority: form.priority,
      status: form.status,
    };
    try {
      if (editing === 'new') {
        await createRequisition(client, payload);
      } else if (editing) {
        await updateRequisition(client, editing.id, payload);
      }
      setEditing(null);
      setNotice(t('recruiting.requisitions.saved'));
      requisitions.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    } finally {
      setBusy(false);
    }
  }

  async function remove(requisition: Requisition): Promise<void> {
    if (!window.confirm(t('recruiting.requisitions.confirmDelete'))) return;
    setNotice('');
    try {
      await deleteRequisition(client, requisition.id);
      setNotice(t('recruiting.requisitions.deleted'));
      requisitions.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    }
  }

  return (
    <PageSection>
      <PageHeader
        title={t('recruiting.requisitions.title')}
        description={t('recruiting.requisitions.description')}
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            {t('recruiting.requisitions.new')}
          </Button>
        }
      />

      <div className='flex items-center gap-3'>
        <label
          className='text-sm text-muted-foreground'
          htmlFor='requisition-status-filter'
        >
          {t('recruiting.filters.status')}
        </label>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value ?? '')}
        >
          <SelectTrigger
            id='requisition-status-filter'
            className='w-44'
            aria-label={t('recruiting.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('recruiting.filters.all')}</SelectItem>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`recruiting.enums.requisitionStatus.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {notice ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {notice}
        </p>
      ) : null}

      <Panel>
        {requisitions.status === 'loading' ? (
          <LoadingState label={t('recruiting.state.loading')} />
        ) : null}
        {requisitions.status === 'error' ? (
          <ErrorState
            message={requisitions.message ?? t('recruiting.state.error')}
            onRetry={requisitions.reload}
          />
        ) : null}
        {requisitions.status === 'ready' &&
        (requisitions.data?.length ?? 0) === 0 ? (
          <EmptyState label={t('recruiting.requisitions.empty')} />
        ) : null}
        {requisitions.status === 'ready' &&
        (requisitions.data?.length ?? 0) > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recruiting.fields.title')}</TableHead>
                <TableHead>{t('recruiting.fields.department')}</TableHead>
                <TableHead>{t('recruiting.fields.headcount')}</TableHead>
                <TableHead>{t('recruiting.fields.priority')}</TableHead>
                <TableHead>{t('recruiting.fields.status')}</TableHead>
                <TableHead>
                  {t('recruiting.fields.expectedArrivalDate')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('recruiting.fields.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requisitions.data?.map((requisition) => (
                <TableRow key={requisition.id}>
                  <TableCell className='font-medium'>
                    {requisition.title}
                  </TableCell>
                  <TableCell>{requisition.department}</TableCell>
                  <TableCell className='tabular-nums'>
                    {requisition.headcount}
                  </TableCell>
                  <TableCell>
                    <EnumBadge kind='priority' value={requisition.priority} />
                  </TableCell>
                  <TableCell>
                    <EnumBadge
                      kind='requisitionStatus'
                      value={requisition.status}
                    />
                  </TableCell>
                  <TableCell>
                    {requisition.expectedArrivalDate
                      ? String(requisition.expectedArrivalDate).slice(0, 10)
                      : '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => openEdit(requisition)}
                      >
                        {t('recruiting.actions.edit')}
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => void remove(requisition)}
                      >
                        {t('recruiting.actions.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Panel>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new'
                ? t('recruiting.requisitions.new')
                : t('recruiting.requisitions.edit')}
            </DialogTitle>
          </DialogHeader>
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field label={t('recruiting.fields.title')}>
              <Input
                value={form.title}
                required
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.department')}>
              <Input
                value={form.department}
                required
                onChange={(event) =>
                  setForm({ ...form, department: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.headcount')}>
              <Input
                type='number'
                min={1}
                value={form.headcount}
                required
                onChange={(event) =>
                  setForm({ ...form, headcount: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.expectedArrivalDate')}>
              <Input
                type='date'
                value={form.expectedArrivalDate}
                onChange={(event) =>
                  setForm({ ...form, expectedArrivalDate: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.priority')}>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm({ ...form, priority: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.priority')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {t(`recruiting.enums.priority.${priority}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.status')}>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm({ ...form, status: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`recruiting.enums.requisitionStatus.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.requirements')}>
              <Textarea
                value={form.requirements}
                rows={3}
                onChange={(event) =>
                  setForm({ ...form, requirements: event.target.value })
                }
              />
            </Field>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditing(null)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {busy ? t('recruiting.state.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
