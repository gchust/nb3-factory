import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/index.js';
import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { CustomerLevelBadge } from '@/components/service/badges.js';
import { Field, FormDialog } from '@/components/service/form-dialog.js';
import { SelectField } from '@/components/service/select-field.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import type { CustomerView, Paged } from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useClient, useDebouncedValue } from '@/hooks/use-service-api.js';

interface CustomerFormState {
  readonly name: string;
  readonly code: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly contactEmail: string;
  readonly address: string;
  readonly level: string;
  readonly note: string;
}

const EMPTY_FORM: CustomerFormState = {
  name: '',
  code: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  level: 'normal',
  note: '',
};

function toForm(customer: CustomerView): CustomerFormState {
  return {
    name: customer.name,
    code: customer.code,
    contactName: customer.contactName ?? '',
    contactPhone: customer.contactPhone ?? '',
    contactEmail: customer.contactEmail ?? '',
    address: customer.address ?? '',
    level: customer.level,
    note: customer.note ?? '',
  };
}

/** Turns the form into the JSON the API accepts, dropping empty optional text. */
function toPayload(form: CustomerFormState, creating: boolean): Record<string, unknown> {
  return {
    ...(creating ? { code: form.code.trim() } : {}),
    name: form.name.trim(),
    contactName: form.contactName.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    address: form.address.trim() || null,
    level: form.level,
    note: form.note.trim() || null,
  };
}

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      pageSize: 200,
    }),
    [debouncedSearch],
  );
  const list = useApiQuery<Paged<CustomerView>>('/customers', query);

  const levelOptions = useMemo(
    () => [
      { value: 'normal', label: t('service.customer.level.normal') },
      { value: 'vip', label: t('service.customer.level.vip') },
      { value: 'key', label: t('service.customer.level.key') },
    ],
    [t],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreating(true);
  };
  const openEdit = (customer: CustomerView) => {
    setForm(toForm(customer));
    setEditing(customer);
  };
  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = async () => {
    const creatingNow = creating;
    const payload = toPayload(form, creatingNow);
    if (creatingNow) {
      await client.request({
        path: '/customers',
        method: 'POST',
        json: payload,
      });
    } else if (editing) {
      await client.request({
        path: `/customers/${editing.id}`,
        method: 'PATCH',
        json: payload,
      });
    }
    list.reload();
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'code',
        header: t('service.customer.code'),
        cell: ({ row }: { row: { original: CustomerView } }) => (
          <span className='font-mono text-xs'>{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: t('service.customer.name'),
      },
      {
        accessorKey: 'contactName',
        header: t('service.customer.contact'),
        cell: ({ row }: { row: { original: CustomerView } }) => (
          <div className='text-sm'>
            <div>{row.original.contactName ?? '—'}</div>
            <div className='text-xs text-muted-foreground'>
              {row.original.contactPhone ?? ''}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'level',
        header: t('service.customer.level'),
        cell: ({ row }: { row: { original: CustomerView } }) => (
          <CustomerLevelBadge level={row.original.level} />
        ),
      },
      {
        accessorKey: 'deviceCount',
        header: t('service.customer.deviceCount'),
      },
      {
        accessorKey: 'openOrderCount',
        header: t('service.customer.openOrderCount'),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: CustomerView } }) => (
          <Button variant='ghost' size='sm' onClick={() => openEdit(row.original)}>
            <PencilIcon />
            {t('service.action.edit')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customer.title')}
        description={t('service.customer.description')}
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            {t('service.customer.create')}
          </Button>
        }
      />

      <div className='flex items-center gap-2'>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('service.customer.searchPlaceholder')}
          className='max-w-xs'
        />
      </div>

      {list.error ? (
        <RequestError error={list.error} onRetry={list.reload} />
      ) : null}

      {list.data ? (
        list.data.data.length === 0 ? (
          <EmptyTable title={t('service.customer.empty')} />
        ) : (
          <DataTable
            columns={columns}
            data={[...list.data.data]}
            getRowId={(row) => row.id}
            showSelectedCount={false}
            emptyMessage={t('service.customer.empty')}
          />
        )
      ) : null}

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={
          creating ? t('service.customer.create') : t('service.customer.edit')
        }
        onSubmit={submit}
        canSubmit={
          form.name.trim().length > 0 &&
          (!creating || form.code.trim().length > 0)
        }
      >
        {creating ? (
          <Field label={t('service.customer.code')} htmlFor='customer-code'>
            <Input
              id='customer-code'
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
            />
          </Field>
        ) : null}
        <Field label={t('service.customer.name')} htmlFor='customer-name'>
          <Input
            id='customer-name'
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            label={t('service.customer.contactName')}
            htmlFor='customer-contact'
          >
            <Input
              id='customer-contact'
              value={form.contactName}
              onChange={(event) =>
                setForm({ ...form, contactName: event.target.value })
              }
            />
          </Field>
          <Field
            label={t('service.customer.contactPhone')}
            htmlFor='customer-phone'
          >
            <Input
              id='customer-phone'
              value={form.contactPhone}
              onChange={(event) =>
                setForm({ ...form, contactPhone: event.target.value })
              }
            />
          </Field>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            label={t('service.customer.contactEmail')}
            htmlFor='customer-email'
          >
            <Input
              id='customer-email'
              type='email'
              value={form.contactEmail}
              onChange={(event) =>
                setForm({ ...form, contactEmail: event.target.value })
              }
            />
          </Field>
          <Field label={t('service.customer.level')} htmlFor='customer-level'>
            <SelectField
              id='customer-level'
              value={form.level}
              onValueChange={(level) => setForm({ ...form, level })}
              options={levelOptions}
              className='w-full'
            />
          </Field>
        </div>
        <Field label={t('service.customer.address')} htmlFor='customer-address'>
          <Input
            id='customer-address'
            value={form.address}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
          />
        </Field>
        <Field label={t('service.customer.note')} htmlFor='customer-note'>
          <Textarea
            id='customer-note'
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </Field>
      </FormDialog>
    </PageContainer>
  );
}
