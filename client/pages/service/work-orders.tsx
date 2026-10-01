import { useToaster, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
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
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import {
  serviceRequest,
  useServiceResource,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUS_ORDER,
  priorityLabelKey,
  statusLabelKey,
  type Assignee,
  type Customer,
  type Device,
  type Priority,
  type WorkOrder,
} from './model.js';
import {
  ErrorState,
  LoadingState,
  PriorityBadge,
  StatusBadge,
} from './shared.js';

export interface WorkOrderDialogProps {
  readonly customers: readonly Customer[];
  readonly devices: readonly Device[];
  readonly assignees: readonly Assignee[];
  readonly onClose: () => void;
  readonly onSaved: (order: WorkOrder) => void;
}

function WorkOrderCreateDialog({
  customers,
  devices,
  assignees,
  onClose,
  onSaved,
}: WorkOrderDialogProps): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [deviceId, setDeviceId] = useState('');
  const [problem, setProblem] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const customerDevices = devices.filter(
    (device) => device.customerId === customerId && device.enabled,
  );

  const submit = async (): Promise<void> => {
    if (!title.trim() || !customerId || !deviceId || !problem.trim()) {
      setError(t('service.validation.required'));
      return;
    }
    if (!customerDevices.some((device) => device.id === deviceId)) {
      setError(t('service.workOrders.deviceMismatch'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const created = await serviceRequest<WorkOrder>(api, 'work-orders', {
        method: 'POST',
        json: {
          title,
          customerId,
          deviceId,
          problem,
          priority,
          dueAt: dueAt || null,
          assigneeId: assigneeId || null,
          confidential,
        },
      });
      toaster.show({ type: 'success', title: t('service.saved') });
      onSaved(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('service.workOrders.create')}</DialogTitle>
          <DialogDescription>
            {t('service.workOrders.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='wo-title'>
              {t('service.workOrders.title')}
            </FieldLabel>
            <Input
              id='wo-title'
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='wo-customer'>
                {t('service.workOrders.customer')}
              </FieldLabel>
              <NativeSelect
                id='wo-customer'
                className='w-full'
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setDeviceId('');
                }}
              >
                {customers.map((customer) => (
                  <NativeSelectOption key={customer.id} value={customer.id}>
                    {customer.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor='wo-device'>
                {t('service.workOrders.device')}
              </FieldLabel>
              <NativeSelect
                id='wo-device'
                className='w-full'
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
              >
                <NativeSelectOption value=''>
                  {t('service.workOrders.selectDevice')}
                </NativeSelectOption>
                {customerDevices.map((device) => (
                  <NativeSelectOption key={device.id} value={device.id}>
                    {device.code} · {device.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor='wo-problem'>
              {t('service.workOrders.problem')}
            </FieldLabel>
            <Textarea
              id='wo-problem'
              required
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='wo-priority'>
                {t('service.workOrders.priority')}
              </FieldLabel>
              <NativeSelect
                id='wo-priority'
                className='w-full'
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as Priority)
                }
              >
                {WORK_ORDER_PRIORITIES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t(priorityLabelKey(value))}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor='wo-due'>
                {t('service.workOrders.dueAt')}
              </FieldLabel>
              <Input
                id='wo-due'
                type='date'
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='wo-assignee'>
                {t('service.workOrders.assignee')}
              </FieldLabel>
              <NativeSelect
                id='wo-assignee'
                className='w-full'
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <NativeSelectOption value=''>
                  {t('service.unassigned')}
                </NativeSelectOption>
                {assignees.map((assignee) => (
                  <NativeSelectOption key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field orientation='horizontal'>
              <FieldLabel htmlFor='wo-confidential'>
                {t('service.workOrders.confidential')}
              </FieldLabel>
              <input
                id='wo-confidential'
                type='checkbox'
                checked={confidential}
                onChange={(event) => setConfidential(event.target.checked)}
              />
            </Field>
          </div>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            onClick={() => void submit()}
            disabled={pending}
          >
            {pending ? t('service.saving') : t('service.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const orders = useServiceResource<WorkOrder[]>('work-orders');
  const customers = useServiceResource<Customer[]>('customers');
  const devices = useServiceResource<Device[]>('devices');
  const assignees = useServiceResource<Assignee[]>('assignees');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // Capture the clock once so filtering stays pure across re-renders.
  const [now] = useState(() => Date.now());

  const statusFilter = params.get('status') ?? '';
  const assigneeFilter = params.get('assignee') ?? '';
  const overdueOnly = params.get('overdue') === '1';

  const customerNames = useMemo(
    () => new Map((customers.data ?? []).map((row) => [row.id, row.name])),
    [customers.data],
  );
  const deviceNames = useMemo(
    () => new Map((devices.data ?? []).map((row) => [row.id, row.name])),
    [devices.data],
  );
  const assigneeNames = useMemo(
    () => new Map((assignees.data ?? []).map((row) => [row.id, row.name])),
    [assignees.data],
  );

  const setParam = (key: string, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    const list = orders.data ?? [];
    const needle = search.trim().toLowerCase();
    return list.filter((order) => {
      if (statusFilter && order.status !== statusFilter) return false;
      if (assigneeFilter && order.assigneeId !== assigneeFilter) return false;
      if (overdueOnly) {
        if (order.status === 'closed') return false;
        if (!order.dueAt || new Date(order.dueAt).getTime() >= now)
          return false;
      }
      if (!needle) return true;
      return [
        order.code,
        order.title,
        customerNames.get(order.customerId) ?? order.customerId,
        deviceNames.get(order.deviceId) ?? order.deviceId,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [
    orders.data,
    customerNames,
    deviceNames,
    search,
    statusFilter,
    assigneeFilter,
    overdueOnly,
    now,
  ]);

  const columns = useMemo<ColumnDef<WorkOrder>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.code')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={`/work-orders/${row.original.id}`}
            className='font-mono text-xs text-primary hover:underline'
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.title')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{row.original.title}</span>
            {row.original.confidential ? (
              <Badge variant='outline'>
                {t('service.workOrders.confidential')}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'customer',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.customer')}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? row.original.customerId,
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.priority')}
          />
        ),
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.status')}
          />
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'assignee',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.assignee')}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.assigneeId;
          if (!id) return t('service.unassigned');
          return assigneeNames.get(id) ?? id;
        },
      },
      {
        accessorKey: 'dueAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.workOrders.dueAt')}
          />
        ),
        cell: ({ row }) =>
          row.original.dueAt
            ? new Date(row.original.dueAt).toLocaleDateString()
            : '—',
      },
      {
        id: 'open',
        header: () => <span className='sr-only'>{t('service.actions')}</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={<Link to={`/work-orders/${row.original.id}`} />}
          >
            {t('service.workOrders.open')}
          </Button>
        ),
      },
    ],
    [t, customerNames, assigneeNames],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.workOrders')}
        description={t('service.workOrders.description')}
        actions={
          <Button
            type='button'
            onClick={() => setCreating(true)}
            disabled={!customers.data?.length || !devices.data?.length}
          >
            <PlusIcon data-icon='inline-start' />
            {t('service.workOrders.create')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='w-64 pl-8'
            placeholder={t('service.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <NativeSelect
          value={statusFilter}
          onChange={(event) => setParam('status', event.target.value)}
        >
          <NativeSelectOption value=''>
            {t('service.workOrders.allStatuses')}
          </NativeSelectOption>
          {WORK_ORDER_STATUS_ORDER.map((status) => (
            <NativeSelectOption key={status} value={status}>
              {t(statusLabelKey(status))}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          value={assigneeFilter}
          onChange={(event) => setParam('assignee', event.target.value)}
        >
          <NativeSelectOption value=''>
            {t('service.workOrders.allAssignees')}
          </NativeSelectOption>
          {(assignees.data ?? []).map((assignee) => (
            <NativeSelectOption key={assignee.id} value={assignee.id}>
              {assignee.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type='button'
          variant={overdueOnly ? 'default' : 'outline'}
          size='sm'
          onClick={() => setParam('overdue', overdueOnly ? '' : '1')}
        >
          {t('service.dashboard.overdue')}
        </Button>
      </div>

      {orders.loading ? (
        <LoadingState />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={orders.reload} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          toolbar={(table) => <DataTableViewOptions table={table} />}
          emptyMessage={t('service.empty')}
          onRowClick={(row) => {
            void navigate(`/work-orders/${row.original.id}`);
          }}
        />
      )}

      {creating ? (
        <WorkOrderCreateDialog
          customers={customers.data ?? []}
          devices={devices.data ?? []}
          assignees={assignees.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={(order) => {
            setCreating(false);
            orders.reload();
            void navigate(`/work-orders/${order.id}`);
          }}
        />
      ) : null}
    </PageContainer>
  );
}
