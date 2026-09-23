import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Button } from '@/components/ui/button';
import {
  formatAmount,
  getCustomer,
  type CustomerDetailRecord,
} from '../api.js';
import {
  DataTable,
  FormError,
  StageBadge,
  StatePanel,
  TableCell,
} from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function CustomerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const { customerId } = useParams();
  const errorMessages = useRequestErrorMessages();
  const id = Number(customerId);
  const { data, error, loading } = useCrmData<CustomerDetailRecord>(
    `customer-detail:${customerId ?? ''}`,
    (signal) => getCustomer(api, id, { signal }),
  );

  return (
    <RouteChildPage>
      <PageContainer>
        {loading && !data ? (
          <StatePanel>{t('crm.common.loading')}</StatePanel>
        ) : null}
        {error ? (
          <FormError message={describeRequestError(error, errorMessages)} />
        ) : null}
        {data ? (
          <>
            <PageHeader
              title={data.name}
              description={data.industry ?? undefined}
              actions={
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void navigate('..')}
                >
                  <ArrowLeft />
                  {t('crm.common.back')}
                </Button>
              }
            />

            <div className='rounded-lg border border-border bg-muted/30 p-4'>
              <p className='text-sm text-muted-foreground'>
                {t('crm.customers.total')}
              </p>
              <p className='mt-1 text-2xl font-semibold tracking-tight'>
                {formatAmount(data.opportunityAmountTotal)}
              </p>
            </div>

            <section className='space-y-3'>
              <h2 className='font-heading text-lg font-semibold'>
                {t('crm.customers.contacts')}
              </h2>
              {data.contacts.length === 0 ? (
                <StatePanel>{t('crm.customers.noContacts')}</StatePanel>
              ) : (
                <DataTable
                  headers={[
                    t('crm.contacts.name'),
                    t('crm.contacts.contactInfo'),
                  ]}
                >
                  {data.contacts.map((contact) => (
                    <tr key={contact.id}>
                      <TableCell>{contact.name}</TableCell>
                      <TableCell className='text-muted-foreground'>
                        {contact.contactInfo ?? '—'}
                      </TableCell>
                    </tr>
                  ))}
                </DataTable>
              )}
            </section>

            <section className='space-y-3'>
              <h2 className='font-heading text-lg font-semibold'>
                {t('crm.customers.opportunities')}
              </h2>
              {data.opportunities.length === 0 ? (
                <StatePanel>{t('crm.customers.noOpportunities')}</StatePanel>
              ) : (
                <DataTable
                  headers={[
                    t('crm.opportunities.name'),
                    t('crm.opportunities.amount'),
                    t('crm.opportunities.stage'),
                  ]}
                >
                  {data.opportunities.map((opportunity) => (
                    <tr key={opportunity.id}>
                      <TableCell>{opportunity.name}</TableCell>
                      <TableCell>{formatAmount(opportunity.amount)}</TableCell>
                      <TableCell>
                        <StageBadge stage={opportunity.stage} />
                      </TableCell>
                    </tr>
                  ))}
                </DataTable>
              )}
            </section>
          </>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
