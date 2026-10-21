import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';

import { DeviceErrorAlert } from './device-error.js';
import { DeviceForm } from './device-form.js';
import type { Device, DeviceOutletContext, DeviceResponse } from './types.js';

export function EditDevicePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { deviceId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const closeTo = { pathname: '/devices', search: location.search };
  const outlet = useOutletContext<DeviceOutletContext>();
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly device?: Device;
    readonly error?: unknown;
  }>();
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const busyRef = useRef(false);
  const formId = 'edit-device';

  const updateBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${deviceId}:${reloadToken}`;

    void api
      .request<DeviceResponse>({
        path: `devices/${encodeURIComponent(deviceId)}`,
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          setLoaded({ key, device: response.data });
        }
      })
      .catch((next: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, error: next });
      });

    return () => controller.abort();
  }, [api, deviceId, reloadToken]);

  const current =
    loaded?.key === `${deviceId}:${reloadToken}` ? loaded : undefined;
  const device = current?.device;
  const error = current?.error;
  const loading = current === undefined;

  return (
    <RouteDialog
      title={t('devices.edit.title')}
      description={t('devices.edit.description')}
      beforeClose={() => !busyRef.current}
      footer={
        <>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => void navigate(closeTo)}
          >
            {t('devices.actions.cancel')}
          </Button>
          <Button form={formId} type='submit' disabled={busy || !device}>
            {t(busy ? 'devices.actions.saving' : 'devices.edit.submit')}
          </Button>
        </>
      }
    >
      {error ? (
        <DeviceErrorAlert error={error} retry={reload} />
      ) : loading || !device ? (
        <div
          role='status'
          aria-label={t('devices.loading')}
          className='flex flex-col gap-3'
        >
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      ) : (
        <DeviceForm
          mode='edit'
          device={device}
          onBusyChange={updateBusy}
          onSubmitted={() => {
            outlet.reload();
            void navigate(closeTo);
          }}
        />
      )}
    </RouteDialog>
  );
}

export default EditDevicePage;
