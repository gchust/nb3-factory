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

import { createOpportunity, listCustomers, updateOpportunity } from '../api.js';
import { OPPORTUNITY_STAGES, type Opportunity } from '../types.js';
import { useResource } from '../use-resource.js';

export interface OpportunityFormProps {
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
  const customers = useResource('opportunity-form-customers', () =>
    listCustomers(api),
  );

  const customerItems = useMemo(
    () =>
      (customers.data ?? []).map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers.data],
  );

  const stageItems = useMemo(
    () =>
      OPPORTUNITY_STAGES.map((stage) => ({
        value: stage,
        label: t(`crm.stage.${stage}`),
      })),
    [t],
  );

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.opportunities.form.nameRequired'))
          .max(160, t('crm.opportunities.form.nameTooLong', { max: 160 })),
        customerId: z
          .string()
          .min(1, t('crm.opportunities.form.customerRequired')),
        amount: z
          .string()
          .trim()
          .min(1, t('crm.opportunities.form.amountRequired'))
          .refine(
            (value) => Number.isFinite(Number(value)),
            t('crm.opportunities.form.amountInvalid'),
          )
          .refine(
            (value) => Number(value) >= 0,
            t('crm.opportunities.form.amountNegative'),
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
      customerId: opportunity ? String(opportunity.customerId) : '',
      amount: opportunity ? String(opportunity.amount) : '',
      stage: opportunity?.stage ?? 'following',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      customerId: Number(values.customerId),
      amount: Number(values.amount),
      stage: values.stage,
    };

    let saved: Opportunity;
    onSubmittingChange?.(true);
    try {
      saved = opportunity
        ? await updateOpportunity(api, opportunity.id, payload)
        : await createOpportunity(api, payload);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (opportunity && apiError?.status === 404) {
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
        ? t('crm.opportunities.edit.success', { name: saved.name })
        : t('crm.opportunities.create.success', { name: saved.name }),
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
                {t('crm.opportunities.fields.name')}
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
                {t('crm.opportunities.fields.customer')}
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
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-customer`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue
                    placeholder={t(
                      'crm.opportunities.form.customerPlaceholder',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {customerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerItems.length === 0 && !customers.loading ? (
                <FieldDescription>
                  {t('crm.opportunities.form.noCustomers')}
                </FieldDescription>
              ) : null}
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
                {t('crm.opportunities.fields.amount')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-amount`}
                type='number'
                min={0}
                step='0.01'
                autoComplete='off'
                aria-required='true'
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('crm.opportunities.form.amountHint')}
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
                {t('crm.opportunities.fields.stage')}
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
