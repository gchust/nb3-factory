import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import {
  createInspection,
  listDevices,
  listDirectoryUsers,
} from '@/api/service';
import type { DirectoryUser } from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { useServiceOutlet } from '@/components/service/outlet-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

const FORM_ID = 'inspection-form';

/**
 * Schedule one inspection visit for a device.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so this page owns
 * only the submit state and returns `RouteDialog`; the form body and the footer
 * buttons are components rendered inside it.
 */
export default function CreateInspectionPage(): ReactElement {
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
      footer={<CreateInspectionFooter submitting={submitting} />}
      title={t('service.inspections.createTitle')}
    >
      <CreateInspectionBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function CreateInspectionBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useServiceOutlet();

  const [deviceId, setDeviceId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (client: ApiClient, signal: AbortSignal) => {
    const [devices, users] = await Promise.all([
      listDevices(client, {}, signal),
      listDirectoryUsers(client, signal).catch(
        (): readonly DirectoryUser[] => [],
      ),
    ]);
    return { devices: devices.data, users };
  }, []);
  const options = useServiceResource('service-inspection-options', load);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (deviceId === '' || plannedDate === '') return;
    onSubmittingChange(true);
    setError(null);
    try {
      await createInspection(api, {
        deviceId: Number(deviceId),
        plannedDate: new Date(plannedDate).toISOString(),
        assigneeId: assigneeId || null,
      });
      toaster.show({
        type: 'success',
        title: t('service.inspections.created'),
      });
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
      {options.error ? (
        <ServiceErrorNotice error={options.error} onRetry={options.reload} />
      ) : null}
      {error ? <ServiceErrorNotice error={error} /> : null}
      <form
        className='grid gap-4'
        id={FORM_ID}
        onSubmit={(event) => void submit(event)}
      >
        <FormField
          htmlFor='inspection-device'
          label={t('service.devices.title')}
          required
        >
          <SelectControl
            disabled={options.isPending}
            id='inspection-device'
            onChange={setDeviceId}
            options={(options.data?.devices ?? []).map((device) => ({
              value: String(device.id),
              label: `${device.code} · ${device.name}`,
            }))}
            placeholder={t('service.inspections.devicePlaceholder')}
            value={deviceId}
          />
        </FormField>
        <FormField
          htmlFor='inspection-planned'
          label={t('service.inspections.plannedDate')}
          required
        >
          <Input
            id='inspection-planned'
            onChange={(event) => {
              setPlannedDate(event.target.value);
            }}
            required
            type='datetime-local'
            value={plannedDate}
          />
        </FormField>
        <FormField
          htmlFor='inspection-assignee'
          label={t('service.inspections.assignee')}
        >
          <SelectControl
            disabled={options.isPending}
            id='inspection-assignee'
            onChange={setAssigneeId}
            options={(options.data?.users ?? []).map((user) => ({
              value: user.id,
              label: user.name,
            }))}
            placeholder={t('service.orders.assigneePlaceholder')}
            value={assigneeId}
          />
        </FormField>
      </form>
    </>
  );
}

function CreateInspectionFooter({
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
