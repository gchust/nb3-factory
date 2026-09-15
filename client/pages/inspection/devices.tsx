import { Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

import { useInspectionApi } from '../../components/inspection/api.js';
import { errorMessageKey } from '../../components/inspection/error-message.js';
import { DEVICE_STATUS_KEYS } from '../../components/inspection/format.js';
import { useInspectionUser } from '../../components/inspection/use-inspection-user.js';
import {
  canManageCatalog,
  type Device,
  type DeviceInput,
  type DeviceStatus,
} from '../../components/inspection/types.js';

const STATUSES: readonly DeviceStatus[] = ['in_use', 'stopped', 'repair'];

const EMPTY: DeviceInput = {
  code: '',
  name: '',
  location: '',
  type: '',
  status: 'in_use',
};

export default function DevicesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const { user } = useInspectionUser();
  const [devices, setDevices] = useState<readonly Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Device | undefined>();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DeviceInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const mayManage = canManageCatalog(user?.role ?? 'none');

  const load = useCallback(async () => {
    try {
      setDevices(await api.devices());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (): void => {
    setEditing(undefined);
    setDraft(EMPTY);
    setError(undefined);
    setOpen(true);
  };

  const openEdit = (device: Device): void => {
    setEditing(device);
    setDraft({
      code: device.code,
      name: device.name,
      location: device.location,
      type: device.type,
      status: device.status,
    });
    setError(undefined);
    setOpen(true);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      if (editing) await api.updateDevice(editing.id, draft);
      else await api.createDevice(draft);
      setOpen(false);
      await load();
    } catch (cause) {
      setError(errorMessageKey(errorCodeOf(cause)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='space-y-6 p-6'>
      <header className='flex items-start justify-between gap-4'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('inspection.devices.title')}
        </h1>
        {mayManage ? (
          <Button onClick={openCreate} type='button'>
            <Plus />
            {t('inspection.devices.create')}
          </Button>
        ) : null}
      </header>

      <Card>
        <CardContent className='pt-6'>
          {loading ? (
            <p className='text-sm text-muted-foreground'>
              {t('inspection.devices.loading')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inspection.devices.code')}</TableHead>
                  <TableHead>{t('inspection.devices.name')}</TableHead>
                  <TableHead>{t('inspection.devices.location')}</TableHead>
                  <TableHead>{t('inspection.devices.type')}</TableHead>
                  <TableHead>{t('inspection.devices.status')}</TableHead>
                  {mayManage ? (
                    <TableHead className='text-right'>
                      {t('inspection.devices.actions')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className='font-medium'>{device.code}</TableCell>
                    <TableCell>{device.name}</TableCell>
                    <TableCell>{device.location}</TableCell>
                    <TableCell>{device.type}</TableCell>
                    <TableCell>
                      <Badge variant='secondary'>
                        {t(DEVICE_STATUS_KEYS[device.status])}
                      </Badge>
                    </TableCell>
                    {mayManage ? (
                      <TableCell className='text-right'>
                        <Button
                          onClick={() => openEdit(device)}
                          size='sm'
                          type='button'
                          variant='outline'
                        >
                          <Pencil />
                          {t('inspection.devices.edit')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('inspection.devices.editTitle')
                : t('inspection.devices.createTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='device-code'>
                {t('inspection.devices.code')}
              </Label>
              <Input
                id='device-code'
                onChange={(event) =>
                  setDraft({ ...draft, code: event.target.value })
                }
                value={draft.code}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='device-name'>
                {t('inspection.devices.name')}
              </Label>
              <Input
                id='device-name'
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                value={draft.name}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='device-location'>
                {t('inspection.devices.location')}
              </Label>
              <Input
                id='device-location'
                onChange={(event) =>
                  setDraft({ ...draft, location: event.target.value })
                }
                value={draft.location}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='device-type'>
                {t('inspection.devices.type')}
              </Label>
              <Input
                id='device-type'
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value })
                }
                value={draft.type}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='device-status'>
                {t('inspection.devices.status')}
              </Label>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  setDraft({ ...draft, status: value as DeviceStatus })
                }
              >
                <SelectTrigger className='w-full' id='device-status'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(DEVICE_STATUS_KEYS[status])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>{t(error)}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type='button'
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={saving} onClick={() => void save()} type='button'>
              {saving ? t('inspection.devices.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const payload = (error as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
