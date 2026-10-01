import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  createCustomer,
  fetchCustomers,
  updateCustomer,
  type Customer,
} from '../api.js';
import { LoadingBlock, QueryError } from '../shared.js';

/** Customer ledger. Staff read it; the supervisor edits it, and the server enforces that. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [state, setState] = useState<{
    key: string;
    customers?: Customer[];
    error?: unknown;
  }>();
  const [editing, setEditing] = useState<Customer | 'new' | undefined>();

  const requestKey = `${appliedKeyword}:${reloadCount}`;
  useEffect(() => {
    const controller = new AbortController();
    const key = `${appliedKeyword}:${reloadCount}`;
    fetchCustomers(api, appliedKeyword || undefined).then(
      (customers) => {
        if (!controller.signal.aborted) setState({ key, customers });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, appliedKeyword, reloadCount]);

  const loading = state?.key !== requestKey;

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      { accessorKey: 'name', header: t('service.customers.column.name') },
      {
        accessorKey: 'contactName',
        header: t('service.customers.column.contact'),
      },
      {
        accessorKey: 'contactPhone',
        header: t('service.customers.column.phone'),
      },
      { accessorKey: 'address', header: t('service.customers.column.address') },
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
            {t('service.actions.edit')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.customers.title')}
        description={t('service.customers.description')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <PlusIcon />
            {t('service.customers.create')}
          </Button>
        }
      />
      <form
        className='flex max-w-md items-center gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedKeyword(keyword.trim());
        }}
      >
        <div className='relative w-full'>
          <SearchIcon className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
          <Input
            className='pl-8'
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('service.customers.searchPlaceholder')}
          />
        </div>
        <Button type='submit' variant='outline'>
          {t('service.actions.search')}
        </Button>
      </form>

      {state?.error ? (
        <QueryError
          error={state.error}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      ) : loading && !state?.customers ? (
        <LoadingBlock />
      ) : (
        <DataTable
          columns={columns}
          data={state?.customers ?? []}
          getRowId={(row) => String(row.id)}
          emptyMessage={t('service.customers.empty')}
        />
      )}

      {editing ? (
        <CustomerDialog
          customer={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setReloadCount((count) => count + 1);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  readonly customer?: Customer;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    contactName: customer?.contactName ?? '',
    contactPhone: customer?.contactPhone ?? '',
    address: customer?.address ?? '',
    note: customer?.note ?? '',
  });

  async function submit(): Promise<void> {
    if (!form.name.trim()) {
      setError(t('service.customers.form.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        address: form.address.trim() || null,
        note: form.note.trim() || null,
      };
      if (customer) {
        await updateCustomer(api, customer.id, payload);
      } else {
        await createCustomer(api, payload);
      }
      toaster.show({
        type: 'success',
        title: t('service.customers.form.saved'),
      });
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError && err.status === 403
          ? t('service.error.forbidden')
          : t('service.customers.form.saveFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {customer
              ? t('service.customers.edit')
              : t('service.customers.create')}
          </DialogTitle>
          <DialogDescription>
            {t('service.customers.form.description')}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='customer-name'>
              {t('service.customers.column.name')}
            </FieldLabel>
            <Input
              id='customer-name'
              value={form.name}
              onChange={(event) =>
                setForm((c) => ({ ...c, name: event.target.value }))
              }
            />
          </Field>
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='customer-contact'>
                {t('service.customers.column.contact')}
              </FieldLabel>
              <Input
                id='customer-contact'
                value={form.contactName}
                onChange={(event) =>
                  setForm((c) => ({ ...c, contactName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='customer-phone'>
                {t('service.customers.column.phone')}
              </FieldLabel>
              <Input
                id='customer-phone'
                value={form.contactPhone}
                onChange={(event) =>
                  setForm((c) => ({ ...c, contactPhone: event.target.value }))
                }
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor='customer-address'>
              {t('service.customers.column.address')}
            </FieldLabel>
            <Input
              id='customer-address'
              value={form.address}
              onChange={(event) =>
                setForm((c) => ({ ...c, address: event.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='customer-note'>
              {t('service.customers.form.note')}
            </FieldLabel>
            <Textarea
              id='customer-note'
              rows={2}
              value={form.note}
              onChange={(event) =>
                setForm((c) => ({ ...c, note: event.target.value }))
              }
            />
          </Field>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={busy}>
            {t('service.actions.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t('service.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
