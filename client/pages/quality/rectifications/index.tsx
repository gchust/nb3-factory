import { useTranslation } from '@nocobase/i18n/client';
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
  NONCONFORMANCE_STATUS_LABEL,
  NONCONFORMANCE_STATUS_TONE,
  formatDateTime,
  loadNonconformances,
  tableClasses,
  type QualityNonconformance,
} from '@/components/quality/lib';
import { Input } from '@/components/ui/input';

export default function QualityRectificationsPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const state = useApiData(
    (api) =>
      loadNonconformances(api, {
        search: search.trim() || undefined,
        status: status === 'all' ? undefined : status,
      }),
    `${search}|${status}`,
  );

  const statusOptions = [
    { value: 'all', label: t('quality.filter.allStatuses') },
    { value: 'open', label: t('quality.ncStatus.open') },
    { value: 'processing', label: t('quality.ncStatus.processing') },
    { value: 'pending_review', label: t('quality.ncStatus.pendingReview') },
    { value: 'closed', label: t('quality.ncStatus.closed') },
    { value: 'returned', label: t('quality.ncStatus.returned') },
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('quality.rectifications.title')}
        description={t('quality.rectifications.description')}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          aria-label={t('quality.nc.column.code')}
          className='w-56'
          placeholder={t('quality.rectifications.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SimpleSelect
          ariaLabel={t('quality.filter.status')}
          className='w-40'
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
      ) : (state.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('quality.rectifications.empty')} />
      ) : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead>
              <tr className={tableClasses.headRow}>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.code')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.title')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.product')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.assignee')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.status')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.updatedAt')}
                </th>
                <th className={tableClasses.headCell} />
              </tr>
            </thead>
            <tbody>
              {(state.data ?? []).map((row) => (
                <RectificationRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Outlet />
    </PageContainer>
  );
}

function RectificationRow({
  row,
}: {
  readonly row: QualityNonconformance;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <tr className={tableClasses.row}>
      <td className={`${tableClasses.cell} font-medium`}>{row.code}</td>
      <td className={tableClasses.cell}>{row.title}</td>
      <td className={tableClasses.cellMuted}>
        {row.productName} · {row.batchNo}
      </td>
      <td className={tableClasses.cellMuted}>
        {row.assignedToName || row.assignedToId}
      </td>
      <td className={tableClasses.cell}>
        <StatusBadge tone={NONCONFORMANCE_STATUS_TONE[row.status]}>
          {t(NONCONFORMANCE_STATUS_LABEL[row.status])}
        </StatusBadge>
      </td>
      <td className={tableClasses.cellMuted}>
        {formatDateTime(row.handledAt ?? row.createdAt)}
      </td>
      <td className={tableClasses.cell}>
        <Link
          className='text-primary underline-offset-4 hover:underline'
          to={row.id}
        >
          {t('quality.action.handle')}
        </Link>
      </td>
    </tr>
  );
}
