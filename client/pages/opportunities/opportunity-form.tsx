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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';

import {
  createOpportunity,
  listCustomers,
  updateOpportunity,
} from '../crm/api.js';
import { OPPORTUNITY_STAGES, type Opportunity } from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';

export interface OpportunityFormProps {
  /** The latest record when editing; omitted when creating. */
  readonly opportunity?: Opportunity;
  /** The id the container links its submit button to. */
  readonly formId: string;
  readonly onSubmitted: (opportunity: Opportunity) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** Editing only: the endpoint answered 404, so the record is gone. */
  readonly onNotFound?: () => void;
}

/** One form for creating and editing an opportunity; the container owns the buttons. */
export function OpportunityForm({
  opportunity,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: OpportunityFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const customers = useApiData('crm:customer-options', (signal) =>
    listCustomers(api, signal),
  );

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.opportunity.form.nameRequired'))
          .max(200, t('crm.opportunity.form.nameTooLong', { max: 200 })),
        customerId: z
          .string()
          .min(1, t('crm.opportunity.form.customerRequired')),
        amount: z
          .string()
          .trim()
          .min(1, t('crm.opportunity.form.amountRequired'))
          .refine((value) => {
            const amount = Number(value);
            return Number.isFinite(amount) && amount >= 0;
          }, t('crm.opportunity.form.amountInvalid')),
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
    const json = {
      name: values.name,
      customerId: Number(values.customerId),
      amount: Number(values.amount),
      stage: values.stage,
    };
    let saved: Opportunity;
    onSubmittingChange?.(true);
    try {
      saved = opportunity
        ? await updateOpportunity(api, opportunity.id, json)
        : await createOpportunity(api, json);
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (opportunity && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('crm.error.forbidden')
              : apiError?.status === 400
                ? t('crm.error.invalidInput')
                : t('crm.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: opportunity
        ? t('crm.opportunity.edit.success', { name: saved.name })
        : t('crm.opportunity.create.success', { name: saved.name }),
    });
    onSubmitted(saved);
  });

  const rootError = form.formState.errors.root?.message;
  const customerItems = (customers.data ?? []).map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));
  const stageItems = OPPORTUNITY_STAGES.map((stage) => ({
    value: stage,
    label: t(`crm.stage.${stage}`),
  }));

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
              {customers.loading && !customers.data ? (
                <Skeleton className='h-9 w-full' />
              ) : (
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
                    aria-required='true'
                    aria-invalid={fieldState.invalid}
                    onBlur={field.onBlur}
                  >
                    <SelectValue
                      placeholder={t(
                        'crm.opportunity.form.customerPlaceholder',
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
              )}
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
