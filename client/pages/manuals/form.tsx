import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { createManual, listDevices } from '@/api/service';
import type { Device } from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { useServiceOutlet } from '@/components/service/outlet-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

const FORM_ID = 'manual-form';

/**
 * Add one device manual.
 *
 * The manual is written as Markdown text: it is the same source the knowledge
 * base reads, so what a supervisor sees here is what the indexer will process.
 * A new manual is not usable for answers until the indexer has read it, and the
 * list shows whether that has happened.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so this page owns
 * only the submit state and returns `RouteDialog`; the form body and the footer
 * buttons are components rendered inside it.
 */
export default function CreateManualPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      className='sm:max-w-2xl'
      description={t('service.manuals.createDescription')}
      footer={<CreateManualFooter submitting={submitting} />}
      title={t('service.manuals.createTitle')}
    >
      <CreateManualBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function CreateManualBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useServiceOutlet();

  const [title, setTitle] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) => listDevices(client, {}, signal),
    [],
  );
  const devices = useServiceResource('service-manual-devices', load);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (title.trim() === '' || content.trim() === '') return;
    onSubmittingChange(true);
    setError(null);
    try {
      await createManual(api, {
        title: title.trim(),
        content,
        ...(deviceId ? { deviceId: Number(deviceId) } : {}),
      });
      toaster.show({ type: 'success', title: t('service.manuals.created') });
      reloadList();
      await close();
    } catch (submitError) {
      setError(submitError);
    } finally {
      onSubmittingChange(false);
    }
  }

  return (
    <>
      {error ? <ServiceErrorNotice error={error} /> : null}
      <form
        className='grid gap-4'
        id={FORM_ID}
        onSubmit={(event) => void submit(event)}
      >
        <FormField
          htmlFor='manual-title'
          label={t('service.manuals.manualTitle')}
          required
        >
          <Input
            id='manual-title'
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            required
            value={title}
          />
        </FormField>
        <FormField htmlFor='manual-device' label={t('service.devices.title')}>
          <SelectControl
            disabled={devices.isPending}
            id='manual-device'
            onChange={setDeviceId}
            options={(devices.data?.data ?? []).map((device: Device) => ({
              value: String(device.id),
              label: `${device.code} · ${device.name}`,
            }))}
            placeholder={t('service.manuals.devicePlaceholder')}
            value={deviceId}
          />
        </FormField>
        <FormField
          htmlFor='manual-content'
          label={t('service.manuals.content')}
          required
        >
          <Textarea
            id='manual-content'
            onChange={(event) => {
              setContent(event.target.value);
            }}
            required
            rows={14}
            value={content}
          />
        </FormField>
      </form>
    </>
  );
}

function CreateManualFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={submitting}
        onClick={() => {
          void close();
        }}
        type='button'
        variant='ghost'
      >
        {t('service.actions.cancel')}
      </Button>
      <Button disabled={submitting} form={FORM_ID} type='submit'>
        {submitting ? <Spinner aria-hidden='true' /> : null}
        {t('service.actions.create')}
      </Button>
    </>
  );
}
