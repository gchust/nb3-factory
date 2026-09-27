import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import {
  createMeetingRoom,
  deleteMeetingRoom,
  listMeetingRooms,
  updateMeetingRoom,
} from './api.js';
import type { MeetingRoom, MeetingRoomInput } from './types.js';

/** The dialog's working copy of a room, as strings so a half-typed number stays valid. */
interface RoomDraft {
  readonly name: string;
  readonly capacity: string;
  readonly location: string;
  readonly description: string;
}

const EMPTY_DRAFT: RoomDraft = {
  name: '',
  capacity: '1',
  location: '',
  description: '',
};

function draftFrom(room: MeetingRoom): RoomDraft {
  return {
    name: room.name,
    capacity: String(room.capacity),
    location: room.location ?? '',
    description: room.description ?? '',
  };
}

/**
 * Meeting rooms — the administrative screen. It lists every room and lets an
 * administrator create, edit and delete one. Only root reaches this page: the
 * route declares `authz: 'unrestricted'`, and the server enforces the same
 * permission on each endpoint, so the page is a convenience over a rule that
 * already holds without it.
 */
export default function MeetingRoomsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `rooms:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rooms?: MeetingRoom[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `rooms:${reloadCount}`;
    listMeetingRooms(api, controller.signal).then(
      (rooms) => {
        if (!controller.signal.aborted) setResult({ key, rooms });
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

  const reload = useCallback((): void => {
    setReloadCount((count) => count + 1);
  }, []);

  const [dialog, setDialog] = useState<MeetingRoom | 'create' | null>(null);
  const [draft, setDraft] = useState<RoomDraft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'name' | 'capacity', string>>
  >({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<MeetingRoom | null>(null);
  const [deletingError, setDeletingError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  function openCreate(): void {
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setDialog('create');
  }

  function openEdit(room: MeetingRoom): void {
    setDraft(draftFrom(room));
    setFieldErrors({});
    setDialog(room);
  }

  function closeDialog(): void {
    if (saving) return;
    setDialog(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors: Partial<Record<'name' | 'capacity', string>> = {};
    const name = draft.name.trim();
    if (!name) errors.name = t('meeting.rooms.error.nameRequired');
    const capacity = Number(draft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      errors.capacity = t('meeting.rooms.error.capacityInvalid');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input: MeetingRoomInput = {
      name,
      capacity,
      location: draft.location.trim() || null,
      description: draft.description.trim() || null,
    };
    setSaving(true);
    try {
      if (dialog === 'create') {
        await createMeetingRoom(api, input);
        toast.add({ type: 'success', title: t('meeting.rooms.created') });
      } else if (dialog) {
        await updateMeetingRoom(api, dialog.id, input);
        toast.add({ type: 'success', title: t('meeting.rooms.updated') });
      }
      setDialog(null);
      reload();
    } catch (caught: unknown) {
      if (
        caught instanceof ApiClientError &&
        caught.code === 'ROOM_NAME_TAKEN'
      ) {
        setFieldErrors({ name: t('meeting.rooms.error.nameTaken') });
      } else if (caught instanceof ApiClientError && caught.status === 403) {
        toast.add({
          type: 'error',
          priority: 'high',
          title: t('meeting.rooms.error.forbidden'),
        });
      } else {
        toast.add({
          type: 'error',
          priority: 'high',
          title: t('meeting.rooms.error.requestFailed'),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    setRemoving(true);
    setDeletingError(null);
    try {
      await deleteMeetingRoom(api, deleting.id);
      toast.add({ type: 'success', title: t('meeting.rooms.deleted') });
      setDeleting(null);
      reload();
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.code === 'ROOM_IN_USE') {
        setDeletingError(t('meeting.rooms.error.inUse'));
      } else if (caught instanceof ApiClientError && caught.status === 404) {
        // Already gone: the outcome the user wanted, so report it as done.
        toast.add({ type: 'info', title: t('meeting.rooms.error.notFound') });
        setDeleting(null);
        reload();
      } else if (caught instanceof ApiClientError && caught.status === 403) {
        setDeletingError(t('meeting.rooms.error.forbidden'));
      } else {
        setDeletingError(t('meeting.rooms.error.requestFailed'));
      }
    } finally {
      setRemoving(false);
    }
  }

  const columns = useMemo<ColumnDef<MeetingRoom>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meeting.rooms.columns.name')}
          />
        ),
      },
      {
        accessorKey: 'capacity',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meeting.rooms.columns.capacity')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.capacity}</span>
        ),
      },
      {
        accessorKey: 'location',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('meeting.rooms.columns.location')}
          />
        ),
        cell: ({ row }) =>
          row.original.location ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        header: t('meeting.rooms.columns.actions'),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('meeting.rooms.actions.open', {
                    name: row.original.name,
                  })}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => openEdit(row.original)}>
                  <PencilIcon />
                  {t('meeting.rooms.actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => {
                    setDeletingError(null);
                    setDeleting(row.original);
                  }}
                >
                  <Trash2Icon />
                  {t('meeting.rooms.actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('meeting.rooms.title')}
        description={t('meeting.rooms.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('meeting.rooms.new')}
          </Button>
        }
      />

      {error instanceof ApiClientError && error.status === 403 ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('meeting.rooms.error.forbidden')}
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>
            {t('meeting.rooms.error.loadFailed')}
          </AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              <RefreshCwIcon data-icon='inline-start' />
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading && rooms.length === 0 ? (
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
          data={rooms}
          emptyMessage={t('meeting.rooms.empty')}
          toolbar={(table) => (
            <>
              <div className='flex-1' />
              <DataTableViewOptions table={table} />
            </>
          )}
        />
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>
                {dialog === 'create'
                  ? t('meeting.rooms.createTitle')
                  : t('meeting.rooms.editTitle')}
              </DialogTitle>
              <DialogDescription>
                {dialog === 'create'
                  ? t('meeting.rooms.createDescription')
                  : t('meeting.rooms.editDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field data-invalid={Boolean(fieldErrors.name)}>
                <FieldLabel htmlFor='meeting-room-name'>
                  {t('meeting.rooms.fields.name')}
                </FieldLabel>
                <Input
                  id='meeting-room-name'
                  value={draft.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <FieldError>{fieldErrors.name}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldErrors.capacity)}>
                <FieldLabel htmlFor='meeting-room-capacity'>
                  {t('meeting.rooms.fields.capacity')}
                </FieldLabel>
                <Input
                  id='meeting-room-capacity'
                  type='number'
                  min={1}
                  step={1}
                  value={draft.capacity}
                  aria-invalid={Boolean(fieldErrors.capacity)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      capacity: event.target.value,
                    }))
                  }
                />
                <FieldError>{fieldErrors.capacity}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor='meeting-room-location'>
                  {t('meeting.rooms.fields.location')}
                </FieldLabel>
                <Input
                  id='meeting-room-location'
                  value={draft.location}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='meeting-room-description'>
                  {t('meeting.rooms.fields.description')}
                </FieldLabel>
                <Textarea
                  id='meeting-room-description'
                  rows={3}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={saving}
                onClick={closeDialog}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? <Spinner data-icon='inline-start' /> : null}
                {t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !removing) {
            setDeleting(null);
            setDeletingError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('meeting.rooms.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('meeting.rooms.deleteDescription', {
                name: deleting?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingError ? (
            <p role='alert' className='text-sm text-destructive'>
              {deletingError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {removing ? <Spinner data-icon='inline-start' /> : null}
              {t('meeting.rooms.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
