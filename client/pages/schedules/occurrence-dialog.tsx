import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { Loading } from '#components/loading';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import type { Occurrence, OccurrenceStatus, Schedule } from './types.js';

const statusTones: Readonly<
  Record<OccurrenceStatus, 'neutral' | 'info' | 'warning' | 'success'>
> = {
  pending: 'info',
  running: 'info',
  waiting: 'info',
  succeeded: 'success',
  failed: 'warning',
  skipped: 'neutral',
  cancelled: 'neutral',
  timed_out: 'warning',
  triggered: 'neutral',
};

export interface OccurrenceDialogProps {
  readonly schedule: Schedule;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The execution-result entry of one schedule: its firings, newest first. Each row is a record the scheduler wrote
 * when the target ran, so this is the application's view of real execution, not a value the page computes.
 */
export function OccurrenceDialog({
  schedule,
  onOpenChange,
}: OccurrenceDialogProps): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [result, setResult] = useState<{
    readonly rows?: Occurrence[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: Occurrence[] }>({
        path: `scheduler/schedules/${schedule.id}/occurrences`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ rows: data });
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

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('schedules.occurrences.title')}</DialogTitle>
          <DialogDescription>
            {t('schedules.occurrences.description', { title: schedule.title })}
          </DialogDescription>
        </DialogHeader>
        {result === undefined ? (
          <Loading />
        ) : result.error !== undefined ? (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('schedules.occurrences.loadFailed')}
            </AlertDescription>
          </Alert>
        ) : result.rows && result.rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('schedules.occurrences.column.startedAt')}
                </TableHead>
                <TableHead>
                  {t('schedules.occurrences.column.status')}
                </TableHead>
                <TableHead>
                  {t('schedules.occurrences.column.result')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((occurrence) => {
                const updated = occurrence.resultSummary?.updatedCount;
                return (
                  <TableRow key={occurrence.id}>
                    <TableCell className='text-muted-foreground'>
                      {dateFormat.format(new Date(occurrence.startedAt))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTones[occurrence.status]}>
                        {t(`schedules.status.${occurrence.status}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {typeof updated === 'number'
                        ? t('schedules.occurrences.updatedCount', {
                            count: updated,
                          })
                        : (occurrence.reason ?? '—')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('schedules.occurrences.empty')}</EmptyTitle>
              <EmptyDescription>
                {t('schedules.occurrences.emptyDescription')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </DialogContent>
    </Dialog>
  );
}
