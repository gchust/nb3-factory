import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SelectField,
  StatusBadge,
} from '@/pages/service/shared.js';
import {
  formatDate,
  useActionFeedback,
  useServiceList,
  useServiceMe,
} from '@/pages/service/service-api.js';
import { Device, Inspection } from '@/pages/service/types.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function InspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const [scope, setScope] = useState('me');
  const [completing, setCompleting] = useState<number | null>(null);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const devices = useServiceList<Device>('service/devices', undefined, '');
  const { data, error, loading, reload } = useServiceList<Inspection>(
    'service/inspections',
    { ownerId: scope },
    scope,
  );

  const deviceName = (id: number): string => {
    const device = devices.data?.find((item) => item.id === id);
    return device ? `${device.serial} · ${device.name}` : `#${id}`;
  };

  const complete = async (id: number, status: string): Promise<void> => {
    setBusy(true);
    try {
      await api.request({
        path: `service/inspections/${id}/result`,
        method: 'POST',
        json: { result, status },
      });
      feedback.success(t('service.inspections.completed'));
      setCompleting(null);
      setResult('');
      reload();
    } catch (completeError) {
      feedback.failure(completeError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          me?.supervisor ? (
            <SelectField
              value={scope}
              onValueChange={setScope}
              className='w-44'
              options={[
                { value: 'me', label: t('service.inspections.mine') },
                { value: '', label: t('service.inspections.all') },
              ]}
            />
          ) : null
        }
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        data.length === 0 ? (
          <EmptyState
            title={t('service.inspections.empty')}
            description={t('service.inspections.emptyHint')}
          />
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.inspections.plannedDate')}</TableHead>
                  <TableHead>{t('service.devices.title')}</TableHead>
                  <TableHead>{t('service.inspections.status')}</TableHead>
                  <TableHead>{t('service.inspections.result')}</TableHead>
                  <TableHead>{t('service.field.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell>{formatDate(inspection.plannedDate)}</TableCell>
                    <TableCell>{deviceName(inspection.deviceId)}</TableCell>
                    <TableCell>
                      <StatusBadge status={inspection.status} />
                    </TableCell>
                    <TableCell className='max-w-[20rem]'>
                      {inspection.result ?? '—'}
                    </TableCell>
                    <TableCell>
                      {inspection.status === 'pending' &&
                      inspection.ownerId === me?.id ? (
                        completing === inspection.id ? (
                          <div className='flex items-center gap-2'>
                            <Input
                              value={result}
                              className='w-48'
                              aria-label={t('service.inspections.result')}
                              onChange={(event) =>
                                setResult(event.target.value)
                              }
                            />
                            <Button
                              size='sm'
                              disabled={busy || result.trim() === ''}
                              onClick={() =>
                                void complete(inspection.id, 'done')
                              }
                            >
                              {t('service.inspections.markDone')}
                            </Button>
                            <Button
                              size='sm'
                              variant='destructive'
                              disabled={busy || result.trim() === ''}
                              onClick={() =>
                                void complete(inspection.id, 'issue')
                              }
                            >
                              {t('service.inspections.reportIssue')}
                            </Button>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={() => setCompleting(null)}
                            >
                              {t('actions.cancel')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setCompleting(inspection.id);
                              setResult('');
                            }}
                          >
                            {t('service.inspections.complete')}
                          </Button>
                        )
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          {inspection.status}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </PageContainer>
  );
}
