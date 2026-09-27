import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

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
  readonly value: number | null | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly describedBy?: string;
}

/** A customer picker shared by the contact and opportunity forms. */
export function CustomerSelect({
  id,
  value,
  onChange,
  invalid,
  disabled,
  describedBy,
}: CustomerSelectProps): ReactElement {
  const { t } = useTranslation();
  const { customers, error, loading } = useCustomers();
  const items = (customers ?? []).map((customer) => ({
    value: String(customer.id),
    label: customer.name,
  }));

  return (
    <>
      <Select
        items={items}
        value={value === undefined || value === null ? null : String(value)}
        onValueChange={(next: string | null) =>
          onChange(next === null ? undefined : Number(next))
        }
        disabled={disabled ?? loading}
      >
        <SelectTrigger
          id={id}
          className='w-full'
          aria-invalid={invalid}
          aria-describedby={describedBy}
        >
          <SelectValue placeholder={t('sales.customerSelect.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={describedBy} className='text-sm text-muted-foreground'>
          {t('sales.customerSelect.loadFailed')}
        </p>
      ) : customers !== undefined && customers.length === 0 ? (
        <p id={describedBy} className='text-sm text-muted-foreground'>
          {t('sales.customerSelect.noneYet')}
        </p>
      ) : null}
    </>
  );
}
