import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

type DeviceStatus = 'available' | 'borrowed';
type StatusFilter = 'all' | DeviceStatus;

interface Device {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface DeviceDraft {
  code: string;
  name: string;
  status: DeviceStatus;
}

const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'devices.available',
  borrowed: 'devices.borrowed',
};

const EMPTY_DRAFT: DeviceDraft = {
  code: '',
  name: '',
  status: 'available',
};

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'name') === 'AbortError'
  );
}

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [devices, setDevices] = useState<Device[]>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const [reloadToken, setReloadToken] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Device>();
  const [draft, setDraft] = useState<DeviceDraft>(EMPTY_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
    general?: string;
  }>({});

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(undefined);
    setReloadToken((token) => token + 1);
  }, []);

  const changeStatusFilter = (value: StatusFilter): void => {
    if (value === statusFilter) return;
    setLoading(true);
    setLoadError(undefined);
    setDevices(undefined);
    setStatusFilter(value);
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void api
      .request<{ data: Device[] }>({
        path: 'devices',
        ...(statusFilter === 'all' ? {} : { query: { status: statusFilter } }),
        signal: controller.signal,
      })
      .then((response) => {
        if (!active) return;
        setDevices(response.data);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setLoadError(error);
        setDevices([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [api, reloadToken, statusFilter]);

  // Base UI's `Select` renders the raw value in its trigger unless `items` tells it which label belongs to each
  // value, so every status select reuses these localized options for both the popup and the trigger.
  const statusOptions = useMemo(
    () =>
      (Object.keys(STATUS_LABELS) as DeviceStatus[]).map((value) => ({
        value,
        label: t(STATUS_LABELS[value]),
      })),
    [t],
  );
  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('devices.allStatuses') },
      ...statusOptions,
    ],
    [statusOptions, t],
  );

  const openCreate = useCallback(() => {
    setEditing(undefined);
    setDraft(EMPTY_DRAFT);
    setSubmitted(false);
    setFieldErrors({});
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((device: Device) => {
    setEditing(device);
    setDraft({
      code: device.code,
      name: device.name,
      status: device.status,
    });
    setSubmitted(false);
    setFieldErrors({});
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    if (busy) return;
    setFormOpen(false);
  }, [busy]);

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('devices.code')} />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('devices.name')} />
        ),
        // User-entered names are rendered verbatim and never translated.
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('devices.status')} />
        ),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === 'available' ? 'secondary' : 'outline'
            }
          >
            {t(STATUS_LABELS[row.original.status])}
          </Badge>
        ),
        filterFn: (row, _columnId, value) =>
          value === 'all' || row.original.status === value,
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='text-sm font-medium'>{t('devices.actions')}</span>
        ),
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            aria-label={t('devices.editDevice', { name: row.original.name })}
            onClick={() => openEdit(row.original)}
          >
            <PencilIcon />
            {t('devices.editTitle')}
          </Button>
        ),
      },
    ],
    [openEdit, t],
  );

  const codeError =
    submitted && !draft.code.trim() ? t('devices.codeRequired') : undefined;
  const nameError =
    submitted && !draft.name.trim() ? t('devices.nameRequired') : undefined;

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!draft.code.trim() || !draft.name.trim()) {
      event.currentTarget
        .querySelector<HTMLInputElement>('input:invalid, input[name="code"]')
        ?.focus();
      return;
    }

    setBusy(true);
    setFieldErrors({});
    const values = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      status: draft.status,
    };

    try {
      await api.request<{ data: Device }>(
        editing
          ? {
              path: `devices/${encodeURIComponent(editing.id)}`,
              method: 'PATCH',
              json: values,
            }
          : { path: 'devices', method: 'POST', json: values },
      );
      toaster.show({
        type: 'success',
        title: t(editing ? 'devices.saved' : 'devices.created', {
          name: values.name,
        }),
      });
      setFormOpen(false);
      reload();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.reason === 'DEVICE_CODE_TAKEN') {
          setFieldErrors({ code: t('devices.duplicateCode') });
        } else if (error.status === 404) {
          setFieldErrors({ general: t('devices.notFound') });
        } else if (error.status === 400) {
          setFieldErrors({ general: t('devices.invalidInput') });
        } else {
          setFieldErrors({ general: t('devices.saveFailed') });
        }
      } else {
        setFieldErrors({ general: t('devices.saveFailed') });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('devices.add')}
          </Button>
        }
      />

      <div className='flex items-end gap-2'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='device-status-filter'>
            {t('devices.filterStatus')}
          </Label>
          <Select
            items={filterOptions}
            value={statusFilter}
            onValueChange={(value) => changeStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger id='device-status-filter' className='w-48'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loadError ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('devices.loadFailed')}
            <Button variant='outline' size='sm' onClick={reload}>
              {t('devices.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading && devices === undefined ? (
        <div aria-label={t('devices.loading')} className='flex flex-col gap-3'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={devices ?? []}
          getRowId={(device) => device.id}
          loading={loading}
          showSelectedCount={false}
          emptyMessage={
            statusFilter === 'all'
              ? t('devices.empty')
              : t('devices.emptyFiltered')
          }
        />
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {t(editing ? 'devices.editTitle' : 'devices.addTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('devices.formDescription')}
            </DialogDescription>
          </DialogHeader>
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => void save(event)}
            noValidate
          >
            {fieldErrors.general ? (
              <Alert variant='destructive'>
                <AlertDescription>{fieldErrors.general}</AlertDescription>
              </Alert>
            ) : null}

            <div className='flex flex-col gap-2'>
              <Label htmlFor='device-code'>{t('devices.code')}</Label>
              <Input
                id='device-code'
                name='code'
                value={draft.code}
                maxLength={64}
                autoComplete='off'
                aria-invalid={
                  (codeError ?? fieldErrors.code) ? true : undefined
                }
                aria-describedby={
                  (codeError ?? fieldErrors.code)
                    ? 'device-code-error'
                    : undefined
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
              />
              {(codeError ?? fieldErrors.code) ? (
                <p
                  id='device-code-error'
                  role='alert'
                  className='text-sm text-destructive'
                >
                  {codeError ?? fieldErrors.code}
                </p>
              ) : null}
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='device-name'>{t('devices.name')}</Label>
              <Input
                id='device-name'
                name='name'
                value={draft.name}
                maxLength={255}
                autoComplete='off'
                aria-invalid={
                  (nameError ?? fieldErrors.name) ? true : undefined
                }
                aria-describedby={
                  (nameError ?? fieldErrors.name)
                    ? 'device-name-error'
                    : undefined
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              {(nameError ?? fieldErrors.name) ? (
                <p
                  id='device-name-error'
                  role='alert'
                  className='text-sm text-destructive'
                >
                  {nameError ?? fieldErrors.name}
                </p>
              ) : null}
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='device-status'>{t('devices.status')}</Label>
              <Select
                items={statusOptions}
                value={draft.status}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    status: value as DeviceStatus,
                  }))
                }
              >
                <SelectTrigger id='device-status' className='w-48'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={closeForm}
              >
                {t('devices.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {busy ? t('devices.saving') : t('devices.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
