import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useExpenseApi, type ExpenseStatisticsRow } from '@/lib/expense-api';
import { CLAIM_TYPE_KEYS, formatAmount } from '@/lib/expense-display';

export default function ExpenseStatisticsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useExpenseApi();
  const [rows, setRows] = useState<readonly ExpenseStatisticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.statistics().then(
      (result) => {
        if (!active) return;
        setRows(result);
        setError('');
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const byDepartment = rows.filter((row) => row.departmentName !== null);
  const byType = rows.filter((row) => row.type !== null);

  return (
    <section className='mx-auto w-full max-w-5xl space-y-6 px-6 py-8'>
      <header className='space-y-1'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('expense.statistics.title')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('expense.statistics.description')}
        </p>
      </header>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Loading label={t('expense.common.loading')} />
      ) : (
        <>
          <StatisticsCard
            title={t('expense.statistics.byDepartment')}
            empty={t('expense.statistics.empty')}
            rows={byDepartment}
            labelOf={(row) => row.departmentName ?? '—'}
          />
          <StatisticsCard
            title={t('expense.statistics.byType')}
            empty={t('expense.statistics.empty')}
            rows={byType}
            labelOf={(row) => (row.type ? t(CLAIM_TYPE_KEYS[row.type]) : '—')}
          />
        </>
      )}
    </section>
  );
}

function StatisticsCard({
  title,
  empty,
  rows,
  labelOf,
}: {
  readonly title: string;
  readonly empty: string;
  readonly rows: readonly ExpenseStatisticsRow[];
  readonly labelOf: (row: ExpenseStatisticsRow) => string;
}): ReactElement {
  const { t } = useTranslation();
  const totals = rows.reduce(
    (accumulator, row) => ({
      claimCount: accumulator.claimCount + row.claimCount,
      receiptCount: accumulator.receiptCount + row.receiptCount,
      totalAmount: accumulator.totalAmount + Number(row.totalAmount ?? 0),
    }),
    { claimCount: 0, receiptCount: 0, totalAmount: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{empty}</p>
        ) : (
          <div className='rounded-xl ring-1 ring-foreground/10'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('expense.statistics.dimension')}</TableHead>
                  <TableHead className='text-right'>
                    {t('expense.statistics.claimCount')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('expense.fields.receiptCount')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('expense.statistics.totalAmount')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{labelOf(row)}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {row.claimCount}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {row.receiptCount}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatAmount(row.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className='font-medium'>
                    {t('expense.statistics.total')}
                  </TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>
                    {totals.claimCount}
                  </TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>
                    {totals.receiptCount}
                  </TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>
                    {formatAmount(totals.totalAmount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
