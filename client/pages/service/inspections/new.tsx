import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';

import { DatePicker } from '@/components/date-picker';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { LoadError, TableSkeleton } from '../components/service-states.js';
import { errorMessage } from '../service-api.js';
import { useAsync, useServiceApi } from '../service-hooks.js';
import type { InspectionsOutletContext } from './context.js';

/** The arrange-inspection dialog, opened from the inspection list toolbar. */
export default function NewInspectionPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <RouteDialog
      title={t('service.inspections.new')}
      description={t('service.inspections.newDescription')}
    >
      <NewInspectionForm />
    </RouteDialog>
  );
}

function NewInspectionForm(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<InspectionsOutletContext>();

  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(
    undefined,
  );
  const [findings, setFindings] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const directory = useAsync(async () => {
    const [customers, devices, users] = await Promise.all([
      api.listCustomers({ limit: 500 }),
      api.listDevices({}),
      api.listUsers(),
    ]);
    return { customers, devices, users };
  }, 'new-inspection-directory');

  const devices = useMemo(
    () =>
      (directory.data?.devices ?? []).filter(
        (device) => String(device.customerId) === customerId,
      ),
    [directory.data, customerId],
  );

  const submit = useCallback(async () => {
    if (!title.trim() || !customerId || !deviceId || !scheduledDate) return;
    setSubmitting(true);
    try {
      await api.createInspection({
        title: title.trim(),
        customerId: Number(customerId),
        deviceId: Number(deviceId),
        scheduledDate: scheduledDate.toISOString(),
        ...(assigneeId ? { assigneeId } : {}),
        ...(findings.trim() ? { findings: findings.trim() } : {}),
      });
      toaster.show({
        type: 'success',
        title: t('service.inspections.created'),
      });
      reload();
      await close();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.inspections.createFailed'),
        description: errorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    api,
    assigneeId,
    close,
    customerId,
    deviceId,
    findings,
    reload,
    scheduledDate,
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

  const disabled =
    submitting || !title.trim() || !customerId || !deviceId || !scheduledDate;

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-title'>
          {t('service.inspection.title')}
        </Label>
        <Input
          id='inspection-title'
          required
          value={title}
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-customer'>
          {t('service.ticket.customer')}
        </Label>
        <NativeSelect
          id='inspection-customer'
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
        <Label htmlFor='inspection-device'>{t('service.ticket.device')}</Label>
        <NativeSelect
          id='inspection-device'
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
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-assignee'>
          {t('service.inspection.assignee')}
        </Label>
        <NativeSelect
          id='inspection-assignee'
          className='w-full'
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value=''>{t('service.inspection.unassigned')}</option>
          {(directory.data?.users ?? []).map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-date'>
          {t('service.inspection.scheduledDate')}
        </Label>
        <DatePicker
          id='inspection-date'
          value={scheduledDate}
          onChange={setScheduledDate}
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='inspection-findings'>
          {t('service.inspection.findings')}
        </Label>
        <Textarea
          id='inspection-findings'
          rows={3}
          value={findings}
          onChange={(event) => setFindings(event.target.value)}
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
            : t('service.inspections.submit')}
        </Button>
      </div>
    </form>
  );
}
