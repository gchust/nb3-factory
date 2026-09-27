import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  AlertCircleIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import { CustomerMemoForm } from './customer-memo-form.js';
import { deleteCustomerMemo, fetchCustomerMemos } from './customer-memo-api.js';
import type { CustomerMemo } from './types.js';

const FORM_ID = 'customer-memo-form';
const SEARCH_DEBOUNCE_MS = 250;

type EditorState =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly memo: CustomerMemo }
  | null;

/**
 * Customer memos — the application's single business screen.
 *
 * Lists every memo, searches by customer name through the API, and offers
 * create, view, edit and a secondary-confirmation delete.
 */
export default function CustomerMemosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${debouncedSearch}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly memos?: CustomerMemo[];
    readonly error?: unknown;
  }>();

  const [editor, setEditor] = useState<EditorState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<CustomerMemo | null>(null);
  const [deleting, setDeleting] = useState<CustomerMemo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // A short pause keeps one request per typed word instead of one per keystroke.
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${debouncedSearch}:${reloadCount}`;
    fetchCustomerMemos(api, debouncedSearch, controller.signal).then(
      (memos) => {
        if (!controller.signal.aborted) setResult({ key, memos });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, debouncedSearch, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const memos = result?.memos ?? [];
  const initialLoading = loading && result?.memos === undefined;

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const columns = useMemo<ColumnDef<CustomerMemo, unknown>[]>(
    () => [
      {
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.columns.customerName')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.customerName}</span>
        ),
      },
      {
        accessorKey: 'note',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.columns.note')}
          />
        ),
        cell: ({ row }) =>
          row.original.note ? (
            <span className='line-clamp-2 text-muted-foreground'>
              {row.original.note}
            </span>
          ) : (
            <span className='text-muted-foreground'>
              {t('customerMemos.note.empty')}
            </span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {format(new Date(row.original.createdAt), 'PPpp')}
          </span>
        ),
      },
      {
        id: 'actions',
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
                      aria-label={t('customerMemos.actions.label')}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setDetail(memo)}>
                      <EyeIcon />
                      {t('customerMemos.actions.view')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setEditor({ mode: 'edit', memo })}
                    >
                      <PencilIcon />
                      {t('customerMemos.actions.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant='destructive'
                      onClick={() => setDeleting(memo)}
                    >
                      <Trash2Icon />
                      {t('customerMemos.actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t],
  );

  const handleSubmitted = useCallback(
    (saved: CustomerMemo) => {
      setEditor(null);
      setDetail((current) =>
        current && current.id === saved.id ? saved : current,
      );
      reload();
    },
    [reload],
  );

  const handleNotFound = useCallback(() => {
    setEditor(null);
    toast.add({
      type: 'error',
      title: t('customerMemos.edit.notFound'),
    });
    reload();
  }, [reload, t]);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleteBusy(true);
    try {
      await deleteCustomerMemo(api, target.id);
      setDeleting(null);
      toast.add({
        type: 'success',
        title: t('customerMemos.delete.success', {
          name: target.customerName,
        }),
      });
      reload();
    } catch {
      toast.add({ type: 'error', title: t('customerMemos.delete.failed') });
    } finally {
      setDeleteBusy(false);
    }
  }, [api, deleting, reload, t]);

  let list: ReactElement;
  if (initialLoading) {
    list = (
      <div className='flex items-center justify-center rounded-lg border p-12'>
        <Spinner className='size-5 text-muted-foreground' />
      </div>
    );
  } else if (error) {
    list = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {error instanceof ApiClientError && error.status === 401
            ? t('customerMemos.error.unauthorized')
            : t('customerMemos.error.loadFailed')}
        </AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            <RefreshCwIcon data-icon='inline-start' />
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else {
    list = (
      <DataTable
        columns={columns}
        data={memos}
        pageSize={10}
        getRowId={(memo) => String(memo.id)}
        emptyMessage={
          debouncedSearch
            ? t('customerMemos.emptySearch')
            : t('customerMemos.empty')
        }
        toolbar={(table) => (
          <>
            <div className='relative w-full max-w-xs'>
              <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                type='search'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('customerMemos.searchPlaceholder')}
                aria-label={t('customerMemos.searchPlaceholder')}
                className='pl-8'
              />
            </div>
            <DataTableViewOptions
              table={table}
              getColumnLabel={(column) =>
                t(`customerMemos.columns.${column.id}`)
              }
            />
          </>
        )}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('customerMemos.title')}
        description={t('customerMemos.description')}
        actions={
          <Button onClick={() => setEditor({ mode: 'create' })}>
            <PlusIcon data-icon='inline-start' />
            {t('customerMemos.create.button')}
          </Button>
        }
      />

      {list}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === 'edit'
                ? t('customerMemos.edit.title')
                : t('customerMemos.create.title')}
            </DialogTitle>
            <DialogDescription>
              {editor?.mode === 'edit'
                ? t('customerMemos.edit.description')
                : t('customerMemos.create.description')}
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <CustomerMemoForm
              key={editor.mode === 'edit' ? editor.memo.id : 'create'}
              formId={FORM_ID}
              memo={editor.mode === 'edit' ? editor.memo : undefined}
              onSubmitted={handleSubmitted}
              onSubmittingChange={setSubmitting}
              onNotFound={handleNotFound}
            />
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => setEditor(null)}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' form={FORM_ID} disabled={submitting}>
              {submitting ? t('customerMemos.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className='sm:max-w-lg'>
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.customerName}</SheetTitle>
                <SheetDescription>
                  {t('customerMemos.detail.createdAt', {
                    time: format(new Date(detail.createdAt), 'PPpp'),
                  })}
                </SheetDescription>
              </SheetHeader>
              <div className='flex flex-1 flex-col gap-2 overflow-y-auto px-4'>
                <div className='text-sm font-medium text-foreground'>
                  {t('customerMemos.fields.note')}
                </div>
                <p className='text-sm leading-6 whitespace-pre-wrap text-muted-foreground'>
                  {detail.note ?? t('customerMemos.note.empty')}
                </p>
              </div>
              <SheetFooter>
                <Button
                  onClick={() => {
                    const memo = detail;
                    setDetail(null);
                    setEditor({ mode: 'edit', memo });
                  }}
                >
                  <PencilIcon data-icon='inline-start' />
                  {t('customerMemos.actions.edit')}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('customerMemos.delete.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('customerMemos.delete.description', {
                name: deleting?.customerName ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteBusy
                ? t('customerMemos.delete.deleting')
                : t('customerMemos.actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
