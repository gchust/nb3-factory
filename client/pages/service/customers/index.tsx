import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToaster } from '@nocobase/app-client';

import { useServiceRequest, type CustomerRecord, type Paged } from '../api.js';
import { AsyncBlock, formatDateTime, useAsyncData } from '../shared.js';

interface CustomerForm {
  code: string;
  name: string;
  level: string;
  region: string;
  contact: string;
  phone: string;
}

const EMPTY: CustomerForm = {
  code: '',
  name: '',
  level: 'standard',
  region: '',
  contact: '',
  phone: '',
};

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const state = useAsyncData<Paged<CustomerRecord>>(
    () =>
      request<Paged<CustomerRecord>>('/service/customers', {
        query: { search, pageSize: 100 },
      }),
    [request, search],
  );

  function openCreate(): void {
    setForm(EMPTY);
    setFields({});
    setCreating(true);
  }

  function openEdit(customer: CustomerRecord): void {
    setForm({
      code: customer.code,
      name: customer.name,
      level: customer.level,
      region: customer.region ?? '',
      contact: customer.contact ?? '',
      phone: customer.phone ?? '',
    });
    setFields({});
    setEditing(customer);
  }

  function close(): void {
    setCreating(false);
    setEditing(null);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t('service.validation.required');
    if (!form.contact.trim()) next.contact = t('service.validation.required');
    if (!form.phone.trim()) next.phone = t('service.validation.required');
    setFields(next);
    if (Object.keys(next).length) return;
    setPending(true);
    const body = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      level: form.level,
      region: form.region || null,
      contact: form.contact.trim(),
      phone: form.phone.trim(),
    };
    try {
      if (editing) {
        await request(`/service/customers/${editing.id}`, {
          method: 'PATCH',
          json: body,
        });
        toaster.show({
          type: 'success',
          title: t('service.customers.updated'),
        });
      } else {
        await request('/service/customers', { method: 'POST', json: body });
        toaster.show({
          type: 'success',
          title: t('service.customers.created'),
        });
      }
      close();
      state.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.error.title'),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon data-icon='inline-start' />
            {t('service.customers.create')}
          </Button>
        }
      />

      <div className='relative w-full max-w-sm'>
        <SearchIcon className='pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground' />
        <Input
          className='pl-8'
          placeholder={t('service.customers.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <AsyncBlock state={state} empty={(data) => data.items.length === 0}>
        {(data) => (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.customers.code')}</TableHead>
                  <TableHead>{t('service.customers.name')}</TableHead>
                  <TableHead>{t('service.customers.level')}</TableHead>
                  <TableHead>{t('service.customers.region')}</TableHead>
                  <TableHead>{t('service.customers.contact')}</TableHead>
                  <TableHead>{t('service.customers.updatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((customer) => (
                  <TableRow
                    className='cursor-pointer'
                    key={customer.id}
                    onClick={() => openEdit(customer)}
                  >
                    <TableCell className='font-mono text-xs'>
                      {customer.code}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {customer.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {t(`service.customerLevel.${customer.level}`, {
                          defaultValue: customer.level,
                        })}
                      </Badge>
                    </TableCell>
                    <TableCell>{customer.region ?? '—'}</TableCell>
                    <TableCell>
                      <div className='text-sm'>{customer.contact ?? '—'}</div>
                      <div className='text-xs text-muted-foreground'>
                        {customer.phone ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {formatDateTime(customer.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AsyncBlock>

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t('service.customers.editTitle')
                  : t('service.customers.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('service.customers.formHint')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field data-invalid={Boolean(fields.name)}>
                  <FieldLabel>{t('service.customers.name')}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(fields.name)}
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                  {fields.name ? <FieldError>{fields.name}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel>{t('service.customers.code')}</FieldLabel>
                  <Input
                    placeholder='CUST-0001'
                    value={form.code}
                    onChange={(event) =>
                      setForm({ ...form, code: event.target.value })
                    }
                  />
                </Field>
                <Field data-invalid={Boolean(fields.contact)}>
                  <FieldLabel>{t('service.customers.contactName')}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(fields.contact)}
                    value={form.contact}
                    onChange={(event) =>
                      setForm({ ...form, contact: event.target.value })
                    }
                  />
                  {fields.contact ? (
                    <FieldError>{fields.contact}</FieldError>
                  ) : null}
                </Field>
                <Field data-invalid={Boolean(fields.phone)}>
                  <FieldLabel>{t('service.customers.contactPhone')}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(fields.phone)}
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                  />
                  {fields.phone ? (
                    <FieldError>{fields.phone}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel>{t('service.customers.level')}</FieldLabel>
                  <select
                    className='h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm'
                    value={form.level}
                    onChange={(event) =>
                      setForm({ ...form, level: event.target.value })
                    }
                  >
                    <option value='standard'>
                      {t('service.customerLevel.standard')}
                    </option>
                    <option value='vip'>
                      {t('service.customerLevel.vip')}
                    </option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel>{t('service.customers.region')}</FieldLabel>
                  <Input
                    value={form.region}
                    onChange={(event) =>
                      setForm({ ...form, region: event.target.value })
                    }
                  />
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={pending}
                type='button'
                variant='outline'
                onClick={close}
              >
                {t('service.actions.cancel')}
              </Button>
              <Button disabled={pending} type='submit'>
                {editing
                  ? t('service.actions.save')
                  : t('service.actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
