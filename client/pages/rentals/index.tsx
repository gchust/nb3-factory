import { useTranslation } from '@nocobase/i18n/client';
import { Plus, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';

import { BookingStatusBadge } from '@/components/booking-status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BOOKING_STATUSES,
  formatDateTime,
  formatMoney,
  listBookings,
  listVenues,
  type Booking,
  type Venue,
} from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';

import { NewBookingDialog } from './new-booking-dialog.js';

export default function RentalsPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [venueId, setVenueId] = useState('all');
  const [creating, setCreating] = useState(false);

  const bookings = useApiData<readonly Booking[]>(
    `bookings:${search}:${status}:${venueId}`,
    (api) =>
      listBookings(api, {
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        venueId: venueId === 'all' ? undefined : Number(venueId),
      }),
  );
  const identity = useApiData('rentals:identity', (api) =>
    api
      .request<{ data: { role: 'manager' | 'staff' } }>({ path: 'rentals/me' })
      .then((response) => response.data),
  );
  const venues = useApiData<readonly Venue[]>('bookings:venues', (api) =>
    listVenues(api),
  );

  const statusOptions = [
    { value: 'all', label: t('rentals.status.all') },
    ...BOOKING_STATUSES.map((value) => ({
      value,
      label: t(`rentals.status.${value}`),
    })),
  ];
  const venueOptions = [
    { value: 'all', label: t('rentals.filters.allVenues') },
    ...(venues.data?.map((venue) => ({
      value: String(venue.id),
      label: venue.name,
    })) ?? []),
  ];

  const canAssignOwner = identity.data?.role === 'manager';

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          <Button onClick={() => setCreating(true)} type='button'>
            <Plus />
            {t('rentals.list.create')}
          </Button>
        }
        description={t('rentals.list.description')}
        title={t('rentals.list.title')}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-56 flex-1'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            aria-label={t('rentals.list.search')}
            className='pl-8'
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('rentals.list.search')}
            value={search}
          />
        </div>
        <div className='w-44'>
          <SelectField
            ariaLabel={t('rentals.filters.status')}
            onChange={setStatus}
            options={statusOptions}
            value={status}
          />
        </div>
        <div className='w-44'>
          <SelectField
            ariaLabel={t('rentals.filters.venue')}
            onChange={setVenueId}
            options={venueOptions}
            value={venueId}
          />
        </div>
      </div>

      <QueryState
        emptyDescription={t('rentals.list.emptyHint')}
        emptyTitle={t('rentals.list.empty')}
        error={bookings.error}
        isEmpty={bookings.data?.length === 0}
        loading={bookings.loading}
        onRetry={bookings.reload}
      >
        <div className='overflow-x-auto rounded-xl border border-border bg-card'>
          <table className='w-full text-sm'>
            <thead className='border-b border-border text-left text-muted-foreground'>
              <tr>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.reference')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.title')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.venueName')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.tenantName')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.owner')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.startAt')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.fee')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.fields.status')}
                </th>
                <th className='px-4 py-3 font-medium'>
                  {t('rentals.list.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {bookings.data?.map((booking) => (
                <tr
                  className='border-b border-border last:border-0'
                  key={booking.id}
                >
                  <td className='px-4 py-3 font-mono text-xs'>
                    {booking.reference}
                  </td>
                  <td className='px-4 py-3 font-medium'>{booking.title}</td>
                  <td className='px-4 py-3'>{booking.venueName ?? '—'}</td>
                  <td className='px-4 py-3'>{booking.tenantName ?? '—'}</td>
                  <td className='px-4 py-3'>{booking.ownerName ?? '—'}</td>
                  <td className='px-4 py-3'>
                    {formatDateTime(booking.startAt)}
                  </td>
                  <td className='px-4 py-3'>{formatMoney(booking.fee)}</td>
                  <td className='px-4 py-3'>
                    <BookingStatusBadge status={booking.status} />
                  </td>
                  <td className='px-4 py-3'>
                    <Button
                      render={<Link to={`/rentals/${booking.id}`} />}
                      size='sm'
                      variant='outline'
                    >
                      {t('rentals.list.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>

      {creating ? (
        <NewBookingDialog
          canAssignOwner={canAssignOwner}
          onCreated={bookings.reload}
          onOpenChange={setCreating}
          open={creating}
        />
      ) : null}
    </PageContainer>
  );
}
