import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { DatePicker } from '@/components/date-picker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import { borrowEquipment } from './api.js';
import type { EquipmentItem, LoanRecord } from './types.js';

export interface BorrowFormProps {
  /** The equipment that can be lent right now; the select lists these. */
  readonly options: readonly EquipmentItem[];
  /** Pre-selected equipment when the form is opened from the ledger row. */
  readonly equipmentId?: number;
  readonly formId: string;
  readonly onSubmitted: (loan: LoanRecord) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The chosen equipment no longer exists (404); the caller refreshes the list. */
  readonly onGone?: () => void;
}

const MAX_BORROWER = 128;
const MAX_PURPOSE = 500;

/**
 * Borrow form: pick an available device, then record the borrower, the purpose
 * and the expected return date. The borrow time is set by the server.
 */
export function BorrowForm({
  options,
  equipmentId,
  formId,
  onSubmitted,
  onSubmittingChange,
  onGone,
}: BorrowFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const schema = useMemo(
    () =>
      z
        .object({
          equipmentId: z.string().min(1, t('equipment.form.equipmentRequired')),
          borrower: z
            .string()
            .trim()
            .min(1, t('equipment.form.borrowerRequired'))
            .max(
              MAX_BORROWER,
              t('equipment.form.borrowerTooLong', { max: MAX_BORROWER }),
            ),
          purpose: z
            .string()
            .trim()
            .max(
              MAX_PURPOSE,
              t('equipment.form.purposeTooLong', { max: MAX_PURPOSE }),
            ),
          dueAt: z.date().optional(),
        })
        .refine((values) => values.dueAt !== undefined, {
          message: t('equipment.form.dueAtRequired'),
          path: ['dueAt'],
        }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      equipmentId: equipmentId ? String(equipmentId) : '',
      borrower: '',
      purpose: '',
      dueAt: undefined,
    },
  });

  const equipmentItems = options.map((item) => ({
    value: String(item.id),
    label: `${item.assetNo} · ${item.name}`,
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const dueAt = values.dueAt;
    if (!dueAt) {
      // The schema refine already reports this; this only narrows the type.
      form.setError('dueAt', { message: t('equipment.form.dueAtRequired') });
      return;
    }
    let saved: LoanRecord;
    onSubmittingChange?.(true);
    try {
      saved = await borrowEquipment(api, Number(values.equipmentId), {
        borrower: values.borrower,
        purpose: values.purpose || null,
        dueAt: dueAt.toISOString(),
      });
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (
        apiError?.status === 409 &&
        apiError.code === 'EQUIPMENT_ALREADY_BORROWED'
      ) {
        form.setError(
          'equipmentId',
          { message: t('equipment.borrow.alreadyBorrowed') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 404) {
        onGone?.();
      } else if (apiError?.status === 422) {
        const field = readErrorField(apiError.payload);
        if (field === 'borrower' || field === 'purpose' || field === 'dueAt') {
          form.setError(field, { message: t('equipment.error.validation') });
        } else {
          form.setError('root', { message: t('equipment.error.validation') });
        }
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
    toast.add({
      type: 'success',
      title: t('equipment.borrow.success', { name: saved.borrower }),
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
          name='equipmentId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-equipment`}>
                {t('equipment.fields.equipment')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={equipmentItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-equipment`}
                  className='w-full'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue
                    placeholder={t('equipment.form.selectEquipment')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {equipmentItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='borrower'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-borrower`}>
                {t('equipment.fields.borrower')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-borrower`}
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
          name='purpose'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-purpose`}>
                {t('equipment.fields.purpose')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-purpose`}
                rows={2}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='dueAt'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-due-at`}>
                {t('equipment.fields.dueAt')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <DatePicker
                id={`${formId}-due-at`}
                className='w-full'
                value={field.value}
                onChange={field.onChange}
                placeholder={t('equipment.form.dueAtPlaceholder')}
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
