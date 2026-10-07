/**
 * A small controlled wrapper over the Base UI `Select` primitives.
 *
 * Pages pass plain string options; the wrapper turns them into both the `items`
 * the trigger needs to render a label and the `SelectItem` children the popup
 * renders, so a filter and a form field look and behave the same.
 */

import type { ReactElement } from 'react';

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

export interface SelectFieldProps {
  readonly value: string | null | undefined;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly className?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly size?: 'sm' | 'default';
}

export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  id,
  disabled,
  size = 'default',
}: SelectFieldProps): ReactElement {
  return (
    <Select
      value={value ?? null}
      items={options.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={className}>
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
