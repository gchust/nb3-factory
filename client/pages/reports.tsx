import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  Banner,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Panel,
} from '@/components/retail-ui';
import { cellClass, rowClass, tableClass, theadClass } from '@/lib/retail-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  readRetailError,
  retailErrorKey,
  useRetailApi,
  type RetailDailyReport,
} from '@/lib/retail-api';

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function ReportsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useRetailApi();
  const [date, setDate] = useState(() => today());
  const [report, setReport] = useState<RetailDailyReport>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const errorText = useCallback(
    (caught: unknown): string => {
      const info = readRetailError(caught);
      return t(retailErrorKey(info.code), {
        defaultValue: info.message ?? 'Request failed.',
      });
    },
    [t],
  );

  const load = useCallback(
    async (target: string): Promise<void> => {
      setError(undefined);
      try {
        setReport(await api.dailyReport(target));
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setLoading(false);
      }
    },
    [api, errorText],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      await load(date);
    })();
    return () => {
      active = false;
    };
  }, [load, date]);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        actions={
          <form
            className='flex items-end gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              setLoading(true);
              void load(date);
            }}
          >
            <Field
              htmlFor='report-date'
              label={t('retail.common.date', { defaultValue: 'Date' })}
            >
              <Input
                id='report-date'
                onChange={(event) => {
                  setLoading(true);
                  setDate(event.target.value);
                }}
                type='date'
                value={date}
              />
            </Field>
            <Button type='submit' variant='secondary'>
              {t('retail.reports.load', { defaultValue: 'Load' })}
            </Button>
          </form>
        }
        description={t('retail.reports.description', {
          defaultValue: 'Daily settlement for the selected business day.',
        })}
        title={t('retail.reports.title', { defaultValue: 'Daily settlement' })}
      />

      {error ? <Banner tone='error'>{error}</Banner> : null}

      {loading ? (
        <Panel>
          <EmptyState
            message={t('retail.common.loading', { defaultValue: 'Loading…' })}
          />
        </Panel>
      ) : report ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <SummaryTile
              label={t('retail.reports.orderCount', {
                defaultValue: 'Sales orders',
              })}
              value={String(report.orderCount)}
            />
            <SummaryTile
              label={t('retail.reports.payableTotal', {
                defaultValue: 'Received total',
              })}
              value={`¥${report.payableTotal.toFixed(2)}`}
            />
            <SummaryTile
              label={t('retail.reports.originalTotal', {
                defaultValue: 'Original total',
              })}
              value={`¥${report.originalTotal.toFixed(2)}`}
            />
            <SummaryTile
              label={t('retail.reports.discountTotal', {
                defaultValue: 'Discount total',
              })}
              value={`¥${report.discountTotal.toFixed(2)}`}
            />
          </div>

          <Panel
            title={t('retail.reports.byPayment', {
              defaultValue: 'By payment method',
            })}
          >
            {report.byPayment.length === 0 ? (
              <EmptyState
                message={t('retail.reports.empty', {
                  defaultValue: 'No sales for this day.',
                })}
              />
            ) : (
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={cellClass}>
                      {t('retail.common.paymentMethod', {
                        defaultValue: 'Payment method',
                      })}
                    </th>
                    <th className={cellClass}>
                      {t('retail.reports.count', { defaultValue: 'Orders' })}
                    </th>
                    <th className={cellClass}>
                      {t('retail.reports.amount', { defaultValue: 'Amount' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPayment.map((entry) => (
                    <tr className={rowClass} key={entry.paymentMethod}>
                      <td className={cellClass}>
                        {t(`retail.payment.${entry.paymentMethod}`, {
                          defaultValue: entry.paymentMethod,
                        })}
                      </td>
                      <td className={cellClass}>{entry.count}</td>
                      <td className={cellClass}>
                        <Money value={entry.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel
            title={t('retail.reports.ranking', {
              defaultValue: 'Product sales ranking',
            })}
          >
            {report.ranking.length === 0 ? (
              <EmptyState
                message={t('retail.reports.empty', {
                  defaultValue: 'No sales for this day.',
                })}
              />
            ) : (
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={cellClass}>
                      {t('retail.common.product', { defaultValue: 'Product' })}
                    </th>
                    <th className={cellClass}>
                      {t('retail.common.quantity', {
                        defaultValue: 'Quantity',
                      })}
                    </th>
                    <th className={cellClass}>
                      {t('retail.reports.amount', { defaultValue: 'Amount' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.ranking.map((entry) => (
                    <tr className={rowClass} key={entry.productId}>
                      <td className={cellClass}>{entry.productName}</td>
                      <td className={cellClass}>{entry.quantity}</td>
                      <td className={cellClass}>
                        <Money value={entry.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      ) : null}
    </section>
  );
}

function SummaryTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 font-heading text-2xl font-semibold tabular-nums'>
        {value}
      </div>
    </div>
  );
}
