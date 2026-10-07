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

import { createContact, updateContact, type ContactChanges } from './api.js';
import { RequestError } from './components.js';
import { CheckboxField, TextField, TextareaField } from './form-fields.js';
import type { ContactView } from './types.js';

interface ContactFormState {
  name: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notes: string;
}

const EMPTY_CONTACT: ContactFormState = {
  name: '',
  position: '',
  phone: '',
  email: '',
  isPrimary: false,
  notes: '',
};

function text(value: string | null | undefined): string {
  return value ?? '';
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fromContact(contact: ContactView): ContactFormState {
  return {
    name: contact.name,
    position: text(contact.position),
    phone: text(contact.phone),
    email: text(contact.email),
    isPrimary: contact.isPrimary,
    notes: text(contact.notes),
  };
}

function toChanges(state: ContactFormState): ContactChanges {
  return {
    name: state.name.trim(),
    position: nullable(state.position),
    phone: nullable(state.phone),
    email: nullable(state.email),
    isPrimary: state.isPrimary,
    notes: nullable(state.notes),
  };
}

export interface ContactFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly customerId: number;
  readonly contact?: ContactView | null;
  readonly onSaved: (contact: ContactView) => void;
}

/** The create and edit form for a contact, in a dialog. */
export function ContactFormDialog({
  open,
  onOpenChange,
  customerId,
  contact,
  onSaved,
}: ContactFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [state, setState] = useState<ContactFormState>(() =>
    contact ? fromContact(contact) : EMPTY_CONTACT,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const patch = (changes: Partial<ContactFormState>): void => {
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
      const saved = contact
        ? await updateContact(api, contact.id, changes)
        : await createContact(api, customerId, changes);
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
            {contact
              ? t('crm.contacts.edit.title')
              : t('crm.contacts.create.title')}
          </DialogTitle>
          <DialogDescription>
            {contact
              ? t('crm.contacts.edit.description')
              : t('crm.contacts.create.description')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='grid gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextField
            error={nameError}
            id='contact-name'
            label={t('crm.contacts.field.name')}
            onChange={(name) => patch({ name })}
            required
            value={state.name}
          />
          <TextField
            id='contact-position'
            label={t('crm.contacts.field.position')}
            onChange={(position) => patch({ position })}
            value={state.position}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <TextField
              id='contact-phone'
              label={t('crm.contacts.field.phone')}
              onChange={(phone) => patch({ phone })}
              type='tel'
              value={state.phone}
            />
            <TextField
              id='contact-email'
              label={t('crm.contacts.field.email')}
              onChange={(email) => patch({ email })}
              type='email'
              value={state.email}
            />
          </div>
          <CheckboxField
            checked={state.isPrimary}
            id='contact-primary'
            label={t('crm.contacts.field.isPrimary')}
            onChange={(isPrimary) => patch({ isPrimary })}
          />
          <TextareaField
            id='contact-notes'
            label={t('crm.contacts.field.notes')}
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
            {contact ? t('actions.save') : t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
