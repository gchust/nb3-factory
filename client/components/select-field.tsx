import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly id?: string;
  readonly className?: string;
}

/** A single-value select with a translated placeholder and full-width trigger. */
export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  id,
  className,
}: SelectFieldProps): ReactElement {
  const items: Record<string, string> = {};
  for (const option of options) items[option.value] = option.label;

  return (
    <Select
      items={items}
      onValueChange={(next) => onChange(next == null ? '' : String(next))}
      value={value === '' ? null : value}
    >
      <SelectTrigger
        aria-label={ariaLabel ?? placeholder}
        className={cn('w-full', className)}
        id={id}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
