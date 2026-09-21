import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SimpleSelectProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}

/** A thin wrapper around the shared Select primitive so pages keep string values. */
export function SimpleSelect({
  value,
  options,
  onChange,
  placeholder,
  className,
  disabled,
  ariaLabel,
}: SimpleSelectProps): ReactElement {
  const emptyLabel = placeholder ?? '';
  return (
    <Select
      value={value === '' ? null : value}
      onValueChange={(next) => onChange(next === null ? '' : String(next))}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn('w-full', className)}
        aria-label={ariaLabel ?? placeholder}
      >
        <SelectValue placeholder={emptyLabel}>
          {(selected) => {
            if (
              selected === null ||
              selected === undefined ||
              selected === ''
            ) {
              return emptyLabel;
            }
            const match = options.find(
              (option) => option.value === String(selected),
            );
            return match ? match.label : String(selected);
          }}
        </SelectValue>
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
