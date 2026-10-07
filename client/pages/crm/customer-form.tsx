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

import { createCustomer, updateCustomer, type CustomerChanges } from './api.js';
import { RequestError } from './components.js';
import { EnumSelect, TextField, TextareaField } from './form-fields.js';
import { LEVEL_LABEL_KEYS } from './format.js';
import { CUSTOMER_LEVELS, type CustomerView } from './types.js';

interface CustomerFormState {
  name: string;
  level: string;
  industry: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  source: string;
  notes: string;
}

const EMPTY_CUSTOMER: CustomerFormState = {
  name: '',
  level: 'C',
  industry: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  source: '',
  notes: '',
};

function text(value: string | null | undefined): string {
  return value ?? '';
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fromCustomer(customer: CustomerView): CustomerFormState {
  return {
    name: customer.name,
    level: customer.level,
    industry: text(customer.industry),
    phone: text(customer.phone),
    email: text(customer.email),
    website: text(customer.website),
    address: text(customer.address),
    source: text(customer.source),
    notes: text(customer.notes),
  };
}

function toChanges(state: CustomerFormState): CustomerChanges {
  return {
    name: state.name.trim(),
    level: state.level,
    industry: nullable(state.industry),
    phone: nullable(state.phone),
    email: nullable(state.email),
    website: nullable(state.website),
    address: nullable(state.address),
    source: nullable(state.source),
    notes: nullable(state.notes),
  };
}

export interface CustomerFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The customer being edited; omitted for create. */
  readonly customer?: CustomerView | null;
  readonly onSaved: (customer: CustomerView) => void;
}

/** The create and edit form for a customer, in a dialog. */
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: CustomerFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [state, setState] = useState<CustomerFormState>(() =>
    customer ? fromCustomer(customer) : EMPTY_CUSTOMER,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const patch = (changes: Partial<CustomerFormState>): void => {
    setState((current) => ({ ...current, ...changes }));
  };

  const submit = async (): Promise<void> => {
    if (!state.name.trim()) {
      setNameError(t('crm.validation.nameRequired'));
      return;
    }
    setNameError(undefined);
    setSaving(true);
    setError(undefined);
    try {
      const changes = toChanges(state);
      const saved = customer
        ? await updateCustomer(api, customer.id, changes)
        : await createCustomer(api, changes);
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
            {customer
              ? t('crm.customers.edit.title')
              : t('crm.customers.create.title')}
          </DialogTitle>
          <DialogDescription>
            {customer
              ? t('crm.customers.edit.description')
              : t('crm.customers.create.description')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='grid max-h-[60vh] gap-4 overflow-y-auto pr-1'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextField
            error={nameError}
            id='customer-name'
            label={t('crm.customers.field.name')}
            onChange={(name) => patch({ name })}
            required
            value={state.name}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <EnumSelect
              id='customer-level'
              items={CUSTOMER_LEVELS.map((level) => ({
                value: level,
                label: t(LEVEL_LABEL_KEYS[level]),
              }))}
              label={t('crm.customers.field.level')}
              onChange={(level) => patch({ level: level ?? 'C' })}
              value={state.level}
            />
            <TextField
              id='customer-industry'
              label={t('crm.customers.field.industry')}
              onChange={(industry) => patch({ industry })}
              value={state.industry}
            />
            <TextField
              id='customer-phone'
              label={t('crm.customers.field.phone')}
              onChange={(phone) => patch({ phone })}
              type='tel'
              value={state.phone}
            />
            <TextField
              id='customer-email'
              label={t('crm.customers.field.email')}
              onChange={(email) => patch({ email })}
              type='email'
              value={state.email}
            />
            <TextField
              id='customer-website'
              label={t('crm.customers.field.website')}
              onChange={(website) => patch({ website })}
              value={state.website}
            />
            <TextField
              id='customer-source'
              label={t('crm.customers.field.source')}
              onChange={(source) => patch({ source })}
              value={state.source}
            />
          </div>
          <TextField
            id='customer-address'
            label={t('crm.customers.field.address')}
            onChange={(address) => patch({ address })}
            value={state.address}
          />
          <TextareaField
            id='customer-notes'
            label={t('crm.customers.field.notes')}
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
            {customer ? t('actions.save') : t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
