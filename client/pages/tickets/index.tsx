import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardListIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import {
  TICKET_STATUSES,
  TICKET_URGENCIES,
  useTicketRequest,
  type PageBody,
  type Ticket,
} from './api.js';
import { ServiceDeskOverview } from './overview.js';
import {
  TicketError,
  TicketLoading,
  TicketStatusBadge,
  TicketUrgencyBadge,
} from './shared.js';
import { useTicketLabels } from './hooks.js';

/**
 * The ticket list: what this person may see, filtered the way they asked.
 *
 * The filters live in the URL, so a link to `?status=submitted` or `?overdue=1` opens the same list, and the back
 * button restores the previous one. The server decides which tickets exist for this caller — an employee's list holds
 * only their own, an engineer's only the ones assigned to them — so the page never filters for visibility itself.
 */
export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [keywordDraft, setKeywordDraft] = useState<{
    key: string;
    value: string;
  }>();
  const keyword =
    keywordDraft?.key === location.key
      ? keywordDraft.value
      : (params.get('q') ?? '');
  const setKeyword = (value: string) =>
    setKeywordDraft({ key: location.key, value });
  const [composing, setComposing] = useState(false);

  const status = params.get('status') ?? 'all';
  const urgency = params.get('urgency') ?? 'all';
  const overdue = params.get('overdue') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [20, 50, 100].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 20;

  const update = (key: string, value: string) => {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (value && value !== 'all') next.set(key, value);
        else next.delete(key);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (composing || keyword === (params.get('q') ?? '')) return;
    const timer = setTimeout(() => {
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (keyword) next.set('q', keyword);
          else next.delete('q');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, composing, params, setParams]);

  const request = useTicketRequest<PageBody<Ticket>>(
    'tickets',
    {
      ...(status !== 'all' ? { status } : {}),
      ...(urgency !== 'all' ? { urgency } : {}),
      ...(params.get('q') ? { q: params.get('q') as string } : {}),
      ...(overdue ? { overdue: '1' } : {}),
      page,
      pageSize,
    },
    true,
  );

  const canCreate = useCan({
    resource: { type: 'composite', id: 'tickets' },
    action: 'create',
  }).can;
  const filtered =
    Boolean(params.get('q')) ||
    status !== 'all' ||
    urgency !== 'all' ||
    overdue;

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('tickets.title')} />
        ),
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            className='font-medium text-primary hover:underline'
            to={`${row.original.id}${location.search}`}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'status',
        header: t('tickets.statusLabel'),
        enableSorting: false,
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        id: 'urgency',
        header: t('tickets.urgencyLabel'),
        enableSorting: false,
        cell: ({ row }) => (
          <TicketUrgencyBadge urgency={row.original.urgency} />
        ),
      },
      {
        id: 'assignee',
        header: t('tickets.assignee'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className='block max-w-48 truncate'>
            {row.original.assigneeName ?? t('tickets.unassigned')}
          </span>
        ),
      },
      {
        id: 'reporter',
        header: t('tickets.reporter'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className='block max-w-48 truncate'>
            {row.original.reporterName}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: t('tickets.createdAt'),
        enableSorting: false,
        cell: ({ row }) => labels.date(row.original.createdAt),
      },
    ],
    [t, labels, location.search],
  );

  const rows = request.data?.data ?? [];
  const create = canCreate ? (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      <PlusIcon />
      {t('tickets.new')}
    </Button>
  ) : null;

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('tickets.title')}
          description={t('tickets.description')}
          actions={rows.length || filtered ? create : undefined}
        />
        <ServiceDeskOverview />
        <div className='flex flex-wrap items-center gap-3'>
          <Input
            className='w-full sm:max-w-xs'
            value={keyword}
            aria-label={t('tickets.search')}
            placeholder={t('tickets.search')}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select
            items={[
              { value: 'all', label: t('tickets.allStatuses') },
              ...TICKET_STATUSES.map((value) => ({
                value,
                label: labels.status(value),
              })),
            ]}
            value={status}
            onValueChange={(value) => update('status', String(value))}
          >
            <SelectTrigger aria-label={t('tickets.statusLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('tickets.allStatuses')}</SelectItem>
              {TICKET_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {labels.status(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={[
              { value: 'all', label: t('tickets.allUrgencies') },
              ...TICKET_URGENCIES.map((value) => ({
                value,
                label: labels.urgency(value),
              })),
            ]}
            value={urgency}
            onValueChange={(value) => update('urgency', String(value))}
          >
            <SelectTrigger aria-label={t('tickets.urgencyLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('tickets.allUrgencies')}</SelectItem>
              {TICKET_URGENCIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {labels.urgency(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {overdue && (
            <Button variant='ghost' onClick={() => update('overdue', '')}>
              {t('tickets.clearOverdue')}
            </Button>
          )}
          {filtered && (
            <Button
              variant='ghost'
              onClick={() => {
                setKeyword('');
                setParams({});
              }}
            >
              {t('tickets.clear')}
            </Button>
          )}
        </div>
        <TicketError error={request.error} retry={request.reload} />
        {request.loading && !request.data ? (
          <TicketLoading />
        ) : (
          !request.error &&
          (rows.length ? (
            <DataTable<Ticket>
              columns={columns}
              data={rows}
              getRowId={(row) => row.id}
              manualPagination
              rowCount={request.data?.meta.total ?? 0}
              paginationState={{ pageIndex: page - 1, pageSize }}
              onPaginationChange={(updater) => {
                const previous = { pageIndex: page - 1, pageSize };
                const next =
                  typeof updater === 'function' ? updater(previous) : updater;
                setParams((old) => {
                  const result = new URLSearchParams(old);
                  result.set('page', String(next.pageIndex + 1));
                  result.set('pageSize', String(next.pageSize));
                  return result;
                });
              }}
              pageSizeOptions={[20, 50, 100]}
              showSelectedCount={false}
              loading={request.loading}
            />
          ) : (
            <Empty className='min-h-48 border border-dashed'>
              <EmptyMedia variant='icon'>
                <ClipboardListIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t(filtered ? 'tickets.noResults' : 'tickets.noTickets')}
              </EmptyTitle>
              <EmptyDescription>
                {t(filtered ? 'tickets.clearHint' : 'tickets.description')}
              </EmptyDescription>
              <EmptyContent>
                {filtered ? (
                  <Button
                    variant='outline'
                    onClick={() => {
                      setKeyword('');
                      setParams({});
                    }}
                  >
                    {t('tickets.clear')}
                  </Button>
                ) : (
                  create
                )}
              </EmptyContent>
            </Empty>
          ))
        )}
        {request.data && (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.total', { count: request.data.meta.total })}
          </p>
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
