import type { ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { listCustomers, listDevices, listDirectoryUsers } from '@/api/service';
import type { Customer, Device, DirectoryUser } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { ServiceTable } from '@/components/service/service-table';
import { Button } from '@/components/ui/button';
import { useServiceResource } from '@/hooks/use-service-resource';

interface DeviceLedger {
  readonly devices: readonly Device[];
  readonly customers: readonly Customer[];
  readonly users: readonly DirectoryUser[];
}

/** The device ledger: what was sold to whom, who answers for it, when it is next inspected. */
export default function ServiceDevicesPage(): ReactElement {
  const { t } = useTranslation();
  const load = useCallback(async (api: ApiClient, signal: AbortSignal) => {
    const [devices, customers, users] = await Promise.all([
      listDevices(api, {}, signal),
      listCustomers(api, undefined, signal),
      listDirectoryUsers(api, signal).catch((): readonly DirectoryUser[] => []),
    ]);
    return {
      devices: devices.data,
      customers: customers.data,
      users,
    };
  }, []);
  const ledger = useServiceResource<DeviceLedger>('service-devices', load);
  const canManage = useCan({
    resource: { type: 'composite', id: 'service.ledger' },
    action: 'manage',
  });
  const outletContext = useMemo(
    () => ({ reload: ledger.reload }),
    [ledger.reload],
  );

  const customerNames = useMemo(
    () =>
      new Map((ledger.data?.customers ?? []).map((row) => [row.id, row.name])),
    [ledger.data],
  );
  const userNames = useMemo(
    () => new Map((ledger.data?.users ?? []).map((row) => [row.id, row.name])),
    [ledger.data],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.devices.title')}
        description={t('service.devices.description')}
        actions={
          <>
            <Button onClick={ledger.reload} size='sm' variant='outline'>
              <RefreshCw aria-hidden='true' />
              {t('service.actions.refresh')}
            </Button>
            {canManage.can ? (
              <Button render={<Link to='new' />} size='sm'>
                <Plus aria-hidden='true' />
                {t('service.devices.createAction')}
              </Button>
            ) : null}
          </>
        }
      />

      {ledger.error ? (
        <ServiceErrorNotice error={ledger.error} onRetry={ledger.reload} />
      ) : null}

      <ServiceTable
        caption={t('service.devices.title')}
        columns={[
          {
            key: 'code',
            header: t('service.devices.code'),
            cell: (row: Device) =>
              canManage.can ? (
                <Link
                  className='font-medium underline-offset-4 hover:underline'
                  to={String(row.id)}
                >
                  {row.code}
                </Link>
              ) : (
                row.code
              ),
          },
          {
            key: 'name',
            header: t('service.devices.name'),
            cell: (row) => row.name,
          },
          {
            key: 'model',
            header: t('service.devices.model'),
            cell: (row) => row.model ?? '—',
          },
          {
            key: 'customer',
            header: t('service.customers.title'),
            cell: (row) =>
              customerNames.get(row.customerId) ?? String(row.customerId),
          },
          {
            key: 'engineer',
            header: t('service.devices.engineer'),
            cell: (row) =>
              row.engineerId === null
                ? '—'
                : (userNames.get(row.engineerId) ?? row.engineerId),
          },
          {
            key: 'nextInspectionDate',
            header: t('service.devices.nextInspectionDate'),
            cell: (row) => row.nextInspectionDate ?? '—',
          },
        ]}
        empty={t('service.devices.empty')}
        isPending={ledger.isPending}
        rowKey={(row) => String(row.id)}
        rows={ledger.data?.devices ?? []}
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
