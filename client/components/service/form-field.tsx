import type { ReactElement, ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * One labelled field of a form.
 *
 * The control is a child rather than a prop so a page keeps the accessibility
 * wiring explicit — `htmlFor` here, `id` on the control — instead of having the
 * wrapper guess which element it is wrapping.
 */
export interface FormFieldProps {
  readonly label: ReactNode;
  readonly htmlFor: string;
  readonly hint?: ReactNode;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function FormField({
  children,
  className,
  hint,
  htmlFor,
  label,
  required = false,
}: FormFieldProps): ReactElement {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

export interface SelectOption {
  readonly value: string;
  /** `option` accepts text only, so a label is a string here and is translated by the caller. */
  readonly label: string;
}

/**
 * A single-choice control.
 *
 * It is the platform's own `select`, styled with the same tokens as `Input`.
 * The application does not install a listbox component for the small, closed
 * sets a business form filters by, and the native element keeps keyboard and
 * mobile behavior right for free.
 */
export interface SelectControlProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  /** Shown for the empty value when the field is optional. */
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly name?: string;
}

export function SelectControl({
  className,
  disabled = false,
  id,
  name,
  onChange,
  options,
  placeholder,
  value,
}: SelectControlProps): ReactElement {
  return (
    <select
      className={cn(
        'border-input bg-background h-8 w-full rounded-md border px-2 text-sm shadow-xs',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      disabled={disabled}
      id={id}
      name={name}
      onChange={(event) => {
        onChange(event.target.value);
      }}
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
  );
}
