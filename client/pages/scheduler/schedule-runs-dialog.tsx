'use client';

import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import type {
  Schedule,
  ScheduleOccurrence,
  ScheduleOccurrenceList,
  ScheduleOccurrenceStatus,
} from './types.js';

const PAGE_SIZE = 20;

const OCCURRENCE_TONE: Record<
  ScheduleOccurrenceStatus,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  pending: 'info',
  running: 'info',
  waiting: 'info',
  triggered: 'info',
  succeeded: 'success',
  failed: 'warning',
  timed_out: 'warning',
  cancelled: 'neutral',
  skipped: 'neutral',
};

export interface ScheduleRunsDialogProps {
  readonly schedule: Schedule;
  readonly onClose: () => void;
}

/** The schedule's execution results: its firings, newest first, with each one's status and recorded result. */
export function ScheduleRunsDialog({
  schedule,
  onClose,
}: ScheduleRunsDialogProps): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [result, setResult] = useState<{
    readonly runs?: ScheduleOccurrence[];
    readonly hasMore?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<ScheduleOccurrenceList>({
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/occurrences`,
        query: { pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              runs: data,
              hasMore: meta.nextPageToken !== undefined,
            });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ error });
        },
      );
    return () => controller.abort();
  }, [api, schedule.id]);

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }),
    [locale],
  );

  const runs = result?.runs;
  let body: ReactElement;
  if (result?.error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('scheduler.runs.failed')}</AlertTitle>
        <AlertDescription>
          {result.error instanceof ApiClientError && result.error.status === 403
            ? t('scheduler.error.forbidden')
            : t('scheduler.error.requestFailed')}
        </AlertDescription>
      </Alert>
    );
  } else if (runs === undefined) {
    body = (
      <div className='space-y-2'>
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <span className='sr-only'>{t('scheduler.runs.loading')}</span>
      </div>
    );
  } else if (runs.length === 0) {
    body = (
      <p className='text-sm text-muted-foreground'>
        {t('scheduler.runs.empty')}
      </p>
    );
  } else {
    body = (
      <div className='space-y-2'>
        <div className='overflow-x-auto rounded-lg border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('scheduler.runs.columnStatus')}</TableHead>
                <TableHead>{t('scheduler.runs.columnStartedAt')}</TableHead>
                <TableHead>{t('scheduler.runs.columnFinishedAt')}</TableHead>
                <TableHead>{t('scheduler.runs.columnResult')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <StatusBadge tone={OCCURRENCE_TONE[run.status]}>
                      {t(`scheduler.runs.status.${run.status}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {dateFormat.format(new Date(run.startedAt))}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {run.finishedAt
                      ? dateFormat.format(new Date(run.finishedAt))
                      : t('scheduler.runs.unfinished')}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {run.resultSummary &&
                    Object.keys(run.resultSummary).length > 0
                      ? JSON.stringify(run.resultSummary)
                      : (run.reason ?? t('scheduler.runs.noResult'))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {result?.hasMore ? (
          <p className='text-sm text-muted-foreground'>
            {t('scheduler.runs.more')}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('scheduler.runs.title', { title: schedule.title })}
          </DialogTitle>
          <DialogDescription>
            {t('scheduler.runs.description')}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
