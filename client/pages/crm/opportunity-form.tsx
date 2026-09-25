import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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

import { validationField } from './api-error.js';
import { OPPORTUNITY_STAGES, type Opportunity } from './types.js';
import { useCustomers } from './use-customers.js';

const NAME_MAX = 160;
const AMOUNT_MAX = 999999999999.99;

export interface OpportunityFormProps {
  /** When editing, the latest record; omit it when creating. */
  readonly opportunity?: Opportunity;
  /** For an opportunity created from a customer's detail view: preselect that customer. */
  readonly defaultCustomerId?: number;
  readonly formId: string;
  readonly onSubmitted: (opportunity: Opportunity) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  readonly onNotFound?: () => void;
}

/** One form for creating (`POST`) and editing (`PATCH`) an opportunity. */
export function OpportunityForm({
  opportunity,
  defaultCustomerId,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
}: OpportunityFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { customers, error: customersError } = useCustomers();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.form.nameRequired'))
          .max(NAME_MAX, t('crm.form.nameTooLong', { max: NAME_MAX })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
        amount: z
          .string()
          .trim()
          .refine((value) => {
            if (value === '') return true;
            const amount = Number(value);
            return Number.isFinite(amount) && amount >= 0;
          }, t('crm.form.amountInvalid'))
          .refine(
            (value) => value === '' || Number(value) <= AMOUNT_MAX,
            t('crm.form.amountTooLarge'),
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
      customerId: opportunity
        ? String(opportunity.customerId)
        : defaultCustomerId !== undefined
          ? String(defaultCustomerId)
          : '',
      amount: opportunity ? String(opportunity.amount) : '',
      stage: opportunity?.stage ?? 'following',
    },
  });

  const customerItems = useMemo(
    () =>
      (customers ?? []).map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers],
  );
  const stageItems = OPPORTUNITY_STAGES.map((value) => ({
    value,
    label: t(`crm.stages.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      customerId: Number(values.customerId),
      amount: values.amount === '' ? 0 : Number(values.amount),
      stage: values.stage,
    };
    let saved: Opportunity;
    onSubmittingChange?.(true);
    try {
      const result = opportunity
        ? await api.request<{ data: Opportunity }>({
            path: `crm/opportunities/${opportunity.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Opportunity }>({
            path: 'crm/opportunities',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      const field = apiError ? validationField(apiError) : undefined;
      if (opportunity && apiError?.status === 404) {
        onNotFound?.();
      } else if (
        field === 'name' ||
        field === 'customerId' ||
        field === 'amount' ||
        field === 'stage'
      ) {
        form.setError(
          field,
          { message: t('crm.form.invalid') },
          { shouldFocus: true },
        );
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
    toast.success(
      opportunity
        ? t('crm.opportunities.edit.success', { name: saved.name })
        : t('crm.opportunities.create.success', { name: saved.name }),
    );
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
              <FieldLabel htmlFor={`${formId}-customerId`}>
                {t('crm.opportunities.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={customerItems}
                value={field.value}
                disabled={customerItems.length === 0}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
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
              {customersError ? (
                <FieldDescription>
                  {t('crm.error.requestFailed')}
                </FieldDescription>
              ) : customers !== undefined && customerItems.length === 0 ? (
                <FieldDescription>
                  {t('crm.form.customersEmpty')}
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
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-amount`}
                type='number'
                min='0'
                step='0.01'
                inputMode='decimal'
                autoComplete='off'
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
                {t('crm.opportunities.fields.stage')}
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
