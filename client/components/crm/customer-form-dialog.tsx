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
import { Textarea } from '@/components/ui/textarea';

import {
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  COMPANY_SIZES,
  useCrmApi,
  type Customer,
} from './api';
import { CrmErrorText, useCrmError } from './feedback';
import { FieldRow, SelectField, type SelectOption } from './fields';

interface FormState {
  name: string;
  industry: string;
  companySize: string;
  source: string;
  status: string;
  notes: string;
}

function initial(customer?: Customer): FormState {
  return {
    name: customer?.name ?? '',
    industry: customer?.industry ?? '',
    companySize: customer?.companySize ?? '',
    source: customer?.source ?? '',
    status: customer?.status ?? 'potential',
    notes: customer?.notes ?? '',
  };
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [form, setForm] = useState<FormState>(() => initial(customer));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const statusOptions: SelectOption[] = CUSTOMER_STATUSES.map((value) => ({
    value,
    label: t(`crm.status.${value}`),
  }));
  const sourceOptions: SelectOption[] = [
    { value: '', label: t('crm.common.none') },
    ...CUSTOMER_SOURCES.map((value) => ({
      value,
      label: t(`crm.source.${value}`),
    })),
  ];
  const sizeOptions: SelectOption[] = [
    { value: '', label: t('crm.common.none') },
    ...COMPANY_SIZES.map((value) => ({
      value,
      label: t(`crm.companySize.${value}`),
    })),
  ];

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        name: form.name,
        industry: form.industry || null,
        companySize: form.companySize || null,
        source: form.source || null,
        status: form.status,
        notes: form.notes || null,
      };
      if (customer) {
        await api.updateCustomer(customer.id, payload);
      } else {
        await api.createCustomer(payload);
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
            {customer
              ? t('crm.customers.editTitle')
              : t('crm.customers.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='customer-name'>{t('crm.customers.name')}</Label>
            <Input
              id='customer-name'
              required
              value={form.name}
              onChange={(event) =>
                setForm((state) => ({ ...state, name: event.target.value }))
              }
            />
          </div>
          <FieldRow>
            <div className='space-y-2'>
              <Label htmlFor='customer-industry'>
                {t('crm.customers.industry')}
              </Label>
              <Input
                id='customer-industry'
                value={form.industry}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    industry: event.target.value,
                  }))
                }
              />
            </div>
            <SelectField
              id='customer-size'
              label={t('crm.customers.companySize')}
              value={form.companySize}
              onChange={(value) =>
                setForm((state) => ({ ...state, companySize: value }))
              }
              options={sizeOptions}
            />
          </FieldRow>
          <FieldRow>
            <SelectField
              id='customer-source'
              label={t('crm.customers.source')}
              value={form.source}
              onChange={(value) =>
                setForm((state) => ({ ...state, source: value }))
              }
              options={sourceOptions}
            />
            <SelectField
              id='customer-status'
              label={t('crm.customers.status')}
              value={form.status}
              onChange={(value) =>
                setForm((state) => ({ ...state, status: value }))
              }
              options={statusOptions}
              required
            />
          </FieldRow>
          <div className='space-y-2'>
            <Label htmlFor='customer-notes'>{t('crm.customers.notes')}</Label>
            <Textarea
              id='customer-notes'
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((state) => ({ ...state, notes: event.target.value }))
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
