import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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

import { createEquipment, updateEquipment } from './api.js';
import type { Equipment } from './types.js';

export interface EquipmentFormProps {
  /** When editing, the loaded record; omit it when creating. */
  readonly equipment?: Equipment;
  /** The `<form>` id; the container's submit button links to it with `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (equipment: Equipment) => void;
  /** `true` when submission starts, `false` when it ends; on success `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The edit endpoint returned 404, so the record no longer exists. */
  readonly onNotFound?: () => void;
}

/** One form for creating and editing a device; the container owns the title and the buttons. */
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
        assetNo: z
          .string()
          .trim()
          .min(1, t('equipment.form.assetNoRequired'))
          .max(64, t('equipment.form.tooLong', { max: 64 })),
        name: z
          .string()
          .trim()
          .min(1, t('equipment.form.nameRequired'))
          .max(128, t('equipment.form.tooLong', { max: 128 })),
        category: z
          .string()
          .trim()
          .max(64, t('equipment.form.tooLong', { max: 64 })),
        notes: z.string().trim(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      assetNo: equipment?.assetNo ?? '',
      name: equipment?.name ?? '',
      category: equipment?.category ?? '',
      notes: equipment?.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    let saved: Equipment;
    onSubmittingChange?.(true);
    try {
      saved = equipment
        ? await updateEquipment(api, equipment.id, values)
        : await createEquipment(api, values);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code === 'ASSET_NO_TAKEN') {
        form.setError(
          'assetNo',
          { message: t('equipment.form.assetNoTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.code === 'ASSET_NO_REQUIRED') {
        form.setError(
          'assetNo',
          { message: t('equipment.form.assetNoRequired') },
          { shouldFocus: true },
        );
      } else if (apiError?.code === 'NAME_REQUIRED') {
        form.setError(
          'name',
          { message: t('equipment.form.nameRequired') },
          { shouldFocus: true },
        );
      } else if (equipment && apiError?.status === 404) {
        onNotFound?.();
      } else {
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
    toast.success(
      equipment
        ? t('equipment.form.saved', { name: saved.name })
        : t('equipment.form.created', { name: saved.name }),
    );
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
          name='assetNo'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-assetNo`}>
                {t('equipment.fields.assetNo')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-assetNo`}
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
