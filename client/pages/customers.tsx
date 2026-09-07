import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  createFilesClient,
  FilePreviewField,
  FileUploadField,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Eye, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ConfirmDialog } from '../components/sales/confirm-dialog';
import { EmptyState } from '../components/sales/empty-state';
import { ErrorState } from '../components/sales/error-state';
import { FormDialog } from '../components/sales/form-dialog';
import { FormField } from '../components/sales/form-field';
import { PageHeader } from '../components/sales/page-header';
import { StatusBadge } from '../components/sales/status-badge';
import { UserSelect } from '../components/sales/user-select';
import { useSalesApi } from '../components/sales/use-sales-api';
import { CUSTOMER_SIZES, CUSTOMER_STATUSES } from '../lib/sales-constants';
import type { Customer } from '../lib/sales-api';

interface CustomerFormState {
  name: string;
  industry: string;
  size: string;
  status: string;
  phone: string;
  isPublic: boolean;
}

const EMPTY_FORM: CustomerFormState = {
  name: '',
  industry: '',
  size: '',
  status: 'active',
  phone: '',
  isPublic: false,
};

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [ownerCustomer, setOwnerCustomer] = useState<Customer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setCustomers(
        await api.listCustomers({
          q: q || undefined,
          status: status || undefined,
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, q, status]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  return (
    <div className='space-y-6'>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('sales.customers.create', { defaultValue: 'New customer' })}
          </Button>
        }
        description={t('sales.customers.description', {
          defaultValue: 'Manage your customer accounts',
        })}
        title={t('sales.customers.title', { defaultValue: 'Customers' })}
      />

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          className='sm:max-w-xs'
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('sales.customers.search', {
            defaultValue: 'Search customers…',
          })}
          value={q}
        />
        <Select
          value={status}
          onValueChange={(value) => setStatus(value ?? '')}
        >
          <SelectTrigger className='sm:w-44'>
            <SelectValue
              placeholder={t('sales.customers.allStatuses', {
                defaultValue: 'All statuses',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>
              {t('sales.customers.allStatuses', {
                defaultValue: 'All statuses',
              })}
            </SelectItem>
            {CUSTOMER_STATUSES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`sales.customers.${item}`, { defaultValue: item })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <ErrorState message={error} /> : null}

      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('sales.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : customers.length === 0 ? (
        <EmptyState
          message={t('sales.customers.empty', {
            defaultValue: 'No customers yet.',
          })}
        />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('sales.customers.customerNo', { defaultValue: 'No.' })}
                </TableHead>
                <TableHead>
                  {t('sales.customers.name', { defaultValue: 'Name' })}
                </TableHead>
                <TableHead>
                  {t('sales.customers.industry', { defaultValue: 'Industry' })}
                </TableHead>
                <TableHead>
                  {t('sales.customers.size', { defaultValue: 'Size' })}
                </TableHead>
                <TableHead>
                  {t('sales.customers.status', { defaultValue: 'Status' })}
                </TableHead>
                <TableHead>
                  {t('sales.customers.phone', { defaultValue: 'Phone' })}
                </TableHead>
                <TableHead>
                  {t('sales.customers.public', { defaultValue: 'Public' })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.actions.label', { defaultValue: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className='font-mono text-xs'>
                    {customer.customerNo}
                  </TableCell>
                  <TableCell className='font-medium'>{customer.name}</TableCell>
                  <TableCell>{customer.industry ?? '—'}</TableCell>
                  <TableCell>
                    {customer.size
                      ? t(`sales.sizes.${customer.size}`, {
                          defaultValue: customer.size,
                        })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge prefix='customers' status={customer.status} />
                  </TableCell>
                  <TableCell>{customer.phone ?? '—'}</TableCell>
                  <TableCell>
                    {customer.isPublic
                      ? t('sales.yes', { defaultValue: 'Yes' })
                      : t('sales.no', { defaultValue: 'No' })}
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        onClick={() =>
                          void openDetail(api, customer, setDetailCustomer)
                        }
                        size='icon-sm'
                        title={t('sales.actions.view', {
                          defaultValue: 'View',
                        })}
                        variant='ghost'
                      >
                        <Eye />
                      </Button>
                      <Button
                        onClick={() => setOwnerCustomer(customer)}
                        size='icon-sm'
                        title={t('sales.customers.changeOwner', {
                          defaultValue: 'Change owner',
                        })}
                        variant='ghost'
                      >
                        <UserPlus />
                      </Button>
                      <Button
                        onClick={() => setEditCustomer(customer)}
                        size='icon-sm'
                        title={t('sales.actions.edit', {
                          defaultValue: 'Edit',
                        })}
                        variant='ghost'
                      >
                        <Pencil />
                      </Button>
                      <Button
                        onClick={() => setDeleteCustomer(customer)}
                        size='icon-sm'
                        title={t('sales.actions.delete', {
                          defaultValue: 'Delete',
                        })}
                        variant='ghost'
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CustomerFormDialog
        initial={null}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
        open={createOpen}
      />
      <CustomerFormDialog
        initial={editCustomer}
        onOpenChange={(open) => {
          if (!open) setEditCustomer(null);
        }}
        onSaved={() => void load()}
        open={editCustomer !== null}
      />
      <ChangeOwnerDialog
        customer={ownerCustomer}
        onClose={() => setOwnerCustomer(null)}
        onChanged={() => void load()}
      />
      <ConfirmDialog
        description={t('sales.customers.deleteConfirm', {
          defaultValue:
            'Customers with contacts or opportunities cannot be deleted. This cannot be undone.',
        })}
        destructive
        onConfirm={async () => {
          if (!deleteCustomer) return;
          await api.deleteCustomer(deleteCustomer.id);
          await load();
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteCustomer(null);
        }}
        open={deleteCustomer !== null}
        title={t('sales.actions.delete', { defaultValue: 'Delete' })}
      />
      <CustomerDetailDialog
        customer={detailCustomer}
        onClose={() => setDetailCustomer(null)}
      />
    </div>
  );
}

async function openDetail(
  api: ReturnType<typeof useSalesApi>,
  customer: Customer,
  setDetail: (customer: Customer | null) => void,
): Promise<void> {
  try {
    const detail = await api.getCustomer(customer.id);
    setDetail(detail);
  } catch {
    setDetail(customer);
  }
}

function CustomerFormDialog({
  open,
  initial,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial: Customer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              industry: initial.industry ?? '',
              size: initial.size ?? '',
              status: initial.status,
              phone: initial.phone ?? '',
              isPublic: initial.isPublic,
            }
          : EMPTY_FORM,
      );
    }
  }

  const set =
    (key: keyof CustomerFormState) => (value: string | boolean | null) =>
      setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (): Promise<void> => {
    if (!form.name.trim()) {
      throw new Error(
        t('sales.customers.nameRequired', {
          defaultValue: 'Name is required.',
        }),
      );
    }
    const input: Record<string, unknown> = {
      name: form.name.trim(),
      industry: form.industry || null,
      size: form.size || null,
      status: form.status,
      phone: form.phone || null,
      isPublic: form.isPublic,
    };
    if (initial) {
      await api.updateCustomer(initial.id, input);
    } else {
      await api.createCustomer(input);
    }
    onSaved();
  };

  return (
    <FormDialog
      description={
        initial
          ? t('sales.customers.editDescription', {
              defaultValue: 'Update the customer details.',
            })
          : t('sales.customers.createDescription', {
              defaultValue: 'Create a new customer account.',
            })
      }
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      title={
        initial
          ? t('sales.customers.edit', { defaultValue: 'Edit customer' })
          : t('sales.customers.create', { defaultValue: 'New customer' })
      }
    >
      <FormField
        label={t('sales.customers.name', { defaultValue: 'Name' })}
        required
      >
        <Input
          onChange={(event) => set('name')(event.target.value)}
          value={form.name}
        />
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.customers.industry', { defaultValue: 'Industry' })}
        >
          <Input
            onChange={(event) => set('industry')(event.target.value)}
            value={form.industry}
          />
        </FormField>
        <FormField label={t('sales.customers.size', { defaultValue: 'Size' })}>
          <Select value={form.size} onValueChange={set('size')}>
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={t('sales.customers.selectSize', {
                  defaultValue: 'Select size',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {t(`sales.sizes.${size}`, { defaultValue: size })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.customers.status', { defaultValue: 'Status' })}
        >
          <Select value={form.status} onValueChange={set('status')}>
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`sales.customers.${item}`, { defaultValue: item })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label={t('sales.customers.phone', { defaultValue: 'Phone' })}
        >
          <Input
            onChange={(event) => set('phone')(event.target.value)}
            value={form.phone}
          />
        </FormField>
      </div>
      <label className='flex items-center gap-2 text-sm'>
        <input
          checked={form.isPublic}
          className='size-4 rounded border-border accent-primary'
          onChange={(event) => set('isPublic')(event.target.checked)}
          type='checkbox'
        />
        {t('sales.customers.isPublic', {
          defaultValue: 'List in the public customer directory',
        })}
      </label>
    </FormDialog>
  );
}

function ChangeOwnerDialog({
  customer,
  onClose,
  onChanged,
}: {
  customer: Customer | null;
  onClose: () => void;
  onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [ownerId, setOwnerId] = useState('');
  const [lastCustomer, setLastCustomer] = useState(customer);

  if (customer !== lastCustomer) {
    setLastCustomer(customer);
    if (customer) setOwnerId(customer.ownerId);
  }

  return (
    <FormDialog
      description={t('sales.customers.changeOwnerDescription', {
        defaultValue:
          'The new owner also takes over the customer contacts and open opportunities.',
      })}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={async () => {
        if (!customer) return;
        await api.changeCustomerOwner(customer.id, ownerId);
        onChanged();
      }}
      open={customer !== null}
      submitLabel={t('sales.customers.changeOwner', {
        defaultValue: 'Change owner',
      })}
      title={t('sales.customers.changeOwner', { defaultValue: 'Change owner' })}
    >
      <FormField
        label={t('sales.customers.owner', { defaultValue: 'Owner' })}
        required
      >
        <UserSelect onValueChange={setOwnerId} value={ownerId} />
      </FormField>
    </FormDialog>
  );
}

function CustomerDetailDialog({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const appClient = useService(appApiClientToken);
  const profileId = customer?.profile?.id;

  const filesClient = useMemo(() => {
    if (!profileId) return null;
    return createFilesClient({
      appClient,
      endpoint: `sales/customer-profiles/${profileId}/business-license`,
    });
  }, [appClient, profileId]);

  const [files, setFiles] = useState<readonly FileRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (filesClient) {
      filesClient
        .list()
        .then((result) => {
          if (!cancelled) setFiles(result);
        })
        .catch(() => {
          // Read-only view; a failure just leaves the list empty.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [filesClient]);

  return (
    <Dialog
      open={customer !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{customer?.name}</DialogTitle>
          <DialogDescription>
            {customer?.customerNo}
            {customer
              ? ` · ${t(`sales.customers.${customer.status}`, { defaultValue: customer.status })}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {customer ? (
          <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div>
                <div className='text-muted-foreground'>
                  {t('sales.customers.industry', { defaultValue: 'Industry' })}
                </div>
                <div>{customer.industry ?? '—'}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('sales.customers.size', { defaultValue: 'Size' })}
                </div>
                <div>
                  {customer.size
                    ? t(`sales.sizes.${customer.size}`, {
                        defaultValue: customer.size,
                      })
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('sales.customers.phone', { defaultValue: 'Phone' })}
                </div>
                <div>{customer.phone ?? '—'}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>
                  {t('sales.customers.public', { defaultValue: 'Public' })}
                </div>
                <div>
                  {customer.isPublic
                    ? t('sales.yes', { defaultValue: 'Yes' })
                    : t('sales.no', { defaultValue: 'No' })}
                </div>
              </div>
            </div>

            <div className='space-y-1.5 text-sm'>
              <div className='text-muted-foreground'>
                {t('sales.profiles.address', { defaultValue: 'Address' })}
              </div>
              <div>{customer.profile?.address ?? '—'}</div>
            </div>
            <div className='space-y-1.5 text-sm'>
              <div className='text-muted-foreground'>
                {t('sales.profiles.creditLevel', {
                  defaultValue: 'Credit level',
                })}
              </div>
              <div>{customer.profile?.creditLevel ?? '—'}</div>
            </div>
            <div className='space-y-1.5 text-sm'>
              <div className='text-muted-foreground'>
                {t('sales.profiles.notes', { defaultValue: 'Notes' })}
              </div>
              <div className='whitespace-pre-wrap'>
                {customer.profile?.notes ?? '—'}
              </div>
            </div>

            <div className='space-y-2'>
              <div className='text-sm font-medium'>
                {t('sales.profiles.businessLicense', {
                  defaultValue: 'Business license',
                })}
              </div>
              {filesClient ? (
                <>
                  <FilePreviewField
                    client={filesClient}
                    files={files}
                    labels={{
                      empty: t('sales.files.empty', {
                        defaultValue: 'No file uploaded',
                      }),
                    }}
                  />
                  <FileUploadField
                    accept={[
                      'image/jpeg',
                      'image/png',
                      'image/webp',
                      'application/pdf',
                    ]}
                    client={filesClient}
                    labels={{
                      choose: t('sales.files.upload', {
                        defaultValue: 'Upload',
                      }),
                    }}
                    maxFiles={1}
                    maxSize={10 * 1024 * 1024}
                    onChange={setFiles}
                    removeOnDelete
                    value={files}
                  />
                </>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('sales.files.noProfile', {
                    defaultValue: 'No customer profile available.',
                  })}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
