import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import { createOpportunity, updateOpportunity } from './api.js';
import { CustomerSelect } from './customer-select.js';
import { reportError } from './errors.js';
import { STAGE_ORDER } from './stage.js';
import type { Customer, Opportunity, OpportunityStage } from './types.js';

export interface OpportunityDialogProps {
  readonly open: boolean;
  readonly opportunity: Opportunity | null;
  readonly customers: readonly Customer[];
  /** Pre-selects the owner when creating from a customer's detail. */
  readonly defaultCustomerId?: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}

export function OpportunityDialog({
  open,
  opportunity,
  customers,
  defaultCustomerId,
  onOpenChange,
  onSaved,
}: OpportunityDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [name, setName] = useState(() => opportunity?.name ?? '');
  const [customerId, setCustomerId] = useState<number | null>(
    () => opportunity?.customerId ?? defaultCustomerId ?? null,
  );
  const [amount, setAmount] = useState(() => String(opportunity?.amount ?? 0));
  const [stage, setStage] = useState<OpportunityStage>(
    () => opportunity?.stage ?? 'following',
  );
  const [errors, setErrors] = useState<{
    name?: boolean;
    customer?: boolean;
    amount?: boolean;
  }>({});
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    const parsedAmount = Number(amount);
    const nextErrors = {
      name: name.trim().length === 0,
      customer: customerId === null,
      amount:
        amount.trim() === '' ||
        !Number.isFinite(parsedAmount) ||
        parsedAmount < 0,
    };
    setErrors(nextErrors);
    if (
      nextErrors.name ||
      nextErrors.customer ||
      nextErrors.amount ||
      customerId === null
    ) {
      return;
    }

    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        customerId,
        amount: parsedAmount,
        stage,
      };
      if (opportunity) {
        await updateOpportunity(api, opportunity.id, input);
      } else {
        await createOpportunity(api, input);
      }
      toast.add({
        type: 'success',
        title: t('crm.opportunities.saved', {
          defaultValue: 'Opportunity saved.',
        }),
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      reportError(
        error,
        t('crm.errors.saveFailed', { defaultValue: 'Save failed.' }),
      );
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void save();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {opportunity
                ? t('crm.opportunities.editTitle', {
                    defaultValue: 'Edit opportunity',
                  })
                : t('crm.opportunities.createTitle', {
                    defaultValue: 'New opportunity',
                  })}
            </DialogTitle>
            <DialogDescription>
              {t('crm.opportunities.formDescription', {
                defaultValue: 'Expected amount and current stage.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4 py-4'>
            <Field data-invalid={errors.name || undefined}>
              <FieldLabel htmlFor='opportunity-name'>
                {t('crm.fields.name', { defaultValue: 'Name' })}
              </FieldLabel>
              <Input
                id='opportunity-name'
                value={name}
                aria-invalid={errors.name || undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: false }));
                }}
              />
              {errors.name ? (
                <FieldError>
                  {t('crm.errors.nameRequired', {
                    defaultValue: 'Name is required.',
                  })}
                </FieldError>
              ) : null}
            </Field>
            <Field data-invalid={errors.customer || undefined}>
              <FieldLabel htmlFor='opportunity-customer'>
                {t('crm.fields.customer', { defaultValue: 'Customer' })}
              </FieldLabel>
              <CustomerSelect
                id='opportunity-customer'
                customers={customers}
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  setErrors((current) => ({ ...current, customer: false }));
                }}
              />
              {errors.customer ? (
                <FieldError>
                  {t('crm.errors.customerRequired', {
                    defaultValue: 'Customer is required.',
                  })}
                </FieldError>
              ) : null}
            </Field>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field data-invalid={errors.amount || undefined}>
                <FieldLabel htmlFor='opportunity-amount'>
                  {t('crm.fields.amount', { defaultValue: 'Amount' })}
                </FieldLabel>
                <Input
                  id='opportunity-amount'
                  type='number'
                  min={0}
                  step={0.01}
                  value={amount}
                  aria-invalid={errors.amount || undefined}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setErrors((current) => ({ ...current, amount: false }));
                  }}
                />
                {errors.amount ? (
                  <FieldError>
                    {t('crm.errors.amountInvalid', {
                      defaultValue: 'Enter an amount of zero or more.',
                    })}
                  </FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor='opportunity-stage'>
                  {t('crm.fields.stage', { defaultValue: 'Stage' })}
                </FieldLabel>
                <Select
                  value={stage}
                  onValueChange={(value) => setStage(value as OpportunityStage)}
                >
                  <SelectTrigger id='opportunity-stage' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_ORDER.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`crm.stage.${value}`, { defaultValue: value })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('crm.actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type='submit' disabled={saving}>
              {saving ? <Spinner data-icon='inline-start' /> : null}
              {t('crm.actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
