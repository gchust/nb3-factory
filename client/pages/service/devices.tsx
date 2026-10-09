import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SelectField,
} from '@/pages/service/shared.js';
import {
  formatDate,
  useActionFeedback,
  useServiceList,
  useServiceMe,
} from '@/pages/service/service-api.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  Customer,
  Device,
  EngineerOption,
} from '@/pages/service/types.js';

interface Draft {
  /** Set when editing an existing device; absent when creating a new one. */
  id?: number;
  serial: string;
  name: string;
  model: string;
  customerId: string;
  engineerId: string;
  enabled: string;
  nextInspectionAt: string;
}

const EMPTY: Draft = {
  serial: '',
  name: '',
  model: '',
  customerId: '',
  engineerId: '',
  enabled: 'true',
  nextInspectionAt: '',
};

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const me = useServiceMe();
  const feedback = useActionFeedback();
  const customers = useServiceList<Customer>(
    'service/customers',
    undefined,
    '',
  );
  const engineers = useServiceList<EngineerOption>(
    'service/engineers',
    undefined,
    '',
  );
  const { data, error, loading, reload } = useServiceList<Device>(
    'service/devices',
    undefined,
    '',
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const customerName = (id: number): string =>
    customers.data?.find((customer) => customer.id === id)?.name ?? `#${id}`;
  const engineerName = (id: string | null): string =>
    id
      ? (engineers.data?.find((engineer) => engineer.id === id)?.name ?? id)
      : t('service.devices.unassigned');

  const customerOptions = [
    { value: '', label: t('service.devices.selectCustomer') },
    ...(customers.data ?? []).map((customer) => ({
      value: String(customer.id),
      label: customer.name,
    })),
  ];
  const engineerOptions = [
    { value: '', label: t('service.devices.unassigned') },
    ...(engineers.data ?? []).map((engineer) => ({
      value: engineer.id,
      label: engineer.name,
    })),
  ];

  const update = (field: keyof Draft, value: string): void =>
    setDraft((current) => (current ? { ...current, [field]: value } : current));

  const save = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    try {
      const json = {
        serial: draft.serial,
        name: draft.name,
        model: draft.model || undefined,
        customerId: Number(draft.customerId),
        engineerId: draft.engineerId || null,
        enabled: draft.enabled === 'true',
        nextInspectionAt: draft.nextInspectionAt || null,
      };
      // Create and edit are told apart by the draft's id, not by matching the
      // serial: matching made a create form with a duplicate serial update the
      // existing row instead of the server rejecting it.
      if (draft.id) {
        await api.request({
          path: `service/devices/${draft.id}`,
          method: 'PATCH',
          json,
        });
        feedback.success(t('service.devices.updated'));
      } else {
        await api.request({ path: 'service/devices', method: 'POST', json });
        feedback.success(t('service.devices.created'));
      }
      setDraft(null);
      reload();
    } catch (saveError) {
      feedback.failure(saveError);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (device: Device): void =>
    setDraft({
      id: device.id,
      serial: device.serial,
      name: device.name,
      model: device.model ?? '',
      customerId: String(device.customerId),
      engineerId: device.engineerId ?? '',
      enabled: device.enabled ? 'true' : 'false',
      nextInspectionAt: device.nextInspectionAt?.slice(0, 10) ?? '',
    });

  return (
    <PageContainer>
      <PageHeader
        title={t('service.devices.title')}
        description={t('service.devices.description')}
        actions={
          me?.supervisor ? (
            <Button variant='outline' onClick={() => setDraft(EMPTY)}>
              <PlusIcon data-icon='inline-start' />
              {t('service.devices.create')}
            </Button>
          ) : null
        }
      />
      {draft ? (
        <Card>
          <CardContent className='grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3'>
            <div className='grid gap-2'>
              <Label htmlFor='device-serial'>
                {t('service.devices.serial')}
              </Label>
              <Input
                id='device-serial'
                value={draft.serial}
                disabled={Boolean(draft.id)}
                onChange={(event) => update('serial', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-name'>{t('service.devices.name')}</Label>
              <Input
                id='device-name'
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-model'>{t('service.devices.model')}</Label>
              <Input
                id='device-model'
                value={draft.model}
                onChange={(event) => update('model', event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-customer'>
                {t('service.devices.customer')}
              </Label>
              <SelectField
                id='device-customer'
                value={draft.customerId}
                onValueChange={(value) => update('customerId', value)}
                options={customerOptions}
                placeholder={t('service.devices.selectCustomer')}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-engineer'>
                {t('service.devices.engineer')}
              </Label>
              <SelectField
                id='device-engineer'
                value={draft.engineerId}
                onValueChange={(value) => update('engineerId', value)}
                options={engineerOptions}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-next'>
                {t('service.devices.nextInspectionAt')}
              </Label>
              <Input
                id='device-next'
                type='date'
                value={draft.nextInspectionAt}
                onChange={(event) =>
                  update('nextInspectionAt', event.target.value)
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='device-enabled'>
                {t('service.devices.enabled')}
              </Label>
              <SelectField
                id='device-enabled'
                value={draft.enabled}
                onValueChange={(value) => update('enabled', value)}
                options={[
                  { value: 'true', label: t('service.devices.enabledYes') },
                  { value: 'false', label: t('service.devices.enabledNo') },
                ]}
              />
            </div>
            <div className='flex items-end gap-2 sm:col-span-2 lg:col-span-3'>
              <Button
                disabled={
                  saving ||
                  draft.serial.trim() === '' ||
                  draft.name.trim() === '' ||
                  draft.customerId === ''
                }
                onClick={() => void save()}
              >
                {t('actions.save')}
              </Button>
              <Button variant='ghost' onClick={() => setDraft(null)}>
                {t('actions.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        data.length === 0 ? (
          <EmptyState title={t('service.devices.empty')} />
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.devices.serial')}</TableHead>
                  <TableHead>{t('service.devices.name')}</TableHead>
                  <TableHead>{t('service.devices.customer')}</TableHead>
                  <TableHead>{t('service.devices.engineer')}</TableHead>
                  <TableHead>{t('service.devices.nextInspectionAt')}</TableHead>
                  <TableHead>{t('service.devices.enabled')}</TableHead>
                  {me?.supervisor ? (
                    <TableHead className='text-right'>
                      {t('service.field.actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className='font-mono text-xs'>
                      {device.serial}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {device.name}
                      {device.model ? (
                        <span className='ml-2 text-xs text-muted-foreground'>
                          {device.model}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{customerName(device.customerId)}</TableCell>
                    <TableCell>{engineerName(device.engineerId)}</TableCell>
                    <TableCell>{formatDate(device.nextInspectionAt)}</TableCell>
                    <TableCell>
                      <Badge variant={device.enabled ? 'default' : 'outline'}>
                        {device.enabled
                          ? t('service.devices.enabledYes')
                          : t('service.devices.enabledNo')}
                      </Badge>
                    </TableCell>
                    {me?.supervisor ? (
                      <TableCell className='text-right'>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('service.field.edit')}
                          onClick={() => startEdit(device)}
                        >
                          <PencilIcon />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
      <Outlet />
    </PageContainer>
  );
}
