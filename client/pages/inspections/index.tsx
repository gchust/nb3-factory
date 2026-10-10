import type { ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ClipboardCheck, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import {
  listDevices,
  listDirectoryUsers,
  listInspections,
} from '@/api/service';
import type { DirectoryUser, ServiceInspection } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { ServiceTable } from '@/components/service/service-table';
import { InspectionStatusBadge } from '@/components/service/status-badge';
import { Button } from '@/components/ui/button';
import { useServiceResource } from '@/hooks/use-service-resource';

/**
 * The inspection ledger.
 *
 * A pending inspection opens its own result dialog; a completed one is only
 * read. Completing an inspection never creates the follow-up: the server
 * schedules the next date on the device, so a fixed interval cannot be double
 * booked by a refreshed browser tab.
 */
export default function ServiceInspectionsPage(): ReactElement {
  const { t } = useTranslation();
  const sourceLabel = (source: string): string => {
    if (source === 'scheduler') return t('service.inspections.sourceScheduler');
    if (source === 'manual') return t('service.inspections.sourceManual');
    return t('service.inspections.sourceOrderRequest');
  };
  const [reloadCount, setReloadCount] = useState(0);

  const load = useCallback(async (client: ApiClient, signal: AbortSignal) => {
    const [inspections, devices, users] = await Promise.all([
      listInspections(client, {}, signal),
      listDevices(client, {}, signal),
      listDirectoryUsers(client, signal).catch(
        (): readonly DirectoryUser[] => [],
      ),
    ]);
    return {
      inspections: inspections.data,
      devices: devices.data,
      users,
    };
  }, []);
  const list = useServiceResource(`service-inspections:${reloadCount}`, load);
  const { reload: reloadList } = list;
  const outletContext = useMemo(
    () => ({
      reload: async (): Promise<void> => {
        setReloadCount((count) => count + 1);
        reloadList();
      },
    }),
    [reloadList],
  );

  const userNames = useMemo(
    () => new Map((list.data?.users ?? []).map((row) => [row.id, row.name])),
    [list.data],
  );
  const deviceNames = useMemo(
    () => new Map((list.data?.devices ?? []).map((row) => [row.id, row.name])),
    [list.data],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.inspections.title')}
        description={t('service.inspections.description')}
        actions={
          <>
            <Button onClick={list.reload} size='sm' variant='outline'>
              <RefreshCw aria-hidden='true' />
              {t('service.actions.refresh')}
            </Button>
            <Button render={<Link to='new' />} size='sm'>
              <Plus aria-hidden='true' />
              {t('service.inspections.createAction')}
            </Button>
          </>
        }
      />

      {list.error ? (
        <ServiceErrorNotice error={list.error} onRetry={list.reload} />
      ) : null}

      <ServiceTable
        caption={t('service.inspections.title')}
        columns={[
          {
            key: 'plannedDate',
            header: t('service.inspections.plannedDate'),
            cell: (row: ServiceInspection) => row.plannedDate,
          },
          {
            key: 'device',
            header: t('service.devices.title'),
            cell: (row) =>
              deviceNames.get(row.deviceId) ?? String(row.deviceId),
          },
          {
            key: 'assignee',
            header: t('service.inspections.assignee'),
            cell: (row) =>
              row.assigneeId === null
                ? '—'
                : (userNames.get(row.assigneeId) ?? row.assigneeId),
          },
          {
            key: 'status',
            header: t('service.inspections.status'),
            cell: (row) => <InspectionStatusBadge status={row.status} />,
          },
          {
            key: 'result',
            header: t('service.inspections.result'),
            cell: (row) =>
              row.result === null
                ? '—'
                : `${t(`service.inspectionResult.${row.result}`)} · ${row.resultCode ?? ''}`,
          },
          {
            key: 'source',
            header: t('service.inspections.source'),
            cell: (row) => sourceLabel(row.source),
          },
          {
            key: 'actions',
            header: '',
            align: 'end' as const,
            cell: (row: ServiceInspection) =>
              row.status === 'pending' ? (
                <Button
                  render={<Link to={String(row.id)} />}
                  size='xs'
                  variant='ghost'
                >
                  <ClipboardCheck aria-hidden='true' />
                  {t('service.actions.complete')}
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
        empty={t('service.inspections.empty')}
        isPending={list.isPending}
        rowKey={(row) => String(row.id)}
        rows={list.data?.inspections ?? []}
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
