import { useApiClient, useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import type {
  ManagedUser,
  UserRoleOption,
  UserRoleScopeOption,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  EllipsisIcon,
  KeyRoundIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UserXIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import {
  disableManagedUser,
  enableManagedUser,
  listManagedUsers,
  loadUsersOptions,
  revokeManagedUserSessions,
} from './api.js';
import { adminUserKeys } from './queries.js';

const PAGE_SIZE = 20;
type StatusFilter = 'all' | 'enabled' | 'disabled';

export default function AdminUsersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuthentication();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pendingDisable, setPendingDisable] = useState<ManagedUser>();

  const optionsQuery = useQuery({
    queryKey: adminUserKeys.options(),
    queryFn: () => loadUsersOptions(api),
  });
  const usersQuery = useQuery({
    queryKey: adminUserKeys.list({
      page,
      pageSize: PAGE_SIZE,
      q: search.trim() || undefined,
      status: status === 'all' ? undefined : status,
    }),
    queryFn: () =>
      listManagedUsers(api, {
        page,
        pageSize: PAGE_SIZE,
        q: search.trim() || undefined,
        status: status === 'all' ? undefined : status,
      }),
    placeholderData: keepPreviousData,
  });

  const disable = useMutation({
    mutationFn: (userId: string) => disableManagedUser(api, userId),
    onSuccess: async () => {
      setPendingDisable(undefined);
      toaster.show({
        type: 'success',
        title: t('users.disable.success', {
          defaultValue: 'Account disabled. Its sessions were ended.',
        }),
      });
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
  });

  const enable = useMutation({
    mutationFn: (userId: string) => enableManagedUser(api, userId),
    onSuccess: async () => {
      toaster.show({
        type: 'success',
        title: t('users.enable.success', {
          defaultValue: 'Account enabled. The person can sign in again.',
        }),
      });
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error) => {
      toaster.show({
        type: 'error',
        title: t('users.enable.error', {
          defaultValue: 'The account could not be enabled.',
        }),
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const revokeSessions = useMutation({
    mutationFn: (userId: string) => revokeManagedUserSessions(api, userId),
    onSuccess: async () => {
      toaster.show({
        type: 'success',
        title: t('users.revokeSessions.success', {
          defaultValue: 'The person was signed out everywhere.',
        }),
      });
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    },
    onError: (error) => {
      toaster.show({
        type: 'error',
        title: t('users.revokeSessions.error', {
          defaultValue: 'The sessions could not be ended.',
        }),
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const scope = optionsQuery.data?.roleScopes[0];
  const total = usersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentUserId = session?.user.id;

  const openPermissions = (user: ManagedUser): void => {
    void navigate({
      pathname: `${user.id}/permissions`,
      search: location.search,
    });
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('users.title', { defaultValue: 'Users and permissions' })}
        description={t('users.description', {
          defaultValue:
            'Manage staff accounts, their permission sets, and whether they can sign in.',
        })}
      />

      <div className='flex flex-wrap items-center gap-3'>
        <div className='relative w-full max-w-sm'>
          <SearchIcon
            className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden
          />
          <Input
            aria-label={t('users.searchLabel', {
              defaultValue: 'Search users',
            })}
            className='pl-9'
            placeholder={t('users.searchPlaceholder', {
              defaultValue: 'Search by name or email',
            })}
            type='search'
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          items={[
            {
              value: 'all',
              label: t('users.status.all', { defaultValue: 'All' }),
            },
            {
              value: 'enabled',
              label: t('users.status.enabled', { defaultValue: 'Enabled' }),
            },
            {
              value: 'disabled',
              label: t('users.status.disabled', { defaultValue: 'Disabled' }),
            },
          ]}
          value={status}
          onValueChange={(next: string | null) => {
            if (next === 'all' || next === 'enabled' || next === 'disabled') {
              setStatus(next);
              setPage(1);
            }
          }}
        >
          <SelectTrigger
            size='sm'
            className='w-40'
            aria-label={t('users.status.label', {
              defaultValue: 'Account status',
            })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('users.status.all', { defaultValue: 'All' })}
            </SelectItem>
            <SelectItem value='enabled'>
              {t('users.status.enabled', { defaultValue: 'Enabled' })}
            </SelectItem>
            <SelectItem value='disabled'>
              {t('users.status.disabled', { defaultValue: 'Disabled' })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {usersQuery.isPending || optionsQuery.isPending ? (
        <Loading className='min-h-60' />
      ) : usersQuery.isError || optionsQuery.isError ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t('users.errors.load', {
              defaultValue: 'The users could not be loaded.',
            })}
          </AlertTitle>
          <AlertDescription>
            {((usersQuery.error ?? optionsQuery.error) instanceof Error
              ? (usersQuery.error ?? optionsQuery.error)?.message
              : null) || null}
            <Button
              className='mt-3'
              size='sm'
              variant='outline'
              onClick={() => {
                void usersQuery.refetch();
                void optionsQuery.refetch();
              }}
            >
              {t('users.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className='overflow-hidden rounded-xl border bg-card'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('users.columns.person', { defaultValue: 'Person' })}
                  </TableHead>
                  <TableHead>
                    {t('users.columns.permissions', {
                      defaultValue: 'Permission sets',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('users.columns.status', { defaultValue: 'Status' })}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('users.columns.actions', { defaultValue: 'Actions' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data?.items.length ? (
                  usersQuery.data.items.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className='flex min-w-0 flex-col'>
                            <span className='truncate font-medium'>
                              {user.name}
                              {isSelf ? (
                                <span className='ml-2 text-xs font-normal text-muted-foreground'>
                                  {t('users.you', { defaultValue: 'You' })}
                                </span>
                              ) : null}
                            </span>
                            <span className='truncate text-xs text-muted-foreground'>
                              {user.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {scope ? (
                            <PermissionSummary user={user} scope={scope} />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={user.disabledAt ? 'neutral' : 'success'}
                          >
                            {user.disabledAt
                              ? t('users.account.disabled', {
                                  defaultValue: 'Disabled',
                                })
                              : t('users.account.enabled', {
                                  defaultValue: 'Enabled',
                                })}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={t('users.columns.actions', {
                                defaultValue: 'Actions',
                              })}
                              className='inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
                            >
                              <EllipsisIcon className='size-4' />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end' className='w-52'>
                              <DropdownMenuItem
                                className='gap-2'
                                onClick={() => openPermissions(user)}
                              >
                                <ShieldCheckIcon className='size-4' />
                                {t('users.actions.permissions', {
                                  defaultValue: 'Manage permissions',
                                })}
                              </DropdownMenuItem>
                              {!isSelf ? (
                                <>
                                  <DropdownMenuItem
                                    className='gap-2'
                                    disabled={enable.isPending}
                                    onClick={() =>
                                      user.disabledAt
                                        ? enable.mutate(user.id)
                                        : setPendingDisable(user)
                                    }
                                  >
                                    {user.disabledAt ? (
                                      <UserCheckIcon className='size-4' />
                                    ) : (
                                      <UserXIcon className='size-4' />
                                    )}
                                    {user.disabledAt
                                      ? t('users.actions.enable', {
                                          defaultValue: 'Enable account',
                                        })
                                      : t('users.actions.disable', {
                                          defaultValue: 'Disable account',
                                        })}
                                  </DropdownMenuItem>
                                  {!user.disabledAt ? (
                                    <DropdownMenuItem
                                      className='gap-2'
                                      disabled={revokeSessions.isPending}
                                      onClick={() =>
                                        revokeSessions.mutate(user.id)
                                      }
                                    >
                                      <KeyRoundIcon className='size-4' />
                                      {t('users.actions.revokeSessions', {
                                        defaultValue: 'Sign out everywhere',
                                      })}
                                    </DropdownMenuItem>
                                  ) : null}
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <div className='flex flex-col items-center gap-1 py-10 text-center'>
                        <p className='font-medium'>
                          {t('users.empty.title', {
                            defaultValue: 'No users match',
                          })}
                        </p>
                        <p className='text-sm text-muted-foreground'>
                          {t('users.empty.description', {
                            defaultValue:
                              'Try a different search or account status.',
                          })}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {total > PAGE_SIZE ? (
            <div className='flex items-center justify-between gap-4'>
              <p className='text-sm text-muted-foreground'>
                {`${total} · ${page}/${pageCount}`}
              </p>
              <div className='flex gap-2'>
                <Button
                  disabled={page <= 1 || usersQuery.isFetching}
                  size='sm'
                  variant='outline'
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('users.actions.previous', { defaultValue: 'Previous' })}
                </Button>
                <Button
                  disabled={page >= pageCount || usersQuery.isFetching}
                  size='sm'
                  variant='outline'
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  {t('users.actions.next', { defaultValue: 'Next' })}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <AlertDialog
        open={Boolean(pendingDisable)}
        onOpenChange={(open) => {
          if (!open && !disable.isPending) setPendingDisable(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('users.disable.title', {
                defaultValue: 'Disable this account?',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('users.disable.description', {
                defaultValue:
                  'The person will be signed out immediately and cannot sign in again until the account is enabled.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {disable.isError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {disable.error instanceof Error ? disable.error.message : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disable.isPending}>
              {t('users.actions.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={disable.isPending}
              variant='destructive'
              onClick={() => {
                if (pendingDisable) disable.mutate(pendingDisable.id);
              }}
            >
              {disable.isPending
                ? t('users.disable.disabling', { defaultValue: 'Disabling…' })
                : t('users.disable.confirm', {
                    defaultValue: 'Disable account',
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Outlet />
    </PageContainer>
  );
}

function PermissionSummary({
  user,
  scope,
}: {
  readonly user: ManagedUser;
  readonly scope: UserRoleScopeOption;
}): ReactElement {
  const { t } = useTranslation();
  const raw = user.roleScopes[scope.key];
  const values: readonly string[] =
    typeof raw === 'string' ? [raw] : (raw ?? []);
  if (!values.length) {
    return (
      <span className='text-sm text-muted-foreground'>
        {t('users.permissions.none', { defaultValue: 'No permission set' })}
      </span>
    );
  }
  return (
    <div className='flex flex-wrap gap-1.5'>
      {values.map((value) => {
        const option = scope.options.find((item) => item.value === value);
        return (
          <StatusBadge key={value} tone='info'>
            {option ? roleLabel(option, t) : value}
          </StatusBadge>
        );
      })}
    </div>
  );
}

function roleLabel(
  option: UserRoleOption,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return option.labelI18nKey
    ? t(option.labelI18nKey, {
        ns: option.labelI18nNs,
        defaultValue: option.label,
      })
    : option.label;
}
