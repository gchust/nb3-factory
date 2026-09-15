import { useTranslation } from '@nocobase/i18n/client';
import { apiClientToken, useService } from '@nocobase/app-client';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { Loading } from '@/components/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  apiErrorCode,
  fetchStatistics,
  type ContractStatistics,
  type StatisticBucket,
} from '@/lib/contracts';
import { formatAmount } from '@/lib/format';

export default function ContractStatsPage(): ReactElement {
  const api = useService(apiClientToken);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState<ContractStatistics>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    fetchStatistics(api).then(
      (result) => {
        if (!active) return;
        setStats(result);
        setError(undefined);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(
          t(`contracts.errors.${apiErrorCode(cause) ?? 'loadFailed'}`, {
            defaultValue: 'Something went wrong while loading.',
          }),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [api, t]);

  return (
    <section className='space-y-6 p-6'>
      <header className='flex flex-wrap items-center justify-between gap-4'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('contracts.stats.title', { defaultValue: 'Contract statistics' })}
        </h1>
        <Button
          onClick={() => {
            void navigate('/contracts');
          }}
          type='button'
          variant='outline'
        >
          <ArrowLeft />
          {t('contracts.actions.back', { defaultValue: 'Back to list' })}
        </Button>
      </header>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {stats === undefined && !error ? (
        <Loading
          label={t('contracts.loading', { defaultValue: 'Loading contracts' })}
        />
      ) : stats ? (
        <div className='grid gap-6 lg:grid-cols-2'>
          <StatisticTable
            buckets={stats.byType}
            labelFor={(key) =>
              t(`contracts.type.${key}`, { defaultValue: key })
            }
            title={t('contracts.stats.byType', { defaultValue: 'By type' })}
          />
          <StatisticTable
            buckets={stats.byStatus}
            labelFor={(key) =>
              t(`contracts.status.${key}`, { defaultValue: key })
            }
            title={t('contracts.stats.byStatus', { defaultValue: 'By status' })}
          />
        </div>
      ) : null}
    </section>
  );
}

function StatisticTable({
  title,
  buckets,
  labelFor,
}: {
  readonly title: string;
  readonly buckets: readonly StatisticBucket[];
  readonly labelFor: (key: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const totalAmount = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);

  return (
    <article className='space-y-3 rounded-lg border border-border bg-card p-4'>
      <h2 className='font-heading text-lg font-semibold'>{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t('contracts.stats.key', { defaultValue: 'Category' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('contracts.stats.count', { defaultValue: 'Contracts' })}
            </TableHead>
            <TableHead className='text-right'>
              {t('contracts.stats.amount', { defaultValue: 'Total amount' })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.length === 0 ? (
            <TableRow>
              <TableCell className='text-muted-foreground' colSpan={3}>
                {t('contracts.stats.empty', {
                  defaultValue: 'No data to summarize.',
                })}
              </TableCell>
            </TableRow>
          ) : (
            buckets.map((bucket) => (
              <TableRow key={bucket.key}>
                <TableCell>{labelFor(bucket.key)}</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {bucket.count}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatAmount(bucket.amount)}
                </TableCell>
              </TableRow>
            ))
          )}
          <TableRow>
            <TableCell className='font-medium'>
              {t('contracts.stats.total', { defaultValue: 'Total' })}
            </TableCell>
            <TableCell className='text-right font-medium tabular-nums'>
              {totalCount}
            </TableCell>
            <TableCell className='text-right font-medium tabular-nums'>
              {formatAmount(totalAmount)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </article>
  );
}
