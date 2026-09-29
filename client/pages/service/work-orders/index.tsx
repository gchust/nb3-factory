import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type WorkOrderInput } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import {
  ConfidentialBadge,
  EmptyState,
  ErrorState,
  PageLoading,
  PriorityBadge,
  StatusBadge,
  errorMessage,
  formatDateTime,
  isOverdue,
  useAsync,
} from '@/service/ui.js';
import type { WorkOrderStatus } from '@/service/types.js';

const STATUSES: readonly WorkOrderStatus[] = [
  'pending_accept',
  'pending_process',
  'processing',
  'pending_confirm',
  'closed',
];

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor, isIntegration } = useSession();
  const location = useLocation();

  const [status, setStatus] = useState<string>('all');
  const [priority, setPriority] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number>();

  const orders = useAsync(
    () =>
      api.listWorkOrders({
        status: status === 'all' ? undefined : status,
        priority: priority === 'all' ? undefined : priority,
        keyword: keyword.trim() || undefined,
        overdue: overdue || undefined,
        pageSize: 100,
      }),
    [status, priority, keyword, overdue],
  );

  // Accepting from the list keeps the first lifecycle step reachable without
  // opening the detail page; the detail page remains for every later step.
  const accept = async (id: number): Promise<void> => {
    setBusyId(id);
    try {
      await api.transition(id, 'accept');
      toaster.show({ type: 'success', title: t('service.common.saved') });
      orders.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.workOrders.title')}
        description={t('service.workOrders.description')}
        actions={
          isSupervisor ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('service.workOrders.create')}
            </Button>
          ) : undefined
        }
      />

      <div className='flex flex-wrap items-center gap-3'>
        <div className='relative min-w-56 flex-1'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='pl-8'
            placeholder={t('service.workOrders.searchPlaceholder')}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <Select
          items={[
            { value: 'all', label: t('service.workOrders.allStatus') },
            ...STATUSES.map((value) => ({
              value,
              label: t(`service.status.${value}`),
            })),
          ]}
          value={status}
          onValueChange={(next) => setStatus(next ?? 'all')}
        >
          <SelectTrigger className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('service.workOrders.allStatus')}
            </SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`service.status.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: 'all', label: t('service.workOrders.allPriority') },
            { value: 'normal', label: t('service.priority.normal') },
            { value: 'urgent', label: t('service.priority.urgent') },
          ]}
          value={priority}
          onValueChange={(next) => setPriority(next ?? 'all')}
        >
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('service.workOrders.allPriority')}
            </SelectItem>
            <SelectItem value='normal'>
              {t('service.priority.normal')}
            </SelectItem>
            <SelectItem value='urgent'>
              {t('service.priority.urgent')}
            </SelectItem>
          </SelectContent>
        </Select>
        <label className='flex items-center gap-2 text-sm'>
          <Switch checked={overdue} onCheckedChange={setOverdue} />
          {t('service.workOrders.onlyOverdue')}
        </label>
      </div>

      {orders.loading ? <PageLoading /> : null}
      {orders.error ? (
        <ErrorState error={orders.error} onRetry={orders.reload} />
      ) : null}

      {!orders.loading && !orders.error ? (
        orders.data && orders.data.rows.length > 0 ? (
          <div className='rounded-lg border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.workOrders.orderNo')}</TableHead>
                  <TableHead>{t('service.workOrders.subject')}</TableHead>
                  <TableHead>{t('service.workOrders.customer')}</TableHead>
                  <TableHead>{t('service.workOrders.status')}</TableHead>
                  <TableHead>{t('service.workOrders.priority')}</TableHead>
                  <TableHead>{t('service.workOrders.dueAt')}</TableHead>
                  <TableHead>{t('service.workOrders.device')}</TableHead>
                  <TableHead className='text-right'>
                    {t('service.common.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data.rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className='font-mono text-xs'>
                      <Link
                        className='underline-offset-4 hover:underline'
                        to={{
                          pathname: String(order.id),
                          search: location.search,
                        }}
                      >
                        {order.orderNo}
                      </Link>
                    </TableCell>
                    <TableCell className='max-w-64 truncate font-medium'>
                      {order.title}
                      {order.confidential ? (
                        <span className='ml-2'>
                          <ConfidentialBadge />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{order.customer?.name ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={order.priority} />
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          isOverdue(order) ? 'text-destructive' : undefined
                        }
                      >
                        {formatDateTime(order.dueAt)}
                      </span>
                      {isOverdue(order) ? (
                        <Badge className='ml-2' variant='destructive'>
                          {t('service.workOrders.overdue')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{order.device?.name ?? '—'}</TableCell>
                    <TableCell className='text-right whitespace-nowrap'>
                      {isSupervisor && order.status === 'pending_accept' ? (
                        <Button
                          size='sm'
                          disabled={busyId === order.id}
                          onClick={() => void accept(order.id)}
                        >
                          {t('service.actions.accept')}
                        </Button>
                      ) : null}
                      <Button
                        nativeButton={false}
                        size='sm'
                        variant='ghost'
                        render={
                          <Link
                            to={{
                              pathname: String(order.id),
                              search: location.search,
                            }}
                          />
                        }
                      >
                        {t('service.workOrders.open')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState />
        )
      ) : null}

      <CreateWorkOrderDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          orders.reload();
        }}
        canSubmit={!isIntegration}
      />

      {/* The covering detail page renders here, over the list. */}
      <Outlet />
    </PageContainer>
  );
}

function CreateWorkOrderDialog({
  open,
  canSubmit,
  onClose,
  onCreated,
}: {
  readonly open: boolean;
  readonly canSubmit: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const [form, setForm] = useState<WorkOrderInput>({ title: '' });
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const customers = useAsync(() => api.listCustomers(), []);
  const devices = useAsync(() => api.listDevices(), []);
  const engineers = useAsync(() => api.listEngineers(), []);

  const openDialog = (next: boolean): void => {
    if (next) {
      // One key per creation attempt, so a double submit is one work order.
      setIdempotencyKey(crypto.randomUUID());
    } else {
      setForm({ title: '' });
      onClose();
    }
    setTitleError(undefined);
    setFormError(undefined);
  };

  const submit = async (): Promise<void> => {
    if (!form.title.trim()) {
      setTitleError(t('service.workOrders.subjectRequired'));
      return;
    }
    setTitleError(undefined);
    setFormError(undefined);
    setSaving(true);
    try {
      await api.createWorkOrder({ ...form, idempotencyKey });
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setForm({ title: '' });
      onCreated();
    } catch (cause) {
      // A rejected save stays visible in the dialog instead of only flashing as
      // a toast, so the operator can correct the stated reason and retry.
      const message = errorMessage(cause);
      setFormError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<WorkOrderInput>): void =>
    setForm((current) => ({ ...current, ...patch }));

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogContent className='max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('service.workOrders.create')}</DialogTitle>
          <DialogDescription>
            {t('service.workOrders.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {formError ? (
            <p className='text-sm text-destructive' role='alert'>
              {formError}
            </p>
          ) : null}
          <div className='grid gap-2'>
            <Label htmlFor='order-title'>
              {t('service.workOrders.subject')}
            </Label>
            <Input
              aria-invalid={titleError ? true : undefined}
              id='order-title'
              value={form.title}
              onChange={(event) => {
                update({ title: event.target.value });
                if (titleError) {
                  setTitleError(undefined);
                }
              }}
            />
            {titleError ? (
              <p className='text-sm text-destructive' role='alert'>
                {titleError}
              </p>
            ) : null}
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='order-description'>
              {t('service.workOrders.faultDescription')}
            </Label>
            <Textarea
              id='order-description'
              value={form.description ?? ''}
              onChange={(event) => update({ description: event.target.value })}
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('service.workOrders.customer')}</Label>
              <Select
                items={(customers.data ?? []).map((customer) => ({
                  value: String(customer.id),
                  label: customer.name,
                }))}
                value={form.customerId ? String(form.customerId) : undefined}
                onValueChange={(next) =>
                  update({ customerId: next ? Number(next) : undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.workOrders.selectCustomer')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label>{t('service.workOrders.device')}</Label>
              <Select
                items={(devices.data ?? []).map((device) => ({
                  value: String(device.id),
                  label: `${device.serialNumber} · ${device.name}`,
                }))}
                value={form.deviceId ? String(form.deviceId) : undefined}
                onValueChange={(next) =>
                  update({ deviceId: next ? Number(next) : undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.workOrders.selectDevice')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(devices.data ?? []).map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.serialNumber} · {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('service.workOrders.priority')}</Label>
              <Select
                items={[
                  { value: 'normal', label: t('service.priority.normal') },
                  { value: 'urgent', label: t('service.priority.urgent') },
                ]}
                value={form.priority ?? 'normal'}
                onValueChange={(next) =>
                  update({ priority: next as 'normal' | 'urgent' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='normal'>
                    {t('service.priority.normal')}
                  </SelectItem>
                  <SelectItem value='urgent'>
                    {t('service.priority.urgent')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label>{t('service.workOrders.assignee')}</Label>
              <Select
                items={(engineers.data ?? []).map((engineer) => ({
                  value: engineer.id,
                  label: engineer.name,
                }))}
                value={form.assigneeId ?? undefined}
                onValueChange={(next) =>
                  update({ assigneeId: next ?? undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('service.workOrders.selectAssignee')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(engineers.data ?? []).map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.id}>
                      {engineer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='order-due'>{t('service.workOrders.dueAt')}</Label>
            <Input
              id='order-due'
              type='datetime-local'
              value={form.dueAt ?? ''}
              onChange={(event) =>
                update({
                  dueAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : undefined,
                })
              }
            />
          </div>
          <div className='flex items-center justify-between rounded-md border border-border px-3 py-2'>
            <div>
              <Label htmlFor='order-confidential'>
                {t('service.workOrders.confidential')}
              </Label>
              <p className='text-xs text-muted-foreground'>
                {t('service.workOrders.confidentialHint')}
              </p>
            </div>
            <Switch
              id='order-confidential'
              checked={form.confidential ?? false}
              onCheckedChange={(checked) => update({ confidential: checked })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => openDialog(false)}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !canSubmit}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
