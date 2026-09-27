import { useTranslation } from '@nocobase/i18n/client';
import { FilterIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

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
import { Label } from '@/components/ui/label';
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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

import {
  describeError,
  useIdentity,
  useResource,
  useServiceApi,
} from '../../service/api.js';
import {
  asBoolean,
  asNumber,
  asText,
  formatDateTime,
  useDebouncedValue,
} from '../../service/format.js';
import { usePagedList } from '../../service/use-paged-list.js';
import {
  FilterSelect,
  ListPager,
  QueryState,
  RegionBadge,
  SearchInput,
  StatusBadge,
} from '../../service/ui.js';

const TICKET_STATUSES = [
  'draft',
  'pending_assignment',
  'in_progress',
  'pending_confirmation',
  'closed',
  'cancelled',
];
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
const REGIONS = ['east', 'south'];

/**
 * The ticket worklist. Filters and paging are answered by the server, so the
 * result is the same set the user's permissions allow rather than a filtered
 * page of everything.
 */
export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const identity = useIdentity();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialFilters = useMemo<Readonly<Record<string, string>>>(() => {
    const filters: Record<string, string> = {};
    if (params.get('overdue') === 'true') filters.overdue = 'true';
    return filters;
  }, [params]);
  const list = usePagedList(20, initialFilters);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const tickets = useResource(
    `${list.key}:${debouncedSearch}`,
    () =>
      api.listTickets({
        ...list.query,
        search: debouncedSearch || undefined,
      }),
    true,
  );

  const rows = tickets.data?.data ?? [];
  const total = (tickets.data?.meta?.total as number | undefined) ?? 0;

  const regionOptions = REGIONS.map((region) => ({
    value: region,
    label: t(`service.region.${region}`, { defaultValue: region }),
  }));
  const statusOptions = TICKET_STATUSES.map((status) => ({
    value: status,
    label: t(`service.status.ticket.${status}`, { defaultValue: status }),
  }));
  const priorityOptions = PRIORITIES.map((priority) => ({
    value: priority,
    label: t(`service.status.priority.${priority}`, { defaultValue: priority }),
  }));

  return (
    <PageContainer>
      <PageHeader
        title={t('service.tickets.title')}
        description={t('service.tickets.description')}
        actions={
          <Button size='sm' onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('service.tickets.create')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('service.tickets.searchPlaceholder')}
        />
        <FilterSelect
          allLabel={t('service.common.all')}
          value={list.filters.status ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('status', value === 'all' ? undefined : value)
          }
          options={statusOptions}
        />
        <FilterSelect
          allLabel={t('service.common.all')}
          value={list.filters.priority ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('priority', value === 'all' ? undefined : value)
          }
          options={priorityOptions}
        />
        <FilterSelect
          allLabel={t('service.common.all')}
          value={list.filters.region ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('region', value === 'all' ? undefined : value)
          }
          options={regionOptions}
        />
        <FilterSelect
          allLabel={t('service.tickets.overdueAll')}
          value={list.filters.overdue ?? 'all'}
          onValueChange={(value) =>
            list.setFilter('overdue', value === 'all' ? undefined : value)
          }
          options={[
            { value: 'true', label: t('service.tickets.overdueOnly') },
            { value: 'false', label: t('service.tickets.notOverdue') },
          ]}
        />
        {identity.data?.internalFields ? (
          <FilterSelect
            allLabel={t('service.tickets.confidentialAll')}
            value={list.filters.confidential ?? 'all'}
            onValueChange={(value) =>
              list.setFilter(
                'confidential',
                value === 'all' ? undefined : value,
              )
            }
            options={[
              { value: 'true', label: t('service.tickets.confidentialOnly') },
              { value: 'false', label: t('service.tickets.publicOnly') },
            ]}
          />
        ) : null}
        <Button variant='ghost' size='sm' onClick={() => list.reset()}>
          <FilterIcon />
          {t('service.common.clearFilters')}
        </Button>
      </div>

      <QueryState
        loading={tickets.loading}
        error={tickets.error}
        empty={rows.length === 0}
        onRetry={tickets.reload}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('service.tickets.serial')}</TableHead>
              <TableHead>{t('service.tickets.titleColumn')}</TableHead>
              <TableHead>{t('service.tickets.customer')}</TableHead>
              <TableHead>{t('service.tickets.device')}</TableHead>
              <TableHead>{t('service.tickets.region')}</TableHead>
              <TableHead>{t('service.tickets.priority')}</TableHead>
              <TableHead>{t('service.tickets.status')}</TableHead>
              <TableHead>{t('service.tickets.assignee')}</TableHead>
              <TableHead>{t('service.tickets.dueAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((ticket) => (
              <TableRow
                key={ticket.id}
                className='cursor-pointer'
                onClick={() => {
                  void navigate(`/service/tickets/${ticket.id}`);
                }}
              >
                <TableCell>
                  <Link
                    className='font-medium hover:underline'
                    to={`/service/tickets/${ticket.id}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {asText(ticket.serial)}
                  </Link>
                </TableCell>
                <TableCell className='max-w-72 truncate'>
                  <span className='flex items-center gap-2'>
                    {asText(ticket.title)}
                    {asBoolean(ticket.confidential) ? (
                      <Badge variant='secondary'>
                        {t('service.tickets.confidential')}
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>{asText(ticket.customerName)}</TableCell>
                <TableCell>{asText(ticket.deviceSerial) || '—'}</TableCell>
                <TableCell>
                  <RegionBadge value={ticket.region} />
                </TableCell>
                <TableCell>
                  <StatusBadge kind='priority' value={ticket.priority} />
                </TableCell>
                <TableCell>
                  <span className='flex items-center gap-2'>
                    <StatusBadge kind='ticket' value={ticket.status} />
                    {asBoolean(ticket.overdue) ? (
                      <Badge variant='destructive'>
                        {t('service.tickets.overdue')}
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>{asText(ticket.assigneeName) || '—'}</TableCell>
                <TableCell className='text-sm text-muted-foreground'>
                  {formatDateTime(ticket.slaDueAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPager
          page={list.page}
          pageSize={list.pageSize}
          total={total}
          onPageChange={(page) => list.setPage(page)}
        />
      </QueryState>

      <CreateTicketDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          tickets.reload();
          void navigate(`/service/tickets/${id}`);
        }}
      />
    </PageContainer>
  );
}

interface CreateTicketDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (id: number) => void;
}

function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTicketDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [confidential, setConfidential] = useState(false);
  const [saving, setSaving] = useState(false);

  const customers = useResource('service:customer-options', () =>
    api.listCustomers({ pageSize: 100 }),
  );
  const devices = useResource(
    `service:device-options:${customerId}`,
    () => api.listDevices({ customerId: Number(customerId), pageSize: 100 }),
    Number(customerId) > 0,
  );

  const customerItems = (customers.data?.data ?? []).map((customer) => ({
    value: String(customer.id),
    label: `${asText(customer.code)} · ${asText(customer.name)}`,
  }));
  const deviceItems = (devices.data?.data ?? []).map((device) => ({
    value: String(device.id),
    label: `${asText(device.serialNumber)} · ${asText(device.name)}`,
  }));

  const submit = async (): Promise<void> => {
    if (!title.trim() || !customerId) return;
    setSaving(true);
    try {
      const customer = customers.data?.data.find(
        (item) => String(item.id) === customerId,
      );
      const device = devices.data?.data.find(
        (item) => String(item.id) === deviceId,
      );
      const created = await api.createTicket({
        title: title.trim(),
        description,
        priority,
        confidential,
        customerId: Number(customerId),
        customerName: asText(customer?.name),
        deviceId: device ? Number(device.id) : undefined,
        deviceSerial: device ? asText(device.serialNumber) : undefined,
        region: asText(device?.region) || asText(customer?.region) || 'east',
      });
      toast.add({ type: 'success', title: t('service.tickets.created') });
      onCreated(asNumber(created.id) ?? 0);
      setTitle('');
      setDescription('');
      setCustomerId('');
      setDeviceId('');
      setConfidential(false);
      setPriority('normal');
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('service.tickets.create')}</DialogTitle>
          <DialogDescription>
            {t('service.tickets.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label>{t('service.tickets.customer')}</Label>
            <Select
              items={customerItems}
              value={customerId || null}
              onValueChange={(value: string | null) => {
                setCustomerId(value ?? '');
                setDeviceId('');
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customerItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label>{t('service.tickets.device')}</Label>
            <Select
              items={deviceItems}
              value={deviceId || null}
              onValueChange={(value: string | null) => setDeviceId(value ?? '')}
              disabled={!customerId}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deviceItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='ticket-title'>
              {t('service.tickets.titleColumn')}
            </Label>
            <Input
              id='ticket-title'
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('service.tickets.priority')}</Label>
            <Select
              items={PRIORITIES.map((value) => ({
                value,
                label: t(`service.status.priority.${value}`, {
                  defaultValue: value,
                }),
              }))}
              value={priority}
              onValueChange={(value: string | null) =>
                setPriority(value ?? 'normal')
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`service.status.priority.${value}`, {
                      defaultValue: value,
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='ticket-description'>
              {t('service.tickets.descriptionColumn')}
            </Label>
            <Textarea
              id='ticket-description'
              value={description}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={confidential}
              onCheckedChange={(checked) => setConfidential(checked === true)}
            />
            {t('service.tickets.confidentialHint')}
          </label>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('service.common.cancel')}
          </Button>
          <Button
            disabled={saving || !title.trim() || !customerId}
            onClick={() => void submit()}
          >
            {saving ? t('service.common.saving') : t('service.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
