import { useTranslation } from '@nocobase/i18n/client';
import { Eye, Plus, Search } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { PriorityBadge, StatusBadge } from '@/components/repair/badges';
import { DataState } from '@/components/repair/data-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  formatDateTime,
  repairApi,
  TICKET_STATUS_KEYS,
  PRIORITY_KEYS,
} from '@/lib/repair-api';
import { useApiData, useRepairMeta } from '@/lib/use-repair';

const ALL = '__all__';

export default function TicketListPage(): ReactElement {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const meta = useRepairMeta();

  const filters = useMemo(
    () => ({
      status: params.get('status') ?? undefined,
      buildingId: params.get('buildingId')
        ? Number(params.get('buildingId'))
        : undefined,
      assigneeId: params.get('assigneeId') ?? undefined,
      priority: params.get('priority') ?? undefined,
      keyword: params.get('keyword') ?? undefined,
      overdueOnly: params.get('overdueOnly') === 'true' ? true : undefined,
      page: params.get('page') ? Number(params.get('page')) : 1,
      pageSize: 10,
    }),
    [params],
  );

  const tickets = useApiData(`repair/tickets:${params.toString()}`, (api) =>
    repairApi.tickets(api, filters),
  );

  const update = (key: string, value: string | undefined): void => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const totalPages = tickets.data
    ? Math.max(1, Math.ceil(tickets.data.total / (tickets.data.pageSize || 10)))
    : 1;

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.tickets.title', { defaultValue: 'Repair tickets' })}
        description={t('repair.tickets.description', {
          defaultValue:
            'Filter by building, status, technician and priority. Only the tickets you may see are listed.',
        })}
        actions={
          <Button render={<Link to='/tickets/new' />}>
            <Plus aria-hidden='true' />
            {t('repair.tickets.create', { defaultValue: 'New repair request' })}
          </Button>
        }
      />

      <div className='grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-5'>
        <div className='space-y-1'>
          <Label htmlFor='filter-keyword'>
            {t('repair.tickets.keyword', { defaultValue: 'Search' })}
          </Label>
          <div className='flex gap-2'>
            <Input
              id='filter-keyword'
              defaultValue={filters.keyword ?? ''}
              placeholder={t('repair.tickets.keywordPlaceholder', {
                defaultValue: 'Ticket no. or title',
              })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  update('keyword', event.currentTarget.value || undefined);
                }
              }}
            />
            <Button
              type='button'
              size='icon'
              variant='outline'
              aria-label={t('repair.tickets.search', {
                defaultValue: 'Search',
              })}
              onClick={(event) => {
                const input =
                  event.currentTarget.parentElement?.querySelector('input');
                update('keyword', input?.value || undefined);
              }}
            >
              <Search aria-hidden='true' />
            </Button>
          </div>
        </div>

        <div className='space-y-1'>
          <Label>
            {t('repair.tickets.building', { defaultValue: 'Building' })}
          </Label>
          <Select
            value={filters.buildingId ? String(filters.buildingId) : ALL}
            onValueChange={(value) => update('buildingId', value ?? undefined)}
          >
            <SelectTrigger
              aria-label={t('repair.tickets.building', {
                defaultValue: 'Building',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('repair.tickets.allBuildings', {
                  defaultValue: 'All buildings',
                })}
              </SelectItem>
              {(meta.data?.buildings ?? []).map((building) => (
                <SelectItem key={building.id} value={String(building.id)}>
                  {building.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1'>
          <Label>
            {t('repair.tickets.status', { defaultValue: 'Status' })}
          </Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(value) => update('status', value ?? undefined)}
          >
            <SelectTrigger
              aria-label={t('repair.tickets.status', {
                defaultValue: 'Status',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('repair.tickets.allStatuses', {
                  defaultValue: 'All statuses',
                })}
              </SelectItem>
              {TICKET_STATUS_KEYS.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`repair.status.${status}`, { defaultValue: status })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1'>
          <Label>
            {t('repair.tickets.assignee', { defaultValue: 'Technician' })}
          </Label>
          <Select
            value={filters.assigneeId ?? ALL}
            onValueChange={(value) => update('assigneeId', value ?? undefined)}
          >
            <SelectTrigger
              aria-label={t('repair.tickets.assignee', {
                defaultValue: 'Technician',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('repair.tickets.allAssignees', {
                  defaultValue: 'All technicians',
                })}
              </SelectItem>
              {(meta.data?.technicians ?? []).map((technician) => (
                <SelectItem key={technician.userId} value={technician.userId}>
                  {technician.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1'>
          <Label>
            {t('repair.tickets.priority', { defaultValue: 'Priority' })}
          </Label>
          <Select
            value={filters.priority ?? ALL}
            onValueChange={(value) => update('priority', value ?? undefined)}
          >
            <SelectTrigger
              aria-label={t('repair.tickets.priority', {
                defaultValue: 'Priority',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('repair.tickets.allPriorities', {
                  defaultValue: 'All priorities',
                })}
              </SelectItem>
              {PRIORITY_KEYS.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {t(`repair.priority.${priority}`, { defaultValue: priority })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className='flex items-center gap-2 text-sm'>
        <input
          type='checkbox'
          checked={filters.overdueOnly === true}
          onChange={(event) =>
            update(
              'overdueOnly',
              event.currentTarget.checked ? 'true' : undefined,
            )
          }
        />
        {t('repair.tickets.overdueOnly', { defaultValue: 'Overdue only' })}
      </label>

      <DataState
        loading={tickets.loading}
        error={tickets.error}
        empty={tickets.data?.rows.length === 0}
        onRetry={tickets.reload}
      >
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('repair.tickets.number', { defaultValue: 'Ticket' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.subject', { defaultValue: 'Subject' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.location', { defaultValue: 'Location' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.status', { defaultValue: 'Status' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.priority', { defaultValue: 'Priority' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.assignee', { defaultValue: 'Technician' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.due', { defaultValue: 'Due' })}
                </TableHead>
                <TableHead>
                  {t('repair.tickets.cost', { defaultValue: 'Cost' })}
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tickets.data?.rows ?? []).map((ticket) => (
                <TableRow key={ticket.id} data-testid='ticket-row'>
                  <TableCell className='font-mono text-xs'>
                    {ticket.ticketNo}
                  </TableCell>
                  <TableCell className='max-w-[16rem] truncate'>
                    <Link
                      className='hover:underline'
                      to={`/tickets/${ticket.id}`}
                    >
                      {ticket.title}
                    </Link>
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {ticket.location}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell className='text-sm'>
                    {ticket.assigneeName ?? '—'}
                  </TableCell>
                  <TableCell className='text-sm'>
                    <span className='flex items-center gap-1'>
                      {formatDateTime(ticket.dueAt) || '—'}
                      {ticket.overdue ? (
                        <Badge variant='destructive'>
                          {t('repair.tickets.overdue', {
                            defaultValue: 'Overdue',
                          })}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    ¥{ticket.totalCost.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size='sm'
                      variant='ghost'
                      render={<Link to={`/tickets/${ticket.id}`} />}
                    >
                      <Eye aria-hidden='true' />
                      {t('repair.tickets.open', { defaultValue: 'Open' })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>
            {t('repair.tickets.total', {
              count: tickets.data?.total ?? 0,
              defaultValue: '{{count}} tickets',
            })}
          </span>
          <span className='flex items-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => update('page', String((filters.page ?? 1) - 1))}
            >
              {t('repair.tickets.previous', { defaultValue: 'Previous' })}
            </Button>
            <span className='tabular-nums'>
              {filters.page ?? 1} / {totalPages}
            </span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={(filters.page ?? 1) >= totalPages}
              onClick={() => update('page', String((filters.page ?? 1) + 1))}
            >
              {t('repair.tickets.next', { defaultValue: 'Next' })}
            </Button>
          </span>
        </div>
      </DataState>
    </PageContainer>
  );
}
