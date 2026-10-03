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

import { createOpportunity, errorFieldOf, updateOpportunity } from './api.js';
import { CRM_STAGES, type Opportunity } from './types.js';
import { useCustomerOptions } from './use-customer-options.js';

export interface OpportunityFormProps {
  readonly opportunity?: Opportunity;
  readonly formId: string;
  readonly onSubmitted: (opportunity: Opportunity) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  readonly onNotFound?: () => void;
  /** Preselects the customer when creating an opportunity from a customer's detail. */
  readonly defaultCustomerId?: number;
}

const AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

/** The create and edit form for an opportunity: name, customer, amount and stage. */
export function OpportunityForm({
  opportunity,
  formId,
  onSubmitted,
  onSubmittingChange,
  onNotFound,
  defaultCustomerId,
}: OpportunityFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { customers, loading: customersLoading } = useCustomerOptions();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('crm.form.nameRequired'))
          .max(255, t('crm.form.nameTooLong', { max: 255 })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
        amount: z
          .string()
          .trim()
          .min(1, t('crm.form.amountRequired'))
          .refine(
            (value) =>
              AMOUNT_PATTERN.test(value) && Number.isFinite(Number(value)),
            t('crm.form.amountInvalid'),
          ),
        stage: z.enum(CRM_STAGES),
      }),
    [t],
  );

  const initialCustomerId = opportunity?.customerId ?? defaultCustomerId;
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: opportunity?.name ?? '',
      customerId:
        initialCustomerId === undefined ? '' : String(initialCustomerId),
      amount: opportunity === undefined ? '' : String(opportunity.amount),
      stage: opportunity?.stage ?? 'follow_up',
    },
  });

  const customerItems = useMemo(
    () =>
      customers.map((customer) => ({
        value: String(customer.id),
        label: customer.name,
      })),
    [customers],
  );

  const stageItems = useMemo(
    () => [
      { value: 'follow_up', label: t('crm.stage.follow_up') },
      { value: 'won', label: t('crm.stage.won') },
      { value: 'lost', label: t('crm.stage.lost') },
    ],
    [t],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    onSubmittingChange?.(true);
    let saved: Opportunity;
    try {
      const changes = {
        name: values.name,
        customerId: Number(values.customerId),
        amount: Number(values.amount),
        stage: values.stage,
      };
      saved = opportunity
        ? await updateOpportunity(api, opportunity.id, changes)
        : await createOpportunity(api, changes);
    } catch (error: unknown) {
      const field = errorFieldOf(error);
      if (field === 'name') {
        form.setError(
          'name',
          { message: t('crm.form.nameRequired') },
          { shouldFocus: true },
        );
      } else if (field === 'customerId') {
        form.setError(
          'customerId',
          { message: t('crm.form.customerRequired') },
          { shouldFocus: true },
        );
      } else if (field === 'amount') {
        form.setError(
          'amount',
          { message: t('crm.form.amountInvalid') },
          { shouldFocus: true },
        );
      } else if (field === 'stage') {
        form.setError(
          'stage',
          { message: t('crm.form.stageInvalid') },
          { shouldFocus: true },
        );
      } else if (
        opportunity &&
        error instanceof ApiClientError &&
        error.status === 404
      ) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            error instanceof ApiClientError && error.status === 403
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
        {!customersLoading && customers.length === 0 ? (
          <Alert>
            <AlertCircleIcon />
            <AlertDescription>{t('crm.form.noCustomers')}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('crm.fields.name')}
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
                {t('crm.fields.customer')}
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
                {t('crm.fields.amount')}
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
                {t('crm.fields.stage')}
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
