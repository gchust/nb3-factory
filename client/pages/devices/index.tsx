import type { ColumnDef } from '@tanstack/react-table';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { HardDriveIcon, PencilIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link } from 'react-router';

import { DataTable, DataTableColumnHeader } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import {
  DEVICE_STATUSES,
  DeviceClient,
  type Device,
  type DeviceList,
  type DeviceStatus,
} from './device-client.js';
import { DeviceFormDialog } from './device-form-dialog.js';
import { DeviceStatusBadge } from './status-badge.js';

/** The endpoint pages and caps a page at 100 records; this page then paginates in the browser. */
const PAGE_SIZE = 100;

function isDeviceStatus(value: string | null): value is DeviceStatus {
  return DEVICE_STATUSES.some((status) => status === value);
}

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const client = useMemo(() => new DeviceClient(api), [api]);

  // The filter is the page's own state: it is not a permission, a saved view or a deep link somebody shares.
  const [status, setStatus] = useState<DeviceStatus | undefined>(undefined);

  // Reloading bumps a counter the effect depends on, so a save or a retry asks the server again and an effect never
  // has to call setState synchronously.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly Device[];
    readonly total?: number;
    /** Whether the displayed batch was fetched with a filter, which tells "no devices" apart from "no matches". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    client.list({ status, pageSize: PAGE_SIZE }).then(
      (list: DeviceList) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          rows: list.data,
          total: list.meta.total,
          filtered: status !== undefined,
        });
      },
      (error: unknown) => {
        // Keep the previous batch on failure, so a retry shows the old rows behind a small spinner.
        if (!controller.signal.aborted)
          setResult((previous) => ({ ...previous, key, error }));
      },
    );
    return () => controller.abort();
  }, [client, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  // Decide by the filter the shown batch was fetched with: right after clearing it, the old rows are still on screen.
  const rowsFiltered = result?.filtered ?? false;

  // The dialog is remounted for each record it opens, so its draft starts from that record.
  const [editing, setEditing] = useState<{
    readonly device: Device | null;
    readonly key: number;
  } | null>(null);
  const open = (device: Device | null) =>
    setEditing({ device, key: Date.now() });
  const afterSave = useCallback(() => reload(), [reload]);

  const statusItems = [
    { value: 'all', label: t('devices.filters.all') },
    ...DEVICE_STATUSES.map((value) => ({
      value,
      label: t(`devices.status.${value}`),
    })),
  ];
  const hasFilter = status !== undefined;
  const canCreate = rows !== undefined && (rows.length > 0 || rowsFiltered);

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        accessorKey: 'code',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('devices.fields.name')}
          />
        ),
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: 'status',
        header: t('devices.fields.status'),
        enableSorting: false,
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'notes',
        header: t('devices.fields.notes'),
        enableSorting: false,
        // The notes belong to whoever entered them, so they are printed as typed, never translated.
        cell: ({ row }) =>
          row.original.notes ? (
            <span
              className='block max-w-80 truncate'
              title={row.original.notes}
            >
              {row.original.notes}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('devices.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('devices.actions.edit', {
                name: row.original.name,
              })}
              onClick={() => open(row.original)}
            >
              <PencilIcon />
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const createButton = (
    <Button onClick={() => open(null)}>
      <PlusIcon data-icon='inline-start' />
      {t('devices.actions.create')}
    </Button>
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = (
      <Alert variant='destructive'>
        <AlertTitle>{t('devices.errors.sessionExpired')}</AlertTitle>
        <AlertDescription>
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={<Link to='/login' />}
          >
            {t('devices.actions.signIn')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertTitle>{t('devices.errors.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('devices.errors.forbidden')
            : t('devices.errors.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('devices.actions.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('devices.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <HardDriveIcon />
          </EmptyMedia>
          <EmptyTitle>{t('devices.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('devices.empty.description')}</EmptyDescription>
        </EmptyHeader>
        {/* While the ledger is empty this is the only place the primary action appears. */}
        <EmptyContent>{createButton}</EmptyContent>
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('devices.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable<Device>
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('devices.empty.noResults')}</span>
              <Button
                variant='link'
                size='sm'
                onClick={() => setStatus(undefined)}
              >
                {t('devices.filters.clear')}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.description')}
        actions={canCreate ? createButton : undefined}
      />
      <div className='flex flex-wrap items-center gap-3'>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={(value) =>
            setStatus(isDeviceStatus(value) ? value : undefined)
          }
        >
          <SelectTrigger
            className='w-full sm:w-44'
            aria-label={t('devices.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {hasFilter ? (
          <Button variant='ghost' onClick={() => setStatus(undefined)}>
            {t('devices.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}
      {editing ? (
        <DeviceFormDialog
          key={editing.key}
          open
          device={editing.device}
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          onSaved={() => afterSave()}
        />
      ) : null}
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-5 w-16 rounded-full' />
        </div>
      ))}
    </div>
  );
}
