import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps {
  readonly id?: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

/** Thin wrapper over the shadcn Select so pages declare options once and labels render in the trigger. */
export function SelectField({
  id,
  value,
  options,
  onChange,
  placeholder,
  className,
  disabled,
}: SelectFieldProps): ReactElement {
  const items: Record<string, string> = Object.fromEntries(
    options.map((option) => [option.value, option.label]),
  );
  return (
    <Select
      disabled={disabled}
      id={id}
      items={items}
      onValueChange={(next) => onChange(String(next))}
      value={value}
    >
      <SelectTrigger className={className}>
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
