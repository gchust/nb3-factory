import { zodResolver } from '@hookform/resolvers/zod';
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { CustomerPicker } from '../customer-picker.js';
import { classifySalesFailure } from '../form-failure.js';
import { OPPORTUNITY_STAGES, type Opportunity } from '../types.js';

export interface OpportunityFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly opportunity?: Opportunity;
  /** The `<form>` id. A submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. The form has already shown the message. */
  readonly onSubmitted: (opportunity: Opportunity) => void;
  /** Receives `true` when submission starts and `false` when it ends; on success, `false` comes first. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

export function OpportunityForm({
  opportunity,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: OpportunityFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .max(128, t('sales.opportunity.nameTooLong', { max: 128 })),
        customerId: z.string().min(1, t('sales.opportunity.customerRequired')),
        // The amount is a text field so that an empty box is distinguishable from zero: the endpoint takes a number
        // or nothing at all, and `Input type='number'` hands back a string either way.
        amount: z
          .string()
          .trim()
          .refine(
            (value) => {
              if (value === '') return true;
              const amount = Number(value);
              // At most two decimals, matching the column's scale, and within what the endpoint accepts.
              return (
                Number.isFinite(amount) &&
                amount >= 0 &&
                amount <= 999_999_999_999.99 &&
                Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6
              );
            },
            t('sales.opportunity.amountInvalid', { max: '999,999,999,999.99' }),
          ),
        stage: z.enum(OPPORTUNITY_STAGES),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: opportunity?.name ?? '',
      customerId: opportunity?.customerId ?? '',
      amount:
        opportunity?.amount === null || opportunity?.amount === undefined
          ? ''
          : String(opportunity.amount),
      stage: opportunity?.stage ?? 'following',
    },
  });

  const stageItems = OPPORTUNITY_STAGES.map((value) => ({
    value,
    label: t(`sales.stage.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name || null,
      customerId: values.customerId,
      amount: values.amount === '' ? null : Number(values.amount),
      stage: values.stage,
    };
    let saved: Opportunity;
    onSubmittingChange?.(true);
    try {
      const result = opportunity
        ? await api.request<{ data: Opportunity }>({
            path: `opportunities/${encodeURIComponent(opportunity.id)}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Opportunity }>({
            path: 'opportunities',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const failure = classifySalesFailure(error);
      if (failure.kind === 'reference') {
        form.setError(
          'customerId',
          { message: t('sales.opportunity.customerNotFound') },
          { shouldFocus: true },
        );
      } else if (failure.kind === 'sessionExpired') {
        form.setError('root', { type: 'sessionExpired' });
      } else if (failure.kind === 'notFound' && opportunity) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            failure.kind === 'forbidden'
              ? t('sales.error.forbidden')
              : t('sales.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: opportunity
        ? t('sales.opportunity.updated', {
            name: saved.name ?? t('sales.opportunity.unnamed'),
          })
        : t('sales.opportunity.created', {
            name: saved.name ?? t('sales.opportunity.unnamed'),
          }),
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
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('sales.opportunity.name')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-name`}
                autoComplete='off'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer`}>
                {t('sales.opportunity.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerPicker
                id={`${formId}-customer`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='amount'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-amount`}>
                {t('sales.opportunity.amount')}
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-amount`}
                type='number'
                min={0}
                step='0.01'
                inputMode='decimal'
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='stage'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-stage`}>
                {t('sales.opportunity.stage')}
              </FieldLabel>
              <Select
                items={stageItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-stage`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {stageItems.map((item) => (
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
      </FieldGroup>
    </form>
  );
}
