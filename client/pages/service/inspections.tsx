import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi } from '@/service/api.js';
import { runScheduleAndAwait } from '@/service/schedule.js';
import { useSession } from '@/service/session.js';
import {
  EmptyState,
  ErrorState,
  PageLoading,
  errorMessage,
  formatDate,
  useAsync,
} from '@/service/ui.js';
import type { ServiceInspection } from '@/service/types.js';

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor, isEngineer, isObserver } = useSession();
  const inspections = useAsync(() => api.listInspections(), []);
  const devices = useAsync(() => api.listDevices(), []);
  const [completing, setCompleting] = useState<ServiceInspection>();
  const [result, setResult] = useState('');

  const deviceLabel = (id: number): string => {
    const device = devices.data?.find((row) => row.id === id);
    return device ? `${device.serialNumber} · ${device.name}` : `#${id}`;
  };

  const complete = async (): Promise<void> => {
    if (!completing) {
      return;
    }
    try {
      await api.completeInspection(completing.id, result);
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setCompleting(undefined);
      setResult('');
      inspections.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    }
  };

  const generate = async (): Promise<void> => {
    try {
      const outcome = await runScheduleAndAwait(
        api,
        'service.daily-inspections',
      );
      if (outcome.status === 'succeeded') {
        toaster.show({
          type: 'success',
          title: t('service.schedules.runSucceeded'),
          description: t('service.schedules.inspectionsCreated', {
            count: outcome.created ?? 0,
          }),
        });
      } else if (outcome.status === 'disabled') {
        toaster.show({
          type: 'warning',
          title: t('service.schedules.disabled'),
          description: t('service.schedules.disabledHint'),
        });
      } else if (outcome.status === 'pending') {
        toaster.show({
          type: 'info',
          title: t('service.schedules.pending'),
        });
      } else {
        toaster.show({
          type: 'error',
          title: t('service.schedules.runFailed'),
          description: outcome.reason,
        });
      }
      inspections.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    }
  };

  const canComplete = !isObserver && (isSupervisor || isEngineer);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          isSupervisor ? (
            <Button variant='outline' onClick={() => void generate()}>
              <CalendarPlus />
              {t('service.inspections.generate')}
            </Button>
          ) : undefined
        }
      />

      {inspections.loading ? <PageLoading /> : null}
      {inspections.error ? (
        <ErrorState error={inspections.error} onRetry={inspections.reload} />
      ) : null}

      {!inspections.loading && !inspections.error ? (
        inspections.data && inspections.data.length > 0 ? (
          <div className='rounded-lg border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.inspections.device')}</TableHead>
                  <TableHead>{t('service.inspections.plannedDate')}</TableHead>
                  <TableHead>{t('service.inspections.status')}</TableHead>
                  <TableHead>{t('service.inspections.result')}</TableHead>
                  {canComplete ? (
                    <TableHead className='text-right'>
                      {t('service.common.actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.data.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell>{deviceLabel(inspection.deviceId)}</TableCell>
                    <TableCell>{formatDate(inspection.plannedDate)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inspection.status === 'completed'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {t(`service.inspectionStatus.${inspection.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className='max-w-72 truncate'>
                      {inspection.result ?? '—'}
                    </TableCell>
                    {canComplete ? (
                      <TableCell className='text-right'>
                        {inspection.status === 'pending' ? (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setResult('');
                              setCompleting(inspection);
                            }}
                          >
                            <CheckCircle2 />
                            {t('service.inspections.complete')}
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState />
        )
      ) : null}

      <Dialog
        open={Boolean(completing)}
        onOpenChange={(open) => !open && setCompleting(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('service.inspections.complete')}</DialogTitle>
            <DialogDescription>
              {t('service.inspections.completeHint')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='inspection-result'>
              {t('service.inspections.result')}
            </Label>
            <Textarea
              id='inspection-result'
              value={result}
              onChange={(event) => setResult(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCompleting(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={!result.trim()} onClick={() => void complete()}>
              {t('actions.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
