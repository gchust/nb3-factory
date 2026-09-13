import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { StageBadge } from '@/components/crm/badges';
import {
  CrmErrorText,
  CrmLoading,
  useCrmError,
} from '@/components/crm/feedback';
import { useCrmApi, type FunnelStats } from '@/components/crm/api';

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    value,
  );
}

export default function CrmFunnelPage(): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [stats, setStats] = useState<FunnelStats>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void api
      .funnel()
      .then((next) => {
        if (!active) return;
        setStats(next);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [api, errorFor]);

  const maxCount = Math.max(
    1,
    ...(stats?.byStage.map((row) => row.count) ?? [1]),
  );

  return (
    <section className='space-y-6 p-6'>
      <header>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('crm.funnel.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('crm.funnel.subtitle')}
        </p>
      </header>

      <CrmErrorText message={error} />

      {stats === undefined ? (
        <CrmLoading label={t('crm.common.loading')} />
      ) : (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <MetricCard
              label={t('crm.funnel.total')}
              value={String(stats.totalCount)}
            />
            <MetricCard
              label={t('crm.funnel.newThisMonth')}
              value={String(stats.newThisMonth)}
            />
            <MetricCard
              label={t('crm.funnel.winRate')}
              value={
                stats.winRate === null
                  ? t('crm.funnel.rateUnavailable')
                  : `${Math.round(stats.winRate * 1000) / 10}%`
              }
              hint={`${t('crm.funnel.won')}: ${stats.wonCount} / ${t('crm.funnel.closed')}: ${stats.closedCount}`}
            />
            <MetricCard
              label={t('crm.funnel.totalAmount')}
              value={formatAmount(stats.totalAmount)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('crm.funnel.stage')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('crm.funnel.stage')}</TableHead>
                    <TableHead>{t('crm.funnel.count')}</TableHead>
                    <TableHead>{t('crm.funnel.amount')}</TableHead>
                    <TableHead aria-hidden='true' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.byStage.map((row) => (
                    <TableRow key={row.stage}>
                      <TableCell>
                        <StageBadge stage={row.stage} />
                      </TableCell>
                      <TableCell className='font-medium'>{row.count}</TableCell>
                      <TableCell className='text-muted-foreground'>
                        {formatAmount(row.total)}
                      </TableCell>
                      <TableCell className='w-1/3'>
                        <div
                          aria-hidden='true'
                          className='h-2 rounded-full bg-primary/20'
                        >
                          <div
                            className='h-2 rounded-full bg-primary'
                            style={{
                              width: `${Math.round(
                                (row.count / maxCount) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className='font-heading text-2xl font-semibold'>{value}</p>
        {hint ? (
          <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
