/**
 * Borrow records — every loan, including the returned history.
 *
 * The search matches the borrower, the asset number and the device name; the
 * tabs separate unreturned from returned records. An unreturned record whose
 * expected return date has passed is marked as overdue. Returning is started
 * here and from the ledger.
 */
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangleIcon, ArrowUpRightIcon, Undo2Icon } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fetchLoans } from './api.js';
import { BorrowDialog } from './borrow-dialog.js';
import { formatDay } from './format.js';
import { ReturnDialog } from './return-dialog.js';
import type { LoanItem } from './types.js';

type LoanTab = 'all' | 'unreturned' | 'returned';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Identity of the borrow-record request on screen, so a result is only shown for the query that asked for it. */
function requestKeyOf(search: string, tab: LoanTab, reloadKey: number): string {
  return `${search}\u0000${tab}\u0000${reloadKey}`;
}

export default function LoansPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<LoanTab>('all');
  const [loans, setLoans] = useState<LoanItem[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = requestKeyOf(search, tab, reloadKey);
  const loading = loadedKey !== requestKey && failedKey !== requestKey;
  const failed = failedKey === requestKey;

  const [borrowOpen, setBorrowOpen] = useState(false);
  const [returning, setReturning] = useState<LoanItem | null>(null);

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
    const key = requestKeyOf(search, tab, reloadKey);
    void fetchLoans(api, { search, status: tab, signal: controller.signal })
      .then((data) => {
        if (active) {
          setLoans(data);
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
  }, [api, search, tab, reloadKey]);

  const columns = useMemo<ColumnDef<LoanItem>[]>(
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
          <div className='min-w-0 leading-tight'>
            <div className='font-mono text-xs'>{row.original.assetNo}</div>
            <div className='truncate text-xs text-muted-foreground'>
              {row.original.equipmentName}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'borrower',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.borrower')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.borrower}</span>
        ),
      },
      {
        accessorKey: 'purpose',
        header: t('equipment.fields.purpose'),
        cell: ({ row }) => (
          <span className='line-clamp-2 max-w-56 text-muted-foreground'>
            {row.original.purpose ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'borrowedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.borrowedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums text-muted-foreground'>
            {formatDay(row.original.borrowedAt)}
          </span>
        ),
      },
      {
        accessorKey: 'dueAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('equipment.fields.dueAt')}
          />
        ),
        cell: ({ row }) => (
          <span
            className={
              row.original.overdue
                ? 'tabular-nums font-medium text-destructive'
                : 'tabular-nums text-muted-foreground'
            }
          >
            {formatDay(row.original.dueAt)}
          </span>
        ),
      },
      {
        accessorKey: 'returnedAt',
        header: t('equipment.fields.returnedAt'),
        cell: ({ row }) => (
          <span className='tabular-nums text-muted-foreground'>
            {formatDay(row.original.returnedAt)}
          </span>
        ),
      },
      {
        id: 'state',
        enableSorting: false,
        header: t('equipment.fields.state'),
        cell: ({ row }) => {
          const loan = row.original;
          if (loan.returnedAt) {
            return (
              <Badge variant='outline'>{t('equipment.loan.returned')}</Badge>
            );
          }
          return (
            <div className='flex flex-wrap items-center gap-1.5'>
              <Badge variant='secondary'>
                {t('equipment.loan.unreturned')}
              </Badge>
              {loan.overdue ? (
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
        id: 'actions',
        enableHiding: false,
        header: t('equipment.fields.actions'),
        cell: ({ row }) => {
          const loan = row.original;
          if (loan.returnedAt) {
            return null;
          }
          return (
            <div className='flex justify-end'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setReturning(loan)}
              >
                <Undo2Icon data-icon='inline-start' />
                {t('equipment.action.return')}
              </Button>
            </div>
          );
        },
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('equipment.loans.title')}
        description={t('equipment.loans.description')}
        actions={
          <Button onClick={() => setBorrowOpen(true)}>
            <ArrowUpRightIcon data-icon='inline-start' />
            {t('equipment.action.borrowDevice')}
          </Button>
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

      <div className='space-y-4'>
        <Tabs value={tab} onValueChange={(value) => setTab(value as LoanTab)}>
          <TabsList variant='line'>
            {(['all', 'unreturned', 'returned'] as const).map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`equipment.loanTab.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <DataTable
          columns={columns}
          data={loans ?? []}
          getRowId={(loan) => String(loan.id)}
          emptyMessage={
            loading ? t('equipment.loading') : t('equipment.loans.empty')
          }
          toolbar={(table) => (
            <>
              <Input
                placeholder={t('equipment.loans.searchPlaceholder')}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className='max-w-xs'
              />
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`equipment.loanColumns.${column.id}`)
                }
              />
            </>
          )}
        />
      </div>

      <BorrowDialog
        open={borrowOpen}
        onOpenChange={setBorrowOpen}
        onSubmitted={() => {
          reload();
          setBorrowOpen(false);
        }}
      />

      <ReturnDialog
        loanId={returning?.id ?? null}
        equipmentLabel={
          returning ? `${returning.assetNo} · ${returning.equipmentName}` : ''
        }
        borrower={returning?.borrower ?? ''}
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
