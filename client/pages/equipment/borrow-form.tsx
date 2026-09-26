import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { enUS, zhCN } from 'date-fns/locale';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';

import { borrowEquipment } from './api.js';

export interface BorrowFormProps {
  /** The device being borrowed; the borrow endpoint keys off its id. */
  readonly equipmentId: number;
  /** The `<form>` id; the dialog's submit button links to it with `form={formId}`. */
  readonly formId: string;
  /** Called after the loan is created. */
  readonly onSubmitted: () => void;
  /** `true` when submission starts, `false` when it ends; on success `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** The device no longer exists (404). */
  readonly onNotFound?: () => void;
  /** Another loan is still open on this device (409). */
  readonly onUnavailable?: () => void;
}

/** The borrow fields: borrower and expected return are required, purpose is optional. */
export function BorrowForm({
  equipmentId,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  onUnavailable,
}: BorrowFormProps): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const dateLocale = locale.startsWith('zh') ? zhCN : enUS;

  const schema = useMemo(
    () =>
      z.object({
        borrower: z
          .string()
          .trim()
          .min(1, t('equipment.form.borrowerRequired'))
          .max(128, t('equipment.form.tooLong', { max: 128 })),
        purpose: z
          .string()
          .trim()
          .max(500, t('equipment.form.tooLong', { max: 500 })),
        expectedReturnAt: z.date({
          error: t('equipment.form.expectedReturnRequired'),
        }),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      borrower: '',
      purpose: '',
      expectedReturnAt: undefined,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange?.(true);
    try {
      await borrowEquipment(api, equipmentId, values);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code === 'BORROWER_REQUIRED') {
        form.setError(
          'borrower',
          { message: t('equipment.form.borrowerRequired') },
          { shouldFocus: true },
        );
      } else if (apiError?.code === 'EXPECTED_RETURN_REQUIRED') {
        form.setError(
          'expectedReturnAt',
          { message: t('equipment.form.expectedReturnRequired') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 409) {
        // Someone else borrowed it first: let the caller explain and refresh the list.
        onUnavailable?.();
      } else if (apiError?.status === 404) {
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
    toast.success(t('equipment.borrow.success'));
    onSubmitted();
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
          name='expectedReturnAt'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-expectedReturnAt`}>
                {t('equipment.fields.expectedReturnAt')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <DatePicker
                id={`${formId}-expectedReturnAt`}
                className='w-full'
                locale={dateLocale}
                value={field.value}
                onChange={(date) => field.onChange(date)}
                placeholder={t('equipment.form.expectedReturnPlaceholder')}
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
