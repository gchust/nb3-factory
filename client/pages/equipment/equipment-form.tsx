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
import type { EquipmentFormValues, EquipmentItem } from './types.js';

export interface EquipmentFormProps {
  /** When editing, the record shown in the ledger; omit it when creating. */
  readonly equipment?: EquipmentItem;
  /** The `<form>` id, also the prefix of the field ids. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (equipment: EquipmentItem) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

const MAX_ASSET_NO = 64;
const MAX_NAME = 128;
const MAX_CATEGORY = 64;
const MAX_NOTES = 1000;

/**
 * One form for adding and editing equipment. The schema is built inside the
 * component so its messages follow the current language.
 */
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
          .max(
            MAX_ASSET_NO,
            t('equipment.form.assetNoTooLong', { max: MAX_ASSET_NO }),
          ),
        name: z
          .string()
          .trim()
          .min(1, t('equipment.form.nameRequired'))
          .max(MAX_NAME, t('equipment.form.nameTooLong', { max: MAX_NAME })),
        category: z
          .string()
          .trim()
          .min(1, t('equipment.form.categoryRequired'))
          .max(
            MAX_CATEGORY,
            t('equipment.form.categoryTooLong', { max: MAX_CATEGORY }),
          ),
        notes: z
          .string()
          .trim()
          .max(MAX_NOTES, t('equipment.form.notesTooLong', { max: MAX_NOTES })),
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
    const json: EquipmentFormValues = {
      assetNo: values.assetNo,
      name: values.name,
      category: values.category,
      notes: values.notes || null,
    };
    let saved: EquipmentItem;
    onSubmittingChange?.(true);
    try {
      const record = equipment
        ? await updateEquipment(api, equipment.id, json)
        : await createEquipment(api, json);
      saved = {
        ...record,
        status: equipment?.status ?? 'available',
        activeLoan: equipment?.activeLoan ?? null,
      };
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 409 && apiError.code === 'ASSET_NO_TAKEN') {
        form.setError(
          'assetNo',
          { message: t('equipment.form.assetNoTaken') },
          { shouldFocus: true },
        );
      } else if (equipment && apiError?.status === 404) {
        onNotFound?.();
      } else {
        const field =
          apiError?.status === 422
            ? readErrorField(apiError.payload)
            : undefined;
        if (field && field in form.getValues()) {
          form.setError(field as keyof EquipmentFormValues, {
            message: t('equipment.error.validation'),
          });
        } else {
          form.setError('root', {
            message:
              apiError?.status === 403
                ? t('equipment.error.forbidden')
                : t('equipment.error.requestFailed'),
          });
        }
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: equipment
        ? t('equipment.edit.success', { name: saved.name })
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
          name='assetNo'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-asset-no`}>
                {t('equipment.fields.assetNo')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-asset-no`}
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
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-category`}
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

function readErrorField(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const field = (payload as { field?: unknown }).field;
  return typeof field === 'string' ? field : undefined;
}
