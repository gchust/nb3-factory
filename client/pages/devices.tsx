import {
  ApiClientError,
  useApiClient,
  type ApiClient,
} from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Toaster, toast } from '@/components/ui/toast';

/** One device as the server returns it. Mirrors `Device` in `server/devices-resources.ts`. */
interface Device {
  readonly id: number;
  readonly code: string;
  readonly name: string;
}

const DEVICES_RESOURCE = { type: 'composite', id: 'devices' } as const;

function errorKey(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'DUPLICATE_CODE') {
    return 'devices.duplicateCode';
  }
  return 'devices.unknownError';
}

/** A text field's value, or an empty string when the entry is absent or not text. */
function formValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads the device list. Kept outside the component so an effect can load it without setting state synchronously. */
async function fetchDevices(
  api: ApiClient,
  signal: AbortSignal,
): Promise<Device[]> {
  const { data } = await api.request<{ data: Device[] }>({
    path: 'devices',
    signal,
  });
  return data;
}

/**
 * The device list: the two business fields every signed-in device reader sees, with create, edit and delete shown
 * only to identities the authorization engine grants them. An integration account holding `view` alone reads the
 * same table through the same endpoint.
 */
export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);

  const create = useCan({ resource: DEVICES_RESOURCE, action: 'create' });
  const edit = useCan({ resource: DEVICES_RESOURCE, action: 'edit' });
  const remove = useCan({ resource: DEVICES_RESOURCE, action: 'delete' });

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setDevices(await fetchDevices(api, new AbortController().signal));
    } catch {
      // A failed refresh keeps the last good list; the mutation that triggered it already reported its outcome.
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDevices(api, controller.signal)
      .then((data) => {
        setDevices(data);
        setLoadError(undefined);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api]);

  const openCreate = (): void => {
    setEditing(null);
    setEditorOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = formValue(data, 'code');
    const name = formValue(data, 'name');
    if (!code || !name) return;

    const target = editing;
    setSaving(true);
    try {
      if (target) {
        await api.request({
          path: `devices/${target.id}`,
          method: 'PUT',
          json: { code, name },
        });
      } else {
        await api.request({
          path: 'devices',
          method: 'POST',
          json: { code, name },
        });
      }
      setEditorOpen(false);
      setEditing(null);
      toast.add({
        type: 'success',
        title: t(target ? 'devices.updated' : 'devices.created'),
      });
      await refresh();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('devices.saveFailed'),
        description: t(errorKey(error)),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    const target = deleting;
    if (!target) return;
    setDeleting(null);
    try {
      await api.request({ path: `devices/${target.id}`, method: 'DELETE' });
      toast.add({
        type: 'success',
        title: t('devices.deleted'),
        description: target.code,
      });
      await refresh();
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('devices.deleteFailed'),
        description: t(errorKey(error)),
      });
    }
  };

  const showActions = edit.can || remove.can;

  const columns = useMemo<ColumnDef<Device>[]>(() => {
    const base: ColumnDef<Device>[] = [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('devices.code')} />
        ),
        cell: ({ row }) => (
          <span className='font-mono'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('devices.name')} />
        ),
      },
    ];
    if (!showActions) return base;
    return [
      ...base,
      {
        id: 'actions',
        header: () => <div className='text-right'>{t('devices.actions')}</div>,
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            {edit.can ? (
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('devices.edit')}
                onClick={() => {
                  setEditing(row.original);
                  setEditorOpen(true);
                }}
              >
                <PencilIcon />
              </Button>
            ) : null}
            {remove.can ? (
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('devices.delete')}
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </div>
        ),
      },
    ];
  }, [edit.can, remove.can, showActions, t]);

  return (
    <PageContainer>
      <Toaster />
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={
          create.can ? (
            <Button onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              {t('devices.create')}
            </Button>
          ) : null
        }
      />

      {loadError ? (
        <p className='text-sm text-muted-foreground'>
          {t('devices.loadFailed')}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={devices}
        pageSize={10}
        getRowId={(device) => String(device.id)}
        emptyMessage={loading ? t('devices.loading') : t('devices.empty')}
      />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>
                {t(editing ? 'devices.editTitle' : 'devices.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('devices.formDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='device-code'>
                  {t('devices.code')}
                </FieldLabel>
                <Input
                  id='device-code'
                  name='code'
                  // Recreate the inputs when the edited row changes so they pick up its values.
                  key={editing?.id ?? 'new'}
                  defaultValue={editing?.code ?? ''}
                  maxLength={64}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='device-name'>
                  {t('devices.name')}
                </FieldLabel>
                <Input
                  id='device-name'
                  name='name'
                  key={editing?.id ?? 'new'}
                  defaultValue={editing?.name ?? ''}
                  maxLength={128}
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditorOpen(false)}
              >
                {t('devices.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {t('devices.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('devices.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('devices.deleteDescription', {
                code: deleting?.code ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('devices.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
            >
              {t('devices.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
