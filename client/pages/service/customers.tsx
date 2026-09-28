import { useTranslation } from '@nocobase/i18n/client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToaster } from '@nocobase/app-client';

import { useServiceApi, type CustomerInput } from '@/service/api.js';
import { useSession } from '@/service/session.js';
import {
  EmptyState,
  ErrorState,
  PageLoading,
  useAsync,
  errorMessage,
} from '@/service/ui.js';
import type { ServiceCustomer } from '@/service/types.js';

const EMPTY: CustomerInput = { name: '' };

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor } = useSession();
  const customers = useAsync(() => api.listCustomers(), []);
  const [editing, setEditing] = useState<CustomerInput>();
  const [removing, setRemoving] = useState<ServiceCustomer>();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});

  const save = async (): Promise<void> => {
    if (!editing?.name?.trim()) {
      setErrors({ name: t('service.customers.nameRequired') });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.saveCustomer(editing);
      toaster.show({ type: 'success', title: t('service.common.saved') });
      setEditing(undefined);
      customers.reload();
    } catch (cause) {
      const message = errorMessage(cause);
      setErrors({ form: message });
      toaster.show({ type: 'error', title: message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!removing) {
      return;
    }
    try {
      await api.deleteCustomer(removing.id);
      toaster.show({ type: 'success', title: t('service.common.deleted') });
      setRemoving(undefined);
      customers.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
      setRemoving(undefined);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          isSupervisor ? (
            <Button
              onClick={() => {
                setErrors({});
                setEditing({ ...EMPTY });
              }}
            >
              <Plus />
              {t('service.customers.create')}
            </Button>
          ) : undefined
        }
      />

      {customers.loading ? <PageLoading /> : null}
      {customers.error ? (
        <ErrorState error={customers.error} onRetry={customers.reload} />
      ) : null}

      {!customers.loading && !customers.error ? (
        customers.data && customers.data.length > 0 ? (
          <div className='rounded-lg border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.customers.name')}</TableHead>
                  <TableHead>{t('service.customers.contactName')}</TableHead>
                  <TableHead>{t('service.customers.contactPhone')}</TableHead>
                  <TableHead>{t('service.customers.contactEmail')}</TableHead>
                  <TableHead>{t('service.customers.address')}</TableHead>
                  {isSupervisor ? (
                    <TableHead className='text-right'>
                      {t('service.common.actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.data.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className='font-medium'>
                      {customer.name}
                    </TableCell>
                    <TableCell>{customer.contactName ?? '—'}</TableCell>
                    <TableCell>{customer.contactPhone ?? '—'}</TableCell>
                    <TableCell>{customer.contactEmail ?? '—'}</TableCell>
                    <TableCell>{customer.address ?? '—'}</TableCell>
                    {isSupervisor ? (
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => {
                            setErrors({});
                            setEditing({
                              id: customer.id,
                              name: customer.name,
                              contactName: customer.contactName ?? '',
                              contactPhone: customer.contactPhone ?? '',
                              contactEmail: customer.contactEmail ?? '',
                              address: customer.address ?? '',
                              note: customer.note ?? '',
                            });
                          }}
                        >
                          <Pencil />
                          {t('service.common.edit')}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setRemoving(customer)}
                        >
                          <Trash2 />
                          {t('service.common.delete')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState />
        )
      ) : null}

      <CustomerDialog
        value={editing}
        saving={saving}
        errors={errors}
        onChange={(next) => {
          setEditing(next);
          if (Object.keys(errors).length > 0) {
            setErrors({});
          }
        }}
        onClose={() => {
          setErrors({});
          setEditing(undefined);
        }}
        onSave={() => void save()}
      />

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('service.customers.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('service.customers.deleteDescription', {
                name: removing?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('service.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function CustomerDialog({
  value,
  saving,
  errors,
  onChange,
  onClose,
  onSave,
}: {
  readonly value?: CustomerInput;
  readonly saving: boolean;
  readonly errors: { name?: string; form?: string };
  readonly onChange: (value: CustomerInput) => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const field = (key: keyof CustomerInput) => ({
    value: (value?.[key] ?? '') as string,
    onChange: (event: { target: { value: string } }) =>
      onChange({ ...value!, [key]: event.target.value }),
  });
  return (
    <Dialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value?.id
              ? t('service.customers.editTitle')
              : t('service.customers.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.customers.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {errors.form ? (
            <p className='text-sm text-destructive' role='alert'>
              {errors.form}
            </p>
          ) : null}
          <div className='grid gap-2'>
            <Label htmlFor='customer-name'>{t('service.customers.name')}</Label>
            <Input
              aria-invalid={errors.name ? true : undefined}
              id='customer-name'
              {...field('name')}
            />
            {errors.name ? (
              <p className='text-sm text-destructive' role='alert'>
                {errors.name}
              </p>
            ) : null}
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='customer-contact'>
                {t('service.customers.contactName')}
              </Label>
              <Input id='customer-contact' {...field('contactName')} />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='customer-phone'>
                {t('service.customers.contactPhone')}
              </Label>
              <Input id='customer-phone' {...field('contactPhone')} />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='customer-email'>
              {t('service.customers.contactEmail')}
            </Label>
            <Input id='customer-email' {...field('contactEmail')} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='customer-address'>
              {t('service.customers.address')}
            </Label>
            <Input id='customer-address' {...field('address')} />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='customer-note'>{t('service.customers.note')}</Label>
            <Textarea
              id='customer-note'
              value={value?.note ?? ''}
              onChange={(event) =>
                onChange({ ...value!, note: event.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
