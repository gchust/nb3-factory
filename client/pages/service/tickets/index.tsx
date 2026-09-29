import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useNavigate, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import {
  createTicket,
  fetchCustomers,
  fetchDevices,
  fetchEngineers,
  fetchTickets,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Customer,
  type Device,
  type Engineer,
  type Ticket,
  type TicketListResult,
  type TicketPriority,
} from '../api.js';
import { formatDate } from '../format.js';
import {
  LoadingBlock,
  PriorityBadge,
  QueryError,
  StatusBadge,
} from '../shared.js';

type Column = ColumnDef<Ticket>;

/**
 * The ticket worklist: search and filter, then open a ticket for the full
 * lifecycle. The list endpoint already restricts what the signed-in role may
 * see, so this page never filters for security.
 */
export default function TicketListPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const [reloadCount, setReloadCount] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    key: string;
    value?: TicketListResult;
    error?: unknown;
  }>();
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);

  const requestKey = `${appliedKeyword}:${status}:${priority}:${page}:${reloadCount}`;

  useEffect(() => {
    const controller = new AbortController();
    const key = `${appliedKeyword}:${status}:${priority}:${page}:${reloadCount}`;
    fetchTickets(api, {
      ...(appliedKeyword ? { keyword: appliedKeyword } : {}),
      ...(status === 'all' ? {} : { status }),
      ...(priority === 'all' ? {} : { priority }),
      page,
      pageSize: 20,
    }).then(
      (value) => {
        if (!controller.signal.aborted) setResult({ key, value });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, appliedKeyword, status, priority, page, reloadCount]);

  // Reference data for the create form only; a failure there must not break the list.
  useEffect(() => {
    if (!createOpen) return;
    let active = true;
    void Promise.all([
      fetchCustomers(api),
      fetchDevices(api),
      fetchEngineers(api),
    ]).then(
      ([customerList, deviceList, engineerList]) => {
        if (!active) return;
        setCustomers(customerList);
        setDevices(deviceList);
        setEngineers(engineerList);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, createOpen]);

  const loading = result?.key !== requestKey;
  const data = result?.value;

  // Base UI's `Select.Value` shows the selected item's label only when the
  // options are also declared through `items`; without them the trigger falls
  // back to the raw value and an untranslated "all" or a numeric id leaks into
  // the Chinese interface.
  const statusItems = [
    { value: 'all', label: t('service.tickets.allStatuses') },
    ...TICKET_STATUSES.map((value) => ({
      value,
      label: t(`service.ticketStatus.${value}`),
    })),
  ];
  const priorityItems = [
    { value: 'all', label: t('service.tickets.allPriorities') },
    ...TICKET_PRIORITIES.map((value) => ({
      value,
      label: t(`service.priority.${value}`),
    })),
  ];

  const columns = useMemo<Column[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('service.tickets.column.code'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: t('service.tickets.column.title'),
        cell: ({ row }) => (
          <div className='max-w-[22rem]'>
            <p className='truncate font-medium'>{row.original.title}</p>
            <p className='truncate text-xs text-muted-foreground'>
              {row.original.customerName ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'device',
        header: t('service.tickets.column.device'),
        cell: ({ row }) => (
          <span className='text-sm text-muted-foreground'>
            {row.original.deviceCode ?? t('service.common.none')}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('service.tickets.column.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'priority',
        header: t('service.tickets.column.priority'),
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'assignee',
        header: t('service.tickets.column.assignee'),
        cell: ({ row }) => (
          <span className='text-sm'>
            {row.original.assigneeName ?? t('service.common.unassigned')}
          </span>
        ),
      },
      {
        id: 'dueAt',
        header: t('service.tickets.column.dueAt'),
        cell: ({ row }) => (
          <span className='text-sm'>{formatDate(row.original.dueAt)}</span>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.tickets.title')}
        description={t('service.tickets.description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t('service.tickets.create')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <form
          className='flex flex-1 items-center gap-2'
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedKeyword(keyword.trim());
          }}
        >
          <div className='relative w-full max-w-xs'>
            <SearchIcon className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
            <Input
              className='pl-8'
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('service.tickets.searchPlaceholder')}
            />
          </div>
          <Button type='submit' variant='outline'>
            {t('service.actions.search')}
          </Button>
        </form>
        <Select
          items={statusItems}
          value={status}
          onValueChange={(value: string | null) => {
            setPage(1);
            setStatus(value ?? 'all');
          }}
        >
          <SelectTrigger className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('service.tickets.allStatuses')}
            </SelectItem>
            {TICKET_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`service.ticketStatus.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={priorityItems}
          value={priority}
          onValueChange={(value: string | null) => {
            setPage(1);
            setPriority(value ?? 'all');
          }}
        >
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('service.tickets.allPriorities')}
            </SelectItem>
            {TICKET_PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`service.priority.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result?.error ? (
        <QueryError
          error={result.error}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      ) : loading && !data ? (
        <LoadingBlock />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            getRowId={(row) => String(row.id)}
            emptyMessage={t('service.tickets.empty')}
            onRowClick={(row) => {
              void navigate(String(row.original.id));
            }}
          />
          {data && data.total > data.pageSize ? (
            <div className='flex items-center justify-between text-sm text-muted-foreground'>
              <span>{t('service.tickets.total', { total: data.total })}</span>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  {t('service.actions.previous')}
                </Button>
                <span>{t('service.tickets.page', { page: data.page })}</span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t('service.actions.next')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        customers={customers}
        devices={devices}
        engineers={engineers}
        onCreated={(ticket) => {
          setCreateOpen(false);
          setReloadCount((count) => count + 1);
          void navigate(String(ticket.id));
        }}
      />
      <Outlet />
    </PageContainer>
  );
}

interface CreateTicketDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly customers: Customer[];
  readonly devices: Device[];
  readonly engineers: Engineer[];
  readonly onCreated: (ticket: Ticket) => void;
}

function CreateTicketDialog({
  open,
  onOpenChange,
  customers,
  devices,
  engineers,
  onCreated,
}: CreateTicketDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    title: '',
    description: '',
    customerId: '',
    deviceId: '',
    priority: 'normal' as TicketPriority,
    confidential: false,
    assigneeId: '',
  });

  const availableDevices = devices.filter(
    (device) => String(device.customerId) === form.customerId,
  );

  const customerItems = customers.map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));
  const deviceItems = availableDevices.map((device) => ({
    value: String(device.id),
    label: `${device.code} · ${device.name}`,
  }));
  const priorityItems = TICKET_PRIORITIES.map((value) => ({
    value,
    label: t(`service.priority.${value}`),
  }));
  const assigneeItems = [
    { value: null, label: t('service.common.unassigned') },
    ...engineers.map((engineer) => ({
      value: engineer.id,
      label: engineer.name,
    })),
  ];

  async function submit(): Promise<void> {
    setError(undefined);
    if (!form.title.trim()) {
      setError(t('service.tickets.form.titleRequired'));
      return;
    }
    if (!form.customerId) {
      setError(t('service.tickets.form.customerRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await createTicket(api, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        customerId: Number(form.customerId),
        deviceId: form.deviceId ? Number(form.deviceId) : null,
        priority: form.priority,
        confidential: form.confidential,
        assigneeId: form.assigneeId || null,
      });
      toaster.show({
        type: 'success',
        title: t('service.tickets.form.created', { code: ticket.code }),
      });
      setForm({
        title: '',
        description: '',
        customerId: '',
        deviceId: '',
        priority: 'normal',
        confidential: false,
        assigneeId: '',
      });
      onCreated(ticket);
    } catch {
      setError(t('service.tickets.form.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('service.tickets.create')}</DialogTitle>
          <DialogDescription>
            {t('service.tickets.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='ticket-title'>
              {t('service.tickets.column.title')}
            </FieldLabel>
            <Input
              id='ticket-title'
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='ticket-description'>
              {t('service.tickets.form.description')}
            </FieldLabel>
            <Textarea
              id='ticket-description'
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='ticket-customer'>
                {t('service.common.customer')}
              </FieldLabel>
              <Select
                items={customerItems}
                value={form.customerId || null}
                onValueChange={(value: string | null) =>
                  setForm((current) => ({
                    ...current,
                    customerId: value ?? '',
                    deviceId: '',
                  }))
                }
              >
                <SelectTrigger id='ticket-customer' className='w-full'>
                  <SelectValue
                    placeholder={t('service.common.selectCustomer')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-device'>
                {t('service.common.device')}
              </FieldLabel>
              <Select
                items={deviceItems}
                value={form.deviceId || null}
                onValueChange={(value: string | null) =>
                  setForm((current) => ({ ...current, deviceId: value ?? '' }))
                }
              >
                <SelectTrigger id='ticket-device' className='w-full'>
                  <SelectValue placeholder={t('service.common.selectDevice')} />
                </SelectTrigger>
                <SelectContent>
                  {availableDevices.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.code} · {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-priority'>
                {t('service.tickets.column.priority')}
              </FieldLabel>
              <Select
                items={priorityItems}
                value={form.priority}
                onValueChange={(value: string | null) =>
                  setForm((current) => ({
                    ...current,
                    priority: (value ?? 'normal') as TicketPriority,
                  }))
                }
              >
                <SelectTrigger id='ticket-priority' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`service.priority.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-assignee'>
                {t('service.tickets.column.assignee')}
              </FieldLabel>
              <Select
                items={assigneeItems}
                value={form.assigneeId || null}
                onValueChange={(value: string | null) =>
                  setForm((current) => ({
                    ...current,
                    assigneeId: value ?? '',
                  }))
                }
              >
                <SelectTrigger id='ticket-assignee' className='w-full'>
                  <SelectValue placeholder={t('service.common.unassigned')} />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='ticket-confidential'>
              {t('service.tickets.confidential')}
            </FieldLabel>
            <Switch
              id='ticket-confidential'
              checked={form.confidential}
              onCheckedChange={(checked: boolean) =>
                setForm((current) => ({ ...current, confidential: checked }))
              }
            />
          </Field>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('service.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {t('service.actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
