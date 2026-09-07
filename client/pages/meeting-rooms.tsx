import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { MeetingRoomFormDialog } from '@/components/meeting-room-form-dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listRooms } from '@/lib/meeting-api';
import type { MeetingRoom } from '@/lib/meeting-types';

export default function MeetingRoomsPage(): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);

  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<MeetingRoom | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listRooms(appClient);
        if (!cancelled) {
          setRooms(result);
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
  }, [appClient, refreshKey, t]);

  const retry = useCallback(() => {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);

  const openCreate = useCallback(() => {
    setEditingRoom(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((room: MeetingRoom) => {
    setEditingRoom(room);
    setDialogOpen(true);
  }, []);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('meetingRooms.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('meetingRooms.subtitle')}
          </p>
        </div>
        <Button onClick={openCreate}>{t('meetingRooms.create')}</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetingRooms.title')}</CardTitle>
          <CardDescription>{t('meetingRooms.subtitle')}</CardDescription>
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
          ) : rooms.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              {t('meetingRooms.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('meetingRooms.code')}</TableHead>
                  <TableHead>{t('meetingRooms.name')}</TableHead>
                  <TableHead>{t('meetingRooms.location')}</TableHead>
                  <TableHead>{t('meetingRooms.capacity')}</TableHead>
                  <TableHead>{t('meetingRooms.equipment')}</TableHead>
                  <TableHead>{t('meetingRooms.available')}</TableHead>
                  <TableHead className='text-right'>
                    {t('meetingRooms.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className='font-medium'>{room.code}</TableCell>
                    <TableCell>
                      <Link
                        className='text-primary hover:underline'
                        to={`/meeting-rooms/${room.id}`}
                      >
                        {room.name}
                      </Link>
                    </TableCell>
                    <TableCell>{room.location}</TableCell>
                    <TableCell>
                      {room.capacity} {t('meetingRooms.capacityUnit')}
                    </TableCell>
                    <TableCell className='max-w-64 truncate'>
                      {room.equipment || '—'}
                    </TableCell>
                    <TableCell>
                      {room.available ? (
                        <Badge variant='default'>
                          {t('meetingRooms.availableYes')}
                        </Badge>
                      ) : (
                        <Badge variant='secondary'>
                          {t('meetingRooms.availableNo')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => openEdit(room)}
                        >
                          {t('meetingRooms.editAction')}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          render={<Link to={`/meeting-rooms/${room.id}`} />}
                        >
                          {t('meetingRooms.view')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MeetingRoomFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        room={editingRoom}
        onSaved={() => setRefreshKey((key) => key + 1)}
      />
    </section>
  );
}
