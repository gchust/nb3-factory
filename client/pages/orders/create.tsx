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
  createOrder,
  listDevices,
  listDirectoryUsers,
  listServiceGroups,
} from '@/api/service';
import {
  ORDER_PRIORITIES,
  type Device,
  type ServiceGroup,
} from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useServiceResource } from '@/hooks/use-service-resource';

interface OrderFormState {
  readonly title: string;
  readonly deviceId: string;
  readonly priority: string;
  readonly dueAt: string;
  readonly description: string;
  readonly assigneeId: string;
  readonly groupId: string;
  readonly confidential: boolean;
  readonly observerVisible: boolean;
}

const EMPTY_FORM: OrderFormState = {
  title: '',
  deviceId: '',
  priority: 'normal',
  dueAt: '',
  description: '',
  assigneeId: '',
  groupId: '',
  confidential: false,
  observerVisible: false,
};

const FORM_ID = 'create-order';

interface OrderOptions {
  readonly devices: readonly Device[];
  readonly groups: readonly ServiceGroup[];
  readonly engineers: readonly { id: string; name: string }[];
}

/**
 * The create dialog of the order list.
 *
 * The customer is not a field: a device already belongs to one, and the server
 * takes it from the device, so asking for it again would only allow the two to
 * disagree. The assignee and the group start from the device's own responsible
 * engineer and group, which the server also applies when they are left empty.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so this page owns
 * only the submit state and returns `RouteDialog`; the form body and the footer
 * buttons are components rendered inside it.
 */
export default function CreateServiceOrderPage(): ReactElement {
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
      description={t('service.orders.createDescription')}
      footer={<CreateOrderFooter submitting={submitting} />}
      title={t('service.orders.createTitle')}
    >
      <CreateOrderBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function CreateOrderBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { close } = useRouteOverlay();
  const toaster = useToaster();
  const [form, setForm] = useState<OrderFormState>(EMPTY_FORM);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (api: ApiClient, signal: AbortSignal) => {
    const [devices, groups, engineers] = await Promise.all([
      listDevices(api, {}, signal),
      listServiceGroups(api, signal),
      listDirectoryUsers(api, signal),
    ]);
    return { devices: devices.data, groups, engineers };
  }, []);

  const options = useServiceResource<OrderOptions>(
    'service-order-form-options',
    load,
  );

  function update<K extends keyof OrderFormState>(
    key: K,
    value: OrderFormState[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form.deviceId === '' || form.title.trim() === '') return;
    onSubmittingChange(true);
    setError(null);
    try {
      const result = await createOrder(api, {
        title: form.title.trim(),
        deviceId: Number(form.deviceId),
        priority: form.priority as (typeof ORDER_PRIORITIES)[number],
        ...(form.dueAt ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
        description: form.description.trim() || null,
        ...(form.assigneeId ? { assigneeId: form.assigneeId } : {}),
        ...(form.groupId ? { groupId: Number(form.groupId) } : {}),
        confidential: form.confidential,
        observerVisible: form.observerVisible,
      });
      toaster.show({
        type: 'success',
        title: result.created
          ? t('service.orders.created')
          : t('service.orders.createdDuplicate'),
      });
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
          htmlFor='order-title'
          label={t('service.orders.orderTitle')}
          required
        >
          <Input
            id='order-title'
            onChange={(event) => {
              update('title', event.target.value);
            }}
            required
            value={form.title}
          />
        </FormField>

        <FormField
          htmlFor='order-device'
          label={t('service.orders.device')}
          required
        >
          <SelectControl
            disabled={options.isPending}
            id='order-device'
            onChange={(value) => {
              update('deviceId', value);
            }}
            options={(options.data?.devices ?? []).map((device) => ({
              value: String(device.id),
              label: `${device.code} · ${device.name}`,
            }))}
            placeholder={t('service.orders.devicePlaceholder')}
            value={form.deviceId}
          />
        </FormField>

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            htmlFor='order-priority'
            label={t('service.orders.priority')}
          >
            <SelectControl
              id='order-priority'
              onChange={(value) => {
                update('priority', value);
              }}
              options={ORDER_PRIORITIES.map((priority) => ({
                value: priority,
                label: t(`service.priority.${priority}`),
              }))}
              value={form.priority}
            />
          </FormField>
          <FormField htmlFor='order-due' label={t('service.orders.dueAt')}>
            <Input
              id='order-due'
              onChange={(event) => {
                update('dueAt', event.target.value);
              }}
              type='datetime-local'
              value={form.dueAt}
            />
          </FormField>
        </div>

        <FormField
          htmlFor='order-description'
          label={t('service.orders.orderDescription')}
        >
          <Textarea
            id='order-description'
            onChange={(event) => {
              update('description', event.target.value);
            }}
            rows={4}
            value={form.description}
          />
        </FormField>

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            htmlFor='order-assignee'
            label={t('service.orders.assignee')}
          >
            <SelectControl
              disabled={options.isPending}
              id='order-assignee'
              onChange={(value) => {
                update('assigneeId', value);
              }}
              options={(options.data?.engineers ?? []).map((user) => ({
                value: user.id,
                label: user.name,
              }))}
              placeholder={t('service.orders.assigneePlaceholder')}
              value={form.assigneeId}
            />
          </FormField>
          <FormField htmlFor='order-group' label={t('service.orders.group')}>
            <SelectControl
              disabled={options.isPending}
              id='order-group'
              onChange={(value) => {
                update('groupId', value);
              }}
              options={(options.data?.groups ?? []).map((group) => ({
                value: String(group.id),
                label: group.name,
              }))}
              placeholder={t('service.orders.groupPlaceholder')}
              value={form.groupId}
            />
          </FormField>
        </div>

        <div className='grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2'>
          <label
            className='flex items-start gap-2 text-sm'
            htmlFor='order-confidential'
          >
            <input
              checked={form.confidential}
              className='mt-0.5 size-4 accent-primary'
              id='order-confidential'
              onChange={(event) => {
                update('confidential', event.target.checked);
              }}
              type='checkbox'
            />
            <span>
              {t('service.orders.confidential')}
              <span className='block text-xs text-muted-foreground'>
                {t('service.orders.confidentialHint')}
              </span>
            </span>
          </label>
          <label
            className='flex items-start gap-2 text-sm'
            htmlFor='order-observer'
          >
            <input
              checked={form.observerVisible}
              className='mt-0.5 size-4 accent-primary'
              id='order-observer'
              onChange={(event) => {
                update('observerVisible', event.target.checked);
              }}
              type='checkbox'
            />
            <span>
              {t('service.orders.observerVisible')}
              <span className='block text-xs text-muted-foreground'>
                {t('service.orders.observerVisibleHint')}
              </span>
            </span>
          </label>
        </div>
      </form>
    </>
  );
}

function CreateOrderFooter({
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
        {submitting ? t('service.actions.saving') : t('service.actions.create')}
      </Button>
    </>
  );
}
