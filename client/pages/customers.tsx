import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
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
import { useDeliveryErrorMessage } from '@/lib/delivery-error';
import { useDeliveryApi, useResource } from '@/lib/use-delivery-resource';

interface CustomerForm {
  id?: number;
  code: string;
  name: string;
  industry: string;
  level: string;
  note: string;
}

const EMPTY_FORM: CustomerForm = {
  code: '',
  name: '',
  industry: '',
  level: 'A',
  note: '',
};

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const errorMessage = useDeliveryErrorMessage();
  const api = useDeliveryApi();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const state = useResource(
    (client) => client.customers({ search, page, pageSize: 10 }),
    `${search}:${page}`,
  );
  const [form, setForm] = useState<CustomerForm>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!form) return;
    setBusy(true);
    setError(undefined);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        industry: form.industry,
        level: form.level,
        note: form.note,
      };
      if (form.id) await api.updateCustomer(form.id, payload);
      else await api.createCustomer(payload);
      setForm(undefined);
      state.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('delivery.customers.title')}
        description={t('delivery.customers.description')}
        actions={
          <Button onClick={() => setForm({ ...EMPTY_FORM })}>
            <Plus aria-hidden='true' /> {t('delivery.customers.create')}
          </Button>
        }
      />
      <Card>
        <CardHeader className='gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <CardTitle>{t('delivery.customers.list')}</CardTitle>
          <Input
            aria-label={t('delivery.common.search')}
            className='sm:max-w-xs'
            placeholder={t('delivery.customers.searchPlaceholder')}
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </CardHeader>
        <CardContent className='space-y-4'>
          {state.loading ? <Loading /> : null}
          {state.error ? (
            <div className='space-y-2'>
              <p className='text-sm text-destructive'>{state.error}</p>
              <Button onClick={state.reload}>
                {t('delivery.common.retry')}
              </Button>
            </div>
          ) : null}
          {state.data && !state.loading ? (
            state.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.customers.code')}</TableHead>
                    <TableHead>{t('delivery.customers.name')}</TableHead>
                    <TableHead>{t('delivery.customers.industry')}</TableHead>
                    <TableHead>{t('delivery.customers.level')}</TableHead>
                    <TableHead>{t('delivery.customers.note')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data.items.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>{customer.code}</TableCell>
                      <TableCell className='font-medium'>
                        {customer.name}
                      </TableCell>
                      <TableCell>{customer.industry || '—'}</TableCell>
                      <TableCell>{customer.level || '—'}</TableCell>
                      <TableCell className='text-muted-foreground'>
                        {customer.note || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            setForm({
                              id: customer.id,
                              code: customer.code,
                              name: customer.name,
                              industry: customer.industry ?? '',
                              level: customer.level ?? '',
                              note: customer.note ?? '',
                            })
                          }
                        >
                          {t('delivery.common.edit')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('delivery.customers.empty')}
              </p>
            )
          ) : null}
          <div className='flex items-center justify-between'>
            <span className='text-sm text-muted-foreground'>
              {t('delivery.common.page', { page })}
            </span>
            <div className='flex gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('delivery.common.previous')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={!state.data?.hasMore}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('delivery.common.next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(form)}
        onOpenChange={(open) => (open ? undefined : setForm(undefined))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id
                ? t('delivery.customers.edit')
                : t('delivery.customers.create')}
            </DialogTitle>
            <DialogDescription>
              {t('delivery.customers.formHint')}
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className='space-y-3'>
              <div className='space-y-2'>
                <Label htmlFor='customer-code'>
                  {t('delivery.customers.code')}
                </Label>
                <Input
                  id='customer-code'
                  value={form.code}
                  disabled={Boolean(form.id)}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='customer-name'>
                  {t('delivery.customers.name')}
                </Label>
                <Input
                  id='customer-name'
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='customer-industry'>
                  {t('delivery.customers.industry')}
                </Label>
                <Input
                  id='customer-industry'
                  value={form.industry}
                  onChange={(event) =>
                    setForm({ ...form, industry: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='customer-level'>
                  {t('delivery.customers.level')}
                </Label>
                <Input
                  id='customer-level'
                  value={form.level}
                  onChange={(event) =>
                    setForm({ ...form, level: event.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='customer-note'>
                  {t('delivery.customers.note')}
                </Label>
                <Input
                  id='customer-note'
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                />
              </div>
              {error ? (
                <p className='text-sm text-destructive' role='alert'>
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setForm(undefined)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
