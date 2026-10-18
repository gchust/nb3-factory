import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  UsersClient,
  type ManagedUser,
  type ManagedUserPage,
  type UserRoleOption,
  type UserRoleScopeOption,
  type UsersOptions,
} from '@nocobase/app-plugin-users/client/user-client';
import { SearchIcon, ShieldCheckIcon, UsersRoundIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Spinner } from '#components/ui/spinner';

const PAGE_SIZE = 20;
const ROLE_SCOPE = 'app';

interface ListState {
  readonly key: string;
  readonly result?: ManagedUserPage;
  readonly denied?: boolean;
  readonly error?: string;
}

export default function UsersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new UsersClient(api), [api]);
  const [options, setOptions] = useState<UsersOptions>();
  const [optionsError, setOptionsError] = useState<string>();
  const [optionsDenied, setOptionsDenied] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ManagedUser>();
  const requestKey = `${page}:${search}`;
  const [state, setState] = useState<ListState>();

  useEffect(() => {
    const controller = new AbortController();
    client
      .options()
      .then((next) => {
        if (!controller.signal.aborted) setOptions(next);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiClientError && cause.status === 403)
          setOptionsDenied(true);
        setOptionsError(requestErrorMessage(cause, t));
      });
    return () => controller.abort();
  }, [client, t]);

  useEffect(() => {
    let current = true;
    client
      .list({ page, pageSize: PAGE_SIZE, q: search || undefined })
      .then((result) => {
        if (current) setState({ key: requestKey, result });
      })
      .catch((cause: unknown) => {
        if (!current) return;
        if (cause instanceof ApiClientError && cause.status === 403) {
          setState({ key: requestKey, denied: true });
          return;
        }
        setState({ key: requestKey, error: requestErrorMessage(cause, t) });
      });
    return () => {
      current = false;
    };
  }, [client, page, requestKey, search, t]);

  const current = state?.key === requestKey ? state : undefined;
  const result = current?.result;
  const loading = !current;
  const denied = optionsDenied || current?.denied;
  const error = optionsError ?? current?.error;
  const scope = options?.roleScopes.find((item) => item.key === ROLE_SCOPE);
  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    : 1;

  const onSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  };

  const replaceUser = (updated: ManagedUser): void => {
    setState((previous) =>
      previous?.result
        ? {
            ...previous,
            result: {
              ...previous.result,
              items: previous.result.items.map((user) =>
                user.id === updated.id ? updated : user,
              ),
            },
          }
        : previous,
    );
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('serviceDesk.users.title', { defaultValue: 'Users' })}
        description={t('serviceDesk.users.description', {
          defaultValue:
            'Manage who can submit tickets, engineer assignments, and service desk administration.',
        })}
      />

      {denied ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ShieldCheckIcon />
            </EmptyMedia>
            <EmptyTitle>
              {t('serviceDesk.users.deniedTitle', {
                defaultValue: 'User management is not available',
              })}
            </EmptyTitle>
            <EmptyDescription>
              {t('serviceDesk.users.deniedDescription', {
                defaultValue:
                  'Your account does not have permission to manage users.',
              })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : error ? (
        <p
          role='alert'
          className='rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive'
        >
          {error}
        </p>
      ) : (
        <div className='flex flex-col gap-4'>
          <form
            onSubmit={onSearch}
            className='flex gap-2 rounded-xl border border-border bg-card p-3'
          >
            <div className='relative min-w-0 flex-1'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('serviceDesk.users.search', {
                  defaultValue: 'Search by name, username or email…',
                })}
                aria-label={t('serviceDesk.users.search', {
                  defaultValue: 'Search by name, username or email…',
                })}
                className='pl-8'
              />
            </div>
            <Button type='submit' variant='outline'>
              {t('serviceDesk.actions.search', { defaultValue: 'Search' })}
            </Button>
          </form>

          {scope?.hasAuthenticatedDefaultAccess ? (
            <p className='rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground'>
              {t('serviceDesk.users.defaultRoleHint', {
                defaultValue:
                  'Every signed-in account has the service desk employee role by default, so people can submit and follow their own tickets immediately.',
              })}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                {t('serviceDesk.users.listTitle', {
                  defaultValue: 'Accounts',
                })}
              </CardTitle>
              <CardDescription>
                {result
                  ? t('serviceDesk.users.count', {
                      count: result.total,
                      defaultValue: '{{count}} account(s)',
                    })
                  : t('serviceDesk.users.loading', {
                      defaultValue: 'Loading accounts…',
                    })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !result ? (
                <Loading className='py-16' />
              ) : result && result.items.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <UsersRoundIcon />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t('serviceDesk.users.emptyTitle', {
                        defaultValue: 'No accounts found',
                      })}
                    </EmptyTitle>
                    <EmptyDescription>
                      {search
                        ? t('serviceDesk.users.emptySearch', {
                            defaultValue:
                              'No account matches this search. Try another name or email address.',
                          })
                        : t('serviceDesk.users.emptyDescription', {
                            defaultValue:
                              'Registered accounts will appear here.',
                          })}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : result ? (
                <ul className='divide-y divide-border'>
                  {result.items.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      scope={scope}
                      onManage={() => setEditing(user)}
                    />
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          {result && totalPages > 1 ? (
            <div className='flex items-center justify-between gap-3'>
              <p className='text-sm text-muted-foreground'>
                {t('serviceDesk.users.page', {
                  page,
                  totalPages,
                  defaultValue: 'Page {{page}} of {{totalPages}}',
                })}
              </p>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  {t('serviceDesk.users.previous', {
                    defaultValue: 'Previous',
                  })}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                >
                  {t('serviceDesk.users.next', { defaultValue: 'Next' })}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {editing && scope ? (
        <ManageRolesDialog
          key={editing.id}
          client={client}
          user={editing}
          scope={scope}
          onClose={() => setEditing(undefined)}
          onSaved={(updated) => {
            replaceUser(updated);
            setEditing(undefined);
            void toaster.show({
              type: 'success',
              title: t('serviceDesk.users.saved', {
                defaultValue: 'Roles updated.',
              }),
            });
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function UserRow({
  user,
  scope,
  onManage,
}: {
  readonly user: ManagedUser;
  readonly scope?: UserRoleScopeOption;
  readonly onManage: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const roles = scope ? rolesFor(user, scope) : [];
  const labels = roles.map((role) =>
    scope ? roleLabel(t, scopeOption(scope, role)) : role,
  );

  return (
    <li className='flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='truncate font-medium'>{user.name}</p>
          <StatusBadge tone={user.disabledAt ? 'neutral' : 'success'}>
            {user.disabledAt
              ? t('serviceDesk.users.disabled', { defaultValue: 'Disabled' })
              : t('serviceDesk.users.enabled', { defaultValue: 'Enabled' })}
          </StatusBadge>
        </div>
        <p className='truncate text-sm text-muted-foreground'>
          {user.email}
          {user.username ? ` · ${user.username}` : ''}
        </p>
        <div className='mt-2 flex flex-wrap gap-1.5'>
          {scope?.hasAuthenticatedDefaultAccess ? (
            <StatusBadge tone='neutral'>
              {t('serviceDesk.permissionSets.employee', {
                defaultValue: 'Service desk employee',
              })}
            </StatusBadge>
          ) : null}
          {labels.map((label, index) => (
            <StatusBadge key={roles[index]} tone='info'>
              {label}
            </StatusBadge>
          ))}
          {labels.length === 0 && !scope?.hasAuthenticatedDefaultAccess ? (
            <span className='text-xs text-muted-foreground'>
              {t('serviceDesk.users.noRoles', {
                defaultValue: 'No service desk role',
              })}
            </span>
          ) : null}
        </div>
      </div>
      <Button variant='outline' size='sm' onClick={onManage}>
        {t('serviceDesk.users.manageRoles', {
          defaultValue: 'Manage roles',
        })}
      </Button>
    </li>
  );
}

function ManageRolesDialog({
  client,
  user,
  scope,
  onClose,
  onSaved,
}: {
  readonly client: UsersClient;
  readonly user: ManagedUser;
  readonly scope: UserRoleScopeOption;
  readonly onClose: () => void;
  readonly onSaved: (user: ManagedUser) => void;
}): ReactElement {
  const { t } = useTranslation();
  const currentRoles = useMemo(() => rolesFor(user, scope), [scope, user]);
  const availableRoles = useMemo(
    () =>
      scope.options.filter(
        (option) =>
          option.assignable !== false || currentRoles.includes(option.value),
      ),
    [currentRoles, scope],
  );
  const [selected, setSelected] = useState<readonly string[]>(() =>
    currentRoles.filter((role) =>
      availableRoles.some((option) => option.value === role),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      const updated = await client.replaceRoleScope(
        user.id,
        scope.key,
        selected,
      );
      onSaved(updated);
    } catch (cause: unknown) {
      setError(requestErrorMessage(cause, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('serviceDesk.users.manageTitle', {
              defaultValue: 'Manage roles',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('serviceDesk.users.manageDescription', {
              name: user.name,
              defaultValue:
                'Choose the service desk roles for {{name}}. Role changes apply immediately.',
            })}
          </DialogDescription>
        </DialogHeader>

        {scope.hasAuthenticatedDefaultAccess ? (
          <p className='rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground'>
            {t('serviceDesk.users.defaultRoleInDialog', {
              role: t('serviceDesk.permissionSets.employee', {
                defaultValue: 'Service desk employee',
              }),
              defaultValue:
                '{{role}} is granted to every signed-in account and does not need to be assigned here.',
            })}
          </p>
        ) : null}

        <div className='flex flex-col gap-3'>
          {availableRoles.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('serviceDesk.users.noAssignableRoles', {
                defaultValue: 'No roles can be assigned here.',
              })}
            </p>
          ) : (
            availableRoles.map((option) => {
              const checked = selected.includes(option.value);
              const locked = checked
                ? option.removable === false
                : option.assignable === false;
              return (
                <div
                  key={option.value}
                  className='flex items-start gap-3 rounded-lg border border-border p-3'
                >
                  <Checkbox
                    id={`role-${option.value}`}
                    checked={checked}
                    disabled={saving || locked}
                    onCheckedChange={(value: boolean) => {
                      setSelected((current) =>
                        value
                          ? [...new Set([...current, option.value])]
                          : current.filter((role) => role !== option.value),
                      );
                    }}
                  />
                  <div className='flex flex-col gap-0.5'>
                    <Label htmlFor={`role-${option.value}`}>
                      {roleLabel(t, option)}
                    </Label>
                    {option.description ? (
                      <p className='text-xs text-muted-foreground'>
                        {option.description}
                      </p>
                    ) : null}
                    {locked ? (
                      <p className='text-xs text-muted-foreground'>
                        {t('serviceDesk.users.protectedRole', {
                          defaultValue:
                            'This role is managed outside user management.',
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error ? (
          <p
            role='alert'
            className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant='outline' disabled={saving} onClick={onClose}>
            {t('serviceDesk.actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner data-icon='inline-start' /> : null}
            {t('serviceDesk.users.saveRoles', { defaultValue: 'Save roles' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function rolesFor(
  user: ManagedUser,
  scope: UserRoleScopeOption,
): readonly string[] {
  const value = user.roleScopes[scope.key];
  return typeof value === 'string' ? [value] : (value ?? []);
}

function scopeOption(
  scope: UserRoleScopeOption,
  value: string,
): UserRoleOption | undefined {
  return scope.options.find((option) => option.value === value);
}

function roleLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  option: UserRoleOption | undefined,
): string {
  if (!option) return '';
  return option.labelI18nKey
    ? t(option.labelI18nKey, {
        ns: option.labelI18nNs,
        defaultValue: option.label,
      })
    : option.label;
}

function requestErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401)
      return t('serviceDesk.errors.unauthenticated', {
        defaultValue: 'Your session has expired. Sign in again.',
      });
    if (error.status === 403)
      return t('serviceDesk.errors.forbidden', {
        defaultValue: 'You do not have permission to do this.',
      });
    if (error.status === 404)
      return t('serviceDesk.errors.notFound', {
        defaultValue: 'This item no longer exists.',
      });
  }
  return t('serviceDesk.errors.generic', {
    defaultValue: 'The request failed. Try again.',
  });
}
