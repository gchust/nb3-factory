import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Customer } from './types.js';

export interface CustomerSelectProps {
  readonly id?: string;
  readonly customers: readonly Customer[];
  readonly value: number | null;
  readonly onValueChange: (value: number) => void;
}

/** The owning-customer picker shared by the contact and opportunity forms. */
export function CustomerSelect({
  id,
  customers,
  value,
  onValueChange,
}: CustomerSelectProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Select
      value={value === null ? undefined : String(value)}
      onValueChange={(next) => {
        const selected = Number(next);
        if (Number.isInteger(selected)) {
          onValueChange(selected);
        }
      }}
    >
      <SelectTrigger id={id} className='w-full'>
        <SelectValue
          placeholder={t('crm.fields.selectCustomer', {
            defaultValue: 'Select a customer',
          })}
        />
      </SelectTrigger>
      <SelectContent>
        {customers.map((customer) => (
          <SelectItem key={customer.id} value={String(customer.id)}>
            {customer.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
