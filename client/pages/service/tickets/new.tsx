import { useTranslation } from '@nocobase/i18n/client';
import { useToaster } from '@nocobase/app-client';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { LoadError, TableSkeleton } from '../components/service-states.js';
import { errorMessage } from '../service-api.js';
import { useAsync, useServiceApi } from '../service-hooks.js';
import type { TicketsOutletContext } from './context.js';
import { TICKET_PRIORITIES } from '../types.js';

/** The create-ticket dialog, opened from the ticket list toolbar. */
export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('service.tickets.new')}
      description={t('service.tickets.newDescription')}
    >
      <NewTicketForm />
    </RouteDialog>
  );
}

function NewTicketForm(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TicketsOutletContext>();

  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const directory = useAsync(async () => {
    const [customers, devices] = await Promise.all([
      api.listCustomers({ limit: 500 }),
      api.listDevices({}),
    ]);
    return { customers, devices };
  }, 'new-ticket-directory');

  const devices = useMemo(
    () =>
      (directory.data?.devices ?? []).filter(
        (device) => String(device.customerId) === customerId,
      ),
    [directory.data, customerId],
  );

  const submit = useCallback(async () => {
    if (title.trim().length === 0 || !customerId || !deviceId) return;
    setSubmitting(true);
    try {
      const result = await api.createTicket({
        title: title.trim(),
        customerId: Number(customerId),
        deviceId: Number(deviceId),
        priority,
        confidential,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(reporterName.trim() ? { reporterName: reporterName.trim() } : {}),
      });
      toaster.show({
        type: result.acceptance?.status === 'failed' ? 'warning' : 'success',
        title:
          result.acceptance?.status === 'failed'
            ? t('service.tickets.createdAcceptanceFailed')
            : t('service.tickets.created'),
        description: result.ticket.code,
      });
      reload();
      await close();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.tickets.createFailed'),
        description: errorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    api,
    close,
    confidential,
    customerId,
    description,
    deviceId,
    priority,
    reload,
    reporterName,
    t,
    title,
    toaster,
  ]);

  if (directory.error) {
    return <LoadError error={directory.error} onRetry={directory.reload} />;
  }
  if (directory.loading) {
    return <TableSkeleton rows={4} columns={2} />;
  }

  const disabled = submitting || !title.trim() || !customerId || !deviceId;

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-customer'>{t('service.ticket.customer')}</Label>
        <NativeSelect
          id='ticket-customer'
          className='w-full'
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value);
            setDeviceId('');
          }}
        >
          <option value=''>{t('service.tickets.selectCustomer')}</option>
          {(directory.data?.customers ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
              {customer.code ? ` (${customer.code})` : ''}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-device'>{t('service.ticket.device')}</Label>
        <NativeSelect
          id='ticket-device'
          className='w-full'
          value={deviceId}
          disabled={!customerId}
          onChange={(event) => setDeviceId(event.target.value)}
        >
          <option value=''>{t('service.tickets.selectDevice')}</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name} · {device.serialNumber}
            </option>
          ))}
        </NativeSelect>
        {customerId && devices.length === 0 ? (
          <p className='text-xs text-muted-foreground'>
            {t('service.tickets.noDevicesForCustomer')}
          </p>
        ) : null}
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-title'>{t('service.ticket.title')}</Label>
        <Input
          id='ticket-title'
          required
          value={title}
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-priority'>{t('service.ticket.priority')}</Label>
        <NativeSelect
          id='ticket-priority'
          className='w-full'
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          {TICKET_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {t(`service.ticketPriority.${value}`, { defaultValue: value })}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-description'>
          {t('service.ticket.description')}
        </Label>
        <Textarea
          id='ticket-description'
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='ticket-reporter'>{t('service.ticket.reporter')}</Label>
        <Input
          id='ticket-reporter'
          value={reporterName}
          onChange={(event) => setReporterName(event.target.value)}
        />
      </div>

      <div className='flex items-center justify-between gap-4 rounded-lg border p-3'>
        <div className='flex flex-col'>
          <Label htmlFor='ticket-confidential'>
            {t('service.ticket.confidential')}
          </Label>
          <span className='text-xs text-muted-foreground'>
            {t('service.tickets.confidentialHint')}
          </span>
        </div>
        <Switch
          id='ticket-confidential'
          checked={confidential}
          onCheckedChange={(value) => setConfidential(value)}
        />
      </div>

      <div className='flex flex-wrap justify-end gap-2 pt-2'>
        <Button
          type='button'
          variant='outline'
          disabled={submitting}
          onClick={() => void close()}
        >
          {t('service.action.cancel')}
        </Button>
        <Button type='submit' disabled={disabled}>
          {submitting
            ? t('service.action.submitting')
            : t('service.tickets.submit')}
        </Button>
      </div>
    </form>
  );
}
