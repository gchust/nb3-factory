import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import {
  UsersClient,
  type ManagedUser,
  type UserRoleOption,
  type UserRoleScopeOption,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, SearchIcon, UserRoundIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { SessionExpiredAlert } from '#components/session-expired-alert';
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
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

// The role scope the application assigns: the Users plugin's `app` scope, backed by this application's permission sets.
const ROLE_SCOPE = 'app';
// A staff list is small; load it in one page and filter locally.
const PAGE_SIZE = 100;

function rolesOf(user: ManagedUser): readonly string[] {
  const value: UserRoleValue | undefined = user.roleScopes[ROLE_SCOPE];
  if (value === undefined) return [];
  return typeof value === 'string' ? [value] : value;
}

/**
 * A permission set's title, which the API sends as an i18n key plus the namespace that holds it — the application's
 * own namespace for its sets, a plugin's for a built-in one.
 */
function PermissionSetLabel({
  role,
}: {
  readonly role: UserRoleOption;
}): ReactElement {
  const { t } = useTranslation(role.labelI18nNs);
  return (
    <>{t(role.labelI18nKey ?? role.label, { defaultValue: role.label })}</>
  );
}

/** Staff accounts: who may sign in, whether the account is open, and which permission sets it holds. */
export function UsersCard(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{
    readonly key: string;
    readonly scope?: UserRoleScopeOption;
    readonly users?: readonly ManagedUser[];
    readonly error?: unknown;
  }>();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [statusChange, setStatusChange] = useState<{
    readonly user: ManagedUser;
    readonly disable: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    const client = new UsersClient(api);
    Promise.all([
      client.options(),
      client.list({ page: 1, pageSize: PAGE_SIZE }),
    ]).then(
      ([options, page]) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          scope: options.roleScopes.find((scope) => scope.key === ROLE_SCOPE),
          users: page.items,
        });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== String(reloadCount);
  const error = loading ? undefined : result?.error;
  const users = result?.users ?? [];
  const scope = result?.scope;
  const assignable = useMemo(
    () => (scope?.options ?? []).filter((role) => role.assignable !== false),
    [scope],
  );

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? users.filter((user) =>
        [user.name, user.username, user.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      )
    : users;

  async function changeStatus(): Promise<void> {
    if (!statusChange) return;
    const { user, disable } = statusChange;
    setPendingUserId(user.id);
    try {
      await new UsersClient(api)[disable ? 'disable' : 'enable'](user.id);
      toaster.show({
        type: 'success',
        title: disable
          ? t('settings.users.disable.success', { name: user.name })
          : t('settings.users.enable.success', { name: user.name }),
      });
      reload();
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      toaster.show({
        type: 'error',
        title:
          status === 403
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed'),
      });
    } finally {
      setPendingUserId(null);
      setStatusChange(null);
    }
  }

  async function toggleRole(user: ManagedUser, role: string): Promise<void> {
    if (!scope) return;
    const current = [...rolesOf(user)];
    const next = current.includes(role)
      ? current.filter((value) => value !== role)
      : [...current, role];
    setPendingUserId(user.id);
    try {
      await new UsersClient(api).replaceRoleScope(
        user.id,
        ROLE_SCOPE,
        scope.selection === 'multiple' ? next : (next[0] ?? ''),
      );
      toaster.show({
        type: 'success',
        title: t('settings.users.roles.success', { name: user.name }),
      });
      reload();
    } catch (caught: unknown) {
      const status = caught instanceof ApiClientError ? caught.status : 0;
      toaster.show({
        type: 'error',
        title:
          status === 403
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed'),
      });
    } finally {
      setPendingUserId(null);
    }
  }

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {forbidden
            ? t('documents.error.forbidden')
            : t('documents.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (result?.users === undefined) {
    content = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className='h-12 w-full' />
        ))}
      </div>
    );
  } else if (visible.length === 0) {
    content = (
      <p className='py-6 text-center text-sm text-muted-foreground'>
        {needle
          ? t('settings.users.empty.noResults')
          : t('settings.users.empty.description')}
      </p>
    );
  } else {
    content = (
      <ul className='flex flex-col divide-y rounded-lg border'>
        {visible.map((user) => {
          const roles = rolesOf(user);
          const enabled = user.disabledAt === null;
          return (
            <li
              key={user.id}
              className='flex flex-wrap items-start justify-between gap-3 p-4'
            >
              <div className='flex min-w-0 flex-col gap-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>{user.name}</span>
                  <StatusBadge tone={enabled ? 'success' : 'neutral'}>
                    {enabled
                      ? t('settings.users.status.enabled')
                      : t('settings.users.status.disabled')}
                  </StatusBadge>
                </div>
                <span className='text-sm text-muted-foreground'>
                  {user.username ? `${user.username} · ` : ''}
                  {user.email}
                </span>
                <div
                  className='mt-1 flex flex-wrap items-center gap-1'
                  role='group'
                  aria-label={t('settings.users.roles.label', {
                    name: user.name,
                  })}
                >
                  {assignable.map((role) => {
                    const active = roles.includes(role.value);
                    const locked =
                      active && role.removable === false && roles.length === 1;
                    return (
                      <Button
                        key={role.value}
                        type='button'
                        size='xs'
                        variant={active ? 'default' : 'outline'}
                        aria-pressed={active}
                        disabled={pendingUserId === user.id || locked}
                        onClick={() => void toggleRole(user, role.value)}
                      >
                        <PermissionSetLabel role={role} />
                      </Button>
                    );
                  })}
                  {assignable.length === 0 ? (
                    <span className='text-sm text-muted-foreground'>
                      {t('settings.users.roles.none')}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={pendingUserId === user.id}
                onClick={() => setStatusChange({ user, disable: enabled })}
              >
                {enabled
                  ? t('settings.users.disable.action')
                  : t('settings.users.enable.action')}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <UserRoundIcon data-icon='inline-start' />
          {t('settings.users.title')}
        </CardTitle>
        <CardDescription>{t('settings.users.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.users.search.placeholder')}
            aria-label={t('settings.users.search.label')}
          />
        </InputGroup>
        {content}
        {pendingUserId ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Spinner />
            {t('settings.users.saving')}
          </div>
        ) : null}
      </CardContent>

      <AlertDialog
        open={statusChange !== null}
        onOpenChange={(open) => {
          if (!open && pendingUserId === null) setStatusChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusChange?.disable
                ? t('settings.users.disable.title', {
                    name: statusChange?.user.name ?? '',
                  })
                : t('settings.users.enable.title', {
                    name: statusChange?.user.name ?? '',
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusChange?.disable
                ? t('settings.users.disable.description')
                : t('settings.users.enable.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingUserId !== null}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={statusChange?.disable ? 'destructive' : 'default'}
              disabled={pendingUserId !== null}
              onClick={() => void changeStatus()}
            >
              {statusChange?.disable
                ? t('settings.users.disable.confirm')
                : t('settings.users.enable.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
