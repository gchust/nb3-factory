import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
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
import { Textarea } from '#components/ui/textarea';

import { DEVICE_STATUSES, type Device } from './types.js';

const MAX_REFERENCE_LENGTH = 64;
const MAX_NAME_LENGTH = 255;
const MAX_REMARK_LENGTH = 2000;

export interface DeviceFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly device?: Device;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (device: Device) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted` is called. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
  /** Receives `true` once a field differs from its default value and `false` when it no longer does. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export function DeviceForm({
  device,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  onDirtyChange,
}: DeviceFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // The schema lives in the component so validation messages can be built with t and follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        reference: z
          .string()
          .trim()
          .min(1, t('devices.form.referenceRequired'))
          .max(
            MAX_REFERENCE_LENGTH,
            t('devices.form.referenceTooLong', { max: MAX_REFERENCE_LENGTH }),
          ),
        name: z
          .string()
          .trim()
          .min(1, t('devices.form.nameRequired'))
          .max(
            MAX_NAME_LENGTH,
            t('devices.form.nameTooLong', { max: MAX_NAME_LENGTH }),
          ),
        status: z.enum(DEVICE_STATUSES),
        remark: z
          .string()
          .trim()
          .max(
            MAX_REMARK_LENGTH,
            t('devices.form.remarkTooLong', { max: MAX_REMARK_LENGTH }),
          ),
      }),
    [t],
  );

  // No generic: the types are inferred from zodResolver(schema).
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      reference: device?.reference ?? '',
      name: device?.name ?? '',
      status: device?.status ?? 'available',
      remark: device?.remark ?? '',
    },
  });

  // Report unsaved changes to the container, which asks before closing ("beforeClose" in overlay.md).
  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const statusItems = DEVICE_STATUSES.map((value) => ({
    value,
    label: t(`devices.status.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    // values is the data after validation and trimming; an empty optional remark becomes null.
    const json = {
      reference: values.reference,
      name: values.name,
      status: values.status,
      remark: values.remark || null,
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
      if (
        apiError?.status === 409 &&
        apiError.reason === 'DEVICE_REFERENCE_TAKEN'
      ) {
        // Duplicate reference: show the error below the reference field and move focus there.
        form.setError(
          'reference',
          { message: t('devices.form.referenceTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 401) {
        // The session ended. Keep the input and let the user choose to sign in again (SessionExpiredAlert below).
        form.setError('root', { type: 'sessionExpired' });
      } else if (device && apiError?.status === 404) {
        // The record has been deleted: let the caller explain and refresh the list, so the user does not submit again.
        onNotFound?.();
      } else {
        // Other errors appear at the top of the form, without the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('devices.error.forbidden')
              : t('devices.error.requestFailed'),
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
          name='reference'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-reference`}>
                {t('devices.fields.reference')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-reference`}
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
                onValueChange={(value) => {
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
          name='remark'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-remark`}>
                {t('devices.fields.remark')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-remark`}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
