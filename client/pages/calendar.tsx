import { useTranslation } from '@nocobase/i18n/client';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import {
  BOOKING_STATUSES,
  listBookings,
  listVenues,
  type Booking,
  type Venue,
} from '@/lib/rentals';
import { useApiData } from '@/lib/use-api-data';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export default function CalendarPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [venueId, setVenueId] = useState('all');
  const [status, setStatus] = useState('all');

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return { start, end };
  }, [month]);

  const bookings = useApiData<readonly Booking[]>(
    `calendar:${month.toISOString()}:${venueId}:${status}`,
    (api) =>
      listBookings(api, {
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        venueId: venueId === 'all' ? undefined : Number(venueId),
        status: status === 'all' ? undefined : status,
      }),
  );
  const venues = useApiData<readonly Venue[]>('calendar:venues', (api) =>
    listVenues(api),
  );

  const days = useMemo(
    () => eachDayOfInterval({ start: range.start, end: range.end }),
    [range],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of bookings.data ?? []) {
      const key = format(new Date(booking.startAt), 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(booking);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [bookings.data]);

  const venueOptions = [
    { value: 'all', label: t('rentals.filters.allVenues') },
    ...(venues.data?.map((venue) => ({
      value: String(venue.id),
      label: venue.name,
    })) ?? []),
  ];
  const statusOptions = [
    { value: 'all', label: t('rentals.status.all') },
    ...BOOKING_STATUSES.map((value) => ({
      value,
      label: t(`rentals.status.${value}`),
    })),
  ];

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        actions={
          <div className='flex items-center gap-2'>
            <Button
              aria-label={t('rentals.calendar.previous')}
              onClick={() => setMonth((current) => subMonths(current, 1))}
              size='icon-sm'
              type='button'
              variant='outline'
            >
              <ChevronLeft />
            </Button>
            <Button
              onClick={() => setMonth(startOfMonth(new Date()))}
              type='button'
              variant='outline'
            >
              {t('rentals.calendar.today')}
            </Button>
            <Button
              aria-label={t('rentals.calendar.next')}
              onClick={() => setMonth((current) => addMonths(current, 1))}
              size='icon-sm'
              type='button'
              variant='outline'
            >
              <ChevronRight />
            </Button>
          </div>
        }
        description={t('rentals.calendar.description')}
        title={`${t('rentals.calendar.title')} · ${format(month, 'yyyy-MM')}`}
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='w-44'>
          <SelectField
            ariaLabel={t('rentals.filters.venue')}
            onChange={setVenueId}
            options={venueOptions}
            value={venueId}
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
      </div>

      <QueryState
        emptyTitle={t('rentals.calendar.empty')}
        error={bookings.error}
        loading={bookings.loading}
        onRetry={bookings.reload}
      >
        <div className='overflow-hidden rounded-xl border border-border bg-card'>
          <div className='grid grid-cols-7 border-b border-border text-center text-xs text-muted-foreground'>
            {WEEKDAYS.map((day) => (
              <div className='px-2 py-2 font-medium' key={day}>
                {t(`rentals.calendar.weekdays.${day}`)}
              </div>
            ))}
          </div>
          <div className='grid grid-cols-7'>
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const items = byDay.get(key) ?? [];
              return (
                <div
                  className={cn(
                    'min-h-28 border-r border-b border-border p-1.5 last:border-r-0',
                    !isSameMonth(day, month) && 'bg-muted/40',
                  )}
                  key={key}
                >
                  <div
                    className={cn(
                      'mb-1 text-xs',
                      isToday(day)
                        ? 'font-semibold text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className='space-y-1'>
                    {items.slice(0, 3).map((booking) => (
                      <button
                        className='block w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-left text-xs text-primary hover:bg-primary/20'
                        key={booking.id}
                        onClick={() => {
                          void navigate(`/rentals/${booking.id}`);
                        }}
                        title={`${format(new Date(booking.startAt), 'HH:mm')} ${booking.title}`}
                        type='button'
                      >
                        {format(new Date(booking.startAt), 'HH:mm')}{' '}
                        {booking.title}
                      </button>
                    ))}
                    {items.length > 3 ? (
                      <div className='px-1 text-xs text-muted-foreground'>
                        {t('rentals.calendar.more', {
                          count: items.length - 3,
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </QueryState>
    </PageContainer>
  );
}
