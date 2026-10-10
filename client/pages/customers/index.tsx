import type { ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { listCustomers } from '@/api/service';
import type { Customer } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { ServiceTable } from '@/components/service/service-table';
import { Button } from '@/components/ui/button';
import { useServiceResource } from '@/hooks/use-service-resource';

/**
 * The customer directory.
 *
 * Read-only for an engineer, editable for the supervisor, and the difference is
 * the server's: the list is served under the ledger read action and the edit
 * button only appears when this caller holds the manage action.
 */
export default function ServiceCustomersPage(): ReactElement {
  const { t } = useTranslation();
  const load = useCallback(
    (api: ApiClient, signal: AbortSignal) =>
      listCustomers(api, undefined, signal),
    [],
  );
  const customers = useServiceResource('service-customers', load);
  const canManage = useCan({
    resource: { type: 'composite', id: 'service.ledger' },
    action: 'manage',
  });
  const outletContext = useMemo(
    () => ({ reload: customers.reload }),
    [customers.reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          <>
            <Button onClick={customers.reload} size='sm' variant='outline'>
              <RefreshCw aria-hidden='true' />
              {t('service.actions.refresh')}
            </Button>
            {canManage.can ? (
              <Button render={<Link to='new' />} size='sm'>
                <Plus aria-hidden='true' />
                {t('service.customers.createAction')}
              </Button>
            ) : null}
          </>
        }
      />

      {customers.error ? (
        <ServiceErrorNotice
          error={customers.error}
          onRetry={customers.reload}
        />
      ) : null}

      <ServiceTable
        caption={t('service.customers.title')}
        columns={[
          {
            key: 'name',
            header: t('service.customers.name'),
            cell: (row: Customer) =>
              canManage.can ? (
                <Link
                  className='font-medium underline-offset-4 hover:underline'
                  to={String(row.id)}
                >
                  {row.name}
                </Link>
              ) : (
                row.name
              ),
          },
          {
            key: 'contact',
            header: t('service.customers.contact'),
            cell: (row) =>
              [row.contactName, row.contactPhone].filter(Boolean).join(' · ') ||
              '—',
          },
          {
            key: 'address',
            header: t('service.customers.address'),
            cell: (row) => row.address ?? '—',
          },
          {
            key: 'remark',
            header: t('service.customers.remark'),
            cell: (row) => row.remark ?? '—',
          },
        ]}
        empty={t('service.customers.empty')}
        isPending={customers.isPending}
        rowKey={(row) => String(row.id)}
        rows={customers.data?.data ?? []}
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
