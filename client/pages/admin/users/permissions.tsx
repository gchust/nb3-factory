import { useApiClient } from '@nocobase/app-client';
import type {
  UserRoleOption,
  UserRoleScopeOption,
  UserRoleValue,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';

import {
  findManagedUser,
  loadUsersOptions,
  replaceManagedUserRoleScope,
} from './api.js';
import { adminUserKeys } from './queries.js';

export default function AdminUserPermissionsDialog(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { userId = '' } = useParams();
  const [edited, setEdited] = useState<readonly string[] | null>(null);

  const optionsQuery = useQuery({
    queryKey: adminUserKeys.options(),
    queryFn: () => loadUsersOptions(api),
  });
  const userQuery = useQuery({
    queryKey: adminUserKeys.user(userId),
    queryFn: () => findManagedUser(api, userId),
    enabled: Boolean(userId),
  });

  const scope = optionsQuery.data?.roleScopes[0];
  const user = userQuery.data;
  const current = normalizeRoleValue(
    scope,
    scope && user ? user.roleScopes[scope.key] : undefined,
  );
  const selected = edited ?? current;
  const loading = optionsQuery.isPending || userQuery.isPending;
  const error = optionsQuery.error ?? userQuery.error;

  const close = (): void => {
    void navigate(
      { pathname: '/admin/users', search: location.search },
      { replace: true },
    );
  };

  const save = useMutation({
    mutationFn: () => {
      if (!scope) throw new Error('No role scope is available.');
      return replaceManagedUserRoleScope(
        api,
        userId,
        scope.key,
        scope.selection === 'single' ? (selected[0] ?? '') : selected,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
      close();
    },
  });

  return (
    <RouteDialog
      title={t('users.permissions.title', {
        defaultValue: 'Manage permissions',
      })}
      description={
        user
          ? t('users.permissions.description', {
              defaultValue: 'Choose what {{name}} may do.',
              name: user.name,
            })
          : undefined
      }
      footer={
        <>
          <Button disabled={save.isPending} variant='outline' onClick={close}>
            {t('users.actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            disabled={save.isPending || loading || Boolean(error) || !scope}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? t('users.permissions.saving', { defaultValue: 'Saving…' })
              : t('users.permissions.save', {
                  defaultValue: 'Save permissions',
                })}
          </Button>
        </>
      }
    >
      {loading ? (
        <Loading className='min-h-48' />
      ) : userQuery.isError || !user || !scope ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t('users.errors.load', {
              defaultValue: 'The users could not be loaded.',
            })}
          </AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : null}
          </AlertDescription>
        </Alert>
      ) : (
        <div className='flex flex-col gap-5'>
          <div className='flex items-start gap-3 rounded-lg border bg-muted/30 p-3'>
            <ShieldCheckIcon className='mt-0.5 size-5 text-muted-foreground' />
            <div className='flex min-w-0 flex-col'>
              <span className='font-medium'>{user.name}</span>
              <span className='truncate text-sm text-muted-foreground'>
                {user.email}
              </span>
            </div>
          </div>

          <fieldset className='flex flex-col gap-3'>
            <legend className='text-sm font-medium'>
              {scope.labelI18nKey
                ? t(scope.labelI18nKey, {
                    ns: scope.labelI18nNs,
                    defaultValue: scope.label,
                  })
                : scope.label}
            </legend>
            <div className='flex flex-col divide-y overflow-hidden rounded-lg border'>
              {scope.options.map((option) => {
                const checked = selected.includes(option.value);
                const locked = checked
                  ? option.removable === false
                  : option.assignable === false;
                return (
                  <label
                    key={option.value}
                    className={
                      locked
                        ? 'flex items-start gap-3 p-3'
                        : 'flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/40'
                    }
                  >
                    <Checkbox
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={(next) => {
                        setEdited(() => {
                          if (scope.selection === 'single') {
                            return next ? [option.value] : [];
                          }
                          return next
                            ? [...new Set([...selected, option.value])]
                            : selected.filter(
                                (value) => value !== option.value,
                              );
                        });
                      }}
                    />
                    <span className='flex min-w-0 flex-col gap-0.5'>
                      <span className='text-sm font-medium'>
                        {roleLabel(option, t)}
                      </span>
                      {option.description ? (
                        <span className='text-xs text-muted-foreground'>
                          {option.description}
                        </span>
                      ) : null}
                      {locked ? (
                        <span className='text-xs text-muted-foreground'>
                          {t('users.permissions.protected', {
                            defaultValue:
                              'This assignment is managed outside user administration.',
                          })}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {scope.hasAuthenticatedDefaultAccess ? (
              <p className='text-xs text-muted-foreground'>
                {t('users.permissions.defaultAccess', {
                  defaultValue:
                    'All signed-in people also receive default access that is configured separately.',
                })}
              </p>
            ) : null}
          </fieldset>

          {save.isError ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {t('users.permissions.error', {
                  defaultValue: 'The permissions could not be saved.',
                })}
              </AlertTitle>
              <AlertDescription>
                {save.error instanceof Error ? save.error.message : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </RouteDialog>
  );
}

function normalizeRoleValue(
  scope: UserRoleScopeOption | undefined,
  value: UserRoleValue | undefined,
): readonly string[] {
  if (!scope) return [];
  return typeof value === 'string' ? [value] : (value ?? []);
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
