import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useUrlSearch } from '@/hooks/use-url-search';

import type { Contact, ContactListOutletContext, CrmList } from '../types.js';

const PAGE_SIZE = 100;

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { search, text, inputProps, clear } = useUrlSearch();
  const hasFilters = text.trim() !== '';

  function clearFilters(): void {
    clear();
    searchRef.current?.focus();
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Contact[];
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, reloadCount]);
    api
      .request<CrmList<Contact>>({
        path: 'contacts',
        query: { q: search || undefined, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, filtered: search !== '' });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, search, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<ContactListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('contacts.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'contact',
        header: t('contacts.fields.contact'),
        cell: ({ row }) =>
          row.original.contact ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'customerName',
        header: t('contacts.fields.customer'),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('contacts.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => <span className='sr-only'>{t('actions.openMenu')}</span>,
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('actions.openMenu')}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    render={
                      <Link
                        to={{
                          pathname: `edit/${encodeURIComponent(row.original.id)}`,
                          search: location.search,
                        }}
                      />
                    }
                  >
                    <PencilIcon />
                    {t('actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [collator, dateFormat, location.search, t],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('contacts.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('crm.error.forbidden')
            : t('contacts.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                searchRef.current?.focus();
              }}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('contacts.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('contacts.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('contacts.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('contacts.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('contacts.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('contacts.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            {...inputProps}
            placeholder={t('contacts.search.placeholder')}
            aria-label={t('contacts.search.label')}
          />
        </InputGroup>
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('contacts.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
