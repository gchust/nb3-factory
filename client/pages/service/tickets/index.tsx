import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/data-states.js';
import { TicketCreateDialog } from '../components/ticket-create-dialog.js';
import { TicketTable } from '../components/ticket-table.js';
import { useServiceClient, useCaller } from '../lib/use-service.js';
import { useServiceQuery } from '../lib/use-service-query.js';
import {
  REGION_OPTIONS,
  TICKET_STATUS_OPTIONS,
  regionLabel,
  ticketStatusLabel,
} from '../lib/format.js';

const PAGE_SIZE = 20;

export default function ServiceTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [status, setStatus] = useState('all');
  const [region, setRegion] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const canCreate = caller.data?.caller.capabilities['tickets.create'] === true;

  const list = useServiceQuery(
    () =>
      client.listTickets({
        status: status === 'all' ? undefined : status,
        region: region === 'all' ? undefined : region,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    `tickets:${status}:${region}:${search}:${page}`,
  );

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))
    : 1;

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden='true' />
              {t('service.tickets.create')}
            </Button>
          ) : null
        }
        description={t('service.tickets.description')}
        title={t('service.tickets.title')}
      />
      <div className='flex flex-wrap items-end gap-3'>
        <div className='w-40 space-y-1'>
          <span className='text-xs text-muted-foreground'>
            {t('service.tickets.status')}
          </span>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value ? String(value) : 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('service.common.all')}</SelectItem>
              {TICKET_STATUS_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {ticketStatusLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='w-40 space-y-1'>
          <span className='text-xs text-muted-foreground'>
            {t('service.tickets.region')}
          </span>
          <Select
            value={region}
            onValueChange={(value) => {
              setRegion(value ? String(value) : 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('service.common.all')}</SelectItem>
              {REGION_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {regionLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-end gap-2'>
          <div className='space-y-1'>
            <span className='text-xs text-muted-foreground'>
              {t('service.common.search')}
            </span>
            <Input
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setSearch(searchInput);
                  setPage(1);
                }
              }}
              placeholder={t('service.tickets.searchPlaceholder')}
              value={searchInput}
            />
          </div>
          <Button
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
            variant='outline'
          >
            <Search aria-hidden='true' />
            {t('service.common.search')}
          </Button>
        </div>
      </div>
      <Card className='py-0'>
        <CardContent className='px-0'>
          {list.loading && !list.data ? <LoadingState /> : null}
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : null}
          {list.data ? (
            list.data.items.length ? (
              <TicketTable tickets={list.data.items} />
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.tickets.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>
      {list.data && list.data.total > PAGE_SIZE ? (
        <div className='flex items-center justify-end gap-3 text-sm'>
          <span className='text-muted-foreground'>
            {t('service.common.pageOf', { page, total: totalPages })}
          </span>
          <Button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            size='sm'
            variant='outline'
          >
            {t('service.common.previous')}
          </Button>
          <Button
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
            size='sm'
            variant='outline'
          >
            {t('service.common.next')}
          </Button>
        </div>
      ) : null}
      <TicketCreateDialog
        client={client}
        onCreated={() => list.reload()}
        onOpenChange={setCreating}
        open={creating}
      />
      {/* A ticket detail is a destination that covers this list. */}
      <Outlet />
    </PageContainer>
  );
}
