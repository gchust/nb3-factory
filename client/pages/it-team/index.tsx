import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  UsersClient,
  type ManagedUser,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, PlusIcon, UserRoundPlusIcon } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { shouldRetryRequest } from '../it-tickets/api.js';
import {
  TEAM_ROLES,
  currentRole,
  roleLabel,
  type TeamRoleChoice,
} from './types.js';

const USERS_QUERY_KEY = ['it-team', 'users'] as const;

const ROLE_OPTIONS: readonly TeamRoleChoice[] = ['default', ...TEAM_ROLES];

const ROLE_TONES = {
  default: 'neutral',
  'it-employee': 'neutral',
  'it-engineer': 'info',
  'it-service-desk': 'warning',
} as const;

export default function ServiceDeskTeamPage(): ReactElement {
  const api = useApiClient();
  const { t, i18n } = useTranslation();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const usersClient = useMemo(() => new UsersClient(api), [api]);

  const createAccess = useCan({
    resource: { type: 'user', id: '*' },
    action: 'create',
  });
  const assignAccess = useCan({
    resource: { type: 'user', id: '*' },
    action: 'assign-role',
  });
  const manageAccess = useCan({
    resource: { type: 'composite', id: 'it.tickets' },
    action: 'manage',
  });
  const canCreate = createAccess.can && assignAccess.can;
  const canAssign = assignAccess.can;

  const users = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: () => usersClient.list({ page: 1, pageSize: 100 }),
    staleTime: 15_000,
    retry: shouldRetryRequest,
  });

  const changeRole = useMutation({
    mutationFn: ({
      user,
      role,
    }: {
      readonly user: ManagedUser;
      readonly role: TeamRoleChoice;
    }) =>
      usersClient.replaceRoleScope(
        user.id,
        'app',
        role === 'default' ? [] : [role],
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['it-tickets'] });
      void toaster.show({
        type: 'success',
        title: t('serviceDesk.team.roleUpdated'),
      });
    },
    onError: () => {
      void toaster.show({
        type: 'error',
        title: t('itTickets.errors.requestFailed'),
      });
    },
  });

  const loadDemo = useMutation({
    mutationFn: () =>
      api.request({
        path: 'tickets/sample-data',
        method: 'POST',
        json: {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['it-tickets'] });
      void toaster.show({
        type: 'success',
        title: t('serviceDesk.demo.loaded'),
      });
    },
    onError: () => {
      void toaster.show({
        type: 'error',
        title: t('serviceDesk.demo.loadFailed'),
      });
    },
  });

  const errorStatus =
    users.error && typeof users.error === 'object' && 'status' in users.error
      ? (users.error as { status?: number }).status
      : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('serviceDesk.title')}
        description={t('serviceDesk.description')}
        actions={
          canCreate ? (
            <Link className={buttonVariants()} to={{ pathname: 'new' }}>
              <PlusIcon data-icon='inline-start' />
              {t('serviceDesk.actions.addMember')}
            </Link>
          ) : null
        }
      />

      <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'>
        <Card>
          <CardHeader>
            <CardTitle>{t('serviceDesk.team.title')}</CardTitle>
            <CardDescription>
              {t('serviceDesk.team.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.isPending ? (
              <div
                className='space-y-2'
                aria-label={t('serviceDesk.team.loading')}
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className='h-12 rounded-lg' />
                ))}
              </div>
            ) : errorStatus === 401 ? (
              <SessionExpiredAlert />
            ) : users.error ? (
              <Alert variant='destructive'>
                <AlertTriangleIcon />
                <AlertTitle>{t('serviceDesk.team.loadFailed')}</AlertTitle>
                <AlertDescription className='flex items-center justify-between gap-3'>
                  <span>{t('itTickets.errors.requestFailed')}</span>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => void users.refetch()}
                  >
                    {t('itTickets.actions.retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : !users.data?.items.length ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <UserRoundPlusIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('serviceDesk.team.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>
                    {t('serviceDesk.team.emptyDescription')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('serviceDesk.columns.member')}</TableHead>
                    <TableHead>{t('serviceDesk.columns.role')}</TableHead>
                    <TableHead>{t('serviceDesk.columns.added')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.items.map((user) => {
                    const role = currentRole(user.roleScopes?.app);
                    const changing =
                      changeRole.isPending &&
                      changeRole.variables?.user.id === user.id;
                    return (
                      <TableRow key={user.id}>
                        <TableCell className='whitespace-normal'>
                          <div className='flex flex-col gap-0.5'>
                            <span className='font-medium'>{user.name}</span>
                            <span className='text-xs text-muted-foreground'>
                              {user.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canAssign ? (
                            <Select
                              value={role}
                              onValueChange={(value) => {
                                if (typeof value !== 'string') return;
                                changeRole.mutate({
                                  user,
                                  role: value,
                                });
                              }}
                              disabled={changing}
                            >
                              <SelectTrigger
                                size='sm'
                                className='w-40'
                                aria-label={`${t('serviceDesk.columns.role')} · ${user.name}`}
                              >
                                <SelectValue>
                                  {roleLabel(
                                    t,
                                    currentRole(user.roleScopes?.app),
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {roleLabel(t, option)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <StatusBadge tone={ROLE_TONES[role]}>
                              {roleLabel(t, role)}
                            </StatusBadge>
                          )}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {new Intl.DateTimeFormat(i18n.language, {
                            dateStyle: 'medium',
                          }).format(new Date(user.createdAt))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('serviceDesk.demo.title')}</CardTitle>
            <CardDescription>
              {t('serviceDesk.demo.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <dl className='space-y-2 text-sm'>
              <div className='flex items-baseline justify-between gap-3'>
                <dt className='text-muted-foreground'>
                  {t('serviceDesk.demo.engineerAccount')}
                </dt>
                <dd className='text-right font-mono text-xs break-all'>
                  itdemo_engineer1
                </dd>
              </div>
              <div className='flex items-baseline justify-between gap-3'>
                <dt className='text-muted-foreground'>
                  {t('serviceDesk.demo.employeeAccount')}
                </dt>
                <dd className='text-right font-mono text-xs break-all'>
                  itdemo_employee
                </dd>
              </div>
              <div className='flex items-baseline justify-between gap-3'>
                <dt className='text-muted-foreground'>
                  {t('serviceDesk.demo.password')}
                </dt>
                <dd className='font-mono text-xs'>Demo123456!</dd>
              </div>
            </dl>
            {manageAccess.can ? (
              <Button
                className='w-full'
                variant='outline'
                onClick={() => loadDemo.mutate()}
                disabled={loadDemo.isPending}
              >
                {loadDemo.isPending
                  ? t('serviceDesk.demo.loading')
                  : t('serviceDesk.demo.load')}
              </Button>
            ) : null}
            <p className='text-xs leading-relaxed text-muted-foreground'>
              {t('serviceDesk.demo.accountHint')}
            </p>
            <p className='text-xs leading-relaxed text-muted-foreground'>
              {t('serviceDesk.demo.note')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Outlet />
    </PageContainer>
  );
}
