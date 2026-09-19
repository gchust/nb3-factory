import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SimpleSelect,
  StatusBadge,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  BATCH_STATUS_LABEL,
  formatDate,
  loadBatches,
  loadProducts,
  loadSession,
  tableClasses,
  type QualityBatch,
} from '@/components/quality/lib';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function QualityBatchesPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('all');
  const [status, setStatus] = useState('all');
  const state = useApiData(async (api) => {
    const [products, batches, session] = await Promise.all([
      loadProducts(api),
      loadBatches(api, {
        search: search.trim() || undefined,
        productId: productId === 'all' ? undefined : productId,
        status: status === 'all' ? undefined : status,
      }),
      loadSession(api),
    ]);
    return { products, batches, session };
  }, `${search}|${productId}|${status}`);

  const productOptions = [
    { value: 'all', label: t('quality.filter.allProducts') },
    ...(state.data?.products ?? []).map((product) => ({
      value: product.id,
      label: `${product.code} ${product.name}`,
    })),
  ];
  const statusOptions = [
    { value: 'all', label: t('quality.filter.allStatuses') },
    { value: 'completed', label: t('quality.batchStatus.completed') },
    { value: 'in_production', label: t('quality.batchStatus.inProduction') },
    { value: 'hold', label: t('quality.batchStatus.hold') },
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('quality.batches.title')}
        description={t('quality.batches.description')}
        actions={
          state.data?.session.capabilities.supervise ? (
            <>
              <Button
                variant='outline'
                nativeButton={false}
                render={<Link to='create-product' />}
              >
                <Plus aria-hidden='true' />
                {t('quality.batches.newProduct')}
              </Button>
              <Button nativeButton={false} render={<Link to='create' />}>
                <Plus aria-hidden='true' />
                {t('quality.batches.newBatch')}
              </Button>
            </>
          ) : null
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <Input
          aria-label={t('quality.batches.search')}
          className='w-64'
          placeholder={t('quality.batches.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SimpleSelect
          ariaLabel={t('quality.filter.product')}
          className='w-56'
          options={productOptions}
          value={productId}
          onValueChange={setProductId}
        />
        <SimpleSelect
          ariaLabel={t('quality.filter.status')}
          className='w-36'
          options={statusOptions}
          value={status}
          onValueChange={setStatus}
        />
      </div>

      {state.loading ? (
        <LoadingBlock label={t('status.loading')} />
      ) : state.error ? (
        <ErrorBlock
          message={state.error}
          onRetry={state.reload}
          retryLabel={t('status.retry')}
        />
      ) : (state.data?.batches.length ?? 0) === 0 ? (
        <EmptyBlock message={t('quality.batches.empty')} />
      ) : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead>
              <tr className={tableClasses.headRow}>
                <th className={tableClasses.headCell}>
                  {t('quality.batches.column.batchNo')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.batches.column.product')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.batches.column.quantity')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.batches.column.line')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.batches.column.producedAt')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.batches.column.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(state.data?.batches ?? []).map((batch) => (
                <BatchRow key={batch.id} batch={batch} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Outlet />
    </PageContainer>
  );
}

function BatchRow({ batch }: { readonly batch: QualityBatch }): ReactElement {
  const { t } = useTranslation();
  return (
    <tr className={tableClasses.row}>
      <td className={`${tableClasses.cell} font-medium`}>{batch.batchNo}</td>
      <td className={tableClasses.cell}>
        {batch.productCode} {batch.productName}
      </td>
      <td className={tableClasses.cell}>{batch.quantity}</td>
      <td className={tableClasses.cellMuted}>{batch.productionLine ?? '—'}</td>
      <td className={tableClasses.cellMuted}>{formatDate(batch.producedAt)}</td>
      <td className={tableClasses.cell}>
        <StatusBadge tone={batch.status === 'completed' ? 'success' : 'info'}>
          {t(BATCH_STATUS_LABEL[batch.status] ?? batch.status)}
        </StatusBadge>
      </td>
    </tr>
  );
}
