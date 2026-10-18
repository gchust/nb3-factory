import { createColumnHelper } from '@tanstack/react-table';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';

import { DataTable } from '#components/data-table';
import {
  dataTableFeatures,
  type DataTableColumn,
} from '#components/data-table/features';
import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
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
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import {
  EQUIPMENT_STATUSES,
  equipmentErrorMessageKey,
  isEquipmentStatus,
  listEquipments,
  type Equipment,
  type EquipmentStatus,
} from './api.js';
import { statusTone, type EquipmentListOutletContext } from './types.js';

const PAGE_SIZE = 10;
const column = createColumnHelper<typeof dataTableFeatures, Equipment>();

type StatusFilter = EquipmentStatus | 'all';

/** The shared ledger: a status filter, one page of devices, and the way into create and edit. */
export default function EquipmentsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useApiClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const status: StatusFilter =
    requestedStatus && isEquipmentStatus(requestedStatus)
      ? requestedStatus
      : 'all';
  const currentSearch = searchParams.toString();
  const childSearch = currentSearch ? `?${currentSearch}` : '';
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly rows: readonly Equipment[];
    readonly total: number;
    readonly errorKey?: string;
  }>();
  const [revision, setRevision] = useState(0);
  const requestKey = `${status}|${pagination.pageIndex}|${pagination.pageSize}|${revision}`;
  const current = loaded?.key === requestKey ? loaded : undefined;
  const result =
    current && current.errorKey === undefined
      ? { rows: current.rows, total: current.total }
      : undefined;
  const error = current?.errorKey;

  const reload = useCallback(() => {
    setRevision((currentRevision) => currentRevision + 1);
  }, []);
  const changeStatus = useCallback(
    (next: StatusFilter) => {
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === 'all') params.delete('status');
          else params.set('status', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    void listEquipments(
      client,
      {
        ...(status === 'all' ? {} : { status }),
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
      },
      controller.signal,
    )
      .then((next) => {
        if (!controller.signal.aborted) {
          setLoaded({ key: requestKey, ...next });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({
            key: requestKey,
            rows: [],
            total: 0,
            errorKey: equipmentErrorMessageKey(reason),
          });
        }
      });
    return () => controller.abort();
  }, [
    client,
    pagination.pageIndex,
    pagination.pageSize,
    requestKey,
    revision,
    status,
  ]);

  const columns = useMemo<readonly DataTableColumn<Equipment>[]>(
    () =>
      column.columns([
        column.accessor('code', {
          header: () => t('equipment.fields.code'),
          cell: (info) => (
            <span className='font-medium'>{info.getValue()}</span>
          ),
        }),
        column.accessor('name', {
          header: () => t('equipment.fields.name'),
          cell: (info) => info.getValue(),
        }),
        column.accessor('status', {
          header: () => t('equipment.fields.status'),
          cell: (info) => {
            const value = info.getValue();
            return (
              <StatusBadge tone={statusTone(value)}>
                {t(`equipment.status.${value}`)}
              </StatusBadge>
            );
          },
        }),
        column.accessor('notes', {
          header: () => t('equipment.fields.notes'),
          cell: (info) => {
            const notes = info.getValue();
            return notes ? (
              <span
                className='block max-w-80 truncate text-muted-foreground'
                title={notes}
              >
                {notes}
              </span>
            ) : (
              <span className='text-muted-foreground'>
                {t('equipment.fields.notesEmpty')}
              </span>
            );
          },
        }),
        column.display({
          id: 'actions',
          header: () => t('equipment.fields.actions'),
          cell: (info) => (
            <Button
              variant='ghost'
              size='sm'
              nativeButton={false}
              render={
                <Link to={`edit/${info.row.original.id}${childSearch}`} />
              }
            >
              {t('equipment.actions.edit')}
            </Button>
          ),
        }),
      ]),
    [childSearch, t],
  );

  const filterItems = useMemo(
    () => [
      { value: 'all', label: t('equipment.filter.all') },
      ...EQUIPMENT_STATUSES.map((value) => ({
        value,
        label: t(`equipment.status.${value}`),
      })),
    ],
    [t],
  );

  const empty = result?.total === 0;
  const filtered = status !== 'all';
  // While the first page loads the header has no primary action. An unfiltered empty ledger offers it in the empty
  // state instead, while a filter that matches nothing keeps the header action because the ledger itself is not empty.
  const showHeaderAction = current !== undefined && (!empty || filtered);

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('equipment.title')}
        description={t('equipment.description')}
        actions={
          showHeaderAction ? (
            <Button
              nativeButton={false}
              render={<Link to={`new${childSearch}`} />}
            >
              <PlusIcon data-icon='inline-start' />
              {t('equipment.actions.add')}
            </Button>
          ) : undefined
        }
      />
      <div className='flex items-center gap-2'>
        <Select
          items={filterItems}
          value={status}
          onValueChange={(value) => {
            if (value === 'all' || (value && isEquipmentStatus(value))) {
              changeStatus(value);
            }
          }}
        >
          <SelectTrigger
            className='w-44'
            aria-label={t('equipment.filter.label')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
            {filterItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button variant='ghost' size='sm' onClick={() => changeStatus('all')}>
            {t('equipment.actions.clearFilters')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('equipment.errors.loadFailed')}</AlertTitle>
          <AlertDescription>{t(error)}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('equipment.actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : result === undefined ? (
        <Loading className='py-16' />
      ) : empty ? (
        <Empty className='border border-border'>
          <EmptyHeader>
            <EmptyTitle>
              {t(
                filtered
                  ? 'equipment.empty.filteredTitle'
                  : 'equipment.empty.title',
              )}
            </EmptyTitle>
            <EmptyDescription>
              {t(
                filtered
                  ? 'equipment.empty.filteredDescription'
                  : 'equipment.empty.description',
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button variant='outline' onClick={() => changeStatus('all')}>
                {t('equipment.actions.clearFilters')}
              </Button>
            ) : (
              <Button
                nativeButton={false}
                render={<Link to={`new${childSearch}`} />}
              >
                <PlusIcon data-icon='inline-start' />
                {t('equipment.actions.add')}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={result.rows}
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          rowCount={result.total}
          onPaginationChange={setPagination}
          getRowId={(equipment) => equipment.id}
        />
      )}

      <Outlet context={{ reload } satisfies EquipmentListOutletContext} />
    </PageContainer>
  );
}
