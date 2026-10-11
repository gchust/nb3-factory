import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { DataTable } from '#components/data-table';
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
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import type { ItUser } from '../tickets/types.js';

type RoleOption = 'engineer' | 'serviceDesk' | 'none';

export default function TeamPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly users?: ItUser[];
    readonly error?: unknown;
  }>();
  const requestKey = String(reloadCount);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<{ data: ItUser[] }>({
        path: 'itUsers',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, users: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const users = result?.users;

  const changeRole = useCallback(
    async (user: ItUser, role: RoleOption): Promise<void> => {
      setSaving(user.userId);
      try {
        await api.request<{ data: ItUser }>({
          path: `itTeamMembers/${encodeURIComponent(user.userId)}`,
          method: 'PUT',
          json: { role },
        });
      } catch (caught: unknown) {
        const apiError = caught instanceof ApiClientError ? caught : undefined;
        toaster.show({
          type: 'error',
          title:
            apiError?.status === 403
              ? t('team.error.forbidden')
              : t('team.error.requestFailed'),
        });
        setSaving(null);
        return;
      }
      setSaving(null);
      toaster.show({ type: 'success', title: t('team.update.success') });
      reload();
    },
    [api, t, toaster, reload],
  );

  const columns = useMemo<ColumnDef<ItUser>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('team.fields.name'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: t('team.fields.email'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>{row.original.email}</span>
        ),
      },
      {
        id: 'role',
        accessorFn: (row) => row.role ?? 'none',
        header: t('team.fields.role'),
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('team.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('team.actions.more', {
                      name: row.original.name,
                    })}
                    disabled={saving === row.original.userId}
                  />
                }
              >
                {saving === row.original.userId ? (
                  <Spinner />
                ) : (
                  <MoreHorizontalIcon />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuRadioGroup
                  value={row.original.role ?? 'none'}
                  onValueChange={(value) => {
                    const role = value as RoleOption;
                    if (role !== (row.original.role ?? 'none')) {
                      void changeRole(row.original, role);
                    }
                  }}
                >
                  <DropdownMenuRadioItem value='engineer'>
                    <WrenchIcon />
                    {t('tickets.roles.engineer')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='serviceDesk'>
                    <ShieldCheckIcon />
                    {t('tickets.roles.serviceDesk')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value='none'>
                    {t('team.roles.none')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [changeRole, saving, t],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('team.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('team.error.forbidden')
            : t('team.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (!users) {
    content = (
      <div role='status' aria-label={t('status.loading')} className='space-y-2'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-12' />
        ))}
      </div>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={users}
        getRowId={(user) => user.userId}
        showSelectedCount={false}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t('team.title')} description={t('team.description')} />
      {content}
    </PageContainer>
  );
}

function RoleBadge({
  role,
}: {
  readonly role: 'engineer' | 'serviceDesk' | null;
}): ReactElement {
  const { t } = useTranslation();
  if (role === 'serviceDesk') {
    return (
      <StatusBadge tone='info'>{t('tickets.roles.serviceDesk')}</StatusBadge>
    );
  }
  if (role === 'engineer') {
    return (
      <StatusBadge tone='success'>{t('tickets.roles.engineer')}</StatusBadge>
    );
  }
  return <StatusBadge tone='neutral'>{t('team.roles.none')}</StatusBadge>;
}
