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

import { CustomerSelect } from './customer-select.js';
import { applyServerFieldErrors } from './form-errors.js';
import { stageLabelKey } from './stage.js';
import { OPPORTUNITY_STAGES, type Opportunity } from './types.js';

export interface OpportunityFormProps {
  readonly opportunity?: Opportunity;
  readonly formId: string;
  readonly onSubmitted: (opportunity: Opportunity) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  readonly onNotFound?: () => void;
}

interface OpportunityFormValues {
  name: string;
  customerId: number;
  amount: number;
  stage: (typeof OPPORTUNITY_STAGES)[number];
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
          .min(1, t('sales.form.nameRequired'))
          .max(128, t('sales.form.nameTooLong', { max: 128 })),
        customerId: z
          .number({ error: t('sales.form.customerRequired') })
          .int()
          .positive(),
        amount: z
          .number({ error: t('sales.form.amountRequired') })
          .min(0, t('sales.form.amountNegative')),
        stage: z.enum(OPPORTUNITY_STAGES),
      }),
    [t],
  );

  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: opportunity?.name ?? '',
      customerId: opportunity?.customerId,
      amount: opportunity?.amount ?? 0,
      stage: opportunity?.stage ?? 'following',
    },
  });

  const stageItems = OPPORTUNITY_STAGES.map((stage) => ({
    value: stage,
    label: t(stageLabelKey(stage)),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const json = {
      name: values.name,
      customerId: values.customerId,
      amount: values.amount,
      stage: values.stage,
    };
    onSubmittingChange?.(true);
    let saved: Opportunity;
    try {
      const result = opportunity
        ? await api.request<{ data: Opportunity }>({
            path: `opportunities/${opportunity.id}`,
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
      if (
        apiError?.status === 400 &&
        applyServerFieldErrors(form.setError, error)
      ) {
        return;
      }
      if (opportunity && apiError?.status === 404) {
        onNotFound?.();
        return;
      }
      form.setError('root', {
        message:
          apiError?.status === 403
            ? t('sales.error.forbidden')
            : t('sales.error.requestFailed'),
      });
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({
      type: 'success',
      title: opportunity
        ? t('sales.opportunities.edit.success', { name: saved.name })
        : t('sales.opportunities.new.success', { name: saved.name }),
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
                {t('sales.fields.name')}
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
                {t('sales.fields.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerSelect
                id={`${formId}-customer`}
                value={field.value}
                onChange={field.onChange}
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
                {t('sales.fields.amount')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  field.onChange(raw === '' ? undefined : Number(raw));
                }}
                id={`${formId}-amount`}
                type='number'
                min='0'
                step='0.01'
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
          name='stage'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-stage`}>
                {t('sales.fields.stage')}
              </FieldLabel>
              <Select
                items={stageItems}
                value={field.value}
                onValueChange={(next) => {
                  if (next) {
                    field.onChange(next);
                  }
                }}
              >
                <SelectTrigger
                  id={`${formId}-stage`}
                  ref={field.ref}
                  aria-invalid={fieldState.invalid}
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPPORTUNITY_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {t(stageLabelKey(stage))}
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
