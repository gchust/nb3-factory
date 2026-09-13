import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { useExpenseApi } from '@/components/expense/use-api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatMoney,
  type ExpenseStatistics,
  type StatisticEntry,
} from '@/lib/expense-api';

export default function StatsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const [stats, setStats] = useState<ExpenseStatistics>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .stats()
      .then((value) => {
        if (active) setStats(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : t('expense.error.load'),
          );
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  if (error) {
    return (
      <section className='p-6'>
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      </section>
    );
  }
  if (!stats) return <Spinner />;

  return (
    <section className='space-y-6 p-6'>
      <header>
        <h1 className='font-heading text-2xl font-semibold'>
          {t('expense.stats.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('expense.stats.subtitle')}
        </p>
      </header>

      <div className='grid gap-4 sm:grid-cols-3'>
        <SummaryCard
          title={t('expense.stats.total')}
          value={formatMoney(stats.totalCents)}
        />
        <SummaryCard
          title={t('expense.stats.pending')}
          value={formatMoney(stats.pendingCents)}
        />
        <SummaryCard
          title={t('expense.stats.count')}
          value={String(stats.claimCount)}
        />
      </div>

      <StatTable
        title={t('expense.stats.byDepartment')}
        entries={stats.byDepartment}
        label={(key) => key}
      />
      <StatTable
        title={t('expense.stats.byCategory')}
        entries={stats.byCategory}
        label={(key) => t(`expense.category.${key}`, { defaultValue: key })}
      />
      <StatTable
        title={t('expense.stats.byMonth')}
        entries={stats.byMonth}
        label={(key) => key}
      />
    </section>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm text-muted-foreground'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='font-mono text-2xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatTable({
  title,
  entries,
  label,
}: {
  title: string;
  entries: readonly StatisticEntry[];
  label: (key: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('expense.stats.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('expense.stats.key')}</TableHead>
                <TableHead className='text-right'>
                  {t('expense.table.amount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.key}>
                  <TableCell>{label(entry.key)}</TableCell>
                  <TableCell className='text-right font-mono'>
                    {formatMoney(entry.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
