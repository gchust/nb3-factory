import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import { createEquipment, updateEquipment } from './api.js';
import type { Equipment } from './types.js';

export interface EquipmentFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly equipment?: Equipment;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form already showed the success message. */
  readonly onSubmitted: (equipment: Equipment) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

/** Create and edit share this form; passing `equipment` selects the update endpoint. */
export function EquipmentForm({
  equipment,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: EquipmentFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const schema = useMemo(
    () =>
      z.object({
        assetCode: z
          .string()
          .trim()
          .min(1, t('equipment.form.assetCodeRequired'))
          .max(64, t('equipment.form.assetCodeTooLong', { max: 64 })),
        name: z
          .string()
          .trim()
          .min(1, t('equipment.form.nameRequired'))
          .max(255, t('equipment.form.nameTooLong', { max: 255 })),
        category: z
          .string()
          .trim()
          .max(128, t('equipment.form.categoryTooLong', { max: 128 })),
        notes: z
          .string()
          .trim()
          .max(2000, t('equipment.form.notesTooLong', { max: 2000 })),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      assetCode: equipment?.assetCode ?? '',
      name: equipment?.name ?? '',
      category: equipment?.category ?? '',
      notes: equipment?.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      assetCode: values.assetCode,
      name: values.name,
      category: values.category || null,
      notes: values.notes || null,
    };
    let saved: Equipment;
    onSubmittingChange?.(true);
    try {
      saved = equipment
        ? await updateEquipment(api, equipment.id, payload)
        : await createEquipment(api, payload);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 409 && apiError.code === 'ASSET_CODE_TAKEN') {
        form.setError(
          'assetCode',
          { message: t('equipment.form.assetCodeTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 422) {
        form.setError('root', { message: t('equipment.error.validation') });
      } else if (equipment && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', { message: t('equipment.error.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: equipment
        ? t('equipment.update.success', { name: saved.name })
        : t('equipment.create.success', { name: saved.name }),
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
          name='assetCode'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-asset-code`}>
                {t('equipment.fields.assetCode')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-asset-code`}
                autoComplete='off'
                placeholder={t('equipment.form.assetCodePlaceholder')}
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
                placeholder={t('equipment.form.namePlaceholder')}
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='category'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-category`}>
                {t('equipment.fields.category')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-category`}
                autoComplete='off'
                placeholder={t('equipment.form.categoryPlaceholder')}
                aria-invalid={fieldState.invalid}
              />
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
                placeholder={t('equipment.form.notesPlaceholder')}
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
