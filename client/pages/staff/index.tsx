import { ApiClientError, useApiClient } from '@nocobase/app-client';
import {
  UsersClient,
  type ManagedUser,
  type UsersOptions,
} from '@nocobase/app-plugin-users/client/user-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UserXIcon,
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

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
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
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useUrlSearch } from '#hooks/use-url-search';

import { roleScopeValues, type StaffOutletContext } from './types.js';
import { UserStatusDialog } from './user-status-dialog.js';

// Load the largest page the Users API offers and paginate in the browser, like the materials list.
const PAGE_SIZE = 100;

/** `/staff`: the administrator's list of people, their permission sets, and their account state. */
export default function StaffPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { search, text, inputProps, clear } = useUrlSearch();
  const hasFilters = text.trim() !== '';

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([search, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly users?: ManagedUser[];
    readonly options?: UsersOptions;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, reloadCount]);
    const client = new UsersClient(api);
    Promise.all([
      client.list({ q: search || undefined, pageSize: PAGE_SIZE }),
      client.options(),
    ]).then(
      ([page, options]) => {
        if (!controller.signal.aborted) {
          setResult({ key, users: [...page.items], options });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, search, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const users = result?.users;
  const options = result?.options;

  const [statusChange, setStatusChange] = useState<{
    readonly open: boolean;
    readonly user: ManagedUser | null;
  }>({ open: false, user: null });

  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const appScope = options?.roleScopes.find((scope) => scope.key === 'app');

  const columns = useMemo<ColumnDef<ManagedUser>[]>(
    () => [
      {
        accessorKey: 'name',
        enableHiding: false,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('staff.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <div className='flex flex-col'>
            <span className='font-medium'>{row.original.name}</span>
            {row.original.username ? (
              <span className='text-xs text-muted-foreground'>
                {row.original.username}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: t('staff.fields.email'),
        cell: ({ row }) => (
          <span className='min-w-0 wrap-anywhere'>{row.original.email}</span>
        ),
      },
      {
        id: 'permissionSets',
        enableSorting: false,
        header: t('staff.fields.permissionSets'),
        cell: ({ row }) => {
          const values = roleScopeValues(row.original.roleScopes.app);
          if (values.length === 0) {
            return <span className='text-muted-foreground'>—</span>;
          }
          return (
            <div className='flex flex-wrap gap-1'>
              {values.map((value) => (
                <Badge key={value} variant='secondary'>
                  {appScope?.options.find((option) => option.value === value)
                    ?.label ?? value}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: 'status',
        enableSorting: false,
        header: t('staff.fields.status'),
        cell: ({ row }) =>
          row.original.disabledAt ? (
            <StatusBadge tone='warning'>
              {t('staff.status.disabled')}
            </StatusBadge>
          ) : (
            <StatusBadge tone='success'>
              {t('staff.status.enabled')}
            </StatusBadge>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('staff.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('staff.actions.more', {
                      name: row.original.name,
                    })}
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
                          pathname: encodeURIComponent(row.original.id),
                          search: location.search,
                        }}
                      />
                    }
                  >
                    <ShieldCheckIcon />
                    {t('staff.actions.roles')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant={
                      row.original.disabledAt ? undefined : 'destructive'
                    }
                    onClick={() =>
                      setStatusChange({ open: true, user: row.original })
                    }
                  >
                    {row.original.disabledAt ? (
                      <UserCheckIcon />
                    ) : (
                      <UserXIcon />
                    )}
                    {row.original.disabledAt
                      ? t('staff.status.enable.action')
                      : t('staff.status.disable.action')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [appScope, collator, location.search, t],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('staff.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('staff.error.forbidden')
            : t('staff.error.requestFailed')}
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
  } else if (users === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (users.length === 0 && !hasFilters) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t('staff.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('staff.empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={users}
        getRowId={(row) => row.id}
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('staff.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={() => clear()}>
              {t('staff.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  const outletContext = useMemo<StaffOutletContext>(
    () => ({ users, options, reload }),
    [users, options, reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('staff.title')}
        description={t('staff.description')}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            {...inputProps}
            placeholder={t('staff.search.placeholder')}
            aria-label={t('staff.search.label')}
          />
        </InputGroup>
        {hasFilters ? (
          <Button variant='ghost' onClick={() => clear()}>
            {t('staff.filters.clear')}
          </Button>
        ) : null}
        {loading && users !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <UserStatusDialog
        open={statusChange.open}
        onOpenChange={(open) =>
          setStatusChange((current) => ({ ...current, open }))
        }
        user={statusChange.user}
        onChanged={() => {
          setStatusChange((current) => ({ ...current, open: false }));
          reload();
        }}
      />

      {/* The permission-set editor renders here and reads the loaded people and options from context. */}
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
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
