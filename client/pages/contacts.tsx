import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pencil, Plus } from 'lucide-react';

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

import { EmptyState } from '../components/sales/empty-state';
import { ErrorState } from '../components/sales/error-state';
import { FormDialog } from '../components/sales/form-dialog';
import { FormField } from '../components/sales/form-field';
import { PageHeader } from '../components/sales/page-header';
import { useSalesApi } from '../components/sales/use-sales-api';
import type { Contact, Customer } from '../lib/sales-api';

interface ContactFormState {
  name: string;
  phone: string;
  email: string;
  position: string;
  customerId: string;
}

const EMPTY_FORM: ContactFormState = {
  name: '',
  phone: '',
  email: '',
  position: '',
  customerId: '',
};

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [customerId, setCustomerId] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [contactRows, customerRows] = await Promise.all([
        api.listContacts({
          q: q || undefined,
          customerId: customerId ? Number(customerId) : undefined,
        }),
        api.listCustomers(),
      ]);
      setContacts(contactRows);
      setCustomers(customerRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, q, customerId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const customerName = (id: number): string =>
    customers.find((customer) => customer.id === id)?.name ?? String(id);

  return (
    <div className='space-y-6'>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t('sales.contacts.create', { defaultValue: 'New contact' })}
          </Button>
        }
        description={t('sales.contacts.description', {
          defaultValue: 'People at your customer companies',
        })}
        title={t('sales.contacts.title', { defaultValue: 'Contacts' })}
      />

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          className='sm:max-w-xs'
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('sales.contacts.search', {
            defaultValue: 'Search contacts…',
          })}
          value={q}
        />
        <Select
          value={customerId}
          onValueChange={(value) => setCustomerId(value ?? '')}
        >
          <SelectTrigger className='sm:w-56'>
            <SelectValue
              placeholder={t('sales.contacts.allCustomers', {
                defaultValue: 'All customers',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=''>
              {t('sales.contacts.allCustomers', {
                defaultValue: 'All customers',
              })}
            </SelectItem>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={String(customer.id)}>
                {customer.name}
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
      ) : contacts.length === 0 ? (
        <EmptyState
          message={t('sales.contacts.empty', {
            defaultValue: 'No contacts yet.',
          })}
        />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('sales.contacts.name', { defaultValue: 'Name' })}
                </TableHead>
                <TableHead>
                  {t('sales.contacts.customer', { defaultValue: 'Customer' })}
                </TableHead>
                <TableHead>
                  {t('sales.contacts.position', { defaultValue: 'Position' })}
                </TableHead>
                <TableHead>
                  {t('sales.contacts.phone', { defaultValue: 'Phone' })}
                </TableHead>
                <TableHead>
                  {t('sales.contacts.email', { defaultValue: 'Email' })}
                </TableHead>
                <TableHead className='text-right'>
                  {t('sales.actions.label', { defaultValue: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className='font-medium'>{contact.name}</TableCell>
                  <TableCell>{customerName(contact.customerId)}</TableCell>
                  <TableCell>{contact.position ?? '—'}</TableCell>
                  <TableCell>{contact.phone ?? '—'}</TableCell>
                  <TableCell>{contact.email ?? '—'}</TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button
                        onClick={() => setEditContact(contact)}
                        size='icon-sm'
                        title={t('sales.actions.edit', {
                          defaultValue: 'Edit',
                        })}
                        variant='ghost'
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ContactFormDialog
        customers={customers}
        initial={null}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
        open={createOpen}
      />
      <ContactFormDialog
        customers={customers}
        initial={editContact}
        onOpenChange={(open) => {
          if (!open) setEditContact(null);
        }}
        onSaved={() => void load()}
        open={editContact !== null}
      />
    </div>
  );
}

function ContactFormDialog({
  open,
  initial,
  customers,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial: Contact | null;
  customers: Customer[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM);
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name,
              phone: initial.phone ?? '',
              email: initial.email ?? '',
              position: initial.position ?? '',
              customerId: String(initial.customerId),
            }
          : EMPTY_FORM,
      );
    }
  }

  const set = (key: keyof ContactFormState) => (value: string | null) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (): Promise<void> => {
    if (!form.name.trim()) {
      throw new Error(
        t('sales.contacts.nameRequired', { defaultValue: 'Name is required.' }),
      );
    }
    if (!form.customerId) {
      throw new Error(
        t('sales.contacts.customerRequired', {
          defaultValue: 'Customer is required.',
        }),
      );
    }
    const input: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      position: form.position || null,
      customerId: Number(form.customerId),
    };
    if (initial) {
      await api.updateContact(initial.id, input);
    } else {
      await api.createContact(input);
    }
    onSaved();
  };

  return (
    <FormDialog
      description={
        initial
          ? t('sales.contacts.editDescription', {
              defaultValue: 'Update the contact details.',
            })
          : t('sales.contacts.createDescription', {
              defaultValue: 'Add a person at a customer company.',
            })
      }
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      title={
        initial
          ? t('sales.contacts.edit', { defaultValue: 'Edit contact' })
          : t('sales.contacts.create', { defaultValue: 'New contact' })
      }
    >
      <FormField
        label={t('sales.contacts.name', { defaultValue: 'Name' })}
        required
      >
        <Input
          onChange={(event) => set('name')(event.target.value)}
          value={form.name}
        />
      </FormField>
      <FormField
        label={t('sales.contacts.customer', { defaultValue: 'Customer' })}
        required
      >
        <Select value={form.customerId} onValueChange={set('customerId')}>
          <SelectTrigger className='w-full'>
            <SelectValue
              placeholder={t('sales.contacts.selectCustomer', {
                defaultValue: 'Select customer',
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={String(customer.id)}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          label={t('sales.contacts.position', { defaultValue: 'Position' })}
        >
          <Input
            onChange={(event) => set('position')(event.target.value)}
            value={form.position}
          />
        </FormField>
        <FormField label={t('sales.contacts.phone', { defaultValue: 'Phone' })}>
          <Input
            onChange={(event) => set('phone')(event.target.value)}
            value={form.phone}
          />
        </FormField>
      </div>
      <FormField label={t('sales.contacts.email', { defaultValue: 'Email' })}>
        <Input
          onChange={(event) => set('email')(event.target.value)}
          type='email'
          value={form.email}
        />
      </FormField>
    </FormDialog>
  );
}
