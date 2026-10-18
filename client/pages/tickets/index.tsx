import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  FilePlus2Icon,
  SearchIcon,
  TicketIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
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
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { TicketPriorityBadge, TicketStatusBadge } from './ticket-badges.js';
import {
  isTicketState,
  TICKET_STATES,
  type Ticket,
  type TicketsOutletContext,
} from './types.js';

const PAGE_SIZE = 100;

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status = isTicketState(statusParam) ? statusParam : undefined;
  const search = searchParams.get('q') ?? '';
  const [text, setText] = useState(search);

  // `Select.Value` renders the raw value unless the root is told the labels, which would show `all` and the internal
  // state ids instead of the translated filter names.
  const statusItems = useMemo(
    () => [
      { value: 'all', label: t('helpdesk.filters.allStatuses') },
      ...TICKET_STATES.map((state) => ({
        value: state,
        label: t(`helpdesk.status.${state}`),
      })),
    ],
    [t],
  );

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Ticket[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, status ?? null, reloadCount]);
    api
      .request<{ data: Ticket[]; meta: { total: number } }>({
        path: 'tickets',
        query: { q: search || undefined, status, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, rows: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  function updateParam(key: string, value: string | null): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  function submitSearch(event: FormEvent): void {
    event.preventDefault();
    updateParam('q', text.trim() || null);
  }

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('helpdesk.tickets.title')}
        description={t('helpdesk.tickets.description')}
        actions={
          <Link className={buttonVariants()} to='new'>
            <FilePlus2Icon />
            {t('helpdesk.tickets.new')}
          </Link>
        }
      />
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <form className='relative grow' onSubmit={submitSearch} role='search'>
          <SearchIcon
            aria-hidden
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
          />
          <Input
            aria-label={t('helpdesk.tickets.search')}
            className='pl-8'
            placeholder={t('helpdesk.tickets.search')}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </form>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={(value) =>
            updateParam('status', value === 'all' ? null : value)
          }
        >
          <SelectTrigger aria-label={t('helpdesk.filters.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('helpdesk.filters.allStatuses')}
            </SelectItem>
            {TICKET_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {t(`helpdesk.status.${state}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : rows === undefined ? (
        <TableSkeleton label={t('status.loading')} />
      ) : rows.length === 0 ? (
        <Empty className='min-h-48 border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <TicketIcon />
            </EmptyMedia>
            <EmptyTitle>{t('helpdesk.tickets.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('helpdesk.tickets.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TicketTable rows={rows} loading={loading} />
      )}

      <Outlet context={{ reload } satisfies TicketsOutletContext} />
    </PageContainer>
  );
}

function TicketTable({
  rows,
  loading,
}: {
  readonly rows: readonly Ticket[];
  readonly loading: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  return (
    <div className='flex flex-col gap-2'>
      {loading ? (
        <span className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner className='size-3.5' />
          {t('status.loading')}
        </span>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('helpdesk.fields.title')}</TableHead>
            <TableHead>{t('helpdesk.fields.status')}</TableHead>
            <TableHead>{t('helpdesk.fields.priority')}</TableHead>
            <TableHead>{t('helpdesk.fields.reporter')}</TableHead>
            <TableHead>{t('helpdesk.fields.assignee')}</TableHead>
            <TableHead>{t('helpdesk.fields.updatedAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell className='max-w-72 truncate'>
                <Link className='font-medium hover:underline' to={ticket.id}>
                  {ticket.title}
                </Link>
              </TableCell>
              <TableCell>
                <TicketStatusBadge status={ticket.status} />
              </TableCell>
              <TableCell>
                <TicketPriorityBadge priority={ticket.priority} />
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {ticket.reporterName}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {ticket.assigneeName ?? t('helpdesk.unassigned')}
              </TableCell>
              <TableCell className='whitespace-nowrap text-muted-foreground'>
                {dateFormat.format(new Date(ticket.updatedAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      aria-label={label}
      className='flex min-h-48 items-center justify-center'
      role='status'
    >
      <Spinner className='size-6' />
    </div>
  );
}

function LoadError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const status = error instanceof ApiClientError ? error.status : undefined;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('helpdesk.tickets.error.title')}</AlertTitle>
      <AlertDescription>
        {status === 401
          ? t('helpdesk.tickets.error.unauthorized')
          : status === 403
            ? t('helpdesk.tickets.error.forbidden')
            : t('helpdesk.tickets.error.requestFailed')}
      </AlertDescription>
      {status === 401 || status === 403 ? null : (
        <AlertAction>
          <Button size='sm' variant='outline' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
