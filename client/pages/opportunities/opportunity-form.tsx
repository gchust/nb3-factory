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
import { toast } from '@/components/ui/toast';

import { createOpportunity, updateOpportunity } from '../sales/api.js';
import { CustomerSelect } from '../sales/customer-select.js';
import { STAGE_LABEL_KEYS } from '../sales/stage.js';
import { OPPORTUNITY_STAGES, type Opportunity } from '../sales/types.js';

export interface OpportunityFormProps {
  /** When editing, pass the latest record, just loaded; omit it when creating. */
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

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('sales.opportunities.form.nameRequired'))
          .max(120, t('sales.opportunities.form.nameTooLong', { max: 120 })),
        customerId: z
          .number()
          .optional()
          .refine((value) => typeof value === 'number' && value > 0, {
            message: t('sales.opportunities.form.customerRequired'),
          })
          .transform((value) => value as number),
        // Kept as text while editing so a cleared or half-typed value is validated, not silently coerced to 0.
        amount: z
          .string()
          .trim()
          .refine(
            (value) => value === '' || !Number.isNaN(Number(value)),
            t('sales.opportunities.form.amountInvalid'),
          )
          .refine(
            (value) => value === '' || Number(value) >= 0,
            t('sales.opportunities.form.amountNegative'),
          ),
        stage: z.enum(OPPORTUNITY_STAGES, {
          error: t('sales.opportunities.form.stageRequired'),
        }),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: opportunity?.name ?? '',
      customerId: opportunity?.customerId ?? undefined,
      amount: opportunity ? String(opportunity.amount) : '0',
      stage: opportunity?.stage ?? OPPORTUNITY_STAGES[0],
    },
  });

  const stageItems = OPPORTUNITY_STAGES.map((stage) => ({
    value: stage,
    label: t(STAGE_LABEL_KEYS[stage]),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      customerId: values.customerId,
      amount: values.amount === '' ? 0 : Number(values.amount),
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
      if (opportunity && apiError?.status === 404) {
        onNotFound?.();
      } else {
        form.setError('root', {
          message:
            apiError?.code === 'AMOUNT_NEGATIVE'
              ? t('sales.opportunities.form.amountNegative')
              : apiError?.status === 403
                ? t('sales.errorForbidden')
                : t('sales.errorRequestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toast.add({
      type: 'success',
      title: opportunity
        ? t('sales.opportunities.editSuccess', { name: saved.name })
        : t('sales.opportunities.createSuccess', { name: saved.name }),
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
                {t('sales.name')}
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
                {t('sales.customer')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <CustomerSelect
                id={`${formId}-customer`}
                value={field.value}
                onChange={(next) => field.onChange(next)}
                invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('sales.opportunities.form.customerHint')}
              </FieldDescription>
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
                {t('sales.amount')}
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
              <FieldDescription>
                {t('sales.opportunities.form.amountHint')}
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
                {t('sales.stage.label')}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={stageItems}
                value={field.value ?? null}
                onValueChange={(next: string | null) =>
                  field.onChange(next ?? OPPORTUNITY_STAGES[0])
                }
              >
                <SelectTrigger
                  id={`${formId}-stage`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
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
