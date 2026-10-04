import { useTranslation } from '@nocobase/i18n/client';
import { Link, Outlet, useLocation } from 'react-router';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

import {
  useServiceRequest,
  type CustomerRecord,
  type DeviceRecord,
  type Paged,
  type TicketRecord,
} from '../api.js';
import {
  AsyncBlock,
  formatDateTime,
  PriorityBadge,
  StatusBadge,
  useAsyncData,
} from '../shared.js';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = [
  'pending',
  'accepted',
  'processing',
  'pending_confirm',
  'closed',
  'returned',
] as const;

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'normal',
    customerId: '',
    deviceId: '',
    confidential: false,
  });

  const state = useAsyncData<Paged<TicketRecord>>(
    () =>
      request<Paged<TicketRecord>>('/service/tickets', {
        query: {
          search,
          status: status || undefined,
          priority: priority || undefined,
          pageSize: 100,
        },
      }),
    [request, search, status, priority],
  );
  const customers = useAsyncData<Paged<CustomerRecord>>(
    () =>
      request<Paged<CustomerRecord>>('/service/customers', {
        query: { pageSize: 200 },
      }),
    [request],
  );
  const devices = useAsyncData<Paged<DeviceRecord>>(
    () =>
      request<Paged<DeviceRecord>>('/service/devices', {
        query: { pageSize: 200 },
      }),
    [request],
  );

  function openCreate(): void {
    setForm({
      title: '',
      description: '',
      priority: 'normal',
      customerId: '',
      deviceId: '',
      confidential: false,
    });
    setFields({});
    setCreating(true);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = t('service.validation.required');
    if (!form.deviceId) next.deviceId = t('service.validation.required');
    setFields(next);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      await request('/service/tickets', {
        method: 'POST',
        json: {
          title: form.title.trim(),
          description: form.description || null,
          priority: form.priority,
          customerId: form.customerId ? Number(form.customerId) : null,
          deviceId: Number(form.deviceId),
          confidential: form.confidential,
        },
      });
      toaster.show({ type: 'success', title: t('service.tickets.created') });
      setCreating(false);
      state.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.error.title'),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  const visibleDevices = (devices.data?.items ?? []).filter(
    (device) =>
      !form.customerId || String(device.customerId) === form.customerId,
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.tickets.title')}
        description={t('service.tickets.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('service.tickets.create')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative w-full max-w-sm'>
          <SearchIcon className='pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground' />
          <Input
            className='pl-8'
            placeholder={t('service.tickets.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label={t('service.tickets.status')}
          className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm'
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value=''>{t('service.tickets.allStatuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`service.status.ticket.${value}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('service.tickets.priority')}
          className='h-8 rounded-lg border border-input bg-transparent px-2 text-sm'
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value=''>{t('service.tickets.allPriorities')}</option>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {t(`service.priority.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <AsyncBlock state={state} empty={(data) => data.items.length === 0}>
        {(data) => (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.tickets.ticketNo')}</TableHead>
                  <TableHead>{t('service.tickets.titleField')}</TableHead>
                  <TableHead>{t('service.tickets.customer')}</TableHead>
                  <TableHead>{t('service.tickets.status')}</TableHead>
                  <TableHead>{t('service.tickets.priority')}</TableHead>
                  <TableHead>{t('service.tickets.assignee')}</TableHead>
                  <TableHead>{t('service.tickets.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className='font-mono text-xs'>
                      <Link
                        className='hover:underline'
                        to={{
                          pathname: String(ticket.id),
                          search: location.search,
                        }}
                      >
                        {ticket.ticketNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <span className='font-medium'>{ticket.title}</span>
                        {ticket.confidential ? (
                          <Badge variant='destructive'>
                            {t('service.tickets.confidential')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{ticket.customerName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={ticket.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={ticket.priority} />
                    </TableCell>
                    <TableCell>{ticket.assigneeName ?? '—'}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {formatDateTime(ticket.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AsyncBlock>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('service.tickets.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('service.tickets.formHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={Boolean(fields.title)}>
                <FieldLabel>{t('service.tickets.titleField')}</FieldLabel>
                <Input
                  aria-invalid={Boolean(fields.title)}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
                {fields.title ? <FieldError>{fields.title}</FieldError> : null}
              </Field>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel>{t('service.tickets.customer')}</FieldLabel>
                  <select
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.customerId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        customerId: event.target.value,
                        deviceId: '',
                      })
                    }
                  >
                    <option value=''>{t('service.tickets.noCustomer')}</option>
                    {(customers.data?.items ?? []).map((customer) => (
                      <option key={customer.id} value={String(customer.id)}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field data-invalid={Boolean(fields.deviceId)}>
                  <FieldLabel>{t('service.tickets.device')}</FieldLabel>
                  <select
                    aria-invalid={Boolean(fields.deviceId)}
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.deviceId}
                    onChange={(event) =>
                      setForm({ ...form, deviceId: event.target.value })
                    }
                  >
                    <option value=''>
                      {t('service.tickets.selectDevice')}
                    </option>
                    {visibleDevices.map((device) => (
                      <option key={device.id} value={String(device.id)}>
                        {device.deviceNo} · {device.model}
                      </option>
                    ))}
                  </select>
                  {fields.deviceId ? (
                    <FieldError>{fields.deviceId}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel>{t('service.tickets.priority')}</FieldLabel>
                  <select
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value })
                    }
                  >
                    {PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {t(`service.priority.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field orientation='horizontal'>
                  <Checkbox
                    checked={form.confidential}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, confidential: checked === true })
                    }
                  />
                  <FieldLabel>{t('service.tickets.confidential')}</FieldLabel>
                </Field>
              </div>
              <Field>
                <FieldLabel>{t('service.tickets.descriptionField')}</FieldLabel>
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={pending}
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

      <Outlet />
    </PageContainer>
  );
}
