import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

import { toDateTimeLocal, toInstant } from './datetime.js';
import type { Visitor } from './types.js';

const FIELD_NAMES = [
  'name',
  'phone',
  'reason',
  'employeeName',
  'arrivedAt',
] as const;
type VisitorFormField = (typeof FIELD_NAMES)[number];

function isVisitorFormField(value: string): value is VisitorFormField {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

/** The field errors the register endpoint returns under `errors`, when it rejects a payload. */
function readServerFieldErrors(payload: unknown): Record<string, string> {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }
  const errors = (payload as { errors?: unknown }).errors;
  if (typeof errors !== 'object' || errors === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(errors).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export interface VisitorFormProps {
  /** The `<form>` id. When the submit button lives outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the success message. */
  readonly onSubmitted: (visitor: Visitor) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted` is called. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/** Registers a visitor's arrival. The container owns the title, buttons and closing. */
export function VisitorForm({
  formId,
  onSubmitted,
  onSubmittingChange,
}: VisitorFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('visitors.form.nameRequired'))
          .max(100, t('visitors.form.nameTooLong')),
        phone: z
          .string()
          .trim()
          .min(1, t('visitors.form.phoneRequired'))
          .regex(/^\d{11}$/u, t('visitors.form.phoneInvalid')),
        reason: z
          .string()
          .trim()
          .min(1, t('visitors.form.reasonRequired'))
          .max(255, t('visitors.form.reasonTooLong')),
        employeeName: z
          .string()
          .trim()
          .min(1, t('visitors.form.employeeRequired'))
          .max(100, t('visitors.form.employeeTooLong')),
        arrivedAt: z
          .string()
          .min(1, t('visitors.form.arrivedAtRequired'))
          .refine(
            (value) => toInstant(value) !== undefined,
            t('visitors.form.arrivedAtInvalid'),
          ),
      }),
    [t],
  );

  // The arrival time defaults to "now", read once when the form opens.
  const [defaultArrivedAt] = useState(() => toDateTimeLocal(new Date()));

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      phone: '',
      reason: '',
      employeeName: '',
      arrivedAt: defaultArrivedAt,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const arrivedAt = toInstant(values.arrivedAt);
    if (!arrivedAt) {
      form.setError(
        'arrivedAt',
        { message: t('visitors.form.arrivedAtInvalid') },
        { shouldFocus: true },
      );
      return;
    }

    let saved: Visitor;
    onSubmittingChange?.(true);
    try {
      const result = await api.request<
        { data: Visitor },
        {
          name: string;
          phone: string;
          reason: string;
          employeeName: string;
          arrivedAt: string;
        }
      >({
        path: 'visitors',
        method: 'POST',
        json: {
          name: values.name,
          phone: values.phone,
          reason: values.reason,
          employeeName: values.employeeName,
          arrivedAt,
        },
      });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 400 && apiError.code === 'VALIDATION_ERROR') {
        const serverErrors = readServerFieldErrors(apiError.payload);
        let focused = false;
        for (const [field, code] of Object.entries(serverErrors)) {
          if (!isVisitorFormField(field)) {
            continue;
          }
          form.setError(
            field,
            { message: t(`visitors.form.serverError.${code}`) },
            { shouldFocus: !focused },
          );
          focused = true;
        }
        if (!focused) {
          form.setError('root', {
            message: t('visitors.error.validation'),
          });
        }
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('visitors.error.forbidden')
              : t('visitors.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }

    toast.add({
      type: 'success',
      title: t('visitors.create.success', { name: saved.name }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('visitors.fields.name')}
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
          name='phone'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-phone`}>
                {t('visitors.fields.phone')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-phone`}
                autoComplete='off'
                inputMode='numeric'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='employeeName'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-employee-name`}>
                {t('visitors.fields.employeeName')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-employee-name`}
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
          name='reason'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-reason`}>
                {t('visitors.fields.reason')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-reason`}
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
          name='arrivedAt'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-arrived-at`}>
                {t('visitors.fields.arrivedAt')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-arrived-at`}
                type='datetime-local'
                aria-required='true'
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
