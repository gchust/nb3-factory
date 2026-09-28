import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { KeyRound, Send } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';

import { useServiceApi, type WorkOrderInput } from '@/service/api.js';
import {
  EmptyState,
  ErrorState,
  PageLoading,
  StatusBadge,
  errorMessage,
  formatDateTime,
  useAsync,
} from '@/service/ui.js';

export default function IntegrationPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const devices = useAsync(() => api.listDevices(), []);
  const reports = useAsync(() => api.listWorkOrders({ pageSize: 100 }), []);

  const [form, setForm] = useState<WorkOrderInput>({ title: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    title?: string;
    deviceId?: string;
    form?: string;
  }>({});

  const update = (patch: Partial<WorkOrderInput>): void => {
    setForm((current) => ({ ...current, ...patch }));
    if (Object.keys(errors).length > 0) {
      setErrors({});
    }
  };

  const submit = async (): Promise<void> => {
    const next: { title?: string; deviceId?: string; form?: string } = {};
    if (!form.title.trim()) {
      next.title = t('service.integration.titleRequired');
    }
    if (!form.deviceId) {
      next.deviceId = t('service.integration.deviceRequired');
    }
    if (next.title || next.deviceId) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api.submitDeviceReport({
        ...form,
        externalEventId: form.externalEventId || crypto.randomUUID(),
      });
      toaster.show({
        type: 'success',
        title: t('service.integration.submitted'),
      });
      setForm({ title: '' });
      reports.reload();
    } catch (cause) {
      const message = errorMessage(cause);
      setErrors({ form: message });
      toaster.show({ type: 'error', title: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.integration.title')}
        description={t('service.integration.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <KeyRound className='size-4' />
            {t('service.integration.apiTitle')}
          </CardTitle>
          <CardDescription>
            {t('service.integration.apiDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant='outline' render={<Link to='/settings/api-keys' />}>
            {t('service.integration.manageKeys')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.integration.submitTitle')}</CardTitle>
          <CardDescription>
            {t('service.integration.submitDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {errors.form ? (
            <p className='text-sm text-destructive' role='alert'>
              {errors.form}
            </p>
          ) : null}
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('service.workOrders.device')}</Label>
              <Select
                items={(devices.data ?? []).map((device) => ({
                  value: String(device.id),
                  label: `${device.serialNumber} · ${device.name}`,
                }))}
                value={form.deviceId ? String(form.deviceId) : undefined}
                onValueChange={(next) =>
                  update({ deviceId: next ? Number(next) : undefined })
                }
              >
                <SelectTrigger
                  aria-invalid={errors.deviceId ? true : undefined}
                >
                  <SelectValue
                    placeholder={t('service.workOrders.selectDevice')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(devices.data ?? []).map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.serialNumber} · {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.deviceId ? (
                <p className='text-sm text-destructive' role='alert'>
                  {errors.deviceId}
                </p>
              ) : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='report-external'>
                {t('service.integration.externalEventId')}
              </Label>
              <Input
                id='report-external'
                value={form.externalEventId ?? ''}
                onChange={(event) =>
                  update({ externalEventId: event.target.value })
                }
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='report-title'>
              {t('service.workOrders.subject')}
            </Label>
            <Input
              aria-invalid={errors.title ? true : undefined}
              id='report-title'
              value={form.title}
              onChange={(event) => update({ title: event.target.value })}
            />
            {errors.title ? (
              <p className='text-sm text-destructive' role='alert'>
                {errors.title}
              </p>
            ) : null}
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='report-description'>
              {t('service.workOrders.faultDescription')}
            </Label>
            <Textarea
              id='report-description'
              value={form.description ?? ''}
              onChange={(event) => update({ description: event.target.value })}
            />
          </div>
          <div className='flex justify-end'>
            <Button onClick={() => void submit()} disabled={saving}>
              <Send />
              {t('service.integration.submit')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.integration.submittedTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.loading ? <PageLoading /> : null}
          {reports.error ? (
            <ErrorState error={reports.error} onRetry={reports.reload} />
          ) : null}
          {reports.data && reports.data.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.workOrders.orderNo')}</TableHead>
                  <TableHead>{t('service.workOrders.subject')}</TableHead>
                  <TableHead>{t('service.workOrders.status')}</TableHead>
                  <TableHead>{t('service.workOrders.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.data.rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className='font-mono text-xs'>
                      {order.orderNo}
                    </TableCell>
                    <TableCell>{order.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : reports.loading ? null : (
            <EmptyState />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
