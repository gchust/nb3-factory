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
  TASK_RESULT_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  loadTasks,
  tableClasses,
  type QualityTask,
} from '@/components/quality/lib';
import { Input } from '@/components/ui/input';

export default function MyInspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const state = useApiData(
    (api) =>
      loadTasks(api, {
        search: search.trim() || undefined,
        status: status === 'all' ? undefined : status,
      }),
    `${search}|${status}`,
  );

  const statusOptions = [
    { value: 'all', label: t('quality.filter.allStatuses') },
    { value: 'pending', label: t('quality.taskStatus.pending') },
    { value: 'in_progress', label: t('quality.taskStatus.inProgress') },
    { value: 'submitted', label: t('quality.taskStatus.submitted') },
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('quality.myInspections.title')}
        description={t('quality.myInspections.description')}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          aria-label={t('quality.tasks.search')}
          className='w-56'
          placeholder={t('quality.tasks.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
      ) : (state.data?.length ?? 0) === 0 ? (
        <EmptyBlock message={t('quality.myInspections.empty')} />
      ) : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead>
              <tr className={tableClasses.headRow}>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.taskNo')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.product')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.batch')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.progress')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.status')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.result')}
                </th>
                <th className={tableClasses.headCell} />
              </tr>
            </thead>
            <tbody>
              {(state.data ?? []).map((task) => (
                <MyTaskRow key={task.id} task={task} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Outlet />
    </PageContainer>
  );
}

function MyTaskRow({ task }: { readonly task: QualityTask }): ReactElement {
  const { t } = useTranslation();
  const finished = task.status === 'submitted';
  return (
    <tr className={tableClasses.row}>
      <td className={`${tableClasses.cell} font-medium`}>{task.taskNo}</td>
      <td className={tableClasses.cell}>
        {task.productCode} {task.productName}
      </td>
      <td className={tableClasses.cellMuted}>{task.batchNo}</td>
      <td className={tableClasses.cellMuted}>
        {task.completedItemCount}/{task.itemCount}
      </td>
      <td className={tableClasses.cell}>
        <StatusBadge tone={TASK_STATUS_TONE[task.status]}>
          {t(TASK_STATUS_LABEL[task.status])}
        </StatusBadge>
      </td>
      <td className={tableClasses.cell}>
        {task.result ? (
          <StatusBadge
            tone={task.result === 'qualified' ? 'success' : 'danger'}
          >
            {t(TASK_RESULT_LABEL[task.result])}
          </StatusBadge>
        ) : (
          <span className='text-muted-foreground'>
            {t('quality.result.none')}
          </span>
        )}
      </td>
      <td className={tableClasses.cell}>
        {finished ? (
          <Link
            className='text-primary underline-offset-4 hover:underline'
            to={`/quality/results/${task.id}`}
          >
            {t('quality.action.detail')}
          </Link>
        ) : (
          <Link
            className='text-primary underline-offset-4 hover:underline'
            to={task.id}
          >
            {t('quality.action.record')}
          </Link>
        )}
        <span className='ml-3 text-xs text-muted-foreground'>
          {t('quality.myInspections.sample', { count: task.sampleSize })}
        </span>
      </td>
    </tr>
  );
}
