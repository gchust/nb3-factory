import { useTranslation } from '@nocobase/i18n/client';
import { Play } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { StatusBadge } from './components/status-badge.js';
import {
  INSPECTION_STATUS_OPTIONS,
  REGION_OPTIONS,
  formatDateTime,
  formatResult,
  inspectionStatusLabel,
  regionLabel,
  todayIso,
} from './lib/format.js';
import { useCaller, useServiceClient } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

export default function ServiceInspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [date, setDate] = useState(() => todayIso());
  const [status, setStatus] = useState('all');
  const [region, setRegion] = useState('all');
  const [completing, setCompleting] = useState<number>();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canManage =
    caller.data?.caller.capabilities['inspections.manage'] === true;

  const list = useServiceQuery(
    () =>
      client.listInspections({
        date,
        status: status === 'all' ? undefined : status,
        region: region === 'all' ? undefined : region,
      }),
    `inspections:${date}:${status}:${region}`,
  );

  const plans = useServiceQuery(
    () => client.inspectionPlans(),
    'inspection-plans',
  );
  const runs = useServiceQuery(
    () => client.inspectionRuns(),
    'inspection-runs',
  );

  // Guard the read so a stale or partial response can never crash the page
  // while plans are still loading.
  const planRows = plans.data ?? [];

  const generate = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await client.generateInspections({ date });
      list.reload();
      runs.reload();
      plans.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const togglePlan = async (id: number, enabled: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await client.setInspectionPlanEnabled(id, enabled);
      plans.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const runPlan = async (id: number) => {
    setBusy(true);
    setError(undefined);
    try {
      await client.runInspectionPlan(id);
      plans.reload();
      list.reload();
      runs.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!completing) return;
    setBusy(true);
    setError(undefined);
    try {
      await client.completeInspection(completing, note.trim() || undefined);
      setCompleting(undefined);
      setNote('');
      list.reload();
      runs.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          canManage ? (
            <Button disabled={busy} onClick={() => void generate()}>
              <Play aria-hidden='true' />
              {t('service.inspections.generate')}
            </Button>
          ) : null
        }
        description={t('service.inspections.description')}
        title={t('service.inspections.title')}
      />
      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1'>
          <span className='text-xs text-muted-foreground'>
            {t('service.inspections.date')}
          </span>
          <Input
            onChange={(event) => setDate(event.target.value)}
            type='date'
            value={date}
          />
        </div>
        <div className='w-40 space-y-1'>
          <span className='text-xs text-muted-foreground'>
            {t('service.inspections.status')}
          </span>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value ? String(value) : 'all')}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('service.common.all')}</SelectItem>
              {INSPECTION_STATUS_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {inspectionStatusLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='w-40 space-y-1'>
          <span className='text-xs text-muted-foreground'>
            {t('service.inspections.region')}
          </span>
          <Select
            value={region}
            onValueChange={(value) => setRegion(value ? String(value) : 'all')}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('service.common.all')}</SelectItem>
              {REGION_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {regionLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('service.inspections.plans')}</CardTitle>
        </CardHeader>
        <CardContent className='px-0'>
          {plans.loading && !plans.data ? <LoadingState /> : null}
          {plans.error ? (
            <ErrorState error={plans.error} onRetry={plans.reload} />
          ) : null}
          {planRows ? (
            planRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.inspections.planName')}</TableHead>
                    <TableHead>{t('service.inspections.schedule')}</TableHead>
                    <TableHead>{t('service.inspections.timezone')}</TableHead>
                    <TableHead>{t('service.inspections.region')}</TableHead>
                    <TableHead>{t('service.inspections.status')}</TableHead>
                    <TableHead>{t('service.inspections.lastRunAt')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planRows.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>{plan.name}</TableCell>
                      <TableCell className='font-mono text-xs'>
                        {plan.cron}
                      </TableCell>
                      <TableCell>{plan.timezone}</TableCell>
                      <TableCell>{regionLabel(t, plan.region)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={
                            plan.enabled
                              ? t('service.inspections.enabled')
                              : t('service.inspections.disabled')
                          }
                          value={plan.enabled ? 'completed' : 'cancelled'}
                        />
                      </TableCell>
                      <TableCell>
                        {plan.lastRunAt ? formatDateTime(plan.lastRunAt) : '—'}
                      </TableCell>
                      {canManage ? (
                        <TableCell className='space-x-2 text-right whitespace-nowrap'>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void togglePlan(plan.id, !plan.enabled)
                            }
                            size='xs'
                            variant='outline'
                          >
                            {plan.enabled
                              ? t('service.inspections.disable')
                              : t('service.inspections.enable')}
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => void runPlan(plan.id)}
                            size='xs'
                            variant='outline'
                          >
                            {t('service.inspections.runNow')}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.inspections.noPlans')}
              />
            )
          ) : null}
        </CardContent>
      </Card>

      <Card className='py-0'>
        <CardContent className='px-0'>
          {list.loading && !list.data ? <LoadingState /> : null}
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : null}
          {list.data ? (
            list.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.inspections.device')}</TableHead>
                    <TableHead>{t('service.inspections.region')}</TableHead>
                    <TableHead>{t('service.inspections.taskDate')}</TableHead>
                    <TableHead>{t('service.inspections.status')}</TableHead>
                    <TableHead>{t('service.inspections.assignee')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <span className='font-mono text-xs'>
                          {task.deviceCode}
                        </span>
                        <span className='block text-sm'>{task.deviceName}</span>
                      </TableCell>
                      <TableCell>{task.deviceRegion}</TableCell>
                      <TableCell>{task.taskDate}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={inspectionStatusLabel(t, task.status)}
                          value={task.status}
                        />
                      </TableCell>
                      <TableCell>{task.assigneeId ?? '—'}</TableCell>
                      {canManage ? (
                        <TableCell className='text-right'>
                          {task.status !== 'completed' ? (
                            <Button
                              onClick={() => {
                                setCompleting(task.id);
                                setNote('');
                              }}
                              size='xs'
                              variant='outline'
                            >
                              {t('service.inspections.complete')}
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.inspections.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.inspections.history')}</CardTitle>
        </CardHeader>
        <CardContent className='px-0'>
          {runs.loading && !runs.data ? <LoadingState /> : null}
          {runs.error ? (
            <ErrorState error={runs.error} onRetry={runs.reload} />
          ) : null}
          {runs.data ? (
            runs.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.inspections.startedAt')}</TableHead>
                    <TableHead>{t('service.inspections.finishedAt')}</TableHead>
                    <TableHead>{t('service.inspections.status')}</TableHead>
                    <TableHead>{t('service.inspections.result')}</TableHead>
                    <TableHead>
                      {t('service.inspections.triggeredBy')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.data.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                      <TableCell>
                        {run.finishedAt ? formatDateTime(run.finishedAt) : '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={
                            run.status === 'succeeded'
                              ? t('service.inspections.enabled')
                              : t('service.inspections.runFailed')
                          }
                          value={
                            run.status === 'succeeded'
                              ? 'completed'
                              : 'cancelled'
                          }
                        />
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {run.error ? run.error : formatResult(run.result)}
                      </TableCell>
                      <TableCell className='text-xs'>
                        {run.triggeredBy}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.inspections.noRuns')}
              />
            )
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={completing !== undefined}
        onOpenChange={(next) => !next && setCompleting(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('service.inspections.complete')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='inspectionNote'>
              {t('service.inspections.note')}
            </Label>
            <Textarea
              id='inspectionNote'
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setCompleting(undefined)} variant='outline'>
              {t('service.common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void complete()}>
              {t('service.common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
