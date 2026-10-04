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

import {
  OPPORTUNITY_STAGES,
  isOpportunityStage,
  notifySalesDataChanged,
  salesErrorMessageKey,
  useCustomerOptions,
  type Opportunity,
} from '../shared';

export interface OpportunityFormProps {
  /** When editing, the latest record, just loaded; omit it when creating. */
  readonly opportunity?: Opportunity;
  /** The owning customer preselected when creating from a customer page. */
  readonly defaultCustomerId?: string;
  /** The `<form>` id; the footer's submit button is linked through it. */
  readonly formId: string;
  readonly onSubmitted: (opportunity: Opportunity) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  /** When editing, the endpoint returned 404: the record has been deleted. */
  readonly onNotFound?: () => void;
}

/** The opportunity form shared by the create dialog (from the list or from a customer page) and the edit dialog. */
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
  const toaster = useToaster();
  const { options: customerOptions, loading: customersLoading } =
    useCustomerOptions();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('sales.form.opportunityNameRequired'))
          .max(255, t('sales.form.nameTooLong', { max: 255 })),
        customerId: z
          .string()
          .min(1, t('sales.form.opportunityCustomerRequired')),
        amount: z
          .string()
          .trim()
          .min(1, t('sales.form.amountRequired'))
          // Only a non-negative amount, with at most two decimals; a minus sign fails this and is reported.
          .refine(
            (value) => /^\d+(\.\d{1,2})?$/.test(value),
            t('sales.form.amountInvalid'),
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
        : (defaultCustomerId ?? ''),
      amount: opportunity ? String(opportunity.amount) : '',
      stage: isOpportunityStage(opportunity?.stage)
        ? opportunity.stage
        : 'following_up',
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
      const result = opportunity
        ? await api.request<{ data: Opportunity }>({
            path: `sales/opportunities/${opportunity.id}`,
            method: 'PATCH',
            json,
          })
        : await api.request<{ data: Opportunity }>({
            path: 'sales/opportunities',
            method: 'POST',
            json,
          });
      saved = result.data;
    } catch (error: unknown) {
      if (
        opportunity &&
        error instanceof ApiClientError &&
        error.status === 404
      ) {
        onNotFound?.();
      } else {
        form.setError('root', { message: t(salesErrorMessageKey(error)) });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: opportunity
        ? t('sales.opportunity.updateSuccess', { name: saved.name })
        : t('sales.opportunity.createSuccess', { name: saved.name }),
    });
    // Every list and detail view reading the sales revision refetches, so the page behind the dialog shows the change.
    notifySalesDataChanged();
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
          name='customerId'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customer`}>
                {t('sales.opportunity.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                value={field.value === '' ? null : field.value}
                onValueChange={(value) => field.onChange(value ?? '')}
              >
                <SelectTrigger
                  id={`${formId}-customer`}
                  className='w-full'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customersLoading ? (
                <FieldDescription>{t('sales.status.loading')}</FieldDescription>
              ) : null}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name='name'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('sales.opportunity.name')}
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
        <div className='grid gap-4 sm:grid-cols-2'>
          <Controller
            control={form.control}
            name='amount'
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-amount`}>
                  {t('sales.opportunity.amount')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                </FieldLabel>
                <Input
                  {...field}
                  id={`${formId}-amount`}
                  inputMode='decimal'
                  autoComplete='off'
                  placeholder='0.00'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  {t('sales.form.amountHint')}
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
                  {t('sales.opportunity.stage')}
                </FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(
                      isOpportunityStage(value) ? value : 'following_up',
                    )
                  }
                >
                  <SelectTrigger
                    id={`${formId}-stage`}
                    className='w-full'
                    aria-invalid={fieldState.invalid}
                    onBlur={field.onBlur}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPPORTUNITY_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {t(`sales.stage.${stage}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>
      </FieldGroup>
    </form>
  );
}
