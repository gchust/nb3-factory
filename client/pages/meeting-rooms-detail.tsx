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
import { Spinner } from '@/components/ui/spinner';
import { getRoom } from '@/lib/meeting-api';
import type { MeetingRoom } from '@/lib/meeting-types';

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

export default function MeetingRoomDetailPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const { id } = useParams<{ id: string }>();

  const [room, setRoom] = useState<MeetingRoom>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await getRoom(appClient, Number(id));
        if (!cancelled) {
          setRoom(result);
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

  return (
    <section className='mx-auto w-full max-w-3xl space-y-6 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('meetingRooms.detail')}
          </h2>
        </div>
        <Button variant='outline' render={<Link to='/meeting-rooms' />}>
          {t('meetingRooms.backToList')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {room ? `${room.code} ${room.name}` : t('meetingRooms.detail')}
          </CardTitle>
          <CardDescription>{room?.location}</CardDescription>
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
          ) : room ? (
            <dl className='divide-y divide-border'>
              <DetailRow label={t('meetingRooms.code')}>{room.code}</DetailRow>
              <DetailRow label={t('meetingRooms.name')}>{room.name}</DetailRow>
              <DetailRow label={t('meetingRooms.location')}>
                {room.location}
              </DetailRow>
              <DetailRow label={t('meetingRooms.capacity')}>
                {room.capacity} {t('meetingRooms.capacityUnit')}
              </DetailRow>
              <DetailRow label={t('meetingRooms.equipment')}>
                {room.equipment || '—'}
              </DetailRow>
              <DetailRow label={t('meetingRooms.available')}>
                {room.available ? (
                  <Badge variant='default'>
                    {t('meetingRooms.availableYes')}
                  </Badge>
                ) : (
                  <Badge variant='secondary'>
                    {t('meetingRooms.availableNo')}
                  </Badge>
                )}
              </DetailRow>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {room ? (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            render={<Link to={`/meeting-bookings?roomId=${room.id}`} />}
          >
            {t('meetingRooms.viewBookings')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
