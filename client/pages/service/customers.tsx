import { useToaster, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { serviceRequest, useServiceResource, type Customer } from './model.js';
import { ErrorState, LoadingState } from './shared.js';

interface CustomerDraft {
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly notes: string;
}

const EMPTY_DRAFT: CustomerDraft = {
  name: '',
  contactName: '',
  contactPhone: '',
  notes: '',
};

function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  readonly customer: Customer | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const [draft, setDraft] = useState<CustomerDraft>(
    customer
      ? {
          name: customer.name,
          contactName: customer.contactName ?? '',
          contactPhone: customer.contactPhone ?? '',
          notes: customer.notes ?? '',
        }
      : EMPTY_DRAFT,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async (): Promise<void> => {
    if (!draft.name.trim()) {
      setError(t('service.validation.required'));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const body = {
        name: draft.name,
        contactName: draft.contactName || null,
        contactPhone: draft.contactPhone || null,
        notes: draft.notes || null,
      };
      if (customer) {
        await serviceRequest(api, `customers/${customer.id}`, {
          method: 'PUT',
          json: body,
        });
      } else {
        await serviceRequest(api, 'customers', { method: 'POST', json: body });
      }
      toaster.show({ type: 'success', title: t('service.saved') });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {customer
              ? t('service.customers.edit')
              : t('service.customers.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.customers.formDescription')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='py-2'>
          <Field>
            <FieldLabel htmlFor='customer-name'>
              {t('service.customers.name')}
            </FieldLabel>
            <Input
              id='customer-name'
              required
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='customer-contact'>
                {t('service.customers.contactName')}
              </FieldLabel>
              <Input
                id='customer-contact'
                value={draft.contactName}
                onChange={(event) =>
                  setDraft({ ...draft, contactName: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='customer-phone'>
                {t('service.customers.contactPhone')}
              </FieldLabel>
              <Input
                id='customer-phone'
                value={draft.contactPhone}
                onChange={(event) =>
                  setDraft({ ...draft, contactPhone: event.target.value })
                }
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor='customer-notes'>
              {t('service.customers.notes')}
            </FieldLabel>
            <Textarea
              id='customer-notes'
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </Field>
          {error ? (
            <p className='text-sm text-destructive' role='alert'>
              {error}
            </p>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('service.cancel')}
          </Button>
          <Button
            type='button'
            onClick={() => void submit()}
            disabled={pending}
          >
            {pending ? t('service.saving') : t('service.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const api = useApiClient();
  const customers = useServiceResource<Customer[]>('customers');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const rows = useMemo(() => {
    const list = customers.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((customer) =>
      [customer.name, customer.contactName, customer.contactPhone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [customers.data, search]);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    setPendingDelete(true);
    try {
      await serviceRequest(api, `customers/${deleting.id}`, {
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('service.deleted') });
      setDeleting(null);
      customers.reload();
    } catch (cause) {
      toaster.show({
        type: 'error',
        title: t('service.deleteFailed'),
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setPendingDelete(false);
    }
  }, [api, customers, deleting, t, toaster]);

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.customers.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'contactName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.customers.contactName')}
          />
        ),
        cell: ({ row }) => row.original.contactName ?? '—',
      },
      {
        accessorKey: 'contactPhone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.customers.contactPhone')}
          />
        ),
        cell: ({ row }) => row.original.contactPhone ?? '—',
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>{t('service.actions')}</span>,
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('service.actions')}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <PencilIcon />
                {t('service.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon />
                {t('service.delete')}
              </DropdownMenuItem>
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
        title={t('navigation.customers')}
        description={t('service.customers.description')}
        actions={
          <Button type='button' onClick={() => setEditing('new')}>
            <PlusIcon data-icon='inline-start' />
            {t('service.customers.create')}
          </Button>
        }
      />

      <div className='flex items-center gap-2'>
        <Input
          className='max-w-sm'
          placeholder={t('service.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {customers.loading ? (
        <LoadingState />
      ) : customers.error ? (
        <ErrorState message={customers.error} onRetry={customers.reload} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          toolbar={(table) => <DataTableViewOptions table={table} />}
          emptyMessage={t('service.empty')}
        />
      )}

      {editing ? (
        <CustomerDialog
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            customers.reload();
          }}
        />
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.customers.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.customers.deleteDescription', {
                name: deleting?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('service.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void confirmDelete()}
              disabled={pendingDelete}
            >
              {t('service.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
