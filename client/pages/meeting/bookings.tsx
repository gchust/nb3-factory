import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  CalendarPlusIcon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import {
  cancelMeetingBooking,
  createMeetingBooking,
  listMeetingBookings,
  listMeetingRooms,
} from './api.js';
import {
  dateLocaleFor,
  formatInstant,
  nextHourInput,
  oneHourLater,
} from './format.js';
import type { MeetingBooking, MeetingRoom } from './types.js';

/** The create dialog's working copy of a booking. */
interface BookingDraft {
  readonly title: string;
  readonly roomId: string;
  readonly startAt: string;
  readonly endAt: string;
}

function newDraft(): BookingDraft {
  const startAt = nextHourInput();
  return { title: '', roomId: '', startAt, endAt: oneHourLater(startAt) };
}

/**
 * Meeting bookings — the page every signed-in employee sees. They submit a
 * booking and cancel their own; an administrator sees every booking instead,
 * because the server scopes the read to the owner unless the caller is
 * unrestricted. The client never decides who may see what: it renders exactly
 * the rows the endpoint returns.
 */
export default function MeetingBookingsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateLocale = dateLocaleFor(locale);
  const api = useApiClient();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `bookings:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rooms?: MeetingRoom[];
    readonly bookings?: MeetingBooking[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `bookings:${reloadCount}`;
    Promise.all([
      listMeetingRooms(api, controller.signal),
      listMeetingBookings(api, controller.signal),
    ]).then(
      ([rooms, bookings]) => {
        if (!controller.signal.aborted) setResult({ key, rooms, bookings });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rooms = useMemo(() => result?.rooms ?? [], [result]);
  const bookings = useMemo(() => result?.bookings ?? [], [result]);
  const roomNames = useMemo(
    () => new Map(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );

  const reload = useCallback((): void => {
    setReloadCount((count) => count + 1);
  }, []);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<BookingDraft>(newDraft);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'title' | 'room' | 'range', string>>
  >({});
  const [saving, setSaving] = useState(false);

  const [cancelling, setCancelling] = useState<MeetingBooking | null>(null);
  const [cancellingError, setCancellingError] = useState<string | null>(null);
  const [cancellingPending, setCancellingPending] = useState(false);

  function openCreate(): void {
    setDraft(newDraft());
    setFieldErrors({});
    setCreating(true);
  }

  function changeStart(value: string): void {
    setDraft((current) => ({
      ...current,
      startAt: value,
      // Keep the end after the start without silently discarding a later end.
      endAt: current.endAt <= value ? oneHourLater(value) : current.endAt,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors: Partial<Record<'title' | 'room' | 'range', string>> = {};
    if (!draft.title.trim())
      errors.title = t('meeting.bookings.error.titleRequired');
    if (!draft.roomId) errors.room = t('meeting.bookings.error.roomRequired');
    if (!draft.startAt || !draft.endAt) {
      errors.range = t('meeting.bookings.error.timeRequired');
    } else if (draft.endAt <= draft.startAt) {
      errors.range = t('meeting.bookings.error.invalidRange');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await createMeetingBooking(api, {
        title: draft.title.trim(),
        roomId: Number(draft.roomId),
        startAt: `${draft.startAt}:00.000`,
        endAt: `${draft.endAt}:00.000`,
      });
      toast.add({ type: 'success', title: t('meeting.bookings.created') });
      setCreating(false);
      reload();
    } catch (caught: unknown) {
      if (
        caught instanceof ApiClientError &&
        caught.code === 'BOOKING_CONFLICT'
      ) {
        setFieldErrors({ range: t('meeting.bookings.error.conflict') });
      } else if (
        caught instanceof ApiClientError &&
        caught.code === 'INVALID_TIME_RANGE'
      ) {
        setFieldErrors({ range: t('meeting.bookings.error.invalidRange') });
      } else if (
        caught instanceof ApiClientError &&
        caught.code === 'ROOM_NOT_FOUND'
      ) {
        setFieldErrors({ room: t('meeting.bookings.error.roomNotFound') });
      } else if (caught instanceof ApiClientError && caught.status === 403) {
        toast.add({
          type: 'error',
          priority: 'high',
          title: t('meeting.bookings.error.forbidden'),
        });
      } else {
        toast.add({
          type: 'error',
          priority: 'high',
          title: t('meeting.bookings.error.requestFailed'),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel(): Promise<void> {
    if (!cancelling) return;
    setCancellingPending(true);
    setCancellingError(null);
    try {
      await cancelMeetingBooking(api, cancelling.id);
      toast.add({ type: 'success', title: t('meeting.bookings.cancelled') });
      setCancelling(null);
      reload();
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.status === 404) {
        // Already gone, or no longer visible to this user: the row is not
        // theirs to cancel. Either way the list is what needs refreshing.
        toast.add({
          type: 'info',
          title: t('meeting.bookings.error.notFound'),
        });
        setCancelling(null);
        reload();
      } else if (caught instanceof ApiClientError && caught.status === 403) {
        setCancellingError(t('meeting.bookings.error.forbidden'));
      } else {
        setCancellingError(t('meeting.bookings.error.requestFailed'));
      }
    } finally {
      setCancellingPending(false);
    }
  }

  const columns = useMemo<ColumnDef<MeetingBooking>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meeting.bookings.columns.title')}
          />
        ),
      },
      {
        id: 'room',
        accessorFn: (booking) => roomNames.get(booking.roomId) ?? '',
        header: t('meeting.bookings.columns.room'),
        cell: ({ row }) =>
          roomNames.get(row.original.roomId) ?? (
            <span className='text-muted-foreground'>
              {t('meeting.bookings.unknownRoom')}
            </span>
          ),
      },
      {
        accessorKey: 'startAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meeting.bookings.columns.start')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatInstant(row.original.startAt, dateLocale)}
          </span>
        ),
      },
      {
        accessorKey: 'endAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meeting.bookings.columns.end')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatInstant(row.original.endAt, dateLocale)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('meeting.bookings.columns.status'),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'confirmed' ? 'secondary' : 'outline'
            }
          >
            {t(`meeting.bookings.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: t('meeting.bookings.columns.actions'),
        cell: ({ row }) =>
          row.original.status === 'confirmed' ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                setCancellingError(null);
                setCancelling(row.original);
              }}
            >
              <XCircleIcon data-icon='inline-start' />
              {t('meeting.bookings.cancel')}
            </Button>
          ) : null,
      },
    ],
    [dateLocale, roomNames, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('meeting.bookings.title')}
        description={t('meeting.bookings.description')}
        actions={
          <Button onClick={openCreate} disabled={rooms.length === 0}>
            <CalendarPlusIcon data-icon='inline-start' />
            {t('meeting.bookings.new')}
          </Button>
        }
      />

      {error instanceof ApiClientError && error.status === 403 ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('meeting.bookings.error.forbidden')}
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('meeting.bookings.error.loadFailed')}
          </AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              <RefreshCwIcon data-icon='inline-start' />
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading && bookings.length === 0 ? (
        <div
          role='status'
          aria-label={t('status.loading')}
          className='space-y-3'
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={bookings}
          emptyMessage={t('meeting.bookings.empty')}
          toolbar={(table) => (
            <>
              <div className='flex-1' />
              <DataTableViewOptions table={table} />
            </>
          )}
        />
      )}

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open && !saving) setCreating(false);
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{t('meeting.bookings.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('meeting.bookings.createDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={Boolean(fieldErrors.title)}>
                <FieldLabel htmlFor='meeting-booking-title'>
                  {t('meeting.bookings.fields.title')}
                </FieldLabel>
                <Input
                  id='meeting-booking-title'
                  value={draft.title}
                  aria-invalid={Boolean(fieldErrors.title)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <FieldError>{fieldErrors.title}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldErrors.room)}>
                <FieldLabel htmlFor='meeting-booking-room'>
                  {t('meeting.bookings.fields.room')}
                </FieldLabel>
                <Select
                  value={draft.roomId}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, roomId: value ?? '' }))
                  }
                >
                  <SelectTrigger
                    id='meeting-booking-room'
                    className='w-full'
                    aria-invalid={Boolean(fieldErrors.room)}
                  >
                    <SelectValue
                      placeholder={t('meeting.bookings.selectRoom')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={String(room.id)}>
                        {t('meeting.bookings.roomOption', {
                          name: room.name,
                          count: room.capacity,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.room}</FieldError>
              </Field>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor='meeting-booking-start'>
                    {t('meeting.bookings.fields.startAt')}
                  </FieldLabel>
                  <Input
                    id='meeting-booking-start'
                    type='datetime-local'
                    value={draft.startAt}
                    aria-invalid={Boolean(fieldErrors.range)}
                    onChange={(event) => changeStart(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='meeting-booking-end'>
                    {t('meeting.bookings.fields.endAt')}
                  </FieldLabel>
                  <Input
                    id='meeting-booking-end'
                    type='datetime-local'
                    value={draft.endAt}
                    aria-invalid={Boolean(fieldErrors.range)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        endAt: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field data-invalid={Boolean(fieldErrors.range)}>
                <FieldError>{fieldErrors.range}</FieldError>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? <Spinner data-icon='inline-start' /> : null}
                {t('meeting.bookings.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open && !cancellingPending) {
            setCancelling(null);
            setCancellingError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('meeting.bookings.cancelTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('meeting.bookings.cancelDescription', {
                title: cancelling?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancellingError ? (
            <p role='alert' className='text-sm text-destructive'>
              {cancellingError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingPending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={cancellingPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmCancel();
              }}
            >
              {cancellingPending ? <Spinner data-icon='inline-start' /> : null}
              {t('meeting.bookings.cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
