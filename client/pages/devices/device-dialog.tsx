import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { RouteDialog } from '#components/route-dialog';

import { DeviceForm } from './device-form.js';
import type { DeviceResponse, DevicesOutletContext } from './types.js';
import { useDeviceRequest } from './use-device-data.js';

/**
 * The dialog for both adding and editing. The edit route passes an id, so the same form is loaded once with the
 * device's current values; a device that disappeared meanwhile is reported instead of being recreated.
 */
export function DeviceDialog({
  deviceId,
}: {
  readonly deviceId?: string;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const parent = useOutletContext<DevicesOutletContext>();
  const record = useDeviceRequest<DeviceResponse>(
    deviceId ? `devices/${encodeURIComponent(deviceId)}` : undefined,
  );
  const [busy, setBusy] = useState(false);
  const creating = !deviceId;
  const missing =
    record.error instanceof ApiClientError && record.error.status === 404;
  const formId = creating ? 'create-device' : 'edit-device';
  const closeTo = { pathname: '/devices', search: location.search };
  const close = () => void navigate(closeTo, { replace: true });
  const saved = () => {
    parent.reload();
    close();
  };
  const notFound = () => {
    parent.reload();
    close();
  };
  const title = t(creating ? 'devices.create.title' : 'devices.edit.title');

  return (
    <RouteDialog
      title={title}
      description={t('devices.form.description')}
      closeTo={closeTo}
      beforeClose={() => !busy}
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={close}>
            {t('actions.cancel')}
          </Button>
          {!missing && !record.error && (creating || record.data) ? (
            <Button
              form={formId}
              type='submit'
              disabled={busy || record.loading}
            >
              {t(busy ? 'actions.saving' : 'actions.save')}
            </Button>
          ) : null}
        </>
      }
    >
      {!creating && record.loading ? (
        <div className='flex flex-col gap-3' role='status'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-20 w-full' />
        </div>
      ) : missing ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('devices.form.notFound')}</AlertDescription>
        </Alert>
      ) : record.error ? (
        <Alert variant='destructive'>
          <AlertDescription className='flex flex-col items-start gap-3'>
            {t('devices.error.loadFailed')}
            <Button variant='outline' size='sm' onClick={record.reload}>
              {t('actions.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <DeviceForm
          key={deviceId ?? '$new'}
          device={record.data?.data}
          formId={formId}
          busy={busy}
          onBusyChange={setBusy}
          onSaved={saved}
          onMissing={notFound}
        />
      )}
    </RouteDialog>
  );
}
