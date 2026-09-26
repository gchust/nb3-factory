import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { CustomerMemoDeleteDialog } from './customer-memo-delete-dialog.js';
import type { CustomerMemo, CustomerMemosOutletContext } from './types.js';

/**
 * Route `/customer-memos`: the memo list.
 *
 * The create dialog and the detail drawer are child routes rendered by the `<Outlet>` at the end of the container, so
 * they get the reload function through context and the list stays mounted behind them. Search filters the table's
 * `name` column in the browser with the default case-insensitive substring match, so clearing it restores every row.
 */
export default function CustomerMemosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly memos?: CustomerMemo[];
    readonly error?: unknown;
  }>();
  const requestKey = String(reloadCount);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<{ data: CustomerMemo[] }>({
        path: 'customer-memos',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, memos: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const memos = result?.memos ?? [];
  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  // Keep the context stable: the child routes' effects depend on these functions.
  const outletContext = useMemo<CustomerMemosOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale || undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  // The delete confirmation keeps its own open state and target separately, so closing does not clear the title.
  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly memo: CustomerMemo | null;
  }>({ open: false, memo: null });

  const columns = useMemo<ColumnDef<CustomerMemo, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium hover:underline'
            to={{
              pathname: String(row.original.id),
              search: location.search,
            }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'note',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.fields.note')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.note ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.fields.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const memo = row.original;
          return (
            <div className='text-right'>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('customerMemos.openMenu')}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      {t('customerMemos.actions')}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        void navigate({
                          pathname: String(memo.id),
                          search: location.search,
                        });
                      }}
                    >
                      <EyeIcon />
                      {t('customerMemos.view')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        void navigate({
                          pathname: `${memo.id}/edit`,
                          search: location.search,
                        });
                      }}
                    >
                      <PencilIcon />
                      {t('customerMemos.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant='destructive'
                      onClick={() => setDeletion({ open: true, memo })}
                    >
                      <TrashIcon />
                      {t('customerMemos.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [dateFormat, location.search, navigate, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('customerMemos.title')}
        description={t('customerMemos.description')}
        actions={
          <Button
            nativeButton={false}
            render={
              <Link
                to={{ pathname: 'new', search: location.search }}
                data-testid='customer-memo-new'
              />
            }
          >
            <PlusIcon data-icon='inline-start' />
            {t('customerMemos.createAction')}
          </Button>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('customerMemos.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading ? (
        <div
          role='status'
          aria-label={t('status.loading')}
          className='space-y-2'
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={memos}
          emptyMessage={t('customerMemos.empty')}
          toolbar={(table) => (
            <Input
              ref={searchRef}
              type='search'
              value={
                (table.getColumn('name')?.getFilterValue() as
                  string | undefined) ?? ''
              }
              onChange={(event) =>
                table.getColumn('name')?.setFilterValue(event.target.value)
              }
              placeholder={t('customerMemos.searchPlaceholder')}
              aria-label={t('customerMemos.searchLabel')}
              className='max-w-xs'
            />
          )}
        />
      )}

      <CustomerMemoDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        memo={deletion.memo}
        deletedFocusRef={searchRef}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
      />

      {/* The create and detail child routes render here, outside the state branches so a direct visit opens at once. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
