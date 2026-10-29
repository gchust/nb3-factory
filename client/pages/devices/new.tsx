import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';

import { DeviceForm } from './device-form.js';
import type { DeviceOutletContext } from './types.js';

export function NewDevicePage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const closeTo = { pathname: '/devices', search: location.search };
  const outlet = useOutletContext<DeviceOutletContext>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const formId = 'new-device';

  const updateBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };

  return (
    <RouteDialog
      title={t('devices.create.title')}
      description={t('devices.create.description')}
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
          <Button form={formId} type='submit' disabled={busy}>
            {t(busy ? 'devices.actions.saving' : 'devices.create.submit')}
          </Button>
        </>
      }
    >
      <DeviceForm
        mode='create'
        onBusyChange={updateBusy}
        onSubmitted={() => {
          outlet.reload();
          void navigate(closeTo);
        }}
      />
    </RouteDialog>
  );
}

export default NewDevicePage;
