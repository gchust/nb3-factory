import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

import {
  createOpportunity,
  updateOpportunity,
  type OpportunityChanges,
} from './api.js';
import { RequestError } from './components.js';
import { EnumSelect, TextField, TextareaField } from './form-fields.js';
import { STAGE_LABEL_KEYS, toDateInputValue } from './format.js';
import { useCustomerOptions } from './hooks.js';
import { OPPORTUNITY_STAGES, type OpportunityView } from './types.js';

interface OpportunityFormState {
  customerId: string;
  name: string;
  stage: string;
  amount: string;
  expectedCloseDate: string;
  lostReason: string;
  notes: string;
}

const EMPTY_OPPORTUNITY: OpportunityFormState = {
  customerId: '',
  name: '',
  stage: 'initial_contact',
  amount: '',
  expectedCloseDate: '',
  lostReason: '',
  notes: '',
};

function text(value: string | null | undefined): string {
  return value ?? '';
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fromOpportunity(opportunity: OpportunityView): OpportunityFormState {
  return {
    customerId: String(opportunity.customerId),
    name: opportunity.name,
    stage: opportunity.stage,
    amount: String(opportunity.amount ?? ''),
    expectedCloseDate: toDateInputValue(opportunity.expectedCloseDate),
    lostReason: text(opportunity.lostReason),
    notes: text(opportunity.notes),
  };
}

export interface OpportunityFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Fixed customer for a create started from the customer's page. */
  readonly customerId?: number;
  readonly opportunity?: OpportunityView | null;
  readonly onSaved: (opportunity: OpportunityView) => void;
}

/** The create and edit form for an opportunity, in a dialog. */
export function OpportunityFormDialog({
  open,
  onOpenChange,
  customerId,
  opportunity,
  onSaved,
}: OpportunityFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const showCustomerPicker = customerId == null && !opportunity;
  const customerOptions = useCustomerOptions(
    open && showCustomerPicker,
    opportunity?.customerId ?? customerId,
  );
  const [state, setState] = useState<OpportunityFormState>(() =>
    opportunity
      ? fromOpportunity(opportunity)
      : {
          ...EMPTY_OPPORTUNITY,
          customerId: customerId ? String(customerId) : '',
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const patch = (changes: Partial<OpportunityFormState>): void => {
    setState((current) => ({ ...current, ...changes }));
  };

  const submit = async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!state.name.trim()) errors.name = t('crm.validation.nameRequired');
    const targetCustomerId = opportunity?.customerId ?? customerId;
    if (targetCustomerId == null && !state.customerId) {
      errors.customerId = t('crm.validation.customerRequired');
    }
    if (state.amount.trim() && !Number.isFinite(Number(state.amount))) {
      errors.amount = t('crm.validation.amountInvalid');
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError(undefined);
    try {
      const changes: OpportunityChanges = {
        name: state.name.trim(),
        stage: state.stage,
        amount: state.amount.trim() ? Number(state.amount) : 0,
        expectedCloseDate: nullable(state.expectedCloseDate),
        lostReason: nullable(state.lostReason),
        notes: nullable(state.notes),
      };
      const saved = opportunity
        ? await updateOpportunity(api, opportunity.id, changes)
        : await createOpportunity(
            api,
            targetCustomerId ?? Number(state.customerId),
            changes,
          );
      onSaved(saved);
      onOpenChange(false);
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {opportunity
              ? t('crm.opportunities.edit.title')
              : t('crm.opportunities.create.title')}
          </DialogTitle>
          <DialogDescription>
            {opportunity
              ? t('crm.opportunities.edit.description')
              : t('crm.opportunities.create.description')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='grid max-h-[60vh] gap-4 overflow-y-auto pr-1'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {showCustomerPicker ? (
            <EnumSelect
              error={fieldErrors.customerId}
              id='opportunity-customer'
              items={[
                {
                  value: null,
                  label: t('crm.opportunities.field.customerPlaceholder'),
                },
                ...customerOptions.options,
              ]}
              label={t('crm.opportunities.field.customer')}
              onChange={(value) => patch({ customerId: value ?? '' })}
              value={state.customerId || null}
            />
          ) : null}
          <TextField
            error={fieldErrors.name}
            id='opportunity-name'
            label={t('crm.opportunities.field.name')}
            onChange={(name) => patch({ name })}
            required
            value={state.name}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <EnumSelect
              id='opportunity-stage'
              items={OPPORTUNITY_STAGES.map((stage) => ({
                value: stage,
                label: t(STAGE_LABEL_KEYS[stage]),
              }))}
              label={t('crm.opportunities.field.stage')}
              onChange={(stage) => patch({ stage: stage ?? 'initial_contact' })}
              value={state.stage}
            />
            <TextField
              error={fieldErrors.amount}
              id='opportunity-amount'
              label={t('crm.opportunities.field.amount')}
              onChange={(amount) => patch({ amount })}
              type='number'
              value={state.amount}
            />
          </div>
          <TextField
            id='opportunity-close-date'
            label={t('crm.opportunities.field.expectedCloseDate')}
            onChange={(expectedCloseDate) => patch({ expectedCloseDate })}
            type='date'
            value={state.expectedCloseDate}
          />
          {state.stage === 'lost' ? (
            <TextField
              id='opportunity-lost-reason'
              label={t('crm.opportunities.field.lostReason')}
              onChange={(lostReason) => patch({ lostReason })}
              value={state.lostReason}
            />
          ) : null}
          <TextareaField
            id='opportunity-notes'
            label={t('crm.opportunities.field.notes')}
            onChange={(notes) => patch({ notes })}
            value={state.notes}
          />
          {error ? <RequestError error={error} /> : null}
        </form>
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type='button'
            variant='outline'
          >
            {t('actions.cancel')}
          </Button>
          <Button disabled={saving} onClick={() => void submit()} type='button'>
            {saving ? <Spinner data-icon='inline-start' /> : null}
            {opportunity ? t('actions.save') : t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
