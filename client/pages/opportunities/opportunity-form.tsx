import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createOpportunity,
  updateOpportunity,
  validationField,
} from '@/components/crm/crm-api.js';
import {
  OPPORTUNITY_STAGES,
  type Opportunity,
} from '@/components/crm/types.js';
import { useCustomerOptions } from '@/components/crm/use-customer-options.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

export interface OpportunityFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly opportunity?: Opportunity;
  /** The `<form>` id; the container links its submit button through it. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (opportunity: Opportunity) => void;
  /** Receives `true` when submission starts and `false` when it ends. */
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  const {
    customers,
    loading: customersLoading,
    error: customersError,
  } = useCustomerOptions();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.form.nameRequired'))
          .max(128, t('crm.form.nameTooLong', { max: 128 })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
        amount: z
          .string()
          .trim()
          .min(1, t('crm.form.amountRequired'))
          .refine(
            (value) => Number.isFinite(Number(value)),
            t('crm.form.amountInvalid'),
          )
          .refine((value) => Number(value) >= 0, t('crm.form.amountNegative')),
        stage: z.enum(OPPORTUNITY_STAGES),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: opportunity?.name ?? '',
      customerId: opportunity ? String(opportunity.customerId) : '',
      amount: opportunity ? String(opportunity.amount) : '',
      stage: opportunity?.stage ?? 'following',
    },
  });

  const customerItems = customers.map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));
  const stageItems = OPPORTUNITY_STAGES.map((stage) => ({
    value: stage,
    label: t(`crm.stage.${stage}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      customerId: Number(values.customerId),
      amount: round2(Number(values.amount)),
      stage: values.stage,
    };
    let saved: Opportunity;
    onSubmittingChange?.(true);
    try {
      saved = opportunity
        ? await updateOpportunity(api, opportunity.id, input)
        : await createOpportunity(api, input);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      const field = validationField(error);
      if (
        field === 'name' ||
        field === 'customerId' ||
        field === 'amount' ||
        field === 'stage'
      ) {
        form.setError(
          field,
          { message: t('crm.error.validation') },
          {
            shouldFocus: true,
          },
        );
      } else if (opportunity && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('crm.error.forbidden')
              : t('crm.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: opportunity
        ? t('crm.opportunity.editSuccess', { name: saved.name })
        : t('crm.opportunity.createSuccess', { name: saved.name }),
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
        {customersError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{t('crm.error.optionsFailed')}</AlertDescription>
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
              <FieldLabel htmlFor={`${formId}-customerId`}>
                {t('crm.customer.fields.single')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={customerItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
                disabled={customersLoading}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-customerId`}
                  className='w-full'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customerItems.map((item) => (
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
                inputMode='decimal'
                min={0}
                step='0.01'
                autoComplete='off'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('crm.opportunity.fields.amountHint')}
              </FieldDescription>
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
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
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
                  aria-required='true'
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
