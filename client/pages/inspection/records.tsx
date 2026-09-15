import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

import { useInspectionApi } from '../../components/inspection/api.js';
import { errorMessageKey } from '../../components/inspection/error-message.js';
import {
  formatDateTime,
  RESULT_KEYS,
} from '../../components/inspection/format.js';
import { useInspectionUser } from '../../components/inspection/use-inspection-user.js';
import {
  canCreateRecord,
  type Device,
  type InspectionRecord,
  type InspectionResult,
} from '../../components/inspection/types.js';

const ALL = 'all';

export interface RecordsPageProps {
  /** When set, the list is locked to this result (used by the abnormal list). */
  readonly fixedResult?: InspectionResult;
}

export default function RecordsPage({
  fixedResult,
}: RecordsPageProps): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const { user } = useInspectionUser();
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [records, setRecords] = useState<readonly InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [deviceId, setDeviceId] = useState<string>(ALL);
  const [result, setResult] = useState<string>(fixedResult ?? ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let active = true;
    api
      .devices()
      .then((list) => {
        if (active) setDevices(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    api
      .records({
        deviceId: deviceId === ALL ? undefined : Number(deviceId),
        result: result === ALL ? undefined : (result as InspectionResult),
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      })
      .then((list) => {
        if (active) {
          setRecords(list);
          setError(undefined);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, deviceId, result, from, to]);

  const deviceById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );
  const mayCreate = canCreateRecord(user?.role ?? 'none');

  return (
    <section className='space-y-6 p-6'>
      <header className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {fixedResult === 'abnormal'
              ? t('inspection.abnormal.title')
              : t('inspection.records.title')}
          </h1>
          {fixedResult === 'abnormal' ? (
            <p className='text-sm text-muted-foreground'>
              {t('inspection.abnormal.subtitle')}
            </p>
          ) : null}
        </div>
        {mayCreate ? (
          <Button render={<Link to='/inspection/records/new' />}>
            <Plus />
            {t('inspection.records.create')}
          </Button>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('inspection.records.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <div className='space-y-2'>
            <Label htmlFor='filter-device'>
              {t('inspection.records.filterDevice')}
            </Label>
            <Select
              value={deviceId}
              onValueChange={(value) => setDeviceId(String(value))}
            >
              <SelectTrigger className='w-full' id='filter-device'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  {t('inspection.records.filterAllDevices')}
                </SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={String(device.id)}>
                    {device.code} · {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='filter-result'>
              {t('inspection.records.filterResult')}
            </Label>
            <Select
              disabled={fixedResult !== undefined}
              value={result}
              onValueChange={(value) => setResult(String(value))}
            >
              <SelectTrigger className='w-full' id='filter-result'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  {t('inspection.records.filterAllResults')}
                </SelectItem>
                <SelectItem value='normal'>
                  {t('inspection.result.normal')}
                </SelectItem>
                <SelectItem value='abnormal'>
                  {t('inspection.result.abnormal')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='filter-from'>
              {t('inspection.records.filterFrom')}
            </Label>
            <Input
              id='filter-from'
              onChange={(event) => setFrom(event.target.value)}
              type='date'
              value={from}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='filter-to'>
              {t('inspection.records.filterTo')}
            </Label>
            <Input
              id='filter-to'
              onChange={(event) => setTo(event.target.value)}
              type='date'
              value={to}
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{t(errorMessageKey(undefined))}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className='pt-6'>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              {t('inspection.records.loading')}
            </p>
          ) : records.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {fixedResult === 'abnormal'
                ? t('inspection.abnormal.empty')
                : t('inspection.records.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inspection.records.device')}</TableHead>
                  <TableHead>{t('inspection.records.result')}</TableHead>
                  <TableHead>{t('inspection.records.description')}</TableHead>
                  <TableHead>{t('inspection.records.team')}</TableHead>
                  <TableHead>{t('inspection.records.creator')}</TableHead>
                  <TableHead>{t('inspection.records.createdAt')}</TableHead>
                  <TableHead className='text-right'>
                    {t('inspection.records.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span className='font-medium'>
                        {record.deviceCode ??
                          deviceById.get(record.deviceId)?.code}
                      </span>
                      <span className='block text-xs text-muted-foreground'>
                        {record.deviceName ??
                          deviceById.get(record.deviceId)?.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          record.result === 'abnormal'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {t(RESULT_KEYS[record.result])}
                      </Badge>
                    </TableCell>
                    <TableCell className='max-w-64 truncate'>
                      {record.description ?? '—'}
                    </TableCell>
                    <TableCell>{record.team ?? '—'}</TableCell>
                    <TableCell>{record.createdByName ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(record.createdAt)}</TableCell>
                    <TableCell className='text-right'>
                      <Button
                        render={
                          <Link to={`/inspection/records/${record.id}`} />
                        }
                        size='sm'
                        variant='outline'
                      >
                        {t('inspection.records.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
