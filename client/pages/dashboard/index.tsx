import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  ClipboardList,
  GraduationCap,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLabApi } from '@/lib/lab-api';
import { useLabErrorMessage } from '@/lib/lab-errors';
import { labelFor, ROLE_LABEL_KEYS } from '@/lib/lab-options';
import { statusTone } from '@/lib/lab-status';
import {
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
} from '@/lib/lab-types';
import { useAsync } from '@/lib/use-async';

/**
 * The state of the laboratories the viewer can reach.
 *
 * One request carries both the dashboard and the viewer's access, so the page cannot render numbers
 * for one laboratory while a stale membership list decides what it says about the viewer.
 */
export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useLabApi();
  const state = useAsync('dashboard', async () => ({
    dashboard: await api.dashboard(),
    access: await api.access(),
  }));
  const message = useLabErrorMessage(state.error);
  const data = state.data?.dashboard;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            variant='outline'
            onClick={state.reload}
            disabled={state.loading}
          >
            <RefreshCw />
            {t('lab.refresh')}
          </Button>
        }
        description={t('dashboard.description')}
        title={t('dashboard.title')}
      />

      {message ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('lab.loadFailed')}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {state.loading && !data ? (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className='h-28 w-full' />
          ))}
        </div>
      ) : null}

      {data ? (
        <>
          {data.restricted ? (
            <Alert>
              <AlertTriangle />
              <AlertTitle>{t('dashboard.restrictedTitle')}</AlertTitle>
              <AlertDescription>{t('dashboard.restricted')}</AlertDescription>
            </Alert>
          ) : null}

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <Stat
              icon={<Wrench />}
              label={t('dashboard.equipment')}
              value={data.equipment.total}
              hint={t('dashboard.equipmentHint', {
                expired: data.equipment.calibrationExpired,
                soon: data.equipment.calibrationExpiringSoon,
              })}
              tone={
                data.equipment.calibrationExpired > 0
                  ? 'destructive'
                  : 'default'
              }
            />
            <Stat
              icon={<ClipboardList />}
              label={t('dashboard.workOrders')}
              value={data.workOrders.total}
              hint={t('dashboard.workOrdersHint', {
                open: data.workOrders.open,
              })}
              tone={data.workOrders.open > 0 ? 'secondary' : 'default'}
            />
            <Stat
              icon={<ShieldAlert />}
              label={t('dashboard.safety')}
              value={data.safety.total}
              hint={t('dashboard.safetyHint', {
                open: data.safety.open,
                blocking: data.safety.blocking,
              })}
              tone={data.safety.blocking > 0 ? 'destructive' : 'default'}
            />
            <Stat
              icon={<GraduationCap />}
              label={t('dashboard.training')}
              value={data.training.participants}
              hint={t('dashboard.trainingHint', {
                records: data.training.total,
              })}
              tone='default'
            />
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.laboratories')}</CardTitle>
                <CardDescription>
                  {t('dashboard.reservationsHint', {
                    upcoming: data.reservations.upcoming,
                    total: data.reservations.total,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {data.laboratories.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('dashboard.noLaboratories')}
                  </p>
                ) : null}
                {data.laboratories.map((laboratory) => (
                  <div
                    key={laboratory.id}
                    className='border-border flex items-center justify-between gap-3 rounded-lg border p-3'
                  >
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>
                        {laboratory.name}
                      </p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {laboratory.code}
                      </p>
                    </div>
                    <RoleBadge
                      access={state.data?.access}
                      labId={laboratory.id}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.recentWorkOrders')}</CardTitle>
                <CardDescription>
                  <Link className='underline' to='/work-orders'>
                    {t('dashboard.viewAll')}
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {data.recentWorkOrders.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('lab.empty')}
                  </p>
                ) : null}
                {data.recentWorkOrders.map((order) => (
                  <Link
                    key={order.id}
                    className='border-border hover:bg-accent/40 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors'
                    to={`/work-orders/${order.id}`}
                  >
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>
                        {order.title}
                      </p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {order.code}
                      </p>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      <Badge variant={statusTone(order.priority)}>
                        {labelFor(
                          WORK_ORDER_PRIORITY_OPTIONS,
                          order.priority,
                          t,
                        )}
                      </Badge>
                      <Badge variant={statusTone(order.status)}>
                        {labelFor(WORK_ORDER_STATUS_OPTIONS, order.status, t)}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
  readonly hint: string;
  readonly tone: 'default' | 'secondary' | 'destructive';
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription className='flex items-center gap-2'>
          <span className='[&_svg]:size-4'>{icon}</span>
          {label}
        </CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge variant={tone}>{hint}</Badge>
      </CardContent>
    </Card>
  );
}

/** The viewer's role in a laboratory, or a note that they only see published records. */
function RoleBadge({
  access,
  labId,
}: {
  readonly access:
    | {
        memberships: readonly { labId: number; role: string }[];
        isRoot: boolean;
      }
    | undefined;
  readonly labId: number;
}): ReactElement {
  const { t } = useTranslation();
  const role = access?.memberships.find(
    (membership) => membership.labId === labId,
  )?.role;
  if (access?.isRoot) {
    return <Badge variant='default'>{t('lab.role.root')}</Badge>;
  }
  if (!role) {
    return <Badge variant='outline'>{t('dashboard.visitor')}</Badge>;
  }
  return (
    <Badge variant={statusTone(role === 'student' ? 'pending' : 'active')}>
      {t(
        ROLE_LABEL_KEYS[role as keyof typeof ROLE_LABEL_KEYS] ??
          'lab.role.student',
      )}
    </Badge>
  );
}
