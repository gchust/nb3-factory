import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  UsersClient,
  type ManagedUser,
  type UserRoleOption,
  type UserRoleScopeOption,
} from '@nocobase/app-plugin-users/client/user-client';
import { MoreHorizontalIcon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

/**
 * People and what they may do.
 *
 * The page presents the application's own Permission Sets as the two jobs the library names, and lets an
 * administrator move a person between them or close an account. Closing an account takes effect on the server
 * immediately: the person's roles are removed and their sessions are revoked, so an already open session can no
 * longer reach anything.
 */
export default function UsersAdminPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const toaster = useToaster();
  const [client] = useState(() => new UsersClient(api));
  const [users, setUsers] = useState<ManagedUser[]>();
  const [scope, setScope] = useState<UserRoleScopeOption>();
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [error, setError] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>();
  const [disabling, setDisabling] = useState<ManagedUser>();

  // Retry: reset the error first, then fetch. Only ever called from a user action.
  const load = useCallback((): void => {
    setError(false);
    void Promise.all([client.options(), client.list({ pageSize: 200 })])
      .then(([options, page]) => {
        const applicationScope =
          options.roleScopes.find((item) => item.key === 'app') ??
          options.roleScopes[0];
        setScope(applicationScope);
        setUsers([...page.items]);
        setDrafts({});
      })
      .catch(() => setError(true));
  }, [client]);

  // The first load sets state only from the request's continuation, so nothing updates in the effect body itself.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([client.options(), client.list({ pageSize: 200 })])
      .then(([options, page]) => {
        if (cancelled) return;
        const applicationScope =
          options.roleScopes.find((item) => item.key === 'app') ??
          options.roleScopes[0];
        setScope(applicationScope);
        setUsers([...page.items]);
        setDrafts({});
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const assignable = (scope?.options ?? []).filter(
    (option) => option.assignable !== false,
  );
  const protectedRoles = (scope?.options ?? []).filter(
    (option) => option.assignable === false,
  );

  const roleValues = (user: ManagedUser): string[] => {
    const value = scope ? user.roleScopes[scope.key] : undefined;
    if (typeof value === 'string') return value ? [value] : [];
    return value ? [...value] : [];
  };
  const draftFor = (user: ManagedUser): string[] => {
    const current = roleValues(user);
    return (
      drafts[user.id] ??
      current.filter((key) => assignable.some((option) => option.value === key))
    );
  };
  const toggle = (user: ManagedUser, value: string): void => {
    const draft = draftFor(user);
    setDrafts((previous) => ({
      ...previous,
      [user.id]: draft.includes(value)
        ? draft.filter((key) => key !== value)
        : [...draft, value],
    }));
  };

  const saveRoles = async (user: ManagedUser): Promise<void> => {
    if (!scope) return;
    const current = roleValues(user);
    const preserved = current.filter((key) =>
      protectedRoles.some((option) => option.value === key),
    );
    setBusyUserId(user.id);
    try {
      const updated = await client.replaceRoleScope(user.id, scope.key, [
        ...preserved,
        ...draftFor(user),
      ]);
      setUsers((previous) =>
        (previous ?? []).map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[user.id];
        return next;
      });
      toaster.show({ type: 'success', title: t('users.roles.saved') });
    } catch {
      toaster.show({ type: 'error', title: t('users.roles.saveFailed') });
    } finally {
      setBusyUserId(undefined);
    }
  };

  const setEnabled = async (
    user: ManagedUser,
    enabled: boolean,
  ): Promise<void> => {
    setBusyUserId(user.id);
    try {
      const updated = enabled
        ? await client.enable(user.id)
        : await client.disable(user.id);
      setUsers((previous) =>
        (previous ?? []).map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
      toaster.show({
        type: 'success',
        title: enabled ? t('users.enable.success') : t('users.disable.success'),
      });
    } catch {
      toaster.show({
        type: 'error',
        title: enabled ? t('users.enable.failed') : t('users.disable.failed'),
      });
    } finally {
      setBusyUserId(undefined);
      setDisabling(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('users.loadFailed')}</AlertTitle>
          <AlertDescription className='flex flex-col gap-3'>
            <span>{t('users.loadFailed')}</span>
            <span>
              <Button variant='outline' size='sm' onClick={() => void load()}>
                {t('users.retry')}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : !users || !scope ? (
        <Loading className='py-16' />
      ) : (
        <div className='overflow-x-auto rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.columns.person')}</TableHead>
                <TableHead>{t('users.columns.status')}</TableHead>
                <TableHead>{t('users.columns.roles')}</TableHead>
                <TableHead className='text-right'>
                  {t('users.columns.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  assignable={assignable}
                  protectedRoles={protectedRoles}
                  draft={draftFor(user)}
                  dirty={
                    !sameSet(
                      draftFor(user),
                      roleValues(user).filter((key) =>
                        assignable.some((option) => option.value === key),
                      ),
                    )
                  }
                  busy={busyUserId === user.id}
                  onToggle={(value) => toggle(user, value)}
                  onSave={() => void saveRoles(user)}
                  onDisable={() => setDisabling(user)}
                  onEnable={() => void setEnabled(user, true)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {disabling ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !busyUserId) setDisabling(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('users.disable.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('users.disable.description', {
                  name: disabling.name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busyUserId !== undefined}>
                {t('actions.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                disabled={busyUserId !== undefined}
                onClick={(event) => {
                  event.preventDefault();
                  void setEnabled(disabling, false);
                }}
              >
                {t('users.disable.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </PageContainer>
  );
}

function UserRow({
  user,
  assignable,
  protectedRoles,
  draft,
  dirty,
  busy,
  onToggle,
  onSave,
  onDisable,
  onEnable,
}: {
  readonly user: ManagedUser;
  readonly assignable: readonly UserRoleOption[];
  readonly protectedRoles: readonly UserRoleOption[];
  readonly draft: readonly string[];
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly onToggle: (value: string) => void;
  readonly onSave: () => void;
  readonly onDisable: () => void;
  readonly onEnable: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const disabled = user.disabledAt !== null;
  const held = user.roleScopes.app;
  const heldRoles = Array.isArray(held) ? held : held ? [held] : [];
  const protectedHeld = protectedRoles.filter((option) =>
    heldRoles.includes(option.value),
  );

  return (
    <TableRow>
      <TableCell>
        <div className='flex flex-col'>
          <span className='font-medium'>{user.name}</span>
          <span className='text-muted-foreground'>{user.email}</span>
        </div>
      </TableCell>
      <TableCell>
        {disabled ? (
          <StatusBadge tone='neutral'>{t('users.status.disabled')}</StatusBadge>
        ) : (
          <StatusBadge tone='success'>{t('users.status.enabled')}</StatusBadge>
        )}
      </TableCell>
      <TableCell>
        <div className='flex flex-wrap items-center gap-1.5'>
          {protectedHeld.map((option) => (
            <StatusBadge key={option.value} tone='info'>
              {roleLabel(t, option)}
            </StatusBadge>
          ))}
          {assignable.map((option) => {
            const selected = draft.includes(option.value);
            return (
              <Button
                key={option.value}
                type='button'
                size='sm'
                variant={selected ? 'default' : 'outline'}
                disabled={busy}
                aria-pressed={selected}
                onClick={() => onToggle(option.value)}
              >
                {roleLabel(t, option)}
              </Button>
            );
          })}
        </div>
      </TableCell>
      <TableCell className='text-right'>
        {dirty ? (
          <Button size='sm' disabled={busy} onClick={onSave}>
            {t('users.roles.save')}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('users.actionsFor', { name: user.name })}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-40'>
            {disabled ? (
              <DropdownMenuItem
                className='gap-2'
                disabled={busy}
                onClick={onEnable}
              >
                {t('users.enable.action')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant='destructive'
                className='gap-2'
                disabled={busy}
                onClick={onDisable}
              >
                {t('users.disable.action')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function roleLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  option: UserRoleOption,
): string {
  if (!option.labelI18nKey) return option.label;
  return t(option.labelI18nKey, {
    ns: option.labelI18nNs,
    defaultValue: option.label,
  });
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}
