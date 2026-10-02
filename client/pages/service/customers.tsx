import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { EmptyState, ErrorState, LoadingState } from './components.js';
import {
  createCustomer,
  deleteCustomer,
  errorMessage,
  listCustomers,
  updateCustomer,
  type Customer,
} from './data.js';

interface FormState {
  name: string;
  code: string;
  level: string;
  contact: string;
  phone: string;
  address: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  level: 'standard',
  contact: '',
  phone: '',
  address: '',
};

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Customer | 'new'>();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<Customer>();
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listCustomers(api)
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, revision]);

  const openCreate = (): void => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };

  const openEdit = (customer: Customer): void => {
    setForm({
      name: customer.name,
      code: customer.code ?? '',
      level: customer.level ?? 'standard',
      contact: customer.contact ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
    });
    setEditing(customer);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      if (editing === 'new') {
        await createCustomer(api, form);
      } else if (editing) {
        await updateCustomer(api, editing.id, form);
      }
      toaster.show({ type: 'success', title: t('service.customers.saved') });
      setEditing(undefined);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteCustomer(api, deleting.id);
      setDeleting(undefined);
      reload();
    } catch (cause: unknown) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Customer>[] = [
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
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('service.customers.code')}
        />
      ),
      cell: ({ row }) => row.original.code ?? '—',
    },
    {
      accessorKey: 'level',
      header: t('service.customers.level'),
      cell: ({ row }) =>
        row.original.level
          ? t(`service.customerLevel.${row.original.level}`)
          : '—',
    },
    {
      accessorKey: 'contact',
      header: t('service.customers.contact'),
      cell: ({ row }) => row.original.contact ?? '—',
    },
    {
      accessorKey: 'phone',
      header: t('service.customers.phone'),
      cell: ({ row }) => row.original.phone ?? '—',
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button
            size='icon-sm'
            variant='ghost'
            onClick={() => openEdit(row.original)}
          >
            <PencilIcon />
          </Button>
          <Button
            size='icon-sm'
            variant='ghost'
            onClick={() => setDeleting(row.original)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('service.customers.create')}
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('service.customers.empty')} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
        />
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new'
                ? t('service.customers.create')
                : t('service.customers.edit')}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='customer-name'>
                {t('service.customers.name')}
              </FieldLabel>
              <Input
                id='customer-name'
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='customer-code'>
                  {t('service.customers.code')}
                </FieldLabel>
                <Input
                  id='customer-code'
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('service.customers.level')}</FieldLabel>
                <Select
                  value={form.level}
                  onValueChange={(level) =>
                    setForm({ ...form, level: level ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='vip'>
                      {t('service.customerLevel.vip')}
                    </SelectItem>
                    <SelectItem value='standard'>
                      {t('service.customerLevel.standard')}
                    </SelectItem>
                    <SelectItem value='potential'>
                      {t('service.customerLevel.potential')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='customer-contact'>
                  {t('service.customers.contact')}
                </FieldLabel>
                <Input
                  id='customer-contact'
                  value={form.contact}
                  onChange={(event) =>
                    setForm({ ...form, contact: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='customer-phone'>
                  {t('service.customers.phone')}
                </FieldLabel>
                <Input
                  id='customer-phone'
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor='customer-address'>
                {t('service.customers.address')}
              </FieldLabel>
              <Input
                id='customer-address'
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditing(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={busy || !form.name} onClick={() => void save()}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('service.customers.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.customers.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void remove()}>
              {t('actions.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
