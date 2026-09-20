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
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly className?: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/** Thin wrapper so pages declare their options once and keep labels visible. */
export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  label,
  disabled,
}: SelectFieldProps): ReactElement {
  const items: Record<string, string> = {};
  for (const option of options) items[option.value] = option.label;
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled ?? false}
      onValueChange={(next) => onValueChange(next === null ? '' : String(next))}
    >
      <SelectTrigger className={cn('min-w-40', className)} aria-label={label}>
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
