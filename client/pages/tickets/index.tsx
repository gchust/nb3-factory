import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  EyeIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { useUrlSearch } from '#hooks/use-url-search';

import { fetchTickets } from './api.js';
import type { TicketsOutletContext } from './context.js';
import { formatDateTime } from './format.js';
import { serviceDeskRequirement } from './permissions.js';
import { TicketStatusBadge, TicketUrgencyBadge } from './status.js';
import {
  TICKET_STATUSES,
  TICKET_URGENCIES,
  type Ticket,
  type TicketStatus,
  type TicketUrgency,
} from './types.js';

// The endpoint caps a page at 100 records; this list sorts and pages in the browser, so it asks for the largest page.
const PAGE_SIZE = 100;

function isTicketStatus(value: string | null): value is TicketStatus {
  return TICKET_STATUSES.some((status) => status === value);
}

function isTicketUrgency(value: string | null): value is TicketUrgency {
  return TICKET_URGENCIES.some((urgency) => urgency === value);
}

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { can: canCreate } = useCan(serviceDeskRequirement('create'));

  // The search term and the two filters live in the URL, so a link into a row keeps them and back/forward work.
  const { searchParams, search, inputProps, updateParams } = useUrlSearch({
    resetParams: ['page'],
  });
  const statusParam = searchParams.get('status');
  const urgencyParam = searchParams.get('urgency');
  const status = isTicketStatus(statusParam) ? statusParam : undefined;
  const urgency = isTicketUrgency(urgencyParam) ? urgencyParam : undefined;

  // The result carries the request key that produced it, so "loading" is derived instead of set from an effect.
  const [result, setResult] = useState<{
    readonly key: string;
    readonly items: readonly Ticket[];
    readonly total: number;
    readonly error?: Error;
  }>({ key: '', items: [], total: 0 });
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);
  const requestKey = JSON.stringify([status, urgency, search, reloadToken]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    fetchTickets(api, {
      page: 1,
      pageSize: PAGE_SIZE,
      status,
      urgency,
      keyword: search || undefined,
    }).then(
      (page) => {
        if (requestId !== requestRef.current) return;
        setResult({ key: requestKey, items: page.items, total: page.total });
      },
      (cause: unknown) => {
        if (requestId !== requestRef.current) return;
        setResult({
          key: requestKey,
          items: [],
          total: 0,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      },
    );
  }, [api, requestKey, status, urgency, search]);

  const loading = result.key !== requestKey;
  const error = loading ? undefined : result.error;
  const items = loading ? [] : result.items;
  const total = loading ? 0 : result.total;

  // A stable refresh for the overlays, so the create dialog and the drawer can reload the list without remounting it.
  const reload = useCallback(
    () => setReloadToken((token) => token + 1),
    [setReloadToken],
  );
  const outletContext = useMemo<TicketsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const openTicket = useCallback(
    (ticket: Ticket): void => {
      void navigate({
        pathname: `/tickets/${ticket.id}`,
        search: location.search,
      });
    },
    [navigate, location.search],
  );

  const columns = useMemo<ColumnDef<Ticket, unknown>[]>(
    () => [
      {
        accessorKey: 'id',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.id')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums text-muted-foreground'>
            #{row.original.id}
          </span>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.title')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.status')}
          />
        ),
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'urgency',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.urgency')}
          />
        ),
        cell: ({ row }) => (
          <TicketUrgencyBadge urgency={row.original.urgency} />
        ),
      },
      {
        accessorKey: 'assigneeName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.assignee')}
          />
        ),
        cell: ({ row }) =>
          row.original.assigneeName ?? (
            <span className='text-muted-foreground'>
              {t('tickets.unassigned')}
            </span>
          ),
      },
      {
        accessorKey: 'requesterName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.requester')}
          />
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.column.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatDateTime(row.original.createdAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('tickets.column.actions')}</span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <div className='text-right'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('tickets.row.openMenu')}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => openTicket(row.original)}>
                  <EyeIcon />
                  {t('tickets.row.view')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    // `locale` and `t` change the rendered words; `openTicket` closes over the router's state.
    [t, locale, openTicket],
  );

  const hasFilters = Boolean(search || status || urgency);

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          canCreate ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon />
              {t('tickets.create.action')}
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('tickets.list.error.title')}</AlertTitle>
          <AlertDescription>
            {error instanceof ApiClientError && error.status === 403
              ? t('tickets.list.error.forbidden')
              : t('tickets.list.error.description')}
          </AlertDescription>
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setReloadToken((token) => token + 1)}
            >
              {t('actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={items}
        getRowId={(ticket) => String(ticket.id)}
        loading={loading}
        showPagination={items.length > 0}
        onRowClick={openTicket}
        toolbar={
          <div className='flex w-full flex-wrap items-center gap-2'>
            <InputGroup className='w-full sm:w-64'>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                {...inputProps}
                placeholder={t('tickets.search.placeholder')}
                aria-label={t('tickets.search.label')}
              />
            </InputGroup>
            <Select
              value={status ?? 'all'}
              onValueChange={(value: string | null) =>
                updateParams((params) => {
                  if (!value || value === 'all') params.delete('status');
                  else params.set('status', value);
                })
              }
            >
              <SelectTrigger
                className='w-40'
                aria-label={t('tickets.filter.status')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('tickets.filter.allStatuses')}
                </SelectItem>
                {TICKET_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`tickets.status.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={urgency ?? 'all'}
              onValueChange={(value: string | null) =>
                updateParams((params) => {
                  if (!value || value === 'all') params.delete('urgency');
                  else params.set('urgency', value);
                })
              }
            >
              <SelectTrigger
                className='w-40'
                aria-label={t('tickets.filter.urgency')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('tickets.filter.allUrgencies')}
                </SelectItem>
                {TICKET_URGENCIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`tickets.urgency.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loading ? (
              <span className='ml-auto text-sm text-muted-foreground'>
                {t('tickets.list.count', { count: total })}
              </span>
            ) : null}
          </div>
        }
        emptyTitle={
          hasFilters ? t('tickets.list.emptyFiltered') : t('tickets.list.empty')
        }
        emptyDescription={
          hasFilters
            ? t('tickets.list.emptyFilteredHint')
            : t('tickets.list.emptyHint')
        }
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
