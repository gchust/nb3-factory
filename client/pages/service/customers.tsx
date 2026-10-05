/**
 * Customers — the catalog a repair request is raised against.
 *
 * A supervisor maintains the catalog; an engineer sees the customers their work
 * orders belong to. The list is the server's scoped list, so the same page
 * shows a different set to each of them without a client-side filter.
 */
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useState,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useServiceApi, type ServiceList } from './api.js';
import { formText, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  ServicePage,
} from './parts.js';
import type { CustomerView } from './types.js';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [creating, setCreating] = useState(false);

  const state = useLoad(
    useCallback(
      () =>
        api.get<ServiceList<CustomerView>>('/customers', {
          search: query,
          page,
          pageSize: 20,
        }),
      [api, query, page],
    ),
  );

  return (
    <ServicePage
      title={t('service.customers.title')}
      description={t('service.customers.description')}
      actions={
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className='size-4' />
          {t('service.customers.create')}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.common.search')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='relative max-w-sm'>
            <SearchIcon className='pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='ps-8'
              value={search}
              placeholder={t('service.customers.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setQuery(search);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}
      {state.data ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            {state.data.rows.length === 0 ? (
              <EmptyState message={t('service.customers.empty')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('service.customers.name')}</TableHead>
                      <TableHead>
                        {t('service.customers.contactName')}
                      </TableHead>
                      <TableHead>
                        {t('service.customers.contactPhone')}
                      </TableHead>
                      <TableHead>{t('service.customers.address')}</TableHead>
                      <TableHead className='text-right'>
                        {t('service.common.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className='font-medium'>
                          {row.name}
                        </TableCell>
                        <TableCell>{row.contactName ?? '—'}</TableCell>
                        <TableCell>{row.contactPhone ?? '—'}</TableCell>
                        <TableCell>{row.address ?? '—'}</TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('service.common.edit')}
                            onClick={() => setEditing(row)}
                          >
                            <PencilIcon className='size-3.5' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPage={setPage}
            />
          </CardContent>
        </Card>
      ) : null}

      <CustomerDialog
        key={editing ? `edit-${editing.id}` : 'create'}
        open={creating || editing !== null}
        customer={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          state.reload();
        }}
      />
    </ServicePage>
  );
}

function CustomerDialog({
  customer,
  onOpenChange,
  onSaved,
  open,
}: {
  readonly customer: CustomerView | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      name: formText(data, 'name'),
      contactName: formText(data, 'contactName'),
      contactPhone: formText(data, 'contactPhone'),
      address: formText(data, 'address'),
    };
    setBusy(true);
    try {
      if (customer) {
        await api.patch(`/customers/${customer.id}`, payload);
      } else {
        await api.post('/customers', payload);
      }
      onSaved();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {customer
                ? t('service.customers.edit')
                : t('service.customers.create')}
            </DialogTitle>
            <DialogDescription>
              {t('service.customers.dialogHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='customer-name'>
                {t('service.customers.name')}
              </FieldLabel>
              <Input
                id='customer-name'
                name='name'
                required
                defaultValue={customer?.name ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='customer-contact-name'>
                {t('service.customers.contactName')}
              </FieldLabel>
              <Input
                id='customer-contact-name'
                name='contactName'
                defaultValue={customer?.contactName ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='customer-contact-phone'>
                {t('service.customers.contactPhone')}
              </FieldLabel>
              <Input
                id='customer-contact-phone'
                name='contactPhone'
                defaultValue={customer?.contactPhone ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='customer-address'>
                {t('service.customers.address')}
              </FieldLabel>
              <Input
                id='customer-address'
                name='address'
                defaultValue={customer?.address ?? ''}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
