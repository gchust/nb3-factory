import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import type { ServiceClient } from '../lib/api.js';
import { PRIORITY_OPTIONS, priorityLabel } from '../lib/format.js';
import type { Customer, Device } from '../lib/types.js';

export function TicketCreateDialog({
  client,
  open,
  onOpenChange,
  onCreated,
}: {
  readonly client: ServiceClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => void | Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [confidential, setConfidential] = useState(false);
  const [submit, setSubmit] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    client.listCustomers({ pageSize: 100 }).then(
      (page) => active && setCustomers(page.items),
      (cause: unknown) =>
        active &&
        setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      active = false;
    };
  }, [client, open]);

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    client.listDevices({ customerId: Number(customerId), pageSize: 100 }).then(
      (page) => active && setDevices(page.items),
      (cause: unknown) =>
        active &&
        setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      active = false;
    };
  }, [client, customerId]);

  const reset = () => {
    setCustomerId('');
    setDeviceId('');
    setTitle('');
    setDescription('');
    setPriority('normal');
    setConfidential(false);
    setSubmit(true);
    setError(undefined);
  };

  const create = async () => {
    if (!customerId || !deviceId || !title.trim()) {
      setError(t('service.tickets.requiredFields'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.createTicket({
        customerId: Number(customerId),
        deviceId: Number(deviceId),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        confidential,
        submit,
      });
      reset();
      onOpenChange(false);
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('service.tickets.create')}</DialogTitle>
          <DialogDescription>
            {t('service.tickets.createHelp')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='customer'>{t('service.tickets.customer')}</Label>
            <Select
              value={customerId || null}
              onValueChange={(value) => {
                setCustomerId(value ? String(value) : '');
                setDeviceId('');
                setDevices([]);
              }}
            >
              <SelectTrigger className='w-full' id='customer'>
                <SelectValue
                  placeholder={t('service.tickets.customerPlaceholder')}
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
            <Label htmlFor='device'>{t('service.tickets.device')}</Label>
            <Select
              value={deviceId || null}
              onValueChange={(value) => setDeviceId(value ? String(value) : '')}
            >
              <SelectTrigger className='w-full' id='device'>
                <SelectValue
                  placeholder={t('service.tickets.devicePlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={String(device.id)}>
                    {device.code} · {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='title'>{t('service.tickets.title')}</Label>
            <Input
              id='title'
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='description'>
              {t('service.tickets.description')}
            </Label>
            <Textarea
              id='description'
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='priority'>{t('service.tickets.priority')}</Label>
            <Select
              value={priority}
              onValueChange={(value) =>
                setPriority(value ? String(value) : 'normal')
              }
            >
              <SelectTrigger className='w-full' id='priority'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {priorityLabel(t, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center gap-6 pt-6'>
            <label
              className='flex items-center gap-2 text-sm'
              htmlFor='confidential'
            >
              <Checkbox
                checked={confidential}
                id='confidential'
                onCheckedChange={(value) => setConfidential(value === true)}
              />
              {t('service.tickets.confidential')}
            </label>
            <label
              className='flex items-center gap-2 text-sm'
              htmlFor='submitNow'
            >
              <Checkbox
                checked={submit}
                id='submitNow'
                onCheckedChange={(value) => setSubmit(value === true)}
              />
              {t('service.tickets.submitNow')}
            </label>
          </div>
        </div>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant='outline'>
            {t('service.common.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void create()}>
            {t('service.common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
