import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';

import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import { DeviceErrorAlert } from './device-error.js';
import {
  DEVICE_STATUSES,
  type Device,
  type DeviceResponse,
  type DeviceStatus,
  isDeviceStatus,
} from './types.js';

interface DeviceFields {
  code: string;
  name: string;
  status: DeviceStatus;
}

type DeviceFieldErrors = Partial<Record<keyof DeviceFields, string>>;

export interface DeviceFormProps {
  readonly mode: 'create' | 'edit';
  readonly device?: Device | undefined;
  readonly onSubmitted: (device: Device) => void;
  readonly onBusyChange?: (busy: boolean) => void;
}

export function DeviceForm({
  mode,
  device,
  onSubmitted,
  onBusyChange,
}: DeviceFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<DeviceFields>({
    code: device?.code ?? '',
    name: device?.name ?? '',
    status: device?.status ?? 'available',
  });
  const [fieldErrors, setFieldErrors] = useState<DeviceFieldErrors>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const formId = mode === 'create' ? 'new-device' : 'edit-device';

  const updateBusy = (next: boolean) => {
    setBusy(next);
    onBusyChange?.(next);
  };

  const setField = <TKey extends keyof DeviceFields>(
    name: TKey,
    value: DeviceFields[TKey],
  ) => {
    setFields((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  };

  const focusField = (name: keyof DeviceFields) => {
    formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
  };

  const validate = (): DeviceFieldErrors => {
    const errors: DeviceFieldErrors = {};
    const code = fields.code.trim();
    const name = fields.name.trim();

    if (!code) {
      errors.code = t('devices.form.codeRequired');
    } else if (code.length > 64) {
      errors.code = t('devices.form.codeTooLong');
    }
    if (!name) {
      errors.name = t('devices.form.nameRequired');
    } else if (name.length > 100) {
      errors.name = t('devices.form.nameTooLong');
    }
    return errors;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const errors = validate();
    setFieldErrors(errors);
    setError(undefined);
    const firstInvalid = (Object.keys(errors) as (keyof DeviceFields)[]).find(
      (name) => errors[name],
    );
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    updateBusy(true);
    try {
      const input = {
        code: fields.code.trim(),
        name: fields.name.trim(),
        status: fields.status,
      };
      const response = await api.request<DeviceResponse>({
        path:
          mode === 'create'
            ? 'devices'
            : `devices/${encodeURIComponent(device?.id ?? '')}`,
        method: mode === 'create' ? 'POST' : 'PATCH',
        json: input,
      });
      toaster.show({
        type: 'success',
        title: t(
          mode === 'create' ? 'devices.create.success' : 'devices.edit.success',
          { name: response.data.name },
        ),
      });
      onSubmitted(response.data);
    } catch (next) {
      if (
        next instanceof ApiClientError &&
        next.reason === 'DEVICE_CODE_TAKEN'
      ) {
        setFieldErrors((current) => ({
          ...current,
          code: t('devices.form.codeTaken'),
        }));
        focusField('code');
      } else {
        setError(next);
      }
    } finally {
      updateBusy(false);
    }
  };

  const statusOptions = DEVICE_STATUSES.map((status) => ({
    value: status,
    label: t(`devices.status.${status}`),
  }));

  return (
    <form
      ref={formRef}
      id={formId}
      noValidate
      onSubmit={(event) => void submit(event)}
      className='flex flex-col gap-4'
    >
      {error ? <DeviceErrorAlert error={error} /> : null}

      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${formId}-code`}>
          {t('devices.fields.code')}{' '}
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        </Label>
        <Input
          id={`${formId}-code`}
          name='code'
          autoComplete='off'
          required
          maxLength={64}
          disabled={busy}
          value={fields.code}
          aria-invalid={Boolean(fieldErrors.code)}
          aria-describedby={
            fieldErrors.code ? `${formId}-code-error` : undefined
          }
          onChange={(event) => setField('code', event.target.value)}
        />
        {fieldErrors.code ? (
          <p id={`${formId}-code-error`} className='text-xs text-destructive'>
            {fieldErrors.code}
          </p>
        ) : null}
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${formId}-name`}>
          {t('devices.fields.name')}{' '}
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        </Label>
        <Input
          id={`${formId}-name`}
          name='name'
          autoComplete='off'
          required
          maxLength={100}
          disabled={busy}
          value={fields.name}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={
            fieldErrors.name ? `${formId}-name-error` : undefined
          }
          onChange={(event) => setField('name', event.target.value)}
        />
        {fieldErrors.name ? (
          <p id={`${formId}-name-error`} className='text-xs text-destructive'>
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor={`${formId}-status`}>{t('devices.fields.status')}</Label>
        <Select
          value={fields.status}
          items={statusOptions}
          disabled={busy}
          onValueChange={(value) => {
            if (value !== null && isDeviceStatus(value)) {
              setField('status', value);
            }
          }}
        >
          <SelectTrigger
            id={`${formId}-status`}
            aria-label={t('devices.fields.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`devices.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}

export default DeviceForm;
