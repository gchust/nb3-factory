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

import { createFollowUp, updateFollowUp, type FollowUpChanges } from './api.js';
import { RequestError } from './components.js';
import { EnumSelect, TextField, TextareaField } from './form-fields.js';
import {
  FOLLOW_UP_STATUS_LABEL_KEYS,
  METHOD_LABEL_KEYS,
  toDateTimeInputValue,
} from './format.js';
import { useCustomerOptions, useOpportunityOptions } from './hooks.js';
import {
  FOLLOW_UP_METHODS,
  FOLLOW_UP_STATUSES,
  type FollowUpView,
} from './types.js';

interface FollowUpFormState {
  customerId: string;
  opportunityId: string;
  method: string;
  content: string;
  status: string;
  dueAt: string;
}

const EMPTY_FOLLOW_UP: FollowUpFormState = {
  customerId: '',
  opportunityId: '',
  method: 'call',
  content: '',
  status: 'pending',
  dueAt: '',
};

function text(value: string | null | undefined): string {
  return value ?? '';
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fromFollowUp(followUp: FollowUpView): FollowUpFormState {
  return {
    customerId: String(followUp.customerId),
    opportunityId: followUp.opportunityId ? String(followUp.opportunityId) : '',
    method: followUp.method,
    content: text(followUp.content),
    status: followUp.status,
    dueAt: toDateTimeInputValue(followUp.dueAt),
  };
}

export interface FollowUpFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Fixed customer for a create started from the customer's page. */
  readonly customerId?: number;
  readonly followUp?: FollowUpView | null;
  readonly onSaved: (followUp: FollowUpView) => void;
}

/** The create and edit form for a follow-up, in a dialog. */
export function FollowUpFormDialog({
  open,
  onOpenChange,
  customerId,
  followUp,
  onSaved,
}: FollowUpFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const showCustomerPicker = customerId == null && !followUp;
  const customerOptions = useCustomerOptions(
    open && showCustomerPicker,
    followUp?.customerId ?? customerId,
  );
  const [state, setState] = useState<FollowUpFormState>(() =>
    followUp
      ? fromFollowUp(followUp)
      : {
          ...EMPTY_FOLLOW_UP,
          customerId: customerId ? String(customerId) : '',
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const effectiveCustomerId = followUp?.customerId
    ? followUp.customerId
    : (customerId ?? (state.customerId ? Number(state.customerId) : undefined));
  const opportunityOptions = useOpportunityOptions(
    effectiveCustomerId,
    open && effectiveCustomerId != null,
  );

  const patch = (changes: Partial<FollowUpFormState>): void => {
    setState((current) => ({ ...current, ...changes }));
  };

  const submit = async (): Promise<void> => {
    const targetCustomerId = followUp?.customerId ?? customerId;
    if (targetCustomerId == null && !state.customerId) {
      setFieldErrors({ customerId: t('crm.validation.customerRequired') });
      return;
    }
    if (!state.dueAt) {
      setFieldErrors({ dueAt: t('crm.validation.dueAtRequired') });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setError(undefined);
    try {
      const changes: FollowUpChanges = {
        opportunityId: state.opportunityId ? Number(state.opportunityId) : null,
        method: state.method,
        content: nullable(state.content),
        status: state.status,
        dueAt: new Date(state.dueAt).toISOString(),
      };
      const saved = followUp
        ? await updateFollowUp(api, followUp.id, changes)
        : await createFollowUp(
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
            {followUp
              ? t('crm.followUps.edit.title')
              : t('crm.followUps.create.title')}
          </DialogTitle>
          <DialogDescription>
            {followUp
              ? t('crm.followUps.edit.description')
              : t('crm.followUps.create.description')}
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
              id='follow-up-customer'
              items={[
                {
                  value: null,
                  label: t('crm.followUps.field.customerPlaceholder'),
                },
                ...customerOptions.options,
              ]}
              label={t('crm.followUps.field.customer')}
              onChange={(value) =>
                patch({ customerId: value ?? '', opportunityId: '' })
              }
              value={state.customerId || null}
            />
          ) : null}
          <EnumSelect
            id='follow-up-opportunity'
            items={[
              { value: null, label: t('crm.followUps.field.opportunityNone') },
              ...opportunityOptions.options,
            ]}
            label={t('crm.followUps.field.opportunity')}
            onChange={(value) => patch({ opportunityId: value ?? '' })}
            value={state.opportunityId || null}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <EnumSelect
              id='follow-up-method'
              items={FOLLOW_UP_METHODS.map((method) => ({
                value: method,
                label: t(METHOD_LABEL_KEYS[method]),
              }))}
              label={t('crm.followUps.field.method')}
              onChange={(method) => patch({ method: method ?? 'call' })}
              value={state.method}
            />
            <EnumSelect
              id='follow-up-status'
              items={FOLLOW_UP_STATUSES.map((status) => ({
                value: status,
                label: t(FOLLOW_UP_STATUS_LABEL_KEYS[status]),
              }))}
              label={t('crm.followUps.field.status')}
              onChange={(status) => patch({ status: status ?? 'pending' })}
              value={state.status}
            />
          </div>
          <TextField
            error={fieldErrors.dueAt}
            id='follow-up-due-at'
            label={t('crm.followUps.field.dueAt')}
            onChange={(dueAt) => patch({ dueAt })}
            required
            type='datetime-local'
            value={state.dueAt}
          />
          <TextareaField
            id='follow-up-content'
            label={t('crm.followUps.field.content')}
            onChange={(content) => patch({ content })}
            value={state.content}
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
            {followUp ? t('actions.save') : t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
