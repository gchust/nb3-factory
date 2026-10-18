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

export default function EditDevicePage(): ReactElement {
  const { deviceId = '' } = useParams();
  // Reload the form when the parameter changes, so stacked dialogs do not show the previous record's values.
  return <EditDevice key={deviceId} deviceId={deviceId} />;
}

function EditDevice({ deviceId }: { readonly deviceId: string }): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<DevicesOutletContext>();

  // The state disables the buttons; the ref is for beforeClose to read: when close() runs right after a successful save, the new state value has not rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  // Load the latest data by id before rendering the form, rather than trusting a possibly stale row from the list.
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
          // The record no longer exists: refresh the list behind the dialog.
          if (error instanceof ApiClientError && error.status === 404) {
            reload();
          }
        },
      );
    return () => controller.abort();
  }, [api, deviceId, reloadCount, reload]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  // A 404 on save also means the record does not exist.
  const [goneOnSave, setGoneOnSave] = useState(false);
  const notFound = goneOnSave || status === 404;
  const device = loading ? undefined : result?.device;

  let body: ReactElement;
  let footer: ReactElement;
  if (status === 401) {
    body = <SessionExpiredAlert />;
    footer = <CloseButton label={t('actions.close')} />;
  } else if (notFound || status === 403) {
    // Offer no "Retry", only "Close".
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound
            ? t('devices.error.notFound')
            : t('devices.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
    footer = <CloseButton label={t('actions.close')} />;
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('devices.error.requestFailed')}</AlertDescription>
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
    footer = <CloseButton label={t('actions.cancel')} />;
  } else if (!device) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['code', 'name', 'status', 'notes'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-16' />
            <Skeleton
              className={field === 'notes' ? 'h-24 w-full' : 'h-8 w-full'}
            />
          </div>
        ))}
      </div>
    );
    footer = <CloseButton label={t('actions.cancel')} />;
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
      description={t('devices.form.description')}
      className='sm:max-w-lg'
      // No closing while submitting: the × button, Esc, clicking the backdrop and close() all go through beforeClose first.
      beforeClose={() => !submittingRef.current}
      footer={footer}
    >
      {body}
    </RouteDialog>
  );
}

// useRouteOverlay() can only be called in a component inside RouteDialog, so the form and the footer buttons each get their own wrapper component.
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
        // Refresh the list behind the dialog first, then close it.
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
  return (
    <>
      <CloseButton label={t('actions.cancel')} disabled={submitting} />
      {/* The button is outside the <form> and linked through the form attribute. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

function CloseButton({
  label,
  disabled,
}: {
  readonly label: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <Button
      type='button'
      variant='outline'
      disabled={disabled}
      onClick={() => void close()}
    >
      {label}
    </Button>
  );
}
