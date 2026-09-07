import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { cancelBooking, getBooking } from '@/lib/meeting-api';
import { formatDateTime } from '@/lib/meeting-format';
import type { MeetingBooking } from '@/lib/meeting-types';

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid grid-cols-3 gap-4 py-2'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='col-span-2 text-sm'>{children}</dd>
    </div>
  );
}

export default function MeetingBookingDetailPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const { id } = useParams<{ id: string }>();

  const [booking, setBooking] = useState<MeetingBooking>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await getBooking(appClient, Number(id));
        if (!cancelled) {
          setBooking(result);
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
  }, [appClient, id, refreshKey, t]);

  const retry = useCallback(() => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);

  const handleCancel = useCallback(async () => {
    if (!booking) {
      return;
    }
    setCancelling(true);
    setCancelError(undefined);
    try {
      const updated = await cancelBooking(appClient, booking.id);
      setBooking(updated);
      setConfirmOpen(false);
    } catch {
      setCancelError(t('common.error'));
    } finally {
      setCancelling(false);
    }
  }, [appClient, booking, t]);

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('meetingBookings.detail')}
          </h2>
        </div>
        <Button variant='outline' render={<Link to='/meeting-bookings' />}>
          {t('meetingBookings.backToList')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{booking?.title ?? t('meetingBookings.detail')}</CardTitle>
          <CardDescription>
            {booking ? `${booking.roomCode} ${booking.roomName}` : undefined}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
          ) : booking ? (
            <dl className='divide-y divide-border'>
              <DetailRow label={t('meetingBookings.subject')}>
                {booking.title}
              </DetailRow>
              <DetailRow label={t('meetingBookings.room')}>
                {booking.roomCode} {booking.roomName}
              </DetailRow>
              <DetailRow label={t('meetingBookings.organizer')}>
                {booking.organizer}
              </DetailRow>
              <DetailRow label={t('meetingBookings.startTime')}>
                {formatDateTime(booking.startTime)}
              </DetailRow>
              <DetailRow label={t('meetingBookings.endTime')}>
                {formatDateTime(booking.endTime)}
              </DetailRow>
              <DetailRow label={t('meetingBookings.notes')}>
                {booking.notes || '—'}
              </DetailRow>
              <DetailRow label={t('meetingBookings.status')}>
                {booking.status === 'booked' ? (
                  <Badge variant='default'>{t('meetingBookings.booked')}</Badge>
                ) : (
                  <Badge variant='secondary'>
                    {t('meetingBookings.cancelled')}
                  </Badge>
                )}
              </DetailRow>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {booking && booking.status === 'booked' ? (
        <div className='flex justify-end'>
          <Button variant='destructive' onClick={() => setConfirmOpen(true)}>
            {t('meetingBookings.cancel')}
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{t('meetingBookings.cancelConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('meetingBookings.cancelConfirmDescription')}
            </DialogDescription>
          </DialogHeader>
          {cancelError ? (
            <p className='text-sm text-destructive' role='alert'>
              {cancelError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setConfirmOpen(false)}
              disabled={cancelling}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={() => void handleCancel()}
              disabled={cancelling}
            >
              {cancelling ? t('common.loading') : t('meetingBookings.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
