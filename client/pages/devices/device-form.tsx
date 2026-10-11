import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '#components/session-expired-alert';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import { DEVICE_STATUSES, type Device } from './types.js';

export interface DeviceFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly device?: Device;
  /** The `<form>` id; the container's submit button links to it with `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (device: Device) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record no longer exists. */
  readonly onNotFound?: () => void;
}

/**
 * The device fields. It renders no buttons: the dialog puts the submit button outside the `<form>` and links it
 * through `formId`. The user's own text (code and name) is sent as typed and never translated; only the status'
 * label is a translation, and the stored value stays `available` or `borrowed`.
 */
export function DeviceForm({
  device,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: DeviceFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // Built with t so the validation messages follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .min(1, t('devices.form.codeRequired'))
          .max(64, t('devices.form.codeTooLong', { max: 64 })),
        name: z
          .string()
          .trim()
          .min(1, t('devices.form.nameRequired'))
          .max(255, t('devices.form.nameTooLong', { max: 255 })),
        status: z.enum(DEVICE_STATUSES),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      code: device?.code ?? '',
      name: device?.name ?? '',
      status: device?.status ?? 'available',
    },
  });

  const statusItems = DEVICE_STATUSES.map((value) => ({
    value,
    label: t(`devices.status.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      code: values.code,
      name: values.name,
      status: values.status,
    };
    let saved: Device;
    onSubmittingChange?.(true);
    try {
      const result = device
        ? await api.request<{ data: Device }>({
            path: `devices/${encodeURIComponent(device.id)}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Device }>({
            path: 'devices',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 409 && apiError.reason === 'DEVICE_CODE_TAKEN') {
        // A duplicate code is shown under the code field, with focus moved there.
        form.setError(
          'code',
          { message: t('devices.errors.codeTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (
        device &&
        (apiError?.status === 404 || apiError?.status === 403)
      ) {
        onNotFound?.();
      } else {
        // Anything else appears at the top of the form, without the raw message the server returned.
        form.setError('root', { message: t('devices.errors.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: device
        ? t('devices.edit.success', { name: saved.name })
        : t('devices.create.success', { name: saved.name }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='code'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-code`}>
                {t('devices.fields.code')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-code`}
                autoComplete='off'
                placeholder={t('devices.form.codePlaceholder')}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('devices.fields.name')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-name`}
                autoComplete='off'
                placeholder={t('devices.form.namePlaceholder')}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='status'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-status`}>
                {t('devices.fields.status')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={statusItems}
                value={field.value}
                onValueChange={(value: string | null) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-status`}
                  className='w-full'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue
                    placeholder={t('devices.form.statusPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
