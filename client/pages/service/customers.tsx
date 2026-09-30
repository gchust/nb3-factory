import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, UsersIcon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import { ServiceTableToolbar } from './components/service-table-toolbar.js';
import {
  EmptyState,
  LoadError,
  TableSkeleton,
} from './components/service-states.js';
import { errorMessage } from './service-api.js';
import {
  useAsync,
  useServiceApi,
  useServicePermission,
} from './service-hooks.js';
import { SERVICE_LEVELS, type ServiceCustomer } from './types.js';

interface FormState {
  readonly code: string;
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly address: string;
  readonly serviceLevel: string;
  readonly notes: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  contactName: '',
  contactPhone: '',
  address: '',
  serviceLevel: 'standard',
  notes: '',
};

/** The customer ledger, with create and edit dialogs. */
export default function ServiceCustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const [editing, setEditing] = useState<ServiceCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const open = creating || editing !== null;

  const customers = useAsync(
    () => api.listCustomers({ limit: 500 }),
    'customers',
  );
  const canManage = useServicePermission('service.customers', 'manage');

  const columns = useMemo<ColumnDef<ServiceCustomer>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.customer.code')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-sm'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('service.customer.name')}
          />
        ),
        filterFn: (row, _columnId, value) => {
          const needle = String(value).toLowerCase();
          return [
            row.original.name,
            row.original.code,
            row.original.contactName,
          ]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle));
        },
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'contactName',
        header: t('service.customer.contact'),
        cell: ({ row }) => (
          <div className='flex flex-col text-sm'>
            <span>{row.original.contactName ?? '—'}</span>
            <span className='text-xs text-muted-foreground'>
              {row.original.contactPhone ?? ''}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'serviceLevel',
        header: t('service.customer.serviceLevel'),
        cell: ({ row }) =>
          t(`service.serviceLevel.${row.original.serviceLevel}`, {
            defaultValue: row.original.serviceLevel,
          }),
      },
      {
        accessorKey: 'address',
        header: t('service.customer.address'),
        cell: ({ row }) => (
          <span className='text-sm text-muted-foreground'>
            {row.original.address ?? '—'}
          </span>
        ),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setEditing(row.original)}
                >
                  <PencilIcon />
                  {t('service.action.edit')}
                </Button>
              ),
            } satisfies ColumnDef<ServiceCustomer>,
          ]
        : []),
    ],
    [canManage, t],
  );

  const closeForm = useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);

  const saved = useCallback(() => {
    closeForm();
    customers.reload();
  }, [closeForm, customers]);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              {t('service.customers.new')}
            </Button>
          ) : null
        }
      />

      {customers.error ? (
        <LoadError error={customers.error} onRetry={customers.reload} />
      ) : null}

      {customers.loading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : (
        <DataTable
          columns={columns}
          data={customers.data ?? []}
          emptyMessage={<EmptyState title={t('service.customers.empty')} />}
          toolbar={(table) => (
            <ServiceTableToolbar
              table={table}
              columnId='name'
              placeholder={t('service.customers.searchPlaceholder')}
            />
          )}
        />
      )}

      {customers.data && customers.data.length > 0 ? (
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <UsersIcon className='size-3.5' />
          {t('service.customers.count', { count: customers.data.length })}
        </p>
      ) : null}

      <CustomerFormDialog
        key={open ? (editing ? `edit:${editing.id}` : 'create') : 'closed'}
        open={open}
        customer={editing}
        onClose={closeForm}
        onSaved={saved}
        onError={(error) =>
          toaster.show({
            type: 'error',
            title: t('service.customers.saveFailed'),
            description: errorMessage(error),
          })
        }
      />
    </PageContainer>
  );
}

function CustomerFormDialog({
  open,
  customer,
  onClose,
  onSaved,
  onError,
}: {
  readonly open: boolean;
  readonly customer: ServiceCustomer | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onError: (error: unknown) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [form, setForm] = useState<FormState>(() =>
    customer
      ? {
          code: customer.code,
          name: customer.name,
          contactName: customer.contactName ?? '',
          contactPhone: customer.contactPhone ?? '',
          address: customer.address ?? '',
          serviceLevel: customer.serviceLevel,
          notes: customer.notes ?? '',
        }
      : EMPTY_FORM,
  );
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    const values: Record<string, unknown> = {
      name: form.name.trim(),
      serviceLevel: form.serviceLevel,
    };
    for (const field of [
      'code',
      'contactName',
      'contactPhone',
      'address',
      'notes',
    ] as const) {
      values[field] = form[field].trim() ? form[field].trim() : null;
    }
    try {
      if (customer) {
        await api.updateCustomer(customer.id, values);
      } else {
        await api.createCustomer(values);
      }
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [api, customer, form, onError, onSaved]);

  const field = (
    name: keyof FormState,
    label: ReactNode,
    options: { readonly required?: boolean } = {},
  ): ReactElement => (
    <div className='flex flex-col gap-2'>
      <Label htmlFor={`customer-${name}`}>{label}</Label>
      <Input
        id={`customer-${name}`}
        value={form[name]}
        required={options.required}
        onChange={(event) =>
          setForm((current) => ({ ...current, [name]: event.target.value }))
        }
      />
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {customer
              ? t('service.customers.edit')
              : t('service.customers.new')}
          </DialogTitle>
          <DialogDescription>
            {t('service.customers.formDescription')}
          </DialogDescription>
        </DialogHeader>

        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {field('name', t('service.customer.name'), { required: true })}
          {field('code', t('service.customer.code'))}
          {field('contactName', t('service.customer.contactName'))}
          {field('contactPhone', t('service.customer.contactPhone'))}
          {field('address', t('service.customer.address'))}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='customer-serviceLevel'>
              {t('service.customer.serviceLevel')}
            </Label>
            <NativeSelect
              id='customer-serviceLevel'
              className='w-full'
              value={form.serviceLevel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  serviceLevel: event.target.value,
                }))
              }
            >
              {SERVICE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`service.serviceLevel.${level}`, { defaultValue: level })}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='customer-notes'>
              {t('service.customer.notes')}
            </Label>
            <Textarea
              id='customer-notes'
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={onClose}
            >
              {t('service.action.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !form.name.trim()}>
              {t('service.action.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
