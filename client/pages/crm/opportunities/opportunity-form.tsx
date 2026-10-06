import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
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
import { OPPORTUNITY_STAGES, type Opportunity } from '../types.js';

export interface OpportunityFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
  readonly opportunity?: Opportunity;
  /** The `<form>` id. The submit button outside the form sets `form={formId}`. */
  readonly formId: string;
  /** Called after a successful save with the record the endpoint returned. */
  readonly onSubmitted: (opportunity: Opportunity) => void;
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
          .min(1, t('opportunities.form.nameRequired'))
          .max(160, t('opportunities.form.nameTooLong', { max: 160 })),
        customerId: z.string().min(1, t('crm.form.customerRequired')),
        // Kept as a string so the field stays controlled and the raw text is what the schema rejects; submit converts it.
        amount: z
          .string()
          .trim()
          .min(1, t('opportunities.form.amountRequired'))
          .refine(
            (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
            { message: t('opportunities.form.amountInvalid') },
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
      amount: opportunity ? String(opportunity.amount) : '0',
      stage: opportunity?.stage ?? OPPORTUNITY_STAGES[0],
    },
  });

  const stageItems = OPPORTUNITY_STAGES.map((value) => ({
    value,
    label: t(`opportunities.stage.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      customerId: values.customerId,
      amount: Number(values.amount),
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
      const apiError = error instanceof ApiClientError ? error : undefined;
      if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else if (opportunity && apiError?.status === 404) {
        onNotFound?.();
      } else if (
        apiError?.status === 400 &&
        apiError.reason === 'INVALID_CUSTOMER_REFERENCE'
      ) {
        form.setError(
          'customerId',
          { message: t('crm.form.customerMissing') },
          { shouldFocus: true },
        );
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
        ? t('opportunities.edit.success', { name: saved.name })
        : t('opportunities.create.success', { name: saved.name }),
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
                {t('opportunities.fields.name')}
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
                {t('opportunities.fields.customer')}
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
                {t('opportunities.fields.amount')}
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
                {t('opportunities.fields.stage')}
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
