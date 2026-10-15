import type {
  ManagedUser,
  UserRoleOption,
} from '@nocobase/app-plugin-users/client/user-client';
import { UsersClient } from '@nocobase/app-plugin-users/client/user-client';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, SearchIcon, UserXIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

/**
 * Account and permission administration, built on the Users plugin's `UsersClient`.
 *
 * The page needs unrestricted access, so only an administrator opens it. Each account's library permission is one of
 * the application's own permission sets; disabling an account ends its existing sessions at once.
 */
export default function UsersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const users = useMemo(() => new UsersClient(api), [api]);

  const [query, setQuery] = useState('');
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [state, setState] = useState<{
    readonly key: string;
    readonly accounts?: readonly ManagedUser[];
    readonly options?: readonly UserRoleOption[];
    readonly failed?: boolean;
  }>();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const key = `${reloadCount}:${query}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      users.list({
        pageSize: 100,
        ...(query.trim() ? { q: query.trim() } : {}),
      }),
      users.options(),
    ]).then(
      ([page, options]) => {
        if (controller.signal.aborted) return;
        const scope = options.roleScopes.find((entry) => entry.key === 'app');
        setState({ key, accounts: page.items, options: scope?.options ?? [] });
      },
      () => {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, key, failed: true }));
        }
      },
    );
    return () => controller.abort();
  }, [users, key, query]);

  const loading = state?.key !== key;
  const accounts = loading ? undefined : state?.accounts;
  const options = state?.options ?? [];

  const run = async (
    userId: string,
    action: () => Promise<unknown>,
    success: string,
    failure: string,
  ) => {
    setBusyUserId(userId);
    try {
      await action();
      toaster.show({ type: 'success', title: success });
      reload();
    } catch {
      toaster.show({ type: 'error', title: failure });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
      />

      <div className='relative max-w-sm'>
        <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          className='pl-8'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('users.search')}
          aria-label={t('users.search')}
        />
      </div>

      <p className='text-xs text-muted-foreground'>{t('users.demoHint')}</p>
      <p className='text-xs text-muted-foreground'>
        {t('users.permissionHint')}
      </p>

      {state?.failed && !accounts ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('users.error.load')}</AlertDescription>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('documents.error.request')}
          </Button>
        </Alert>
      ) : loading && !accounts ? (
        <div className='flex flex-col gap-4'>
          <Skeleton className='h-28 w-full' />
          <Skeleton className='h-28 w-full' />
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('users.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('users.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className='grid gap-4 sm:grid-cols-2'>
          {accounts.map((account) => (
            <li key={account.id} className='flex'>
              <UserCard
                account={account}
                options={options}
                busy={busyUserId === account.id}
                onPermission={(value) =>
                  void run(
                    account.id,
                    () =>
                      users.replaceRoleScope(
                        account.id,
                        'app',
                        value === NONE ? [] : [value],
                      ),
                    t('users.saved'),
                    t('users.error.save'),
                  )
                }
                onToggle={() =>
                  void run(
                    account.id,
                    () =>
                      account.disabledAt
                        ? users.enable(account.id)
                        : users.disable(account.id),
                    account.disabledAt
                      ? t('users.enabled')
                      : t('users.disabled'),
                    account.disabledAt
                      ? t('users.error.enable')
                      : t('users.error.disable'),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

const NONE = 'none';

/** Translate a permission set the library owns; leave any other set's label as its plugin states it. */
function roleLabel(t: (key: string) => string, option: UserRoleOption): string {
  if (option.value === 'document-editor') return t('users.permissionEditor');
  if (option.value === 'document-reader') return t('users.permissionReader');
  return option.label;
}

function UserCard({
  account,
  options,
  busy,
  onPermission,
  onToggle,
}: {
  readonly account: ManagedUser;
  readonly options: readonly UserRoleOption[];
  readonly busy: boolean;
  readonly onPermission: (value: string) => void;
  readonly onToggle: () => void;
}): ReactElement {
  const { t } = useTranslation();

  const assigned = toArray(account.roleScopes.app);
  // `root` confers unrestricted access and cannot be assigned or removed here; such an account is left untouched.
  const isRoot = assigned.includes('root');
  const assignable = options.filter(
    (option) => option.assignable !== false && option.value !== 'root',
  );
  const current =
    assigned.find((value) => assignable.some((o) => o.value === value)) ?? NONE;

  const items = [
    { value: NONE, label: t('users.permissionNone') },
    ...assignable.map((option) => ({
      value: option.value,
      // The library's own roles are named in the application's locale; any other set keeps the label its plugin
      // provides, so a set added elsewhere still shows correctly here.
      label: roleLabel(t, option),
    })),
  ];

  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center justify-between gap-2'>
          <span className='truncate'>
            {account.name || account.username || account.email}
          </span>
          <StatusBadge tone={account.disabledAt ? 'neutral' : 'success'}>
            {account.disabledAt
              ? t('users.statusDisabled')
              : t('users.statusEnabled')}
          </StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1 text-sm text-muted-foreground'>
          {account.username ? <span>{account.username}</span> : null}
          <span className='truncate'>{account.email}</span>
        </div>

        <div className='flex flex-col gap-1.5'>
          <span className='text-sm font-medium'>{t('users.permission')}</span>
          {isRoot ? (
            <span className='text-sm text-muted-foreground'>
              {t('users.permissionHint')}
            </span>
          ) : (
            <Select
              items={items}
              value={current}
              onValueChange={(next: string | null) => {
                if (next && next !== current) onPermission(next);
              }}
            >
              <SelectTrigger disabled={busy} aria-label={t('users.permission')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!isRoot ? (
          <div className='flex flex-col gap-1'>
            <Button
              variant={account.disabledAt ? 'outline' : 'destructive'}
              size='sm'
              className='w-fit'
              disabled={busy}
              onClick={onToggle}
            >
              <UserXIcon data-icon='inline-start' />
              {account.disabledAt ? t('users.enable') : t('users.disable')}
            </Button>
            <span className='text-xs text-muted-foreground'>
              {t('users.disableHint')}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function toArray(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string');
  return [];
}
