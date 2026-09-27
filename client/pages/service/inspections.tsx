import { useTranslation } from '@nocobase/i18n/client';
import { PlayIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toast';

import {
  describeError,
  useIdentity,
  useResource,
  useServiceApi,
} from '../../service/api.js';
import {
  asText,
  formatDate,
  formatDateTime,
  todayKey,
} from '../../service/format.js';
import { usePagedList } from '../../service/use-paged-list.js';
import {
  AlertNotice,
  FilterSelect,
  ListPager,
  QueryState,
  SectionCard,
  StatusBadge,
} from '../../service/ui.js';

const TASK_STATUSES = ['pending', 'in_progress', 'done', 'skipped'];

/**
 * Inspection plans and their daily tasks. The 9am Asia/Shanghai run creates at
 * most one task per device per day; a manual run uses the same dedupe gate.
 */
export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const identity = useIdentity();
  const list = usePagedList(20);
  const [runDate, setRunDate] = useState(() => todayKey());
  const [running, setRunning] = useState(false);
  const canWrite = identity.data?.manageInspections === true;

  const tasks = useResource(list.key, () => api.listInspections(list.query));
  const plans = useResource('service:inspection-plans', () =>
    api.listInspectionPlans(),
  );

  const rows = tasks.data?.data ?? [];
  const total = (tasks.data?.meta?.total as number | undefined) ?? 0;

  const run = async (): Promise<void> => {
    setRunning(true);
    try {
      const result = await api.runInspections({ runDate });
      toast.add({
        type: 'success',
        title: t('service.inspections.runDone'),
        description: t('service.inspections.runSummary', {
          created: asText(result.created) || '0',
          skipped: asText(result.skipped) || '0',
        }),
      });
      tasks.reload();
      plans.reload();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.inspections.runFailed'),
        description: describeError(error),
      });
    } finally {
      setRunning(false);
    }
  };

  const updateTask = async (
    id: number,
    status: string,
    result?: string,
  ): Promise<void> => {
    try {
      await api.updateInspection(id, { status, result });
      toast.add({ type: 'success', title: t('service.common.saved') });
      tasks.reload();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.common.saveFailed'),
        description: describeError(error),
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
      />

      {canWrite ? (
        <SectionCard title={t('service.inspections.runNow')}>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='run-date'>
                {t('service.inspections.runDate')}
              </Label>
              <Input
                id='run-date'
                type='date'
                className='w-44'
                value={runDate}
                onChange={(event) => setRunDate(event.target.value)}
              />
            </div>
            <Button disabled={running} onClick={() => void run()}>
              <PlayIcon />
              {running
                ? t('service.inspections.running')
                : t('service.inspections.run')}
            </Button>
            <p className='text-sm text-muted-foreground'>
              {t('service.inspections.runHint')}
            </p>
          </div>
        </SectionCard>
      ) : (
        <AlertNotice title={t('service.inspections.readOnlyTitle')}>
          {t('service.inspections.readOnly')}
        </AlertNotice>
      )}

      <SectionCard title={t('service.inspections.plans')}>
        <QueryState
          loading={plans.loading}
          error={plans.error}
          empty={(plans.data?.length ?? 0) === 0}
          onRetry={plans.reload}
          skeletonRows={2}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('service.inspections.planName')}</TableHead>
                <TableHead>{t('service.devices.serialNumber')}</TableHead>
                <TableHead>{t('service.inspections.cron')}</TableHead>
                <TableHead>{t('service.inspections.timezone')}</TableHead>
                <TableHead>{t('service.inspections.enabled')}</TableHead>
                <TableHead>{t('service.inspections.lastRunAt')}</TableHead>
                <TableHead>{t('service.inspections.nextRunAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans.data ?? []).map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>{asText(plan.name)}</TableCell>
                  <TableCell>
                    <Link
                      className='font-medium hover:underline'
                      to={`/service/devices/${asText(plan.deviceId)}`}
                    >
                      {asText(plan.deviceSerial)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className='text-xs'>{asText(plan.cron)}</code>
                  </TableCell>
                  <TableCell>{asText(plan.timezone)}</TableCell>
                  <TableCell>
                    {plan.enabled
                      ? t('service.common.yes')
                      : t('service.common.no')}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {formatDateTime(plan.lastRunAt)}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {formatDateTime(plan.nextRunAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </QueryState>
      </SectionCard>

      <SectionCard title={t('service.inspections.tasks')}>
        <div className='mb-4 flex flex-wrap items-center gap-2'>
          <FilterSelect
            allLabel={t('service.common.all')}
            value={list.filters.status ?? 'all'}
            onValueChange={(value) =>
              list.setFilter('status', value === 'all' ? undefined : value)
            }
            options={TASK_STATUSES.map((status) => ({
              value: status,
              label: t(`service.status.inspection.${status}`, {
                defaultValue: status,
              }),
            }))}
          />
          <div className='space-y-2'>
            <Input
              type='date'
              className='w-44'
              value={list.filters.runDate ?? ''}
              onChange={(event) =>
                list.setFilter('runDate', event.target.value || undefined)
              }
            />
          </div>
          <Button variant='ghost' size='sm' onClick={() => list.reset()}>
            {t('service.common.clearFilters')}
          </Button>
        </div>

        <QueryState
          loading={tasks.loading}
          error={tasks.error}
          empty={rows.length === 0}
          onRetry={tasks.reload}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('service.inspections.runDate')}</TableHead>
                <TableHead>{t('service.devices.serialNumber')}</TableHead>
                <TableHead>{t('service.inspections.status')}</TableHead>
                <TableHead>{t('service.inspections.triggeredBy')}</TableHead>
                <TableHead>{t('service.inspections.result')}</TableHead>
                <TableHead>{t('service.inspections.updatedAt')}</TableHead>
                {canWrite ? (
                  <TableHead>{t('service.common.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{formatDate(task.runDate)}</TableCell>
                  <TableCell>
                    <Link
                      className='font-medium hover:underline'
                      to={`/service/devices/${asText(task.deviceId)}`}
                    >
                      {asText(task.deviceSerial)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind='inspection' value={task.status} />
                  </TableCell>
                  <TableCell>
                    {t(
                      `service.inspections.trigger.${asText(task.triggeredBy)}`,
                      {
                        defaultValue: asText(task.triggeredBy),
                      },
                    )}
                  </TableCell>
                  <TableCell className='max-w-64 truncate'>
                    {asText(task.result) || '—'}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {formatDateTime(task.updatedAt)}
                  </TableCell>
                  {canWrite ? (
                    <TableCell>
                      <span className='flex gap-2'>
                        {task.status === 'pending' ? (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              void updateTask(task.id, 'in_progress')
                            }
                          >
                            {t('service.inspections.start')}
                          </Button>
                        ) : null}
                        {task.status !== 'done' ? (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              void updateTask(
                                task.id,
                                'done',
                                t('service.inspections.checkedOk'),
                              )
                            }
                          >
                            {t('service.inspections.markDone')}
                          </Button>
                        ) : null}
                      </span>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager
            page={list.page}
            pageSize={list.pageSize}
            total={total}
            onPageChange={(page) => list.setPage(page)}
          />
        </QueryState>
      </SectionCard>
    </PageContainer>
  );
}
