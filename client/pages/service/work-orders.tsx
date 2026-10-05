/**
 * Work orders — the closed loop from a registered repair to a closed order.
 *
 * This page owns the list, the status/priority filters the dashboard links
 * into, and the supervisor's registration form. Every action button is gated by
 * the `capabilities` the server computed for this caller; the server refuses
 * the same transitions independently. Registration itself is a manager action,
 * so the action and the form's reference lookups (customers, equipment) are
 * rendered only for a manager: an engineer or an observer holds the work-orders
 * page to read it, not to register, and the page must not call endpoints their
 * role is denied.
 */
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { format } from 'date-fns';
import { EyeIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';

import { DatePicker } from '@/components/date-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

import { useServiceApi, type ServiceList } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  PriorityBadge,
  ServicePage,
  StatusBadge,
} from './parts.js';
import type {
  CustomerView,
  EquipmentView,
  MeView,
  MemberView,
  WorkOrderView,
} from './types.js';

const STATUSES = [
  'pending_acceptance',
  'pending_processing',
  'processing',
  'pending_confirmation',
  'closed',
];

const PRIORITIES = ['normal', 'urgent'];

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const me = useLoad(useCallback(() => api.get<MeView>('/me'), [api]));
  const canRegister = me.data?.roles.includes('manager') ?? false;

  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;

  const state = useLoad(
    useCallback(
      () =>
        api.get<ServiceList<WorkOrderView>>('/work-orders', {
          status,
          priority,
          search,
          page,
          pageSize: 20,
        }),
      [api, status, priority, search, page],
    ),
  );

  const update = useCallback(
    (key: string, value: string): void => {
      const next = new URLSearchParams(params);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      if (key !== 'page') {
        next.delete('page');
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // The field keeps its own draft so typing stays responsive and the address bar
  // only changes once the value settles; Enter, blur and the clear button commit
  // at once, so the list cannot disagree with the box.
  const [draft, setDraft] = useState(search);
  useEffect(() => {
    if (draft.trim() === search) return;
    const timer = setTimeout(() => update('search', draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, search, update]);

  return (
    <ServicePage
      title={t('service.workOrders.title')}
      description={t('service.workOrders.description')}
      actions={
        canRegister ? (
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className='size-4' />
            {t('service.workOrders.register')}
          </Button>
        ) : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.workOrders.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='wo-status'>{t('service.workOrders.status')}</Label>
            <Select
              value={status || 'all'}
              onValueChange={(value) =>
                update('status', value === 'all' ? '' : String(value))
              }
            >
              <SelectTrigger id='wo-status' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('service.common.all')}</SelectItem>
                {STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`service.status.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='wo-priority'>
              {t('service.workOrders.priority')}
            </Label>
            <Select
              value={priority || 'all'}
              onValueChange={(value) =>
                update('priority', value === 'all' ? '' : String(value))
              }
            >
              <SelectTrigger id='wo-priority' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('service.common.all')}</SelectItem>
                {PRIORITIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`service.priority.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='wo-search'>{t('service.common.search')}</Label>
            <div className='relative'>
              <SearchIcon className='pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <Input
                id='wo-search'
                value={draft}
                className='pe-8 ps-8'
                placeholder={t('service.workOrders.searchPlaceholder')}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => update('search', draft.trim())}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    update('search', event.currentTarget.value.trim());
                  }
                }}
              />
              {draft ? (
                <Button
                  variant='ghost'
                  size='icon-sm'
                  className='absolute end-1 top-1/2 -translate-y-1/2'
                  aria-label={t('service.common.clearSearch')}
                  onClick={() => {
                    setDraft('');
                    update('search', '');
                  }}
                >
                  <XIcon className='size-3.5' />
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}

      {state.data ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            {state.data.rows.length === 0 ? (
              <EmptyState message={t('service.workOrders.empty')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('service.workOrders.orderNo')}</TableHead>
                      <TableHead>
                        {t('service.workOrders.titleColumn')}
                      </TableHead>
                      <TableHead>{t('service.workOrders.customer')}</TableHead>
                      <TableHead>{t('service.workOrders.equipment')}</TableHead>
                      <TableHead>{t('service.workOrders.assignee')}</TableHead>
                      <TableHead>{t('service.workOrders.status')}</TableHead>
                      <TableHead>{t('service.workOrders.priority')}</TableHead>
                      <TableHead>{t('service.workOrders.deadline')}</TableHead>
                      <TableHead className='text-right'>
                        {t('service.common.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className='font-mono text-xs'>
                          {row.orderNo}
                        </TableCell>
                        <TableCell className='max-w-64'>
                          <Link
                            className='line-clamp-1 font-medium hover:underline'
                            to={`/service/work-orders/${row.id}`}
                          >
                            {row.title}
                          </Link>
                        </TableCell>
                        <TableCell>{row.customer?.name ?? '—'}</TableCell>
                        <TableCell>
                          {row.equipment
                            ? `${row.equipment.code ?? ''} ${row.equipment.name ?? ''}`.trim()
                            : '—'}
                        </TableCell>
                        <TableCell>{row.assignee?.name ?? '—'}</TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          <PriorityBadge priority={row.priority} />
                        </TableCell>
                        <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>
                          {formatDateTime(row.deadline)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='outline'
                            size='sm'
                            render={
                              <Link to={`/service/work-orders/${row.id}`} />
                            }
                          >
                            <EyeIcon className='size-3.5' />
                            {t('service.common.detail')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPage={(next) => update('page', String(next))}
            />
          </CardContent>
        </Card>
      ) : null}

      {canRegister ? (
        <CreateWorkOrderDialog
          open={creating}
          onOpenChange={setCreating}
          onCreated={() => {
            setCreating(false);
            state.reload();
          }}
        />
      ) : null}
    </ServicePage>
  );
}

interface FormOption {
  readonly id: number;
  readonly label: string;
}

function CreateWorkOrderDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  readonly onCreated: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [confidential, setConfidential] = useState(false);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);

  const options = useLoad(
    useCallback(async () => {
      const [customers, equipment, engineers] = await Promise.all([
        api.get<ServiceList<CustomerView>>('/customers', {
          pageSize: 200,
        }),
        api.get<ServiceList<EquipmentView>>('/equipment', {
          pageSize: 200,
        }),
        api.get<MemberView[]>('/engineers'),
      ]);
      return {
        customers: customers.rows.map((row): FormOption => ({
          id: Number(row.id),
          label: row.name ?? `#${row.id}`,
        })),
        equipment: equipment.rows.map(
          (
            row,
          ): FormOption & { customerId: number | null; enabled: boolean } => ({
            id: Number(row.id),
            label: `${row.code ?? ''} ${row.name ?? ''}`.trim(),
            customerId: row.customerId,
            enabled: row.enabled !== false,
          }),
        ),
        engineers: engineers
          .filter((row) => row.kind === 'engineer')
          .map((row): FormOption => ({
            id: Number(row.id),
            label: row.name ?? row.ref ?? `#${row.id}`,
          })),
      };
    }, [api]),
  );

  const equipmentOptions = useMemo(() => {
    const rows = options.data?.equipment ?? [];
    if (!customerId) {
      return rows;
    }
    return rows.filter((row) => row.customerId === Number(customerId));
  }, [customerId, options.data]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api.post('/work-orders', {
        title: formText(data, 'title'),
        problem: formText(data, 'problem'),
        deadline: formText(data, 'deadline') || null,
        customerId: Number(customerId),
        equipmentId: Number(equipmentId),
        assigneeId: Number(assigneeId),
        priority,
        confidential,
      });
      onCreated();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('service.workOrders.register')}</DialogTitle>
            <DialogDescription>
              {t('service.workOrders.registerDescription')}
            </DialogDescription>
          </DialogHeader>
          {options.error ? (
            <p className='py-2 text-sm text-destructive'>{options.error}</p>
          ) : null}
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='wo-title'>
                {t('service.workOrders.titleColumn')}
              </FieldLabel>
              <Input id='wo-title' name='title' required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor='wo-problem'>
                {t('service.workOrders.problem')}
              </FieldLabel>
              <Textarea id='wo-problem' name='problem' required rows={3} />
            </Field>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='wo-customer'>
                  {t('service.workOrders.customer')}
                </FieldLabel>
                <Select
                  value={customerId}
                  onValueChange={(value) => {
                    setCustomerId(String(value));
                    setEquipmentId('');
                  }}
                >
                  <SelectTrigger id='wo-customer' className='w-full'>
                    <SelectValue
                      placeholder={t('service.common.selectPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.customers ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='wo-equipment'>
                  {t('service.workOrders.equipment')}
                </FieldLabel>
                <Select
                  value={equipmentId}
                  onValueChange={(value) => setEquipmentId(String(value))}
                >
                  <SelectTrigger id='wo-equipment' className='w-full'>
                    <SelectValue
                      placeholder={t('service.common.selectPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentOptions.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={String(item.id)}
                        disabled={!item.enabled}
                      >
                        {item.label}
                        {item.enabled
                          ? ''
                          : ` (${t('service.equipment.disabled')})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='wo-assignee'>
                  {t('service.workOrders.assignee')}
                </FieldLabel>
                <Select
                  value={assigneeId}
                  onValueChange={(value) => setAssigneeId(String(value))}
                >
                  <SelectTrigger id='wo-assignee' className='w-full'>
                    <SelectValue
                      placeholder={t('service.common.selectPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.engineers ?? []).map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='wo-priority-input'>
                  {t('service.workOrders.priority')}
                </FieldLabel>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(String(value))}
                >
                  <SelectTrigger id='wo-priority-input' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {t(`service.priority.${item}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='wo-deadline'>
                  {t('service.workOrders.deadline')}
                </FieldLabel>
                <DatePicker
                  id='wo-deadline'
                  className='w-full'
                  value={deadline}
                  onChange={setDeadline}
                />
                <input
                  type='hidden'
                  name='deadline'
                  value={deadline ? format(deadline, 'yyyy-MM-dd') : ''}
                />
              </Field>
              <Field orientation='horizontal'>
                <div className='flex items-center gap-2 pt-6'>
                  <Switch
                    id='wo-confidential'
                    checked={confidential}
                    onCheckedChange={(value) => setConfidential(Boolean(value))}
                  />
                  <Label htmlFor='wo-confidential'>
                    {t('service.workOrders.confidential')}
                  </Label>
                </div>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={busy || !customerId || !equipmentId || !assigneeId}
            >
              {t('service.common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
