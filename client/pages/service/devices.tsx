import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { REGION_OPTIONS, regionLabel } from './lib/format.js';
import type { Customer, Device } from './lib/types.js';
import { useCaller, useServiceClient } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

interface DeviceForm {
  id?: number;
  code: string;
  name: string;
  customerId: string;
  region: string;
  category: string;
  model: string;
  serialNumber: string;
  enabled: boolean;
  purchasedAt: string;
}

const EMPTY: DeviceForm = {
  code: '',
  name: '',
  customerId: '',
  region: 'east',
  category: '',
  model: '',
  serialNumber: '',
  enabled: true,
  purchasedAt: '',
};

export default function ServiceDevicesPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [form, setForm] = useState<DeviceForm>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canManage = caller.data?.caller.capabilities['devices.manage'] === true;

  const list = useServiceQuery(
    () => client.listDevices({ search: search || undefined, pageSize: 100 }),
    `devices:${search}`,
  );

  useEffect(() => {
    let active = true;
    client.listCustomers({ pageSize: 100 }).then(
      (page) => active && setCustomers(page.items),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [client]);

  const openForm = (device?: Device) => {
    setError(undefined);
    setForm(
      device
        ? {
            id: device.id,
            code: device.code,
            name: device.name,
            customerId: String(device.customerId),
            region: device.region,
            category: device.category ?? '',
            model: device.model ?? '',
            serialNumber: device.serialNumber ?? '',
            enabled: device.enabled,
            purchasedAt: device.purchasedAt
              ? device.purchasedAt.slice(0, 10)
              : '',
          }
        : EMPTY,
    );
  };

  const save = async () => {
    if (!form || !form.code.trim() || !form.name.trim() || !form.customerId) {
      setError(t('service.devices.requiredFields'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.saveDevice({
        id: form.id,
        code: form.code.trim(),
        name: form.name.trim(),
        customerId: Number(form.customerId),
        region: form.region,
        category: form.category.trim() || null,
        model: form.model.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        enabled: form.enabled,
        purchasedAt: form.purchasedAt || null,
      });
      setForm(undefined);
      list.reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // The code is unique across the ledger; present the server's business
      // conflict in the reader's language instead of its English wire text.
      setError(
        message === 'Device code already exists'
          ? t('service.devices.duplicateCode')
          : message,
      );
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
              {t('service.devices.create')}
            </Button>
          ) : null
        }
        description={t('service.devices.description')}
        title={t('service.devices.title')}
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
                    <TableHead>{t('service.devices.code')}</TableHead>
                    <TableHead>{t('service.devices.name')}</TableHead>
                    <TableHead>{t('service.devices.customer')}</TableHead>
                    <TableHead>{t('service.devices.region')}</TableHead>
                    <TableHead>{t('service.devices.model')}</TableHead>
                    <TableHead>{t('service.devices.enabled')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className='font-mono text-xs'>
                        {device.code}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {device.name}
                      </TableCell>
                      <TableCell>{device.customerName ?? '—'}</TableCell>
                      <TableCell>{regionLabel(t, device.region)}</TableCell>
                      <TableCell>{device.model ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={device.enabled ? 'default' : 'outline'}>
                          {device.enabled
                            ? t('service.devices.enabledYes')
                            : t('service.devices.enabledNo')}
                        </Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell className='text-right'>
                          <Button
                            onClick={() => openForm(device)}
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
                message={t('service.devices.empty')}
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
                ? t('service.devices.edit')
                : t('service.devices.create')}
            </DialogTitle>
          </DialogHeader>
          {form ? (
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='devCode'>{t('service.devices.code')}</Label>
                <Input
                  id='devCode'
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value })
                  }
                  value={form.code}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='devName'>{t('service.devices.name')}</Label>
                <Input
                  id='devName'
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  value={form.name}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='devCustomer'>
                  {t('service.devices.customer')}
                </Label>
                <Select
                  items={customers.map((customer) => ({
                    value: String(customer.id),
                    label: customer.name,
                  }))}
                  value={form.customerId || null}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      customerId: value ? String(value) : '',
                      region:
                        customers.find(
                          (item) => String(item.id) === String(value),
                        )?.region ?? form.region,
                    })
                  }
                >
                  <SelectTrigger className='w-full' id='devCustomer'>
                    <SelectValue
                      placeholder={t('service.devices.customerPlaceholder')}
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
              </div>
              <div className='space-y-2'>
                <Label htmlFor='devRegion'>{t('service.devices.region')}</Label>
                <Select
                  items={REGION_OPTIONS.map((value) => ({
                    value,
                    label: regionLabel(t, value),
                  }))}
                  value={form.region}
                  onValueChange={(value) =>
                    setForm({ ...form, region: value ? String(value) : 'east' })
                  }
                >
                  <SelectTrigger className='w-full' id='devRegion'>
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
                <Label htmlFor='devCategory'>
                  {t('service.devices.category')}
                </Label>
                <Input
                  id='devCategory'
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  value={form.category}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='devModel'>{t('service.devices.model')}</Label>
                <Input
                  id='devModel'
                  onChange={(event) =>
                    setForm({ ...form, model: event.target.value })
                  }
                  value={form.model}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='devSerial'>
                  {t('service.devices.serialNumber')}
                </Label>
                <Input
                  id='devSerial'
                  onChange={(event) =>
                    setForm({ ...form, serialNumber: event.target.value })
                  }
                  value={form.serialNumber}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='devPurchased'>
                  {t('service.devices.purchasedAt')}
                </Label>
                <Input
                  id='devPurchased'
                  onChange={(event) =>
                    setForm({ ...form, purchasedAt: event.target.value })
                  }
                  type='date'
                  value={form.purchasedAt}
                />
              </div>
              <label
                className='flex items-center gap-2 text-sm sm:col-span-2'
                htmlFor='devEnabled'
              >
                <Checkbox
                  checked={form.enabled}
                  id='devEnabled'
                  onCheckedChange={(value) =>
                    setForm({ ...form, enabled: value === true })
                  }
                />
                {t('service.devices.enabled')}
              </label>
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
