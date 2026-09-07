import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createBooking, MeetingApiError } from '@/lib/meeting-api';
import type { MeetingRoom } from '@/lib/meeting-types';

export interface MeetingBookingFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Rooms the user may book; only available rooms are offered. */
  readonly rooms: MeetingRoom[];
  /** Preselected room id, e.g. when arriving from a room detail page. */
  readonly initialRoomId?: number;
  readonly onSaved: () => void;
}

export function MeetingBookingFormDialog({
  open,
  onOpenChange,
  rooms,
  initialRoomId,
  onSaved,
}: MeetingBookingFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);

  const [roomId, setRoomId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setRoomId(initialRoomId !== undefined ? String(initialRoomId) : '');
    setTitle('');
    setOrganizer('');
    setStartTime('');
    setEndTime('');
    setNotes('');
    setError(undefined);
    setSaving(false);
  }, [initialRoomId]);

  // The dialog is opened programmatically through the `open` prop (no DialogTrigger), so
  // `onOpenChange(true)` never fires and the reset inside `handleOpenChange` would be skipped.
  // Reset whenever the dialog becomes visible so the preselected room is applied. This follows
  // React's "storing information from previous renders" pattern: adjust state conditionally
  // during render instead of in an effect (react-hooks/set-state-in-effect forbids the latter).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      reset();
    }
  }

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const handleSubmit = useCallback(async () => {
    if (
      !roomId ||
      !title.trim() ||
      !organizer.trim() ||
      !startTime ||
      !endTime
    ) {
      setError(t('meetingBookings.requiredFields'));
      return;
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end.getTime() <= start.getTime()) {
      setError(t('meetingBookings.invalidTimeRange'));
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await createBooking(appClient, {
        title: title.trim(),
        roomId: Number(roomId),
        organizer: organizer.trim(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        notes: notes.trim() || null,
      });
      onSaved();
      onOpenChange(false);
    } catch (requestError) {
      if (requestError instanceof MeetingApiError) {
        setError(
          requestError.code === 'TIME_CONFLICT'
            ? t('meetingBookings.timeConflict')
            : requestError.code === 'ROOM_UNAVAILABLE'
              ? t('meetingBookings.roomUnavailable')
              : requestError.code === 'INVALID_TIME_RANGE'
                ? t('meetingBookings.invalidTimeRange')
                : requestError.message,
        );
      } else {
        setError(t('common.error'));
      }
    } finally {
      setSaving(false);
    }
  }, [
    appClient,
    endTime,
    notes,
    onOpenChange,
    onSaved,
    organizer,
    roomId,
    startTime,
    t,
    title,
  ]);

  const bookableRooms = rooms.filter((room) => room.available);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('meetingBookings.create')}</DialogTitle>
          <DialogDescription>{t('meetingBookings.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='booking-room'>{t('meetingBookings.room')}</Label>
            <Select
              value={roomId}
              onValueChange={(value) => setRoomId(value ?? '')}
            >
              <SelectTrigger id='booking-room' className='w-full'>
                <SelectValue placeholder={t('meetingBookings.selectRoom')}>
                  {(value: string) => {
                    const selected = bookableRooms.find(
                      (room) => String(room.id) === value,
                    );
                    return selected
                      ? `${selected.code} ${selected.name}（${selected.capacity}${t('meetingRooms.capacityUnit')}）`
                      : t('meetingBookings.selectRoom');
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {bookableRooms.map((room) => (
                  <SelectItem key={room.id} value={String(room.id)}>
                    {room.code} {room.name}（{room.capacity}
                    {t('meetingRooms.capacityUnit')}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='booking-title'>
                {t('meetingBookings.subject')}
              </Label>
              <Input
                id='booking-title'
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='booking-organizer'>
                {t('meetingBookings.organizer')}
              </Label>
              <Input
                id='booking-organizer'
                value={organizer}
                onChange={(event) => setOrganizer(event.target.value)}
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='booking-start'>
                {t('meetingBookings.startTime')}
              </Label>
              <Input
                id='booking-start'
                type='datetime-local'
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='booking-end'>
                {t('meetingBookings.endTime')}
              </Label>
              <Input
                id='booking-end'
                type='datetime-local'
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='booking-notes'>{t('meetingBookings.notes')}</Label>
            <Textarea
              id='booking-notes'
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </div>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('actions.cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? t('common.loading') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
