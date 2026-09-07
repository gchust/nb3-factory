import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { createRoom, MeetingApiError, updateRoom } from '@/lib/meeting-api';
import type { MeetingRoom } from '@/lib/meeting-types';

export interface MeetingRoomFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The room being edited, or null to create a new one. */
  readonly room: MeetingRoom | null;
  readonly onSaved: () => void;
}

export function MeetingRoomFormDialog({
  open,
  onOpenChange,
  room,
  onSaved,
}: MeetingRoomFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [equipment, setEquipment] = useState('');
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setCode(room?.code ?? '');
    setName(room?.name ?? '');
    setLocation(room?.location ?? '');
    setCapacity(room ? String(room.capacity) : '');
    setEquipment(room?.equipment ?? '');
    setAvailable(room?.available ?? true);
    setError(undefined);
    setSaving(false);
  }, [room]);

  // The dialog is opened programmatically through the `open` prop (no DialogTrigger), so
  // `onOpenChange(true)` never fires and the reset inside `handleOpenChange` would be skipped.
  // Reset whenever the dialog becomes visible so an edit form pre-fills the room's values. This
  // follows React's "storing information from previous renders" pattern: adjust state
  // conditionally during render instead of in an effect (react-hooks/set-state-in-effect
  // forbids the latter).
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
    const capacityValue = Number(capacity);
    if (!code.trim() || !name.trim() || !location.trim()) {
      setError(t('meetingRooms.requiredFields'));
      return;
    }
    if (!Number.isInteger(capacityValue) || capacityValue <= 0) {
      setError(t('meetingRooms.capacityInvalid'));
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const input = {
        code: code.trim(),
        name: name.trim(),
        location: location.trim(),
        capacity: capacityValue,
        equipment: equipment.trim() || null,
        available,
      };
      if (room) {
        await updateRoom(appClient, room.id, input);
      } else {
        await createRoom(appClient, input);
      }
      onSaved();
      onOpenChange(false);
    } catch (requestError) {
      if (requestError instanceof MeetingApiError) {
        setError(
          requestError.code === 'CODE_TAKEN'
            ? t('meetingRooms.codeTaken')
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
    available,
    capacity,
    code,
    equipment,
    location,
    name,
    onOpenChange,
    onSaved,
    room,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {room ? t('meetingRooms.edit') : t('meetingRooms.create')}
          </DialogTitle>
          <DialogDescription>
            {room ? room.name : t('meetingRooms.subtitle')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='room-code'>{t('meetingRooms.code')}</Label>
              <Input
                id='room-code'
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder='R-101'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='room-name'>{t('meetingRooms.name')}</Label>
              <Input
                id='room-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='room-location'>
                {t('meetingRooms.location')}
              </Label>
              <Input
                id='room-location'
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='room-capacity'>
                {t('meetingRooms.capacity')}
              </Label>
              <Input
                id='room-capacity'
                type='number'
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='room-equipment'>
              {t('meetingRooms.equipment')}
            </Label>
            <Textarea
              id='room-equipment'
              value={equipment}
              onChange={(event) => setEquipment(event.target.value)}
              rows={3}
            />
          </div>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='room-available'
              checked={available}
              onCheckedChange={setAvailable}
            />
            <Label htmlFor='room-available'>
              {t('meetingRooms.available')}
            </Label>
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
