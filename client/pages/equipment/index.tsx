/**
 * Equipment ledger — the device list with the health summary above it.
 *
 * The top cards count every device, how many are lent out and how many are
 * past their expected return date; the tabs and the search only filter the
 * table, so the counts never change with the current view. Adding, editing,
 * lending and returning are all started from this page.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  PencilIcon,
  PlusIcon,
  Undo2Icon,
} from 'lucide-react';
import {
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fetchEquipment, type EquipmentListResult } from './api.js';
import { BorrowDialog } from './borrow-dialog.js';
import { EquipmentDialog } from './equipment-dialog.js';
import { formatDay } from './format.js';
import { ReturnDialog } from './return-dialog.js';
import type { EquipmentItem } from './types.js';

type StatusTab = 'all' | 'available' | 'borrowed';

function equipmentLabel(item: EquipmentItem): string {
  return `${item.assetNo} · ${item.name}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Identity of the ledger request currently on screen, so a result is only shown for the query that asked for it. */
function requestKeyOf(
  search: string,
  tab: StatusTab,
  reloadKey: number,
): string {
  return `${search}\u0000${tab}\u0000${reloadKey}`;
}

export default function EquipmentLedgerPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [result, setResult] = useState<EquipmentListResult | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = requestKeyOf(search, statusTab, reloadKey);
  const loading = loadedKey !== requestKey && failedKey !== requestKey;
  const failed = failedKey === requestKey;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | undefined>(undefined);
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [borrowEquipmentId, setBorrowEquipmentId] = useState<
    number | undefined
  >(undefined);
  const [returning, setReturning] = useState<EquipmentItem | null>(null);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const key = requestKeyOf(search, statusTab, reloadKey);
    void fetchEquipment(api, {
      search,
      status: statusTab,
      signal: controller.signal,
    })
      .then((data) => {
        if (active) {
          setResult(data);
          setLoadedKey(key);
        }
      })
      .catch((error: unknown) => {
        if (active && !isAbortError(error)) setFailedKey(key);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, search, statusTab, reloadKey]);

  const stats = result?.stats ?? { total: 0, borrowed: 0, overdue: 0 };
  const availableCount = Math.max(stats.total - stats.borrowed, 0);

  const openCreate = useCallback((): void => {
    setEditing(undefined);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((item: EquipmentItem): void => {
    setEditing(item);
    setEditorOpen(true);
  }, []);

  const openBorrow = useCallback((item?: EquipmentItem): void => {
    setBorrowEquipmentId(item?.id);
    setBorrowOpen(true);
  }, []);

  const columns = useMemo<ColumnDef<EquipmentItem>[]>(
    () => [
      {
        accessorKey: 'assetNo',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.assetNo')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.assetNo}</span>
        ),
      },
      {
        id: 'equipment',
        accessorFn: (item) => item.name,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-0 leading-tight'>
            <div className='truncate font-medium'>{row.original.name}</div>
            <div className='truncate text-xs text-muted-foreground'>
              {row.original.category}
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        enableSorting: false,
        header: t('equipment.fields.status'),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className='flex flex-wrap items-center gap-1.5'>
              <Badge
                variant={item.status === 'borrowed' ? 'secondary' : 'outline'}
              >
                {t(`equipment.status.${item.status}`)}
              </Badge>
              {item.activeLoan?.overdue ? (
                <Badge variant='destructive'>
                  <AlertTriangleIcon />
                  {t('equipment.status.overdue')}
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'activeLoan',
        enableSorting: false,
        header: t('equipment.fields.currentBorrower'),
        cell: ({ row }) => {
          const loan = row.original.activeLoan;
          if (!loan) {
            return <span className='text-muted-foreground'>—</span>;
          }
          return (
            <div className='min-w-0 leading-tight'>
              <div className='truncate'>{loan.borrower}</div>
              <div className='text-xs text-muted-foreground'>
                {t('equipment.ledger.dueOn', { date: formatDay(loan.dueAt) })}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'notes',
        header: t('equipment.fields.notes'),
        cell: ({ row }) => (
          <span className='line-clamp-2 max-w-56 text-xs text-muted-foreground'>
            {row.original.notes ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        header: t('equipment.fields.actions'),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className='flex justify-end gap-1.5'>
              {item.status === 'available' ? (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => openBorrow(item)}
                >
                  <ArrowUpRightIcon data-icon='inline-start' />
                  {t('equipment.action.borrow')}
                </Button>
              ) : (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setReturning(item)}
                >
                  <Undo2Icon data-icon='inline-start' />
                  {t('equipment.action.return')}
                </Button>
              )}
              <Button variant='ghost' size='sm' onClick={() => openEdit(item)}>
                <PencilIcon data-icon='inline-start' />
                {t('equipment.action.edit')}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, openBorrow, openEdit],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('equipment.ledger.title')}
        description={t('equipment.ledger.description')}
        actions={
          <>
            <Button variant='outline' onClick={() => openBorrow()}>
              <ArrowUpRightIcon data-icon='inline-start' />
              {t('equipment.action.borrowDevice')}
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              {t('equipment.action.create')}
            </Button>
          </>
        }
      />

      {failed ? (
        <Alert variant='destructive'>
          <AlertTriangleIcon />
          <AlertDescription className='flex items-center justify-between gap-3'>
            {t('equipment.error.requestFailed')}
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid gap-4 sm:grid-cols-3'>
        <StatCard label={t('equipment.stats.total')} value={stats.total} />
        <StatCard
          label={t('equipment.stats.borrowed')}
          value={stats.borrowed}
        />
        <StatCard
          label={t('equipment.stats.overdue')}
          value={stats.overdue}
          highlight={stats.overdue > 0}
        />
      </div>

      <div className='space-y-4'>
        <Tabs
          value={statusTab}
          onValueChange={(value) => setStatusTab(value as StatusTab)}
        >
          <TabsList variant='line'>
            {(['all', 'available', 'borrowed'] as const).map((status) => (
              <TabsTrigger key={status} value={status}>
                {t(`equipment.tab.${status}`)}
                <Badge variant='secondary' className='tabular-nums'>
                  {status === 'all'
                    ? stats.total
                    : status === 'available'
                      ? availableCount
                      : stats.borrowed}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <DataTable
          columns={columns}
          data={result?.items ?? []}
          getRowId={(item) => String(item.id)}
          emptyMessage={
            loading ? t('equipment.loading') : t('equipment.ledger.empty')
          }
          toolbar={(table) => (
            <>
              <Input
                placeholder={t('equipment.ledger.searchPlaceholder')}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className='max-w-xs'
              />
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) => t(`equipment.columns.${column.id}`)}
              />
            </>
          )}
        />
      </div>

      <EquipmentDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        equipment={editing}
        onReload={reload}
        onSubmitted={() => {
          reload();
          setEditorOpen(false);
        }}
      />

      <BorrowDialog
        open={borrowOpen}
        onOpenChange={setBorrowOpen}
        equipmentId={borrowEquipmentId}
        onSubmitted={() => {
          reload();
          setBorrowOpen(false);
        }}
      />

      <ReturnDialog
        loanId={returning?.activeLoan?.id ?? null}
        equipmentLabel={returning ? equipmentLabel(returning) : ''}
        borrower={returning?.activeLoan?.borrower ?? ''}
        onOpenChange={(open) => {
          if (!open) setReturning(null);
        }}
        onReturned={() => {
          reload();
          setReturning(null);
        }}
        onGone={() => {
          reload();
          setReturning(null);
        }}
      />
    </PageContainer>
  );
}

interface StatCardProps {
  readonly label: string;
  readonly value: number;
  readonly highlight?: boolean;
}

function StatCard({ label, value, highlight }: StatCardProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            highlight
              ? 'font-heading text-2xl tabular-nums text-destructive'
              : 'font-heading text-2xl tabular-nums'
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
