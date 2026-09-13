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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useCrmApi, type Contact } from './api';
import { CrmErrorText, useCrmError } from './feedback';
import { FieldRow } from './fields';

interface FormState {
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

function initial(contact?: Contact): FormState {
  return {
    name: contact?.name ?? '',
    title: contact?.title ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    isPrimary: Boolean(contact?.isPrimary),
  };
}

export function ContactFormDialog({
  open,
  onOpenChange,
  customerId,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: number;
  contact?: Contact;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [form, setForm] = useState<FormState>(() => initial(contact));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        name: form.name,
        title: form.title || null,
        phone: form.phone || null,
        email: form.email || null,
        isPrimary: form.isPrimary,
      };
      if (contact) {
        await api.updateContact(contact.id, payload);
      } else {
        await api.createContact(customerId, payload);
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
            {contact ? t('crm.contacts.edit') : t('crm.contacts.add')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='contact-name'>{t('crm.contacts.name')}</Label>
            <Input
              id='contact-name'
              required
              value={form.name}
              onChange={(event) =>
                setForm((state) => ({ ...state, name: event.target.value }))
              }
            />
          </div>
          <FieldRow>
            <div className='space-y-2'>
              <Label htmlFor='contact-title'>{t('crm.contacts.title')}</Label>
              <Input
                id='contact-title'
                value={form.title}
                onChange={(event) =>
                  setForm((state) => ({ ...state, title: event.target.value }))
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='contact-phone'>{t('crm.contacts.phone')}</Label>
              <Input
                id='contact-phone'
                value={form.phone}
                onChange={(event) =>
                  setForm((state) => ({ ...state, phone: event.target.value }))
                }
              />
            </div>
          </FieldRow>
          <div className='space-y-2'>
            <Label htmlFor='contact-email'>{t('crm.contacts.email')}</Label>
            <Input
              id='contact-email'
              type='email'
              value={form.email}
              onChange={(event) =>
                setForm((state) => ({ ...state, email: event.target.value }))
              }
            />
          </div>
          <label
            className='flex items-center gap-2 text-sm'
            htmlFor='contact-primary'
          >
            <input
              id='contact-primary'
              type='checkbox'
              className='size-4 rounded border-input accent-primary'
              checked={form.isPrimary}
              onChange={(event) =>
                setForm((state) => ({
                  ...state,
                  isPrimary: event.target.checked,
                }))
              }
            />
            {t('crm.contacts.isPrimary')}
          </label>
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
