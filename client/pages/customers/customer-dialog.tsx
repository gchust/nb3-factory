import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import { type ReactElement, type FormEvent, useState } from 'react';

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
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import { createCustomer, updateCustomer } from '../crm/api.js';
import { reportError } from '../crm/errors.js';
import type { Customer } from '../crm/types.js';

export interface CustomerDialogProps {
  readonly open: boolean;
  /** The customer being edited, or `null` to create a new one. */
  readonly customer: Customer | null;
  readonly onOpenChange: (open: boolean) => void;
  /** Called after a successful save, so the list can reload. */
  readonly onSaved: () => void;
}

export function CustomerDialog({
  open,
  customer,
  onOpenChange,
  onSaved,
}: CustomerDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [name, setName] = useState(() => customer?.name ?? '');
  const [industry, setIndustry] = useState(() => customer?.industry ?? '');
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError(true);
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: trimmedName,
        industry: industry.trim() === '' ? null : industry.trim(),
      };
      if (customer) {
        await updateCustomer(api, customer.id, input);
        toast.add({
          type: 'success',
          title: t('crm.customers.updated', {
            defaultValue: 'Customer saved.',
          }),
        });
      } else {
        await createCustomer(api, input);
        toast.add({
          type: 'success',
          title: t('crm.customers.created', {
            defaultValue: 'Customer created.',
          }),
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      reportError(error, t('crm.errors.saveFailed'));
      setSaving(false);
    }
  }

  // The dialog is mounted afresh for each open, so the draft above already
  // reflects the customer being edited; there is no reset effect to run.
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
              {customer
                ? t('crm.customers.editTitle', {
                    defaultValue: 'Edit customer',
                  })
                : t('crm.customers.createTitle', {
                    defaultValue: 'New customer',
                  })}
            </DialogTitle>
            <DialogDescription>
              {t('crm.customers.formDescription', {
                defaultValue: 'A customer has a name and an optional industry.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4 py-4'>
            <Field data-invalid={nameError || undefined}>
              <FieldLabel htmlFor='customer-name'>
                {t('crm.fields.name', { defaultValue: 'Name' })}
              </FieldLabel>
              <Input
                id='customer-name'
                value={name}
                aria-invalid={nameError || undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(false);
                }}
              />
              {nameError ? (
                <FieldError>
                  {t('crm.errors.nameRequired', {
                    defaultValue: 'Name is required.',
                  })}
                </FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor='customer-industry'>
                {t('crm.fields.industry', { defaultValue: 'Industry' })}
              </FieldLabel>
              <Input
                id='customer-industry'
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
              />
            </Field>
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
