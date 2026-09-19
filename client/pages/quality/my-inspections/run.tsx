import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckCircle2 } from 'lucide-react';
import { Fragment, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { RouteChildPage } from '@/components/route-child-page';
import { AttachmentSection } from '@/components/quality/attachments';
import {
  EmptyBlock,
  ErrorBlock,
  FieldError,
  LoadingBlock,
  SimpleSelect,
  StatusBadge,
} from '@/components/quality/parts';
import { useApiData } from '@/components/quality/use-api-data';
import {
  ITEM_RESULT_LABEL,
  ITEM_RESULT_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  fieldErrorMessages,
  formatDateTime,
  loadTask,
  qualityErrorText,
  recordItem,
  submitTask,
  tableClasses,
  validateItemDraft,
  withoutFieldError,
  type QualityItem,
  type QualityTaskDetail,
} from '@/components/quality/lib';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Draft {
  result: string;
  measuredValue: string;
  remark: string;
}

export default function RunInspectionPage(): ReactElement {
  const { t } = useTranslation();
  const { taskId } = useParams();
  const state = useApiData((api) => loadTask(api, taskId ?? ''), taskId);

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-6xl'>
        <Breadcrumbs />
        {state.loading ? (
          <LoadingBlock label={t('status.loading')} />
        ) : state.error ? (
          <ErrorBlock message={state.error} onRetry={state.reload} />
        ) : state.data ? (
          <InspectionRun key={state.data.id} task={state.data} />
        ) : (
          <EmptyBlock message={t('quality.tasks.notFound')} />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}

function seedDrafts(task: QualityTaskDetail): Record<string, Draft> {
  return Object.fromEntries(
    task.items.map((item) => [
      item.id,
      {
        result: item.result === 'pending' ? '' : item.result,
        measuredValue: item.measuredValue ?? '',
        remark: item.remark ?? '',
      },
    ]),
  );
}

function InspectionRun({
  task: initial,
}: {
  readonly task: QualityTaskDetail;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // Server mutations replace this override; the loader's value is the initial
  // and externally refreshed source. The parent keys the component by task id,
  // so drafts are re-seeded only when a different task is opened.
  const [override, setOverride] = useState<QualityTaskDetail>();
  const task = override ?? initial;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    seedDrafts(initial),
  );
  const [busyItem, setBusyItem] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [savedItem, setSavedItem] = useState<string>();
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [expandedItem, setExpandedItem] = useState<string>();
  const [error, setError] = useState<string>();

  const submitted = task.status === 'submitted';
  const allRecorded = task.items.every(
    (item) =>
      drafts[item.id]?.result === 'qualified' ||
      drafts[item.id]?.result === 'unqualified' ||
      item.result !== 'pending',
  );

  function updateDraft(itemId: string, patch: Partial<Draft>): void {
    setDrafts((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch },
    }));
    setItemErrors((current) => withoutFieldError(current, itemId));
  }

  async function saveItem(item: QualityItem): Promise<void> {
    const draft = drafts[item.id];
    setError(undefined);
    setSavedItem(undefined);
    const validation = validateItemDraft({
      result: draft.result,
      remark: draft.remark,
    });
    const messages = fieldErrorMessages(validation, t);
    if (validation.length > 0) {
      setItemErrors((current) => ({
        ...current,
        [item.id]: messages.remark ?? messages.result ?? '',
      }));
      return;
    }
    setItemErrors((current) => ({ ...current, [item.id]: '' }));
    setBusyItem(item.id);
    try {
      const updated = await recordItem(api, task.id, item.id, {
        result: draft.result,
        measuredValue: draft.measuredValue.trim() || null,
        remark: draft.remark.trim() || null,
      });
      setOverride(updated);
      setSavedItem(item.id);
    } catch (saveError: unknown) {
      setError(qualityErrorText(saveError, t));
    } finally {
      setBusyItem(undefined);
    }
  }

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(undefined);
    try {
      const updated = await submitTask(api, task.id);
      setOverride(updated);
    } catch (submitError: unknown) {
      setError(qualityErrorText(submitError, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='space-y-6'>
      <header className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='font-heading text-2xl font-semibold'>{task.taskNo}</h1>
          <StatusBadge tone={TASK_STATUS_TONE[task.status]}>
            {t(TASK_STATUS_LABEL[task.status])}
          </StatusBadge>
        </div>
        <p className='text-sm text-muted-foreground'>
          {task.productCode} {task.productName} · {task.batchNo} ·{' '}
          {t('quality.myInspections.sample', { count: task.sampleSize })} ·{' '}
          {t('quality.tasks.progress', {
            completed: task.completedItemCount,
            total: task.itemCount,
          })}
        </p>
        {task.submittedAt ? (
          <p className='text-xs text-muted-foreground'>
            {t('quality.tasks.column.submittedAt')}:{' '}
            {formatDateTime(task.submittedAt)}
          </p>
        ) : null}
      </header>

      {error ? <ErrorBlock message={error} /> : null}

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
                {t('quality.tasks.item.result')}
              </th>
              <th className={tableClasses.headCell}>
                {t('quality.tasks.item.measuredValue')}
              </th>
              <th className={tableClasses.headCell}>
                {t('quality.tasks.item.remark')}
              </th>
              <th className={tableClasses.headCell}>
                {t('quality.attachments.title')}
              </th>
              <th className={tableClasses.headCell} />
            </tr>
          </thead>
          <tbody>
            {task.items.map((item) => {
              const draft = drafts[item.id] ?? {
                result: '',
                measuredValue: '',
                remark: '',
              };
              return (
                <Fragment key={item.id}>
                  <tr className={tableClasses.row}>
                    <td className={tableClasses.cellMuted}>{item.seq}</td>
                    <td className={tableClasses.cell}>{item.name}</td>
                    <td className={tableClasses.cellMuted}>
                      {item.standard ?? '—'}
                    </td>
                    <td className={tableClasses.cell}>
                      {submitted ? (
                        <StatusBadge tone={ITEM_RESULT_TONE[item.result]}>
                          {t(ITEM_RESULT_LABEL[item.result])}
                        </StatusBadge>
                      ) : (
                        <SimpleSelect
                          ariaLabel={`${item.name} ${t('quality.tasks.item.result')}`}
                          className='w-28'
                          options={[
                            {
                              value: 'qualified',
                              label: t('quality.itemResult.qualified'),
                            },
                            {
                              value: 'unqualified',
                              label: t('quality.itemResult.unqualified'),
                            },
                          ]}
                          placeholder={t('quality.itemResult.pending')}
                          value={draft.result}
                          onValueChange={(value) =>
                            updateDraft(item.id, { result: value })
                          }
                        />
                      )}
                    </td>
                    <td className={tableClasses.cell}>
                      {submitted ? (
                        (item.measuredValue ?? '—')
                      ) : (
                        <Input
                          aria-label={`${item.name} ${t('quality.tasks.item.measuredValue')}`}
                          className='w-28'
                          value={draft.measuredValue}
                          onChange={(event) =>
                            updateDraft(item.id, {
                              measuredValue: event.target.value,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className={tableClasses.cell}>
                      {submitted ? (
                        (item.remark ?? '—')
                      ) : (
                        <>
                          <Input
                            aria-label={`${item.name} ${t('quality.tasks.item.remark')}`}
                            aria-invalid={Boolean(itemErrors[item.id])}
                            value={draft.remark}
                            onChange={(event) =>
                              updateDraft(item.id, {
                                remark: event.target.value,
                              })
                            }
                          />
                          <FieldError>{itemErrors[item.id]}</FieldError>
                        </>
                      )}
                    </td>
                    <td className={tableClasses.cell}>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        aria-expanded={expandedItem === item.id}
                        onClick={() =>
                          setExpandedItem((current) =>
                            current === item.id ? undefined : item.id,
                          )
                        }
                      >
                        {t('quality.attachments.open')}
                      </Button>
                    </td>
                    <td className={tableClasses.cell}>
                      {submitted ? null : (
                        <div className='flex items-center gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={
                              busyItem === item.id || draft.result === ''
                            }
                            onClick={() => void saveItem(item)}
                          >
                            {t('quality.action.save')}
                          </Button>
                          {savedItem === item.id ? (
                            <CheckCircle2
                              aria-hidden='true'
                              className='size-4 text-chart-2'
                            />
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandedItem === item.id ? (
                    <tr className={tableClasses.row}>
                      <td className={tableClasses.cell} colSpan={8}>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {submitted ? (
        <p className='rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground'>
          {t('quality.myInspections.submittedNotice')}
        </p>
      ) : (
        <div className='flex flex-wrap items-center justify-end gap-3'>
          {!allRecorded ? (
            <span className='text-sm text-muted-foreground'>
              {t('quality.myInspections.incompleteHint')}
            </span>
          ) : null}
          <Button
            type='button'
            disabled={submitting || !allRecorded}
            onClick={() => void submit()}
          >
            {t('quality.myInspections.submit')}
          </Button>
        </div>
      )}
    </div>
  );
}
