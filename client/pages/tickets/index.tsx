import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlarmClockIcon, PlusIcon, SearchIcon, TicketIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RequestFailed } from '#components/request-failed';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
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
import { Spinner } from '#components/ui/spinner';
import { useUrlSearch } from '#hooks/use-url-search';
import {
  TICKET_STATES,
  useServiceDeskMe,
  useTicketList,
  type TicketListItem,
  type TicketListQuery,
  type TicketState,
} from '#hooks/service-desk';

import { useDateTime } from '#hooks/use-date-time';

import { TicketStateBadge, UrgencyBadge } from './shared.js';
import type { TicketReloadOutletContext } from './types.js';

const SCOPES = ['mine', 'assigned', 'all'] as const;
type Scope = (typeof SCOPES)[number];

/** The endpoint caps a page at 100 records; the list asks for that and tells the caller when more match. */
const PAGE_SIZE = 100;

function readScope(value: string | null): Scope | undefined {
  return SCOPES.some((scope) => scope === value) ? (value as Scope) : undefined;
}

function readState(value: string | null): TicketState | undefined {
  return TICKET_STATES.some((state) => state === value)
    ? (value as TicketState)
    : undefined;
}

/**
 * The ticket list: everything the caller may see, filtered by scope, state and overdue through the URL, with the raise
 * action in the header. A row opens the record's own page, which the `:ticketId` child route declares.
 */
