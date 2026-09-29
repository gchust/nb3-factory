import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheckIcon, CheckIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import {
  completeInspection,
  fetchInspectionList,
  runDailyInspections,
  type Inspection,
} from '../api.js';
import { formatDate } from '../format.js';
import { LoadingBlock, QueryError, StatusBadge } from '../shared.js';

/** Inspection plan, the manual trigger for the daily jobs, and result capture. */
export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<{
    key: string;
    list?: Inspection[];
    error?: unknown;
  }>();
  const [completing, setCompleting] = useState<Inspection>();
  const [running, setRunning] = useState(false);

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    fetchInspectionList(api).then(
      (list) => {
        if (!controller.signal.aborted)
          setState({ key: String(reloadCount), list });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = state?.key !== requestKey;

  async function runDaily(): Promise<void> {
    setRunning(true);
    try {
      const result = await runDailyInspections(api);
      const failed = result.executions.filter(
        (execution) => execution.state !== 'succeeded',
      );
      if (failed.length > 0 || !result.generation || !result.reminders) {
        // The Scheduler reports what really happened. A failed, disabled or
        // still-running execution is never presented as a completion.
        const statuses = [
          ...new Set(result.executions.map((execution) => execution.state)),
        ].join(', ');
        toaster.show({
          type: 'error',
          title: t('service.inspections.runIncomplete', {
            statuses: statuses || t('service.inspections.runPending'),
          }),
        });
      } else {
        toaster.show({
          type: 'success',
          title: t('service.inspections.runResult', {
            created: result.generation.created,
            skipped: result.generation.skipped,
            reminded: result.reminders.reminded,
          }),
        });
      }
      setReloadCount((count) => count + 1);
    } catch (error: unknown) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError && error.status === 403
            ? t('service.error.forbidden')
            : t('service.error.requestFailed'),
      });
    } finally {
      setRunning(false);
    }
  }

  const columns = useMemo<ColumnDef<Inspection>[]>(
    () => [
      {
        accessorKey: 'inspectionDate',
        header: t('service.inspections.column.date'),
        cell: ({ row }) => formatDate(row.original.inspectionDate),
      },
      {
        id: 'device',
        header: t('service.common.device'),
        cell: ({ row }) => (
          <div>
            <p className='font-mono text-xs'>{row.original.deviceCode}</p>
            <p className='text-sm text-muted-foreground'>
              {row.original.deviceName}
            </p>
          </div>
        ),
      },
      { accessorKey: 'customerName', header: t('service.common.customer') },
      {
        id: 'status',
        header: t('service.inspections.column.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'reminder',
        header: t('service.inspections.column.reminder'),
        cell: ({ row }) =>
          row.original.reminderSent ? (
            <Badge variant='secondary'>{t('service.common.yes')}</Badge>
          ) : (
            <span>—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setCompleting(row.original)}
            >
              <CheckIcon />
              {t('service.inspections.complete')}
            </Button>
          ) : null,
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          <Button
            variant='outline'
            onClick={() => void runDaily()}
            disabled={running}
          >
            <CalendarCheckIcon />
            {t('service.inspections.runNow')}
          </Button>
        }
      />
      {state?.error ? (
        <QueryError
          error={state.error}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      ) : loading && !state?.list ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={state?.list ?? []}
          getRowId={(row) => String(row.id)}
          emptyMessage={t('service.inspections.empty')}
        />
      )}
      {completing ? (
        <CompleteInspectionDialog
          inspection={completing}
          onClose={() => setCompleting(undefined)}
          onDone={() => {
            setCompleting(undefined);
            setReloadCount((count) => count + 1);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function CompleteInspectionDialog({
  inspection,
  onClose,
  onDone,
}: {
  readonly inspection: Inspection;
  readonly onClose: () => void;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [resultNote, setResultNote] = useState('');
  const [status, setStatus] = useState<'completed' | 'skipped'>('completed');
  const [createTicket, setCreateTicket] = useState(false);

  async function submit(): Promise<void> {
    if (!resultNote.trim()) {
      setError(t('service.inspections.form.resultRequired'));
      return;
    }
    setBusy(true);
    try {
      await completeInspection(api, inspection.id, {
        resultNote: resultNote.trim(),
        status,
        createTicket,
      });
      toaster.show({
        type: 'success',
        title: t('service.inspections.form.saved'),
      });
      onDone();
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError && err.status === 403
          ? t('service.error.forbidden')
          : t('service.error.requestFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('service.inspections.complete')}</DialogTitle>
          <DialogDescription>
            {inspection.deviceCode} · {inspection.deviceName} ·{' '}
            {formatDate(inspection.inspectionDate)}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='inspection-status'>
              {t('service.inspections.column.status')}
            </FieldLabel>
            <Select
              items={[
                {
                  value: 'completed',
                  label: t('service.ticketStatus.completed'),
                },
                { value: 'skipped', label: t('service.ticketStatus.skipped') },
              ]}
              value={status}
              onValueChange={(value: string | null) =>
                setStatus((value ?? 'completed') as 'completed' | 'skipped')
              }
            >
              <SelectTrigger id='inspection-status' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='completed'>
                  {t('service.ticketStatus.completed')}
                </SelectItem>
                <SelectItem value='skipped'>
                  {t('service.ticketStatus.skipped')}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='inspection-note'>
              {t('service.inspections.form.result')}
            </FieldLabel>
            <Textarea
              id='inspection-note'
              rows={4}
              value={resultNote}
              onChange={(event) => setResultNote(event.target.value)}
            />
          </Field>
          <Field orientation='horizontal'>
            <FieldLabel htmlFor='inspection-ticket'>
              {t('service.inspections.form.createTicket')}
            </FieldLabel>
            <Switch
              id='inspection-ticket'
              checked={createTicket}
              onCheckedChange={(checked: boolean) => setCreateTicket(checked)}
            />
          </Field>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={busy}>
            {t('service.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t('service.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
