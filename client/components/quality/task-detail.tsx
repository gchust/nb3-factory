import { useTranslation } from '@nocobase/i18n/client';
import { Fragment, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
} from '@/components/quality/parts';
import { AttachmentSection } from '@/components/quality/attachments';
import { Button } from '@/components/ui/button';
import { useApiData } from '@/components/quality/use-api-data';
import {
  ITEM_RESULT_LABEL,
  ITEM_RESULT_TONE,
  NONCONFORMANCE_STATUS_LABEL,
  NONCONFORMANCE_STATUS_TONE,
  TASK_RESULT_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  formatDateTime,
  loadTask,
  tableClasses,
  type QualityItem,
  type QualityNonconformance,
  type QualityTaskDetail,
} from '@/components/quality/lib';

/** Shared inspection-task detail: header, check items, linked rectifications. */
export function TaskDetailPanel({
  taskId,
}: {
  readonly taskId: string;
}): ReactElement {
  const { t } = useTranslation();
  const state = useApiData((api) => loadTask(api, taskId), taskId);

  if (state.loading) return <LoadingBlock label={t('status.loading')} />;
  if (state.error) {
    return <ErrorBlock message={state.error} onRetry={state.reload} />;
  }
  if (!state.data) return <EmptyBlock message={t('quality.tasks.notFound')} />;
  const task = state.data;

  return (
    <div className='space-y-6'>
      <TaskSummary task={task} />
      <ItemTable items={task.items} />
      <NonconformanceTable rows={task.nonconformances} />
    </div>
  );
}

function TaskSummary({ task }: { readonly task: QualityTaskDetail }) {
  const { t } = useTranslation();
  const rows: readonly [string, string][] = [
    [t('quality.tasks.column.taskNo'), task.taskNo],
    [
      t('quality.tasks.column.product'),
      `${task.productCode} ${task.productName}`,
    ],
    [t('quality.tasks.column.batch'), task.batchNo],
    [
      t('quality.tasks.column.inspector'),
      task.inspectorName || task.inspectorId,
    ],
    [
      t('quality.tasks.field.productionLead'),
      task.assignedLeadName || task.assignedLeadId || '—',
    ],
    [t('quality.tasks.field.sampleSize'), String(task.sampleSize)],
    [t('quality.tasks.column.submittedAt'), formatDateTime(task.submittedAt)],
    [t('quality.tasks.field.remark'), task.remark ?? '—'],
  ];
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <StatusBadge tone={TASK_STATUS_TONE[task.status]}>
          {t(TASK_STATUS_LABEL[task.status])}
        </StatusBadge>
        {task.result ? (
          <StatusBadge
            tone={task.result === 'qualified' ? 'success' : 'danger'}
          >
            {t(TASK_RESULT_LABEL[task.result])}
          </StatusBadge>
        ) : null}
        <span className='text-sm text-muted-foreground'>
          {t('quality.tasks.progress', {
            completed: task.completedItemCount,
            total: task.itemCount,
          })}
        </span>
      </div>
      <dl className='grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4'>
        {rows.map(([label, value]) => (
          <div key={label} className='min-w-0'>
            <dt className='text-xs text-muted-foreground'>{label}</dt>
            <dd className='truncate font-medium'>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ItemTable({
  items,
}: {
  readonly items: readonly QualityItem[];
}): ReactElement {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string>();
  return (
    <section className='space-y-2'>
      <h2 className='font-heading text-lg font-semibold'>
        {t('quality.tasks.itemsTitle')}
      </h2>
      {items.length === 0 ? (
        <EmptyBlock message={t('quality.tasks.noItems')} />
      ) : (
        <div className={tableClasses.wrap}>
          <table className={tableClasses.table}>
            <thead>
              <tr className={tableClasses.headRow}>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.item.seq')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.item.name')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.item.standard')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.item.measuredValue')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.item.result')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.tasks.item.remark')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.attachments.title')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Fragment key={item.id}>
                  <tr className={tableClasses.row}>
                    <td className={tableClasses.cellMuted}>{item.seq}</td>
                    <td className={tableClasses.cell}>{item.name}</td>
                    <td className={tableClasses.cellMuted}>
                      {item.standard ?? '—'}
                    </td>
                    <td className={tableClasses.cell}>
                      {item.measuredValue ?? '—'}
                    </td>
                    <td className={tableClasses.cell}>
                      <StatusBadge tone={ITEM_RESULT_TONE[item.result]}>
                        {t(ITEM_RESULT_LABEL[item.result])}
                      </StatusBadge>
                    </td>
                    <td className={tableClasses.cellMuted}>
                      {item.remark ?? '—'}
                    </td>
                    <td className={tableClasses.cell}>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        aria-expanded={expanded === item.id}
                        onClick={() =>
                          setExpanded((current) =>
                            current === item.id ? undefined : item.id,
                          )
                        }
                      >
                        {t('quality.attachments.open')}
                      </Button>
                    </td>
                  </tr>
                  {expanded === item.id ? (
                    <tr className={tableClasses.row}>
                      <td className={tableClasses.cell} colSpan={7}>
                        <div className='space-y-3 py-1'>
                          <AttachmentSection
                            targetType='item'
                            targetId={item.id}
                            category='item_photo'
                            title={t('quality.attachments.itemPhoto')}
                          />
                          <AttachmentSection
                            targetType='item'
                            targetId={item.id}
                            category='item_report'
                            title={t('quality.attachments.itemReport')}
                          />
                          <AttachmentSection
                            targetType='item'
                            targetId={item.id}
                            category='item_note'
                            title={t('quality.attachments.itemNote')}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NonconformanceTable({
  rows,
}: {
  readonly rows: readonly QualityNonconformance[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='space-y-2'>
      <h2 className='font-heading text-lg font-semibold'>
        {t('quality.tasks.nonconformancesTitle')}
      </h2>
      {rows.length === 0 ? (
        <EmptyBlock message={t('quality.tasks.noNonconformances')} />
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
                  {t('quality.nc.column.assignee')}
                </th>
                <th className={tableClasses.headCell}>
                  {t('quality.nc.column.status')}
                </th>
                <th className={tableClasses.headCell} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={tableClasses.row}>
                  <td className={`${tableClasses.cell} font-medium`}>
                    {row.code}
                  </td>
                  <td className={tableClasses.cell}>{row.title}</td>
                  <td className={tableClasses.cellMuted}>
                    {row.assignedToName || row.assignedToId}
                  </td>
                  <td className={tableClasses.cell}>
                    <StatusBadge tone={NONCONFORMANCE_STATUS_TONE[row.status]}>
                      {t(NONCONFORMANCE_STATUS_LABEL[row.status])}
                    </StatusBadge>
                  </td>
                  <td className={tableClasses.cell}>
                    <Link
                      className='text-primary underline-offset-4 hover:underline'
                      to={`/quality/rectifications/${row.id}`}
                    >
                      {t('quality.action.handle')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
