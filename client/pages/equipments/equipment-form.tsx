import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
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

import {
  EQUIPMENT_STATUSES,
  equipmentErrorMessageKey,
  isEquipmentCodeTaken,
  isEquipmentStatus,
  type Equipment,
  type EquipmentInput,
} from './api.js';

export interface EquipmentFormValues {
  readonly code: string;
  readonly name: string;
  readonly status: EquipmentInput['status'];
  readonly notes: string;
}

export interface EquipmentFormProps {
  /** Lets a button in the dialog footer submit this form. */
  readonly formId: string;
  readonly equipment?: Equipment;
  readonly onSubmit: (input: EquipmentInput) => Promise<void>;
}

/**
 * The one form for creating and editing a device. Its validation schema is rebuilt when the locale changes,
 * so a required-field message is in the language the person is reading, not the one the page opened in.
 */
export function EquipmentForm({
  formId,
  equipment,
  onSubmit,
}: EquipmentFormProps): ReactElement {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string>();
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .min(1, t('equipment.validation.codeRequired'))
          .max(64, t('equipment.validation.codeTooLong')),
        name: z
          .string()
          .trim()
          .min(1, t('equipment.validation.nameRequired'))
          .max(191, t('equipment.validation.nameTooLong')),
        status: z.enum(EQUIPMENT_STATUSES),
        notes: z.string().max(2000, t('equipment.validation.notesTooLong')),
      }),
    [t],
  );
  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: equipment?.code ?? '',
      name: equipment?.name ?? '',
      status: equipment?.status ?? 'available',
      notes: equipment?.notes ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const statusItems = useMemo(
    () =>
      EQUIPMENT_STATUSES.map((value) => ({
        value,
        label: t(`equipment.status.${value}`),
      })),
    [t],
  );

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    try {
      await onSubmit({
        code: values.code,
        name: values.name,
        status: values.status,
        notes: values.notes.trim() || null,
      });
    } catch (error) {
      // A duplicate code belongs under the code input, where it can be corrected.
      if (isEquipmentCodeTaken(error)) {
        form.setError('code', {
          type: 'server',
          message: t('equipment.errors.codeTaken'),
        });
        return;
      }
      setSubmitError(t(equipmentErrorMessageKey(error)));
    }
  });

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => void submit(event)}
      className='flex flex-col gap-5'
    >
      {submitError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('equipment.errors.saveFailed')}</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.code)}>
          <FieldLabel
            htmlFor='equipment-code'
            className="after:text-destructive after:content-['*']"
          >
            {t('equipment.fields.code')}
          </FieldLabel>
          <Input
            id='equipment-code'
            autoComplete='off'
            placeholder={t('equipment.form.codePlaceholder')}
            aria-invalid={Boolean(errors.code)}
            {...form.register('code')}
          />
          <FieldError errors={[errors.code]} />
        </Field>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel
            htmlFor='equipment-name'
            className="after:text-destructive after:content-['*']"
          >
            {t('equipment.fields.name')}
          </FieldLabel>
          <Input
            id='equipment-name'
            autoComplete='off'
            placeholder={t('equipment.form.namePlaceholder')}
            aria-invalid={Boolean(errors.name)}
            {...form.register('name')}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={Boolean(errors.status)}>
          <FieldLabel
            htmlFor='equipment-status'
            className="after:text-destructive after:content-['*']"
          >
            {t('equipment.fields.status')}
          </FieldLabel>
          <Controller
            control={form.control}
            name='status'
            render={({ field }) => (
              <Select
                items={statusItems}
                value={field.value}
                onValueChange={(value) => {
                  if (isEquipmentStatus(value ?? '')) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id='equipment-status'
                  className='w-full'
                  aria-invalid={Boolean(errors.status)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.status]} />
        </Field>
        <Field data-invalid={Boolean(errors.notes)}>
          <FieldLabel htmlFor='equipment-notes'>
            {t('equipment.fields.notes')}
          </FieldLabel>
          <Textarea
            id='equipment-notes'
            rows={4}
            maxLength={2000}
            placeholder={t('equipment.form.notesPlaceholder')}
            aria-invalid={Boolean(errors.notes)}
            {...form.register('notes')}
          />
          <FieldError errors={[errors.notes]} />
        </Field>
      </FieldGroup>
      {/* The visible submit control lives in the route dialog footer and points here through its `form` attribute. */}
      <button type='submit' hidden disabled={isSubmitting} />
    </form>
  );
}
