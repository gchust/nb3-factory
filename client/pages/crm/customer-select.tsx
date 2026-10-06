import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, Ref } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useCustomers } from './use-customers.js';

export interface CustomerSelectProps {
  readonly id: string;
  readonly value: number | null;
  readonly onChange: (value: number) => void;
  readonly onBlur?: () => void;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A customer picker backed by the small, single-team customer list. */
export function CustomerSelect({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  ref,
}: CustomerSelectProps): ReactElement {
  const { t } = useTranslation();
  const { customers, loading, error } = useCustomers();
  const items = customers.map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));
  const blocked = disabled || loading || error !== undefined;

  return (
    <Select
      items={items}
      value={value === null ? null : String(value)}
      // Base UI can pass null; a null change means the selection was cleared.
      onValueChange={(next) => {
        if (next !== null) onChange(Number(next));
      }}
      disabled={blocked}
    >
      <SelectTrigger
        ref={ref}
        id={id}
        className='w-full'
        aria-invalid={invalid}
        onBlur={onBlur}
        disabled={blocked}
      >
        <SelectValue
          placeholder={t('crm.contact.fields.customerPlaceholder')}
        />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
