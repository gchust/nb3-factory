import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  OPPORTUNITY_STAGES,
  toDate,
  toNumber,
  useCrmApi,
  type Customer,
  type Opportunity,
} from './api';
import { CrmErrorText, useCrmError } from './feedback';
import { FieldRow, SelectField, type SelectOption } from './fields';

interface FormState {
  name: string;
  customerId: string;
  amount: string;
  stage: string;
  expectedCloseDate: string;
  wonAmount: string;
  lostReason: string;
}

function dateInput(value: Opportunity['expectedCloseDate']): string {
  const date = toDate(value);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function initial(
  opportunity: Opportunity | undefined,
  customerId: number | undefined,
): FormState {
  return {
    name: opportunity?.name ?? '',
    customerId: String(customerId ?? opportunity?.customerId ?? ''),
    amount:
      toNumber(opportunity?.amount) === null
        ? ''
        : String(toNumber(opportunity?.amount)),
    stage: opportunity?.stage ?? 'lead',
    expectedCloseDate: dateInput(opportunity?.expectedCloseDate ?? null),
    wonAmount:
      toNumber(opportunity?.wonAmount) === null
        ? ''
        : String(toNumber(opportunity?.wonAmount)),
    lostReason: opportunity?.lostReason ?? '',
  };
}

export function OpportunityFormDialog({
  open,
  onOpenChange,
  customerId,
  customers,
  opportunity,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: number;
  customers?: readonly Customer[];
  opportunity?: Opportunity;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [form, setForm] = useState<FormState>(() =>
    initial(opportunity, customerId),
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const stageOptions: SelectOption[] = OPPORTUNITY_STAGES.map((value) => ({
    value,
    label: t(`crm.stage.${value}`),
  }));
  const customerOptions: SelectOption[] = (customers ?? []).map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const resolvedCustomerId = customerId ?? Number(form.customerId);
      const payload = {
        name: form.name,
        customerId: resolvedCustomerId,
        amount: form.amount === '' ? null : Number(form.amount),
        stage: form.stage,
        expectedCloseDate: form.expectedCloseDate || null,
        wonAmount: form.wonAmount === '' ? null : Number(form.wonAmount),
        lostReason: form.lostReason || null,
      };
      if (opportunity) {
        await api.updateOpportunity(opportunity.id, payload);
      } else {
        await api.createOpportunity(payload);
      }
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setError(errorFor(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {opportunity
              ? t('crm.opportunities.editTitle')
              : t('crm.opportunities.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('crm.opportunities.stageRuleHint')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='opportunity-name'>
              {t('crm.opportunities.name')}
            </Label>
            <Input
              id='opportunity-name'
              required
              value={form.name}
              onChange={(event) =>
                setForm((state) => ({ ...state, name: event.target.value }))
              }
            />
          </div>
          {customerId === undefined ? (
            <SelectField
              id='opportunity-customer'
              label={t('crm.opportunities.customer')}
              value={form.customerId}
              onChange={(value) =>
                setForm((state) => ({ ...state, customerId: value }))
              }
              options={customerOptions}
              placeholder={t('crm.opportunities.selectCustomer')}
              required
            />
          ) : null}
          <FieldRow>
            <div className='space-y-2'>
              <Label htmlFor='opportunity-amount'>
                {t('crm.opportunities.amount')}
              </Label>
              <Input
                id='opportunity-amount'
                inputMode='decimal'
                type='number'
                step='0.01'
                value={form.amount}
                onChange={(event) =>
                  setForm((state) => ({ ...state, amount: event.target.value }))
                }
              />
            </div>
            <SelectField
              id='opportunity-stage'
              label={t('crm.opportunities.stage')}
              value={form.stage}
              onChange={(value) =>
                setForm((state) => ({ ...state, stage: value }))
              }
              options={stageOptions}
              required
            />
          </FieldRow>
          <div className='space-y-2'>
            <Label htmlFor='opportunity-date'>
              {t('crm.opportunities.expectedCloseDate')}
            </Label>
            <Input
              id='opportunity-date'
              type='date'
              value={form.expectedCloseDate}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  expectedCloseDate: event.target.value,
                }))
              }
            />
          </div>
          {form.stage === 'won' ? (
            <div className='space-y-2'>
              <Label htmlFor='opportunity-won'>
                {t('crm.opportunities.wonAmount')}
              </Label>
              <Input
                id='opportunity-won'
                inputMode='decimal'
                type='number'
                step='0.01'
                required
                value={form.wonAmount}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    wonAmount: event.target.value,
                  }))
                }
              />
            </div>
          ) : null}
          {form.stage === 'lost' ? (
            <div className='space-y-2'>
              <Label htmlFor='opportunity-lost'>
                {t('crm.opportunities.lostReason')}
              </Label>
              <Textarea
                id='opportunity-lost'
                required
                rows={2}
                value={form.lostReason}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    lostReason: event.target.value,
                  }))
                }
              />
            </div>
          ) : null}
          <CrmErrorText message={error} />
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('crm.common.cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {t('crm.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
