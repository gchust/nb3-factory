import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useParams } from 'react-router';

import {
  createDevice,
  getDevice,
  listCustomers,
  listDirectoryUsers,
  listServiceGroups,
  updateDevice,
} from '@/api/service';
import type {
  Customer,
  Device,
  DirectoryUser,
  ServiceGroup,
} from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { useServiceOutlet } from '@/components/service/outlet-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

interface DeviceFormData {
  readonly device: Device | null;
  readonly customers: readonly Customer[];
  readonly groups: readonly ServiceGroup[];
  readonly users: readonly DirectoryUser[];
}

interface DeviceFields {
  readonly code: string;
  readonly name: string;
  readonly model: string;
  readonly customerId: string;
  readonly engineerId: string;
  readonly groupId: string;
  readonly nextInspectionDate: string;
}

const EMPTY: DeviceFields = {
  code: '',
  name: '',
  model: '',
  customerId: '',
  engineerId: '',
  groupId: '',
  nextInspectionDate: '',
};

const FORM_ID = 'device-form';

/**
 * Create or edit one device.
 *
 * The responsible engineer and the group default from the customer's own
 * arrangement on the server when they are left empty; the form offers them so a
 * supervisor can override that for one machine.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so this page owns
 * only the submit state and returns `RouteDialog`; the form body and the footer
 * buttons are components rendered inside it.
 */
export default function DeviceFormPage(): ReactElement {
  const { t } = useTranslation();
  const { deviceId } = useParams();
  const id = deviceId === undefined ? undefined : Number(deviceId);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      footer={<DeviceFormFooter submitting={submitting} />}
      title={
        id === undefined
          ? t('service.devices.createTitle')
          : t('service.devices.editTitle')
      }
    >
      <DeviceFormBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function DeviceFormBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { deviceId } = useParams();
  const id = deviceId === undefined ? undefined : Number(deviceId);
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useServiceOutlet();

  const load = useCallback(
    async (api: ApiClient, signal: AbortSignal) => {
      const [device, customers, groups, users] = await Promise.all([
        id === undefined ? Promise.resolve(null) : getDevice(api, id, signal),
        listCustomers(api, undefined, signal),
        listServiceGroups(api, signal),
        listDirectoryUsers(api, signal).catch(
          (): readonly DirectoryUser[] => [],
        ),
      ]);
      return {
        device,
        customers: customers.data,
        groups,
        users,
      };
    },
    [id],
  );
  const data = useServiceResource<DeviceFormData>(
    `service-device:${String(id)}`,
    load,
  );
  const [draft, setDraft] = useState<DeviceFields | null>(null);
  const [error, setError] = useState<unknown>(null);

  const device = data.data?.device ?? null;
  const form: DeviceFields =
    draft ??
    (device
      ? {
          code: device.code,
          name: device.name,
          model: device.model ?? '',
          customerId: String(device.customerId),
          engineerId: device.engineerId ?? '',
          groupId: device.groupId === null ? '' : String(device.groupId),
          nextInspectionDate: device.nextInspectionDate ?? '',
        }
      : EMPTY);

  function update<K extends keyof DeviceFields>(
    key: K,
    value: DeviceFields[K],
  ): void {
    setDraft({ ...form, [key]: value });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      form.code.trim() === '' ||
      form.name.trim() === '' ||
      form.customerId === ''
    ) {
      return;
    }
    onSubmittingChange(true);
    setError(null);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      model: form.model.trim() || null,
      customerId: Number(form.customerId),
      engineerId: form.engineerId || null,
      groupId: form.groupId === '' ? null : Number(form.groupId),
      nextInspectionDate: form.nextInspectionDate
        ? new Date(form.nextInspectionDate).toISOString()
        : null,
    };
    try {
      if (id === undefined) {
        await createDevice(api, payload);
        toaster.show({ type: 'success', title: t('service.devices.created') });
      } else {
        await updateDevice(api, id, payload);
        toaster.show({ type: 'success', title: t('service.devices.updated') });
      }
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
      {data.error ? (
        <ServiceErrorNotice error={data.error} onRetry={data.reload} />
      ) : null}
      {error ? <ServiceErrorNotice error={error} /> : null}
      {data.isPending ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner aria-hidden='true' />
          {t('service.common.loading')}
        </div>
      ) : (
        <form
          className='grid gap-4'
          id={FORM_ID}
          onSubmit={(event) => void submit(event)}
        >
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              htmlFor='device-code'
              label={t('service.devices.code')}
              required
            >
              <Input
                id='device-code'
                onChange={(event) => {
                  update('code', event.target.value);
                }}
                required
                value={form.code}
              />
            </FormField>
            <FormField
              htmlFor='device-name'
              label={t('service.devices.name')}
              required
            >
              <Input
                id='device-name'
                onChange={(event) => {
                  update('name', event.target.value);
                }}
                required
                value={form.name}
              />
            </FormField>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              htmlFor='device-model'
              label={t('service.devices.model')}
            >
              <Input
                id='device-model'
                onChange={(event) => {
                  update('model', event.target.value);
                }}
                value={form.model}
              />
            </FormField>
            <FormField
              htmlFor='device-customer'
              label={t('service.customers.title')}
              required
            >
              <SelectControl
                id='device-customer'
                onChange={(value) => {
                  update('customerId', value);
                }}
                options={(data.data?.customers ?? []).map((customer) => ({
                  value: String(customer.id),
                  label: customer.name,
                }))}
                placeholder={t('service.devices.customerPlaceholder')}
                value={form.customerId}
              />
            </FormField>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              htmlFor='device-engineer'
              label={t('service.devices.engineer')}
            >
              <SelectControl
                id='device-engineer'
                onChange={(value) => {
                  update('engineerId', value);
                }}
                options={(data.data?.users ?? []).map((user) => ({
                  value: user.id,
                  label: user.name,
                }))}
                placeholder={t('service.orders.assigneePlaceholder')}
                value={form.engineerId}
              />
            </FormField>
            <FormField htmlFor='device-group' label={t('service.orders.group')}>
              <SelectControl
                id='device-group'
                onChange={(value) => {
                  update('groupId', value);
                }}
                options={(data.data?.groups ?? []).map((group) => ({
                  value: String(group.id),
                  label: group.name,
                }))}
                placeholder={t('service.orders.groupPlaceholder')}
                value={form.groupId}
              />
            </FormField>
          </div>
          <FormField
            htmlFor='device-next-inspection'
            label={t('service.devices.nextInspectionDate')}
          >
            <Input
              id='device-next-inspection'
              onChange={(event) => {
                update('nextInspectionDate', event.target.value);
              }}
              type='datetime-local'
              value={form.nextInspectionDate}
            />
          </FormField>
        </form>
      )}
    </>
  );
}

function DeviceFormFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { deviceId } = useParams();
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
        {deviceId === undefined
          ? t('service.actions.create')
          : t('service.actions.save')}
      </Button>
    </>
  );
}
