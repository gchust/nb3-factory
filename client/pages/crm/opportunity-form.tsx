import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createOpportunity, updateOpportunity } from './api.js';
import { CustomerSelect } from './customer-select.js';
import { OPPORTUNITY_STAGES, type Opportunity } from './types.js';

export interface OpportunityFormProps {
  /** When editing, pass the latest record; omit it when creating. */
  readonly opportunity?: Opportunity;
  readonly formId: string;
  readonly onSubmitted: (opportunity: Opportunity) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
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
          .min(1, t('crm.opportunity.form.nameRequired'))
          .max(128, t('crm.opportunity.form.nameTooLong')),
        customerId: z
          .number({ error: t('crm.opportunity.form.customerRequired') })
          .int()
          .positive(t('crm.opportunity.form.customerRequired')),
        // Kept as text so the field's input and output types match; converted on submit.
        amount: z
          .string()
          .trim()
          .min(1, t('crm.opportunity.form.amountRequired'))
          .refine(
            (value) =>
              value !== '' &&
              Number.isFinite(Number(value)) &&
              Number(value) >= 0,
            { message: t('crm.opportunity.form.amountInvalid') },
          ),
        stage: z.enum(OPPORTUNITY_STAGES),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: opportunity?.name ?? '',
      customerId: opportunity?.customerId ?? 0,
      amount: opportunity ? String(opportunity.amount) : '',
      stage: opportunity?.stage ?? ('following' as const),
    },
  });

  const stageItems = OPPORTUNITY_STAGES.map((value) => ({
    value,
    label: t(`crm.stage.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const changes = {
      name: values.name,
      customerId: values.customerId,
      amount: Number(values.amount),
      stage: values.stage,
    };
    let saved: Opportunity;
    onSubmittingChange?.(true);
    try {
      saved = opportunity
        ? await updateOpportunity(api, opportunity.id, changes)
        : await createOpportunity(api, changes);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.code === 'NAME_TAKEN') {
        form.setError(
          'name',
          { message: t('crm.opportunity.form.nameTaken') },
          { shouldFocus: true },
        );
      } else if (apiError?.code === 'AMOUNT_INVALID') {
        form.setError(
          'amount',
          { message: t('crm.opportunity.form.amountInvalid') },
          { shouldFocus: true },
        );
      } else if (apiError?.code === 'STAGE_INVALID') {
        form.setError(
          'stage',
          { message: t('crm.opportunity.form.stageRequired') },
          { shouldFocus: true },
        );
      } else if (
        apiError?.code === 'CUSTOMER_REQUIRED' ||
        apiError?.code === 'CUSTOMER_NOT_FOUND'
      ) {
        form.setError(
          'customerId',
          { message: t('crm.opportunity.form.customerRequired') },
          { shouldFocus: true },
        );
      } else if (opportunity && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', { message: t('crm.error.requestFailed') });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: opportunity
        ? t('crm.opportunity.edit.success', { name: saved.name })
        : t('crm.opportunity.create.success', { name: saved.name }),
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
                {t('crm.opportunity.fields.name')}
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
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer`}>
                {t('crm.opportunity.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerSelect
                id={`${formId}-customer`}
                ref={field.ref}
                value={field.value > 0 ? field.value : null}
                onChange={(value) => field.onChange(value)}
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
                {t('crm.opportunity.fields.amount')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-amount`}
                type='number'
                min='0'
                step='0.01'
                inputMode='decimal'
                aria-required='true'
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
                {t('crm.opportunity.fields.stage')}
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
                  {stageItems.map((item) => (
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
      </FieldGroup>
    </form>
  );
}
