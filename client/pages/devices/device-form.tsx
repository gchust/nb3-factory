import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useMemo, type ReactElement } from 'react';
import { z } from 'zod';

import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';

import { DEVICE_STATUSES, type Device, type DeviceStatus } from './types.js';

interface DeviceFormValues {
  code: string;
  name: string;
  status: DeviceStatus;
  notes: string;
}

export interface DeviceFormProps {
  readonly device?: Device;
  readonly formId: string;
  readonly busy: boolean;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSaved: (device: Device) => void;
  readonly onMissing: () => void;
}

export function DeviceForm({
  device,
  formId,
  busy,
  onBusyChange,
  onSaved,
  onMissing,
}: DeviceFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const creating = !device;
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .min(1, { message: t('devices.form.codeRequired') })
          .max(64, {
            message: t('devices.form.codeTooLong', { max: 64 }),
          }),
        name: z
          .string()
          .trim()
          .min(1, { message: t('devices.form.nameRequired') })
          .max(100, {
            message: t('devices.form.nameTooLong', { max: 100 }),
          }),
        status: z.enum(DEVICE_STATUSES),
        notes: z
          .string()
          .trim()
          .max(500, {
            message: t('devices.form.notesTooLong', { max: 500 }),
          }),
      }),
    [t],
  );
  const form = useForm<DeviceFormValues>({
    defaultValues: {
      code: device?.code ?? '',
      name: device?.name ?? '',
      status: device?.status ?? 'available',
      notes: device?.notes ?? '',
    },
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const statusOptions = DEVICE_STATUSES.map((value) => ({
    value,
    label: t(`devices.status.${value}`),
  }));

  const submit = form.handleSubmit(async (values) => {
    onBusyChange(true);
    form.clearErrors('root');
    try {
      const body = {
        code: values.code,
        name: values.name,
        status: values.status,
        notes: values.notes ? values.notes : null,
      };
      const response = device
        ? await api.request<{ data: Device }>({
            path: `devices/${encodeURIComponent(device.id)}`,
            method: 'PATCH',
            json: body,
          })
        : await api.request<{ data: Device }>({
            path: 'devices',
            method: 'POST',
            json: body,
          });
      toaster.show({
        type: 'success',
        title: t(creating ? 'devices.create.success' : 'devices.edit.success', {
          name: response.data.name,
        }),
      });
      onSaved(response.data);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.reason === 'DEVICE_CODE_TAKEN'
      ) {
        form.setError('code', {
          type: 'server',
          message: t('devices.form.codeTaken'),
        });
        form.setFocus('code');
      } else if (error instanceof ApiClientError && error.status === 404) {
        onMissing();
      } else {
        form.setError('root', {
          type: 'server',
          message: t('devices.form.requestFailed'),
        });
      }
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <form
      id={formId}
      noValidate
      className='flex flex-col gap-5'
      onSubmit={(event) => void submit(event)}
    >
      {form.formState.errors.root?.message ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {form.formState.errors.root.message}
          </AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.code)}>
          <FieldLabel htmlFor={`${formId}-code`}>
            {t('devices.fields.code')} *
          </FieldLabel>
          <Input
            id={`${formId}-code`}
            autoComplete='off'
            maxLength={64}
            disabled={busy}
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register('code')}
          />
          <FieldError errors={[form.formState.errors.code]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor={`${formId}-name`}>
            {t('devices.fields.name')} *
          </FieldLabel>
          <Input
            id={`${formId}-name`}
            autoComplete='off'
            maxLength={100}
            disabled={busy}
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register('name')}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.status)}>
          <FieldLabel htmlFor={`${formId}-status`}>
            {t('devices.fields.status')} *
          </FieldLabel>
          <Controller
            control={form.control}
            name='status'
            render={({ field }) => (
              <Select
                items={statusOptions}
                value={field.value}
                disabled={busy}
                onValueChange={(value) => {
                  if (value !== null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id={`${formId}-status`}
                  aria-label={t('devices.fields.status')}
                  aria-invalid={Boolean(form.formState.errors.status)}
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`devices.status.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[form.formState.errors.status]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.notes)}>
          <FieldLabel htmlFor={`${formId}-notes`}>
            {t('devices.fields.notes')}
          </FieldLabel>
          <Textarea
            id={`${formId}-notes`}
            rows={3}
            maxLength={500}
            disabled={busy}
            aria-invalid={Boolean(form.formState.errors.notes)}
            {...form.register('notes')}
          />
          <FieldError errors={[form.formState.errors.notes]} />
        </Field>
      </FieldGroup>
    </form>
  );
}
