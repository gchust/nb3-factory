import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  formatPercent,
  loadPassRate,
  tableClasses,
} from '@/components/quality/lib';

export default function QualityStatsPage(): ReactElement {
  const { t } = useTranslation();
  const state = useApiData(loadPassRate, 'pass-rate');

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('quality.stats.title')}
        description={t('quality.stats.description')}
      />

      {state.loading ? (
        <LoadingBlock label={t('status.loading')} />
      ) : state.error ? (
        <ErrorBlock
          message={state.error}
          onRetry={state.reload}
          retryLabel={t('status.retry')}
        />
      ) : !state.data ? (
        <EmptyBlock message={t('quality.stats.empty')} />
      ) : (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <Metric
              label={t('quality.stats.total')}
              value={String(state.data.total)}
            />
            <Metric
              label={t('quality.stats.qualified')}
              value={String(state.data.qualified)}
            />
            <Metric
              label={t('quality.stats.unqualified')}
              value={String(state.data.unqualified)}
            />
            <Metric
              label={t('quality.stats.passRate')}
              value={formatPercent(state.data.passRate)}
            />
          </div>

          <section className='space-y-2'>
            <h2 className='font-heading text-lg font-semibold'>
              {t('quality.stats.byProduct')}
            </h2>
            {state.data.groups.length === 0 ? (
              <EmptyBlock message={t('quality.stats.empty')} />
            ) : (
              <div className={tableClasses.wrap}>
                <table className={tableClasses.table}>
                  <thead>
                    <tr className={tableClasses.headRow}>
                      <th className={tableClasses.headCell}>
                        {t('quality.stats.column.product')}
                      </th>
                      <th className={tableClasses.headCell}>
                        {t('quality.stats.total')}
                      </th>
                      <th className={tableClasses.headCell}>
                        {t('quality.stats.qualified')}
                      </th>
                      <th className={tableClasses.headCell}>
                        {t('quality.stats.unqualified')}
                      </th>
                      <th className={tableClasses.headCell}>
                        {t('quality.stats.passRate')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.groups.map((group) => (
                      <tr key={group.productId} className={tableClasses.row}>
                        <td className={`${tableClasses.cell} font-medium`}>
                          {group.productCode} {group.productName}
                        </td>
                        <td className={tableClasses.cell}>{group.total}</td>
                        <td className={tableClasses.cell}>{group.qualified}</td>
                        <td className={tableClasses.cell}>
                          {group.unqualified}
                        </td>
                        <td className={tableClasses.cell}>
                          {formatPercent(group.passRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}

function Metric({
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
