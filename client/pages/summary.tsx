import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import {
  BOOKING_STATUSES,
  fetchSummary,
  formatDate,
  formatMoney,
  formatPercent,
  type RentalSummary,
} from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

function StatCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-card p-4'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-1 font-heading text-2xl font-semibold'>{value}</p>
    </div>
  );
}

export default function SummaryPage(): ReactElement {
  const { t } = useTranslation();
  const window = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 86400000);
    return { from, to };
  }, []);

  const summary = useApiData<RentalSummary>(
    `summary:${window.from.toISOString()}:${window.to.toISOString()}`,
    (api) =>
      fetchSummary(api, {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
      }),
  );

  const totals = summary.data?.totals;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        description={t('rentals.summary.description', {
          from: formatDate(window.from.toISOString()),
          to: formatDate(window.to.toISOString()),
        })}
        title={t('rentals.summary.title')}
      />

      <QueryState
        emptyTitle={t('rentals.summary.empty')}
        error={summary.error}
        loading={summary.loading}
        onRetry={summary.reload}
      >
        {totals ? (
          <div className='space-y-6'>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
              <StatCard
                label={t('rentals.summary.totalBookings')}
                value={String(totals.bookings)}
              />
              <StatCard
                label={t('rentals.summary.awaitingDelivery')}
                value={String(totals.byStatus.confirmed)}
              />
              <StatCard
                label={t('rentals.summary.awaitingReturn')}
                value={String(totals.byStatus.delivered)}
              />
              <StatCard
                label={t('rentals.summary.revenue')}
                value={formatMoney(totals.revenue)}
              />
              <StatCard
                label={t('rentals.summary.damageFees')}
                value={formatMoney(totals.damageFees)}
              />
            </div>

            <section className='rounded-xl border border-border bg-card p-4'>
              <h2 className='font-heading text-base font-medium'>
                {t('rentals.summary.byStatus')}
              </h2>
              <div className='mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                {BOOKING_STATUSES.map((status) => (
                  <div
                    className='rounded-lg bg-muted/50 px-3 py-2'
                    key={status}
                  >
                    <p className='text-xs text-muted-foreground'>
                      {t(`rentals.status.${status}`)}
                    </p>
                    <p className='text-lg font-medium'>
                      {totals.byStatus[status]}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className='rounded-xl border border-border bg-card p-4'>
              <h2 className='font-heading text-base font-medium'>
                {t('rentals.summary.utilization')}
              </h2>
              {summary.data?.venues.length ? (
                <div className='mt-3 overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead className='border-b border-border text-left text-muted-foreground'>
                      <tr>
                        <th className='px-3 py-2 font-medium'>
                          {t('rentals.fields.venueName')}
                        </th>
                        <th className='px-3 py-2 font-medium'>
                          {t('rentals.summary.bookings')}
                        </th>
                        <th className='px-3 py-2 font-medium'>
                          {t('rentals.summary.bookedHours')}
                        </th>
                        <th className='px-3 py-2 font-medium'>
                          {t('rentals.summary.utilizationRate')}
                        </th>
                        <th className='px-3 py-2 font-medium'>
                          {t('rentals.summary.revenue')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.data.venues.map((venue) => (
                        <tr
                          className='border-b border-border last:border-0'
                          key={venue.venueId}
                        >
                          <td className='px-3 py-2 font-medium'>
                            {venue.venueName}
                          </td>
                          <td className='px-3 py-2'>{venue.bookings}</td>
                          <td className='px-3 py-2'>{venue.bookedHours}</td>
                          <td className='px-3 py-2'>
                            <div className='flex items-center gap-2'>
                              <div className='h-2 w-24 overflow-hidden rounded-full bg-muted'>
                                <div
                                  className='h-full rounded-full bg-primary'
                                  style={{
                                    width: `${Math.min(venue.utilization * 100, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className='text-xs text-muted-foreground'>
                                {formatPercent(venue.utilization)}
                              </span>
                            </div>
                          </td>
                          <td className='px-3 py-2'>
                            {formatMoney(venue.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className='mt-3 text-sm text-muted-foreground'>
                  {t('rentals.summary.noUtilization')}
                </p>
              )}
            </section>
          </div>
        ) : null}
      </QueryState>
    </PageContainer>
  );
}
