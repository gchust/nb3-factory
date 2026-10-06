import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { EyeIcon, PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { createTicket, errorKey, fetchTickets } from './api.js';
import { TicketCategoryBadge, TicketStatusBadge } from './ticket-badges.js';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  ticketResource,
  type TicketDto,
  type TicketStatus,
} from './types.js';

type StatusFilter = 'all' | TicketStatus;

const STATUS_FILTERS: readonly StatusFilter[] = ['all', ...TICKET_STATUSES];

/**
 * The repair-ticket list.
 *
 * Every signed-in user with the page grant opens it: an employee sees the
 * tickets they submitted, a handler sees every ticket. The record scope is
 * decided by the server, so the page renders whatever the list endpoint
 * returns and never filters by ownership itself. The child route at
 * `:ticketId` renders the detail drawer through the `Outlet` at the end.
 */
export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [tickets, setTickets] = useState<readonly TicketDto[]>([]);
  const [loadedStatus, setLoadedStatus] = useState<StatusFilter | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // The list is stale until the matching request lands; status is part of the
  // key so switching the filter shows the loading state instead of the previous tab.
  const loading = loadedStatus !== status;

  const { can: canCreate } = useCan({
    resource: ticketResource(),
    action: 'create',
  });

  /** Ask the list to refetch; used after a create and by the detail drawer after a state change. */
  const reload = useCallback((): void => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await fetchTickets(
          api,
          status === 'all' ? undefined : status,
        );
        if (active) {
          setTickets(data);
        }
      } catch (error) {
        if (active) {
          setTickets([]);
          toaster.show({
            type: 'error',
            title: t('tickets.loadFailed'),
            description: t(errorKey(error)),
          });
        }
      } finally {
        if (active) {
          setLoadedStatus(status);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [api, status, t, toaster, reloadToken]);

  const columns = useMemo<ColumnDef<TicketDto, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.field.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={{ pathname: row.original.id, search: location.search }}
            className='font-medium hover:underline'
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: t('tickets.field.category'),
        cell: ({ row }) => (
          <TicketCategoryBadge category={row.original.category} />
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.field.status')}
          />
        ),
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        id: 'submitter',
        accessorFn: (ticket) => ticket.submitterName,
        header: t('tickets.field.submitter'),
        cell: ({ row }) => row.original.submitterName,
      },
      {
        id: 'handler',
        header: t('tickets.field.handler'),
        cell: ({ row }) =>
          row.original.handlerName ?? (
            <span className='text-muted-foreground'>
              {t('tickets.unassigned')}
            </span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.field.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div
            className='text-right'
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                void navigate({
                  pathname: row.original.id,
                  search: location.search,
                });
              }}
            >
              <EyeIcon data-icon='inline-start' />
              {t('tickets.action.view')}
            </Button>
          </div>
        ),
      },
    ],
    [location.search, navigate, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('tickets.newTicket')}
            </Button>
          ) : undefined
        }
      />

      <div className='space-y-4'>
        <Tabs
          value={status}
          onValueChange={(value) => setStatus(value as StatusFilter)}
        >
          <TabsList variant='line'>
            {STATUS_FILTERS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {value === 'all'
                  ? t('tickets.filter.all')
                  : t(`tickets.status.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <Loading className='py-24' />
        ) : (
          <DataTable
            columns={columns}
            data={[...tickets]}
            pageSize={10}
            getRowId={(ticket) => ticket.id}
            emptyMessage={t('tickets.empty')}
            onRowClick={(row) => {
              void navigate({
                pathname: row.original.id,
                search: location.search,
              });
            }}
          />
        )}
      </div>

      <CreateTicketDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          reload();
        }}
      />

      <Outlet context={{ reload }} />
    </PageContainer>
  );
}

/** A localized date and time; the client formats for the reader, the server stores UTC. */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface CreateTicketDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => void;
}

/** The submit form. The server owns validation; the dialog only prevents an empty title here. */
function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTicketDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawTitle = data.get('title');
    const rawCategory = data.get('category');
    const rawDescription = data.get('description');
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const category =
      typeof rawCategory === 'string' && rawCategory
        ? rawCategory
        : TICKET_CATEGORIES[0];
    const description =
      typeof rawDescription === 'string' ? rawDescription.trim() : '';
    if (!title) {
      return;
    }
    setSubmitting(true);
    try {
      await createTicket(api, {
        title,
        category,
        description: description || null,
      });
      toaster.show({ type: 'success', title: t('tickets.created') });
      onCreated();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('tickets.actionFailed'),
        description: t(errorKey(error)),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('tickets.newTicket')}</DialogTitle>
            <DialogDescription>
              {t('tickets.newTicketDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='ticket-title'>
                {t('tickets.field.title')}
              </FieldLabel>
              <Input id='ticket-title' name='title' required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-category'>
                {t('tickets.field.category')}
              </FieldLabel>
              <Select name='category' defaultValue={TICKET_CATEGORIES[0]}>
                <SelectTrigger id='ticket-category' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`tickets.category.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-description'>
                {t('tickets.field.description')}
              </FieldLabel>
              <Textarea
                id='ticket-description'
                name='description'
                rows={4}
                maxLength={5000}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('tickets.action.cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {t('tickets.action.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
