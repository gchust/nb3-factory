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
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly id?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  disabled,
}: SelectFieldProps): ReactElement {
  return (
    <Select
      items={[...options]}
      value={value === null ? null : value}
      onValueChange={(next: string | null) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn('w-full', className)}>
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
