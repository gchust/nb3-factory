import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { Plus, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { listCustomers, type CustomerRecord } from '../api.js';
import { DataTable, StatePanel, TableCell } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessages = useRequestErrorMessages();
  const { data, error, loading, reload } = useCrmData<CustomerRecord[]>(
    `customers:${location.key}`,
    (signal) => listCustomers(api, { signal }),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customers.title')}
        description={t('crm.customers.description')}
        actions={
          <>
            <Button
              variant='outline'
              size='sm'
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw />
              {t('crm.common.refresh')}
            </Button>
            <Button size='sm' onClick={() => void navigate('new')}>
              <Plus />
              {t('crm.customers.add')}
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <StatePanel>{t('crm.common.loading')}</StatePanel>
      ) : null}
      {error ? (
        <StatePanel>{describeRequestError(error, errorMessages)}</StatePanel>
      ) : null}

      {data && data.length === 0 && !error ? (
        <StatePanel>{t('crm.customers.empty')}</StatePanel>
      ) : null}

      {data && data.length > 0 && !error ? (
        <DataTable
          headers={[
            t('crm.customers.name'),
            t('crm.customers.industry'),
            t('crm.common.actions'),
          ]}
        >
          {data.map((customer) => (
            <tr key={customer.id}>
              <TableCell>
                <Link
                  to={String(customer.id)}
                  className='font-medium text-foreground transition-colors hover:text-primary'
                >
                  {customer.name}
                </Link>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {customer.industry ?? '—'}
              </TableCell>
              <TableCell className='text-right'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => void navigate(`${customer.id}/edit`)}
                >
                  {t('crm.common.edit')}
                </Button>
              </TableCell>
            </tr>
          ))}
        </DataTable>
      ) : null}

      <Outlet />
    </PageContainer>
  );
}
