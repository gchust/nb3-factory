import { useTranslation } from '@nocobase/i18n/client';
import { Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Input } from '@/components/ui/input';
import { listTenants, type Tenant } from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

export default function TenantsPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const tenants = useApiData<readonly Tenant[]>(`tenants:${search}`, (api) =>
    listTenants(api, { search: search || undefined }),
  );

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('rentals.tenants.title')}
        description={t('rentals.tenants.description')}
      />

      <div className='relative max-w-72'>
        <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          aria-label={t('rentals.tenants.search')}
          className='pl-8'
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('rentals.tenants.search')}
          value={search}
        />
      </div>

      <QueryState
        emptyDescription={t('rentals.tenants.emptyHint')}
        emptyTitle={t('rentals.tenants.empty')}
        error={tenants.error}
        isEmpty={tenants.data?.length === 0}
        loading={tenants.loading}
        onRetry={tenants.reload}
      >
        <div className='overflow-x-auto rounded-xl border border-border bg-card'>
          <table className='w-full text-sm'>
            <thead className='border-b border-border text-left text-muted-foreground'>
              <tr>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.tenantName')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.contactName')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.contactPhone')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.contactEmail')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.note')}
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.data?.map((tenant) => (
                <tr
                  className='border-b border-border last:border-0'
                  key={tenant.id}
                >
                  <td className='px-4 py-3 font-medium'>{tenant.name}</td>
                  <td className='px-4 py-3'>{tenant.contactName}</td>
                  <td className='px-4 py-3'>{tenant.contactPhone ?? '—'}</td>
                  <td className='px-4 py-3'>{tenant.contactEmail ?? '—'}</td>
                  <td className='max-w-72 px-4 py-3 text-muted-foreground'>
                    {tenant.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </PageContainer>
  );
}
