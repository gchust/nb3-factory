import { useTranslation } from '@nocobase/i18n/client';
import { Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney, listVenues, type Venue } from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

export default function VenuesPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const venues = useApiData<readonly Venue[]>(
    `venues:${search}:${status}`,
    (api) =>
      listVenues(api, {
        search: search || undefined,
        status: status === 'all' ? undefined : status,
      }),
  );

  const statusItems = useMemo(
    () => ({
      all: t('rentals.venueStatus.all'),
      available: t('rentals.venueStatus.available'),
      maintenance: t('rentals.venueStatus.maintenance'),
      inactive: t('rentals.venueStatus.inactive'),
    }),
    [t],
  );

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('rentals.venues.title')}
        description={t('rentals.venues.description')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-56 flex-1'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            aria-label={t('rentals.venues.search')}
            className='pl-8'
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('rentals.venues.search')}
            value={search}
          />
        </div>
        <Select
          items={statusItems}
          onValueChange={(next) =>
            setStatus(next == null ? 'all' : String(next))
          }
          value={status}
        >
          <SelectTrigger aria-label={t('rentals.fields.venueStatus')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('rentals.venueStatus.all')}</SelectItem>
            <SelectItem value='available'>
              {t('rentals.venueStatus.available')}
            </SelectItem>
            <SelectItem value='maintenance'>
              {t('rentals.venueStatus.maintenance')}
            </SelectItem>
            <SelectItem value='inactive'>
              {t('rentals.venueStatus.inactive')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <QueryState
        emptyDescription={t('rentals.venues.emptyHint')}
        emptyTitle={t('rentals.venues.empty')}
        error={venues.error}
        isEmpty={venues.data?.length === 0}
        loading={venues.loading}
        onRetry={venues.reload}
      >
        <div className='overflow-x-auto rounded-xl border border-border bg-card'>
          <table className='w-full text-sm'>
            <thead className='border-b border-border text-left text-muted-foreground'>
              <tr>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.venueName')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.location')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.capacity')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.unitPrice')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.venueStatus')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.description')}
                </th>
              </tr>
            </thead>
            <tbody>
              {venues.data?.map((venue) => (
                <tr
                  className='border-b border-border last:border-0'
                  key={venue.id}
                >
                  <td className='px-4 py-3 font-medium'>{venue.name}</td>
                  <td className='px-4 py-3'>{venue.location}</td>
                  <td className='px-4 py-3'>{venue.capacity}</td>
                  <td className='px-4 py-3'>{formatMoney(venue.unitPrice)}</td>
                  <td className='px-4 py-3'>
                    {t(`rentals.venueStatus.${venue.status}`)}
                  </td>
                  <td className='max-w-72 px-4 py-3 text-muted-foreground'>
                    {venue.description ?? '—'}
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
