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
  TASK_RESULT_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  loadProducts,
  loadSession,
  loadTasks,
  tableClasses,
  type QualityTask,
} from '@/components/quality/lib';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function QualityTasksPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [result, setResult] = useState('all');
  const [productId, setProductId] = useState('all');
  const state = useApiData(async (api) => {
    const [tasks, products, session] = await Promise.all([
      loadTasks(api, {
        search: search.trim() || undefined,
        status: status === 'all' ? undefined : status,
        result: result === 'all' ? undefined : result,
        productId: productId === 'all' ? undefined : productId,
      }),
      loadProducts(api),
      loadSession(api),
    ]);
    return { tasks, products, session };
  }, `${search}|${status}|${result}|${productId}`);

  const productOptions = [
    { value: 'all', label: t('quality.filter.allProducts') },
    ...(state.data?.products ?? []).map((product) => ({
      value: product.id,
      label: `${product.code} ${product.name}`,
    })),
  ];
  const statusOptions = [
    { value: 'all', label: t('quality.filter.allStatuses') },
    { value: 'pending', label: t('quality.taskStatus.pending') },
    { value: 'in_progress', label: t('quality.taskStatus.inProgress') },
    { value: 'submitted', label: t('quality.taskStatus.submitted') },
  ];
  const resultOptions = [
    { value: 'all', label: t('quality.filter.allResults') },
    { value: 'qualified', label: t('quality.result.qualified') },
    { value: 'unqualified', label: t('quality.result.unqualified') },
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('quality.tasks.title')}
        description={t('quality.tasks.description')}
        actions={
          state.data?.session.capabilities.supervise ? (
            <Button nativeButton={false} render={<Link to='create' />}>
              <Plus aria-hidden='true' />
              {t('quality.tasks.newTask')}
            </Button>
          ) : null
        }
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
          ariaLabel={t('quality.filter.product')}
          className='w-52'
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
      ) : (state.data?.tasks.length ?? 0) === 0 ? (
        <EmptyBlock message={t('quality.tasks.empty')} />
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
                  {t('quality.tasks.column.progress')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.status')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.result')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.column.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(state.data?.tasks ?? []).map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Outlet />
    </PageContainer>
  );
}

export function TaskRow({
  task,
  detailBase = '',
}: {
  readonly task: QualityTask;
  readonly detailBase?: string;
}): ReactElement {
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
        <Link
          className='text-primary underline-offset-4 hover:underline'
          to={`${detailBase}${task.id}`}
        >
          {t('quality.action.detail')}
        </Link>
      </td>
    </tr>
  );
}
