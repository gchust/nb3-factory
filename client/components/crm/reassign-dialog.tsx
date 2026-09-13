import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
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

import { useCrmApi, type Customer, type OwnerOption } from './api';
import { CrmErrorText, useCrmError } from './feedback';
import { SelectField, type SelectOption } from './fields';

export function ReassignDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useCrmApi();
  const errorFor = useCrmError();
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [ownerId, setOwnerId] = useState(customer.ownerId);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void api
      .owners()
      .then((rows) => {
        if (!active) return;
        setOwners(rows);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorFor(cause));
      });
    return () => {
      active = false;
    };
  }, [open, api, errorFor]);

  const options: SelectOption[] = owners.map((owner) => ({
    value: owner.id,
    label: owner.name,
  }));

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await api.assignCustomer(customer.id, ownerId);
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
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('crm.customers.reassignTitle')}</DialogTitle>
          <DialogDescription>
            {t('crm.customers.reassignHint')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <SelectField
            id='reassign-owner'
            label={t('crm.customers.newOwner')}
            value={ownerId}
            onChange={setOwnerId}
            options={options}
          />
          <CrmErrorText message={error} />
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('crm.common.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={saving || ownerId === customer.ownerId}
            >
              {t('crm.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
