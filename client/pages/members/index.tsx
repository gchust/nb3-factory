import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import {
  UsersClient,
  type ManagedUser,
  type UserRoleOption,
} from '@nocobase/app-plugin-users/client/user-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontalIcon, SearchIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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

import { formatDateTime } from '../library/format.js';
import { personName } from './person.js';

const STATUSES = ['enabled', 'disabled'] as const;
type Status = (typeof STATUSES)[number];

function isStatus(value: string | null): value is Status {
  return STATUSES.some((status) => status === value);
}

/**
 * The staff page: every account, the permission sets it holds, and whether it is
 * active.
 *
 * It is an ordinary page of this application with `authz: 'unrestricted'`, so
 * only the root administrator reaches it — the same rule the server applies to
 * the Users endpoints it calls. Deactivating a colleague invalidates the
 * sessions that account already holds, which is what stops a disabled reader
 * from carrying on with a tab that was already open.
 */
export default function MembersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const { searchParams, search, inputProps, updateParams, clear } =
    useUrlSearch();
  const statusParam = searchParams.get('status');
  const status = isStatus(statusParam) ? statusParam : undefined;

  const [result, setResult] = useState<{
    readonly key: string;
    readonly items: readonly ManagedUser[];
    readonly total: number;
    readonly permissionSets: readonly UserRoleOption[];
    readonly error?: unknown;
  }>({ key: '', items: [], total: 0, permissionSets: [] });
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);
  const requestKey = JSON.stringify([status, search, reloadToken]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const users = new UsersClient(api);
    Promise.all([
      users.list({ pageSize: 100, q: search || undefined, status }),
      users.options(),
    ]).then(
      ([page, options]) => {
        if (requestId !== requestRef.current) return;
        const app = options.roleScopes.find((scope) => scope.key === 'app');
        setResult({
          key: requestKey,
          items: page.items,
          total: page.total,
          permissionSets: app?.options ?? [],
        });
      },
      (error: unknown) => {
        if (requestId !== requestRef.current) return;
        setResult({
          key: requestKey,
          items: [],
          total: 0,
          permissionSets: [],
          error,
        });
      },
    );
  }, [api, requestKey, search, status]);

  const loading = result.key !== requestKey;
  const items = loading ? [] : result.items;
  const total = loading ? 0 : result.total;
  const error = loading ? undefined : result.error;
  const hasFilters = Boolean(search || status);

  const reload = useCallback(
    () => setReloadToken((token) => token + 1),
    [setReloadToken],
  );

  /**
   * Writes one account through the Users endpoints: a permission set added or
   * removed, or the account enabled and disabled. Both are the administrator
   * operations the requirement asks for, and both report their result.
   */
  const apply = useCallback(
    (change: (users: UsersClient) => Promise<ManagedUser>) => {
      const users = new UsersClient(api);
      change(users).then(
        () => {
          reload();
          toaster.show({ type: 'success', title: t('members.saved') });
        },
        (cause: unknown) => {
          toaster.show({
            type: 'error',
            title:
              cause instanceof ApiClientError && cause.status === 403
                ? t('members.error.forbidden')
                : t('members.saveFailed'),
          });
        },
      );
    },
    [api, reload, t, toaster],
  );

  const columns = useMemo<ColumnDef<ManagedUser, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('members.column.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{personName(row.original)}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('members.column.email')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>{row.original.email}</span>
        ),
      },
      {
        id: 'permissionSets',
        header: () => t('members.column.permissionSets'),
        enableSorting: false,
        cell: ({ row }) => (
          <PermissionSetBadges
            user={row.original}
            options={result.permissionSets}
          />
        ),
      },
      {
        id: 'status',
        header: () => t('members.column.status'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.disabledAt ? (
            <StatusBadge tone='warning'>
              {t('members.status.disabled')}
            </StatusBadge>
          ) : (
            <StatusBadge tone='success'>
              {t('members.status.enabled')}
            </StatusBadge>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('members.column.createdAt')}
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
          <span className='sr-only'>{t('members.column.actions')}</span>
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
                    aria-label={t('members.row.actions', {
                      name: personName(row.original),
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {t('members.row.permissionSets')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className='w-56'>
                    {/* `DropdownMenuLabel` is Base UI's `Menu.GroupLabel`, which requires a
                        `Menu.Group` ancestor and throws otherwise. */}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>
                        {t('members.row.permissionSetsHint')}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {result.permissionSets.map((option) => (
                        <DropdownMenuCheckboxItem
                          key={option.value}
                          checked={holdsPermissionSet(
                            row.original,
                            option.value,
                          )}
                          onCheckedChange={(checked: boolean) =>
                            apply((users) =>
                              users.replaceRoleScope(
                                row.original.id,
                                'app',
                                nextPermissionSets(
                                  row.original,
                                  option.value,
                                  checked,
                                ),
                              ),
                            )
                          }
                        >
                          {optionLabel(option, t)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    apply((users) =>
                      row.original.disabledAt
                        ? users.enable(row.original.id)
                        : users.disable(row.original.id),
                    )
                  }
                >
                  {row.original.disabledAt
                    ? t('members.row.enable')
                    : t('members.row.disable')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [t, locale, apply, result.permissionSets],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('members.title')}
        description={t('members.description')}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('members.error.title')}</AlertTitle>
          <AlertDescription>
            {error instanceof ApiClientError && error.status === 403
              ? t('members.error.forbidden')
              : t('members.error.description')}
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
        getRowId={(user) => user.id}
        loading={loading}
        showPagination={items.length > 0}
        toolbar={
          <div className='flex w-full flex-wrap items-center gap-2'>
            <InputGroup className='w-full sm:w-64'>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                {...inputProps}
                placeholder={t('members.search.placeholder')}
                aria-label={t('members.search.label')}
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
                aria-label={t('members.filter.status')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('members.filter.allStatuses')}
                </SelectItem>
                {STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`members.status.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => clear((params) => params.delete('status'))}
              >
                {t('members.clearFilters')}
              </Button>
            ) : null}
            {!loading ? (
              <span className='ml-auto text-sm text-muted-foreground'>
                {t('members.list.count', { count: total })}
              </span>
            ) : null}
          </div>
        }
        emptyTitle={
          hasFilters ? t('members.list.emptyFiltered') : t('members.list.empty')
        }
        emptyDescription={t('members.list.emptyHint')}
      />
    </PageContainer>
  );
}

function PermissionSetBadges({
  user,
  options,
}: {
  readonly user: ManagedUser;
  readonly options: readonly UserRoleOption[];
}): ReactElement {
  const { t } = useTranslation();
  const keys = permissionSetKeys(user);
  if (keys.length === 0) {
    return (
      <span className='text-muted-foreground'>
        {t('members.noPermissionSets')}
      </span>
    );
  }
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {keys.map((key) => (
        <StatusBadge key={key} tone='info'>
          {permissionSetLabel(options, key)}
        </StatusBadge>
      ))}
    </div>
  );
}

/** The permission sets an account holds in the application scope. */
function permissionSetKeys(user: ManagedUser): readonly string[] {
  const value = user.roleScopes.app;
  if (typeof value === 'string') return [value];
  return value ?? [];
}

function holdsPermissionSet(user: ManagedUser, key: string): boolean {
  return permissionSetKeys(user).includes(key);
}

/**
 * The sets to store after one is added or removed. The scope holds several, so
 * this is the whole next list rather than a single value; removing the last one
 * is allowed and leaves the account with none.
 */
function nextPermissionSets(
  user: ManagedUser,
  key: string,
  checked: boolean,
): readonly string[] {
  const current = permissionSetKeys(user);
  if (checked) {
    return current.includes(key) ? current : [...current, key];
  }
  return current.filter((value) => value !== key);
}

function permissionSetLabel(
  options: readonly UserRoleOption[],
  key: string,
): string {
  return options.find((option) => option.value === key)?.label ?? key;
}

function optionLabel(
  option: UserRoleOption,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!option.labelI18nKey) return option.label;
  return t(option.labelI18nKey, {
    ns: option.labelI18nNs,
    defaultValue: option.label,
  });
}
