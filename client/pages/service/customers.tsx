import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { StatusBadge } from './components/status-badge.js';
import { REGION_OPTIONS, regionLabel } from './lib/format.js';
import type { Customer } from './lib/types.js';
import { useCaller, useServiceClient } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

interface CustomerForm {
  id?: number;
  name: string;
  region: string;
  contactName: string;
  contactPhone: string;
  address: string;
  status: string;
}

const EMPTY: CustomerForm = {
  name: '',
  region: 'east',
  contactName: '',
  contactPhone: '',
  address: '',
  status: 'active',
};

export default function ServiceCustomersPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CustomerForm>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canManage =
    caller.data?.caller.capabilities['customers.manage'] === true;

  const list = useServiceQuery(
    () => client.listCustomers({ search: search || undefined, pageSize: 100 }),
    `customers:${search}`,
  );

  const openForm = (customer?: Customer) => {
    setError(undefined);
    setForm(
      customer
        ? {
            id: customer.id,
            name: customer.name,
            region: customer.region,
            contactName: customer.contactName ?? '',
            contactPhone: customer.contactPhone ?? '',
            address: customer.address ?? '',
            status: customer.status,
          }
        : EMPTY,
    );
  };

  const save = async () => {
    if (!form || !form.name.trim()) {
      setError(t('service.customers.nameRequired'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.saveCustomer({
        id: form.id,
        name: form.name.trim(),
        region: form.region,
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        address: form.address.trim() || null,
        status: form.status,
      });
      setForm(undefined);
      list.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={() => openForm()}>
              <Plus aria-hidden='true' />
              {t('service.customers.create')}
            </Button>
          ) : null
        }
        description={t('service.customers.description')}
        title={t('service.customers.title')}
      />
      <Input
        className='max-w-xs'
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('service.common.search')}
        value={search}
      />
      <Card className='py-0'>
        <CardContent className='px-0'>
          {list.loading && !list.data ? <LoadingState /> : null}
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : null}
          {list.data ? (
            list.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.customers.name')}</TableHead>
                    <TableHead>{t('service.customers.region')}</TableHead>
                    <TableHead>{t('service.customers.contact')}</TableHead>
                    <TableHead>{t('service.customers.status')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className='font-medium'>
                        {customer.name}
                      </TableCell>
                      <TableCell>{regionLabel(t, customer.region)}</TableCell>
                      <TableCell>
                        {customer.contactName ?? '—'}
                        {customer.contactPhone ? (
                          <span className='block text-xs text-muted-foreground'>
                            {customer.contactPhone}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={t(
                            `service.customerStatus.${customer.status}`,
                            {
                              defaultValue: customer.status,
                            },
                          )}
                          value={customer.status}
                        />
                      </TableCell>
                      {canManage ? (
                        <TableCell className='text-right'>
                          <Button
                            onClick={() => openForm(customer)}
                            size='xs'
                            variant='ghost'
                          >
                            {t('service.common.edit')}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                className='m-4'
                message={t('service.customers.empty')}
              />
            )
          ) : null}
        </CardContent>
      </Card>
      <Dialog
        open={form !== undefined}
        onOpenChange={(next) => !next && setForm(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id
                ? t('service.customers.edit')
                : t('service.customers.create')}
            </DialogTitle>
          </DialogHeader>
          {form ? (
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2 sm:col-span-2'>
                <Label htmlFor='custName'>{t('service.customers.name')}</Label>
                <Input
                  id='custName'
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  value={form.name}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='custRegion'>
                  {t('service.customers.region')}
                </Label>
                <Select
                  value={form.region}
                  onValueChange={(value) =>
                    setForm({ ...form, region: value ? String(value) : 'east' })
                  }
                >
                  <SelectTrigger className='w-full' id='custRegion'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {regionLabel(t, value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='custStatus'>
                  {t('service.customers.status')}
                </Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      status: value ? String(value) : 'active',
                    })
                  }
                >
                  <SelectTrigger className='w-full' id='custStatus'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='active'>
                      {t('service.customerStatus.active')}
                    </SelectItem>
                    <SelectItem value='inactive'>
                      {t('service.customerStatus.inactive')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='custContact'>
                  {t('service.customers.contact')}
                </Label>
                <Input
                  id='custContact'
                  onChange={(event) =>
                    setForm({ ...form, contactName: event.target.value })
                  }
                  value={form.contactName}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='custPhone'>
                  {t('service.customers.phone')}
                </Label>
                <Input
                  id='custPhone'
                  onChange={(event) =>
                    setForm({ ...form, contactPhone: event.target.value })
                  }
                  value={form.contactPhone}
                />
              </div>
              <div className='space-y-2 sm:col-span-2'>
                <Label htmlFor='custAddress'>
                  {t('service.customers.address')}
                </Label>
                <Input
                  id='custAddress'
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                  value={form.address}
                />
              </div>
            </div>
          ) : null}
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <DialogFooter>
            <Button onClick={() => setForm(undefined)} variant='outline'>
              {t('service.common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
