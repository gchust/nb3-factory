import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { MeetingBookingFormDialog } from '@/components/meeting-booking-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBookings, listRooms } from '@/lib/meeting-api';
import { formatDateTime } from '@/lib/meeting-format';
import type { MeetingBooking, MeetingRoom } from '@/lib/meeting-types';

export default function MeetingBookingsPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const [searchParams, setSearchParams] = useSearchParams();

  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<MeetingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const roomIdParam = searchParams.get('roomId');
  const dateParam = searchParams.get('date');
  const searchParam = searchParams.get('search');

  const roomId = roomIdParam ? Number(roomIdParam) : undefined;
  const date = dateParam ?? '';
  const search = searchParam ?? '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listRooms(appClient);
        if (!cancelled) {
          setRooms(result);
        }
      } catch {
        // The bookings table still renders; only the room filter is affected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appClient]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listBookings(appClient, {
          roomId: roomId && Number.isInteger(roomId) ? roomId : undefined,
          date: date || undefined,
          search: search || undefined,
        });
        if (!cancelled) {
          setBookings(result);
        }
      } catch {
        if (!cancelled) {
          setError(t('common.error'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appClient, date, refreshKey, roomId, search, t]);

  const retry = useCallback(() => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);

  const updateFilters = useCallback(
    (patch: { roomId?: string; date?: string; search?: string }) => {
      const next = new URLSearchParams(searchParams);
      if (patch.roomId !== undefined) {
        if (patch.roomId) {
          next.set('roomId', patch.roomId);
        } else {
          next.delete('roomId');
        }
      }
      if (patch.date !== undefined) {
        if (patch.date) {
          next.set('date', patch.date);
        } else {
          next.delete('date');
        }
      }
      if (patch.search !== undefined) {
        if (patch.search) {
          next.set('search', patch.search);
        } else {
          next.delete('search');
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasFilters = Boolean(roomId || date || search);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('meetingBookings.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('meetingBookings.subtitle')}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          {t('meetingBookings.create')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetingBookings.title')}</CardTitle>
          <CardDescription>{t('meetingBookings.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex flex-wrap items-end gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='filter-room'>
                {t('meetingBookings.filterRoom')}
              </Label>
              <Select
                value={roomId !== undefined ? String(roomId) : ''}
                onValueChange={(value) =>
                  updateFilters({ roomId: value ?? '' })
                }
              >
                <SelectTrigger id='filter-room' className='w-48'>
                  <SelectValue placeholder={t('meetingBookings.allRooms')}>
                    {(value: string) => {
                      if (!value) {
                        return t('meetingBookings.allRooms');
                      }
                      const selected = rooms.find(
                        (room) => String(room.id) === value,
                      );
                      return selected
                        ? `${selected.code} ${selected.name}`
                        : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>
                    {t('meetingBookings.allRooms')}
                  </SelectItem>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={String(room.id)}>
                      {room.code} {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='filter-date'>
                {t('meetingBookings.filterDate')}
              </Label>
              <Input
                id='filter-date'
                type='date'
                className='w-44'
                value={date}
                onChange={(event) =>
                  updateFilters({ date: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='filter-search'>
                {t('meetingBookings.searchTitle')}
              </Label>
              <Input
                id='filter-search'
                className='w-56'
                value={search}
                placeholder={t('meetingBookings.searchTitle')}
                onChange={(event) =>
                  updateFilters({ search: event.target.value })
                }
              />
            </div>
            {hasFilters ? (
              <Button variant='ghost' onClick={clearFilters}>
                {t('meetingBookings.clearFilters')}
              </Button>
            ) : null}
          </div>

          {loading ? (
            <div className='flex items-center justify-center py-10'>
              <Spinner />
            </div>
          ) : error ? (
            <div className='flex flex-col items-center gap-3 py-10'>
              <p className='text-sm text-destructive'>{error}</p>
              <Button variant='outline' onClick={retry}>
                {t('common.retry')}
              </Button>
            </div>
          ) : bookings.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              {t('meetingBookings.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('meetingBookings.subject')}</TableHead>
                  <TableHead>{t('meetingBookings.room')}</TableHead>
                  <TableHead>{t('meetingBookings.organizer')}</TableHead>
                  <TableHead>{t('meetingBookings.startTime')}</TableHead>
                  <TableHead>{t('meetingBookings.endTime')}</TableHead>
                  <TableHead>{t('meetingBookings.status')}</TableHead>
                  <TableHead className='text-right'>
                    {t('meetingBookings.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className='font-medium'>
                      <Link
                        className='text-primary hover:underline'
                        to={`/meeting-bookings/${booking.id}`}
                      >
                        {booking.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {booking.roomCode} {booking.roomName}
                    </TableCell>
                    <TableCell>{booking.organizer}</TableCell>
                    <TableCell>{formatDateTime(booking.startTime)}</TableCell>
                    <TableCell>{formatDateTime(booking.endTime)}</TableCell>
                    <TableCell>
                      {booking.status === 'booked' ? (
                        <Badge variant='default'>
                          {t('meetingBookings.booked')}
                        </Badge>
                      ) : (
                        <Badge variant='secondary'>
                          {t('meetingBookings.cancelled')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        size='sm'
                        variant='ghost'
                        render={<Link to={`/meeting-bookings/${booking.id}`} />}
                      >
                        {t('meetingBookings.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MeetingBookingFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rooms={rooms}
        initialRoomId={roomId}
        onSaved={() => setRefreshKey((key) => key + 1)}
      />
    </section>
  );
}
