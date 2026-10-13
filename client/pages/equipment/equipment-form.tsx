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

import { EQUIPMENT_STATUSES, type Equipment } from './types.js';

export interface EquipmentFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly equipment?: Equipment;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save; the form has already shown the success message. */
  readonly onSubmitted: (equipment: Equipment) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
  /** Receives `true` once a field differs from its default value and `false` when it no longer does. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export function EquipmentForm({
  equipment,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  onDirtyChange,
}: EquipmentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  // Built inside the component so validation messages follow the current language; `t` is a dependency.
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .min(1, t('equipment.form.codeRequired'))
          .max(64, t('equipment.form.codeTooLong', { max: 64 })),
        name: z
          .string()
          .trim()
          .min(1, t('equipment.form.nameRequired'))
          .max(191, t('equipment.form.nameTooLong', { max: 191 })),
        status: z.enum(EQUIPMENT_STATUSES),
        notes: z
          .string()
          .trim()
          .max(2000, t('equipment.form.notesTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      code: equipment?.code ?? '',
      name: equipment?.name ?? '',
      status: equipment?.status ?? 'available',
      notes: equipment?.notes ?? '',
    },
  });

  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const statusItems = EQUIPMENT_STATUSES.map((value) => ({
    value,
    label: t(`equipment.status.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    // User-entered text (name, notes) is sent as typed and never translated; empty notes become null.
    const json = {
      code: values.code,
      name: values.name,
      status: values.status,
      notes: values.notes || null,
    };
    let saved: Equipment;
    onSubmittingChange?.(true);
    try {
      const result = equipment
        ? await api.request<{ data: Equipment }>({
            path: `equipment/${encodeURIComponent(equipment.id)}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Equipment }>({
            path: 'equipment',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (
        apiError?.status === 409 &&
        apiError.reason === 'EQUIPMENT_CODE_TAKEN'
      ) {
        // Duplicate code: show the explanation below the code field and move focus there.
        form.setError(
          'code',
          { message: t('equipment.form.codeTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (equipment && apiError?.status === 404) {
        onNotFound?.();
      } else {
        // Other errors show a translated sentence at the top, never the raw message the backend returned.
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('equipment.error.forbidden')
              : t('equipment.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: equipment
        ? t('equipment.edit.success', { name: saved.name })
        : t('equipment.create.success', { name: saved.name }),
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
                {t('equipment.fields.code')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-code`}
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
                {t('equipment.fields.name')}
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
                {t('equipment.fields.status')}
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
          name='notes'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-notes`}>
                {t('equipment.fields.notes')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-notes`}
                rows={3}
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
