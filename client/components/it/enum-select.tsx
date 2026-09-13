import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

/** A shadcn Select wired for string enum values with a label map. */
export function EnumSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  disabled,
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly EnumOption[];
  readonly placeholder?: string;
  readonly id?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <Select
      items={[...options]}
      value={value || null}
      onValueChange={(next) => onValueChange(String(next ?? ''))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
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
