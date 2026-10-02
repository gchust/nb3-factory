import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import {
  EmptyState,
  ErrorState,
  LoadingState,
  WorkOrderPriorityBadge,
  WorkOrderStatusBadge,
} from '../components.js';
import {
  createWorkOrder,
  errorMessage,
  formatDate,
  getDirectory,
  listCustomers,
  listEquipment,
  listWorkOrders,
  WORK_ORDER_PRIORITY,
  WORK_ORDER_STATUS,
  WORK_ORDER_STATUS_FLOW,
  type Customer,
  type DirectoryProfile,
  type Equipment,
  type WorkOrder,
} from '../data.js';

type StatusTab = string;

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();

  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [keyword, setKeyword] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [engineers, setEngineers] = useState<DirectoryProfile[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listWorkOrders(api, {
        ...(statusTab === 'all' ? {} : { status: statusTab }),
        ...(keyword ? { keyword } : {}),
        limit: 100,
      }),
      listCustomers(api, { keyword: '' }),
      listEquipment(api, {}),
      getDirectory(api).catch(() => ({ groups: [], profiles: [] })),
    ])
      .then(([orders, customerPage, equipmentPage, directory]) => {
        if (controller.signal.aborted) return;
        setRows(orders.items);
        setCustomers(customerPage.items);
        setEquipment(equipmentPage.items);
        setEngineers(directory.profiles);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, keyword, revision, statusTab]);

  const nameById = new Map(
    engineers.map((engineer) => [engineer.userId, engineer.name]),
  );
  const customerById = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );

  const columns: ColumnDef<WorkOrder>[] = [
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.workOrders.code')}
        />
      ),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>
          {row.original.code ?? `#${row.original.id}`}
        </span>
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
          <Link
            className='font-medium hover:underline'
            to={`/service/work-orders/${row.original.id}`}
          >
            {row.original.title}
          </Link>
          {row.original.confidential ? (
            <Badge variant='destructive'>
              {t('service.workOrders.confidential')}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: 'customer',
      header: t('service.workOrders.customer'),
      cell: ({ row }) =>
        customerById.get(row.original.customerId) ??
        `#${row.original.customerId}`,
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.workOrders.priority')}
        />
      ),
      cell: ({ row }) => (
        <WorkOrderPriorityBadge priority={row.original.priority} />
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.workOrders.status')}
        />
      ),
      cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} />,
    },
    {
      id: 'assignee',
      header: t('service.workOrders.assignee'),
      cell: ({ row }) =>
        row.original.assigneeId
          ? (nameById.get(row.original.assigneeId) ?? row.original.assigneeId)
          : t('service.workOrders.unassigned'),
    },
    {
      accessorKey: 'deadline',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.workOrders.deadline')}
        />
      ),
      cell: ({ row }) => formatDate(row.original.deadline),
    },
  ];

  const submit = async (form: HTMLFormElement): Promise<void> => {
    const data = new FormData(form);
    const value = (name: string): string => {
      const raw = data.get(name);
      return typeof raw === 'string' ? raw.trim() : '';
    };
    setSaving(true);
    try {
      await createWorkOrder(api, {
        title: value('title'),
        customerId: Number(value('customerId')),
        equipmentId: Number(value('equipmentId')),
        description: value('description') || undefined,
        priority: value('priority') || WORK_ORDER_PRIORITY.NORMAL,
        confidential: data.get('confidential') === 'on',
        deadline: value('deadline') || null,
        assigneeId: value('assigneeId') || null,
      });
      setCreating(false);
      reload();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.workOrders.title')}
        description={t('service.workOrders.description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('service.workOrders.create')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className='flex-wrap'>
            <TabsTrigger value='all'>{t('service.workOrders.all')}</TabsTrigger>
            {WORK_ORDER_STATUS_FLOW.map((status) => (
              <TabsTrigger key={status} value={status}>
                {t(`service.status.${statusToKey(status)}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className='relative ml-auto w-full max-w-xs'>
          <SearchIcon className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
          <Input
            className='pl-8'
            placeholder={t('service.workOrders.searchPlaceholder')}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('service.workOrders.emptyTitle')}
          description={t('service.workOrders.emptyDescription')}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          onRowClick={(row) => {
            void navigate(`/service/work-orders/${row.original.id}`);
          }}
        />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('service.workOrders.create')}</DialogTitle>
            <DialogDescription>
              {t('service.workOrders.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(event.currentTarget);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='wo-title'>
                  {t('service.workOrders.title')}
                </FieldLabel>
                <Input id='wo-title' name='title' required />
              </Field>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel>{t('service.workOrders.customer')}</FieldLabel>
                  <Select name='customerId' required>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('service.workOrders.selectCustomer')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem
                          key={customer.id}
                          value={String(customer.id)}
                        >
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>{t('service.workOrders.equipment')}</FieldLabel>
                  <Select name='equipmentId' required>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('service.workOrders.selectEquipment')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {equipment.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.code} · {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel>{t('service.workOrders.priority')}</FieldLabel>
                  <Select
                    name='priority'
                    defaultValue={WORK_ORDER_PRIORITY.NORMAL}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WORK_ORDER_PRIORITY.LOW}>
                        {t('service.priority.low')}
                      </SelectItem>
                      <SelectItem value={WORK_ORDER_PRIORITY.NORMAL}>
                        {t('service.priority.normal')}
                      </SelectItem>
                      <SelectItem value={WORK_ORDER_PRIORITY.HIGH}>
                        {t('service.priority.high')}
                      </SelectItem>
                      <SelectItem value={WORK_ORDER_PRIORITY.URGENT}>
                        {t('service.priority.urgent')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor='wo-deadline'>
                    {t('service.workOrders.deadline')}
                  </FieldLabel>
                  <Input id='wo-deadline' name='deadline' type='date' />
                </Field>
              </div>
              <Field>
                <FieldLabel>{t('service.workOrders.assignee')}</FieldLabel>
                <Select name='assigneeId'>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('service.workOrders.unassigned')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((engineer) => (
                      <SelectItem key={engineer.userId} value={engineer.userId}>
                        {engineer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='wo-description'>
                  {t('service.workOrders.descriptionLabel')}
                </FieldLabel>
                <Textarea id='wo-description' name='description' rows={3} />
              </Field>
              <label className='flex items-center gap-2 text-sm'>
                <Checkbox name='confidential' />
                {t('service.workOrders.confidential')}
              </label>
            </FieldGroup>
            <DialogFooter className='mt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function statusToKey(status: string): string {
  switch (status) {
    case WORK_ORDER_STATUS.PENDING_ACCEPTANCE:
      return 'pendingAcceptance';
    case WORK_ORDER_STATUS.PENDING_PROCESSING:
      return 'pendingProcessing';
    case WORK_ORDER_STATUS.PROCESSING:
      return 'processing';
    case WORK_ORDER_STATUS.PENDING_CONFIRMATION:
      return 'pendingConfirmation';
    default:
      return 'closed';
  }
}
