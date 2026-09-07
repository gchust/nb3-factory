import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { AlertCircle, Target, TrendingUp, Trophy } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { ErrorState } from '../components/sales/error-state';
import { PageHeader } from '../components/sales/page-header';
import { StageBadge } from '../components/sales/status-badge';
import { useSalesApi } from '../components/sales/use-sales-api';
import { OPPORTUNITY_STAGES } from '../lib/sales-constants';
import { formatMoney, formatPercent } from '../lib/sales-format';
import type { DashboardData } from '../lib/sales-api';

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .dashboard()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (error) {
    return (
      <div className='space-y-6'>
        <PageHeader
          title={t('sales.dashboard.title', { defaultValue: 'Dashboard' })}
        />
        <ErrorState message={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className='space-y-6'>
        <PageHeader
          title={t('sales.dashboard.title', { defaultValue: 'Dashboard' })}
        />
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {[0, 1, 2, 3].map((item) => (
            <Skeleton className='h-28 rounded-xl' key={item} />
          ))}
        </div>
      </div>
    );
  }

  const stageCounts = new Map(
    data.stageDistribution.map((row) => [row.stage, row.count]),
  );
  const maxStageCount = Math.max(
    1,
    ...data.stageDistribution.map((row) => row.count),
  );

  return (
    <div className='space-y-6'>
      <PageHeader
        description={t('sales.dashboard.description', {
          defaultValue: 'Sales pipeline overview',
        })}
        title={t('sales.dashboard.title', { defaultValue: 'Dashboard' })}
      />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          icon={<Target className='size-4' />}
          label={t('sales.dashboard.opportunityCount', {
            defaultValue: 'Open opportunities',
          })}
          value={String(data.opportunityCount)}
        />
        <StatCard
          icon={<TrendingUp className='size-4' />}
          label={t('sales.dashboard.expectedAmount', {
            defaultValue: 'Expected amount',
          })}
          value={formatMoney(data.expectedAmount)}
        />
        <StatCard
          icon={<TrendingUp className='size-4' />}
          label={t('sales.dashboard.weightedAmount', {
            defaultValue: 'Weighted amount',
          })}
          value={formatMoney(data.weightedAmount)}
        />
        <StatCard
          icon={<Trophy className='size-4' />}
          label={t('sales.dashboard.winRate', { defaultValue: 'Win rate' })}
          value={formatPercent(data.winRate * 100)}
          hint={`${data.wonCount} ${t('sales.dashboard.won', { defaultValue: 'won' })} / ${data.lostCount} ${t('sales.dashboard.lost', { defaultValue: 'lost' })}`}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('sales.dashboard.stageDistribution', {
                defaultValue: 'Pipeline by stage',
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {OPPORTUNITY_STAGES.map((stage) => {
              const count = stageCounts.get(stage) ?? 0;
              return (
                <div className='flex items-center gap-3' key={stage}>
                  <div className='w-36 shrink-0'>
                    <StageBadge stage={stage} />
                  </div>
                  <div className='h-2 flex-1 overflow-hidden rounded-full bg-muted'>
                    <div
                      className='h-full rounded-full bg-primary'
                      style={{ width: `${(count / maxStageCount) * 100}%` }}
                    />
                  </div>
                  <span className='w-8 text-right text-sm tabular-nums'>
                    {count}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('sales.dashboard.perOwner', { defaultValue: 'By owner' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.perOwner.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('sales.dashboard.noData', {
                  defaultValue: 'No opportunities yet.',
                })}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('sales.dashboard.owner', { defaultValue: 'Owner' })}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('sales.dashboard.opportunityCount', {
                        defaultValue: 'Opportunities',
                      })}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('sales.dashboard.weightedAmount', {
                        defaultValue: 'Weighted amount',
                      })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.perOwner.map((row) => (
                    <TableRow key={row.ownerId}>
                      <TableCell>{row.ownerName}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {row.count}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatMoney(row.weightedAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('sales.dashboard.attention', {
              defaultValue: 'Needs attention',
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-3'>
              <AlertCircle className='size-5 text-destructive' />
              <span className='text-sm'>
                {t('sales.dashboard.overdueFollowUps', {
                  defaultValue: 'Overdue follow-ups',
                })}
                :{' '}
                <span className='font-semibold tabular-nums'>
                  {data.overdueFollowUpCount}
                </span>
              </span>
            </div>
            <Link
              className='text-sm font-medium text-primary hover:underline'
              to='/follow-ups'
            >
              {t('sales.dashboard.viewFollowUps', {
                defaultValue: 'View follow-ups',
              })}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactElement;
  label: string;
  value: string;
  hint?: string;
}): ReactElement {
  return (
    <Card>
      <CardContent className='space-y-2'>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          {icon}
          <span>{label}</span>
        </div>
        <div className='text-2xl font-semibold tabular-nums'>{value}</div>
        {hint ? (
          <div className='text-xs text-muted-foreground'>{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
