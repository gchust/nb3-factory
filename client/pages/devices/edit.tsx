import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { DeviceForm } from './device-form.js';
import type { Device, DevicesOutletContext } from './types.js';

const FORM_ID = 'device-edit-form';

/** `/devices/edit/:deviceId`: the edit dialog a row's menu opens over the list. */
export default function EditDevicePage(): ReactElement {
  const { deviceId = '' } = useParams();
  // Remount when the id changes, so the form's default values are read from the new record.
  return <EditDevice key={deviceId} deviceId={deviceId} />;
}

function EditDevice({ deviceId }: { readonly deviceId: string }): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<DevicesOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // Load the latest record by id before rendering the form, instead of the list's possibly stale row.
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${deviceId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly device?: Device;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${deviceId}:${reloadCount}`;
    api
      .request<{ data: Device }>({
        path: `devices/${encodeURIComponent(deviceId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, device: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record no longer exists: the list behind should refresh too.
          if (error instanceof ApiClientError && error.status === 404) reload();
        },
      );
    return () => controller.abort();
  }, [api, deviceId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const errorStatus =
    error instanceof ApiClientError ? error.status : undefined;
  // A 404 on save means the record does not exist either.
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || errorStatus === 404 || errorStatus === 403;
  const device = loading ? undefined : result?.device;

  let body: ReactElement;
  let footer: ReactElement;
  if (errorStatus === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseFooter label={t('actions.close')} />;
  } else if (notFound) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('devices.errors.notFound')}</AlertDescription>
      </Alert>
    );
    footer = <CloseFooter label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('devices.errors.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
    footer = <CloseFooter label={t('actions.cancel')} />;
  } else if (!device) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['code', 'name', 'status'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
    footer = <CloseFooter label={t('actions.cancel')} />;
  } else {
    body = (
      <EditDeviceBody
        device={device}
        onSubmittingChange={handleSubmittingChange}
        onNotFound={() => {
          setGoneOnSave(true);
          reload();
        }}
      />
    );
    footer = <EditDeviceFooter submitting={submitting} />;
  }

  return (
    <RouteDialog
      title={t('devices.edit.title')}
      description={t('devices.edit.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

function EditDeviceBody({
  device,
  onSubmittingChange,
  onNotFound,
}: {
  readonly device: Device;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<DevicesOutletContext>();
  return (
    <DeviceForm
      formId={FORM_ID}
      device={device}
      onSubmittingChange={onSubmittingChange}
      onNotFound={onNotFound}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function EditDeviceFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function CloseFooter({ label }: { readonly label: string }): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {label}
    </Button>
  );
}
