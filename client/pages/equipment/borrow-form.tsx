import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, CalendarIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { DatePicker } from '@/components/date-picker';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import { createBorrowRecord, listEquipment } from './api.js';
import { toDateFnsLocale } from './dates.js';
import type { BorrowRecord, Equipment } from './types.js';

/** The picked day is stored as the end of that local day, so "due today" is not overdue this morning. */
function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export interface BorrowFormProps {
  /** When borrowing from a ledger row, the equipment to preselect. Omit it to let the user pick. */
  readonly fixedEquipmentId?: number;
  /** The `<form>` id. When the submit button is outside the form, the button sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful borrow with the record the endpoint returned. The form already showed the success message. */
  readonly onSubmitted: (record: BorrowRecord) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes before `onSubmitted`. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * The borrow form: pick an available device, then the borrower, purpose and expected return date. Loads the available
 * equipment itself, so the options are fresh every time the dialog opens.
 */
export function BorrowForm({
  fixedEquipmentId,
  formId,
  onSubmitted,
  onSubmittingChange,
}: BorrowFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `borrow-form:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly equipment?: Equipment[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `borrow-form:${reloadCount}`;
    listEquipment(api, controller.signal).then(
      (equipment) => {
        if (!controller.signal.aborted) setResult({ key, equipment });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;

  if (loading) {
    return (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-5'
      >
        {['equipment', 'borrower', 'expectedReturnAt'].map((field) => (
          <div key={field} className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-8 w-full' />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('borrow.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  return (
    <BorrowFields
      formId={formId}
      equipment={result?.equipment ?? []}
      fixedEquipmentId={fixedEquipmentId}
      onSubmitted={onSubmitted}
      onSubmittingChange={onSubmittingChange}
    />
  );
}

function BorrowFields({
  formId,
  equipment,
  fixedEquipmentId,
  onSubmitted,
  onSubmittingChange,
}: {
  readonly formId: string;
  readonly equipment: Equipment[];
  readonly fixedEquipmentId?: number;
  readonly onSubmitted: (record: BorrowRecord) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const dateLocale = toDateFnsLocale(locale);

  const availableEquipment = useMemo(
    () => equipment.filter((item) => item.status === 'available'),
    [equipment],
  );
  const fixedEquipment =
    fixedEquipmentId === undefined
      ? undefined
      : equipment.find((item) => item.id === fixedEquipmentId);
  const fixedAvailable =
    fixedEquipment !== undefined && fixedEquipment.status === 'available';

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }, []);

  const schema = useMemo(
    () =>
      z.object({
        equipmentId: z.string().min(1, t('borrow.form.equipmentRequired')),
        borrower: z
          .string()
          .trim()
          .min(1, t('borrow.form.borrowerRequired'))
          .max(255, t('borrow.form.borrowerTooLong', { max: 255 })),
        purpose: z
          .string()
          .trim()
          .max(2000, t('borrow.form.purposeTooLong', { max: 2000 })),
        expectedReturnAt: z
          // The optional branch keeps the input type honest for an empty `DatePicker`, while the type-guard refine
          // makes the value required again — and restores `Date` as the output type.
          .union([z.date(), z.undefined()])
          .refine((value): value is Date => value instanceof Date, {
            message: t('borrow.form.expectedReturnRequired'),
          }),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      equipmentId: fixedAvailable ? String(fixedEquipmentId) : '',
      borrower: '',
      purpose: '',
      expectedReturnAt: undefined as Date | undefined,
    },
  });

  const items = useMemo(
    () =>
      availableEquipment.map((item) => ({
        value: String(item.id),
        label: `${item.assetCode} · ${item.name}`,
      })),
    [availableEquipment],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      equipmentId: Number(values.equipmentId),
      borrower: values.borrower,
      purpose: values.purpose || null,
      expectedReturnAt: endOfDay(values.expectedReturnAt).toISOString(),
    };
    let saved: BorrowRecord;
    onSubmittingChange?.(true);
    try {
      saved = await createBorrowRecord(api, payload);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (
        apiError?.status === 409 &&
        apiError.code === 'EQUIPMENT_UNAVAILABLE'
      ) {
        form.setError(
          'equipmentId',
          { message: t('borrow.form.equipmentUnavailable') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 422) {
        form.setError('root', { message: t('borrow.error.validation') });
      } else {
        form.setError('root', { message: t('borrow.error.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: t('borrow.create.success', {
        name: saved.equipment?.name ?? '',
      }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;
  const showUnavailableNotice =
    fixedEquipmentId !== undefined && !fixedAvailable;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError}</AlertDescription>
          </Alert>
        ) : null}
        {showUnavailableNotice ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>
              {t('borrow.form.fixedUnavailable')}
            </AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='equipmentId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-equipment`}>
                {t('borrow.fields.equipment')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={items}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-equipment`}
                  className='w-full'
                  disabled={fixedAvailable}
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue
                    placeholder={t('borrow.form.equipmentPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {items.length === 0 ? (
                <FieldDescription>
                  {t('borrow.form.noEquipmentAvailable')}
                </FieldDescription>
              ) : null}
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
                {t('borrow.fields.borrower')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-borrower`}
                autoComplete='off'
                placeholder={t('borrow.form.borrowerPlaceholder')}
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
                {t('borrow.fields.purpose')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-purpose`}
                rows={3}
                placeholder={t('borrow.form.purposePlaceholder')}
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
              <FieldLabel htmlFor={`${formId}-expected-return`}>
                {t('borrow.fields.expectedReturnAt')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <DatePicker
                id={`${formId}-expected-return`}
                className={cn(
                  'w-full',
                  fieldState.invalid &&
                    'border-destructive ring-3 ring-destructive/20',
                )}
                locale={dateLocale}
                placeholder={t('borrow.form.expectedReturnPlaceholder')}
                value={field.value}
                onChange={(date) => field.onChange(date)}
                calendarProps={{ disabled: { before: today } }}
              />
              <FieldDescription>
                {t('borrow.form.expectedReturnHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <p className='flex items-center gap-2 text-xs text-muted-foreground'>
          <CalendarIcon aria-hidden='true' className='size-3.5' />
          {t('borrow.form.recordedAutomatically')}
        </p>
      </FieldGroup>
    </form>
  );
}