export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const me = useServiceDeskMe();

  // The search term lives in the URL behind a search box that keeps its own text, so typing, input methods, back and
  // forward all stay in step. The filters are read from the same parameters.
  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const scope = readScope(searchParams.get('scope'));
  const status = readState(searchParams.get('status'));
  const overdue = searchParams.get('overdue') === 'true';

  const canPickAll = me.data?.helpdesk ?? false;
  // The scope selector is a view choice, not a filter: "all" is the service desk's default and "mine" everyone else's.
  const effectiveScope: Scope = canPickAll
    ? (scope ?? 'all')
    : (scope ?? 'mine');
  const hasFilters = text.trim() !== '' || status !== undefined || overdue;

  const query: TicketListQuery = useMemo(
    () => ({
      scope: effectiveScope,
      status,
      overdue: overdue || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
    }),
    [effectiveScope, status, overdue, search],
  );

  // Wait for `/me` before the first list request: the scope selector's default depends on it, and asking twice for
  // the same list only to throw one result away wastes a request per load.
  const list = useTicketList(query, me.data !== undefined);
  const format = useDateTime();

  function changeScope(value: string | null): void {
    if (!value) return;
    updateParams((params) => {
      if (value === (canPickAll ? 'all' : 'mine')) params.delete('scope');
      else params.set('scope', value);
    });
  }

  function clearFilters(): void {
    clear((params) => {
      params.delete('status');
      params.delete('overdue');
    });
  }

  // Keep the context stable: the create dialog only reads `reload`, but an unstable object would make its effects run
  // again on every render of the list.
  const outletContext: TicketReloadOutletContext = useMemo(
    () => ({ reload: list.reload }),
    [list.reload],
  );

  const rows = list.data?.records;
  const rowsFiltered = list.data?.filtered ?? false;
  const total = list.data?.total ?? 0;

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (list.error) {
    const forbidden =
      list.error instanceof ApiClientError && list.error.status === 403;
    content = (
      <RequestFailed
        error={list.error}
        title={t('serviceDesk.error.title')}
        description={
          forbidden
            ? t('serviceDesk.error.forbidden')
            : t('serviceDesk.error.requestFailed')
        }
        onRetry={forbidden ? undefined : list.reload}
      />
    );
  } else if (rows === undefined) {
    content = <Loading />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TicketIcon />
          </EmptyMedia>
          <EmptyTitle>{t('serviceDesk.tickets.empty')}</EmptyTitle>
          <EmptyDescription>
            {t('serviceDesk.tickets.emptyDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* While the list is empty the primary action is only here; the page header leaves it out (guideline L7). */}
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('serviceDesk.tickets.new')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else if (rows.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>{t('serviceDesk.tickets.noResults')}</EmptyTitle>
          <EmptyDescription>
            {t('serviceDesk.tickets.noResultsDescription')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant='link' onClick={clearFilters}>
            {t('serviceDesk.tickets.clearFilters')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <ul className='flex flex-col gap-2'>
        {rows.map((ticket) => (
          <li key={ticket.id}>
            <Link
              to={{ pathname: String(ticket.id), search: location.search }}
              className='block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
            >
              <TicketRow ticket={ticket} formatDate={format} />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('serviceDesk.tickets.title')}
        description={t('serviceDesk.tickets.description')}
        actions={
          // Decided from loaded data: no action while loading, and none while the empty state carries it (guideline L7).
          rows !== undefined && (rows.length > 0 || rowsFiltered) ? (
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('serviceDesk.tickets.new')}
            </Button>
          ) : null
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            {...inputProps}
            type='search'
            placeholder={t('serviceDesk.tickets.searchPlaceholder')}
            aria-label={t('serviceDesk.tickets.searchLabel')}
          />
        </InputGroup>

        <Select value={effectiveScope} onValueChange={changeScope}>
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('serviceDesk.tickets.scopeLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPES.filter((value) => value !== 'all' || canPickAll).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {t(`serviceDesk.scope.${value}`)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          value={status ?? 'any'}
          onValueChange={(next: string | null) =>
            updateParams((params) => {
              if (!next || next === 'any') params.delete('status');
              else params.set('status', next);
            })
          }
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('serviceDesk.tickets.statusLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='any'>
              {t('serviceDesk.tickets.anyStatus')}
            </SelectItem>
            {TICKET_STATES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`serviceDesk.state.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={overdue ? 'default' : 'outline'}
          aria-pressed={overdue}
          onClick={() =>
            updateParams((params) => {
              if (overdue) params.delete('overdue');
              else params.set('overdue', 'true');
            })
          }
        >
          <AlarmClockIcon data-icon='inline-start' />
          {t('serviceDesk.tickets.overdueOnly')}
        </Button>

        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('serviceDesk.tickets.clearFilters')}
          </Button>
        ) : null}

        {/* Reloading keeps the old rows and shows only a small Spinner here. */}
        {list.isLoading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>

      {content}

      {rows !== undefined && rows.length > 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('serviceDesk.tickets.count', { count: total })}
        </p>
      ) : null}

      {/* The create dialog renders here and refreshes the list through context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TicketRow({
  ticket,
  formatDate,
}: {
  readonly ticket: TicketListItem;
  readonly formatDate: (value: string | null | undefined) => string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card className='transition-shadow hover:shadow-md motion-reduce:transition-none'>
      <CardContent className='flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className='flex min-w-0 items-center gap-2'>
            <span className='text-xs text-muted-foreground tabular-nums'>
              {t('serviceDesk.tickets.number', { id: ticket.id })}
            </span>
            <span className='truncate font-medium'>{ticket.title}</span>
            {ticket.overdue ? (
              <StatusBadge tone='warning'>
                {t('serviceDesk.tickets.overdue')}
              </StatusBadge>
            ) : null}
          </span>
          <span className='truncate text-sm text-muted-foreground'>
            {t('serviceDesk.tickets.raisedBy', {
              name: ticket.requesterName,
            })}
            {ticket.assigneeName
              ? ` · ${t('serviceDesk.tickets.assignedTo', { name: ticket.assigneeName })}`
              : ''}
            {` · ${formatDate(ticket.createdAt)}`}
          </span>
        </div>
        <span className='flex shrink-0 items-center gap-2'>
          <UrgencyBadge urgency={ticket.urgency} />
          <TicketStateBadge state={ticket.status} />
        </span>
      </CardContent>
    </Card>
  );
}
