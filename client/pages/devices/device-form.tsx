import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Field,
  FieldDescription,
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
import { Textarea } from '#components/ui/textarea';

import { DEVICE_STATUSES, type Device } from './types.js';

export interface DeviceFormProps {
  /** When editing, the device just loaded; omit it when creating. */
  readonly device?: Device;
  /** The `<form>` id; the submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save, with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (device: Device) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** Editing only: the endpoint answered 404, so the device is gone. */
  readonly onNotFound?: () => void;
}

/**
 * The device form, shared by the create and the edit dialog. It renders no buttons: the container puts the submit
 * button outside the `<form>` and links it through `formId`.
 *
 * Code and name are required and the code is unique. Notes are free text: whatever is typed here is stored and shown
 * as written, in whichever language it was typed, and is never translated.
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

  // Built in the component so the validation messages are translated and follow the current language.
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
          .max(100, t('devices.form.nameTooLong', { max: 100 })),
        status: z.enum(['available', 'borrowed']),
        notes: z
          .string()
          .trim()
          .max(1000, t('devices.form.notesTooLong', { max: 1000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      code: device?.code ?? '',
      name: device?.name ?? '',
      status: device?.status ?? 'available',
      notes: device?.notes ?? '',
    },
  });

  const statusItems = DEVICE_STATUSES.map((value) => ({
    value,
    label:
      value === 'available'
        ? t('devices.status.available')
        : t('devices.status.borrowed'),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      code: values.code,
      name: values.name,
      status: values.status,
      notes: values.notes || null,
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
        // The code is taken: show it below the code field and move focus there.
        form.setError(
          'code',
          { message: t('devices.form.codeTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 401) {
        form.setError('root', { message: t('devices.error.sessionExpired') });
      } else if (device && apiError?.status === 404) {
        // Deleted while the dialog was open: let the page explain and refresh the list.
        onNotFound?.();
      } else {
        // Anything else appears at the top of the form, without the raw backend message.
        form.setError('root', {
          message: t('devices.error.requestFailed'),
        });
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
  const requiredMark = (
    <span aria-hidden='true' className='text-destructive'>
      *
    </span>
  );

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
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
                {requiredMark}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-code`}
                autoComplete='off'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{t('devices.form.codeHint')}</FieldDescription>
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
                {requiredMark}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-name`}
                autoComplete='off'
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
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
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
        <Controller
          control={form.control}
          name='notes'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-notes`}>
                {t('devices.fields.notes')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-notes`}
                rows={3}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{t('devices.form.notesHint')}</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
