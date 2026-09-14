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
  readonly id?: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly className?: string;
  readonly disabled?: boolean;
}

/** A full-width application select built on the shared shadcn primitive. */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  className,
  disabled,
}: SelectFieldProps): ReactElement {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next: unknown) => {
        if (typeof next === 'string') onValueChange(next);
      }}
      value={value}
    >
      <SelectTrigger className={className ?? 'w-full'} id={id}>
        <SelectValue />
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
