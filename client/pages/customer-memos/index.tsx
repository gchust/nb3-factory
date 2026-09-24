import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
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
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';

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
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Toaster, toast } from '@/components/ui/toast';

import {
  createCustomerMemo,
  deleteCustomerMemo,
  listCustomerMemos,
  updateCustomerMemo,
  type CustomerMemo,
} from './api.js';

/**
 * The form schema carries translation keys rather than finished sentences, so
 * the message the user reads is resolved at render time and follows a language
 * switch. The only required field is the customer name; notes are optional.
 */
const formSchema = z.object({
  name: z.string().refine((value) => value.trim().length > 0, {
    message: 'customerMemos.nameRequired',
  }),
  notes: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Customer memos — a single business list.
 *
 * `PageHeader` holds the create button, `DataTable` lists the records and owns
 * the partial-name search through its `name` column filter, a `Dialog` edits or
 * creates one record with React Hook Form and Zod validation, and an
 * `AlertDialog` confirms deletion before anything is removed.
 */
export default function CustomerMemosPage(): ReactElement {
  const api = useApiClient();
  const { t } = useTranslation();

  const [memos, setMemos] = useState<CustomerMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerMemo | null>(null);
  const [deleting, setDeleting] = useState<CustomerMemo | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', notes: '' },
  });

  // Reloads after a create, update or delete. The first load belongs to the
  // effect below, which starts with `loading` already true; a reload sets it
  // again because the table it replaces is still on screen.
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setMemos(await listCustomerMemos(api));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    const run = async (): Promise<void> => {
      try {
        const data = await listCustomerMemos(api, controller.signal);
        if (controller.signal.aborted) return;
        setMemos(data);
      } catch {
        if (controller.signal.aborted) return;
        setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [api]);

  const openCreate = useCallback((): void => {
    setEditing(null);
    form.reset({ name: '', notes: '' });
    setFormOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (memo: CustomerMemo): void => {
      setEditing(memo);
      form.reset({ name: memo.name, notes: memo.notes ?? '' });
      setFormOpen(true);
    },
    [form],
  );

  const submit = form.handleSubmit(async (values): Promise<void> => {
    const input = {
      name: values.name.trim(),
      notes: values.notes.trim() === '' ? null : values.notes.trim(),
    };
    setSaving(true);
    try {
      if (editing) {
        await updateCustomerMemo(api, editing.id, input);
        toast.add({ type: 'success', title: t('customerMemos.updated') });
      } else {
        await createCustomerMemo(api, input);
        toast.add({ type: 'success', title: t('customerMemos.created') });
      }
      setFormOpen(false);
      setEditing(null);
      await reload();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NAME_REQUIRED') {
        form.setError('name', { message: 'customerMemos.nameRequired' });
      } else {
        toast.add({
          type: 'error',
          title: t('customerMemos.saveFailed'),
          description: t('customerMemos.saveFailedDescription'),
        });
      }
    } finally {
      setSaving(false);
    }
  });

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!deleting) return;
    const target = deleting;
    setRemoving(true);
    try {
      await deleteCustomerMemo(api, target.id);
      setDeleting(null);
      toast.add({ type: 'success', title: t('customerMemos.deleted') });
      await reload();
    } catch {
      toast.add({
        type: 'error',
        title: t('customerMemos.deleteFailed'),
        description: t('customerMemos.deleteFailedDescription'),
      });
    } finally {
      setRemoving(false);
    }
  }, [api, deleting, reload, t]);

  const columns = useMemo<ColumnDef<CustomerMemo>[]>(
    () => [
      {
        accessorKey: 'name',
        filterFn: 'includesString',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'notes',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('customerMemos.fields.notes')}
          />
        ),
        cell: ({ row }) =>
          row.original.notes ? (
            <span className='line-clamp-1 max-w-md text-muted-foreground'>
              {row.original.notes}
            </span>
          ) : (
            <span className='text-muted-foreground'>
              {t('customerMemos.noNotes')}
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
          <span className='whitespace-nowrap text-muted-foreground'>
            {format(new Date(row.original.createdAt), 'PPp')}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('customerMemos.fields.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t('customerMemos.rowActions')}
                    size='icon'
                    variant='ghost'
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem onClick={() => openEdit(row.original)}>
                  <PencilIcon />
                  {t('customerMemos.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => setDeleting(row.original)}
                >
                  <Trash2Icon />
                  {t('customerMemos.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [t, openEdit],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('customerMemos.title')}
        description={t('customerMemos.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('customerMemos.add')}
          </Button>
        }
      />

      {loading ? (
        <div className='flex items-center justify-center rounded-lg border border-border p-12'>
          <Spinner className='size-5' />
        </div>
      ) : loadFailed ? (
        <div className='flex flex-col items-center gap-3 rounded-lg border border-border p-12 text-center'>
          <p className='text-sm text-muted-foreground'>
            {t('customerMemos.loadFailed')}
          </p>
          <Button variant='outline' onClick={() => void reload()}>
            {t('status.retry')}
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={memos}
          getRowId={(memo) => String(memo.id)}
          emptyMessage={t('customerMemos.empty')}
          toolbar={(table) => (
            <div className='relative w-full sm:max-w-xs'>
              <SearchIcon
                aria-hidden='true'
                className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
              />
              <Input
                aria-label={t('customerMemos.searchLabel')}
                className='pl-9'
                placeholder={t('customerMemos.searchPlaceholder')}
                type='search'
                value={
                  (table.getColumn('name')?.getFilterValue() as
                    string | undefined) ?? ''
                }
                onChange={(event) =>
                  table.getColumn('name')?.setFilterValue(event.target.value)
                }
              />
            </div>
          )}
        />
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            form.reset({ name: '', notes: '' });
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t('customerMemos.editTitle')
                  : t('customerMemos.add')}
              </DialogTitle>
              <DialogDescription>
                {t('customerMemos.formDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Controller
                control={form.control}
                name='name'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor='customer-memo-name'>
                      {t('customerMemos.fields.name')}
                    </FieldLabel>
                    <Input
                      {...field}
                      id='customer-memo-name'
                      aria-invalid={fieldState.invalid}
                      autoComplete='off'
                      placeholder={t('customerMemos.namePlaceholder')}
                    />
                    {fieldState.invalid ? (
                      <FieldError
                        errors={[{ message: t('customerMemos.nameRequired') }]}
                      />
                    ) : null}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name='notes'
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor='customer-memo-notes'>
                      {t('customerMemos.fields.notes')}
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id='customer-memo-notes'
                      aria-invalid={fieldState.invalid}
                      placeholder={t('customerMemos.notesPlaceholder')}
                      rows={4}
                    />
                  </Field>
                )}
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setFormOpen(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? <Spinner /> : null}
                {t('actions.save')}
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
            <AlertDialogTitle>
              {t('customerMemos.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('customerMemos.deleteDescription', {
                name: deleting?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={removing}
              onClick={() => void confirmDelete()}
            >
              {t('customerMemos.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </PageContainer>
  );
}
