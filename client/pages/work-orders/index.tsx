import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table/index.js';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/service/badges.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { formatDateTime } from '@/components/service/format.js';
import { SelectField } from '@/components/service/select-field.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import type {
  CustomerView,
  DeviceView,
  Paged,
  ServiceGroupView,
  ShareTargetView,
  WorkOrderView,
} from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient, useDebouncedValue } from '@/hooks/use-service-api.js';

const STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
] as const;

const FAULT_CATEGORIES = [
  'mechanical',
  'electrical',
  'software',
  'wear',
  'calibration',
  'other',
] as const;

interface WorkOrderFormState {
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly confidential: boolean;
  readonly faultCategory: string;
  readonly customerId: string;
  readonly deviceId: string;
  readonly groupId: string;
  readonly assigneeId: string;
}

const EMPTY_FORM: WorkOrderFormState = {
  title: '',
  description: '',
  priority: 'normal',
  confidential: false,
  faultCategory: '',
  customerId: '',
  deviceId: '',
  groupId: '',
  assigneeId: '',
};

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<WorkOrderFormState>(EMPTY_FORM);

  const status = params.get('status') ?? '';
  const assigneeId = params.get('assigneeId') ?? '';
  const groupId = params.get('groupId') ?? '';
  const overdue = params.get('overdue') === '1';
  const openOnly = params.get('open') === '1';
  const urgentOnly = params.get('priority') === 'urgent';

  const list = useApiQuery<Paged<WorkOrderView>>('/workOrders', {
    search: debouncedSearch.trim() || undefined,
    status: status || undefined,
    assigneeId: assigneeId || undefined,
    groupId: groupId || undefined,
    pageSize: 200,
  });
  const customers = useApiQuery<Paged<CustomerView>>('/customers', {
    pageSize: 200,
  });
  const devices = useApiQuery<Paged<DeviceView>>('/devices', { pageSize: 200 });
  const groups = useApiQuery<Paged<ServiceGroupView>>('/serviceGroups', {});
  const users = useApiQuery<{ data: readonly ShareTargetView[] }>(
    '/workOrders/shareTargets',
    {},
  );

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('service.filter.allCustomers') },
      ...(customers.data?.data ?? []).map((customer) => ({
        value: customer.id,
        label: `${customer.code} · ${customer.name}`,
      })),
    ],
    [customers.data, t],
  );
  const statusOptions = useMemo(
    () => [
      { value: '', label: t('service.filter.allStatuses') },
      ...STATUSES.map((value) => ({
        value,
        label: t(`service.workOrder.status.${value}`, { defaultValue: value }),
      })),
    ],
    [t],
  );
  const assigneeOptions = useMemo(
    () => [
      { value: '', label: t('service.filter.allAssignees') },
      ...(users.data?.data ?? []).map((user) => ({
        value: user.id,
        label: user.name,
      })),
    ],
    [users.data, t],
  );
  const groupOptions = useMemo(
    () => [
      { value: '', label: t('service.filter.allGroups') },
      ...(groups.data?.data ?? []).map((group) => ({
        value: group.id,
        label: group.name,
      })),
    ],
    [groups.data, t],
  );

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    let items = list.data?.data ?? [];
    if (openOnly) items = items.filter((row) => row.status !== 'closed');
    if (overdue) items = items.filter((row) => row.overdueSince !== null);
    if (urgentOnly) items = items.filter((row) => row.priority === 'urgent');
    return [...items];
  }, [list.data, openOnly, overdue, urgentOnly]);

  const formDevices = useMemo(() => {
    const all = devices.data?.data ?? [];
    if (!form.customerId) return all;
    return all.filter((device) => device.customerId === form.customerId);
  }, [devices.data, form.customerId]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const submit = async () => {
    await client.request({
      path: '/workOrders',
      method: 'POST',
      json: {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        confidential: form.confidential,
        faultCategory: form.faultCategory || null,
        customerId: form.customerId || null,
        deviceId: form.deviceId || null,
        groupId: form.groupId || null,
        assigneeId: form.assigneeId || null,
      },
    });
    list.reload();
  };

  const activeFilters = [
    status,
    assigneeId,
    groupId,
    overdue ? '1' : '',
    openOnly ? '1' : '',
    urgentOnly ? '1' : '',
  ].some(Boolean);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'orderNo',
        header: t('service.workOrder.orderNo'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <span className='font-mono text-xs'>{row.original.orderNo}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: t('service.workOrder.titleField'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{row.original.title}</span>
            {row.original.confidential ? (
              <span className='text-xs text-muted-foreground'>
                {t('service.workOrder.confidentialShort')}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'customerName',
        header: t('service.workOrder.customer'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <span>{row.original.customerName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'deviceName',
        header: t('service.workOrder.device'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <span>{row.original.deviceName ?? row.original.deviceCode ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.workOrder.statusLabel'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <WorkOrderStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'priority',
        header: t('service.workOrder.priorityLabel'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <PriorityBadge priority={row.original.priority} />
        ),
      },
      {
        accessorKey: 'assigneeName',
        header: t('service.workOrder.assignee'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <span>{row.original.assigneeName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'lastActivityAt',
        header: t('service.workOrder.lastActivity'),
        cell: ({ row }: { row: { original: WorkOrderView } }) => (
          <span className='text-xs text-muted-foreground'>
            {formatDateTime(row.original.lastActivityAt)}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.workOrder.title')}
        description={t('service.workOrder.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('service.workOrder.create')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-3'>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('service.workOrder.searchPlaceholder')}
          className='max-w-xs'
        />
        <SelectField
          value={status || ''}
          onValueChange={(value) => updateParam('status', value)}
          options={statusOptions}
          placeholder={t('service.filter.status')}
        />
        <SelectField
          value={assigneeId || ''}
          onValueChange={(value) => updateParam('assigneeId', value)}
          options={assigneeOptions}
          placeholder={t('service.filter.assignee')}
        />
        <SelectField
          value={groupId || ''}
          onValueChange={(value) => updateParam('groupId', value)}
          options={groupOptions}
          placeholder={t('service.filter.group')}
        />
        <Button
          variant={overdue ? 'default' : 'outline'}
          size='sm'
          onClick={() => updateParam('overdue', overdue ? '' : '1')}
        >
          {t('service.filter.overdue')}
        </Button>
        <Button
          variant={urgentOnly ? 'default' : 'outline'}
          size='sm'
          onClick={() => updateParam('priority', urgentOnly ? '' : 'urgent')}
        >
          {t('service.filter.urgent')}
        </Button>
        {activeFilters ? (
          <Button
            variant='ghost'
            size='sm'
            onClick={() =>
              setParams(new URLSearchParams(), { replace: true })
            }
          >
            {t('service.filter.clear')}
          </Button>
        ) : null}
      </div>

      {list.error ? (
        <RequestError error={list.error} onRetry={list.reload} />
      ) : null}

      {list.data ? (
        rows.length === 0 ? (
          <EmptyTable title={t('service.workOrder.empty')} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            showSelectedCount={false}
            emptyMessage={t('service.workOrder.empty')}
            onRowClick={(row) => navigate(`/workOrders/${row.original.id}`)}
          />
        )
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={(next) => {
          if (!next) setCreating(false);
        }}
        title={t('service.workOrder.create')}
        description={t('service.workOrder.createHint')}
        onSubmit={submit}
        wide
        canSubmit={form.title.trim().length > 0}
      >
        <Field label={t('service.workOrder.titleField')} htmlFor='wo-title'>
          <Input
            id='wo-title'
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label={t('service.workOrder.description')} htmlFor='wo-desc'>
          <Textarea
            id='wo-desc'
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </Field>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('service.workOrder.customer')} htmlFor='wo-customer'>
            <SelectField
              id='wo-customer'
              value={form.customerId || null}
              onValueChange={(customerId) =>
                setForm({ ...form, customerId, deviceId: '' })
              }
              options={customerOptions.filter((option) => option.value !== '')}
              placeholder={t('service.device.customerPlaceholder')}
              className='w-full'
            />
          </Field>
          <Field label={t('service.workOrder.device')} htmlFor='wo-device'>
            <SelectField
              id='wo-device'
              value={form.deviceId || null}
              onValueChange={(deviceId) => setForm({ ...form, deviceId })}
              options={formDevices
                .filter((device) => device.enabled)
                .map((device) => ({
                  value: device.id,
                  label: `${device.code} · ${device.name}`,
                }))}
              placeholder={t('service.workOrder.devicePlaceholder')}
              className='w-full'
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('service.workOrder.priorityLabel')} htmlFor='wo-priority'>
            <SelectField
              id='wo-priority'
              value={form.priority}
              onValueChange={(priority) => setForm({ ...form, priority })}
              options={[
                { value: 'normal', label: t('service.workOrder.priority.normal') },
                { value: 'urgent', label: t('service.workOrder.priority.urgent') },
              ]}
              className='w-full'
            />
          </Field>
          <Field
            label={t('service.workOrder.faultCategory')}
            htmlFor='wo-fault'
          >
            <SelectField
              id='wo-fault'
              value={form.faultCategory || null}
              onValueChange={(faultCategory) =>
                setForm({ ...form, faultCategory })
              }
              options={FAULT_CATEGORIES.map((value) => ({
                value,
                label: t(`service.faultCategory.${value}`, {
                  defaultValue: value,
                }),
              }))}
              placeholder={t('service.workOrder.faultPlaceholder')}
              className='w-full'
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('service.workOrder.group')} htmlFor='wo-group'>
            <SelectField
              id='wo-group'
              value={form.groupId || null}
              onValueChange={(groupId) => setForm({ ...form, groupId })}
              options={groupOptions.filter((option) => option.value !== '')}
              placeholder={t('service.workOrder.groupPlaceholder')}
              className='w-full'
            />
          </Field>
          <Field label={t('service.workOrder.assignee')} htmlFor='wo-assignee'>
            <SelectField
              id='wo-assignee'
              value={form.assigneeId || null}
              onValueChange={(assigneeId) => setForm({ ...form, assigneeId })}
              options={assigneeOptions.filter((option) => option.value !== '')}
              placeholder={t('service.workOrder.assigneePlaceholder')}
              className='w-full'
            />
          </Field>
        </div>
        <div className='flex items-center gap-3'>
          <Switch
            id='wo-confidential'
            checked={form.confidential}
            onCheckedChange={(confidential) => setForm({ ...form, confidential })}
          />
          <label htmlFor='wo-confidential' className='text-sm'>
            {t('service.workOrder.confidential')}
          </label>
        </div>
      </FormDialog>

      {/* The record drawer for `/workOrders/:id` renders here. */}
      <Outlet />
    </PageContainer>
  );
}
