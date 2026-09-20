import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Coins,
  Wrench,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { DataState } from '@/components/repair/data-state';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { repairApi } from '@/lib/repair-api';
import { useApiData, useRepairSession } from '@/lib/use-repair';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const session = useRepairSession();
  const dashboard = useApiData('repair/dashboard', (api) =>
    repairApi.dashboard(api),
  );

  const metrics = dashboard.data;
  const cards = [
    {
      key: 'pendingDispatch',
      label: t('repair.dashboard.pendingDispatch', {
        defaultValue: 'Awaiting dispatch',
      }),
      value: metrics?.pendingDispatch ?? 0,
      icon: ClipboardList,
      to: '/tickets?status=pending_dispatch',
    },
    {
      key: 'overdue',
      label: t('repair.dashboard.overdue', { defaultValue: 'Overdue' }),
      value: metrics?.overdue ?? 0,
      icon: AlertTriangle,
      to: '/tickets?overdueOnly=true',
    },
    {
      key: 'pendingAcceptance',
      label: t('repair.dashboard.pendingAcceptance', {
        defaultValue: 'Awaiting acceptance',
      }),
      value: metrics?.pendingAcceptance ?? 0,
      icon: CheckCircle2,
      to: '/tickets?status=pending_acceptance',
    },
    {
      key: 'inProgress',
      label: t('repair.dashboard.inProgress', { defaultValue: 'In progress' }),
      value: metrics?.inProgress ?? 0,
      icon: Wrench,
      to: '/tickets?status=in_progress',
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('repair.dashboard.title', {
          defaultValue: 'Property repair overview',
        })}
        description={t('repair.dashboard.description', {
          defaultValue:
            'Repair requests, dispatch, acceptance and settlement for the whole park.',
        })}
        actions={
          session.data ? (
            <Badge variant='outline' data-testid='current-role'>
              {t('repair.dashboard.role', {
                role: t(`repair.roles.${session.data.user.role}`, {
                  defaultValue: session.data.user.role,
                }),
                defaultValue: 'Role: {{role}}',
              })}
            </Badge>
          ) : null
        }
      />

      <DataState
        loading={dashboard.loading}
        error={dashboard.error}
        onRetry={dashboard.reload}
      >
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {cards.map((card) => (
            <Link key={card.key} to={card.to} className='block'>
              <Card className='h-full transition-colors hover:border-primary/60'>
                <CardHeader className='pb-2'>
                  <CardDescription className='flex items-center gap-2'>
                    <card.icon aria-hidden='true' className='size-4' />
                    {card.label}
                  </CardDescription>
                  <CardTitle className='text-3xl tabular-nums'>
                    {card.value}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        <div className='grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>
                {t('repair.dashboard.monthly', { defaultValue: 'This month' })}
              </CardTitle>
              <CardDescription>
                {t('repair.dashboard.monthlyHint', {
                  defaultValue:
                    'Completion rate and repair cost for the current month.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {t('repair.dashboard.completionRate', {
                    defaultValue: 'Monthly completion rate',
                  })}
                </p>
                <p
                  className='text-2xl tabular-nums'
                  data-testid='completion-rate'
                >
                  {metrics ? `${metrics.monthlyCompletionRate}%` : '—'}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('repair.dashboard.completedOf', {
                    completed: metrics?.completedThisMonth ?? 0,
                    created: metrics?.createdThisMonth ?? 0,
                    defaultValue:
                      '{{completed}} completed / {{created}} created',
                  })}
                </p>
              </div>
              <div>
                <p className='flex items-center gap-1 text-sm text-muted-foreground'>
                  <Coins aria-hidden='true' className='size-4' />
                  {t('repair.dashboard.repairCost', {
                    defaultValue: 'Repair cost',
                  })}
                </p>
                <p className='text-2xl tabular-nums' data-testid='repair-cost'>
                  ¥{(metrics?.monthlyRepairCost ?? 0).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t('repair.dashboard.byStatus', {
                  defaultValue: 'Tickets by status',
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {(metrics?.statusBreakdown ?? []).map((entry) => (
                <div
                  key={entry.status}
                  className='flex items-center justify-between text-sm'
                >
                  <span>
                    {t(`repair.status.${entry.status}`, {
                      defaultValue: entry.status,
                    })}
                  </span>
                  <span className='tabular-nums text-muted-foreground'>
                    {entry.count}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DataState>
    </PageContainer>
  );
}
