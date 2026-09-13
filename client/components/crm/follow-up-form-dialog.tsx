import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  FOLLOW_UP_METHODS,
  useCrmApi,
  type Customer,
  type Opportunity,
} from './api';
import { CrmErrorText, useCrmError } from './feedback';
import { FieldRow, SelectField, type SelectOption } from './fields';

interface FormState {
  targetType: 'customer' | 'opportunity';
  customerId: string;
  opportunityId: string;
  method: string;
  followedAt: string;
  summary: string;
  nextStep: string;
}

function localDateTime(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function initial(customerId?: number): FormState {
  return {
    targetType: 'customer',
    customerId: customerId === undefined ? '' : String(customerId),
    opportunityId: '',
    method: 'phone',
    followedAt: localDateTime(new Date()),
    summary: '',
    nextStep: '',
  };
}

export function FollowUpFormDialog({
  open,
  onOpenChange,
  customerId,
  customers,
  opportunities,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: number;
  customers?: readonly Customer[];
  opportunities?: readonly Opportunity[];
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [form, setForm] = useState<FormState>(() => initial(customerId));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const methodOptions: SelectOption[] = FOLLOW_UP_METHODS.map((value) => ({
    value,
    label: t(`crm.method.${value}`),
  }));
  const customerOptions: SelectOption[] = (customers ?? []).map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));
  const opportunityOptions: SelectOption[] = (opportunities ?? []).map(
    (opportunity) => ({
      value: String(opportunity.id),
      label: opportunity.name,
    }),
  );

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        method: form.method,
        summary: form.summary,
        nextStep: form.nextStep || null,
        followedAt: form.followedAt
          ? new Date(form.followedAt).toISOString()
          : null,
        customerId:
          customerId ??
          (form.targetType === 'customer' ? Number(form.customerId) : null),
        opportunityId:
          form.targetType === 'opportunity' ? Number(form.opportunityId) : null,
      };
      await api.createFollowUp(payload);
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
          <DialogTitle>{t('crm.followUps.createTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          {customerId === undefined ? (
            <FieldRow>
              <SelectField
                id='follow-up-target-type'
                label={t('crm.followUps.target')}
                value={form.targetType}
                onChange={(value) =>
                  setForm((state) => ({
                    ...state,
                    targetType:
                      value === 'opportunity' ? 'opportunity' : 'customer',
                  }))
                }
                options={[
                  { value: 'customer', label: t('crm.followUps.customer') },
                  {
                    value: 'opportunity',
                    label: t('crm.followUps.opportunity'),
                  },
                ]}
              />
              {form.targetType === 'customer' ? (
                <SelectField
                  id='follow-up-customer'
                  label={t('crm.followUps.customer')}
                  value={form.customerId}
                  onChange={(value) =>
                    setForm((state) => ({ ...state, customerId: value }))
                  }
                  options={customerOptions}
                  placeholder={t('crm.followUps.selectCustomer')}
                  required
                />
              ) : (
                <SelectField
                  id='follow-up-opportunity'
                  label={t('crm.followUps.opportunity')}
                  value={form.opportunityId}
                  onChange={(value) =>
                    setForm((state) => ({ ...state, opportunityId: value }))
                  }
                  options={opportunityOptions}
                  placeholder={t('crm.followUps.selectOpportunity')}
                  required
                />
              )}
            </FieldRow>
          ) : null}
          <FieldRow>
            <SelectField
              id='follow-up-method'
              label={t('crm.followUps.method')}
              value={form.method}
              onChange={(value) =>
                setForm((state) => ({ ...state, method: value }))
              }
              options={methodOptions}
              required
            />
            <div className='space-y-2'>
              <Label htmlFor='follow-up-time'>
                {t('crm.followUps.followedAt')}
              </Label>
              <input
                id='follow-up-time'
                type='datetime-local'
                className='flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
                value={form.followedAt}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    followedAt: event.target.value,
                  }))
                }
              />
            </div>
          </FieldRow>
          <div className='space-y-2'>
            <Label htmlFor='follow-up-summary'>
              {t('crm.followUps.summary')}
            </Label>
            <Textarea
              id='follow-up-summary'
              required
              rows={3}
              value={form.summary}
              onChange={(event) =>
                setForm((state) => ({ ...state, summary: event.target.value }))
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='follow-up-next'>
              {t('crm.followUps.nextStep')}
            </Label>
            <Textarea
              id='follow-up-next'
              rows={2}
              value={form.nextStep}
              onChange={(event) =>
                setForm((state) => ({ ...state, nextStep: event.target.value }))
              }
            />
          </div>
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
