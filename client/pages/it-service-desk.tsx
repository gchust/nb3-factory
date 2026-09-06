import {
  appApiClientToken,
  type AppClient,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router';

import {
  TicketCategoryBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../components/ticket-badges';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '../components/ui';
import {
  createTicket,
  describeRequestError,
  listTickets,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketListResult,
  type TicketPriority,
  type TicketStatus,
} from '../lib/it-service-desk-api.js';

const PAGE_SIZE = 10;

type StatusFilter = TicketStatus | 'all';
type PriorityFilter = TicketPriority | 'all';
type CategoryFilter = TicketCategory | 'all';

export default function ItServiceDeskListPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const navigate = useNavigate();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  // Keep the search box in sync with the DOM even when an input event bypasses
  // React's synthetic onChange (for example a programmatic clear that sets the
  // value and dispatches a native event without going through React). Without
  // this, clearing the box would leave the list filtered on the stale term.
  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) {
      return;
    }
    const handleInput = () => setSearchInput(input.value);
    input.addEventListener('input', handleInput);
    return () => input.removeEventListener('input', handleInput);
  }, []);

  const [result, setResult] = useState<TicketListResult>();
  const [error, setError] = useState<string>();
  // Derived: the first request has neither a result nor an error yet, so the
  // initial render shows the spinner. Later requests keep the previous list
  // visible while the next page loads, which avoids a flicker on every filter
  // change. State is only ever written from async callbacks, never from the
  // effect body itself.
  const loading = result === undefined && error === undefined;

  // Debounce free-text search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ status, priority, category, search, page, pageSize: PAGE_SIZE }),
    [status, priority, category, search, page],
  );

  useEffect(() => {
    let active = true;
    void listTickets(appClient, filters)
      .then((next) => {
        if (active) {
          setResult(next);
          setError(undefined);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setResult(undefined);
          setError(
            describeRequestError(requestError) ??
              t('itServiceDesk.loadError', {
                defaultValue: 'Unable to load tickets.',
              }),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [appClient, filters, reloadToken, t]);

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
  const hasFilters =
    status !== 'all' ||
    priority !== 'all' ||
    category !== 'all' ||
    search.trim() !== '';

  function resetPageAndReload() {
    setPage(1);
    setReloadToken((value) => value + 1);
  }

  function clearFilters() {
    setStatus('all');
    setPriority('all');
    setCategory('all');
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  return (
    <section className='mx-auto w-full max-w-6xl px-6 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('itServiceDesk.title')}
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('itServiceDesk.subtitle')}
          </p>
        </div>
        <NewTicketDialog appClient={appClient} onCreated={resetPageAndReload} />
      </div>

      <div className='mb-4 flex flex-wrap items-end gap-3'>
        <FilterSelect
          label={t('itServiceDesk.filterStatus')}
          value={status}
          onChange={(value) => {
            setStatus((value ?? 'all') as StatusFilter);
            setPage(1);
          }}
          options={[
            { value: 'all', label: t('itServiceDesk.filterAll') },
            { value: 'pending', label: t('itServiceDesk.statuses.pending') },
            {
              value: 'inProgress',
              label: t('itServiceDesk.statuses.inProgress'),
            },
            { value: 'resolved', label: t('itServiceDesk.statuses.resolved') },
            { value: 'closed', label: t('itServiceDesk.statuses.closed') },
          ]}
        />
        <FilterSelect
          label={t('itServiceDesk.filterPriority')}
          value={priority}
          onChange={(value) => {
            setPriority((value ?? 'all') as PriorityFilter);
            setPage(1);
          }}
          options={[
            { value: 'all', label: t('itServiceDesk.filterAll') },
            { value: 'low', label: t('itServiceDesk.priorities.low') },
            { value: 'normal', label: t('itServiceDesk.priorities.normal') },
            { value: 'high', label: t('itServiceDesk.priorities.high') },
            { value: 'urgent', label: t('itServiceDesk.priorities.urgent') },
          ]}
        />
        <FilterSelect
          label={t('itServiceDesk.filterCategory')}
          value={category}
          onChange={(value) => {
            setCategory((value ?? 'all') as CategoryFilter);
            setPage(1);
          }}
          options={[
            { value: 'all', label: t('itServiceDesk.filterAll') },
            {
              value: 'hardware',
              label: t('itServiceDesk.categories.hardware'),
            },
            {
              value: 'software',
              label: t('itServiceDesk.categories.software'),
            },
            { value: 'network', label: t('itServiceDesk.categories.network') },
            { value: 'account', label: t('itServiceDesk.categories.account') },
            { value: 'other', label: t('itServiceDesk.categories.other') },
          ]}
        />
        <div className='flex flex-col gap-1.5'>
          <Label>{t('itServiceDesk.searchLabel')}</Label>
          <Input
            ref={searchInputRef}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              // Commit the search immediately on Enter, reading the live DOM
              // value so a programmatically cleared box still resets the list.
              if (event.key === 'Enter') {
                setSearch(searchInputRef.current?.value ?? searchInput);
                setPage(1);
              }
            }}
            placeholder={t('itServiceDesk.searchPlaceholder')}
            className='w-64'
          />
        </div>
        {hasFilters ? (
          <Button variant='outline' onClick={clearFilters}>
            {t('itServiceDesk.clearFilters')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
          {error}
        </div>
      ) : null}

      {loading && !result ? (
        <div className='flex justify-center py-16'>
          <Spinner className='size-6' />
        </div>
      ) : result && result.items.length === 0 ? (
        <div className='rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground'>
          {t('itServiceDesk.empty')}
        </div>
      ) : result ? (
        <div className='overflow-hidden rounded-xl border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/40'>
                <TableHead className='w-16 pl-4'>
                  {t('itServiceDesk.columns.id')}
                </TableHead>
                <TableHead>{t('itServiceDesk.columns.title')}</TableHead>
                <TableHead>{t('itServiceDesk.columns.category')}</TableHead>
                <TableHead>{t('itServiceDesk.columns.priority')}</TableHead>
                <TableHead>{t('itServiceDesk.columns.status')}</TableHead>
                <TableHead>{t('itServiceDesk.columns.assignee')}</TableHead>
                <TableHead>{t('itServiceDesk.columns.createdAt')}</TableHead>
                <TableHead className='pr-4 text-right'>
                  {t('itServiceDesk.columns.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className='cursor-pointer'
                  onClick={() => void navigate(`/it-service-desk/${ticket.id}`)}
                >
                  <TableCell className='pl-4 font-mono text-xs text-muted-foreground'>
                    #{ticket.id}
                  </TableCell>
                  <TableCell className='max-w-80 truncate font-medium'>
                    {ticket.title}
                  </TableCell>
                  <TableCell>
                    <TicketCategoryBadge category={ticket.category} />
                  </TableCell>
                  <TableCell>
                    <TicketPriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {ticket.assigneeName ??
                      t('itServiceDesk.detail.unassigned')}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {formatDate(ticket.createdAt)}
                  </TableCell>
                  <TableCell className='pr-4 text-right'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigate(`/it-service-desk/${ticket.id}`);
                      }}
                    >
                      {t('itServiceDesk.view')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className='flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm'>
            <span className='text-muted-foreground'>
              {t('itServiceDesk.totalTickets', { total: result.total })}
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('itServiceDesk.previous')}
              </Button>
              <span className='tabular-nums text-muted-foreground'>
                {t('itServiceDesk.pageInfo', {
                  page,
                  pages: totalPages,
                })}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('itServiceDesk.next')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
  options: readonly FilterOption[];
}): ReactElement {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className='w-36'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewTicketDialog({
  appClient,
  onCreated,
}: {
  appClient: AppClient;
  onCreated: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('hardware');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();

  function openDialog() {
    setTitle('');
    setDescription('');
    setCategory('hardware');
    setPriority('normal');
    setFormError(undefined);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === '' || description.trim() === '') {
      setFormError(
        t('itServiceDesk.form.errors.required', {
          defaultValue: 'Please fill in the required fields.',
        }),
      );
      return;
    }
    setSubmitting(true);
    setFormError(undefined);
    try {
      await createTicket(appClient, {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      });
      setOpen(false);
      onCreated();
    } catch (requestError: unknown) {
      setFormError(
        describeRequestError(requestError) ??
          t('itServiceDesk.form.errors.failed', {
            defaultValue: 'The request failed.',
          }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={openDialog} disabled={open}>
        <PlusIcon />
        {t('itServiceDesk.newTicket')}
      </Button>
      <DialogContent>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>{t('itServiceDesk.form.createTitle')}</DialogTitle>
            <DialogDescription>
              {t('itServiceDesk.form.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='it-ticket-title'>
                {t('itServiceDesk.form.titleLabel')}
              </Label>
              <Input
                id='it-ticket-title'
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('itServiceDesk.form.titlePlaceholder')}
                required
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='it-ticket-description'>
                {t('itServiceDesk.form.descriptionLabel')}
              </Label>
              <Textarea
                id='it-ticket-description'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('itServiceDesk.form.descriptionPlaceholder')}
                rows={4}
                required
              />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='grid gap-1.5'>
                <Label>{t('itServiceDesk.form.categoryLabel')}</Label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value ?? 'hardware')}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`itServiceDesk.categories.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='grid gap-1.5'>
                <Label>{t('itServiceDesk.form.priorityLabel')}</Label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value ?? 'normal')}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`itServiceDesk.priorities.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError ? (
              <p className='text-sm text-destructive'>{formError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {t('itServiceDesk.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
