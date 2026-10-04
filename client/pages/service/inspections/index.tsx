import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClockIcon, PlayIcon, PlusIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToaster } from '@nocobase/app-client';

import { useServiceRequest } from '../api.js';
import type {
  DeviceRecord,
  EngineerLoad,
  InspectionRecord,
  Paged,
} from '../api.js';
import {
  AsyncBlock,
  formatDate,
  StatusBadge,
  useAsyncData,
} from '../shared.js';

const STATUSES = ['planned', 'in_progress', 'completed', 'overdue'] as const;
const RESULTS = ['normal', 'abnormal', 'needs_repair'] as const;

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<InspectionRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState(() => ({
    deviceId: '',
    plannedDate: new Date().toISOString().slice(0, 10),
    assigneeId: '',
    notes: '',
  }));
  const [resultForm, setResultForm] = useState({
    result: 'normal',
    notes: '',
    createTicket: false,
  });

  const state = useAsyncData<Paged<InspectionRecord>>(
    () =>
      request<Paged<InspectionRecord>>('/service/inspections', {
        query: { status: status || undefined, pageSize: 100 },
      }),
    [request, status],
  );
  const devices = useAsyncData<Paged<DeviceRecord>>(
    () =>
      request<Paged<DeviceRecord>>('/service/devices', {
        query: { pageSize: 200 },
      }),
    [request],
  );
  const engineers = useAsyncData<readonly EngineerLoad[]>(
    () => request<readonly EngineerLoad[]>('/service/engineers'),
    [request],
  );

  function fail(error: unknown): void {
    toaster.show({
      type: 'error',
      title: t('service.error.title'),
      description: error instanceof Error ? error.message : String(error),
    });
  }

  async function planDue(): Promise<void> {
    setPending(true);
    try {
      const result = await request<{ created: number; overdue: number }>(
        '/service/inspections/plan',
        { method: 'POST' },
      );
      toaster.show({
        type: 'success',
        title: t('service.inspections.planned', {
          created: result.created,
          overdue: result.overdue,
        }),
      });
      state.reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.deviceId) next.deviceId = t('service.validation.required');
    if (!form.plannedDate) next.plannedDate = t('service.validation.required');
    setFields(next);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      await request('/service/inspections', {
        method: 'POST',
        json: {
          deviceId: Number(form.deviceId),
          plannedDate: form.plannedDate,
          assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
          notes: form.notes || null,
        },
      });
      toaster.show({
        type: 'success',
        title: t('service.inspections.created'),
      });
      setCreating(false);
      state.reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  async function start(id: number): Promise<void> {
    try {
      await request(`/service/inspections/${id}/start`, { method: 'POST' });
      state.reload();
    } catch (error) {
      fail(error);
    }
  }

  async function complete(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!completing) return;
    setPending(true);
    try {
      await request(`/service/inspections/${completing.id}/complete`, {
        method: 'POST',
        json: {
          result: resultForm.result,
          notes: resultForm.notes || null,
          createTicket: resultForm.createTicket,
        },
      });
      toaster.show({
        type: 'success',
        title: t('service.inspections.completed'),
      });
      setCompleting(null);
      state.reload();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          <div className='flex gap-2'>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => void planDue()}
            >
              <CalendarClockIcon data-icon='inline-start' />
              {t('service.inspections.planDue')}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('service.inspections.create')}
            </Button>
          </div>
        }
      />

      <select
        aria-label={t('service.inspections.status')}
        className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm'
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value=''>{t('service.inspections.allStatuses')}</option>
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`service.status.inspection.${value}`)}
          </option>
        ))}
      </select>

      <AsyncBlock state={state} empty={(data) => data.items.length === 0}>
        {(data) => (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.inspections.device')}</TableHead>
                  <TableHead>{t('service.inspections.plannedDate')}</TableHead>
                  <TableHead>{t('service.inspections.status')}</TableHead>
                  <TableHead>{t('service.inspections.assignee')}</TableHead>
                  <TableHead>{t('service.inspections.result')}</TableHead>
                  <TableHead className='text-right'>
                    {t('service.inspections.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell>
                      <div className='font-mono text-xs'>
                        {inspection.deviceNo ?? '—'}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {inspection.deviceModel ?? ''}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(inspection.plannedDate)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        kind='inspection'
                        status={inspection.status}
                      />
                    </TableCell>
                    <TableCell>{inspection.assigneeName ?? '—'}</TableCell>
                    <TableCell>
                      {inspection.result
                        ? t(`service.inspectionResult.${inspection.result}`, {
                            defaultValue: inspection.result,
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className='text-right'>
                      {inspection.status === 'planned' ||
                      inspection.status === 'overdue' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => void start(inspection.id)}
                        >
                          <PlayIcon data-icon='inline-start' />
                          {t('service.actions.start')}
                        </Button>
                      ) : null}
                      {inspection.status === 'in_progress' ? (
                        <Button
                          size='sm'
                          onClick={() => setCompleting(inspection)}
                        >
                          {t('service.actions.complete')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AsyncBlock>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-lg'>
          <form
            onSubmit={(event) => {
              void create(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('service.inspections.create')}</DialogTitle>
              <DialogDescription>
                {t('service.inspections.createHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={Boolean(fields.deviceId)}>
                <FieldLabel>{t('service.inspections.device')}</FieldLabel>
                <select
                  aria-invalid={Boolean(fields.deviceId)}
                  className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                  value={form.deviceId}
                  onChange={(event) =>
                    setForm({ ...form, deviceId: event.target.value })
                  }
                >
                  <option value=''>
                    {t('service.inspections.selectDevice')}
                  </option>
                  {(devices.data?.items ?? []).map((device) => (
                    <option key={device.id} value={String(device.id)}>
                      {device.deviceNo} · {device.model}
                    </option>
                  ))}
                </select>
                {fields.deviceId ? (
                  <FieldError>{fields.deviceId}</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={Boolean(fields.plannedDate)}>
                <FieldLabel>{t('service.inspections.plannedDate')}</FieldLabel>
                <Input
                  type='date'
                  aria-invalid={Boolean(fields.plannedDate)}
                  value={form.plannedDate}
                  onChange={(event) =>
                    setForm({ ...form, plannedDate: event.target.value })
                  }
                />
                {fields.plannedDate ? (
                  <FieldError>{fields.plannedDate}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>{t('service.inspections.assignee')}</FieldLabel>
                <select
                  className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                  value={form.assigneeId}
                  onChange={(event) =>
                    setForm({ ...form, assigneeId: event.target.value })
                  }
                >
                  <option value=''>
                    {t('service.inspections.unassigned')}
                  </option>
                  {engineers.data?.map((engineer) => (
                    <option key={engineer.id} value={engineer.id}>
                      {engineer.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel>{t('service.inspections.notes')}</FieldLabel>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {t('service.actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={completing !== null}
        onOpenChange={(open) => {
          if (!open) setCompleting(null);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <form
            onSubmit={(event) => {
              void complete(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('service.actions.complete')}</DialogTitle>
              <DialogDescription>
                {t('service.inspections.completeHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel>{t('service.inspections.result')}</FieldLabel>
                <select
                  className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                  value={resultForm.result}
                  onChange={(event) =>
                    setResultForm({ ...resultForm, result: event.target.value })
                  }
                >
                  {RESULTS.map((value) => (
                    <option key={value} value={value}>
                      {t(`service.inspectionResult.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel>{t('service.inspections.notes')}</FieldLabel>
                <Textarea
                  rows={3}
                  value={resultForm.notes}
                  onChange={(event) =>
                    setResultForm({ ...resultForm, notes: event.target.value })
                  }
                />
              </Field>
              <Field orientation='horizontal'>
                <input
                  id='inspection-create-ticket'
                  type='checkbox'
                  className='size-4'
                  checked={resultForm.createTicket}
                  onChange={(event) =>
                    setResultForm({
                      ...resultForm,
                      createTicket: event.target.checked,
                    })
                  }
                />
                <FieldLabel htmlFor='inspection-create-ticket'>
                  {t('service.inspections.createTicket')}
                </FieldLabel>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCompleting(null)}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {t('service.actions.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
