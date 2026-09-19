import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Loading } from '@/components/loading';
import { getDashboard, getPrincipal } from '@/components/procurement/api.js';
import { formatCurrency } from '@/components/procurement/format.js';
import {
  EmptyState,
  ErrorBanner,
  OrderStatusBadge,
  ReceiptStatusBadge,
  Table,
  TD,
  TH,
  THead,
  TR,
} from '@/components/procurement/ui.js';
import { useAsyncData } from '@/components/procurement/use-async-data.js';

export default function ProcurementDashboardPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsyncData(
    () => Promise.all([getDashboard(api), getPrincipal(api)]),
    [api],
  );

  const dashboard = data?.[0];
  const principal = data?.[1];
  const hasBusinessRole =
    principal !== undefined &&
    (principal.isAdministrator || principal.roles.length > 0);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        description={t('procurement.dashboard.description')}
        title={t('procurement.dashboard.title')}
      />
      <ErrorBanner
        message={error ? t('procurement.dashboard.loadFailed') : null}
      />
      {error ? (
        <button
          className='text-sm text-primary underline'
          onClick={() => reload()}
          type='button'
        >
          {t('status.retry')}
        </button>
      ) : null}
      {loading && !dashboard ? (
        <Loading />
      ) : dashboard ? (
        <>
          {!hasBusinessRole ? (
            <p className='rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground'>
              {t('procurement.dashboard.noRole')}
            </p>
          ) : null}
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard
              label={t('procurement.dashboard.pendingApproval')}
              value={String(dashboard.pendingApproval)}
            />
            <StatCard
              label={t('procurement.dashboard.pendingReceipt')}
              value={String(dashboard.pendingReceipt)}
            />
            <StatCard
              label={t('procurement.dashboard.approvedCount')}
              value={String(dashboard.approvedCount)}
            />
            <StatCard
              label={t('procurement.dashboard.totalPurchaseAmount')}
              value={formatCurrency(dashboard.totalPurchaseAmount)}
            />
          </div>

          <section className='space-y-3'>
            <h2 className='font-heading text-lg font-medium'>
              {t('procurement.dashboard.supplierAmounts')}
            </h2>
            {dashboard.supplierAmounts.length === 0 ? (
              <EmptyState message={t('procurement.dashboard.noData')} />
            ) : (
              <Table>
                <THead>
                  <TH>{t('procurement.suppliers.name')}</TH>
                  <TH className='text-right'>
                    {t('procurement.dashboard.amount')}
                  </TH>
                </THead>
                <tbody>
                  {dashboard.supplierAmounts.map((row) => (
                    <TR key={row.supplierId}>
                      <TD>{row.supplierName}</TD>
                      <TD className='text-right tabular-nums'>
                        {formatCurrency(row.amount)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section className='space-y-3'>
            <h2 className='font-heading text-lg font-medium'>
              {t('procurement.dashboard.recentOrders')}
            </h2>
            {dashboard.recentOrders.length === 0 ? (
              <EmptyState message={t('procurement.dashboard.noData')} />
            ) : (
              <Table>
                <THead>
                  <TH>{t('procurement.orders.orderNo')}</TH>
                  <TH>{t('procurement.orders.supplier')}</TH>
                  <TH>{t('procurement.orders.status')}</TH>
                  <TH>{t('procurement.orders.receiptStatus')}</TH>
                  <TH className='text-right'>
                    {t('procurement.orders.amount')}
                  </TH>
                </THead>
                <tbody>
                  {dashboard.recentOrders.map((order) => (
                    <TR key={order.id}>
                      <TD className='font-mono text-xs'>{order.orderNo}</TD>
                      <TD>{order.supplierName ?? '—'}</TD>
                      <TD>
                        <OrderStatusBadge status={order.status} />
                      </TD>
                      <TD>
                        <ReceiptStatusBadge status={order.receiptStatus} />
                      </TD>
                      <TD className='text-right tabular-nums'>
                        {formatCurrency(order.totalAmount)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </>
      ) : (
        <EmptyState message={t('procurement.dashboard.noData')} />
      )}
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className='rounded-lg border border-border bg-card px-4 py-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-1 font-heading text-2xl font-semibold tabular-nums'>
        {value}
      </p>
    </div>
  );
}
