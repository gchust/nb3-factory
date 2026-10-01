import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useRemoteList } from './use-remote.js';
import type { Customer } from './types.js';

export interface CustomerSelectProps {
  readonly id: string;
  readonly value: number | undefined;
  readonly onChange: (customerId: number | undefined) => void;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
}

/**
 * A select over the customer list, shared by the contact and opportunity forms.
 * It loads the list itself so the form does not have to.
 */
export function CustomerSelect({
  id,
  value,
  onChange,
  invalid = false,
  disabled = false,
}: CustomerSelectProps): ReactElement {
  const { t } = useTranslation();
  const {
    data: customers,
    loading,
    error,
  } = useRemoteList<Customer>('customers');

  const items = customers.map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));

  const placeholder = loading
    ? t('sales.form.loadingCustomers')
    : error
      ? t('sales.error.customersFailed')
      : t('sales.form.selectCustomer');

  return (
    <Select
      items={items}
      value={value === undefined ? null : String(value)}
      onValueChange={(next) => {
        onChange(next === null || next === '' ? undefined : Number(next));
      }}
      disabled={disabled || loading || error}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className='w-full'>
        <SelectValue placeholder={placeholder} />
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
