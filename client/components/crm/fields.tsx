import type { ReactElement, ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A labelled form row.
 *
 * Native `<select>` is used on purpose: it keeps form filling and validation
 * working for assistive technology and keyboard users without a custom
 * listbox, which matters for data-entry screens like these forms.
 */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className='flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      >
        {placeholder !== undefined ? (
          <option value=''>{placeholder}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FieldRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
  );
}
