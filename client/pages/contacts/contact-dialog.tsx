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
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import { createContact, updateContact } from '../crm/api.js';
import { CustomerSelect } from '../crm/customer-select.js';
import { reportError } from '../crm/errors.js';
import type { Contact, Customer } from '../crm/types.js';

export interface ContactDialogProps {
  readonly open: boolean;
  readonly contact: Contact | null;
  readonly customers: readonly Customer[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}

export function ContactDialog({
  open,
  contact,
  customers,
  onOpenChange,
  onSaved,
}: ContactDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [name, setName] = useState(() => contact?.name ?? '');
  const [phone, setPhone] = useState(() => contact?.phone ?? '');
  const [email, setEmail] = useState(() => contact?.email ?? '');
  const [customerId, setCustomerId] = useState<number | null>(
    () => contact?.customerId ?? null,
  );
  const [errors, setErrors] = useState<{ name?: boolean; customer?: boolean }>(
    {},
  );
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    const nextErrors = {
      name: name.trim().length === 0,
      customer: customerId === null,
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.customer || customerId === null) return;

    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        email: email.trim() === '' ? null : email.trim(),
        customerId,
      };
      if (contact) {
        await updateContact(api, contact.id, input);
      } else {
        await createContact(api, input);
      }
      toast.add({
        type: 'success',
        title: t('crm.contacts.saved', { defaultValue: 'Contact saved.' }),
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
              {contact
                ? t('crm.contacts.editTitle', { defaultValue: 'Edit contact' })
                : t('crm.contacts.createTitle', {
                    defaultValue: 'New contact',
                  })}
            </DialogTitle>
            <DialogDescription>
              {t('crm.contacts.formDescription', {
                defaultValue: 'A contact belongs to exactly one customer.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4 py-4'>
            <Field data-invalid={errors.customer || undefined}>
              <FieldLabel htmlFor='contact-customer'>
                {t('crm.fields.customer', { defaultValue: 'Customer' })}
              </FieldLabel>
              <CustomerSelect
                id='contact-customer'
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
            <Field data-invalid={errors.name || undefined}>
              <FieldLabel htmlFor='contact-name'>
                {t('crm.fields.name', { defaultValue: 'Name' })}
              </FieldLabel>
              <Input
                id='contact-name'
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
            <Field>
              <FieldLabel htmlFor='contact-phone'>
                {t('crm.fields.phone', { defaultValue: 'Phone' })}
              </FieldLabel>
              <Input
                id='contact-phone'
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='contact-email'>
                {t('crm.fields.email', { defaultValue: 'Email' })}
              </FieldLabel>
              <Input
                id='contact-email'
                type='email'
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
