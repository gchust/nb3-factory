import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

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
  useServiceApi,
  type OrderView,
  type ServiceApi,
} from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import { ORDER_PRIORITIES, ORDER_STATUSES, formatDate } from '../format.js';
import { OrderPriorityBadge, OrderStatusBadge } from '../shared.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function CreateOrderButton({
  api,
  t,
  onCreated,
}: {
  api: ServiceApi;
  t: Translate;
  onCreated: (order: OrderView) => void;
}): ReactElement {
  const toaster = useToaster();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const customers = useAsync(() => api.customers(), [api]);
  const devices = useAsync(() => api.devices(), [api]);

  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orderPriority, setOrderPriority] = useState('normal');
  const [deadline, setDeadline] = useState('');
  const [confidential, setConfidential] = useState(false);

  const availableDevices = (devices.data ?? []).filter(
    (device) =>
      String(device.customerId) === customerId && device.status !== 'disabled',
  );

  async function submit(): Promise<void> {
    if (!customerId || !deviceId || !title.trim()) {
      toaster.show({ type: 'error', title: t('service.orders.validation') });
      return;
    }
    setSaving(true);
    try {
      const order = await api.createOrder({
        customerId: Number(customerId),
        deviceId: Number(deviceId),
        title: title.trim(),
        problemDescription: description.trim() || undefined,
        priority: orderPriority,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        confidential,
      });
      toaster.show({ type: 'success', title: t('service.orders.created') });
      setOpen(false);
      onCreated(order);
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.orders.createFailed'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size='sm' onClick={() => setOpen(true)}>
        {t('service.orders.create')}
      </Button>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('service.orders.create')}</DialogTitle>
          <DialogDescription>
            {t('service.orders.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='max-h-[60vh] overflow-y-auto py-2'>
          <Field>
            <FieldLabel htmlFor='order-title'>
              {t('service.order.title')}
            </FieldLabel>
            <Input
              id='order-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='order-customer'>
                {t('service.order.customer')}
              </FieldLabel>
              <Select
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(String(value));
                  setDeviceId('');
                }}
              >
                <SelectTrigger id='order-customer' className='w-full'>
                  <SelectValue placeholder={t('service.common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='order-device'>
                {t('service.order.device')}
              </FieldLabel>
              <Select
                value={deviceId}
                onValueChange={(value) => setDeviceId(String(value))}
              >
                <SelectTrigger id='order-device' className='w-full'>
                  <SelectValue placeholder={t('service.common.select')} />
                </SelectTrigger>
                <SelectContent>
                  {availableDevices.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.deviceNo} · {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor='order-description'>
              {t('service.order.problemDescription')}
            </FieldLabel>
            <Textarea
              id='order-description'
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='order-priority'>
                {t('service.order.priority.label')}
              </FieldLabel>
              <Select
                value={orderPriority}
                onValueChange={(value) => setOrderPriority(String(value))}
              >
                <SelectTrigger id='order-priority' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_PRIORITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`service.order.priority.${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='order-deadline'>
                {t('service.order.deadline')}
              </FieldLabel>
              <Input
                id='order-deadline'
                type='datetime-local'
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </Field>
          </div>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='order-confidential'>
              {t('service.order.confidential')}
            </FieldLabel>
            <Switch
              id='order-confidential'
              checked={confidential}
              onCheckedChange={setConfidential}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant='outline'
            type='button'
            onClick={() => setOpen(false)}
          >
            {t('service.common.cancel')}
          </Button>
          <Button type='button' disabled={saving} onClick={() => void submit()}>
            {t('service.common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const orders = useAsync(
    () => api.orders({ search, status, priority }),
    [api, search, status, priority],
  );

  const columns = useMemo<ColumnDef<OrderView>[]>(
    () => [
      {
        accessorKey: 'orderNo',
        header: t('service.order.orderNo'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.orderNo}</span>
        ),
      },
      {
        accessorKey: 'title',
        header: t('service.order.title'),
        cell: ({ row }) => (
          <div className='max-w-[18rem] truncate font-medium'>
            {row.original.title}
          </div>
        ),
      },
      {
        id: 'customer',
        header: t('service.order.customer'),
        cell: ({ row }) => row.original.customer?.name ?? '—',
      },
      {
        id: 'device',
        header: t('service.order.device'),
        cell: ({ row }) => row.original.device?.name ?? '—',
      },
      {
        accessorKey: 'status',
        header: t('service.order.status.label'),
        cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'priority',
        header: t('service.order.priority.label'),
        cell: ({ row }) => (
          <OrderPriorityBadge priority={row.original.priority} />
        ),
      },
      {
        id: 'assignee',
        header: t('service.order.assignee'),
        cell: ({ row }) => row.original.assignee.name ?? '—',
      },
      {
        accessorKey: 'deadline',
        header: t('service.order.deadline'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDate(row.original.deadline)}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.orders.title')}
        description={t('service.orders.description')}
        actions={
          <CreateOrderButton
            api={api}
            t={t}
            onCreated={(order) => {
              void navigate(`/service/orders/${order.id}`);
            }}
          />
        }
      />
      <DataTable
        columns={columns}
        data={orders.data ?? []}
        getRowId={(row) => String(row.id)}
        onRowClick={(row) => {
          void navigate(`/service/orders/${row.id}`);
        }}
        emptyMessage={t('service.orders.empty')}
        toolbar={() => (
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              className='w-56'
              placeholder={t('service.common.search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus(String(value))}
            >
              <SelectTrigger className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('service.order.status.all')}
                </SelectItem>
                {ORDER_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`service.order.status.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(String(value))}
            >
              <SelectTrigger className='w-36'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('service.order.priority.all')}
                </SelectItem>
                {ORDER_PRIORITIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`service.order.priority.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />
    </PageContainer>
  );
}
