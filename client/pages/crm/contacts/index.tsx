import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { Plus, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { listContacts, type ContactRecord } from '../api.js';
import { DataTable, StatePanel, TableCell } from '../components.js';
import {
  describeRequestError,
  useCrmData,
  useRequestErrorMessages,
} from '../hooks.js';

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const errorMessages = useRequestErrorMessages();
  const { data, error, loading, reload } = useCrmData<ContactRecord[]>(
    `contacts:${location.key}`,
    (signal) => listContacts(api, { signal }),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contacts.title')}
        description={t('crm.contacts.description')}
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
              {t('crm.contacts.add')}
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
        <StatePanel>{t('crm.contacts.empty')}</StatePanel>
      ) : null}

      {data && data.length > 0 && !error ? (
        <DataTable
          headers={[
            t('crm.contacts.name'),
            t('crm.contacts.contactInfo'),
            t('crm.contacts.customer'),
            t('crm.common.actions'),
          ]}
        >
          {data.map((contact) => (
            <tr key={contact.id}>
              <TableCell className='font-medium'>{contact.name}</TableCell>
              <TableCell className='text-muted-foreground'>
                {contact.contactInfo ?? '—'}
              </TableCell>
              <TableCell>{contact.customerName}</TableCell>
              <TableCell className='text-right'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => void navigate(`${contact.id}/edit`)}
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
