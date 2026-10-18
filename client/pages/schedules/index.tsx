import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { ScheduleEnabledSwitch } from '#components/schedule-enabled-switch';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
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
import { useSchedules } from '#hooks/use-schedules';

import { OccurrenceDialog } from './occurrence-dialog.js';
import type { Schedule } from './types.js';

/**
 * The scheduling plans of this application and a way into each one's execution records.
 *
 * The scheduler plugin owns the service and its API but contributes no page, so this is where `todos.check-expired`
 * is visible: its name, whether it is enabled, and the occurrences it produced. The enabled state is also editable
 * here — the same control lives on the Settings page — by calling the Scheduler's own enable/disable endpoints, so a
 * later refresh reads the same stored setting back.
 */
export default function SchedulesPage(): ReactElement {
  const { t } = useTranslation();
  const { error, loading, pendingId, reload, rows, setEnabled } =
    useSchedules();
  const [selected, setSelected] = useState<Schedule>();

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            disabled={loading}
            onClick={reload}
            size='sm'
            variant='outline'
          >
            <RefreshCwIcon />
            {t('schedules.refresh')}
          </Button>
        }
        description={t('schedules.description')}
        title={t('schedules.title')}
      />
      {loading && !rows ? (
        <Loading />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('schedules.loadFailed')}</AlertDescription>
        </Alert>
      ) : rows && rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('schedules.column.title')}</TableHead>
              <TableHead>{t('schedules.column.status')}</TableHead>
              <TableHead className='text-right'>
                {t('schedules.column.results')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell>
                  <span className='font-medium'>{schedule.title}</span>
                  <span className='block text-xs text-muted-foreground'>
                    {schedule.key}
                  </span>
                </TableCell>
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <StatusBadge
                      tone={schedule.enabled ? 'success' : 'neutral'}
                    >
                      {schedule.enabled
                        ? t('schedules.enabled')
                        : t('schedules.disabled')}
                    </StatusBadge>
                    <ScheduleEnabledSwitch
                      disabled={pendingId === schedule.id}
                      onChange={(enabled) => void setEnabled(schedule, enabled)}
                      schedule={schedule}
                    />
                  </div>
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    onClick={() => setSelected(schedule)}
                    size='sm'
                    variant='outline'
                  >
                    {t('schedules.viewResults')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('schedules.empty')}</EmptyTitle>
            <EmptyDescription>
              {t('schedules.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {selected ? (
        <OccurrenceDialog
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
          schedule={selected}
        />
      ) : null}
    </PageContainer>
  );
}
