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
  formatDateTime,
  loadTasks,
  tableClasses,
  type QualityTask,
} from '@/components/quality/lib';
import { Input } from '@/components/ui/input';

export default function QualityResultsPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [result, setResult] = useState('all');
  const state = useApiData(
    (api) =>
      loadTasks(api, {
        submittedOnly: true,
        search: search.trim() || undefined,
        result: result === 'all' ? undefined : result,
      }),
    `${search}|${result}`,
  );

  const resultOptions = [
    { value: 'all', label: t('quality.filter.allResults') },
    { value: 'qualified', label: t('quality.result.qualified') },
    { value: 'unqualified', label: t('quality.result.unqualified') },
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('quality.results.title')}
        description={t('quality.results.description')}
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
          ariaLabel={t('quality.filter.result')}
          className='w-36'
          options={resultOptions}
          value={result}
          onValueChange={setResult}
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
        <EmptyBlock message={t('quality.results.empty')} />
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
                  {t('quality.tasks.column.inspector')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.submittedAt')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.result')}
                </th>
                <th className={tableClasses.headCell} />
              </tr>
            </thead>
            <tbody>
              {(state.data ?? []).map((task) => (
                <ResultRow key={task.id} task={task} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Outlet />
    </PageContainer>
  );
}

function ResultRow({ task }: { readonly task: QualityTask }): ReactElement {
  const { t } = useTranslation();
  return (
    <tr className={tableClasses.row}>
      <td className={`${tableClasses.cell} font-medium`}>{task.taskNo}</td>
      <td className={tableClasses.cell}>
        {task.productCode} {task.productName}
      </td>
      <td className={tableClasses.cellMuted}>{task.batchNo}</td>
      <td className={tableClasses.cellMuted}>
        {task.inspectorName || task.inspectorId}
      </td>
      <td className={tableClasses.cellMuted}>
        {formatDateTime(task.submittedAt)}
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
        <Link
          className='text-primary underline-offset-4 hover:underline'
          to={task.id}
        >
          {t('quality.action.detail')}
        </Link>
      </td>
    </tr>
  );
}
